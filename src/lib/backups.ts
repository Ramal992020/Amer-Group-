import type { PersistedWalkin } from './walkin';

const FORMAT = 'amer-group-walkin-backup';
const VERSION = 1;
const MAX_AUTO_BACKUPS = 12;

export interface BackupDocument {
  format: typeof FORMAT;
  version: typeof VERSION;
  account: string;
  createdAt: string;
  state: PersistedWalkin;
}

export interface AutomaticBackup {
  id: string;
  createdAt: string;
  state: PersistedWalkin;
}

const autoKey = (account: string) => `amer-walkin-auto-backups-${account.toLowerCase()}`;

export function readAutomaticBackups(account: string): AutomaticBackup[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(autoKey(account)) ?? '[]');
    return Array.isArray(parsed) ? parsed as AutomaticBackup[] : [];
  } catch {
    return [];
  }
}

/** Store the last good local state before it is replaced by a new state. */
export function saveAutomaticBackup(account: string, state: PersistedWalkin): void {
  try {
    const existing = readAutomaticBackups(account);
    const fingerprint = JSON.stringify({ ...state, updatedAt: undefined });
    const previous = existing[0]?.state;
    if (previous && JSON.stringify({ ...previous, updatedAt: undefined }) === fingerprint) return;

    const createdAt = new Date().toISOString();
    const backup: AutomaticBackup = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt,
      state: JSON.parse(JSON.stringify(state)) as PersistedWalkin,
    };
    localStorage.setItem(autoKey(account), JSON.stringify([backup, ...existing].slice(0, MAX_AUTO_BACKUPS)));
  } catch {
    // A full localStorage must not interrupt normal app use.
  }
}

export function makeBackupDocument(account: string, state: PersistedWalkin): BackupDocument {
  return {
    format: FORMAT,
    version: VERSION,
    account: account.toUpperCase(),
    createdAt: new Date().toISOString(),
    state: JSON.parse(JSON.stringify(state)) as PersistedWalkin,
  };
}

export function downloadBackup(account: string, state: PersistedWalkin): void {
  const doc = makeBackupDocument(account, state);
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `amer-walkin-${account.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function readBackupFile(file: File, expectedAccount: string): Promise<PersistedWalkin> {
  const parsed = JSON.parse(await file.text()) as Partial<BackupDocument>;
  if (parsed.format !== FORMAT || parsed.version !== VERSION || !parsed.state) {
    throw new Error('الملف ليس نسخة احتياطية صالحة من منظم Amer Group.');
  }
  if (parsed.account?.toUpperCase() !== expectedAccount.toUpperCase()) {
    throw new Error(`هذه النسخة تخص حساب ${parsed.account || 'آخر'} وليست حساب ${expectedAccount}.`);
  }
  if (!parsed.state.salesState || !Array.isArray(parsed.state.history)) {
    throw new Error('بيانات النسخة الاحتياطية غير مكتملة أو تالفة.');
  }
  return parsed.state;
}

export const backupFormatName = FORMAT;