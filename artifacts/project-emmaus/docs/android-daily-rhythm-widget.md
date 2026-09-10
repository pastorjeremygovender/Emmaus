# Emmaus Daily Rhythm Android widget

This isolated native widget is based on the Android production baseline. It does not alter the production database, API, authentication code, Daily Rhythm progression, or published web application.

## Behaviour

- Displays **10 Minutes with Jesus**, today's Daily Rhythm title, Scripture text/reference when available, and a calm invitation.
- Contains no logo and no progress bar.
- Tapping anywhere on the widget opens the canonical current-day route with `source=widget`.
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
5. Tap the widget and confirm the current Daily Rhythm opens directly.
6. Complete today's rhythm, reopen the app, and confirm the footer changes to **Today’s rhythm complete**.
7. Disable connectivity and confirm the last safe content remains visible and the tap target still opens the app.
8. Sign out/clear app data and confirm no personal information is exposed.

## Production isolation

Do not merge or publish this branch until authentication is restored and the widget passes device testing. No schema or data migration is required.
