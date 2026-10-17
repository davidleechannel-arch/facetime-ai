import { GoogleGenAI, Type, type Content, type FunctionDeclaration, type Part } from "@google/genai";
import { describeSchedule } from "./schedule";
import * as store from "./store";
import type { Message, Mode, Routine, Schedule, UserSettings } from "./types";

export class AppError extends Error {
  constructor(message: string, public code = "error") {
    super(message);
  }
}

export function client(): GoogleGenAI {
  const key = store.getApiKey();
  if (!key) throw new AppError("Add your Gemini API key in Settings to start.", "missing_api_key");
  return new GoogleGenAI({ apiKey: key });
}

/** Turns SDK/network failures into messages a person can act on. */
export function describeError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const e = err as { status?: number; message?: string };
  const msg = e?.message || String(err);
  const status = e?.status ?? Number(/"code":\s*(\d{3})/.exec(msg)?.[1] || /\b(4\d\d|5\d\d)\b/.exec(msg)?.[1] || 0);
  if (/API key not valid|API_KEY_INVALID/i.test(msg)) return new AppError("Gemini rejected this API key. Check it in Settings.", "bad_api_key");
  if (/referer|referrer/i.test(msg)) return new AppError("This API key is restricted to other websites. Add this site's address to the key's allowed referrers in Google Cloud.", "referrer");
  if (status === 401 || status === 403) return new AppError("Gemini refused the request. Check that your key is valid and has access to this model.", "forbidden");
  if (status === 404) return new AppError("The selected Gemini model wasn't found for your key. Pick another model in Settings.", "model_not_found");
  if (status === 429) return new AppError("You've hit Gemini's rate limit or quota. Wait a moment and try again.", "rate_limited");
  if (status >= 500) return new AppError("Gemini is having trouble right now. Try again in a moment.", "upstream");
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return new AppError("Couldn't reach Gemini. Check your internet connection.", "network");
  return new AppError(`Gemini error: ${msg.slice(0, 240)}`, "upstream");
}

/** Quick check that a key works, used during setup. */
export async function verifyKey(key: string, model: string): Promise<void> {
  const ai = new GoogleGenAI({ apiKey: key.trim() });
  try {
    await ai.models.generateContent({ model, contents: "Reply with the single word: ready" });
  } catch (err) {
    throw describeError(err);
  }
}

// ---------- persona / system prompt ----------

const MODE_GUIDE: Record<Mode, string> = {
  text: `You are chatting by text. Markdown is rendered (lists, code blocks, tables, bold). Use it when it helps, not by default.`,
  voice: `You are on a live voice call. Speak naturally and keep turns short (usually one to three sentences) unless asked for depth. Never read markdown, URLs or code symbols aloud. The user may interrupt you; that's normal. Respond in whatever language the user speaks and switch when they switch.`,
  video: `You are on a live video call. You receive frames from the user's camera about once per second, plus their voice. Refer to what you can actually see, notice relevant changes without being asked, and say plainly when something is unclear, dark or out of frame. Never claim to see something that isn't in the frames. Do not try to identify people from their faces. Keep spoken turns short and natural.`,
  screen: `You are on a live call while the user shares their screen. You receive screenshots about once per second plus their voice. Read what's on screen carefully, point to things by location ("top-right", "the blue Save button", "line 42"), give one step at a time, and wait for the user before the next step. If text is too small, ask them to zoom in. Never claim to see something that isn't visible.`,
};

export const CALL_STATES = `During a call the user can turn the camera or screen sharing on and off at any time. You'll get short cues like [camera-on], [screen-on] or [video-off]; adapt to them (once the camera is on, you can talk about what you see). With no video on, you can only hear the user.`;

