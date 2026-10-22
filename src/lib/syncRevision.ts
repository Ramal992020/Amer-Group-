// ─── Which copy wins: this device or the cloud row? ───
//
//  Every branch row (`walkin_state.account = SITE | RESTA`) carries a revision
//  in `updated_at`, stamped on the shared server clock (`syncNow()`).
//
//  ─── The bug this file exists to kill ───
//  `revisionRef` used to be bumped to `now` by the save effect on EVERY render
//  of the board, including the very first one after a reload (and the built-in
//  roster merge that ran on mount). So a device that merely *opened* the app
//  while holding an older board stamped its stale copy with "now" — newer than
//  the row the other device had just worked on — and pushed it. The other
//  device then pulled it, so the laptop "won" and the phone's attendance,
//  current turn and «بدء يوم جديد» were replaced or never seen.
//
//  The rules below are the only place that ordering is decided:
//
//   • A revision is only ever *confirmed* by the cloud: it comes from a row we
//     read, or from a write the server accepted. It is never invented locally
//     just because state changed on screen.
//   • On the first read of a session ('connect') the cloud row is the source of
//     truth. A device with no pending edit always adopts it — even when its own
//     saved stamp looks newer, which is exactly the corrupted stamp the old
//     code wrote.
//   • Local edits that were never confirmed (offline, or a failed upload) win
//     only when they are *newer* than the cloud row. Otherwise the other
//     device's edit happened later and is adopted.

/** Result of comparing this device's snapshot with the cloud row. */
export type SyncDecision = 'adopt-remote' | 'push-local' | 'seed' | 'noop';

export interface SyncComparison {
  /** Revision of the cloud row, or `null` when the row does not exist yet. */
  remoteRevision: number | null;
  /** Stamp of this device's snapshot (confirmed revision, or the edit stamp
   *  while it holds unsent edits). */
  localRevision: number;
  /** The local snapshot holds edits the cloud never confirmed. */
  hasPendingEdits: boolean;
  /**
   * `connect` = the first read of this session (and every reconnect): the cloud
   * is the reference. `poll` = a normal background poll, where a strictly
   * newer remote row is the only reason to adopt.
   */
  mode: 'connect' | 'poll';
}

/**
 * Stamp for a new local edit: never behind the revision we already hold (two
 * edits in the same millisecond must still be ordered) and taken from the
 * server clock so devices agree.
 */
export const nextLocalRevision = (localRevision: number, now: number): number =>
  Math.max(now, localRevision + 1);

/** Decide what to do with one read of the shared branch row. */
export function decideSync({
  remoteRevision,
  localRevision,
  hasPendingEdits,
  mode,
}: SyncComparison): SyncDecision {
  // No row yet: the first device creates it (pullRemote seeds it).
  if (remoteRevision === null) return hasPendingEdits ? 'push-local' : 'seed';

  // ── Nothing unsent on this device ──
  // A fresh open NEVER pushes: whatever is on screen is a copy of some older
  // state, and the cloud row is what the other device actually worked on.
  if (!hasPendingEdits) {
    if (mode === 'connect') return 'adopt-remote';
    if (remoteRevision > localRevision) return 'adopt-remote';
    // The row went backwards (restored/deleted row). Re-publish the copy we
    // already had confirmed rather than silently losing the day.
    return remoteRevision < localRevision ? 'push-local' : 'noop';
  }

  // ── This device has edits the cloud never confirmed ──
  // They stay put only while they are the newest thing we know about.
  if (remoteRevision > localRevision) return 'adopt-remote';
  return 'push-local';
}

/**
 * The stamp a snapshot is saved with: the revision it is known by, plus the
 * unsent-edit stamp while it holds edits the cloud has not accepted yet.
 */
export function pendingStampOf(localRevision: number, hasPendingEdits: boolean): number | undefined {
  return hasPendingEdits ? localRevision : undefined;
}
