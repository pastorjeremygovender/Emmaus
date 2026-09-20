---
name: Capacitor service-worker cleanup
description: Native WebViews must remove legacy browser service workers and Emmaus static caches before the app proceeds.
---

Native Capacitor platforms must not register the browser service worker. On load, they should unregister every existing service-worker registration and delete only caches whose names use the Emmaus static-cache prefix.

**Why:** A previously installed browser worker can remain inside the Android WebView even after the web bundle changes. An activation handler that navigates clients can then white-screen the installed app and its widget while the browser site remains healthy.

**How to apply:** Keep the Capacitor-native branch before the production/browser registration branch in `register-service-worker.ts`. Do not add client navigation to `public/sw.js`; browser/PWA registration must continue using the safe worker policy.