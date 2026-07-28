# Platform architecture roadmap

This document separates hardening that belongs in the current private, single-league app from architecture that should arrive with a public, multi-league release.

## Delivery order

The agreed product sequence is:

1. stabilize and observe the current private league;
2. improve model evaluation and modelling as real completed games accumulate;
3. polish and upgrade the product interface;
4. build the multi-league tenancy system;
5. prepare the resulting platform for public release.

Synthetic data may verify modelling code and simulations, but it must not be
treated as evidence that a trained model is better for this league.

## Decisions already applied

- Signup is performed by a server route using a server-only invite code.
- Supabase remains the JWT issuer and verifier; application API routes verify tokens with `auth.getUser` instead of trusting decoded claims.
- Application and bet-placement throttling use atomic PostgreSQL state. Redis is not required for the current traffic level.
- Fantasy selections remain private from other members until kickoff.
- Bet builder grouping, payout bounds, placement bursts, balances, game ownership, market state, and lock time are enforced in PostgreSQL.
- The private app is marked `noindex`. It has link-preview metadata, but it is not presented to search engines as a public marketing site.

## Multi-league data boundary

Multi-league support must be a database tenancy migration, not only a league switcher in the interface.

Recommended core tables:

- `leagues`: identity, display name, slug, owner, status, and settings;
- `league_memberships`: user, league, member role, membership status, and joined date;
- `league_invites`: league, hashed invite secret, expiry, use limit, rotation date, and creator;
- `app_roles`: platform-level support/owner roles that are independent from league administration.

Every league-owned table must receive a non-null `league_id`, including players, games, seasons, lineups, Fantasy records, betting records, notification dispatches, and audit records. Every read policy and every controlled function must prove active membership in that same league. UUID knowledge alone must never grant access.

Platform administrators should handle account recovery and platform abuse. League administrators should manage only their league’s games, roster, settings, and members. A league administrator must not receive another user’s password or platform-level recovery request.

## League invite codes

Generate the secret by default instead of asking owners to invent one. A human-friendly code using an unambiguous alphabet can still provide strong entropy when it is 12–16 characters long. Store only a keyed hash of the code, show the plaintext once, and let the owner rotate it.

An invite should support:

- optional expiry;
- optional maximum uses;
- immediate revocation/rotation;
- server-side attempt throttling;
- audit records for creation, use, failure bursts, and revocation.

Owners may choose a public league slug or display name, but that value must not be reused as the invite secret.

## Password recovery

The current username-only private deployment requires the current password before an in-session password change. Forgotten-password recovery remains a manual, out-of-band identity check with the app owner; a username-only web request cannot prove ownership and must never trigger an automatic reset.

Before public release:

1. collect and verify a real recovery email during account creation;
2. use Supabase’s signed, expiring recovery links;
3. redirect recovery links to a dedicated password-reset screen;
4. revoke other sessions after a successful reset;
5. notify the user of the password change;
6. expose recovery event status—but never tokens—in the platform audit log.

## Rate limiting and Redis

PostgreSQL is the right current limiter because it is already available, atomic, durable across serverless instances, and requires no new account or secret.

Move high-volume, short-window limits to a managed Redis service only when traffic justifies it. Keep database invariants such as wallet locking, payout bounds, idempotency, and one-selection-per-market-family in PostgreSQL even after Redis is introduced. Redis is an optimization and abuse-control layer, not an authorization system.

## Public site and app subdomain

A public release can use:

- `example.com` for the landing page, pricing, help, privacy, and public documentation;
- `app.example.com` for the authenticated product.

Separate deployments are useful for independent caching, indexing, release cadence, analytics, and security headers. They do not require unrelated repositories; a monorepo with separate apps/deployments is often easier to maintain.

Only the public landing deployment should expose `sitemap.xml` and be submitted through Google Search Console. The authenticated app should remain `noindex`, with private routes excluded from the sitemap.

## Personalized onboarding

Onboarding should be built after the multi-league membership context exists so it does not need to be replaced.

Recommended flow:

1. identify whether the user is creating a league or joining one;
2. explain only the features enabled for that league;
3. guide the user to the next useful action, such as enabling notifications, setting a Fantasy team, or creating the first game;
4. store progress server-side so it follows the user across browsers and installed-app contexts;
5. let users skip and resume;
6. use Tilo only for meaningful guidance, successful milestones, and recovery from empty states.

## Product analytics

Do not add PostHog merely as a passive script. First define the questions and a small event taxonomy, such as onboarding completion, lineup publication, Fantasy submission, bet placement, and places where a workflow is abandoned.

Before enabling persistent analytics:

- publish a privacy notice;
- avoid sending names, free text, lineups, bet details, or stable player identifiers;
- obtain consent before non-essential storage where required;
- provide a way to withdraw consent;
- set a retention period;
- disable session replay on sensitive forms and admin screens.

A cookie banner is required when the chosen configuration stores non-essential identifiers before consent. A deliberately cookieless configuration may change the consent requirement, but the privacy notice and data review are still necessary.
