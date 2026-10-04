// ─── Supabase sync (Project URL + Publishable Key) ───
//
//  • Every device logged in with the SAME workspace (SITE / RESTA) shares one
//    row inside YOUR Supabase project — all edits appear on every phone.
//  • The team's Project URL + Publishable Key are built into the app, so a
//    device connects by simply pressing "اختبار وحفظ الاتصال" once.
//  • If the project uses an older/different table shape we auto-probe it;
//    otherwise a copy-paste SQL block is shown to create the standard table.
//
//  ─── Why the production sync was silently dead (fixed here) ───
//  The old `testConnection()` "verified" credentials by calling the PostgREST
//  root (`/rest/v1/`). Supabase now answers that endpoint with
//  `401 {"message":"Secret API key required"}` for every `sb_publishable_…`
//  key — so on every device the check returned `bad-credentials`, the app
//  showed «المفتاح أو الرابط غير صحيح», `syncReady` never became true and
//  nothing was ever uploaded or polled. The shared table stayed empty.
//  Credentials are now verified against the sync table itself.

import { supabase, SUPABASE_URL } from './supabase';

export type SyncStatus = 'offline' | 'connecting' | 'synced' | 'error';
export type TestResult = 'ok' | 'no-table' | 'no-access' | 'bad-credentials' | 'network-error';

export interface SyncConfig {
  url: string;
  key: string;
  table?: string;
  payloadCol?: string;
  accountCol?: string;
  idCol?: string;
  updatedAtCol?: string;
}

/** Amer Walk-In project credentials (built in — no typing needed). */
export const DEFAULT_SYNC: SyncConfig = {
  url: 'https://iteqxdhppinemzuauobm.supabase.co',
  key: 'sb_publishable_HCM3MOMfL4HouwcTTs0pmA_Iq3npbSk',
};

const STANDARD_TABLE = 'walkin_state';

/**
 * The `account` value of the row that holds the org chart shared by BOTH
 * branches: a manager/head/sales added or renamed in SITE shows up in RESTA
 * (and the other way round). Attendance, history and the queue stay in the two
 * per-branch rows — only the roster is shared.
 */
export const SHARED_ORG_ACCOUNT = 'ORG';
const PROBE_TABLES = [
  'walkin_state',
  'walkin',
  'app_state',
  'state',
  'amer_state',
  'amer_walkin',
  'branch_state',
  'walkin_app',
];

const cfgKey = (account: string) => `amer-supabase-${account.toLowerCase()}`;

export const normalizeUrl = (raw: string): string => {
  let u = raw.trim().replace(/\s+/g, '');
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  u = u.replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  return u;
};

