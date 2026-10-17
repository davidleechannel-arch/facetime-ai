# FaceTime AI (browser app)

_The new era of AI is now here._

A real-time AI companion that runs entirely in your browser: **video call**, **voice call**, **share your screen**, or **message** it. Powered by Google Gemini and the Gemini Live API. No install, no server.

**Live app:** https://davidleechannel-arch.github.io/facetime-ai/

## Using it
1. Open the link in Chrome, Edge or Safari (desktop or phone).
2. Enter your name and your Gemini API key (free at <https://aistudio.google.com/apikey>).
3. Pick a mode. The browser asks for microphone/camera/screen permission when a call starts.

## How the key is protected
- The key is never in this code or repository. You paste it into the app, and it's stored only in your browser (or only for the current tab, if you untick "Remember").
- It's sent only to Google's Gemini API, directly from your browser. There is no other server.
- Recommended: in Google Cloud Console → APIs & Services → Credentials, restrict the key to **Website** `https://davidleechannel-arch.github.io/*`, so it's useless anywhere else even if copied.

## What works
| Feature | Notes |
|---|---|
| Voice calls | Gemini Live native audio, hands-free, interrupt any time, automatic language switching, 8 voices, captions |
| Video calls | ~1 camera frame/second to Gemini, front/back camera switch, camera on/off mid-call |
| Screen sharing | Share a screen/window/tab with spoken guidance and a visible "can see your screen" indicator |
| Text chat | Streaming replies, markdown, image/PDF/text/audio/video attachments, saved history |
| One conversation across modes | Call transcripts land in the same conversation; calls started from a chat continue it |
| Memory | The AI saves facts you share; view, add, delete or switch off in Settings |
| Routines & tutoring | "Teach me Korean every morning at 8" creates a daily voice lesson that logs progress for the next one |
| Reminders | Notifications while the app is open in a tab (even in the background); missed routines show on return; "Add to calendar" for alarms when the browser is closed |
| Personalization | Companion name, voice, style, humor, answer length, language, theme, models |

## Browser support
| | Chrome / Edge (desktop) | Safari (Mac) | Chrome (Android) | Safari (iPhone/iPad) |
|---|---|---|---|---|
| Chat | ✅ | ✅ | ✅ | ✅ |
| Voice & video calls | ✅ | ✅ | ✅ | ✅ |
| Screen sharing | ✅ | ✅ | ❌ browser limit | ❌ browser limit |
| Notifications | ✅ | ✅ | ✅ | ✅ after Add to Home Screen |

The app detects these limits and says so instead of showing buttons that can't work.

## Known limitations
- Data lives in one browser; it doesn't sync between devices yet.
- Reminders need the app open in a tab; closed-browser alerts come from the calendar export.
- Gemini limits a single Live connection (about 2 min with video, 15 min audio); the app resumes the session automatically, so you may see "Reconnecting…" briefly.
- Not built yet: facial recognition, AI-initiated phone calls, calendar/email integrations, AI computer control. See ROADMAP.md.

## Development
```bash
npm install
npm run dev        # local dev server
npm test           # time-zone/schedule tests
npm run build      # static site in dist/
```
`deploy.sh` builds and publishes `dist/` to the `gh-pages` branch.
