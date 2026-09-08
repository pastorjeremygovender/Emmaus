# Emmaus Geofence Test

This is an isolated, debug-only Android test application. It is not Welcome
Assist and is not the Emmaus member app. It does not open `emmaus.co.za`, ask
for an Emmaus login, call the production Emmaus API, or use production user
data.

## Build

From `artifacts/project-emmaus`:

```bash
pnpm run build
pnpm exec cap sync android
cd android
./gradlew assembleDebug
```

The debug APK is produced at:

```text
artifacts/project-emmaus/android/app/build/outputs/apk/debug/app-debug.apk
```

The debug application ID is:

```text
za.co.emmaus.app.geofencetest
```

It installs separately from the Emmaus app. The launcher name is
**Emmaus Geofence Test**, and tapping its icon opens the native test screen
directly. No ADB command is required.

## What the test records

The test stores only local configuration and diagnostic results. An event
contains:

- event type
- detection time
- time shown in the test screen
- delivery delay
- offline flag
- app lifecycle state

Copied results never include coordinates, anonymous device identifiers or
personal information. The test location is deleted by **Clear test data** or
when the test app is uninstalled.

Leave the optional endpoint blank for local-only testing. If an isolated test
endpoint is used, it must not be `emmaus.co.za` or any of its subdomains.
Production Emmaus endpoints are rejected by the app.

## Instructions for Pastor Jeremy

1. Download the APK file supplied with this handoff to the Android phone.
2. Open the downloaded file.
3. If Android asks, allow installation from that source. This setting is usually
   under **Settings → Install unknown apps** for the browser or file manager
   used to download the APK.
4. Finish installing the app.
5. Open **Emmaus Geofence Test** from the phone’s app list. Do not open the
   normal Emmaus app for this test.
6. Tap **Explain permissions** and read the privacy explanation.
7. Tap **Grant location permission** and choose the normal location option.
8. Tap **Grant background location permission**. On newer Android versions,
   choose **Permissions → Location → Allow all the time**, then return to the
   test app.
9. Tap **Set test location to where I am now** while standing at a safe,
   non-sensitive test location. The location stays on this phone.
10. Leave **Test radius** at 150 metres for the first test.
11. Tap the **Test start time** field and choose the current date and time.
    Tap the **Test end time** field and choose a later time far enough in the
    future to complete the test.
12. Leave the optional endpoint blank.
13. Tap **Start test** and confirm that **Test armed: YES** appears.
14. Leave the test area before the test begins. Do not use a real church
    location or real member data.
15. Enter the test radius under the scenario being tested.
16. Use **Test status** and **View results** to check the outcome. The app may
    take time to report an Android geofence event.
17. Tap **Copy results** and paste the copied text back into Replit if results
    need to be reviewed. The copied text does not include the test coordinates
    or device identifier.
18. Tap **Stop test** when finished.
19. Tap **Clear test data** and confirm. This removes the local test location,
    test window, events, queue and configuration.
20. Uninstall **Emmaus Geofence Test** from the phone.

## Short first test

Use this smaller test before attempting the full matrix:

1. Install and open **Emmaus Geofence Test**.
2. Grant foreground and background location permission.
3. Tap **Set test location to where I am now**.
4. Leave the radius at 150 metres and choose a one-hour test window using the
   start and end time fields.
5. Tap **Start test**.
6. Walk at least 200 metres away from the test point.
7. Lock the phone and leave the test app in the background.
8. Walk back into the test radius.
9. Unlock the phone later and tap **View results**.
10. Do not conclude that geofencing works unless a real `geofence_entry` event
    appears in the results.

## Status and results

The screen reports:

- test armed/not armed
- test window
- radius
- foreground permission
- background permission
- location services
- battery optimisation status where Android exposes it
- internet state
- last geofence event
- whether an event is waiting for connectivity
- duplicate events suppressed
- test expiry
- reboot recovery result

The proof listens only for ENTER events. It does not track exits or continuously
record location. Android controls the timing of geofence delivery, so the
screen’s delay is the measured delay for the event received by the app, not a
guaranteed real-time value.

## Safety limits

- Debug build only; no proof permissions or components are in release.
- No iOS, beacon, continuous tracking or production Welcome Assist work.
- No production coordinates, API, database, secrets, deployment or DNS.
- No Emmaus authentication.
- No attendance decision should be made from this proof.