export async function buildSystemInstruction(s: UserSettings, opts: { mode: Mode; routine?: Routine | null; conversationId?: string | null; includeHistory?: boolean }) {
  const name = s.userName || "there";
  const tz = s.timezone;
  const nowLocal = new Date().toLocaleString("en-US", { timeZone: tz, dateStyle: "full", timeStyle: "short" });
  const parts = [
    `You are ${s.assistantName}, a personal AI companion. You talk with ${name} through text chat, voice calls, video calls and screen sharing; all of these share one memory and history.`,
    `Personality: warm, curious, genuinely useful, never sycophantic. Style: ${s.style}. Humor: ${s.humor}. Response length: ${s.responseLength}. Preferred language: ${s.language}; use it unless they speak another.`,
    `Be honest: say when you're unsure and don't invent facts. You are an AI and don't pretend to have feelings or a body. When teaching, guide with questions and hints before giving full answers.`,
    MODE_GUIDE[opts.mode],
    `Current local time for ${name}: ${nowLocal} (${tz}).`,
    `Tools: you can save memories, create routines (reminders, lessons, check-ins), list or cancel routines, and log lesson progress. These only affect this app. If a routine request is clear (e.g. "teach me Korean every morning at 8"), create it right away and confirm what you scheduled. For anything else (sending email, payments, contacting people) say you can't do it yet.`,
  ];
  if (s.memoryEnabled) {
    const mems = (await store.listMemories()).slice(0, 60);
    parts.push(
      `Long-term memory is ON. Call remember_fact when ${name} shares something durable and useful (projects, goals, preferences). Don't save sensitive details (health, finances, passwords, ID numbers) unless asked. Use memories naturally; don't recite them.` +
        (mems.length ? `\nWhat you remember:\n${mems.map((m) => `- [${m.id}] ${m.content}`).join("\n")}` : `\nNothing saved yet.`),
    );
  } else parts.push(`Long-term memory is OFF. Don't call remember_fact.`);
  const routines = (await store.listRoutines()).filter((r) => r.active);
  if (routines.length) parts.push(`Active routines:\n${routines.map((r) => `- [${r.id}] ${r.title} (${r.kind}${r.topic ? `: ${r.topic}` : ""}) — ${describeSchedule(r.schedule)}`).join("\n")}`);
  if (opts.routine) {
    const r = opts.routine;
    parts.push(
      `This session was started from the routine "${r.title}" (${r.kind}${r.topic ? `, topic: ${r.topic}` : ""}).` +
        (r.kind === "lesson"
          ? ` Run an interactive lesson adapted to ${name}'s level: review earlier material, practice weak spots, introduce something new, correct gently. Near the end call log_lesson_progress with routine_id "${r.id}" summarising what was covered and what to practice next.`
          : r.kind === "checkin"
            ? ` Check in on how things are going and help plan next steps.`
            : ` Remind ${name} about it and offer help.`) +
        (r.progress_notes ? `\nProgress so far:\n${r.progress_notes}` : `\nThis is the first session.`),
    );
  }
  if (opts.includeHistory && opts.conversationId) {
    const hist = await store.listMessages(opts.conversationId, 40);
    if (hist.length) {
      const lines = hist.map((m) => `${m.role === "user" ? name : s.assistantName} (${m.mode}): ${m.content.slice(0, 800)}`);
      parts.push(`Earlier in this same conversation (continue from here, don't repeat it):\n${lines.join("\n").slice(-12000)}`);
    }
  }
  if (opts.mode !== "text") {
    parts.push(`When you receive the cue "[call-started]", greet ${name} by name in one short, natural sentence${opts.routine ? " and start the routine" : opts.includeHistory ? " and pick up where you left off" : ""}. Never mention the cue.`);
  }
  return parts.join("\n\n");
}

