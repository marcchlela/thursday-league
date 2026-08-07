# Android release readiness — 2 August 2026

This audit was completed on `feat/mobile-auth-league-entry` without merging, deploying, starting an EAS build, or applying hosted migrations.

## Passed locally

- Permanent package ID: `app.thursdayleague.mobile`.
- Expo project: `@chlelaaa/thursday-league` (`fa6766a1-14d7-469a-a94d-8f073656d50a`).
- Expo SDK 57 / React Native 0.86 target Android API 36 and support Android 7 or newer.
- EAS production profile explicitly uses store distribution and an Android App Bundle.
- Android version codes are remote-managed and auto-incremented; the current remote version code is `1`.
- Launcher, adaptive, monochrome notification, and splash assets exist. The launcher icon is 1024×1024.
- App Links cover `/invite`, `/auth/confirm`, and `/l`; the custom scheme is `thursdayleague`.
- Notification registration uses the EAS project ID, an Android `matchweek` channel, runtime permission handling, token refresh, logout cleanup, and league-scoped route validation.
- Camera, microphone, and system-overlay permissions are explicitly removed. Android app backup is disabled.
- Expo Doctor passed 20/20; Expo dependency validation, mobile lint, mobile TypeScript, Android JS export, root lint, root TypeScript, all 67 unit tests, and the Next production build passed.
- The web/API npm audit reports zero known vulnerabilities after pinning patched PostCSS and Sharp releases used by Next.js.

## Monitored upstream warning

- The standalone Expo package audit reports a moderate `uuid` advisory through Expo's `xcode` build-time tooling. That code is not shipped as Android application runtime code, Expo Doctor passes, and npm's forced suggestion would incorrectly downgrade Expo Splash Screen. Do not apply the forced downgrade; recheck this warning with future Expo SDK 57 patches.

## Required before the first closed-test upload

- Complete Play Console identity verification and create the app using the exact package ID above.
- Enable Play App Signing and obtain its SHA-256 app-signing certificate fingerprint.
- Set `ANDROID_APP_CERT_SHA256` on Vercel and deploy this branch so `/.well-known/assetlinks.json` returns HTTP 200.
- Deploy the public Privacy, Terms, Support, and Delete Account pages. The current production deployment returns HTTP 404 for them because this branch is not deployed.
- Apply and verify the already-prepared production migrations needed by native push registration before testing notifications.
- Create a Firebase Android app with package `app.thursdayleague.mobile`, add its `google-services.json` through `expo.android.googleServicesFile`, upload the matching FCM V1 service-account key to EAS, and perform real foreground, background, and terminated-state push tests.
- Create a dedicated reviewer league and reviewer credentials using `reviewer-guide.md`.
- Run one production EAS AAB build. Upload it to Play internal testing first, let Play inspect it, and verify 16 KB page-size compatibility from the final artifact.
- Capture at least the required phone screenshots from that signed reviewer build. The feature graphic and storyboard are ready, but the seven final store screenshots do not exist yet.
- Complete Play Console Data Safety and IARC content rating using `privacy-and-content-declarations.md`.
- Run the physical-device matrix in `beta-acceptance.md`, then begin the required closed test.

## Expected Play declarations

- Data collection: Yes — email, user ID, optional profile photo, league/gameplay content, and optional push/device ID.
- Data sharing: No, provided the service-provider exception remains accurate for Supabase, Vercel, Expo, and FCM.
- Encryption in transit: Yes.
- Account deletion: Yes, both in-app and through the public deletion page after deployment.
- Ads: No. In-app purchases: No. Financial features: No.
- Simulated gambling/prediction content: Yes. Real-money gambling, deposits, withdrawals, prizes, or transferable value: No.
- Target audience: 13 and older; accept the rating produced by IARC rather than lowering it manually.

## Closed-testing gate

Because the Play developer account is a new personal account, plan for at least 12 testers to remain opted in continuously for 14 days. Start with internal testing, fix any installation or startup issues, then promote the same approved release candidate to closed testing.
