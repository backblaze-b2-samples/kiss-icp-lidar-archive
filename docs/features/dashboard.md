<!-- last_verified: 2026-09-14 -->
# Feature: Dashboard

## Purpose
Give an at-a-glance overview of the LiDAR SLAM archive: how many sessions exist,
how much scan data is in B2, and how much trajectory has been reconstructed.

## Used By
- UI: `/` page (dashboard home)
- API: `GET /sessions/stats`, `GET /sessions`

## Core Functions
- `apps/web/src/components/dashboard/lidar-stats-cards.tsx` — 5 stat cards (sessions, scan frames, scan data, maps built, trajectory distance)
- `apps/web/src/components/dashboard/sessions-chart.tsx` — frames-per-session bar chart (recharts)
- `apps/web/src/components/dashboard/recent-sessions-table.tsx` — the latest sessions with status
- `apps/web/src/lib/queries.ts` — `useSessionStats()`, `useSessions()`
- `services/api/app/runtime/sessions.py` — `GET /sessions/stats` handler
- `services/api/app/service/sessions.py` — `get_stats()` aggregation over every session record

## Canonical Files
- Dashboard page layout: `apps/web/src/app/page.tsx`
- Stats aggregation: `services/api/app/service/sessions.py`

## Inputs
- None (dashboard loads data automatically)

## Outputs
- `GET /sessions/stats` → `SessionStats` (total_sessions, total_frames, total_scan_bytes, total_scan_bytes_human, maps_built, total_trajectory_distance_m)
- `GET /sessions` → `Session[]` for the chart and the recent-sessions table (newest-first)

## Flow
- Page loads → `useSessionStats()` and `useSessions()` fetch in parallel
- Stat cards render the aggregated metrics; the chart plots archived scan frames per recent session; the table lists recent sessions with a status badge linking to each detail page
- While any session is ingesting/running, `useSessions()` polls so the dashboard advances on its own

## Edge Cases
- API unavailable → inline error states with retry
- No sessions yet → empty states invite creating a first session
- `get_stats()` reads every `sessions/<id>/index.json`, so on very large archives it is a list + N gets; acceptable for a demo, and a summary index is the natural optimization

## UX States
- Loading: an on-screen loading notice above the cards, plus skeletons for the chart and table
- Empty: "No sessions yet" / "No archived scans yet"
- Loaded: populated cards, chart, table

## Verification
- Test files: `services/api/tests/test_sessions.py`, `apps/web/src/lib/queries.test.ts`
- Required cases: stats aggregation across sessions, session list rendering, empty and error states
- Focused verify command: `pnpm test:api`
- Default pre-PR verify command: `pnpm verify`
- Full local verify command: `pnpm verify:full` when the E2E/live prerequisites in [Verification](../verification.md#non-live-verification) are available
- Pass criteria: focused tests and `pnpm verify` green; explain any skipped `pnpm verify:full` prerequisites

## Related Docs
- [LiDAR Sessions](lidar-sessions.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [App Workflows](../app-workflows.md)
