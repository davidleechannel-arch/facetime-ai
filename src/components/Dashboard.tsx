import { useEffect, useMemo, useState } from "react";
import { enableNotifications, routineUrl } from "../lib/scheduler";
import { describeSchedule } from "../lib/schedule";
import * as store from "../lib/store";
import type { AppNotification, Conversation, Memory, Routine, UserSettings } from "../lib/types";
import { browserSupport } from "./Setup";
import { ChatIcon, PhoneIcon, ScreenIcon, VideoIcon } from "./Icons";
import { Orb } from "./Orb";


const Link = (p: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...p} />;

const IDEAS = [
  "Teach me Korean every morning at 8 AM",
  "Check in with me every Friday evening about my goals",
  "Quiz me on Spanish vocabulary every afternoon at 4",
  "Help me plan my week",
];

function partOfDay(tz: string) {
  const h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(new Date()));
  return h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function whenParts(ts: number, tz: string) {
  const d = new Date(ts);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }).replace(/\s?[AP]M/, "");
  const ampm = d.toLocaleTimeString("en-US", { hour: "numeric", timeZone: tz }).slice(-2);
  const day = d.toLocaleDateString("en-US", { weekday: "short", timeZone: tz });
  const today = new Date().toLocaleDateString("en-US", { weekday: "short", timeZone: tz });
  return { time, sub: day === today ? ampm : `${day} ${ampm}` };
}

export function Dashboard({ settings }: { settings: UserSettings }) {
  const user = { name: settings.userName, settings };
  const tz = settings.timezone;
  const [greeting, setGreeting] = useState("Hello");
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [notes, setNotes] = useState<AppNotification[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [push, setPush] = useState<string>(() => ("Notification" in window ? Notification.permission : "unsupported"));
  const [pushMsg, setPushMsg] = useState("");
  const support = browserSupport();
  const memoryCount = memories.length;

  useEffect(() => setGreeting(partOfDay(tz)), [tz]);

  useEffect(() => {
    const load = () => {
      store.listRoutines().then((r) => setRoutines(r.filter((x) => x.active)));
      store.listNotifications(6).then(setNotes);
      store.listConversations().then((c) => setConversations(c.slice(0, 5)));
      store.listMemories().then(setMemories);
    };
    load();
    return store.onChanged(load);
  }, []);

  useEffect(() => {
    if (notes.some((n) => !n.read)) {
      const t = setTimeout(() => void store.markNotificationsRead(), 5000);
      return () => clearTimeout(t);
    }
  }, [notes]);

  const upcoming = useMemo(() => [...routines].filter((r) => r.next_run_at).sort((a, b) => a.next_run_at! - b.next_run_at!).slice(0, 4), [routines]);
  const next = upcoming[0];
  const subline = next
    ? `${next.title} is up next, ${describeSchedule(next.schedule).replace(/^\w/, (c) => c.toLowerCase())}.`
    : "Call me, show me something, share your screen, or send a message.";

  async function turnOnPush() {
    setPushMsg("");
    const r = await enableNotifications();
    setPush(r);
    if (r === "denied") setPushMsg("Notifications are blocked. Allow them from your browser's site settings.");
    if (r === "unsupported") setPushMsg("This browser doesn't support notifications. On iPhone, add this page to your Home Screen first.");
  }

  return (
    <div className="home">
      <section className="hero" aria-labelledby="greet">
        {(!support.mic || !support.screen) && (
          <div className="banner" role="status" style={{ textAlign: "left", width: "100%", maxWidth: 640, marginBottom: 12 }}>
            {!support.mic
              ? "This browser can't use the microphone, so calls are unavailable here. Chat still works."
              : "Screen sharing isn't supported in this browser. Video, voice and chat work normally."}
          </div>
        )}
        <Orb className="hero-orb" state="idle" label={`${user.settings.assistantName} is ready`} />
        <h1 className="greeting" id="greet">
          {greeting}, {user.name}
        </h1>
        <p className="subgreeting">{subline}</p>

        <nav className="modes" aria-label="Start a conversation">
          <Link className="mode" data-kind="video" href="#/call/video">
            <span className="mode-disc">
              <VideoIcon />
            </span>
            Video call
            <small>Show me things</small>
          </Link>
          <Link className="mode" data-kind="voice" href="#/call/voice">
            <span className="mode-disc">
              <PhoneIcon />
            </span>
            Voice call
            <small>Just talk</small>
          </Link>
          <Link className="mode" href="#/call/screen">
            <span className="mode-disc">
              <ScreenIcon />
            </span>
            Share screen
            <small>Work through it</small>
          </Link>
          <Link className="mode" href="#/chat">
            <span className="mode-disc">
              <ChatIcon />
            </span>
            Message
            <small>Text &amp; files</small>
          </Link>
        </nav>
      </section>

      <aside className="rail" aria-label="Your day">
        {push !== "granted" && push !== "unsupported" && support.notifications && (
          <div className="panel">
            <h2>Get routine alerts</h2>
            <p className="hint" style={{ marginTop: -6 }}>
              Allow notifications so {user.settings.assistantName} can alert you for lessons and reminders while this app is open in a tab. For alerts when it's closed, add a routine to your calendar from Settings.
            </p>
            <button className="btn btn-primary btn-sm" onClick={turnOnPush}>
              Turn on notifications
            </button>
            {pushMsg && <p className="error-text">{pushMsg}</p>}
          </div>
        )}

        <div className="panel">
          <h2>
            Coming up <Link href="#/settings/routines">Manage</Link>
          </h2>
          {upcoming.length ? (
            <ul className="list">
              {upcoming.map((r) => {
                const w = whenParts(r.next_run_at!, tz);
                return (
                  <li key={r.id}>
                    <Link className="list-item" href={routineUrl(r)}>
                      <span className="when">
                        {w.time}
                        <small>{w.sub}</small>
                      </span>
                      <span>
                        <div className="title">{r.title}</div>
                        <div className="meta">{describeSchedule(r.schedule)}</div>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="empty">No routines yet. Try asking for one below, by text or out loud on a call.</p>
          )}
        </div>

        {notes.length > 0 && (
          <div className="panel">
            <h2>Notifications</h2>
            <ul className="list">
              {notes.map((n) => (
                <li key={n.id}>
                  <Link className="list-item" href={n.url || "#/"}>
                    {!n.read && <span className="dot-unread" aria-label="New" />}
                    <span>
                      <div className="title">{n.title}</div>
                      <div className="meta">{n.body}</div>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {conversations.length > 0 && (
          <div className="panel">
            <h2>Pick up where you left off</h2>
            <ul className="list">
              {conversations.map((c) => (
                <li key={c.id}>
                  <Link className="list-item" href={`#/chat/${c.id}`}>
                    <span style={{ minWidth: 0 }}>
                      <div className="title" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {c.title}
                      </div>
                      {c.preview && (
                        <div className="meta" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {c.preview}
                        </div>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="panel">
          <h2>Try asking</h2>
          <ul className="list">
            {IDEAS.map((idea) => (
              <li key={idea}>
                <Link className="list-item" href={`#/chat?q=${encodeURIComponent(idea)}`}>
                  <span className="title">{idea}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="hint" style={{ marginBottom: 0 }}>
            {memoryCount
              ? `${user.settings.assistantName} remembers ${memoryCount} thing${memoryCount === 1 ? "" : "s"} about you. `
              : ""}
            <Link href="#/settings/memory">Review memory</Link>
          </p>
        </div>
      </aside>
    </div>
  );
}
