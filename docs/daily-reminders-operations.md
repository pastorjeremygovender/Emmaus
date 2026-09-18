# Daily Reminders operations

Daily Reminders uses standards-based Web Push. The web/API Autoscale Deployment
serves authenticated settings and subscription requests. Delivery is a separate,
one-shot worker so it does not depend on an Autoscale instance remaining awake.

## Required environment values

Configure these for both the API deployment and the Scheduled Deployment:

- `VAPID_PUBLIC_KEY` — the URL-safe public VAPID key
- `VAPID_PRIVATE_KEY` — the matching private VAPID key; store only as a Replit Secret
- `VAPID_SUBJECT` — `https://emmaus.co.za` or a monitored `mailto:` contact

Generate one permanent key pair with the `web-push` package. Never regenerate
the pair while active subscriptions exist: browsers bind each subscription to
the public key and members would need to enable reminders again.

The private key must never be committed, logged, returned by an API, or placed
in frontend build variables. The API returns only the public key.

Subscription endpoints are accepted only for recognized browser push-service
hosts (Google/FCM, Mozilla, Apple, and Microsoft WNS) over standard HTTPS.
Arbitrary hosts, private addresses, lookalike subdomains, fragments, and custom
ports are rejected before storage so the delivery worker cannot become a
server-side request proxy.

## Scheduled Deployment

Create a Replit Scheduled Deployment from this same project with:

```text
pnpm --filter @workspace/api-server run reminders:deliver
```

Run it every five minutes. The worker exits after one pass. It accepts a
ten-minute due window and uses a unique device/date delivery claim, so an
overlapping run cannot send a duplicate. It checks the server-owned Daily
Rhythm opening ledger before claiming delivery and skips members who have
already completed today's 10 Minutes with Jesus.

Delivery is deliberately **at most once per device per local day**. An
ambiguous network failure consumes that day's claim instead of retrying and
risking a duplicate notification. A later day remains unaffected.

Monitor the Scheduled Deployment logs for `Reminder worker completed` and
non-zero failure counts. HTTP 404/410 responses from a push service deactivate
the expired device subscription automatically.

## Physical Android PWA release checklist

Complete this checklist on the published `https://emmaus.co.za` origin. Web Push
and the production service worker cannot be fully exercised in the development
preview.

1. Open Emmaus in current Android Chrome, sign in, and install it to the home screen.
2. Open Settings and confirm Daily Reminders starts as **Off** or
   **Permission needed**, never falsely On.
3. Turn the switch on and confirm the Android notification permission prompt
   appears only after that tap.
4. Allow permission, choose a time, close and reopen Settings, and confirm
   **On — daily at [time]** persists.
5. Tap **Send test** while Emmaus is visible and confirm the exact title and
   message arrive.
6. Fully close the installed PWA, tap **Send test** from the same account in
   Chrome or another signed-in device, and confirm Android still delivers it.
7. Tap the notification with Emmaus closed. Confirm the installed PWA opens at
   the valid Daily Rhythm entry for 10 Minutes with Jesus.
8. Repeat while Emmaus is already open. Confirm the existing window is focused
   and navigated instead of leaving a duplicate window.
9. Deny permission on a clean browser profile. Confirm Emmaus shows
   **Blocked in device settings**, does not prompt repeatedly, and gives calm
   settings guidance.
10. Disable reminders. Confirm the current device reads **Off** after reopening
    Settings and no scheduled reminder arrives.
11. Enable a second device on the same member account. Disable the first device
    and confirm the second remains active and can receive a test.
12. Complete today's 10 Minutes with Jesus before the selected time. Confirm
    the scheduled worker does not send that day's reminder.

Record the Android version, Chrome version, installed-PWA status, and result for
each step before enabling the schedule for all members.