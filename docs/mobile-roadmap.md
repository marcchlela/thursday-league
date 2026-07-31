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
- [ ] Android development build launches on a real device or emulator.
- [ ] iOS development build launches through EAS/TestFlight or a supported local simulator/device.
- [ ] The permanent app identifiers and Expo ownership are approved before the first signed build.

## Phase 2 — Authentication and league entry

- [ ] Port onboarding and persist progress natively.
- [ ] Add username sign-in and signup through existing server validation.
- [ ] Add a real verified recovery email while keeping usernames as the visible login identity.
- [ ] Add protected routes and session lifecycle handling.
- [ ] Port create/join/approve league flows.
- [ ] Add league switching with strict cache invalidation.
- [ ] Implement invitation-link previews and logged-out continuation.

## Phase 3 — Core product

- [ ] Home and matchweek readiness.
- [ ] Games, match details, live state, and standings.
- [ ] Players, statistics, profile, and avatars.
- [ ] Fantasy selection, standings, and history.
- [ ] Match predictions, wallets, slips, and history.
- [ ] League-owner match, roster, season, and member controls.
- [ ] Keep platform-owner controls web-first.

## Phase 4 — Native services

- [ ] Native APNs/FCM token registration and delivery adapter.
- [ ] Notification preferences and correct league/page routing.
- [ ] iOS Universal Links and Android App Links.
- [ ] Native image picker and upload permissions.
- [ ] Network/offline recovery, crash reporting, and analytics decision.
- [ ] Accessibility, Dynamic Type, screen-reader, keyboard, and reduced-motion pass.

## Phase 5 — Store release

- [ ] Privacy policy, support, terms, and external account-deletion pages.
- [ ] Honest simulated-gambling content/age-rating declarations.
- [ ] App Store privacy and Google Play Data Safety forms.
- [ ] Reviewer league, demo credentials, and review instructions.
- [ ] TestFlight beta and Google closed test.
- [ ] Store screenshots, descriptions, icons, and release notes.
- [ ] Production builds, submissions, review fixes, and staged rollout.