export const getSyncConfig = (account: string): SyncConfig => {
  try {
    const raw = localStorage.getItem(cfgKey(account));
    if (raw) {
      const parsed = JSON.parse(raw) as SyncConfig;
      if (parsed?.url && parsed?.key) return parsed;
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SYNC };
};

export const setSyncConfig = (account: string, config: SyncConfig): void => {
  try {
    localStorage.setItem(cfgKey(account), JSON.stringify(config));
  } catch {
    /* ignore */
  }
};

// ─── Diagnostics (shown in the sync card so a failure is never silent) ───

/** Last failure seen by the sync layer, e.g. `HTTP 401 — Invalid API key`. */
let lastError: string | null = null;
export const getLastSyncError = (): string | null => lastError;
const noteError = (msg: string | null): void => {
  lastError = msg;
};

async function describeResponse(res: Response): Promise<string> {
  let detail = '';
  try {
    const body = (await res.clone().json()) as { message?: string; code?: string; hint?: string };
    detail = [body.code, body.message].filter(Boolean).join(' ');
  } catch {
    /* non-JSON body */
  }
  return `HTTP ${res.status}${detail ? ` — ${detail}` : ''}`;
}

// ─── Server clock ───
//
//  Every revision stamp is compared across devices, so it must come from ONE
//  clock. Phones and laptops are routinely seconds (sometimes minutes) apart;
//  a device whose clock runs behind would see its own fresh edits rejected as
//  "stale" and overwritten. We learn the offset to the Supabase server from the
//  `Date` header of every response and stamp with the corrected time.

let serverOffsetMs = 0;
let serverOffsetKnown = false;

const learnServerClock = (res: Response): void => {
  const header = res.headers.get('date');
  if (!header) return;
  const serverMs = Date.parse(header);
  if (!Number.isFinite(serverMs)) return;
  // `Date` has 1s resolution — round to the second before comparing.
  const offset = serverMs - Date.now();
  serverOffsetMs = serverOffsetKnown ? Math.round((serverOffsetMs + offset) / 2) : offset;
  serverOffsetKnown = true;
};

/** Current time on the shared (server) clock — use this for revision stamps. */
export const syncNow = (): number => Date.now() + serverOffsetMs;

// ─── HTTP helpers ───

const withTimeout = (ms: number): AbortSignal => {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
};

/**
 * Request headers.
 *  • `apikey` identifies the project (publishable key).
 *  • `Authorization` carries the signed-in user's JWT when we talk to the same
 *    project the login uses, so the request runs as `authenticated` and RLS
 *    policies limited to logged-in users still allow it. Falls back to the
 *    key itself (allowed by Supabase when it equals the `apikey` header).
 */
async function headers(cfg: SyncConfig, extra: Record<string, string> = {}): Promise<Record<string, string>> {
  let bearer = cfg.key;
  if (normalizeUrl(cfg.url) === normalizeUrl(SUPABASE_URL)) {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) bearer = data.session.access_token;
    } catch {
      /* not signed in — anon */
    }
  }
  return {
    apikey: cfg.key,
    Authorization: `Bearer ${bearer}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...extra,
  };
}

async function request(cfg: SyncConfig, url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { timeoutMs = 10000, headers: extra, ...rest } = init;
  const res = await fetch(url, {
    cache: 'no-store',
    ...rest,
    headers: await headers(cfg, (extra as Record<string, string>) ?? {}),
    signal: withTimeout(timeoutMs),
  });
  learnServerClock(res);
  return res;
}

const restUrl = (cfg: SyncConfig): string => `${cfg.url}/rest/v1/${cfg.table || STANDARD_TABLE}`;
const isStandard = (cfg: SyncConfig): boolean =>
  !cfg.table || (cfg.table === STANDARD_TABLE && !cfg.payloadCol);

/** Inspect a foreign table row and adopt its column names. */
function inspectRow(row: Record<string, unknown>): Partial<SyncConfig> | null {
  const keys = Object.keys(row);
  const payloadCol =
    keys.find((k) => row[k] !== null && typeof row[k] === 'object' && !Array.isArray(row[k])) ??
    (['payload', 'data', 'state', 'content', 'body', 'value'].find((k) => k in row) ?? undefined);
  if (!payloadCol) return null;
  const accountCol =
    ['account', 'username', 'branch', 'org', 'site'].find((k) => k in row) ?? undefined;
  const idCol = 'id' in row ? 'id' : (keys.find((k) => /^(id|.*_id)$/i.test(k)) ?? undefined);
  const updatedAtCol =
    ['updated_at', 'updatedAt', 'updated', 'modified_at', 'timestamp', 'created_at'].find(
      (k) => k in row,
    ) ?? undefined;
  return { payloadCol, accountCol, idCol, updatedAtCol };
}

type Probe =
  | { kind: 'ok'; cfg: SyncConfig }
  | { kind: 'no-table' }
  | { kind: 'no-access'; detail: string }
  | { kind: 'bad-credentials'; detail: string }
  | { kind: 'network-error' };

/**
 * Look for a usable table in the project (standard shape first, then legacy
 * names). Also doubles as the credentials check: PostgREST answers a bad
 * `apikey` with 401 on *any* table, and a missing table with 404 / PGRST205.
 */
async function probeTable(cfg: SyncConfig, account: string): Promise<Probe> {
  // 1) Standard table with account column.
  let res: Response;
  try {
    res = await request(
      cfg,
      `${cfg.url}/rest/v1/${STANDARD_TABLE}?account=eq.${encodeURIComponent(account)}&select=payload,updated_at&limit=1`,
      { timeoutMs: 8000 },
    );
  } catch {
    return { kind: 'network-error' };
  }
  if (res.ok) return { kind: 'ok', cfg: { ...cfg, table: STANDARD_TABLE } };

  const detail = await describeResponse(res);
  // Postgres 42501 = "permission denied for table" (missing GRANT / RLS) —
  // PostgREST may send it as 401 *or* 403, so decide by the code first.
  if (/42501/.test(detail) || res.status === 403) return { kind: 'no-access', detail };
  if (res.status === 401) return { kind: 'bad-credentials', detail };

  if (res.status === 400) {
    // Table exists but with a different schema — inspect one row.
    try {
      const alt = await request(cfg, `${cfg.url}/rest/v1/${STANDARD_TABLE}?limit=1`, { timeoutMs: 8000 });
      if (alt.ok) {
        const rows = (await alt.json()) as Record<string, unknown>[];
        if (Array.isArray(rows) && rows.length > 0) {
          const cols = inspectRow(rows[0]);
          if (cols) return { kind: 'ok', cfg: { ...cfg, table: STANDARD_TABLE, ...cols } };
        }
      }
    } catch {
      /* continue probing */
    }
  }

  // 2) Legacy table names.
  for (const table of PROBE_TABLES) {
    if (table === STANDARD_TABLE) continue;
    try {
      const r = await request(cfg, `${cfg.url}/rest/v1/${table}?limit=1`, { timeoutMs: 8000 });
      if (!r.ok) continue;
      const rows = (await r.json()) as Record<string, unknown>[];
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const cols = inspectRow(rows[0]);
      if (cols) return { kind: 'ok', cfg: { ...cfg, table, ...cols } };
    } catch {
      /* next */
    }
  }
  noteError(detail);
  return { kind: 'no-table' };
}

/**
 * Verify credentials + locate a usable table.
 * Persists the resolved table/columns on success.
 */
export async function testConnection(input: SyncConfig, account: string): Promise<TestResult> {
  const cfg: SyncConfig = { url: normalizeUrl(input.url), key: input.key.trim() };
  if (!cfg.url || !cfg.key) return 'bad-credentials';

  const probe = await probeTable(cfg, account);
  switch (probe.kind) {
    case 'ok':
      noteError(null);
      setSyncConfig(account, probe.cfg);
      return 'ok';
    case 'bad-credentials':
      noteError(probe.detail);
      return 'bad-credentials';
    case 'no-access':
      noteError(probe.detail);
      // Credentials are fine — the table just needs the RLS policy from SQL_SETUP.
      setSyncConfig(account, { ...cfg, table: STANDARD_TABLE });
      return 'no-access';
    case 'network-error':
      noteError('لا يمكن الوصول إلى Supabase (شبكة)');
      return 'network-error';
    case 'no-table':
    default:
      // Keep the credentials even if the table still needs to be created.
      setSyncConfig(account, { ...cfg, table: STANDARD_TABLE });
      return 'no-table';
  }
}

export interface RemoteState {
  payload: Record<string, unknown>;
  updatedAt: number;
}

/** Result of an upload attempt. */
export type PushResult =
  /** The cloud row now holds exactly what we sent. */
  | 'written'
  /** Another device had written a newer state — we must NOT overwrite it. */
  | 'stale'
  /** The request failed (network / server); the edit stays pending locally. */
  | 'failed';

interface StandardRow {
  payload: Record<string, unknown>;
  updated_at: string;
}

type StandardRead =
  | { ok: true; row: StandardRow | null }
  | { ok: false };

/** Read this account's row from the standard `walkin_state` table. */
async function readStandardRow(cfg: SyncConfig, account: string): Promise<StandardRead> {
  const res = await request(
    cfg,
    `${cfg.url}/rest/v1/${STANDARD_TABLE}?account=eq.${encodeURIComponent(account)}&select=payload,updated_at&limit=1`,
  );
  if (!res.ok) {
    noteError(await describeResponse(res));
    return { ok: false };
  }
  noteError(null);
  const rows = (await res.json()) as StandardRow[];
  return { ok: true, row: Array.isArray(rows) && rows.length > 0 ? rows[0] : null };
}

/** Read this account's state. Seeds the row when it does not exist yet. */
export async function pullRemote(
  account: string,
  seed?: unknown,
  config?: SyncConfig,
): Promise<RemoteState | null> {
  const cfg = config ?? getSyncConfig(account);
  try {
    if (isStandard(cfg)) {
      const read = await readStandardRow(cfg, account);
      if (!read.ok) return null;
      if (!read.row) {
        if (seed !== undefined) {
          const stamp = syncNow();
          if ((await pushRemote(account, seed, stamp, cfg)) !== 'failed') {
            return { payload: seed as Record<string, unknown>, updatedAt: stamp };
          }
        }
        return null;
      }
      return {
        payload: read.row.payload ?? {},
        updatedAt: read.row.updated_at ? new Date(read.row.updated_at).getTime() : 0,
      };
    }

    // Custom / legacy table shape.
    const res = await request(cfg, `${restUrl(cfg)}?limit=100`);
    if (!res.ok) {
      noteError(await describeResponse(res));
      return null;
    }
    const rows = (await res.json()) as Record<string, unknown>[];
    if (!Array.isArray(rows) || rows.length === 0) {
      if (seed !== undefined) {
        const stamp = syncNow();
        if ((await pushRemote(account, seed, stamp, cfg)) !== 'failed') {
          return { payload: seed as Record<string, unknown>, updatedAt: stamp };
        }
      }
      return null;
    }
    const row =
      (cfg.accountCol ? rows.find((r) => String(r[cfg.accountCol!]) === account) : rows[0]) ?? rows[0];
    const payload = (row[cfg.payloadCol!] as Record<string, unknown>) ?? {};
    const ts = cfg.updatedAtCol ? row[cfg.updatedAtCol] : undefined;
    return { payload, updatedAt: ts ? new Date(String(ts)).getTime() : 0 };
  } catch (e) {
    noteError(e instanceof Error ? e.message : 'network');
    return null;
  }
}

/**
 * Create or update this account's state.
 *
 * `stamp` is the revision (server-clock ms, see `syncNow()`) of the payload
 * being sent. The write is guarded so an older device can never silently
 * overwrite a newer one — the classic cause of "attendance registered on the
 * phone vanished on the laptop" (and vice-versa).
 */
export async function pushRemote(
  account: string,
  payload: unknown,
  stamp: number = syncNow(),
  config?: SyncConfig,
): Promise<PushResult> {
  const cfg = config ?? getSyncConfig(account);
  const stampIso = new Date(stamp).toISOString();
  try {
    if (isStandard(cfg)) {
      // Read-modify-write: compare revisions, then write only if we are newer.
      const read = await readStandardRow(cfg, account);
      if (!read.ok) return 'failed';

      if (!read.row) {
        const res = await request(
          cfg,
          `${cfg.url}/rest/v1/${STANDARD_TABLE}?on_conflict=account&columns=account,payload,updated_at`,
          {
            method: 'POST',
            headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify([{ account, payload, updated_at: stampIso }]),
          },
        );
        if (!res.ok) {
          noteError(await describeResponse(res));
          return 'failed';
        }
        noteError(null);
        return 'written';
      }

      const remoteTs = read.row.updated_at ? new Date(read.row.updated_at).getTime() : 0;
      if (remoteTs >= stamp) return 'stale';

      // The `updated_at=lt.<stamp>` filter is applied to the UPDATE, so even if
      // another device writes between our read and this PATCH we cannot
      // clobber it: the row simply stops matching and nothing is changed.
      // `return=representation` lets us tell those two outcomes apart —
      // PostgREST answers 2xx either way.
      const res = await request(
        cfg,
        `${cfg.url}/rest/v1/${STANDARD_TABLE}?account=eq.${encodeURIComponent(account)}&updated_at=lt.${encodeURIComponent(stampIso)}&select=updated_at`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ payload, updated_at: stampIso }),
        },
      );
      if (!res.ok) {
        noteError(await describeResponse(res));
        return 'failed';
      }
      noteError(null);
      let matched = 1;
      try {
        const rows = (await res.json()) as unknown[];
        if (Array.isArray(rows)) matched = rows.length;
      } catch {
        /* return=minimal fallback — assume written */
      }
      return matched > 0 ? 'written' : 'stale';
    }

    // Custom shape.
    if (cfg.accountCol && cfg.payloadCol) {
      const res = await request(
        cfg,
        `${restUrl(cfg)}?on_conflict=${cfg.accountCol}&columns=${cfg.accountCol},${cfg.payloadCol}`,
        {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify([{ [cfg.accountCol]: account, [cfg.payloadCol]: payload }]),
        },
      );
      if (!res.ok) noteError(await describeResponse(res));
      return res.ok ? 'written' : 'failed';
    }

    // Single-row table: PATCH the existing row (by id when available).
    const rows = await request(cfg, `${restUrl(cfg)}?limit=1`, { timeoutMs: 8000 })
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, unknown>[]>) : null))
      .catch(() => null);
    const row = rows && rows.length > 0 ? rows[0] : null;
    if (!row) return 'failed';
    const filter = cfg.idCol ? `?${cfg.idCol}=eq.${encodeURIComponent(String(row[cfg.idCol]))}` : '';
    const res = await request(cfg, `${restUrl(cfg)}${filter}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ [cfg.payloadCol!]: payload }),
    });
    if (!res.ok) noteError(await describeResponse(res));
    return res.ok ? 'written' : 'failed';
  } catch (e) {
    noteError(e instanceof Error ? e.message : 'network');
    return 'failed';
  }
}

