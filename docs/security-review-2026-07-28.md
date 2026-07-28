# Security review — 2026-07-28

## Scope

Reviewed browser authentication, server API routes, Supabase row-level security, controlled database functions, betting wallet/settlement code, Fantasy privacy, account lifecycle, push notifications, backups, and deployment headers.

## Findings and changes

### IDOR and cross-user access

The application does not authorize access based only on a URL UUID. Browser data access is mediated by Supabase RLS, and privileged mutations use controlled functions that derive the caller from `auth.uid()`.

One real cross-user privacy issue was found: any authenticated user could query another user’s Fantasy picks before kickoff even though the normal interface did not display them. The read policies now expose pre-kickoff squads and picks only to their owner and administrators. League members can read them after kickoff for standings/history.

Bet slips and legs remain owner-or-admin readable. The previously removed public bet-slip function is explicitly revoked from `public`, `anon`, and `authenticated`.

### Bet placement

The server now enforces:

- one to the configured maximum number of selections;
- unique outcome IDs;
- one outcome from each database market;
- one logical line per player or market family, matching the interface;
- open, non-invalidated markets belonging to the requested game;
- game status and database lock time;
- positive two-decimal stakes and wallet sufficiency;
- maximum accepted odds and potential payout;
- a per-user placement burst limit;
- per-user transaction serialization to prevent concurrent wallet/rate races;
- idempotency through the user/request UUID pair.

The builder maximum remains five by default. Separate slips remain unlimited apart from balance, lock time, and the short-window abuse limit.

### RLS and database exposure

All user-data tables reviewed have RLS enabled. Sensitive writes use security-definer functions with explicit caller checks and revoked direct table writes.

`auto_expose_new_tables` is now disabled in local Supabase configuration. Every future migration must explicitly grant the minimum required privileges.

The API rate-limit table has RLS enabled, no `anon` or `authenticated` privileges, and a service-role-only mutation function. Stored limiter keys are SHA-256 digests rather than raw IP addresses or user IDs.

Profile avatars remain in a public Storage bucket by product choice. They must not contain private documents or sensitive personal information.

### Authentication and JWTs

No custom JWT parsing or unsigned-token trust was found. Server routes call Supabase `auth.getUser(token)`, which validates the token with the Auth service, and privileged routes also require an active administrator profile.

The service-role key remains server-only. It must never receive a `NEXT_PUBLIC_` prefix, be logged, or be sent to the browser.

Signup invite validation moved from browser JavaScript to a rate-limited server route. Direct public Supabase signup must be disabled in the Supabase Auth settings; otherwise an attacker could bypass the application route and its invite check.

Supabase Auth continues to provide login-endpoint throttling. Application-level signup and mutation limits add a separate layer but do not replace Supabase’s Auth protections.

### Passwords

In-session password changes now require reauthentication with the current password and require at least eight characters.

Forgotten-password recovery does not automatically trust a username-only request. Until verified recovery email is introduced, the app directs the user to an out-of-band identity check with the app owner.

### API abuse controls

Atomic server rate limits now cover signup, push-subscription writes, test notifications, custom/admin notifications, failed-delivery retries, and account-deletion attempts. Bet-placement throttling is enforced directly in PostgreSQL.

Redis was not added. PostgreSQL is sufficient for the current traffic and avoids a new availability dependency. A managed Redis limiter is appropriate later for high-volume public traffic, but authorization and wallet correctness must remain in PostgreSQL.

### Browser and deployment controls

The app now sends frame denial, MIME sniffing protection, strict referrer behavior, a restrictive permissions policy, production HSTS, cross-origin opener isolation, API no-store caching, and a report-only Content Security Policy.

The CSP is report-only intentionally. Sanitized violations are sent to the
application CSP-report endpoint and appear in server logs without query
strings, UUIDs, or cross-origin paths. Review those reports for required
Next.js, Supabase, analytics, and push origins before enforcing the policy; an
untested enforced CSP can break authentication or installed-app behavior.

## Residual work before public multi-league release

- Introduce `league_id` tenancy and membership checks on every league-owned row and function.
- Separate platform administrators from league administrators.
- Add verified recovery email and signed reset links.
- Promote CSP from report-only after compatibility observation.
- Configure and verify scheduled Storage object exports in GitHub Actions.
- Conduct an external penetration test after the multi-league migration.
- Add privacy/consent controls before persistent product analytics.
