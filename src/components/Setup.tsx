import { useState } from "react";
import { verifyKey } from "../lib/gemini";
import { getSettings, saveSettings, setApiKey } from "../lib/store";
import { Orb } from "./Orb";

export function browserSupport() {
  const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
  return {
    secure: window.isSecureContext,
    mic: !!md?.getUserMedia,
    camera: !!md?.getUserMedia,
    screen: !!md?.getDisplayMedia,
    notifications: "Notification" in window,
    audio: typeof AudioWorkletNode !== "undefined",
  };
}

export function Setup() {
  const current = getSettings();
  const [name, setName] = useState(current.userName);
  const [key, setKey] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const support = browserSupport();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Enter the name you'd like to be called.");
    if (!key.trim()) return setError("Paste your Gemini API key.");
    setBusy(true);
    try {
      await verifyKey(key, current.textModel);
      saveSettings({ userName: name.trim().slice(0, 40) });
      setApiKey(key, remember);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const unsupported = [
    !support.secure && "This page isn't on HTTPS, so the browser blocks the camera and microphone.",
    !support.mic && "This browser can't use the microphone, so calls won't work here.",
    !support.screen && "Screen sharing isn't supported in this browser (common on phones). Calls and chat still work.",
  ].filter(Boolean) as string[];

  return (
    <main className="auth">
      <div className="auth-art">
        <div style={{ width: "100%", display: "grid", justifyItems: "center" }}>
          <Orb className="hero-orb" state="idle" label="FaceTime AI" />
          <p>Call it, show it what you&apos;re looking at, share your screen, or send a message. It remembers what matters to you.</p>
        </div>
      </div>
      <div className="auth-form">
        <form onSubmit={submit} noValidate>
          <div>
            <h1>Set up FaceTime AI</h1>
            <p className="hint" style={{ margin: 0 }}>
              Two things and you&apos;re in. Everything stays in this browser.
            </p>
          </div>
          <div className="field">
            <label htmlFor="name">Your name</label>
            <input className="input" id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
          </div>
          <div className="field">
            <label htmlFor="key">Gemini API key</label>
            <input className="input" id="key" type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} placeholder="AIza…" />
            <span className="hint">
              Get a free key at{" "}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                aistudio.google.com/apikey
              </a>
              . It&apos;s sent only to Google, never to us or anyone else.
            </span>
          </div>
          <label className="toggle-row" style={{ justifyContent: "flex-start", gap: 10, fontSize: 14 }}>
            <input type="checkbox" className="switch-input" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember the key on this device
          </label>
          {error && (
            <p className="error-text" role="alert" style={{ margin: 0 }}>
              {error}
            </p>
          )}
          <button className="btn btn-primary" disabled={busy} style={{ padding: "11px 16px" }}>
            {busy ? "Checking your key…" : "Start"}
          </button>
          {unsupported.length > 0 && (
            <div className="banner" style={{ display: "grid", gap: 4 }}>
              {unsupported.map((u) => (
                <span key={u}>{u}</span>
              ))}
            </div>
          )}
        </form>
      </div>
    </main>
  );
}
