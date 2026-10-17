import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from "@google/genai";
import { buildSystemInstruction, CALL_STATES, describeError, executeTool, TOOL_DECLARATIONS } from "./gemini";
import * as store from "./store";
import type { Mode } from "./types";

export type CallState = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "reconnecting" | "ended" | "error";
export type VideoSource = "none" | "camera" | "screen";

export type Caption = { id: number; role: "user" | "model"; text: string; final: boolean };

export type CallEvents = {
  onState?: (s: CallState) => void;
  onCaption?: (c: Caption) => void;
  onError?: (message: string, fatal: boolean) => void;
  onNotice?: (message: string) => void;
  onVideo?: (source: VideoSource, stream: MediaStream | null) => void;
  onConversation?: (id: string) => void;
  onMuted?: (muted: boolean) => void;
};

const FRAME_INTERVAL_MS = 1000;
const MAX_FRAME_EDGE = 1024;
const MAX_RECONNECTS = 6;

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export function describeMediaError(err: unknown, what: "microphone" | "camera" | "screen"): string {
  const name = (err as DOMException)?.name;
  if (!window.isSecureContext) return `Your browser only allows ${what} access on https:// or localhost. Open the app over HTTPS.`;
  if (name === "NotAllowedError" || name === "SecurityError")
    return what === "screen"
      ? "Screen sharing was cancelled or blocked."
      : `${what === "microphone" ? "Microphone" : "Camera"} access is blocked. Allow it from the icon in your browser's address bar, then try again.`;
  if (name === "NotFoundError" || name === "OverconstrainedError") return `No ${what} was found on this device.`;
  if (name === "NotReadableError") return `Your ${what} is being used by another app. Close it and try again.`;
  return `Couldn't start the ${what}: ${(err as Error)?.message || name || "unknown error"}.`;
}

/**
 * A real-time call with Gemini Live: streams 16 kHz mic audio and ~1 fps
 * camera/screen frames up, plays 24 kHz audio back, handles barge-in,
 * transcripts, tool calls, session resumption and reconnection.
 */
export class LiveCall {
  state: CallState = "idle";
  muted = false;
  videoSource: VideoSource = "none";
  conversationId: string | null;

  private session: Session | null = null;
  private gen = 0; // bumps on every (re)connect so stale socket callbacks are ignored
  private resumeHandle: string | null = null;
  private ending = false;
  private reconnects = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private greeted = false;
  private continuing: boolean;
  private gotMessage = false; // true once Gemini has answered on any connection

  private micStream: MediaStream | null = null;
  private inCtx: AudioContext | null = null;
  private worklet: AudioWorkletNode | null = null;
  private inputLevel = 0;
  private sentStreamEnd = false;

  private outCtx: AudioContext | null = null;
  private outGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserBuf: Uint8Array<ArrayBuffer> | null = null;
  private playing = new Set<AudioBufferSourceNode>();
  private playhead = 0;

  private videoStream: MediaStream | null = null;
  private facing: "user" | "environment" = "user";
  private frameTimer: ReturnType<typeof setInterval> | null = null;
  private frameVideo: HTMLVideoElement | null = null;
  private frameCanvas: HTMLCanvasElement | null = null;

  private captionId = 0;
  private userText = "";
  private modelText = "";
  private userCaption = 0;
  private modelCaption = 0;

  constructor(
    private opts: { mode: Mode; conversationId?: string | null; routineId?: string | null },
    private events: CallEvents = {},
  ) {
    this.conversationId = opts.conversationId ?? null;
    this.continuing = !!opts.conversationId;
  }

  // ---------- lifecycle ----------

  async start() {
    this.setState("connecting");
    this.ending = false;
    if (!window.isSecureContext) {
      this.fail("Calls need a secure connection. Open the app over https:// or on localhost.");
      return;
    }
    // Audio contexts must be created inside the click that started the call.
    this.outCtx = new AudioContext();
    this.outGain = this.outCtx.createGain();
    this.analyser = this.outCtx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyserBuf = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
    this.outGain.connect(this.analyser).connect(this.outCtx.destination);

    try {
      await this.startMic();
    } catch (err) {
      this.fail(describeMediaError(err, "microphone"));
      return;
    }

    if (this.opts.mode === "video") await this.setVideoSource("camera").catch(() => {});
    if (this.opts.mode === "screen") await this.setVideoSource("screen").catch(() => {});

    window.addEventListener("online", this.onOnline);
    await this.connect();
  }

  async end() {
    this.ending = true;
    this.flushTurn(true);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    window.removeEventListener("online", this.onOnline);
    try {
      this.session?.close();
    } catch {}
    this.session = null;
    this.stopPlayback();
    this.stopVideo();
    this.worklet?.disconnect();
    this.micStream?.getTracks().forEach((t) => t.stop());
    await this.inCtx?.close().catch(() => {});
    await this.outCtx?.close().catch(() => {});
    this.setState("ended");
  }

