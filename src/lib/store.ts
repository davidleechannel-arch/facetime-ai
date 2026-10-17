// Everything is stored in this browser: IndexedDB for conversations, files,
// memories and routines; localStorage for settings and (optionally) the key.
import { nextRun, validTimezone } from "./schedule";
import {
  DEFAULT_SETTINGS,
  type AppNotification,
  type Attachment,
  type Conversation,
  type Memory,
  type Message,
  type Mode,
  type Routine,
  type Schedule,
  type StoredFile,
  type UserSettings,
} from "./types";

const DB_NAME = "facetime-ai";
const STORES = ["conversations", "messages", "files", "memories", "routines", "notifications"] as const;
type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      for (const s of STORES) {
        if (!d.objectStoreNames.contains(s)) {
          const os = d.createObjectStore(s, { keyPath: "id" });
          if (s === "messages") os.createIndex("conversation_id", "conversation_id");
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Close other FaceTime AI tabs and reload."));
  });
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(store: StoreName, mode: IDBTransactionMode = "readonly") {
  return (await openDb()).transaction(store, mode).objectStore(store);
}

const all = async <T>(s: StoreName) => (await wrap((await tx(s)).getAll())) as T[];
const get = async <T>(s: StoreName, key: string) => (await wrap((await tx(s)).get(key))) as T | undefined;
const put = async (s: StoreName, value: unknown) => {
  await wrap((await tx(s, "readwrite")).put(value));
  changed(s);
};
const del = async (s: StoreName, key: string) => {
  await wrap((await tx(s, "readwrite")).delete(key));
  changed(s);
};

export function changed(what: string) {
  window.dispatchEvent(new CustomEvent("ftai:changed", { detail: what }));
}

export function onChanged(fn: (what: string) => void) {
  const h = (e: Event) => fn((e as CustomEvent).detail);
  window.addEventListener("ftai:changed", h);
  return () => window.removeEventListener("ftai:changed", h);
}

export const uid = () => crypto.randomUUID();

// ---------- settings & key ----------

export function getSettings(): UserSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem("ftai-settings") || "{}") };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(patch: Partial<UserSettings>): UserSettings {
  const next = { ...getSettings(), ...patch };
  try {
    localStorage.setItem("ftai-settings", JSON.stringify(next));
  } catch {}
  changed("settings");
  return next;
}

export function getApiKey(): string {
  try {
    return sessionStorage.getItem("ftai-key") || localStorage.getItem("ftai-key") || "";
  } catch {
    return "";
  }
}

export function setApiKey(key: string, remember: boolean) {
  try {
    localStorage.removeItem("ftai-key");
    sessionStorage.removeItem("ftai-key");
    if (key) (remember ? localStorage : sessionStorage).setItem("ftai-key", key.trim());
  } catch {}
  changed("key");
}

export function keyIsRemembered() {
  try {
    return !!localStorage.getItem("ftai-key");
  } catch {
    return false;
  }
}

// ---------- conversations & messages ----------

type MessageRow = Message & { conversation_id: string };

export async function listConversations(): Promise<Conversation[]> {
  const list = await all<Conversation>("conversations");
  return list.sort((a, b) => b.updated_at - a.updated_at);
}

export const getConversation = (id: string) => get<Conversation>("conversations", id);

export async function createConversation(title = "New conversation"): Promise<Conversation> {
  const c: Conversation = { id: uid(), title, created_at: Date.now(), updated_at: Date.now() };
  await put("conversations", c);
  return c;
}

export async function updateConversation(id: string, patch: Partial<Conversation>) {
  const c = await getConversation(id);
  if (c) await put("conversations", { ...c, ...patch });
}

export async function deleteConversation(id: string) {
  const msgs = await listMessages(id);
  for (const m of msgs) for (const a of m.attachments) await del("files", a.id);
  const store = await tx("messages", "readwrite");
  for (const m of msgs) store.delete(m.id);
  await del("conversations", id);
}

export async function listMessages(conversationId: string, limit = 400): Promise<Message[]> {
  const store = await tx("messages");
  const rows = (await wrap(store.index("conversation_id").getAll(conversationId))) as MessageRow[];
  return rows.sort((a, b) => a.created_at - b.created_at).slice(-limit);
}

