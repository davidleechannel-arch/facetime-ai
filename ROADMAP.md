# Roadmap

The goal remains the full companion from the original specification. This file tracks what's built, what's next, and the order that keeps each step shippable.

## Phase 1 — Functional core ✅ (this build)
- Text chat with streaming, markdown, attachments, persistent history
- Voice calls (Gemini Live native audio, barge-in, multilingual, 8 voices)
- Video calls (camera frames, camera switching, on/off mid-call)
- Screen sharing with spoken guidance and a visible sharing indicator
- One conversation across all modes; transcripts saved; switch modes inside a call
- Animated orb avatar, captions, transcript panel, typing during calls
- Accounts, dark/light/mobile UI, graceful errors and reconnection

## Phase 2 — Personal intelligence (foundation ✅, polish next)
Built:
- Long-term memory (tool-driven saving, review/add/delete, on/off)
- Routines: daily/weekly/once, lessons/check-ins/reminders, created by voice or text
- Scheduler + Web Push + in-app notifications; tapping opens the right call or chat
- Lesson progress log fed into the next lesson
- Personality settings

Next:
1. **Semantic memory retrieval** — embed memories and past turns (Gemini embeddings + sqlite-vec or pgvector); retrieve the most relevant ones per turn instead of sending all; memory editing inline.
2. **Learning plans & progress UI** — per-subject levels, vocabulary/skill tracking, streaks, quiz cards rendered in chat, pronunciation feedback summaries after voice lessons.
3. **Adaptive routines** — detect missed sessions and propose a better time (with your approval); proactivity setting controls how often the AI nudges.
4. **Rich chat cards** — task cards, schedules, quizzes and charts as interactive components (structured output).
5. **Grounded answers** — Google Search grounding for current facts with citations.
6. **Account hardening** — email verification, password reset, optional Google sign-in, session list with "sign out everywhere", data export and full account deletion.
7. **Production infrastructure** — Postgres, object storage for uploads, scheduler as a separate worker/cron, OpenTelemetry tracing for latency, Sentry for errors.

## Phase 3 — Advanced companion features
1. **Calendar & email integrations** — Google OAuth with narrow scopes; read calendar to avoid conflicts; drafting email with explicit approve-before-send.
2. **Permission framework** — per-action policies (automatic / ask / never), audit log of every action the AI takes, one-tap revoke.
3. **AI-initiated phone calls & SMS** — Twilio (or similar) bridged to Gemini Live; requires verified phone number and explicit TCPA-compliant consent; scheduled calls for routines.
4. **Native apps** — React Native/Expo sharing the backend: background notifications, CallKit/ConnectionService for real incoming calls, native screen sharing (ReplayKit / MediaProjection).
5. **Optional facial recognition** — on-device face embeddings only for enrolled, consenting users; confidence thresholds with a neutral fallback greeting; one-tap deletion; never identifies anyone not enrolled. Requires a legal review first (BIPA in Illinois, Texas and Washington biometric laws, GDPR Art. 9).
6. **AI computer control** — transparent, interruptible click/type assistance on desktop with per-session approval.
7. **Avatar upgrades** — selectable avatar styles, lip-synced character option, richer state animations.

## Open questions to decide
- Hosting target (single server vs. serverless) — decides database and scheduler choices.
- Pricing/usage limits — Live video is the most expensive mode; per-user quotas may be needed.
- Data retention defaults — how long to keep transcripts and uploads.
