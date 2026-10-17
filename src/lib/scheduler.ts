// Routine scheduler that runs while the app is open in any tab.
import { describeSchedule, nextRun } from "./schedule";
import * as store from "./store";
import type { Routine } from "./types";

const TICK_MS = 15_000;
const LATE_LIMIT_MS = 2 * 60 * 60 * 1000;

export function routineUrl(r: Routine) {
  return r.call_mode === "text" ? `#/chat?routine=${r.id}` : `#/call/${r.call_mode}?routine=${r.id}`;
}

function message(r: Routine, name: string, assistant: string) {
  const who = name || "there";
  if (r.kind === "lesson") return { title: `${r.title} is ready`, body: `Hi ${who}, ${assistant} here. Ready for today's ${r.topic || r.title} session? Tap to start.` };
  if (r.kind === "checkin") return { title: `Check-in: ${r.title}`, body: `How's it going, ${who}? Tap to catch up with ${assistant}.` };
  return { title: r.title, body: r.topic ? `Reminder: ${r.topic}` : `Reminder from ${assistant}.` };
}

export async function showSystemNotification(title: string, body: string, url: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") return false;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, { body, icon: "icon.svg", tag: url, data: { url }, requireInteraction: true });
      return true;
    }
    const n = new Notification(title, { body, icon: "icon.svg" });
    n.onclick = () => {
      window.focus();
      location.hash = url.replace(/^#/, "");
    };
    return true;
  } catch {
    return false;
  }
}

let running = false;

export async function tick() {
  if (running) return;
  running = true;
  try {
    const now = Date.now();
    const s = store.getSettings();
    for (const r of await store.listRoutines()) {
      if (!r.active || r.next_run_at == null || r.next_run_at > now) continue;
      const late = now - r.next_run_at > LATE_LIMIT_MS;
      const next = nextRun(r.schedule, r.timezone, now);
      await store.updateRoutine(r.id, { last_run_at: now, next_run_at: next, active: next !== null });
      const url = routineUrl(r);
      if (late) {
        await store.addNotification(`Missed: ${r.title}`, `This was due ${new Date(r.next_run_at).toLocaleString()} while the app was closed. Tap to start it now.`, url);
        continue;
      }
      const m = message(r, s.userName, s.assistantName);
      await store.addNotification(m.title, m.body, url);
      const shown = await showSystemNotification(m.title, m.body, url);
      window.dispatchEvent(new CustomEvent("ftai:routine-due", { detail: { title: m.title, body: m.body, url, shown } }));
    }
  } finally {
    running = false;
  }
}

/** Starts one scheduler per tab; ticks immediately so missed routines surface on open. */
export function startScheduler() {
  void tick();
  const t = setInterval(() => void tick(), TICK_MS);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && void tick());
  return () => clearInterval(t);
}

export async function enableNotifications(): Promise<"granted" | "denied" | "unsupported"> {
  if (!("Notification" in window)) return "unsupported";
  const p = await Notification.requestPermission();
  if (p !== "granted") return "denied";
  try {
    await navigator.serviceWorker?.register("sw.js");
  } catch {}
  return "granted";
}

// ---------- calendar export (reminders that work when the browser is closed) ----------

const ICS_DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

export function routineToIcs(r: Routine, appUrl: string): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const first = r.next_run_at ?? Date.now();
  // Local wall-clock start in the routine's zone, tagged with TZID.
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: r.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(first));
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  const local = `${g("year")}${g("month")}${g("day")}T${g("hour")}${g("minute")}00`;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const rrule = r.schedule.type === "daily" ? "RRULE:FREQ=DAILY" : r.schedule.type === "weekly" ? `RRULE:FREQ=WEEKLY;BYDAY=${r.schedule.days.map((d) => ICS_DAYS[d]).join(",")}` : "";
  const esc = (t: string) => t.replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  const desc = `${describeSchedule(r.schedule)}. Open FaceTime AI to start: ${appUrl}${routineUrl(r)}`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FaceTime AI//Routines//EN",
    "BEGIN:VEVENT",
    `UID:${r.id}@facetime-ai`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=${r.timezone}:${local}`,
    `DURATION:PT20M`,
    ...(rrule ? [rrule] : []),
    `SUMMARY:${esc(r.title)}`,
    `DESCRIPTION:${esc(desc)}`,
    `URL:${appUrl}${routineUrl(r)}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(r.title)}`,
    "TRIGGER:PT0M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadIcs(r: Routine) {
  const appUrl = location.href.split("#")[0];
  const blob = new Blob([routineToIcs(r, appUrl)], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${r.title.replace(/[^\w-]+/g, "-").toLowerCase() || "routine"}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
