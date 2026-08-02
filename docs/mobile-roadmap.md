# Native mobile roadmap

This checklist tracks the iOS and Android release as a separate client. The Next.js website remains the production web app, API host, invite fallback, legal/support surface, and app-owner control center.

## Phase 1 — Foundation

### Codex

- [x] Create `feat/native-mobile-foundation` from the tested v0.5.0 release commit.
- [x] Scaffold an isolated Expo SDK 57 and React Native application in `apps/mobile`.
- [x] Add Expo Router, Thursday League theme tokens, and a native foundation screen.
- [x] Add lazy Supabase client/session persistence foundations.
- [x] Add public environment templates and prevent mobile secrets from entering Git.
- [x] Add EAS development, preview, and production build profiles.
- [x] Keep root web lint and TypeScript checks isolated from the mobile application.
- [x] Add final app icon, adaptive icon, monochrome icon, and splash artwork from the approved Thursday League logo.
- [x] Set the permanent Apple bundle ID and Android package name to `app.thursdayleague.mobile`.
- [x] Link the Expo project under the confirmed Expo owner `chlelaaa`.

### Owner

- [x] Publish personally rather than through a legal organization.
- [x] Confirm the Expo account owner: `chlelaaa`.
- [x] Approve the permanent identifier: `app.thursdayleague.mobile`.
- [x] Defer purchasing `thursday-league.app`; keep the current Vercel URL for now.
- [x] Configure `apps/mobile/.env.local` with the public Supabase and production app values.

### Acceptance gate

- [x] Mobile dependency tree, Expo Doctor, lint, TypeScript, Android Metro, and iOS Metro bundle checks pass.
- [x] Existing web lint, TypeScript, tests, model tests, and production build still pass.
- [x] Android development build launches on a real device or emulator.
- [ ] iOS development build launches through EAS/TestFlight or a supported local simulator/device.
- [x] The permanent app identifiers and Expo ownership are approved before the first signed build.

## Phase 2 — Authentication and league entry

- [x] Port onboarding and persist progress natively.
- [x] Add username/email sign-in and username/email/password signup through server validation.
- [x] Add a real verified recovery email while keeping usernames as the public identity.
- [x] Add protected routes and session lifecycle handling.
- [x] Port create/join/approve league flows.
- [x] Add league switching with strict cache invalidation.
- [x] Implement invitation-link previews and logged-out continuation.

### Production auth gate

- [ ] Mirror the tested Auth settings in the hosted Supabase dashboard: direct signup off, email confirmations on, secure password changes on, and double-confirm email changes off.
- [ ] Allow the production web callback and `thursdayleague://auth/confirm` redirect URLs.
- [ ] Configure production SMTP and verify delivery, expiry, and one-time use for verification and recovery links.
- [ ] Run one end-to-end signup, email verification, username login, email login, recovery, and account cleanup test against the release environment.

## Phase 3 — Core product

- [x] Home and matchweek readiness.
- [x] Games, match details, live state, and competition standings.
- [x] Players, statistics, profile, and existing avatar display.
- [x] Fantasy selection, standings, and history.
- [x] Match predictions, wallets, slips, and history.
- [x] League-owner match, roster, season, and member controls.
- [x] Keep platform-owner controls web-first.

## Phase 4 — Native services

- [x] Register Expo device tokens securely and deliver through Expo to APNs/FCM.
- [x] Persist per-league notification preferences and restrict notification routes to leagues the user belongs to.
- [x] Retry token registration after connectivity returns, unregister safely on sign-out, and reconcile Expo push receipts.
- [x] Prepare iOS Universal Links, Android App Links, and HTTPS association endpoints for the production Vercel domain.
- [x] Add native profile-photo selection, local optimization, upload validation, replacement, and removal.
- [x] Add offline status, recoverable route errors, Dynamic Type support, screen-reader semantics, accessible controls, and reduced-motion navigation.

### Telemetry decision

- Route-level crash recovery ships in the client so a broken screen does not strand the user.
- Add external Sentry reporting before the first public beta, after the owner creates the Sentry project. The setup must include release source maps and must not attach usernames, email addresses, league data, bets, or Fantasy picks.
- Do not add product analytics to the first store MVP. Revisit analytics only with a defined event allowlist, updated privacy disclosures, and consent where required. This avoids collecting behavior data before it has a clear product purpose.

### Native-services release gate

- [ ] Apply `20260731010000_native_push_delivery.sql`, `20260731020000_native_push_receipts.sql`, and `20260802010000_platform_notification_templates.sql` to hosted Supabase after this branch is approved.
- [ ] Configure Android FCM V1 credentials in EAS and test a received notification on a physical Android device or supported emulator.
- [ ] Purchase the Apple Developer Program membership, configure the APNs push key, and test on the registered iPhone.
- [ ] Add `ANDROID_APP_CERT_SHA256` and `APPLE_TEAM_ID` to Vercel, deploy the association endpoints, then verify Android App Links and iOS Universal Links.
- [ ] Create the Sentry mobile project, run the official React Native setup wizard, add its EAS secrets, and verify a symbolicated non-production test crash.
- [ ] Test notification opt-in/out, foreground/background/terminated routing, sign-out cleanup, avatar permission denial, avatar replacement, offline recovery, screen reader, large text, and reduced motion on physical release builds.

## Phase 5 — Store release

- [x] Privacy policy, support, terms, and external account-deletion pages.
- [x] In-app native account deletion and legal/support links.
- [x] Draft honest simulated-gambling content/age-rating declarations.
- [x] Draft App Store privacy and Google Play Data Safety answers.
- [x] Draft reviewer league, demo-account, and review instructions.
- [x] Draft store descriptions, screenshot plan, and first-release notes.
- [ ] Set `NEXT_PUBLIC_SUPPORT_EMAIL` in Vercel and verify every public legal/support URL in production.
- [ ] Create the store records and enter the prepared listing, privacy, content-rating, and reviewer information.
- [ ] TestFlight beta and Google closed test.
- [ ] Capture final screenshots from signed release builds.
- [ ] Production builds, submissions, review fixes, and staged rollout.
