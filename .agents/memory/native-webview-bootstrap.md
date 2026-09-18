---
name: Native WebView bootstrap
description: Startup ordering rules for the Capacitor Android shell and web application mount.
---

The web app must mount independently of native plugin initialization. Native deep-link listeners and pending-intent handoff may continue after React has rendered, but a pending bridge call must never leave the WebView on a blank screen. Native remote-origin loads also need bounded retries and a visible recovery page rather than an unrecoverable blank WebView.

**Why:** A native shell can leave a plugin bridge request pending while the WebView is opening. Waiting for that request before `createRoot()` produces a permanent white screen even when the live HTML and API are healthy.

**How to apply:** Render React immediately, run optional native startup work in the background with a short timeout, and let late deep-link events update browser history after mount. For remote-origin Android builds, retry pre-commit load failures a small number of times and show a retry screen if the document still cannot load. Keep deep-link validation and acknowledgement idempotent.

Republishing the web artifact does not update an already-installed APK's embedded assets. Native launch fixes must be packaged into and installed from a new Android build; verify whether the installed build uses the live `server.url` before relying on a web-only republish.

When the branded splash has already been dismissed in session storage, retained WebViews must still show a visible loading state while auth/profile restoration is pending. Bound the initial auth request so a stalled network request eventually reaches the signed-out route instead of leaving the app blank.