# Store reviewer guide

Copy the final version into App Store Connect review notes and Google Play App access. Store credentials only in the consoles or the team’s password manager—never in Git, source code, screenshots, or support pages.

## Reviewer environment to create

Create a dedicated league named `Thursday League Review` in the production environment with:

- one owner review account and one member review account;
- at least eight active roster players with non-sensitive fictional names;
- three completed games with valid lineups, scores, events, and player statistics so virtual predictions are unlocked;
- one upcoming draft game with both team lineups saved;
- Fantasy and predictions enabled;
- generated prediction markets for the upcoming game;
- one saved Fantasy team and one virtual prediction slip on the member account;
- notification preferences visible, without requiring a reviewer to grant notification permission;
- no real people’s names, emails, profile photos, or match history.

The accounts must not expire, require a one-time password, force email verification during review, or own production/user leagues. Disable rate-limit surprises by signing in once after creation, then leave the data unchanged.

## Credentials template

Enter these values in the private review fields:

- Owner username: `[REVIEW_OWNER_USERNAME]`
- Owner password: `[REVIEW_OWNER_PASSWORD]`
- Member username: `[REVIEW_MEMBER_USERNAME]`
- Member password: `[REVIEW_MEMBER_PASSWORD]`
- League: `Thursday League Review`
- Invite/join code: not needed; both accounts should already be members

## Review notes template

Thursday League is a private recreational football organizer. It requires an account because all content belongs to a league membership.

Use the member account for the normal experience: Home, Games, Players, Fantasy, and virtual Predictions. The review league contains three completed games so Predictions are unlocked and an upcoming game with saved lineups so Fantasy selection can be tested.

Use the owner account to review roster, fixture, lineup, result, season, and member controls. Platform-owner tools are web-only internal operations and are not part of the consumer app.

The prediction feature uses virtual league coins only. There are no purchases, deposits, withdrawals, prizes, transfers for value, or real-money gambling.

Account deletion is available at Profile → Account security → Delete account. The public deletion page is https://thursday-league.vercel.app/delete-account. The demo owner cannot delete until league ownership is transferred or the review league is archived; this protects leagues from being left ownerless. The member demo account can exercise the deletion control, so replace it immediately if a reviewer deletes it.

Push notification permission is optional. Core review does not depend on granting it.

## Pre-submission reviewer test

- Sign in using username and using verified email.
- Confirm both accounts land in the review league with no onboarding dead end.
- Confirm the member cannot open admin controls or read another user’s private pre-match Fantasy/prediction records.
- Confirm owner controls work without platform-owner/model/notification-delivery tools.
- Confirm predictions show the `3/3` unlock state and clearly say virtual coins.
- Confirm every screen in the screenshot sequence contains the same current data.
- Confirm `/privacy`, `/terms`, `/support`, and `/delete-account` load while signed out.
- Confirm the support page shows the real public support email.

