# Roadmap

## Phase 1 — Foundation + gym logger + mock dashboard

Five pages, local workout flow, sample charts, goals, choice demo, PWA, schema and
contracts. Next: create/edit routines, real local comparable performance, data
export/recovery, multi-tab protection and Hevy CSV preview. Milestone: mobile
reload/edit/leave/return/finish/discard end-to-end tests.

## Phase 2 — Strava

Authenticated server provider, cursors, verified webhooks, idempotent jobs, registry
and duplicate review. Depends on Supabase auth/repository and tested owner RLS.
Milestone: replay without double-counting, unplanned activity support, recoverable sync.

## Phase 3 — Polar / recovery

Sensor provenance, underlying night/sleep data, mature personal baselines and
validated metrics. Depends on real matched samples. Milestone: traceable versioned
calculations, mixed-sensor/missingness tests, gym missing HR never penalized.

## Phase 4 — Decision engine + Plan

Family assessment, candidate comparison, progression gates, interference and
disruption reasoning, approved proposals, outcomes and optional Calendar context.
Depends on validated analytics. Milestone: calibrated uncertainty, coherent anomaly
alerts, no automatic rescheduling and retrospective outcome evaluation.

## Phase 5 — AI Coach + Consensus

Authenticated selective tools, summary-to-raw access, chat history, question-aware
research ranking and transparent fallback. Depends on safe access and deterministic
metrics. Milestone: grounded answers/citations, access isolation, quota handling and
coaching evaluations. Forecasts require separate validation.

Production milestones include privacy/security, data export/deletion, accessibility,
backup/observability, performance and full offline workflow testing.
