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
grep -o "الفرع الآخر" dist/index.html                # shared roster (org) sync
grep -o "يظهر في الفرعين SITE و RESTA" dist/index.html # «إضافة عضو جديد» subtitle
grep -c 'rest/v1/`' dist/index.html                 # must be 0 — the /rest/v1/ root
                                                    # check is what killed sync
```

## Rotation model — team turns, manual sales choice

SITE and RESTA both rotate by **team (manager)**, never by a preselected person:

* `computeNextTeam()` (in `src/lib/walkin.ts`) decides *whose team* is on turn,
  starting from yesterday's unserved team (`carryOver.managerId`) and otherwise
  continuing after the most recently served team in the active cycle. Teams
  with nobody available are skipped in place.
* The cycle order itself is a **setting chosen in the app** («طريقة ترتيب
  الأدوار» in the «الترتيب» tab), not a code constant:
  `TeamCycleSettings` is either `auto` (the built-in `AUTOMATIC_TEAM_ORDER`,
  the historical behavior) or `custom` (an explicit manager-ID order, so a
  newly joined manager can be added to the rotation without touching the
  source). The settings live on the **shared org chart** (`OrgChart.cycle`),
  so SITE and RESTA always rotate with the same order; the branch snapshots
  carry a copy as `PersistedWalkin.teamCycle` (read back by `hydrate`).
* The sales who sits with the client is **chosen manually** from that team
  (`availableTeamMembers()` only orders the picker by fairness). Nothing in the
  engine may propose a sales name — `ComputedTurn.salesId` stays `''` for these
  workspaces and `computeNextTurn`/`predictFullRound` delegate to the team path.
* The «الترتيب» tab renders `teamOrderFrom()` — managers, one row each, with
  their roster and the arrow buttons that write to `manualOrder` (manager IDs).
* The receipt (`DoneReceipt`) is exactly:
  `Walk in (Branch) Done ✅ / [Sales : S Shiffted ❌ …] / Sales : X Done✅ /
  Manager : … / Head : … / Next : تيم …`
  * **Shiffted ❌ lines are optional and MANUAL**: on the assign screen, tapping
    a busy or absent member marks him «Shiffted» (`shiftedIds` in `App` →
    `Assignment.shiftedSales`, read from `teamTurnOrder()` so the statement and
    the picker can never disagree about the order). Each marked member prints
    one `Sales : … Shiffted ❌` line before the `Done✅` line — «كان على الدور
    واتخطى (مشغول / مش موجود)». Available members can never be marked.
  * **Next is the LITERAL next team in the cycle** (`successorTeam()` after the
    served team) — even when nobody from that team attended. The engine's own
    rotation (`computeNextTeam`) still skips empty teams; only the written
    statement names the pure-cycle successor, and with the plain team name
    (no attendance note).
* A carry-over is consumed when its team is served (`managerId` match in
  `confirmWith`), so a served team is never pinned again.

## One roster for both branches — SITE ⇄ RESTA

The org chart (Heads + manager teams + sales roster) is **shared by the two
branches**, while attendance, history, carry-over and the manual order stay
**per branch**. A manager/Head/sales added or renamed in SITE must therefore
show up in RESTA (and the other way round) without either branch losing a day:

* The roster is published to its own row in the same table:
  `walkin_state.account = 'ORG'` (`SHARED_ORG_ACCOUNT` in `src/lib/sync.ts`).
  The two per-branch rows (`SITE`, `RESTA`) keep only their own day.
* `hydrateOrgChart` / `OrgChart` (`src/lib/walkin.ts`) is the normal form of
  that row; `applyOrgChart` (`src/lib/org.ts`) merges it into a branch:
  renames run through the rename helpers first (so this branch's `history`,
  `carryOver` and receipts print the new name), then the chart's lists become
  the roster. **Ids never change**, so attendance, counters and the fixed team
  cycle keep pointing at the same people. A member added elsewhere simply
  starts as «لم يحضر» here.
* `orgRevision` (in the branch payload, `PersistedWalkin.orgRevision`) is the
  revision of the shared chart a device already has. A branch row whose roster
  is older than that is **not** allowed to overwrite the local one — the row is
  marked dirty and republished with today's roster instead. Without this, a
  stale attendance push from one device could silently undo a rename made in
  the other branch.
* `mirrorOrgChart` copies the roster into the *other* branch's local bucket on
  the same device, so switching branch shows the new names instantly (and even
  offline). It never downgrades a bucket that already holds a fresher chart.
* **Renames and deletions of built-ins must survive hydration.** `mergeById`
  lets the SAVED copy win for the same id — otherwise every rename of a
  built-in person reverted on the next reload / cloud round-trip — and
  `removedIds` (also part of the shared chart) keeps a deleted member from
  coming back from the built-in defaults. New built-ins added in code are still
  appended.
* Sync cadence: the roster row is polled every 20s (60s when hidden) instead of
  every 4s, plus Realtime (`walkin_state` `account=eq.ORG`) and a pull when the
  app returns to the foreground. `reconcileSharedOrg()` runs on every connect:
  pending local edit → push, otherwise the fresher chart wins. When the row is
  missing (first run after this feature) it is seeded from **both** branches —
  `mergeOrgCharts` unions the two rosters so a member that only exists in one
  of them is not dropped.

## «الهيكل» tab order

Top → bottom, and it is deliberate:

1. **إضافة عضو جديد** (`AddMemberPanel`) — first card.
2. **الهيكل الحالي** (`ManageOrgPanel`) — rename/delete in place.
3. النسخ الاحتياطي والاستعادة (`BackupPanel`) then المزامنة بين الأجهزة
   (`SyncCard`) under a small divider — the maintenance cards belong at the
   bottom of the tab, not above the daily work.

## Renaming members — edit in place, never delete + re-add

Heads, managers and sales are renamed from «إدارة الفريق» (the pencil next to
any name) through `src/lib/org.ts`:

* `renameHead` / `renameManager` / `renameSalesPerson` rewrite **only names**.
  The `id` never changes, so `salesState` (attendance, check-in order, walk
  counts), the fixed team cycle, the manual «الترتيب» order and every
  already-served turn keep pointing at the same person.
* History stores name copies (`managerName`, `headName`, `salesName`,
  `originalSalesName`), and `carryOver` stores them too — every one of them is
  updated, otherwise the leaderboard/recap/receipt would keep printing the old
  name.
* A manager is both a team and an attendance row (`${managerId}-self`, or the
  manager id itself for the built-in people): renaming a manager updates the
  team record and his own row, so the «مدير» chip never drifts from the team
  name. Never leave those two out of sync.
* Arabic labels follow the same rule: `undefined` keeps the stored `ar`,
  a cleared field falls back to the Latin name (rotation reasons print it).

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
