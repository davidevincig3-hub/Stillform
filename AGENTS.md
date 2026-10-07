# Agent instructions

## Project status

Stillform is a Next.js App Router / React / strict TypeScript / Tailwind / Recharts
application. Use pnpm and preserve its lockfile. Read `docs/PRODUCT_SPEC.md` and
`docs/DECISIONS.md` before architectural changes. Supabase SQL is intended for
configured deployments. Polar v4 and dormant Strava OAuth, authenticated persistence and canonical activity sync are implemented server-side. Polar live ingestion is verified for the current owner. Recovery Engine V1 provides deterministic personal-baseline patterns with explicitly unvalidated product heuristics; Calendar, automated training decisions and AI remain stubs.
Gym logging and descriptive analytics use confirmed real local or account data.
Exercise performance V1 uses full relevant history before cloud pagination, with
recorded PRs separate from conservative effort-matched first-set load comparisons.
See docs/GYM_PERFORMANCE.md; no progression/stall/deterioration advice or AI.
Gym main's descriptive Performance Trend V1 is separate from conservative comparisons;
see docs/GYM_TREND.md. Preserve audited canonical model selection, snapshot groups,
fixed cohorts/gaps and equal exercise/group weights; never retrofit missing metadata.

## Working practices

- Inspect the current files and any nested `AGENTS.md` instructions before editing.
- Keep changes focused on the requested task and preserve existing user work.
- Follow the conventions established by the code once implementation begins.
- Avoid adding dependencies unless they are needed for the requested behavior.
- Never commit credentials, tokens, personal data, or local environment files.

## Validation

- `pnpm dev` starts the app; `pnpm build` and `pnpm start` serve production.
- Checks: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check`.
- Browser checks: `pnpm exec playwright install chromium`, `pnpm test:smoke`.
- Run the checks relevant to each change. Add meaningful tests for new behavior
  and bug fixes when a test framework is available.
- Report what was verified and any checks that could not be run.

## Documentation

- When creating the application, add a README covering its purpose, setup,
  configuration, and how to run it.
- Keep documentation and these instructions aligned with implemented behavior.

## Product invariants

- Business/analytics logic belongs outside React components.
- Label sample data and unavailable calculations; do not fabricate physiology.
- Preserve provenance, confidence, baseline maturity and evidence families.
- Missing gym HR is normal; duration is descriptive; target weights stay optional.
- Leaving a workout preserves it and provides the global return pill.
- Rescheduling requires approval; preserve original natural-language goals.
- Charts expose structured context; AI retrieves selectively and separates evidence.

## Gym persistence

Current Gym domain is `src/domain/gym.ts`; storage uses `adaptive-coach.gym.v2`
(version 2, schemaRevision 3: ID-keyed pinned/dismissed preferences). Retain legacy V1 decoder and tests. Old unmarked records require review
before entering personal history; discard all sample previous-performance strings.
Desktop development binds localhost; `pnpm dev:lan` explicitly enables a trusted LAN.
Local Gym backup is per browser/origin; JSON bootstrap is only for an empty local store.
Account Gym uses migration 0006 normalized owner tables, verified server auth, account CAS
and idempotent operation receipts. Preserve owner-keyed pending/rejected drafts and the
original desktop local key. Cloud bootstrap requires explicit approval and verified empty
account; never silently upload or merge. Phone cloud authentication requires trusted HTTPS;
HTTP LAN remains local-only. See docs/GYM_CLOUD.md. Test SQL with synthetic PGlite accounts.
Real queries filter completed confirmed-user origin and use stable exercise IDs.
Preserve routine/exercise snapshots, JSON formatVersion 1 and CSV export safety.
Never fill insufficient personal data with seeds. Hevy uses verified parsing,
explicit mappings, fingerprints and confirmed atomic batches. Never commit personal
local-imports/ files or copy their contents into fixtures. Browser tests use fresh
port 3100; set PLAYWRIGHT_PRODUCTION=1 to check a built production app.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