export async function addMessage(conversationId: string, role: Message["role"], content: string, mode: Mode = "text", attachments: Attachment[] = []): Promise<Message> {
  const m: MessageRow = { id: uid(), conversation_id: conversationId, role, mode, content, attachments, created_at: Date.now() };
  await put("messages", m);
  const c = await getConversation(conversationId);
  if (c) await put("conversations", { ...c, updated_at: m.created_at, preview: content.replace(/[*_`#>]+/g, "").replace(/\s+/g, " ").slice(0, 120) });
  return m;
}

// ---------- files ----------

export const MAX_FILE = 15 * 1024 * 1024;

export async function saveFile(file: File): Promise<Attachment> {
  const a: StoredFile = { id: uid(), name: file.name, mime: file.type || guessMime(file.name), size: file.size, blob: file };
  await put("files", a);
  return { id: a.id, name: a.name, mime: a.mime, size: a.size };
}

export const getFile = (id: string) => get<StoredFile>("files", id);

function guessMime(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = { md: "text/markdown", txt: "text/plain", csv: "text/csv", ts: "text/plain", tsx: "text/plain", js: "text/javascript", py: "text/x-python", json: "application/json", pdf: "application/pdf" };
  return map[ext] || "application/octet-stream";
}

// ---------- memories ----------

export async function listMemories(): Promise<Memory[]> {
  return (await all<Memory>("memories")).sort((a, b) => b.created_at - a.created_at);
}

export async function addMemory(content: string, source = "assistant"): Promise<Memory> {
  const text = content.trim().slice(0, 500);
  if (!text) throw new Error("Memory text is empty.");
  const existing = (await listMemories()).find((m) => m.content === text);
  if (existing) return existing;
  const m: Memory = { id: uid(), content: text, source, created_at: Date.now() };
  await put("memories", m);
  return m;
}

export const deleteMemory = (id: string) => del("memories", id);

// ---------- routines ----------

export async function listRoutines(): Promise<Routine[]> {
  return (await all<Routine>("routines")).sort((a, b) => Number(b.active) - Number(a.active) || (a.next_run_at ?? Infinity) - (b.next_run_at ?? Infinity));
}

export const getRoutine = (id: string) => get<Routine>("routines", id);

export async function createRoutine(input: { title: string; kind?: Routine["kind"]; topic?: string | null; schedule: Schedule; timezone: string; call_mode?: Mode }): Promise<Routine> {
  if (!validTimezone(input.timezone)) throw new Error(`Unknown time zone "${input.timezone}".`);
  if (input.schedule.type === "weekly" && !input.schedule.days.length) throw new Error("Pick at least one day.");
  const next = nextRun(input.schedule, input.timezone, Date.now());
  if (next === null) throw new Error("That time is already in the past.");
  const kind = (["reminder", "lesson", "checkin"] as const).includes(input.kind as never) ? input.kind! : "reminder";
  const mode = (["text", "voice", "video", "screen"] as const).includes(input.call_mode as never) ? input.call_mode! : "voice";
  const r: Routine = {
    id: uid(),
    title: input.title.trim().slice(0, 120) || "Routine",
    kind,
    topic: input.topic || null,
    schedule: input.schedule,
    timezone: input.timezone,
    call_mode: mode,
    active: true,
    progress_notes: "",
    next_run_at: next,
    last_run_at: null,
  };
  await put("routines", r);
  return r;
}

export async function updateRoutine(id: string, patch: Partial<Routine>) {
  const r = await getRoutine(id);
  if (!r) throw new Error("Routine not found.");
  const merged = { ...r, ...patch };
  if (patch.active === true) merged.next_run_at = nextRun(r.schedule, r.timezone, Date.now());
  await put("routines", merged);
  return merged;
}

export const deleteRoutine = (id: string) => del("routines", id);

export async function appendRoutineProgress(id: string, note: string) {
  const r = await getRoutine(id);
  if (!r) throw new Error("Routine not found.");
  const stamp = new Date().toISOString().slice(0, 10);
  await put("routines", { ...r, progress_notes: `${r.progress_notes}\n[${stamp}] ${note.trim()}`.trim().slice(-4000) });
}

// ---------- notifications ----------

export async function listNotifications(limit = 20): Promise<AppNotification[]> {
  return (await all<AppNotification>("notifications")).sort((a, b) => b.created_at - a.created_at).slice(0, limit);
}

export async function addNotification(title: string, body: string, url: string | null) {
  const n: AppNotification = { id: uid(), title, body, url, read: false, created_at: Date.now() };
  await put("notifications", n);
  return n;
}

export async function markNotificationsRead() {
  for (const n of await all<AppNotification>("notifications")) if (!n.read) await put("notifications", { ...n, read: true });
}

/** Wipes everything this app stored in the browser. */
export async function eraseAll() {
  for (const s of STORES) await wrap((await tx(s, "readwrite")).clear());
  try {
    localStorage.removeItem("ftai-settings");
    localStorage.removeItem("ftai-key");
    sessionStorage.removeItem("ftai-key");
  } catch {}
  changed("all");
}
