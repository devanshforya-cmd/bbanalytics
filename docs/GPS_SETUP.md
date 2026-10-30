# Device GPS and background tracking

## Foreground PWA

Sign in on the live HTTPS app. The **Device GPS** control appears on authenticated pages for staff with Beat Plans access. Choose **Enable GPS**, grant this site location access, enable the device's Location Services and go on duty in Beat Plan. The control reports the measured accuracy and the last server-confirmed save. It watches position across app routes and requests a fresh fix every 30 seconds while visible. **Stop sharing** stops this browser, clears its pending fix and prevents automatic restart until explicitly enabled again.

Only the latest fix is retained in a user-specific device queue, and stale fixes are discarded after two minutes. A different account cannot submit that queued fix. Live Tracking refreshes the shared feed every 15 seconds; positions older than two minutes show as last known, not active GPS. GPS permission failures provide a retry path; they never substitute a city/store coordinate. Store check-in requires a genuine fix no older than two minutes with accuracy within 200 metres. A distance over 150 metres requires an explanation. Store creation by field staff needs an actual pinned coordinate and entered area/city. Admin retailer creation requires entered coordinates or an actual device pin; route assignment refuses stores with no pinned location.

Mobile operating systems suspend web pages when locked or closed. This foreground control cannot bypass a denied permission or promise background tracking.

## Free native tracker for background capture

The app includes an [OsmAnd-compatible receiver](https://www.traccar.org/osmand/) for the official [Traccar Client](https://www.traccar.org/client/) on Android and iOS. No separate Traccar server is required for this receiver. The [current Traccar Client SDK](https://www.traccar.org/traccar-client-sdk/) sends position fields over HTTP; the [configuration guide](https://www.traccar.org/client-configuration/) describes interval, stationary heartbeat, offline buffering and battery settings.

1. On the **live HTTPS app**, expand **Background tracking on your phone** in the GPS control. Click **Generate / replace device identifier**. It creates credentials only for the signed-in staff account.
2. Install **Traccar Client** from the official phone app store. Enter the displayed server URL and device identifier exactly. Use its OsmAnd-compatible upload mode if the installed version offers a protocol choice. Do not add port 5055: this receiver uses the website's HTTPS port.
3. Set Highest/High accuracy, a 30–60 second interval and a stationary heartbeat of 60 seconds. Enable offline buffering. Android time-based tracking may require Distance 0 or Highest accuracy. Allow background/Always location and unrestricted background battery usage in the phone settings.
4. Enable the native client's tracking service and set this app's duty status to Online. Confirm the officer's fresh coordinate on **Live Tracking**, lock the phone and walk a short route, then check the timestamp and coordinate again from another signed-in device. This actual phone test is required before relying on background capture.
5. To stop native tracking, stop the client's service, choose **Disconnect native tracker**, or sync an Off Duty status to the server. The browser's **Stop sharing** button only controls browser GPS.

The private identifier is displayed once, stored server-side only as a SHA-256 hash, expires after 90 days and is replaced when regenerated. It permits reporting only that officer's location; it cannot read tracking, staff or business data. Do not share identifiers in screenshots or support logs. Native requests support HTTP query/form parameters and preserve the actual device timestamp; old buffered fixes cannot replace a newer position. Positions older than a day or too far in the future are rejected. Deactivated users or users whose Beat Plans access is removed cannot report.

## Verification boundary

Code checks cover coordinates/timestamps, queue ownership and retry behavior. HTTP QA can verify pairing, uploading, scoped reads, rotation and revocation against Supabase. Actual satellite reception, app-store client setup, phone battery policies and screen-locked delivery must be verified on the intended physical phones. Free software and public map tiles do not provide a 100% availability guarantee.
