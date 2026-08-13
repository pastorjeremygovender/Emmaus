---
name: Voice Session Persistence (Phase 4)
description: App-level Voice engine lifted from VoiceMode into VoiceSessionContext so sessions survive navigation.
---

## The Rule
VoiceMode.tsx is now a **thin view only**. The entire engine lives in `VoiceSessionContext.tsx` — a provider mounted inside WouterRouter in `App.tsx`.

## Architecture

| Symbol | File | Role |
|---|---|---|
| `VoiceSessionProvider` | `contexts/VoiceSessionContext.tsx` | Owns all refs, state, engine functions |
| `useVoiceSession()` | same file | Hook consumed by VoiceMode + GlobalVoiceIndicator |
| `GlobalVoiceIndicator` | `components/emmaus/GlobalVoiceIndicator.tsx` | Floating pill shown on non-voice screens when session active |

## Provider Location in App.tsx
```
WouterRouter
  └─ VoiceSessionProvider          ← NEW (inside router for useLocation)
       ├─ ScrollToTop
       ├─ Router (all routes)
       ├─ FloatingEmmausButton
       └─ GlobalVoiceIndicator     ← NEW
```

Must be inside WouterRouter (needs `useLocation`) and inside AuthProvider (needs `useAuth`).

## Key Engineering Decisions

**Stable processAudioBlob pattern:**
All dynamic values (user, convId, history, initContext) are mirrored into refs synced via useEffect. processAudioBlob is `useCallback([], [])` — stable, no stale closures. Reads from refs at call time.

**cancelledRef semantics changed:**
- Phase 1–3: `true` on VoiceMode unmount
- Phase 4: `true` only on `endSession()`. Unmounting VoiceMode does NOT set it.

**pausedRef:**
Mirrors `sessionPaused` state for use inside the stable processAudioBlob callback. Without it, auto-restart timers would see the initial value (false) even when session is paused.
```typescript
const pausedRef = useRef(false);
// Set to true in pauseSession(), false in resumeSession/startSession/endSession
// Used in auto-restart timers: if (!cancelledRef.current && !pausedRef.current) startListening();
```

**processAudioBlobRef:**
The engine stores processAudioBlob in a ref so recorder.onstop always calls the latest version even if the callback was replaced.

**navigate ref (navigateRef):**
VoiceMode calls `session.registerNavigate(navigate)` on mount. processAudioBlob uses this ref to issue navigation commands (e.g. "Open My Bible") without coupling the stable engine to the component.

## Close View vs End Session
- Header `← Back` button in VoiceMode → `navigate(returnDest)` only — session CONTINUES
- Footer `End` button in VoiceMode → `endSession()` then navigate — session TERMINATES
- GlobalVoiceIndicator ■ button → `endSession()` — terminates
- GlobalVoiceIndicator ⏸/▶ → pause/resume

## Route Change Context Refresh
useEffect on `location` change (when session is active) triggers debounced (800ms) fetchVoiceContext() call to keep appContextRef current as user navigates.

## Media Session API
Set up in `setupMediaSessionHandlers()` called from `startSession()`. Handlers: play → resumeSession, pause → stop mic, stop → endSession, next/prev track → advance reading section.

## Critical VAD / Interrupt Tuning — DO NOT regress these values

| Parameter | Value | Why |
|---|---|---|
| VAD threshold | **35** | 18 causes ambient HVAC/room hum to trigger recording stop |
| VAD min elapsed before gate | **1500 ms** | 600 ms fires before user finishes first word |
| VAD silence gate | **2000 ms** | 1500 ms cuts off mid-sentence in a quiet room |
| VAD consecutive ticks required | **5 × 100 ms = 500 ms** | Single loud noise must not set vadSpokenRef permanently |
| Auto-restart after conversation TTS | **2500 ms** | 600 ms lets room reverb/echo trigger VAD immediately |
| Auto-restart after reading section | **1500 ms** | 800 ms too fast between sections |
| Interrupt monitor threshold | **40** | 25 causes TTS speaker bleed to self-trigger immediately |
| Interrupt monitor gate | **1500 ms** | 700 ms fires on TTS bleed within first second |
| Interrupt monitor startup delay | **3000 ms** | Must wait for AEC to lock before polling starts |

**Lowering any of the interrupt monitor values (threshold, gate) will cause TTS speaker bleed to self-trigger the interrupt, producing an infinite loop where Emmaus transcribes its own voice and responds to it. Do not change these without full device testing.**

## Phrase Matching Lessons (from production logs)

- "Open the Bible please" → regex must allow "the" not just "my": `open (?:my|the|a)? bible`
- "Read 10 minutes of Jesus" → daily-rhythm regex must match "of" not just "with": `10 minutes (?:with|of|for) jesus`
- Ukrainian text being transcribed (e.g. "Дякую за перегляд!") = TTS audio bleg into mic — interrupt monitor fired on TTS output

## Fast Refresh Warning
VoiceSessionContext.tsx exports both `VoiceSessionProvider` (component) and `useVoiceSession` (hook). Vite emits a "useVoiceSession export is incompatible" warning and falls back to full page reload for this file only. No runtime impact. Fix if annoying: move hook to `useVoiceSession.ts`.

**Why:** This is how React contexts work — provider + hook naturally co-locate.
