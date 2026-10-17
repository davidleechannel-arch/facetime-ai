import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { streamReply } from "../lib/gemini";
import * as store from "../lib/store";
import type { Attachment, Message, UserSettings } from "../lib/types";
import { CloseIcon, FileIcon, PaperclipIcon, PhoneIcon, ScreenIcon, SendIcon, VideoIcon } from "./Icons";
import { Orb } from "./Orb";

type Props = {
  conversationId: string | null;
  routineId: string | null;
  prefill: string;
  settings: UserSettings;
};

const Link = (p: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...p} />;

/** Shows a locally stored attachment through an object URL. */
function FileView({ a }: { a: Attachment }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    store.getFile(a.id).then((f) => {
      if (f) {
        u = URL.createObjectURL(f.blob);
        setUrl(u);
      }
    });
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [a.id]);
  if (a.mime.startsWith("image/"))
    return url ? (
      <a href={url} target="_blank" rel="noreferrer">
        <img className="att-img" src={url} alt={a.name} />
      </a>
    ) : (
      <span className="att-file">{a.name}</span>
    );
  return (
    <a className="att-file" href={url || undefined} download={a.name}>
      <FileIcon /> {a.name}
    </a>
  );
}

type Item = { kind: "message"; message: Message } | { kind: "tool"; id: string; summary: string };

const MODE_LABEL: Record<string, string> = { voice: "Voice call", video: "Video call", screen: "Screen share" };
const MAX_FILE = store.MAX_FILE;

function MessageBubble({ m }: { m: Message }) {
  const mine = m.role === "user";
  return (
    <div className={`msg ${mine ? "msg-user" : "msg-model"}`}>
      {!mine && <span className="msg-mini-orb" aria-hidden />}
      <div className="bubble">
        {m.mode !== "text" && (
          <div className="mode-tag">
            {m.mode === "video" ? <VideoIcon width={13} height={13} /> : m.mode === "screen" ? <ScreenIcon width={13} height={13} /> : <PhoneIcon width={13} height={13} />}
            {MODE_LABEL[m.mode]}
          </div>
        )}
        {m.attachments.length > 0 && (
          <div className="att-row">
            {m.attachments.map((a) => (
              <FileView key={a.id} a={a} />
            ))}
          </div>
        )}
        {m.content &&
          (mine ? (
            <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{ a: ({ node: _n, ...p }) => <a {...p} target="_blank" rel="noreferrer noopener" /> }}
            >
              {m.content}
            </ReactMarkdown>
          ))}
      </div>
    </div>
  );
}

