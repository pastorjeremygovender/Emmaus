# Emmaus Android release

Emmaus has a Capacitor 8 Android wrapper under `artifacts/project-emmaus/android`.
Capacitor 8 is the current Android line used here because it targets Android API
36. The wrapper keeps Android 7 / API 24 as the minimum supported level.

## Toolchain

Use Android Studio Otter 2025.2.1 or newer with:

- Android SDK Platform 36 and build tools installed
- Java 21
- Android Gradle Plugin 8.13.0
- Gradle 8.14.3 (provided by `android/gradlew`)
- Capacitor 8 (`@capacitor/core`, `@capacitor/android`, and `@capacitor/cli`)

The Gradle wrapper is checked in, so the Gradle version is not selected by a
developer's global installation.

## Local commands

From `artifacts/project-emmaus`:

```sh
pnpm run android:verify
pnpm run android:assembleDebug
```

`android:sync` builds the web artifact and syncs the published origin into the
native configuration. Release builds use `https://emmaus.co.za` so the native
shell preserves the existing same-origin authentication, API, SSE, LiveKit,
private media, and web navigation behaviour.

## Signed release

The signing keystore must be supplied outside source control. Configure these
environment values in the release environment or Replit Secrets; never commit
the keystore or passwords:

```text
EMMAUS_ANDROID_KEYSTORE_PATH
EMMAUS_ANDROID_KEYSTORE_PASSWORD
EMMAUS_ANDROID_KEY_ALIAS
EMMAUS_ANDROID_KEY_PASSWORD
```

Then run:

```sh
pnpm run android:bundleRelease
```

The command refuses to build a release bundle when signing values or the
keystore are missing. It produces an Android App Bundle under
`android/app/build/outputs/bundle/release/`; do not distribute a debug APK.

The current package version is `1.1.0` / version code `2`, incremented from the
initial generated wrapper version.

## Permissions and links

The manifest declares Internet, microphone, camera, and Android 13+
`POST_NOTIFICATIONS`. Camera and microphone are optional device features. The
web app requests them contextually: audio-only meetings do not request camera,
and the reminder settings switch requests notification permission only after
the member enables reminders. The native wrapper does not request permissions
at startup.

The launcher activity and the HTTPS `emmaus.co.za` app-link activity have
explicit exported declarations. Before publishing, deploy
`/.well-known/assetlinks.json` on `emmaus.co.za` containing the SHA-256
fingerprint for the release certificate. A template is provided at
`docs/android-assetlinks.json.example`.

## Verification record

The repository-level verification performed in this environment confirms:

- Capacitor 8 dependencies and native project generated successfully.
- compileSdk / targetSdk 36 and minSdk 24 are configured.
- AGP 8.13.0 and Gradle 8.14.3 are configured.
- release signing is required and checked before `bundleRelease`.
- launcher/app-link exported attributes and required permissions are declared.
- web production build succeeds before native sync.
- existing web meeting and notification code keeps its contextual permission
  behavior.

This Replit environment does not provide Java, Android SDK, an emulator, a
physical Android device, or the production release keystore, so the following
must be completed in Android Studio or CI before Play submission:

1. Run `pnpm run android:assembleDebug` on an API 36 emulator or current
   Android device.
2. Configure the release signing values and run `pnpm run android:bundleRelease`.
3. Install the signed bundle via Play internal testing and confirm Play
   Protect shows no older-target warning.
4. Verify sign-in, deep links, app links, PWA navigation, audio-only meetings
   without camera permission, video meetings, and contextual notification
   permission/reminder delivery.
5. Publish `assetlinks.json`, then verify an HTTPS Emmaus link opens the app and
   an unrelated HTTPS link remains in the browser.