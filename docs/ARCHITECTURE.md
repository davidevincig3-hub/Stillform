# Architecture

| Module                      | Boundary                                                            |
| --------------------------- | ------------------------------------------------------------------- |
| `src/app`, `src/components` | Routes, presentation, form orchestration                            |
| `src/domain`                | Canonical entities, confidence and validation                       |
| `src/repositories`          | Data access contracts, seeds, versioned local workout storage       |
| `src/integrations`          | Replaceable Polar/Strava/Calendar/Hevy contracts; provenance/dedup  |
| `src/analytics`             | Pure helpers and calculation/recovery/running/resistance interfaces |
| `src/decision`              | Candidate comparison, progression gates, intra-workout interfaces   |
| `src/ai`                    | Context-aware coach and selective repository tool dependencies      |
| `src/research`              | Question-aware evidence provider; unavailable Consensus stub        |
| `src/auth`, `src/config`    | Demo identity and explicit configuration                            |
| `supabase/migrations`       | Intended PostgreSQL model and owner RLS                             |

App Router provides real URLs. A React external-store subscription restores
versioned, Zod-validated localStorage after hydration; writes finish before navigation. Lifecycle
logic and validation live outside components. UI never computes physiology.
Reusable assessment/chart components suffice; shadcn is not necessary yet.

Future flow: provider → immutable raw record → normalize/deduplicate → canonical
data plus field provenance → versioned deterministic metrics → evidence-family
assessment → candidate comparison → user choice → outcome.

V1 flow: clearly labeled fixtures → UI; set entry → validation/local store → active
pill/completed history. Goals and demo proposal choices also persist locally.
SQL does not power V1. A Supabase repository will implement the same interfaces,
with an explicit local-data migration path and server-only service credentials.

ChartContext exposes points, timeframe, unit, baseline/maturity, confidence,
calculation version and mock flag. The future coach receives this directly, plus
deterministic trend calculations, rather than screenshots. Repository tools retrieve
summaries first, progressively accessing deeper history/streams/raw data. Do not
dump the complete database into the model or ask it to recalculate known metrics.

Browser storage is per device and not backed up. Load/write failures are visible.
Invalid original data is preserved until a new save. Multi-tab arbitration and
offline editing remain TODOs. Service worker caches only a static offline page,
never private API responses. Deployment requires HTTPS for PWA installation.

Before real users: authentication, SQL/RLS tests, secure credentials, consent,
export/deletion, backups, observability and accessibility review.