export function ChatView({ conversationId: initialId, routineId, prefill, settings }: Props) {
  const assistantName = settings.assistantName;
  const userName = settings.userName;
  const hasApiKey = !!store.getApiKey();
  const [conversationId, setConversationId] = useState(initialId);
  const [title, setTitle] = useState(initialId ? "" : "New conversation");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(!!initialId);
  const [text, setText] = useState(prefill);
  const [files, setFiles] = useState<File[]>([]);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; canRetry: boolean } | null>(null);
  const [drag, setDrag] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const kickedOff = useRef(false);

  useEffect(() => {
    if (!initialId) return;
    Promise.all([store.getConversation(initialId), store.listMessages(initialId)])
      .then(([c, msgs]) => {
        if (!c) throw new Error("That conversation was deleted.");
        setTitle(c.title);
        setItems(msgs.filter((m) => m.role !== "system").map((message) => ({ kind: "message", message })));
      })
      .catch((e) => setError({ text: e.message, canRetry: false }))
      .finally(() => setLoading(false));
  }, [initialId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: streaming ? "auto" : "smooth" });
  }, [items, streaming]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(200, el.scrollHeight) + "px";
  }, [text]);

  const addFiles = useCallback((list: FileList | File[]) => {
    const incoming = Array.from(list);
    const tooBig = incoming.find((f) => f.size > MAX_FILE);
    if (tooBig) setError({ text: `${tooBig.name} is larger than 15 MB.`, canRetry: false });
    setFiles((prev) => [...prev, ...incoming.filter((f) => f.size <= MAX_FILE)].slice(0, 8));
  }, []);

  const send = useCallback(
    async (opts: { text?: string; regenerate?: boolean } = {}) => {
      const body = (opts.text ?? text).trim();
      if (busy || (!opts.regenerate && !body && !files.length)) return;
      setBusy(true);
      setError(null);
      const sentFiles = files;
      let cid = conversationId;
      try {
        const routine = routineId ? ((await store.getRoutine(routineId)) ?? null) : null;
        if (!opts.regenerate) {
          if (!cid) {
            const c = await store.createConversation(routine ? routine.title : body ? body.replace(/\s+/g, " ").slice(0, 60) + (body.length > 60 ? "…" : "") : "New conversation");
            cid = c.id;
            setConversationId(cid);
            setTitle(c.title);
            history.replaceState(null, "", `#/chat/${cid}`);
          }
          const atts: Attachment[] = [];
          for (const f of sentFiles) atts.push(await store.saveFile(f));
          const userMsg = await store.addMessage(cid, "user", body, "text", atts);
          setItems((p) => [...p, { kind: "message", message: userMsg }]);
          setText("");
          setFiles([]);
        }
        setStreaming("");
        let acc = "";
        const reply = await streamReply(cid!, routine, {
          delta: (t) => {
            acc += t;
            setStreaming(acc);
          },
          tool: (summary) => setItems((p) => [...p, { kind: "tool", id: crypto.randomUUID(), summary }]),
        });
        const saved = await store.addMessage(cid!, "model", reply, "text");
        setItems((p) => [...p, { kind: "message", message: saved }]);
      } catch (err) {
        const e = err as Error & { code?: string; partial?: string };
        if (e.partial?.trim() && cid) {
          const m = await store.addMessage(cid, "model", e.partial + "\n\n_(Response interrupted.)_", "text");
          setItems((p) => [...p, { kind: "message", message: m }]);
        }
        setError({ text: e.message, canRetry: !!cid && !["missing_api_key", "bad_api_key", "referrer"].includes(e.code || "") });
      } finally {
        setStreaming(null);
        setBusy(false);
        inputRef.current?.focus();
      }
    },
    [busy, conversationId, files, routineId, text],
  );

  // A routine set to "text" opens here and starts the session automatically.
  useEffect(() => {
    if (routineId && !initialId && !kickedOff.current && hasApiKey) {
      kickedOff.current = true;
      void send({ text: "I'm ready for this session." });
    }
  }, [routineId, initialId, hasApiKey, send]);

  const callHref = (mode: string) => `#/call/${mode}${conversationId ? `?c=${conversationId}` : ""}`;

  return (
    <div className="chat">
      <header className="chat-head">
        <h1>{title || " "}</h1>
        <div className="call-pills" aria-label="Continue this conversation on a call">
          <Link className="btn btn-sm" href={callHref("voice")} title="Continue on a voice call">
            <PhoneIcon width={16} height={16} /> <span className="hide-sm">Call</span>
          </Link>
          <Link className="btn btn-sm" href={callHref("video")} title="Continue on a video call">
            <VideoIcon width={16} height={16} />
          </Link>
          <Link className="btn btn-sm" href={callHref("screen")} title="Share your screen">
            <ScreenIcon width={16} height={16} />
          </Link>
        </div>
      </header>

      <div className="messages" ref={scrollRef} aria-live="polite">
        <div className="messages-inner">
          {!loading && items.length === 0 && streaming === null && (
            <div className="chat-empty">
              <Orb className="hero-orb" state="idle" />
              <h2>What&apos;s on your mind, {userName}?</h2>
              <p className="hint">
                Ask anything, attach a photo or document, or set up a routine. You can switch to a call any time and {assistantName} keeps the context.
              </p>
              {!hasApiKey && (
                <div className="banner">
                  Add your Gemini API key in <a href="#/settings">Settings</a> to start chatting.
                </div>
              )}
            </div>
          )}
          {items.map((it) =>
            it.kind === "message" ? <MessageBubble key={it.message.id} m={it.message} /> : <div key={it.id} className="tool-chip">{it.summary}</div>,
          )}
          {streaming !== null && (
            <div className="msg msg-model">
              <span className="msg-mini-orb" aria-hidden />
              <div className="bubble">
                {streaming ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{streaming}</ReactMarkdown>
                ) : (
                  <span className="typing" aria-label={`${assistantName} is typing`}>
                    <span />
                    <span />
                    <span />
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="composer-wrap">
        {error && (
          <div className="banner chat-error" role="alert" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ flex: 1 }}>{error.text}</span>
            {error.canRetry && (
              <button className="btn btn-sm" onClick={() => send({ regenerate: true })}>
                Try again
              </button>
            )}
            <button className="btn btn-ghost icon-btn" style={{ width: 28, height: 28 }} onClick={() => setError(null)} aria-label="Dismiss">
              <CloseIcon width={16} height={16} />
            </button>
          </div>
        )}
        <div
          className="composer"
          data-drag={drag}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
          }}
        >
          {files.length > 0 && (
            <div className="pending-files">
              {files.map((f, i) => (
                <span className="pending" key={`${f.name}-${i}`}>
                  {f.type.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={URL.createObjectURL(f)} alt="" />
                  ) : (
                    <FileIcon />
                  )}
                  {f.name.length > 28 ? f.name.slice(0, 26) + "…" : f.name}
                  <button onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            placeholder={`Message ${assistantName}`}
            aria-label={`Message ${assistantName}`}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              if (e.clipboardData.files.length) {
                e.preventDefault();
                addFiles(e.clipboardData.files);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            autoFocus
          />
          <div className="composer-row">
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              accept="image/*,application/pdf,text/*,audio/*,video/*,.md,.json,.csv,.ts,.tsx,.js,.py"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button className="btn btn-ghost icon-btn" onClick={() => fileRef.current?.click()} aria-label="Attach files" title="Attach images or files">
              <PaperclipIcon />
            </button>
            <span className="spacer" />
            <button
              className="btn btn-primary icon-btn"
              onClick={() => send()}
              disabled={busy || (!text.trim() && !files.length)}
              aria-label="Send message"
            >
              <SendIcon />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
