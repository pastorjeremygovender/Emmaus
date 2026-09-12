# Emmaus Daily Rhythm Android widget

This isolated native widget is based on the Android production baseline. It does not alter the production database, API, authentication code, Daily Rhythm progression, or published web application.

## Behaviour

- Displays **10 Minutes with Jesus**, today's Daily Rhythm title, Scripture text/reference when available, and a calm invitation.
- Contains no logo and no progress bar.
- Tapping anywhere on the widget opens a versioned, exact-entry route:
  `/daily-rhythm/day/{day}?source=widget&version=1&journeyId={journeyId}&stepId={stepId}`.
- The native Capacitor bridge captures that route from both the initial
  `MainActivity` intent and subsequent taps while the existing `singleTask`
  activity is running. It retains the route until the reader validates the
  displayed entry and explicitly acknowledges successful navigation.
- If the cached step has been retired or cannot be resolved, the web reader
  replaces the stale destination with the member's current Daily Rhythm entry
  and explains the fallback. Opening the route never completes a step.
- Reuses the Capacitor WebView's same-origin session cookie to read existing authenticated Daily Rhythm endpoints.
- Caches only non-sensitive display content in private app preferences.
- Keeps the last safe display during temporary network/provider failure.
- Refreshes when Android updates the widget, when the widget is first added, and whenever the native app resumes.
- Shows a neutral prompt to open Emmaus before the first authenticated refresh.

## Manual verification

1. Build and install the debug app from this branch.
2. Sign into Emmaus inside the native app.
3. Return to the Android launcher and add **Emmaus — Daily Rhythm** from the widget picker.
4. Confirm the widget shows today's title, Scripture/reference, and no logo/progress bar.
5. Tap the widget and confirm the exact displayed Daily Rhythm entry opens
   directly, including after the app was closed and while it is already open.
   The corrected test package is version name `1.2.0-rc3`, version code `5`;
   the build identifier is visible in About Emmaus.
6. Complete today's rhythm, reopen the app, and confirm the footer changes to **Today’s rhythm complete**.
7. Disable connectivity and confirm the last safe widget content remains
   visible, the tap target does not complete the step, and the app opens the
   cached/current route when the WebView cache is available.
8. Sign out/clear app data and confirm no personal information is exposed.

## Production isolation

The Android instrumentation test launches the production widget
`PendingIntent` into `MainActivity` and verifies the exact route data. A
physical Android environment is still required to verify the complete
authenticated launcher tap, offline WebView behavior, and back-stack
behavior. No schema or data migration is required.
