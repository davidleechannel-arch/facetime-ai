import type { Schedule } from "./types";

/** Offset in ms of `tz` from UTC at instant `ts` (positive east of UTC). */
export function tzOffset(ts: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ts));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(ts / 1000) * 1000;
}

/** Converts a wall-clock time in `tz` to a UTC timestamp, DST-aware. */
export function zonedToUtc(y: number, m: number, d: number, hh: number, mm: number, tz: string): number {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let ts = guess - tzOffset(guess, tz);
  const off2 = tzOffset(ts, tz);
  ts = guess - off2;
  return ts;
}

function localDate(ts: number, tz: string) {
  const local = new Date(ts + tzOffset(ts, tz));
  return { y: local.getUTCFullYear(), m: local.getUTCMonth() + 1, d: local.getUTCDate() };
}

function parseTime(time: string): [number, number] {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) throw new Error(`Invalid time "${time}", expected HH:MM`);
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh > 23 || mm > 59) throw new Error(`Invalid time "${time}"`);
  return [hh, mm];
}

export function validTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Next firing time strictly after `after`, or null if the schedule is finished. */
export function nextRun(schedule: Schedule, tz: string, after: number): number | null {
  if (schedule.type === "once") {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(schedule.at);
    if (!match) throw new Error(`Invalid date-time "${schedule.at}"`);
    const t = zonedToUtc(+match[1], +match[2], +match[3], +match[4], +match[5], tz);
    return t > after ? t : null;
  }
  const [hh, mm] = parseTime(schedule.time);
  const start = localDate(after, tz);
  for (let i = 0; i < 9; i++) {
    const day = new Date(Date.UTC(start.y, start.m - 1, start.d + i));
    if (schedule.type === "weekly" && !schedule.days.includes(day.getUTCDay())) continue;
    const t = zonedToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), hh, mm, tz);
    if (t > after) return t;
  }
  return null;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function describeSchedule(s: Schedule): string {
  const fmt = (time: string) => {
    const [hh, mm] = parseTime(time);
    const h12 = hh % 12 || 12;
    return `${h12}:${String(mm).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}`;
  };
  if (s.type === "daily") return `Every day at ${fmt(s.time)}`;
  if (s.type === "weekly") {
    const days = [...s.days].sort();
    const label =
      days.join() === "1,2,3,4,5" ? "Weekdays" : days.join() === "0,6" ? "Weekends" : days.map((d) => DAY_NAMES[d]).join(", ");
    return `${label} at ${fmt(s.time)}`;
  }
  const [date, time] = s.at.split("T");
  return `Once on ${date} at ${fmt(time.slice(0, 5))}`;
}