// ---------- tools ----------

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "remember_fact",
    description: "Save a durable fact about the user to long-term memory (projects, goals, preferences). One short sentence.",
    parameters: { type: Type.OBJECT, properties: { fact: { type: Type.STRING, description: "Third person, e.g. 'Is building a robot with a Bambu Lab 3D printer.'" } }, required: ["fact"] },
  },
  {
    name: "forget_fact",
    description: "Delete a saved memory by id when the user asks you to forget it or it's wrong.",
    parameters: { type: Type.OBJECT, properties: { memory_id: { type: Type.STRING } }, required: ["memory_id"] },
  },
  {
    name: "create_routine",
    description: "Schedule a recurring or one-time routine. At that time the user gets a notification that can start a call or chat. kind 'lesson' for tutoring, 'checkin' for progress check-ins, 'reminder' otherwise.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "Short title, e.g. 'Korean practice'" },
        kind: { type: Type.STRING, enum: ["reminder", "lesson", "checkin"] },
        topic: { type: Type.STRING },
        schedule_type: { type: Type.STRING, enum: ["daily", "weekly", "once"] },
        time: { type: Type.STRING, description: "24-hour local time HH:MM" },
        days: { type: Type.ARRAY, items: { type: Type.INTEGER }, description: "Weekly: 0=Sunday … 6=Saturday" },
        date: { type: Type.STRING, description: "Once: local date YYYY-MM-DD" },
        call_mode: { type: Type.STRING, enum: ["voice", "video", "text"] },
      },
      required: ["title", "kind", "schedule_type", "time"],
    },
  },
  { name: "list_routines", description: "List the user's routines with ids and schedules.", parameters: { type: Type.OBJECT, properties: {} } },
  {
    name: "cancel_routine",
    description: "Delete a routine by id after the user asks to cancel it.",
    parameters: { type: Type.OBJECT, properties: { routine_id: { type: Type.STRING } }, required: ["routine_id"] },
  },
  {
    name: "log_lesson_progress",
    description: "Record what was covered in a lesson and what to practice next.",
    parameters: { type: Type.OBJECT, properties: { routine_id: { type: Type.STRING }, summary: { type: Type.STRING } }, required: ["routine_id", "summary"] },
  },
];

export async function executeTool(name: string, args: Record<string, unknown> = {}): Promise<{ response: Record<string, unknown>; summary: string }> {
  const s = store.getSettings();
  try {
    switch (name) {
      case "remember_fact": {
        if (!s.memoryEnabled) return { response: { error: "Memory is off." }, summary: "Memory is off" };
        const m = await store.addMemory(String(args.fact || ""));
        return { response: { ok: true, memory_id: m.id }, summary: `Remembered: ${m.content}` };
      }
      case "forget_fact":
        await store.deleteMemory(String(args.memory_id));
        return { response: { ok: true }, summary: "Forgot a memory" };
      case "create_routine": {
        const time = String(args.time || "");
        const type = String(args.schedule_type);
        const schedule: Schedule =
          type === "weekly" ? { type: "weekly", time, days: ((args.days as number[]) || []).map(Number) } : type === "once" ? { type: "once", at: `${args.date}T${time}` } : { type: "daily", time };
        const r = await store.createRoutine({
          title: String(args.title || "Routine"),
          kind: args.kind as never,
          topic: (args.topic as string) || null,
          schedule,
          timezone: s.timezone,
          call_mode: (args.call_mode as never) || (args.kind === "lesson" ? "voice" : "text"),
        });
        const when = describeSchedule(r.schedule);
        return { response: { ok: true, routine_id: r.id, schedule: when }, summary: `Scheduled “${r.title}” · ${when}` };
      }
      case "list_routines": {
        const routines = (await store.listRoutines()).map((r) => ({ id: r.id, title: r.title, kind: r.kind, topic: r.topic, schedule: describeSchedule(r.schedule), active: r.active }));
        return { response: { routines }, summary: `Checked ${routines.length} routine${routines.length === 1 ? "" : "s"}` };
      }
      case "cancel_routine": {
        const r = await store.getRoutine(String(args.routine_id));
        if (!r) return { response: { error: "Routine not found." }, summary: "Routine not found" };
        await store.deleteRoutine(r.id);
        return { response: { ok: true }, summary: `Cancelled “${r.title}”` };
      }
      case "log_lesson_progress":
        await store.appendRoutineProgress(String(args.routine_id), String(args.summary || ""));
        return { response: { ok: true }, summary: "Saved lesson progress" };
      default:
        return { response: { error: `Unknown tool ${name}` }, summary: `Unknown tool ${name}` };
    }
  } catch (e) {
    const message = (e as Error).message || "The action failed.";
    return { response: { error: message }, summary: message };
  }
}

