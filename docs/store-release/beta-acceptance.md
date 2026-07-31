# Beta and release acceptance

## Signed-build prerequisites

- [ ] Phase 4 production migrations applied and verified.
- [ ] EAS production environment contains only the required public mobile variables and protected signing/push credentials.
- [ ] Apple Team ID and Android signing certificate fingerprint deployed to the verified-link endpoints.
- [ ] `NEXT_PUBLIC_SUPPORT_EMAIL` deployed; privacy, terms, support, and deletion URLs return 200 while signed out.
- [ ] Sentry is configured with source maps and strict PII scrubbing, or the beta is explicitly internal and Sentry remains deferred with no external crash collection.
- [ ] Reviewer league and console-only credentials are ready.

## TestFlight

- [ ] Join the Apple Developer Program and accept current agreements.
- [ ] Create the App Store Connect app for bundle ID `app.thursdayleague.mobile`.
- [ ] Configure APNs and produce an EAS iOS production build.
- [ ] Upload/select the build, answer export-compliance questions honestly, and complete internal TestFlight testing first.
- [ ] Test signup verification, username/email login, recovery, league entry, every core feature, notifications, Universal Links, profile photo permissions, and account deletion on the physical iPhone.
- [ ] Add external testers only after the internal acceptance pass, then address TestFlight feedback before App Review.

## Google closed testing

- [ ] Create the Play Console app with package `app.thursdayleague.mobile`, enable Play App Signing, and configure FCM V1.
- [ ] Produce an EAS Android production AAB and upload it to an internal track first.
- [ ] Test on at least one modern physical Android device plus the available BlueStacks/emulator setup.
- [ ] Verify Android App Links, notification routing in foreground/background/terminated states, photo permission denial, back behavior, offline recovery, and account deletion.
- [ ] If Play Console says the personal developer account is subject to the post-13-Nov-2023 rule, run a closed test with at least 12 opted-in testers continuously for 14 days before applying for production access.

## Cross-platform acceptance matrix

- [ ] Fresh install and resumed onboarding progress.
- [ ] New signup with username, email, password, verification email, and normal subsequent login.
- [ ] Username-or-email sign-in and forgotten-password recovery.
- [ ] Invite link while logged out, league-code request, approval, duplicate/expired/used invite handling.
- [ ] Create, switch, and revisit multiple leagues without cached cross-league players, games, balances, Fantasy teams, or predictions.
- [ ] Member, admin, and owner permissions; ownership transfer; archive; three-created-league cap.
- [ ] Fantasy deadline and captain validation; private pre-match picks.
- [ ] Three-game prediction unlock, automatic markets, virtual stake controls, private slips, and final settlement.
- [ ] Notification opt-in/out and deep links for every enabled notification type.
- [ ] Profile photo add/replace/remove and denial handling.
- [ ] Offline, slow-network, expired-session, server-error, and retry behavior.
- [ ] Screen reader, largest practical text size, reduced motion, contrast, focus order, and touch targets.
- [ ] Privacy, terms, support, in-app deletion, public deletion, and owner-blocked deletion.
- [ ] No development URLs, secrets, JSON/database errors, test buttons, platform-owner controls, or model details visible to normal users or league admins.

## Submission and rollout

- [ ] Capture final screenshots only after the acceptance matrix passes.
- [ ] Reconcile Apple privacy labels and Google Data Safety against the exact shipped SDK list.
- [ ] Complete content-rating answers with simulated gambling disclosed and real-money gambling marked absent.
- [ ] Submit iOS and Android separately; keep a small buffer for review fixes.
- [ ] For the first production launch, prefer a controlled rollout and monitor authentication, API errors, push receipts, crash reports, support requests, and account deletions before expanding availability.