// ─── Realtime (instant push from the other device) ───
//
//  Polling remains the source of truth (works even if Realtime is disabled on
//  the table). When the table IS part of the `supabase_realtime` publication —
//  see SQL_SETUP — every write on another device triggers an immediate pull
//  here instead of waiting for the next poll tick.

/**
 * Subscribe to changes on this account's shared row. `onChange` fires with the
 * new `updated_at` (ms) whenever any device writes. Returns an unsubscribe fn.
 * No-op for custom table shapes or a different project than the login one.
 */
export function subscribeRemote(
  account: string,
  onChange: (updatedAt: number) => void,
  config?: SyncConfig,
): () => void {
  const cfg = config ?? getSyncConfig(account);
  if (!isStandard(cfg) || normalizeUrl(cfg.url) !== normalizeUrl(SUPABASE_URL)) return () => {};
  try {
    const channel = supabase
      .channel(`walkin_state:${account}:${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: STANDARD_TABLE, filter: `account=eq.${account}` },
        (msg) => {
          const row = (msg.new ?? {}) as Partial<StandardRow>;
          const ts = row.updated_at ? new Date(row.updated_at).getTime() : syncNow();
          onChange(ts);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  } catch {
    return () => {};
  }
}

export const SQL_SETUP = `-- ══════ (1) جدول مزامنة الـ Walk-In — شغّل هذا دائماً ══════
-- نفس الجدول بيحمل صفوف الفروع (SITE / RESTA) + صف الهيكل المشترك بينهم
-- (account = 'ORG')، فمفيش أي تعديل مطلوب على الجدول ده.
create table if not exists walkin_state (
  account text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
alter table walkin_state enable row level security;
drop policy if exists "public read write" on walkin_state;
create policy "public read write" on walkin_state
  for all using (true) with check (true);
grant select, insert, update on walkin_state to anon, authenticated;

-- (اختياري) تحديث لحظي بين الأجهزة بدل الانتظار لدورة الاستقصاء:
do $$ begin
  alter publication supabase_realtime add table walkin_state;
exception when duplicate_object then null; end $$;

-- ══════ (2) حسابات الفروع من مشروعك السابق ══════
-- يتطلب وجود جدول amer_private.accounts؛ لو مش موجود تخطّي هذا الجزء.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO amer_private.accounts (branch, password_hash)
VALUES
  ('SITE',  crypt('123456', gen_salt('bf'))),
  ('RESTA', crypt('123456', gen_salt('bf')))
ON CONFLICT (branch)
DO UPDATE SET password_hash = EXCLUDED.password_hash;

SELECT branch FROM amer_private.accounts;`;
