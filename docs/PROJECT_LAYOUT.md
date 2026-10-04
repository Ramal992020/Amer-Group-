# Project layout — where a change actually ships

> **Read this before editing anything.** This repo used to carry two copies of
> every source file: the real one under `src/`, and a leftover flat copy at the
> repository root. The root copies are **dead code** — they are not in the build
> and editing them has no effect on production.

## What the production build actually includes

```
index.html            → loads /src/main.tsx
src/main.tsx          → the only entry point
src/App.tsx           → the app
src/components/*.tsx  → UI
src/lib/*.ts          → sync, auth, walk-in engine, excel, backups
src/utils/cn.ts
src/index.css
public/               → icons + manifest (copied verbatim)
```

`vite build` bundles from `index.html` only. `tsconfig.json` also limits
type-checking to `["src", "vite.config.ts"]`, so a broken root-level `.tsx`
file would not even fail `tsc --noEmit`.

The build output is a **single file** (`vite-plugin-singlefile`): `dist/index.html`
contains the whole app inlined.

## Verifying that a fix really reached production

1. `npm run build`
2. Grep the artifact for something only your change contains:

```bash
grep -o "visibilitychange" dist/index.html          # sync foreground listener
grep -o "updated_at=lt\." dist/index.html           # revision-guarded PATCH
grep -o "return=representation" dist/index.html     # PATCH result is verified
grep -o "postgres_changes" dist/index.html          # Realtime subscription
grep -c 'rest/v1/`' dist/index.html                 # must be 0 — the /rest/v1/ root
                                                    # check is what killed sync
```

## Rotation model — team turns, manual sales choice

SITE and RESTA both rotate by **team (manager)**, never by a preselected person:

* `computeNextTeam()` (in `src/lib/walkin.ts`) decides *whose team* is on turn,
  starting from yesterday's unserved team (`carryOver.managerId`) and otherwise
  continuing after the most recently served team in the fixed cycle
  (`AUTOMATIC_TEAM_ORDER`). Teams with nobody available are skipped in place.
* The sales who sits with the client is **chosen manually** from that team
  (`availableTeamMembers()` only orders the picker by fairness). Nothing in the
  engine may propose a sales name — `ComputedTurn.salesId` stays `''` for these
  workspaces and `computeNextTurn`/`predictFullRound` delegate to the team path.
* The «الترتيب» tab renders `teamOrderFrom()` — managers, one row each, with
  their roster and the arrow buttons that write to `manualOrder` (manager IDs).
* The receipt (`DoneReceipt`) is exactly:
  `Walk in (Branch) Done ✅ / Sales : X Done✅ / Manager : … / Head : … / Next : …`
  where **Next is the next manager only** (no sales name). There is no
  `(shiftted)` line any more — the substitute concept is gone from the flow.
* A carry-over is consumed when its team is served (`managerId` match in
  `confirmWith`), so a served team is never pinned again.

## Sync layer — things that must stay true

* **Never call `GET /rest/v1/` (the PostgREST OpenAPI root) with the publishable
  key.** Supabase answers `401 Secret API key required` for `sb_publishable_…`
  keys. The old connection test did exactly that, so every device concluded
  «المفتاح غير صحيح» and sync never started in production (the `walkin_state`
  table stayed empty). Credentials are verified against the table itself.
* **Revision stamps use the server clock** (`syncNow()` in `src/lib/sync.ts`,
  learned from the `Date` response header). Comparing `Date.now()` from two
  different devices made the slower device lose its own edits.
* A guarded `PATCH` that matches zero rows is reported as `'stale'`, never as
  `'written'` (`Prefer: return=representation`).
* Polling is the source of truth; Realtime (`subscribeRemote`) only makes it
  instant when the table is in the `supabase_realtime` publication.

If the marker is missing, the change was made in a file the build never reads.

## Consequence

The stale root-level duplicates (`App.tsx`, `sync.ts`, `walkin.ts`, `auth.ts`,
`excel.ts`, `backups.ts`, `supabase.ts`, `ui.tsx`, `cn.ts` and the component
copies) have been removed so that a future fix cannot be written into a file
that never ships. If you ever need a file at the root again, it must be added to
`index.html`/`tsconfig.json`/an import — otherwise it is dead weight.
