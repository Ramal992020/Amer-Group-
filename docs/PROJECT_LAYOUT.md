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
```

If the marker is missing, the change was made in a file the build never reads.

## Consequence

The stale root-level duplicates (`App.tsx`, `sync.ts`, `walkin.ts`, `auth.ts`,
`excel.ts`, `backups.ts`, `supabase.ts`, `ui.tsx`, `cn.ts` and the component
copies) have been removed so that a future fix cannot be written into a file
that never ships. If you ever need a file at the root again, it must be added to
`index.html`/`tsconfig.json`/an import — otherwise it is dead weight.
