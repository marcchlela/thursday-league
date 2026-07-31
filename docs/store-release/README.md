# Store release packet

This folder contains the copy, declarations, reviewer setup, and acceptance gates for Thursday League `1.0.0`. It is a working submission packet, not a claim that the app is already ready for production review.

## Release order

1. Finish the Phase 4 hosted-service gate in `docs/mobile-roadmap.md`: production migrations, FCM/APNs, verified links, Sentry, and physical-device checks.
2. Set `NEXT_PUBLIC_SUPPORT_EMAIL` in Vercel and deploy the public `/privacy`, `/terms`, `/support`, and `/delete-account` routes.
3. Create the Apple Developer and Google Play developer records. The identifiers are permanently locked to `app.thursdayleague.mobile`.
4. Create a dedicated reviewer league and non-expiring owner/member demo accounts using `reviewer-guide.md`. Never commit their passwords.
5. Enter `store-listing.md`, `privacy-and-content-declarations.md`, and the production URLs into both consoles.
6. Build signed production artifacts with EAS, distribute through TestFlight and Google closed testing, and run `beta-acceptance.md` on physical devices.
7. Capture final screenshots from the signed build and submit only after every blocking checkbox is complete.

## Current hard blockers

- A paid Apple Developer Program membership is required for App Store Connect, signed iOS distribution, TestFlight, APNs, and the Apple Team ID.
- A Google Play developer account and app record are required for Play App Signing, FCM production credentials, closed testing, and submission.
- The confirmed public support and privacy email is `thursdayleagueapp@gmail.com`; `NEXT_PUBLIC_SUPPORT_EMAIL` remains available as an override.
- The confirmed personal publisher and copyright name is `Marc Chlela`.
- Hosted Supabase does not yet have the two Phase 4 native-push migrations from this branch.
- Store screenshots and demo credentials must be created from the final signed release environment, not local development data.

## Official references

- Apple: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), [app privacy details](https://developer.apple.com/app-store/app-privacy-details/), [account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app), and [age ratings](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/).
- Google Play: [User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311), [Data Safety](https://support.google.com/googleplay/android-developer/answer/10787469), [account deletion](https://support.google.com/googleplay/android-developer/answer/13327111), [content ratings](https://support.google.com/googleplay/android-developer/answer/9859655), and [personal-account testing](https://support.google.com/googleplay/android-developer/answer/14151465).
