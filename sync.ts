// ─── Supabase sync (Project URL + Publishable Key) ───
//
//  • Every device logged in with the SAME username (SITE / RESTA) shares one
//    row inside YOUR Supabase project — all edits appear on every phone.
//  • The team's Project URL + Publishable Key are built into the app, so a
//    device connects by simply pressing "اختبار وحفظ الاتصال" once.
//  • If the project uses an older/different table shape we auto-probe it;
//    otherwise a copy-paste SQL block is shown to create the standard table.

export type SyncStatus = 'offline' | 'connecting' | 'synced' | 'error';
export type TestResult = 'ok' | 'no-table' | 'bad-credentials' | 'network-error';

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

const withTimeout = (ms: number): AbortSignal => {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
};

const headers = (cfg: SyncConfig, extra: Record<string, string> = {}) => ({
  apikey: cfg.key,
  Authorization: `Bearer ${cfg.key}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
  ...extra,
});

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

/** Look for a usable table in the project (standard shape first, then legacy names). */
async function probeTable(cfg: SyncConfig, account: string): Promise<SyncConfig | null> {
  // 1) Standard table with account column.
  try {
    const res = await fetch(
      `${cfg.url}/rest/v1/${STANDARD_TABLE}?account=eq.${encodeURIComponent(account)}&select=payload,updated_at`,
      { headers: headers(cfg), cache: 'no-store', signal: withTimeout(8000) },
    );
    if (res.ok) return { ...cfg, table: STANDARD_TABLE };
    if (res.status === 400) {
      // Table exists but different schema — inspect one row.
      const alt = await fetch(`${cfg.url}/rest/v1/${STANDARD_TABLE}?limit=1`, {
        headers: headers(cfg),
        cache: 'no-store',
        signal: withTimeout(8000),
      });
      if (alt.ok) {
        const rows = (await alt.json()) as Record<string, unknown>[];
        if (Array.isArray(rows) && rows.length > 0) {
          const cols = inspectRow(rows[0]);
          if (cols) return { ...cfg, table: STANDARD_TABLE, ...cols };
        }
      }
    }
  } catch {
    /* continue probing */
  }

  // 2) Legacy table names.
  for (const table of PROBE_TABLES) {
    if (table === STANDARD_TABLE) continue;
    try {
      const res = await fetch(`${cfg.url}/rest/v1/${table}?limit=1`, {
        headers: headers(cfg),
        cache: 'no-store',
        signal: withTimeout(8000),
      });
      if (!res.ok) continue;
      const rows = (await res.json()) as Record<string, unknown>[];
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const cols = inspectRow(rows[0]);
      if (cols) return { ...cfg, table, ...cols };
    } catch {
      /* next */
    }
  }
  return null;
}

/**
 * Verify credentials + locate a usable table.
 * Persists the resolved table/columns on success.
 */
export async function testConnection(input: SyncConfig, account: string): Promise<TestResult> {
  const cfg: SyncConfig = { url: normalizeUrl(input.url), key: input.key.trim() };
  if (!cfg.url || !cfg.key) return 'bad-credentials';

  try {
    // Credentials check.
    const auth = await fetch(`${cfg.url}/rest/v1/`, { headers: headers(cfg), signal: withTimeout(8000) });
    if (auth.status === 401 || auth.status === 403) return 'bad-credentials';
  } catch {
    return 'network-error';
  }

  const found = await probeTable(cfg, account);
  if (found) {
    setSyncConfig(account, found);
    return 'ok';
  }
  // Keep the credentials even if the table still needs to be created.
  setSyncConfig(account, { ...cfg, table: STANDARD_TABLE });
  return 'no-table';
}

export interface RemoteState {
  payload: Record<string, unknown>;
  updatedAt: number;
}

/** Read this account's state. Seeds the row when it does not exist yet. */
export async function pullRemote(
  account: string,
  seed?: unknown,
): Promise<RemoteState | null> {
  const cfg = getSyncConfig(account);
  try {
    if (isStandard(cfg)) {
      const res = await fetch(
        `${cfg.url}/rest/v1/${STANDARD_TABLE}?account=eq.${encodeURIComponent(account)}&select=payload,updated_at`,
        { headers: headers(cfg), cache: 'no-store', signal: withTimeout(10000) },
      );
      if (res.status === 404 || res.status === 409) return null;
      if (!res.ok) return null;
      const rows = (await res.json()) as { payload: Record<string, unknown>; updated_at: string }[];
      if (!Array.isArray(rows) || rows.length === 0) {
        if (seed !== undefined && (await pushRemote(account, seed))) {
          return { payload: seed as Record<string, unknown>, updatedAt: Date.now() };
        }
        return null;
      }
      return {
        payload: rows[0].payload ?? {},
        updatedAt: rows[0].updated_at ? new Date(rows[0].updated_at).getTime() : 0,
      };
    }

    // Custom / legacy table shape.
    const res = await fetch(`${restUrl(cfg)}?limit=100`, {
      headers: headers(cfg),
      cache: 'no-store',
      signal: withTimeout(10000),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Record<string, unknown>[];
    if (!Array.isArray(rows) || rows.length === 0) {
      if (seed !== undefined && (await pushRemote(account, seed))) {
        return { payload: seed as Record<string, unknown>, updatedAt: Date.now() };
      }
      return null;
    }
    const row =
      (cfg.accountCol ? rows.find((r) => String(r[cfg.accountCol!]) === account) : rows[0]) ?? rows[0];
    const payload = (row[cfg.payloadCol!] as Record<string, unknown>) ?? {};
    const ts = cfg.updatedAtCol ? row[cfg.updatedAtCol] : undefined;
    return { payload, updatedAt: ts ? new Date(String(ts)).getTime() : 0 };
  } catch {
    return null;
  }
}

/** Create or update this account's state. */
export async function pushRemote(account: string, payload: unknown): Promise<boolean> {
  const cfg = getSyncConfig(account);
  try {
    if (isStandard(cfg)) {
      const res = await fetch(
        `${cfg.url}/rest/v1/${STANDARD_TABLE}?on_conflict=account&columns=account,payload,updated_at`,
        {
          method: 'POST',
          headers: headers(cfg, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
          body: JSON.stringify([{ account, payload, updated_at: new Date().toISOString() }]),
          signal: withTimeout(10000),
        },
      );
      if (res.status === 404) return false;
      return res.ok;
    }

    // Custom shape.
    if (cfg.accountCol && cfg.payloadCol) {
      const res = await fetch(
        `${restUrl(cfg)}?on_conflict=${cfg.accountCol}&columns=${cfg.accountCol},${cfg.payloadCol}`,
        {
          method: 'POST',
          headers: headers(cfg, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
          body: JSON.stringify([{ [cfg.accountCol]: account, [cfg.payloadCol]: payload }]),
          signal: withTimeout(10000),
        },
      );
      if (res.status === 404) return false;
      return res.ok;
    }

    // Single-row table: PATCH the existing row (by id when available).
    const rows = await fetch(`${restUrl(cfg)}?limit=1`, {
      headers: headers(cfg),
      signal: withTimeout(8000),
    })
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, unknown>[]>) : null))
      .catch(() => null);
    const row = rows && rows.length > 0 ? rows[0] : null;
    if (!row) return false;
    const filter = cfg.idCol ? `?${cfg.idCol}=eq.${encodeURIComponent(String(row[cfg.idCol]))}` : '';
    const res = await fetch(`${restUrl(cfg)}${filter}`, {
      method: 'PATCH',
      headers: headers(cfg, { Prefer: 'return=minimal' }),
      body: JSON.stringify({ [cfg.payloadCol!]: payload }),
      signal: withTimeout(10000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const SQL_SETUP = `-- ══════ (1) جدول مزامنة الـ Walk-In — شغّل هذا دائماً ══════
create table if not exists walkin_state (
  account text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
alter table walkin_state enable row level security;
drop policy if exists "public read write" on walkin_state;
create policy "public read write" on walkin_state
  for all using (true) with check (true);

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
