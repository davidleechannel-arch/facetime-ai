import { useEffect, useState } from "react";
import { AppShell } from "./components/AppShell";
import { CallView } from "./components/CallView";
import { ChatView } from "./components/ChatView";
import { Dashboard } from "./components/Dashboard";
import { Setup } from "./components/Setup";
import { SettingsView } from "./components/SettingsView";
import { startScheduler } from "./lib/scheduler";
import { getApiKey, getSettings, onChanged } from "./lib/store";
import type { Mode } from "./lib/types";

export type Route =
  | { page: "home" }
  | { page: "chat"; id: string | null; q: string; routine: string | null }
  | { page: "call"; mode: Mode; c: string | null; routine: string | null }
  | { page: "settings"; section: string | null };

export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, "") || "/";
  const [path, query = ""] = raw.split("?");
  const qs = new URLSearchParams(query);
  const seg = path.split("/").filter(Boolean);
  if (seg[0] === "chat") return { page: "chat", id: seg[1] || null, q: qs.get("q") || "", routine: qs.get("routine") };
  if (seg[0] === "call") {
    const m = seg[1];
    return { page: "call", mode: m === "video" || m === "screen" ? m : "voice", c: qs.get("c"), routine: qs.get("routine") };
  }
  if (seg[0] === "settings") return { page: "settings", section: seg[1] || null };
  return { page: "home" };
}

function applyTheme(theme: string) {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

export function App() {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  const [ready, setReady] = useState(() => !!getApiKey() && !!getSettings().userName);
  const [settings, setSettings] = useState(getSettings);
  const [toast, setToast] = useState<{ title: string; body: string; url: string } | null>(null);

  useEffect(() => {
    const onHash = () => setRoute(parseRoute(location.hash));
    window.addEventListener("hashchange", onHash);
    const off = onChanged((what) => {
      if (what === "settings" || what === "key" || what === "all") {
        setSettings(getSettings());
        setReady(!!getApiKey() && !!getSettings().userName);
      }
    });
    return () => {
      window.removeEventListener("hashchange", onHash);
      off();
    };
  }, []);

  useEffect(() => applyTheme(settings.theme), [settings.theme]);

  useEffect(() => {
    if (!ready) return;
    try {
      if ("serviceWorker" in navigator && Notification?.permission === "granted") void navigator.serviceWorker.register("sw.js");
    } catch {}
    const stop = startScheduler();
    const onDue = (e: Event) => {
      const d = (e as CustomEvent).detail;
      setToast(d);
      setTimeout(() => setToast(null), 20_000);
    };
    window.addEventListener("ftai:routine-due", onDue);
    return () => {
      stop();
      window.removeEventListener("ftai:routine-due", onDue);
    };
  }, [ready]);

  if (!ready) return <Setup />;

  const dueToast = toast && (
    <div className="due-toast" role="alert">
      <div style={{ minWidth: 0 }}>
        <strong>{toast.title}</strong>
        <div className="hint">{toast.body}</div>
      </div>
      <a className="btn btn-primary btn-sm" href={toast.url} onClick={() => setToast(null)}>
        Start
      </a>
      <button className="btn btn-ghost btn-sm" onClick={() => setToast(null)}>
        Later
      </button>
    </div>
  );

  if (route.page === "call") {
    return (
      <>
        <CallView key={`${route.mode}-${route.c}-${route.routine}`} mode={route.mode} conversationId={route.c} routineId={route.routine} settings={settings} />
        {dueToast}
      </>
    );
  }

  return (
    <AppShell settings={settings} route={route}>
      {route.page === "home" && <Dashboard settings={settings} />}
      {route.page === "chat" && <ChatView key={route.id || `new-${route.q}-${route.routine}`} conversationId={route.id} routineId={route.routine} prefill={route.q} settings={settings} />}
      {route.page === "settings" && <SettingsView settings={settings} section={route.section} />}
      {dueToast}
    </AppShell>
  );
}
