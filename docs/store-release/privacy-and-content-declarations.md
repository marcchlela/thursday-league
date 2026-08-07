# Privacy, Data Safety, and content declarations

These answers reflect the repository as of 31 July 2026. Re-audit them whenever an SDK, permission, analytics tool, advertising tool, payment feature, or user-data feature changes.

## App Store privacy labels

Declare the following as data linked to the user and collected for App Functionality unless App Store Connect presents a more precise equivalent:

| Apple category | Thursday League data | Purpose |
| --- | --- | --- |
| Contact Info → Email Address | Verified login/recovery email | Account management, verification, recovery |
| Identifiers → User ID | Supabase account ID and public username | Authentication, memberships, ownership, league activity |
| Identifiers → Device ID | Expo/APNs/FCM push token | User-requested notifications and delivery reliability |
| User Content → Photos | Optional profile photo | Profile display |
| User Content → Gameplay Content / Other User Content | League membership, match and player records, Fantasy picks, virtual prediction slips | Core league, Fantasy, and prediction functionality |

- Tracking: No.
- Data used for third-party advertising: No.
- Data broker sale or sharing: No.
- Precise or coarse location: Not collected.
- Contacts, health, payment, credit, browsing history, and search history: Not collected.
- Product analytics in the native app: Not collected for the first MVP.
- Crash diagnostics: Not collected externally yet. When Sentry is added, update this answer before distributing that build and ensure Sentry receives no username, email, league content, Fantasy picks, or predictions.

The website uses Vercel Analytics and Speed Insights with sensitive URL details redacted. This must remain disclosed in the public privacy policy, but it does not make the native app’s Apple privacy label “Product Interaction” true unless the native client begins sending equivalent analytics.

## Google Play Data Safety

Answer `Yes` to data collection because account and league information is transmitted off-device to operate the service. Answer based on these groups:

| Google data type | Required? | Optional? | Purpose |
| --- | --- | --- | --- |
| Personal info → Email address | Yes for new signup; existing username-only accounts can add it | No for new accounts | Account management, security, recovery |
| Personal info → User IDs | Yes | No | Account and league functionality |
| Photos and videos → Photos | No | Yes | Profile photo |
| App activity → Other user-generated content | League-dependent | Yes | Matches, statistics, Fantasy, virtual predictions, league administration |
| Device or other IDs | No | Yes, only when push is enabled | Notifications and delivery reliability |

- Is data encrypted in transit? Yes; production clients and APIs use HTTPS/TLS.
- Can users request deletion? Yes, in native Account security and at `/delete-account`.
- Is data shared? Select No where Google’s service-provider exception applies. Supabase, Vercel, Expo, APNs, and FCM process data on Thursday League’s behalf; none receives it for independent advertising or resale.
- Is collection temporary/ephemeral? No for account, league, and notification records that must persist. Some runtime/network processing may be transient, but do not mark the categories above as ephemeral.
- Security practices badge: only claim an independent security review if one is actually completed; repository tests are not an external audit.

Before saving, use Play Console’s exact definitions and make sure every third-party SDK in the final Android bundle is covered. If Sentry is added, add App info and performance → Crash logs/Diagnostics before that build reaches a testing track.

## Content rating and gambling declarations

The prediction feature displays odds, accepts virtual stakes, and awards virtual league coins. It should be disclosed as simulated gambling/prediction content even though no money or prize is involved.

### Apple age-rating questionnaire

- Simulated Gambling: `Frequent` while predictions are a core enabled feature.
- Gambling: `No`.
- Loot Boxes: `No`.
- Contests: answer honestly as present for Fantasy and league standings if the questionnaire defines competition without prizes as a contest.
- Real-money gaming, cash prizes, cryptocurrency, purchases, and transferable value: `No`.
- Made for Kids: `No`.
- Do not override the calculated rating downward. A 13+ or regionally equivalent result is acceptable for the product position.

### Google Play content rating and declarations

- Complete the IARC questionnaire and disclose simulated gambling/prediction mechanics.
- Real-money gambling, games, and contests declaration: the app does not facilitate real-money gambling, deposits, cash-out, purchases, prizes, or wagering of anything with real-world value.
- Target audience: 13 and older; do not include child age groups unless the product, copy, mascot treatment, privacy work, and store listing are redesigned for children.
- Ads: No ads.
- In-app purchases: None.
- Financial features declaration: No financial products or services.

Never describe the feature as “real betting,” “winning money,” or “cash-out” in public store copy. In-product historical wallet wording should also remain clearly tied to virtual league coins.

