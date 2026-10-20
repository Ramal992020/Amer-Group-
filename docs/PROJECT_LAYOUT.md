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
grep -o "Shifted ❌" dist/index.html                  # receipt line for a passed-over team
grep -o "كل تيم ليه شريط لون منفصل" dist/index.html  # colour-coded team cards
grep -o "تم حفظ الدورة وتثبيتها" dist/index.html       # toast after saving the turn order
grep -o "الحضور المجمع" dist/index.html           # combined SITE+RESTA attendance file
grep -c 'rest/v1/`' dist/index.html                 # must be 0 — the /rest/v1/ root
                                                    # check is what killed sync
```

## Attendance screen — one visible card per team

The «الحضور» tab must never show two teams as one continuous list of names.
Every manager team is rendered by `AttendanceBoard` as its own card:

* a **solid colour band** (`TEAM_THEMES` + `teamThemeAt` in
  `src/components/AttendanceBoard.tsx`) carrying the team's running number
  (`01`, `02`, …), `تيم <manager>`, the Arabic name, the head name, the
  manager's mobile and `x/y حاضر`;
* a 2px border in the same colour and a neutral body holding that team's
  person cards.

The colour is derived from the team's position in the full roster
(`managers.findIndex`), **not** from the filtered/searched list, so a team keeps
its identity while searching and when someone is absent. `TEAM_THEMES` cycles
eight complete literal class sets (brand, sky, emerald, violet, orange, teal,
rose, indigo) — keep them as literals so Tailwind emits them. Both layouts
(«طولي» rows and «عرضي» grid) render inside the same team card; the toggle may
change the arrangement of names but must not merge two teams. The line
«كل تيم ليه شريط لون منفصل» under the intro is the build marker for this.

## Attendance Excel («تحميل Excel الحضور»)

The workbook is built by `createAttendanceWorkbook()` in
`src/lib/attendanceExcel.ts` and must stay readable on a phone in the morning:

* Layout is the team's template, **six columns, no extra columns**:
  `sales | Director | Head | Shift time | time in | Mobile Number`
  with a merged navy `Sales Team` title row (#172943), a red header row
  (#C00000), then a 39-row canvas.
* **Every cell is bold.** Attendees come first, followed by one blank row
  and absent roster members with their director, head, shift and phone details.
  Absent rows show `لم يحضر` in `time in`; only their name cell is red
  (#FF0000), with all other data cells white. Missing attendance counts as
  absence, but attendance in either branch wins when merging the two branches.
* **One font size for the whole sheet: Arial 20** (`FONT_SIZE` in
  `attendanceExcel.ts`) — the title row, the red header row and every data row
  carry the same size, so a name is readable without zooming. Excel sizes fonts
  in points; 20 pt is what the font box shows (≈ 27 px on screen — a literal 20
  px would be `FONT_SIZE = 15`).
* **Rows and columns are AutoFitted to that text** by `autoFitColumns()` /
  `autoFitRows()`: a column's width is measured from its widest cell using
  Arial's own glyph advances (`textWidthPx()`, with a fallback for Arabic) and
  converted to Excel's width unit (`wch = (px − 5) / 7`), and every row is one
  fitted line high (`hpt ≈ 1.3 × the font size` → 26 pt at size 20). No
  hard-coded column widths are left, so a longer name simply widens its column.
  The merged `Sales Team` title is excluded from the measurement — it rides all
  six columns and must not stretch column A.
* **Manager numbers live in the normal `Mobile Number` column**, on the
  manager's own attendance row — exactly like a sales number, so nothing about
  the sheet layout changes. They are edited from «الهيكل»: the manager appears
  in his team's roster chips (badge «مدير») with the same pencil as a sales
  person (name + number + shift), and the pencil next to the team name can set
  the number too. `ManagerTeam.phone` mirrors the number so it rides the shared
  roster (SITE ⇄ RESTA) and `mobileFor()` falls back to it for older rows.
* **One combined file for BOTH branches.** «تحميل Excel الحضور» merges the
  attendance of SITE and RESTA into ONE sheet, downloadable from either branch:
  `attendanceRowsFor()` builds one branch's full roster rows and
  `mergeAttendanceRows()` (both in `src/lib/attendanceExcel.ts`) keeps **one
  row per person**. On the attendance screen the manager selects SITE or RESTA
  before tapping a person; the app writes that person to the selected account
  and clears their attendance from the other account, then shows a short
  confirmation if the selected branch is the other one. The other branch's
  attendance is read from its cloud row (`pullRemote(otherWorkspace(account))`)
  and falls back to that branch's local mirror (`loadPersisted(other)`) when
  offline. The first-check-in rule is retained only to de-duplicate any legacy
  rows that were recorded in both branches before this flow; no column marks
  the branch, so the template stays six columns.

Grepping the build for `Manager Number` must return **0** and `BFBFBF` must be
absent from the sheet styling.

### Managers who are not printed in the attendance table

Some managers stay on the shared org chart — they keep their team, their
history, their mobile number in «الهيكل» and their attendance data — but their
own names must **not** appear in the attendance table (screen or Excel):

| Person | accepted spellings (matched, not printed) |
| --- | --- |
| Dina Abdo | `Dina Abdo`, `Dina Abdou`, `دينا عبده` … |
| Ahmed Sultan | `Ahmed Sultan`, `Ahmed Soltan`, `أحمد سلطان` |
| Hany Elshenawy | `Hany Elshenawy`, `Hany El Shenawy`, `هاني الشناوي` |
| Moataz Mandoh | `Moataz Mandoh`, `Moataz Mandouh`, `معتز مندوه` |

The list is `HIDDEN_FROM_ATTENDANCE` in `src/lib/attendanceVisibility.ts`, and
matching goes through `normalizeAttendanceName()` — case, spacing, hyphens,
dots, Arabic diacritics and the Arabic letter variants (`أ إ آ` → `ا`,
`ى` → `ي`, `ة` → `ه`) are all ignored. The filter is applied wherever an
attendance table is produced, so no path can leak one of those names:

* `attendanceRowsFor()` — one branch's rows (used by the screen export),
* `mergeAttendanceRows()` — the combined SITE + RESTA file,
* `createAttendanceWorkbook()` — the last gate before the `.xlsx` is written,
* `AttendanceBoard` renders `visibleAttendanceSales(sales)` instead of the raw
  roster, so a hidden manager gets no card; a team left with no visible member
  disappears, while a hidden manager who still has real sales keeps their team
  card and their names (hiding them would drop people who do attend).

Deleting those managers from «الهيكل» instead would throw away their team,
their history and their rotation slot — that is why this is a filter, not a
deletion. Their data, their phone number and their own attendance stay intact.

### The Director column

`directorFor(managerName, headFallback, managerId)` in `attendanceExcel.ts`
resolves, in this order:

1. `DIRECTOR_RULES` — name rules that override the Head above the manager.
   **Sayed Naser reports to Ahmed Fawzy**, so every row of his team prints
   `Ahmed Fawzy` in `Director` (matches `sayed nas…` and `سيد ناصر`, whatever
   id/head the team has — ids added from «الهيكل» are generated, not built-in);
2. the built-in team id (`DIRECTORS`, e.g. `ahmed` → Sayed Magdy);
3. a known manager name (`DIRECTORS_BY_NAME`);
4. the Head's name (the old fallback).

Name lookups use `normalizeAttendanceName()`, so case, spacing and the Arabic
letter variants never break a director.

## Rotation model — team turns, manual sales choice

SITE and RESTA both rotate by **team (manager)**, never by a preselected person:

* `computeTurnPlan()` (in `src/lib/walkin.ts`) returns the whole picture of the
  turn, with attendance handled separately from the cycle:
  * `onTurn` — the team the cycle points at, **regardless of attendance**. A
    carried-over team (`carryOver.managerId`, not served today) is on turn even
    when it is absent; otherwise the turn continues after the most recently
    served team. So «الدور الحالي» always shows a team, even when nobody has
    checked in.
  * `serving` — the first team from `onTurn` (inclusive) with an available
    member, or `null` when nobody is available anywhere.
  * `shiftedTeams` — the teams between `onTurn` and `serving` that have nobody
    free, each with a reason: `absent`, `busy`, or `allAbsent` (nobody in the
    whole cycle checked in).
  `computeNextTeam()` is kept and returns only `serving`, so older callers and
  tests behave as before. The cycle order itself never moves: a passed-over team
  is simply not served this round, and the cursor moves past the served team.
* When `serving !== onTurn` the UI shows the amber notice «محدش حضر منه — المقابلة
  بالتيم التالي», and the «ابدأ المقابلة» button starts with the serving team.
  The modal receives `team` (= serving) plus `shiftedTeams`. The confirmed
  assignment records them as `Assignment.shiftedTeams`.
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
* The copy text is built by `receiptText()` (`src/lib/walkin.ts`), which
  `DoneReceipt` also displays:
  * normal visit: `Walk in (Site) Done ✅ / Sales : X Done✅ / Manager : … / Head : … / Next : …`
  * visit with passed-over teams (exact, one line per team):
    `Walk in (Site) / <team> Shifted ❌ / <sales> ✅ / Manager : … / Head : … / Next : …`
  `Next` is **always the successor team in the cycle** (`successorTeam`), even if
  that team has nobody present — it is not the serving team and never a sales
  name. The spelling `Shifted ❌` is fixed on purpose.
* Visit type is **Site or Resta only** (no «Walk in» option in the modal). The
  default is the branch you are signed into (RESTA → `resta`, otherwise `site`)
  and it is restored after every confirmed client. `walkin` remains only as the
  legacy value stored in old history rows.
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
* The same guard covers a **same-revision** row while this device has an
  unpublished edit (`orgDirtyRef`, e.g. a turn-order choice not yet pushed):
  `canAdoptRemoteOrg(incoming, local, localDirty)` adopts only when
  `incoming > local`, or `incoming === local && !localDirty`. Otherwise the local
  roster is kept and republished. Before this, the same-revision copy reset a
  custom turn order back to «تلقائي». Saving the order shows the toast «تم حفظ
  الدورة وتثبيتها».
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