  private onOnline = () => {
    if (this.state === "reconnecting" && !this.session) {
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnect();
    }
  };

  private async connect() {
    const key = store.getApiKey();
    if (!key) return this.fail("Add your Gemini API key in Settings to make calls.");
    const settings = store.getSettings();
    let config;
    try {
      if (!this.conversationId) {
        const routine = this.opts.routineId ? await store.getRoutine(this.opts.routineId) : null;
        const c = await store.createConversation(routine ? routine.title : `${this.opts.mode[0].toUpperCase()}${this.opts.mode.slice(1)} call`);
        this.conversationId = c.id;
        this.events.onConversation?.(c.id);
        this.continuing = false;
      }
      const routine = this.opts.routineId ? ((await store.getRoutine(this.opts.routineId)) ?? null) : null;
      const systemInstruction =
        (await buildSystemInstruction(settings, { mode: this.opts.mode, routine, conversationId: this.conversationId, includeHistory: this.continuing })) + "\n\n" + CALL_STATES;
      config = {
        responseModalities: [Modality.AUDIO],
        systemInstruction,
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: settings.voice } } },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        contextWindowCompression: { slidingWindow: {} },
        sessionResumption: this.resumeHandle ? { handle: this.resumeHandle } : {},
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
      };
    } catch (err) {
      return this.fail((err as Error).message);
    }
    if (this.ending) return;

    const ai = new GoogleGenAI({ apiKey: key });
    const gen = ++this.gen;
    try {
      const session = await ai.live.connect({
        model: settings.liveModel,
        config,
        callbacks: {
          onopen: () => {},
          onmessage: (m) => gen === this.gen && this.onMessage(m),
          onerror: (e) => console.warn("[live] socket error", e),
          onclose: (e) => gen === this.gen && this.onClose(e),
        },
      });
      if (gen !== this.gen || this.ending) {
        session.close();
        return;
      }
      this.session = session;
    } catch (err) {
      const e = describeError(err);
      if (["bad_api_key", "forbidden", "model_not_found", "referrer"].includes(e.code)) return this.fail(e.message);
      return this.scheduleReconnect(e.message || "Couldn't connect to Gemini Live.");
    }

    this.reconnects = 0;
    this.setState("listening");
    if (!this.greeted) {
      this.greeted = true;
      this.sendCue("[call-started]");
      if (this.videoSource !== "none") this.sendCue(this.videoSource === "camera" ? "[camera-on]" : "[screen-on]");
    } else {
      this.events.onNotice?.("Reconnected");
    }
  }

  private onClose(e: CloseEvent) {
    this.session = null;
    if (this.ending) return;
    const reason = e?.reason || "";
    console.warn("[live] closed", e?.code, reason);
    if (/api key|permission|not found|unsupported|invalid|quota|referer/i.test(reason) && !this.gotMessage) {
      return this.fail(describeError(new Error(reason)).message.replace(/^Gemini error: /, "Gemini closed the call: "));
    }
    this.scheduleReconnect(reason || "Connection lost");
  }

  private scheduleReconnect(why: string) {
    if (this.ending) return;
    this.stopPlayback();
    this.flushTurn(true);
    if (this.reconnects >= MAX_RECONNECTS) {
      return this.fail(`The call dropped and couldn't reconnect (${why}). Check your connection and start a new call.`);
    }
    this.setState("reconnecting");
    const delay = navigator.onLine ? Math.min(8000, 750 * 2 ** this.reconnects) : 30_000;
    this.reconnects++;
    this.reconnectTimer = setTimeout(() => this.reconnect(), delay);
  }

  private reconnect() {
    this.reconnectTimer = null;
    if (!this.ending) this.connect();
  }

  private fail(message: string) {
    this.events.onError?.(message, true);
    this.setState("error");
    void this.end().then(() => this.setState("error"));
  }

  private setState(s: CallState) {
    if (this.state === s) return;
    this.state = s;
    this.events.onState?.(s);
  }

  // ---------- server messages ----------

  private onMessage(msg: LiveServerMessage) {
    this.gotMessage = true;
    if (msg.sessionResumptionUpdate?.resumable && msg.sessionResumptionUpdate.newHandle) {
      this.resumeHandle = msg.sessionResumptionUpdate.newHandle;
    }
    if (msg.goAway) {
      // The server will close soon; reconnect proactively with our resume handle.
      const old = this.session;
      this.session = null;
      this.gen++;
      try {
        old?.close();
      } catch {}
      this.reconnects = 0;
      this.flushTurn(true);
      this.setState("reconnecting");
      this.reconnectTimer = setTimeout(() => this.reconnect(), 50);
      return;
    }
    if (msg.toolCall?.functionCalls?.length) void this.runTools(msg.toolCall.functionCalls);

    const sc = msg.serverContent;
    if (!sc) return;

    if (sc.interrupted) {
      this.stopPlayback();
      this.flushModelOnly(" …");
      this.setState("listening");
    }
    if (sc.inputTranscription?.text) {
      this.userText += sc.inputTranscription.text;
      if (!this.userCaption) this.userCaption = ++this.captionId;
      this.events.onCaption?.({ id: this.userCaption, role: "user", text: this.userText, final: false });
      if (this.state === "listening") this.setState("thinking");
    }
    if (sc.outputTranscription?.text) {
      this.modelText += sc.outputTranscription.text;
      if (!this.modelCaption) this.modelCaption = ++this.captionId;
      this.events.onCaption?.({ id: this.modelCaption, role: "model", text: this.modelText, final: false });
    }
    for (const part of sc.modelTurn?.parts ?? []) {
      if (part.inlineData?.data && part.inlineData.mimeType?.startsWith("audio/")) {
        const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType)?.[1]) || 24000;
        this.playPcm(part.inlineData.data, rate);
      }
    }
    if (sc.turnComplete) this.flushTurn(false);
  }

  private async runTools(calls: { id?: string; name?: string; args?: Record<string, unknown> }[]) {
    const functionResponses = [];
    for (const c of calls) {
      const out = await executeTool(c.name || "", c.args || {});
      this.events.onNotice?.(out.summary);
      functionResponses.push({ id: c.id, name: c.name, response: out.response });
    }
    try {
      this.session?.sendToolResponse({ functionResponses });
    } catch {}
  }

  // ---------- transcripts ----------

  private currentSaveMode(): Mode {
    return this.videoSource === "camera" ? "video" : this.videoSource === "screen" ? "screen" : "voice";
  }

  private flushModelOnly(suffix: string) {
    if (this.modelText.trim()) this.modelText = this.modelText.trimEnd() + suffix;
    this.flushTurn(false);
  }

  private flushTurn(_final: boolean) {
    const turns: { role: "user" | "model"; text: string; mode: Mode }[] = [];
    const mode = this.currentSaveMode();
    if (this.userText.trim()) {
      turns.push({ role: "user", text: this.userText.trim(), mode });
      this.events.onCaption?.({ id: this.userCaption, role: "user", text: this.userText.trim(), final: true });
    }
    if (this.modelText.trim()) {
      turns.push({ role: "model", text: this.modelText.trim(), mode });
      this.events.onCaption?.({ id: this.modelCaption, role: "model", text: this.modelText.trim(), final: true });
    }
    this.userText = "";
    this.modelText = "";
    this.userCaption = 0;
    this.modelCaption = 0;
    if (!turns.length || !this.conversationId) return;
    const cid = this.conversationId;
    void (async () => {
      for (const t of turns) await store.addMessage(cid, t.role, t.text, t.mode);
    })().catch(() => {});
  }

  // ---------- microphone ----------

  private async startMic() {
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    this.inCtx = new AudioContext();
    await this.inCtx.audioWorklet.addModule(new URL("audio-capture-worklet.js", document.baseURI).href);
    const src = this.inCtx.createMediaStreamSource(this.micStream);
    this.worklet = new AudioWorkletNode(this.inCtx, "capture-processor");
    this.worklet.port.onmessage = (e: MessageEvent<{ pcm: ArrayBuffer; level: number }>) => {
      this.inputLevel = this.muted ? 0 : e.data.level;
      if (!this.session || this.muted) return;
      try {
        this.session.sendRealtimeInput({ audio: { data: toBase64(e.data.pcm), mimeType: "audio/pcm;rate=16000" } });
        this.sentStreamEnd = false;
      } catch {}
    };
    src.connect(this.worklet);
    // The worklet must be pulled by the graph; route it through a silent gain.
    const sink = this.inCtx.createGain();
    sink.gain.value = 0;
    this.worklet.connect(sink).connect(this.inCtx.destination);
    this.micStream.getAudioTracks()[0]?.addEventListener("ended", () => {
      if (!this.ending) this.events.onError?.("Your microphone disconnected.", false);
    });
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.micStream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
    if (muted && this.session && !this.sentStreamEnd) {
      try {
        this.session.sendRealtimeInput({ audioStreamEnd: true });
        this.sentStreamEnd = true;
      } catch {}
    }
    this.events.onMuted?.(muted);
  }

  // ---------- playback ----------

  private playPcm(b64: string, rate: number) {
    const ctx = this.outCtx;
    if (!ctx || !this.outGain) return;
    if (ctx.state === "suspended") void ctx.resume();
    const pcm = new Int16Array(fromBase64(b64));
    const buf = ctx.createBuffer(1, pcm.length, rate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.outGain);
    const startAt = Math.max(this.playhead, ctx.currentTime + 0.03);
    src.start(startAt);
    this.playhead = startAt + buf.duration;
    this.playing.add(src);
    this.setState("speaking");
    src.onended = () => {
      this.playing.delete(src);
      if (!this.playing.size && this.state === "speaking") this.setState("listening");
    };
  }

  private stopPlayback() {
    for (const s of this.playing) {
      try {
        s.onended = null;
        s.stop();
      } catch {}
    }
    this.playing.clear();
    this.playhead = 0;
  }

  /** 0..1 levels for animating the orb. */
  levels(): { input: number; output: number } {
    let output = 0;
    if (this.analyser && this.analyserBuf && this.playing.size) {
      this.analyser.getByteTimeDomainData(this.analyserBuf);
      let sum = 0;
      for (const v of this.analyserBuf) sum += ((v - 128) / 128) ** 2;
      output = Math.sqrt(sum / this.analyserBuf.length);
    }
    return { input: Math.min(1, this.inputLevel * 4), output: Math.min(1, output * 4) };
  }

  // ---------- camera & screen ----------

  async setVideoSource(source: VideoSource): Promise<void> {
    if (source === this.videoSource && source !== "camera") return;
    let stream: MediaStream | null = null;
    if (source === "camera") {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: this.facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch (err) {
        this.events.onError?.(describeMediaError(err, "camera"), false);
        throw err;
      }
    } else if (source === "screen") {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        const msg = "This browser can't share its screen. Use Chrome, Edge, Firefox or Safari on a computer.";
        this.events.onError?.(msg, false);
        throw new Error(msg);
      }
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
      } catch (err) {
        this.events.onNotice?.(describeMediaError(err, "screen"));
        throw err;
      }
    }
    this.stopVideo();
    this.videoStream = stream;
    this.videoSource = stream ? source : "none";
    if (stream) {
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        // The user pressed the browser's own "Stop sharing" control.
        if (this.videoStream === stream) void this.setVideoSource("none");
      });
      this.startFrames(stream);
    }
    this.events.onVideo?.(this.videoSource, stream);
    if (this.session && this.greeted) {
      this.sendCue(source === "camera" ? "[camera-on]" : source === "screen" ? "[screen-on]" : "[video-off]");
    }
  }

  async flipCamera() {
    if (this.videoSource !== "camera") return;
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
    if (devices.length < 2) {
      this.events.onNotice?.("Only one camera is available.");
      return;
    }
    this.facing = this.facing === "user" ? "environment" : "user";
    await this.setVideoSource("camera").catch(() => {});
  }

  get facingMode() {
    return this.facing;
  }

  private startFrames(stream: MediaStream) {
    const video = (this.frameVideo ??= Object.assign(document.createElement("video"), { muted: true, playsInline: true }));
    video.srcObject = stream;
    void video.play().catch(() => {});
    const canvas = (this.frameCanvas ??= document.createElement("canvas"));
    const ctx = canvas.getContext("2d");
    this.frameTimer = setInterval(() => {
      if (!this.session || !ctx || video.readyState < 2 || !video.videoWidth) return;
      const scale = Math.min(1, MAX_FRAME_EDGE / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        async (blob) => {
          if (!blob || !this.session) return;
          try {
            this.session.sendRealtimeInput({ video: { data: toBase64(await blob.arrayBuffer()), mimeType: "image/jpeg" } });
          } catch {}
        },
        "image/jpeg",
        0.72,
      );
    }, FRAME_INTERVAL_MS);
  }

  private stopVideo() {
    if (this.frameTimer) clearInterval(this.frameTimer);
    this.frameTimer = null;
    this.videoStream?.getTracks().forEach((t) => t.stop());
    this.videoStream = null;
    if (this.frameVideo) this.frameVideo.srcObject = null;
  }

  // ---------- text ----------

  private sendCue(text: string) {
    try {
      this.session?.sendRealtimeInput({ text });
    } catch {}
  }

  /** Type a message during the call; the reply comes back as speech. */
  sendText(text: string) {
    const t = text.trim();
    if (!t || !this.session) return false;
    this.flushTurn(false);
    this.userText = t;
    this.userCaption = ++this.captionId;
    this.events.onCaption?.({ id: this.userCaption, role: "user", text: t, final: false });
    this.sendCue(t);
    this.setState("thinking");
    return true;
  }
}
