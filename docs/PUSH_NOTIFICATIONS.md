# Push notifications

Open the user profile from the top-right avatar. Under **Push notifications**, click **Enable on this device**, allow the browser prompt, then **Send test push**. Check the device notification centre. Each browser/device needs its own permission. On iPhone/iPad, install the website with **Add to Home Screen**, open the installed app, then enable notifications there. Embedded browsers may not implement Web Push; use a supported standalone browser.

Server delivery uses standards-based Web Push and VAPID, without a paid notification service. `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` are configured in the ignored local environment and Vercel. Keep the private key server-only and stable across deployments. Changing the key pair requires devices to unsubscribe and register again. Never paste it into chat, source or browser storage.

Task assignments and beat changes create persisted in-app notifications and trigger background server delivery. The scheduled daily check creates administrative operations alerts and retries recent unread notifications. Opening the app also requests a retry. A database claim prevents repeated sends of the same notification to a device; interrupted deliveries can retry with the same device notification tag. The server removes expired provider endpoints after 404/410 responses. Claims older than seven days are cleaned by the daily job. This is at-least-once transport: an interrupted acknowledgement may result in a collapsed duplicate. Provider acceptance is distinct from a device displaying a notification.

Subscriptions belong to the authenticated user; one account cannot overwrite another account's endpoint. Sign-out unsubscribes the browser. Disabling a device removes its server subscription. Inactive accounts and removed feature grants are checked before delivery. Lock-screen content is generic and contains no customer, financial, task or location details. Opening a notification returns to the app's permitted landing page.

The subscription endpoint allows only supported public push-service hosts, validates P-256 encryption keys, limits payload size, requires same-origin mutations and never accepts a caller-supplied recipient. Five registered devices per user are supported by the application control. Subscriptions and delivery claims are protected server-only Supabase tables, with no anonymous/authenticated table grants.

Validation covers actual authenticated subscription storage/removal and isolation against Supabase, plus duplicate/failed-delivery and service-worker security tests. Physical notification display, OS Focus/Do Not Disturb, power-saving settings and iPhone Home Screen installation require a real-device test. A browser/OS can suppress delivery; the in-app notification remains available.

Sources: [Web Push library](https://github.com/web-push-libs/web-push), [WebKit iOS/iPadOS Web Push](https://webkit.org/blog/13878/).
