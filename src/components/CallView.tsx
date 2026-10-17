import { useCallback, useEffect, useRef, useState } from "react";
import { LiveCall, type CallState, type Caption, type VideoSource } from "../lib/live";
import * as store from "../lib/store";
import type { Mode, UserSettings } from "../lib/types";
import { browserSupport } from "./Setup";

const Link = (p: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...p} />;
const notifyConversationsChanged = () => store.changed("conversations");
import {
  CaptionsIcon,
  ChatIcon,
  CloseIcon,
  FlipIcon,
  MicIcon,
  MicOffIcon,
  PhoneEndIcon,
  ScreenIcon,
  VideoIcon,
  VideoOffIcon,
} from "./Icons";
import { Orb } from "./Orb";

type Props = {
  mode: Mode;
  conversationId: string | null;
  routineId: string | null;
  settings: UserSettings;
};

const STATE_LABEL: Record<CallState, string> = {
  idle: "Ready",
  connecting: "Connecting…",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  reconnecting: "Reconnecting…",
  ended: "Call ended",
  error: "Call ended",
};

const MODE_TITLE: Record<Mode, string> = { voice: "Voice call", video: "Video call", screen: "Screen share", text: "Call" };

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  return `${m}:${String(sec % 60).padStart(2, "0")}`;
}