// ---------- text chat ----------

const INLINE_BUDGET = 18 * 1024 * 1024;
const TEXTUAL = (mime: string) => mime.startsWith("text/") || ["application/json", "application/xml", "application/javascript"].includes(mime);

async function blobToBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function toContents(messages: Message[]): Promise<Content[]> {
  const contents: Content[] = [];
  let budget = INLINE_BUDGET;
  const recent = new Set(messages.filter((m) => m.attachments.length).slice(-4).map((m) => m.id));
  for (const m of messages) {
    if (m.role === "system") continue;
    const parts: Part[] = [];
    if (m.attachments.length) {
      if (recent.has(m.id)) {
        for (const a of m.attachments) {
          const f = await store.getFile(a.id);
          if (!f || f.size > budget) {
            parts.push({ text: `[Attached "${a.name}" is unavailable.]` });
            continue;
          }
          budget -= f.size;
          if (TEXTUAL(f.mime)) parts.push({ text: `--- File: ${f.name} ---\n${(await f.blob.text()).slice(0, 120_000)}\n--- End of ${f.name} ---` });
          else parts.push({ inlineData: { mimeType: f.mime, data: await blobToBase64(f.blob) } });
        }
      } else parts.push({ text: `[Earlier attachments: ${m.attachments.map((a) => a.name).join(", ")}]` });
    }
    if (m.content) parts.push({ text: (m.mode !== "text" ? `[${m.mode} call] ` : "") + m.content });
    if (!parts.length) continue;
    const last = contents[contents.length - 1];
    if (last && last.role === m.role) last.parts!.push(...parts);
    else contents.push({ role: m.role, parts });
  }
  while (contents.length && contents[0].role !== "user") contents.shift();
  return contents;
}

export async function streamReply(
  conversationId: string,
  routine: Routine | null,
  on: { delta: (text: string) => void; tool: (summary: string) => void },
  signal?: AbortSignal,
): Promise<string> {
  const ai = client();
  const s = store.getSettings();
  const systemInstruction = await buildSystemInstruction(s, { mode: "text", routine });
  const contents = await toContents(await store.listMessages(conversationId, 40));
  let full = "";
  try {
    for (let round = 0; round < 5; round++) {
      const result = await ai.models.generateContentStream({
        model: s.textModel,
        contents,
        config: { systemInstruction, tools: [{ functionDeclarations: TOOL_DECLARATIONS }], abortSignal: signal },
      });
      const modelParts: Part[] = [];
      const calls: NonNullable<Part["functionCall"]>[] = [];
      for await (const chunk of result) {
        for (const p of chunk.candidates?.[0]?.content?.parts ?? []) {
          modelParts.push(p);
          if (p.functionCall) calls.push(p.functionCall);
          else if (p.text && !p.thought) {
            full += p.text;
            on.delta(p.text);
          }
        }
      }
      if (!calls.length) break;
      contents.push({ role: "model", parts: modelParts });
      const responses: Part[] = [];
      for (const c of calls) {
        const out = await executeTool(c.name || "", (c.args as Record<string, unknown>) || {});
        on.tool(out.summary);
        responses.push({ functionResponse: { id: c.id, name: c.name, response: out.response } });
      }
      contents.push({ role: "user", parts: responses });
    }
  } catch (err) {
    throw Object.assign(describeError(err), { partial: full });
  }
  return full.trim() ? full : "Done.";
}
