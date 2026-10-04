# Agent instructions

## Project status

Stillform is a Next.js App Router / React / strict TypeScript / Tailwind / Recharts
application. Use pnpm and preserve its lockfile. Read `docs/PRODUCT_SPEC.md` and
`docs/DECISIONS.md` before architectural changes. Supabase SQL is intended but
unapplied. External APIs, authentication, real analytics and AI remain stubs.

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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