export function CallView({ mode, conversationId, routineId, settings }: Props) {
  const userName = settings.userName;
  const assistantName = settings.assistantName;
  const hasApiKey = !!store.getApiKey();
  const support = browserSupport();
  const [routine, setRoutine] = useState<{ id: string; title: string } | null>(null);
  useEffect(() => {
    if (routineId) store.getRoutine(routineId).then((r) => r && setRoutine({ id: r.id, title: r.title }));
  }, [routineId]);
  const callRef = useRef<LiveCall | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<"pre" | "live" | "over">("pre");
  const [state, setState] = useState<CallState>("idle");
  const [muted, setMuted] = useState(false);
  const [source, setSource] = useState<VideoSource>("none");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [captionsOn, setCaptionsOn] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [toast, setToast] = useState("");
  const [fatal, setFatal] = useState("");
  const [convId, setConvId] = useState(conversationId);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [draft, setDraft] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3500);
  }, []);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    if (!startedAt || phase !== "live") return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [startedAt, phase]);

  useEffect(() => {
    const onUnload = () => void callRef.current?.end();
    window.addEventListener("pagehide", onUnload);
    return () => {
      window.removeEventListener("pagehide", onUnload);
      void callRef.current?.end();
    };
  }, []);

  async function start() {
    setFatal("");
    setCaptions([]);
    setPhase("live");
    const call = new LiveCall(
      { mode, conversationId: convId, routineId },
      {
        onState: (s) => {
          setState(s);
          if (s === "listening") setStartedAt((t) => t ?? Date.now());
          if (s === "ended" || s === "error") setPhase("over");
        },
        onCaption: (c) =>
          setCaptions((prev) => {
            const i = prev.findIndex((p) => p.id === c.id);
            if (i >= 0) {
              const next = prev.slice();
              next[i] = c;
              return next;
            }
            return [...prev, c].slice(-80);
          }),
        onError: (msg, isFatal) => (isFatal ? setFatal(msg) : showToast(msg)),
        onNotice: showToast,
        onVideo: (src, s) => {
          setSource(src);
          setStream(s);
          setFacing(call.facingMode);
        },
        onConversation: (id) => {
          setConvId(id);
          notifyConversationsChanged();
        },
        onMuted: setMuted,
      },
    );
    callRef.current = call;
    await call.start();
  }

  async function hangUp() {
    await callRef.current?.end();
    setPhase("over");
    notifyConversationsChanged();
  }

  async function toggleCamera() {
    const call = callRef.current;
    if (!call) return;
    await call.setVideoSource(source === "camera" ? "none" : "camera").catch(() => {});
  }

  async function toggleScreen() {
    const call = callRef.current;
    if (!call) return;
    await call.setVideoSource(source === "screen" ? "none" : "screen").catch(() => {});
  }

  function sendDraft(e: React.FormEvent) {
    e.preventDefault();
    if (callRef.current?.sendText(draft)) setDraft("");
  }

  const levels = useCallback(() => callRef.current?.levels() ?? { input: 0, output: 0 }, []);
  const liveCaptions = captions.slice(-2);
  const heading = routine ? routine.title : MODE_TITLE[mode];

  // ---------- before the call ----------
  if (phase === "pre") {
    const shares =
      mode === "video" ? "your microphone and camera" : mode === "screen" ? "your microphone and the screen or window you pick" : "your microphone";
    return (
      <main className="call" style={{ gridTemplateRows: "auto 1fr" }}>
        <div className="call-top">
          <Link href={convId ? `#/chat/${convId}` : "#/"} className="btn btn-sm" style={{ background: "#ffffff14", borderColor: "transparent", color: "#fff" }}>
            Back
          </Link>
        </div>
        <div className="stage">
          <div className="precall">
            <Orb className="stage-orb" state="idle" />
            <h1>{heading}</h1>
            <p>
              {assistantName} will hear {shares} while the call is on. Audio and video go straight from this browser to Google Gemini and
              aren&apos;t recorded; a text transcript is saved in this browser.
            </p>
            {!hasApiKey ? (
              <div className="call-error">
                Calls need your Gemini API key. Add it in <a href="#/settings">Settings</a>.
              </div>
            ) : !support.secure || !support.mic || !support.audio ? (
              <div className="call-error">
                {!support.secure ? "Calls need a secure (https://) page." : "This browser can't capture microphone audio, so calls aren't available here. Try Chrome, Edge or Safari."}
              </div>
            ) : mode === "screen" && !support.screen ? (
              <div className="call-error">
                This browser can&apos;t share its screen (most phones can&apos;t). Use Chrome, Edge, Firefox or Safari on a computer, or start a{" "}
                <a href="#/call/video">video call</a> and point your camera instead.
              </div>
            ) : (
              <button className="btn btn-primary" style={{ padding: "13px 28px", fontSize: 16, background: "var(--live)", borderColor: "var(--live)", color: "#062a24" }} onClick={start} autoFocus>
                Start {mode === "screen" ? "sharing" : "call"}
              </button>
            )}
          </div>
        </div>
      </main>
    );
  }

  // ---------- after the call ----------
  if (phase === "over") {
    return (
      <main className="call" style={{ gridTemplateRows: "1fr" }}>
        <div className="stage">
          <div className="precall">
            <Orb className="stage-orb" state={fatal ? "error" : "ended"} />
            <h1>{fatal ? "The call couldn't continue" : "Call ended"}</h1>
            {fatal ? <div className="call-error" role="alert">{fatal}</div> : elapsed > 0 && <p>{fmt(elapsed)} with {assistantName}</p>}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
              <button className="btn btn-primary" onClick={start}>
                {fatal ? "Try again" : "Call again"}
              </button>
              {convId && (
                <Link className="btn" href={`#/chat/${convId}`} style={{ background: "#ffffff14", borderColor: "transparent", color: "#fff" }}>
                  Continue in chat
                </Link>
              )}
              <Link className="btn" href="#/" style={{ background: "#ffffff14", borderColor: "transparent", color: "#fff" }}>
                Home
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ---------- in the call ----------
  const mirrored = source === "camera" && facing === "user";
  return (
    <main className="call">
      <div className="call-top">
        <div className="call-who">
          <strong>{assistantName}</strong>
          <span className="status-pill" data-state={state} aria-live="polite">
            <i aria-hidden />
            {STATE_LABEL[state]}
            {startedAt && state !== "connecting" ? ` · ${fmt(elapsed)}` : ""}
          </span>
        </div>
        {source !== "none" && (
          <span className="sharing-flag" role="status">
            <i aria-hidden />
            {source === "screen" ? `${assistantName} can see your screen` : `${assistantName} can see your camera`}
          </span>
        )}
      </div>

      <div className="stage">
        {stream ? (
          <>
            <video ref={videoRef} autoPlay playsInline muted data-source={source} data-mirror={mirrored} />
            <Orb className="float-orb" state={state} levels={levels} />
          </>
        ) : (
          <Orb className="stage-orb" state={state} levels={levels} />
        )}

        {captionsOn && (
          <div className="captions" aria-live="off">
            {liveCaptions.map((c) => (
              <div key={c.id} className="caption" data-role={c.role}>
                {c.text}
              </div>
            ))}
          </div>
        )}

        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}

        {panelOpen && (
          <section className="side-panel" aria-label="Transcript and messages">
            <header>
              Transcript
              <button className="btn btn-ghost icon-btn" onClick={() => setPanelOpen(false)} aria-label="Close transcript" style={{ color: "#fff" }}>
                <CloseIcon />
              </button>
            </header>
            <div className="transcript">
              {captions.length === 0 && <p className="hint">What you and {assistantName} say will appear here.</p>}
              {captions.map((c) => (
                <div key={c.id}>
                  <div className="who">{c.role === "user" ? userName : assistantName}</div>
                  {c.text}
                </div>
              ))}
            </div>
            <form onSubmit={sendDraft}>
              <input className="input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Type to ${assistantName}`} aria-label="Type a message" />
              <button className="btn btn-primary btn-sm" disabled={!draft.trim()}>
                Send
              </button>
            </form>
          </section>
        )}
      </div>

      <div className="call-bottom">
        <div className="controls" role="toolbar" aria-label="Call controls">
          <button
            className={`ctl ${muted ? "ctl-off" : ""}`}
            onClick={() => callRef.current?.setMuted(!muted)}
            aria-pressed={muted}
            aria-label={muted ? "Unmute microphone" : "Mute microphone"}
            title={muted ? "Unmute" : "Mute"}
          >
            {muted ? <MicOffIcon /> : <MicIcon />}
          </button>
          <button
            className="ctl"
            onClick={toggleCamera}
            aria-pressed={source === "camera"}
            aria-label={source === "camera" ? "Turn camera off" : "Turn camera on"}
            title={source === "camera" ? "Camera off" : "Camera on"}
          >
            {source === "camera" ? <VideoIcon /> : <VideoOffIcon />}
          </button>
          {source === "camera" && (
            <button className="ctl" onClick={() => callRef.current?.flipCamera()} aria-label="Switch camera" title="Switch camera">
              <FlipIcon />
            </button>
          )}
          <button
            className="ctl"
            hidden={!support.screen}
            onClick={toggleScreen}
            aria-pressed={source === "screen"}
            aria-label={source === "screen" ? "Stop sharing screen" : "Share screen"}
            title={source === "screen" ? "Stop sharing" : "Share screen"}
          >
            <ScreenIcon />
          </button>
          <button className="ctl" onClick={() => setCaptionsOn((v) => !v)} aria-pressed={captionsOn} aria-label="Captions" title="Captions">
            <CaptionsIcon />
          </button>
          <button className="ctl" onClick={() => setPanelOpen((v) => !v)} aria-pressed={panelOpen} aria-label="Transcript and typing" title="Transcript">
            <ChatIcon />
          </button>
          <button className="ctl ctl-end" onClick={hangUp} aria-label="End call" title="End call">
            <PhoneEndIcon />
          </button>
        </div>
      </div>
    </main>
  );
}
