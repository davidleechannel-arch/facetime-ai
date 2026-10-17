// Types shared by browser and server code.

export type Mode = "text" | "voice" | "video" | "screen";

export type UserSettings = {
  assistantName: string;
  voice: string;
  style: "casual" | "balanced" | "professional";
  humor: "none" | "light" | "playful";
  responseLength: "brief" | "normal" | "detailed";
  language: string; // preferred language, free text e.g. "English", "Korean"
  proactivity: "low" | "normal" | "high";
  memoryEnabled: boolean;
  timezone: string;
  theme: "system" | "dark" | "light";
  userName: string;
  textModel: string;
  liveModel: string;
};

export const DEFAULT_SETTINGS: UserSettings = {
  assistantName: "Nova",
  voice: "Zephyr",
  style: "balanced",
  humor: "light",
  responseLength: "normal",
  language: "English",
  proactivity: "normal",
  memoryEnabled: true,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
  theme: "system",
  userName: "",
  textModel: "gemini-3.8-flash",
  liveModel: "gemini-3.8-live",
};

// Prebuilt Gemini voices that work with native-audio Live models.
export const VOICES: { name: string; note: string }[] = [
  { name: "Zephyr", note: "Bright" },
  { name: "Puck", note: "Upbeat" },
  { name: "Kore", note: "Firm" },
  { name: "Aoede", note: "Breezy" },
  { name: "Leda", note: "Youthful" },
  { name: "Charon", note: "Informative" },
  { name: "Fenrir", note: "Excitable" },
  { name: "Orus", note: "Steady" },
];

export type Attachment = { id: string; name: string; mime: string; size: number };

export type StoredFile = Attachment & { blob: Blob };

export type Message = {
  id: string;
  role: "user" | "model" | "system";
  mode: Mode;
  content: string;
  attachments: Attachment[];
  created_at: number;
};

export type Conversation = { id: string; title: string; created_at: number; updated_at: number; preview?: string };

export type Schedule =
  | { type: "daily"; time: string }
  | { type: "weekly"; time: string; days: number[] } // 0 = Sunday
  | { type: "once"; at: string }; // local ISO date-time "2026-10-20T08:00"

export type Routine = {
  id: string;
  title: string;
  kind: "reminder" | "lesson" | "checkin";
  topic: string | null;
  schedule: Schedule;
  timezone: string;
  call_mode: Mode;
  active: boolean;
  progress_notes: string;
  next_run_at: number | null;
  last_run_at: number | null;
};

export type Memory = { id: string; content: string; source: string; created_at: number };

export type AppNotification = { id: string; title: string; body: string; url: string | null; read: boolean; created_at: number };

