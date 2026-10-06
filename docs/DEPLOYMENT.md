# Private production deployment

Stillform runs as an authenticated Next.js application on Vercel, with Supabase as
the durable Gym, Activity Registry, Polar and Recovery store. No desktop server,
LAN certificate, tunnel or second database is required for daily use.

Production origin: **https://stillform-pied.vercel.app**

## Security and origins

`APP_ORIGIN` is the canonical app/OAuth origin. `APP_TRUSTED_ORIGINS` accepts
comma-separated exact origins, never wildcards, paths, credentials or external HTTP.
Local development additionally accepts localhost/loopback and the launcher's exact
verified HTTPS LAN IP. Production automatically trusts no LAN, preview or forwarded
host; add another HTTPS origin explicitly only if it is actually served by this app.

Mutating routes require the Origin header to match the actual request origin, which
must be trusted. Two allowlisted origins cannot perform cross-origin writes against
one another. Next's development bind-host workaround resolves only explicit trusted
authorities and preserves the request protocol; HTTP LAN remains rejected. Owner-bound
Supabase checks still apply independently.

Production pages require an encrypted Stillform session through Next Proxy. This is
an optimistic page gate; every personal-data API verifies the current Supabase user
and owner, refreshing the existing Auth session when necessary. Cookies remain
HttpOnly, SameSite=Lax and Secure on HTTPS. `/login` uses existing email/password
Supabase authentication; it introduces no signup or new authentication provider.
Main login governs every section and account Gym connects automatically. An existing
Gym sign-in is also usable for registry/Recovery reads on the same origin. Sessions
are separate between domains/devices; sign into the same account on each device.

`APP_REQUIRE_AUTH=true` enables the gate explicitly; Vercel production enables it
regardless of that flag. Local `pnpm dev` and `pnpm dev:https` retain their workflows.
Static source bundles, login, manifest and the generic offline page remain public;
personal data and tokens are never cached by the service worker. API routes retain
their own authorization and are not authenticated by the page gate alone.

## Vercel setup and secrets

The project uses Node 24, Next.js preset, `pnpm install --frozen-lockfile`, and
`pnpm build`. `vercel.json` limits API function execution to 60 seconds.
CLI linking state lives in ignored `.vercel/`. `.vercelignore` excludes env files,
private imports/backups, development integration files, certificates/keys and build
artifacts before upload. Next tracing also excludes private inputs.

Configure these in Project > Settings > Environment Variables, **Production only**:

| Variable                     | Value / treatment                                    |
| ---------------------------- | ---------------------------------------------------- |
| `APP_ORIGIN`                 | `https://stillform-pied.vercel.app`                  |
| `APP_TRUSTED_ORIGINS`        | `https://stillform-pied.vercel.app`                  |
| `APP_REQUIRE_AUTH`           | `true`                                               |
| `INTEGRATION_STORAGE`        | `supabase`                                           |
| `SUPABASE_URL`               | Existing project HTTPS URL                           |
| `SUPABASE_PUBLISHABLE_KEY`   | Existing key, server-side here                       |
| `SUPABASE_SECRET_KEY`        | Existing key; Sensitive                              |
| `INTEGRATION_ENCRYPTION_KEY` | **Exact existing key**; Sensitive; do not regenerate |
| `POLAR_CLIENT_ID`            | Existing application ID                              |
| `POLAR_CLIENT_SECRET`        | Existing secret; Sensitive                           |
| `POLAR_TIME_ZONE`            | `Europe/Rome`                                        |

Keep any currently configured Strava variables if needed; Strava remains dormant.
Never upload `DEV_INTEGRATION_ACCESS_KEY`, local CA material, OAuth tokens or `.env.local`.
OAuth tokens are already encrypted in Supabase and are not deployment environment
variables. Do not prefix any secret with `NEXT_PUBLIC_`. Sensitive settings must be
entered in the dashboard or passed to `vercel env add` through stdin, not command
arguments, logs or chat. No production secrets are provided to preview deployments.
Vercel project/team access is authorized through its normal CLI device login.

