import { useEffect, useRef, useState } from "react";
import { verifyKey } from "../lib/gemini";
import { describeSchedule } from "../lib/schedule";
import { downloadIcs, enableNotifications, showSystemNotification } from "../lib/scheduler";
import * as store from "../lib/store";
import { VOICES, type Memory, type Routine, type Schedule, type UserSettings } from "../lib/types";
import { TrashIcon } from "./Icons";

type Props = { settings: UserSettings; section: string | null };

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function Select<T extends string>({ id, label, value, options, onChange }: { id: string; label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SettingsView({ settings, section }: Props) {
  const user = { name: settings.userName, settings };
  const initialMemories: Memory[] = [];
  const initialRoutines: Routine[] = [];
  const [name, setName] = useState(user.name);
  const [s, setS] = useState(user.settings);
  const [newKey, setNewKey] = useState("");
  const [remember, setRemember] = useState(store.keyIsRemembered());
  const [keyMsg, setKeyMsg] = useState("");
  const [confirmErase, setConfirmErase] = useState(false);
  const [saved, setSaved] = useState("");
  const [err, setErr] = useState("");
  const [memories, setMemories] = useState(initialMemories);
  const [newMemory, setNewMemory] = useState("");
  const [routines, setRoutines] = useState(initialRoutines);
  const [push, setPush] = useState("default");
  const [pushMsg, setPushMsg] = useState("");
  const [timezones, setTimezones] = useState<string[]>([user.settings.timezone]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const load = () => {
      store.listMemories().then(setMemories);
      store.listRoutines().then(setRoutines);
    };
    load();
    if (section) setTimeout(() => document.getElementById(section)?.scrollIntoView({ behavior: "smooth" }), 50);
    setPush("Notification" in window ? Notification.permission : "unsupported");
    const off = store.onChanged((w) => (w === "memories" || w === "routines") && load());
    try {
      setTimezones(Intl.supportedValuesOf("timeZone"));
    } catch {}
    return off;
  }, [section]);

  function save(patch: { name?: string; settings?: Partial<UserSettings> }) {
    const next: Partial<UserSettings> = { ...(patch.settings || {}) };
    if (patch.name !== undefined) next.userName = patch.name.slice(0, 40);
    setS((prev) => ({ ...prev, ...next }));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      store.saveSettings(next);
      setSaved("Saved");
      setTimeout(() => setSaved(""), 1600);
    }, 300);
  }

  async function changeKey(e: React.FormEvent) {
    e.preventDefault();
    setKeyMsg("Checking…");
    try {
      await verifyKey(newKey, s.textModel);
      store.setApiKey(newKey, remember);
      setNewKey("");
      setKeyMsg("Key saved and working.");
    } catch (er) {
      setKeyMsg((er as Error).message);
    }
  }

  async function erase() {
    await store.eraseAll();
    location.hash = "#/";
  }

  async function addMemory(e: React.FormEvent) {
    e.preventDefault();
    if (!newMemory.trim()) return;
    try {
      const memory = await store.addMemory(newMemory, "you");
      setMemories((m) => [memory, ...m.filter((x) => x.id !== memory.id)]);
      setNewMemory("");
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function removeMemory(id: string) {
    await store.deleteMemory(id).catch((e) => setErr(e.message));
    setMemories((m) => m.filter((x) => x.id !== id));
  }

  async function toggleRoutine(r: Routine) {
    try {
      const routine = await store.updateRoutine(r.id, { active: !r.active });
      setRoutines((list) => list.map((x) => (x.id === r.id ? routine : x)));
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function removeRoutine(id: string) {
    await store.deleteRoutine(id).catch((e) => setErr(e.message));
    setRoutines((list) => list.filter((x) => x.id !== id));
  }

  async function createRoutine(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const f = new FormData(formEl);
    const type = String(f.get("type"));
    const time = String(f.get("time"));
    const days = f.getAll("days").map(Number);
    const schedule = type === "weekly" ? { type, time, days } : type === "once" ? { type, at: `${f.get("date")}T${time}` } : { type: "daily", time };
    try {
      const routine = await store.createRoutine({
        title: String(f.get("title")),
        kind: f.get("kind") as Routine["kind"],
        topic: String(f.get("topic") || "") || null,
        call_mode: f.get("call_mode") as Routine["call_mode"],
        schedule: schedule as Schedule,
        timezone: s.timezone,
      });
      setRoutines((list) => [...list, routine]);
      formEl.reset();
      setErr("");
    } catch (er) {
      setErr((er as Error).message);
    }
  }

  async function turnOnPush() {
    setPushMsg("");
    const r = await enableNotifications();
    setPush(r);
    if (r === "denied") setPushMsg("Notifications are blocked for this site. Allow them in your browser's site settings.");
    if (r === "unsupported") setPushMsg("This browser doesn't support notifications. On iPhone, add this page to your Home Screen first.");
  }

  async function testPush() {
    const ok = await showSystemNotification(`${s.assistantName} says hi`, "Notifications are working on this device.", "#/");
    setPushMsg(ok ? "Test notification sent." : "The browser didn't show it. Check its notification settings.");
  }

  const [routineType, setRoutineType] = useState("daily");

  return (
    <div className="settings">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h1>Settings</h1>
        <span className="saved-note" aria-live="polite">
          {saved}
        </span>
      </div>
      {err && (
        <div className="banner" role="alert">
          {err}
        </div>
      )}

      <section aria-labelledby="h-you">
        <h2 id="h-you">You</h2>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="name">Your name</label>
            <input
              id="name"
              className="input"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (e.target.value.trim()) save({ name: e.target.value });
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="tz">Time zone</label>
            <select id="tz" className="input" value={s.timezone} onChange={(e) => save({ settings: { timezone: e.target.value } })}>
              {timezones.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <Select id="theme" label="Appearance" value={s.theme} options={[["system", "Match device"], ["dark", "Dark"], ["light", "Light"]]} onChange={(v) => save({ settings: { theme: v } })} />
        </div>
      </section>

      <section aria-labelledby="h-companion">
        <h2 id="h-companion">Your companion</h2>
        <p>Changes apply to your next message or call.</p>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="aname">Name</label>
            <input id="aname" className="input" value={s.assistantName} maxLength={30} onChange={(e) => save({ settings: { assistantName: e.target.value } })} />
          </div>
          <Select id="voice" label="Voice" value={s.voice} options={VOICES.map((v) => [v.name, `${v.name} · ${v.note}`])} onChange={(v) => save({ settings: { voice: v } })} />
          <Select
            id="style"
            label="Conversation style"
            value={s.style}
            options={[["casual", "Casual"], ["balanced", "Balanced"], ["professional", "Professional"]]}
            onChange={(v) => save({ settings: { style: v } })}
          />
          <Select id="humor" label="Humor" value={s.humor} options={[["none", "None"], ["light", "A little"], ["playful", "Playful"]]} onChange={(v) => save({ settings: { humor: v } })} />
          <Select
            id="length"
            label="Answer length"
            value={s.responseLength}
            options={[["brief", "Brief"], ["normal", "Normal"], ["detailed", "Detailed"]]}
            onChange={(v) => save({ settings: { responseLength: v } })}
          />
          <div className="field">
            <label htmlFor="lang">Preferred language</label>
            <input id="lang" className="input" value={s.language} onChange={(e) => save({ settings: { language: e.target.value } })} />
          </div>
        </div>
      </section>

      <section id="memory" aria-labelledby="h-memory">
        <div className="toggle-row">
          <h2 id="h-memory">Memory</h2>
          <input
            type="checkbox"
            className="switch-input"
            checked={s.memoryEnabled}
            onChange={(e) => save({ settings: { memoryEnabled: e.target.checked } })}
            aria-label="Remember things across conversations"
          />
        </div>
        <p>
          {s.memoryEnabled
            ? `${s.assistantName} saves useful details you share and uses them in every mode. Remove anything you don't want kept.`
            : `Memory is off. ${s.assistantName} won't save new details; existing ones are kept until you delete them.`}
        </p>
        <form className="inline-form" onSubmit={addMemory}>
          <div className="field">
            <label htmlFor="newmem">Add something to remember</label>
            <input id="newmem" className="input" value={newMemory} onChange={(e) => setNewMemory(e.target.value)} placeholder="e.g. I'm learning Korean for a trip in May" />
          </div>
          <button className="btn" disabled={!newMemory.trim()}>
            Add
          </button>
        </form>
        {memories.length ? (
          <ul className="row-list">
            {memories.map((m) => (
              <li key={m.id}>
                <span className="grow">{m.content}</span>
                <span className="hint">{new Date(m.created_at).toLocaleDateString()}</span>
                <button className="btn btn-ghost icon-btn" onClick={() => removeMemory(m.id)} aria-label={`Forget: ${m.content}`} title="Forget">
                  <TrashIcon />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">Nothing saved yet.</p>
        )}
      </section>

      <section id="routines" aria-labelledby="h-routines">
        <h2 id="h-routines">Routines</h2>
        <p>Scheduled lessons, check-ins and reminders. You can also just ask, e.g. &ldquo;teach me Korean every morning at 8.&rdquo;</p>
        {routines.length > 0 && (
          <ul className="row-list">
            {routines.map((r) => (
              <li key={r.id}>
                <span className="grow">
                  <div style={{ fontWeight: 500 }}>{r.title}</div>
                  <div className="hint">
                    {describeSchedule(r.schedule)} · {r.kind}
                    {r.topic ? ` · ${r.topic}` : ""} · opens as {r.call_mode === "text" ? "chat" : `${r.call_mode} call`}
                  </div>
                </span>
                <button className="btn btn-sm" onClick={() => downloadIcs(r)} title="Adds an alarm to your calendar app so you're reminded even when the browser is closed">
                  Add to calendar
                </button>
                <input type="checkbox" className="switch-input" checked={r.active} onChange={() => toggleRoutine(r)} aria-label={`${r.active ? "Pause" : "Resume"} ${r.title}`} />
                <button className="btn btn-ghost icon-btn" onClick={() => removeRoutine(r.id)} aria-label={`Delete ${r.title}`} title="Delete">
                  <TrashIcon />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={createRoutine} style={{ display: "grid", gap: 12 }}>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="r-title">Title</label>
              <input id="r-title" name="title" className="input" required placeholder="Korean practice" />
            </div>
            <div className="field">
              <label htmlFor="r-topic">Topic or note</label>
              <input id="r-topic" name="topic" className="input" placeholder="Beginner conversation" />
            </div>
            <div className="field">
              <label htmlFor="r-kind">Type</label>
              <select id="r-kind" name="kind" className="input" defaultValue="lesson">
                <option value="lesson">Lesson</option>
                <option value="checkin">Check-in</option>
                <option value="reminder">Reminder</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="r-mode">Opens as</label>
              <select id="r-mode" name="call_mode" className="input" defaultValue="voice">
                <option value="voice">Voice call</option>
                <option value="video">Video call</option>
                <option value="text">Chat</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="r-type">Repeats</label>
              <select id="r-type" name="type" className="input" value={routineType} onChange={(e) => setRoutineType(e.target.value)}>
                <option value="daily">Every day</option>
                <option value="weekly">On certain days</option>
                <option value="once">Once</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="r-time">Time</label>
              <input id="r-time" name="time" type="time" className="input" required defaultValue="08:00" />
            </div>
            {routineType === "once" && (
              <div className="field">
                <label htmlFor="r-date">Date</label>
                <input id="r-date" name="date" type="date" className="input" required />
              </div>
            )}
          </div>
          {routineType === "weekly" && (
            <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label" style={{ marginBottom: 6 }}>
                Days
              </legend>
              <div className="day-picks">
                {DAYS.map((d, i) => (
                  <label key={i} title={DAY_NAMES[i]}>
                    <input type="checkbox" name="days" value={i} defaultChecked={i >= 1 && i <= 5} />
                    <span aria-label={DAY_NAMES[i]}>{d}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div>
            <button className="btn btn-primary">Add routine</button>
            <span className="hint" style={{ marginLeft: 10 }}>
              Times use {s.timezone}.
            </span>
          </div>
        </form>
      </section>

      <section aria-labelledby="h-notify">
        <h2 id="h-notify">Notifications</h2>
        <p>
          While FaceTime AI is open in a tab (it can be in the background), routines alert you with a notification. Tap it to start the session.
          Routines that came due while it was closed show up as missed when you return. For alarms with the browser closed, use Add to calendar.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {push === "granted" ? (
            <>
              <span className="saved-note">On for this device</span>
              <button className="btn btn-sm" onClick={testPush}>
                Send a test
              </button>
            </>
          ) : push === "unsupported" ? (
            <span className="hint">This browser doesn&apos;t support notifications. You&apos;ll still see routines inside the app.</span>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={turnOnPush}>
              Turn on notifications
            </button>
          )}
        </div>
        {pushMsg && <p className="hint">{pushMsg}</p>}
      </section>

      <section id="gemini" aria-labelledby="h-gemini">
        <h2 id="h-gemini">Gemini connection</h2>
        <p>
          Your key is stored only in this browser{store.keyIsRemembered() ? "" : " for this tab session"} and is sent only to Google. For extra safety, restrict
          the key to this site in Google Cloud Console (Credentials, then Website restrictions).
        </p>
        <form className="inline-form" onSubmit={changeKey}>
          <div className="field">
            <label htmlFor="newkey">Replace API key</label>
            <input id="newkey" className="input" type="password" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="AIza…" autoComplete="off" />
          </div>
          <button className="btn" disabled={!newKey.trim()}>
            Check and save
          </button>
        </form>
        <label className="toggle-row" style={{ justifyContent: "flex-start", gap: 10, fontSize: 14 }}>
          <input
            type="checkbox"
            className="switch-input"
            checked={remember}
            onChange={(e) => {
              setRemember(e.target.checked);
              const k = store.getApiKey();
              if (k) store.setApiKey(k, e.target.checked);
            }}
          />
          Remember the key on this device
        </label>
        {keyMsg && <p className="hint">{keyMsg}</p>}
        <div className="grid-2">
          <div className="field">
            <label htmlFor="tm">Chat model</label>
            <input id="tm" className="input" value={s.textModel} onChange={(e) => save({ settings: { textModel: e.target.value.trim() } })} />
          </div>
          <div className="field">
            <label htmlFor="lm">Live call model</label>
            <input id="lm" className="input" value={s.liveModel} onChange={(e) => save({ settings: { liveModel: e.target.value.trim() } })} />
          </div>
        </div>
        <div>
          <button
            className="btn btn-sm"
            onClick={() => {
              store.setApiKey("", false);
              location.hash = "#/";
            }}
          >
            Remove key from this browser
          </button>
        </div>
      </section>

      <section aria-labelledby="h-privacy">
        <h2 id="h-privacy">Privacy &amp; data</h2>
        <p>
          Messages, files, call audio and camera or screen frames go directly from this browser to Google&apos;s Gemini API. Nothing passes through any
          other server. Calls aren&apos;t recorded; transcripts, memories and routines are stored only in this browser, so they don&apos;t sync to your
          other devices yet.
        </p>
        {!confirmErase ? (
          <div>
            <button className="btn" onClick={() => setConfirmErase(true)}>
              Erase all data
            </button>
          </div>
        ) : (
          <div className="banner" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ flex: 1 }}>This deletes every conversation, memory, routine and your key from this browser.</span>
            <button className="btn btn-danger btn-sm" onClick={erase}>
              Erase everything
            </button>
            <button className="btn btn-sm" onClick={() => setConfirmErase(false)}>
              Keep my data
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
