import { useCallback, useEffect, useState } from "react";
import type { Route } from "../App";
import { listConversations, onChanged } from "../lib/store";
import type { Conversation, UserSettings } from "../lib/types";
import { GearIcon, HomeIcon, MenuIcon, PlusIcon } from "./Icons";

export function AppShell({ settings, route, children }: { settings: UserSettings; route: Route; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const active = route.page === "chat" ? route.id : null;

  const load = useCallback(() => {
    listConversations().then(setConversations).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    return onChanged((w) => (w === "conversations" || w === "all") && load());
  }, [load]);

  useEffect(() => setOpen(false), [route]);

  return (
    <div className="shell">
      <aside className="sidebar" data-open={open} aria-label="Navigation">
        <a href="#/" className="brand">
          <span className="brand-dot" aria-hidden />
          FaceTime AI
        </a>
        <a href="#/chat" className="btn btn-primary" style={{ justifyContent: "flex-start" }}>
          <PlusIcon /> New conversation
        </a>
        <nav className="nav">
          <a href="#/" aria-current={route.page === "home" ? "page" : undefined}>
            <HomeIcon /> Home
          </a>
          <a href="#/settings" aria-current={route.page === "settings" ? "page" : undefined}>
            <GearIcon /> Settings &amp; memory
          </a>
        </nav>
        <div className="side-heading">Conversations</div>
        <div className="convo-list">
          {conversations.length === 0 && (
            <p className="empty" style={{ padding: "0 10px" }}>
              Your chats and calls will show up here.
            </p>
          )}
          {conversations.map((c) => (
            <a key={c.id} href={`#/chat/${c.id}`} className="convo-item" aria-current={active === c.id ? "page" : undefined} title={c.title}>
              {c.title}
            </a>
          ))}
        </div>
        <a className="side-foot" href="#/settings" style={{ textDecoration: "none" }}>
          <span className="avatar">{(settings.userName || "?").slice(0, 1).toUpperCase()}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{settings.userName}</div>
            <div className="hint">Talking with {settings.assistantName}</div>
          </div>
        </a>
      </aside>
      <div className="scrim" data-open={open} onClick={() => setOpen(false)} />
      <div className="main">
        <header className="topbar">
          <button className="btn btn-ghost icon-btn" onClick={() => setOpen(true)} aria-label="Open navigation">
            <MenuIcon />
          </button>
          <a href="#/" className="brand" style={{ fontSize: 16 }}>
            <span className="brand-dot" aria-hidden />
            FaceTime AI
          </a>
        </header>
        {children}
      </div>
    </div>
  );
}