Commands from the linked repository:

```powershell
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
$env:PLAYWRIGHT_PRODUCTION = '1'
pnpm test:smoke
pnpm test:private
pnpm dlx vercel deploy --prod --scope davide-96d4
```

This repo currently has no Git remote; CLI deployment is deliberate. Do not enable
unreviewed automatic production deployment. Vercel's standard preview protection may
remain enabled; daily production access uses Stillform authentication. Hosting quota
and function/body limits still apply; no paid plan is selected automatically. Large
future CSV uploads/backups may exceed platform request limits and need a separate
upload design. Existing cloud history requires no new bootstrap.

## Supabase dashboard

Current email/password authentication makes a server-to-server password token request:
**no redirect allowlist or Site URL change is required for this login flow.** Keep the
existing localhost redirects. For future email/reset/link authentication, set the Site
URL to the production origin and add the implemented production callback before using
that flow; it is not implemented in this task. Do not register an invented callback or
broad wildcard. Existing deployed schema/RLS and authenticated owner checks are retained.

## Polar dashboard

Before any future OAuth authorization, register the exact redirect:

**https://stillform-pied.vercel.app/api/polar/callback**

If Polar supports multiple redirects, add it and preserve
`http://localhost:3000/api/polar/callback`. If only one redirect is allowed, replace the
localhost redirect with production; localhost cannot initiate OAuth until restored.
The developer dashboard change is a user action. Do not disconnect or reauthorize the
existing account: persisted credentials, refresh token, source IDs, raw payloads and
checkpoints remain usable from production with the same encryption key.

OAuth always uses `APP_ORIGIN`; authorization from a noncanonical LAN origin is refused
with a clear instruction to use the canonical Integrations page. Existing connection
reads/sync do work on trusted LAN origins. This prevents state cookies being created on
one host while the provider callback lands on another. Provider API requests remain
server-side. No provider OAuth is invoked as deployment verification.

## Acceptance checks and phone use

Open the production URL on cellular/another Wi-Fi and sign in once with the same
Stillform account. Confirm Gym recent history and shortlist, paged workout history,
Running registry, real Recovery state, and Integrations connection status. No JSON
restore, CSV import, sync or data migration is required. Local desktop backups remain
independent and unchanged. Do not create a live test workout just to validate hosting.

Automated suites use synthetic data and isolated unconfigured servers. The private
suite runs at port 3101 with its own synthetic session key and verifies page gating,
mobile login, API authentication and cross-site write rejection. Regular browser tests
cover active draft persistence/resume, pending writes/retries, shared histories and
mobile navigation. Live deployment acceptance is read-only apart from normal account
sign-in/session refresh. Check function logs only for sanitized errors; never dump env,
request bodies or auth headers. Current Plan/other sample features remain labelled as
before; hosting does not turn them into real physiological decisions.

### Verified deployment, 2026-10-06

Production sign-in and session persistence were verified in the authenticated browser.
Gym reads the existing 139 exercises, 287 workouts, 1,557 workout exercises and
3,658 sets; its recent/frequent shortlist contains 24 exercises. Running shows the
four Polar runs. Recovery and Home report insufficient overnight evidence, with
0 valid sleep nights and 2 excluded raw records. Integrations reads the existing
Polar connection without an origin rejection; Plan retains its explicit sample labels.
Production mobile checks at 390px and 430px showed no horizontal overflow.

Typecheck, lint, formatting, production build, 221 unit tests, 50 regular browser
tests and 2 private-access browser tests passed. One existing personal-CSV test is
intentionally skipped without its private fixture. Anonymous access, cross-site
write rejection, Supabase anonymous RLS denial and server-secret bundle exclusion
were checked. Localhost development still serves both loopback names; trusted HTTPS
LAN development remains available. No live workout/recovery history, OAuth connection
or sync checkpoint was changed during verification. The desktop migration backup's
checksum remains unchanged. The Polar dashboard callback registration above remains
a manual prerequisite for future OAuth authorization.
