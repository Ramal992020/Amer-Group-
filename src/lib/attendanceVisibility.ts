// ─── Attendance table · who is printed in it ───
//
// A manager can be a normal member of the shared org chart — he keeps his team,
// his history, his mobile number in «الهيكل» and his attendance data — while his
// own name must NOT be printed in the attendance table. This module holds that
// list and the name matching used by both the «الحضور» screen and the Excel
// file, so the two can never disagree.
//
// The roster arrives from the shared cloud chart (SITE ⇄ RESTA), where the ids
// of members added from the app are generated per device (`custom-…`). Matching
// therefore has to be by NAME, and it must be forgiving: the same person may be
// stored as «Hany Elshenawy», «Hany El-Shenawy» or «هاني الشناوي», and the
// Arabic spelling may carry a hamza, a taa marbuta or a diacritic.

export interface AttendanceNameLike {
  name?: string | null;
  ar?: string | null;
  /**
   * Explicit toggle from «الهيكل»:
   *  • `true`      → disabled everywhere on the app (never shown in attendance);
   *  • `false`     → explicitly activated in «الهيكل» (shown in attendance even if listed below);
   *  • `undefined` → falls back to `HIDDEN_FROM_ATTENDANCE`.
   */
  disabled?: boolean;
}

/**
 * Canonical form of a person's name for comparison.
 *
 * Lower-cases, drops Arabic diacritics/tatweel, unifies the Arabic letter
 * variants (أ إ آ ٱ → ا, ى → ي, ة → ه) and removes everything that is not a
 * letter or a digit — so spacing, hyphens, dots and Latin accents never matter.
 */
export const normalizeAttendanceName = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .toLowerCase()
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]/gu, '');

/**
 * Managers whose own name is left out of the attendance table (screen + Excel).
 *
 * Each entry lists the accepted spellings of ONE person. They are still part of
 * the org chart — deleting them there would throw away their team, their
 * history and their slot in the rotation, which is not what was asked.
 */
export const HIDDEN_FROM_ATTENDANCE: readonly (readonly string[])[] = [
  ['Dina Abdo', 'Dina Abdou', 'Dina Abdo Ahmed', 'دينا عبده', 'دينا عبدو', 'دينا عبده أحمد'],
  ['Ahmed Sultan', 'Ahmed Soltan', 'أحمد سلطان'],
  ['Hany Elshenawy', 'Hany El Shenawy', 'Hany Elshennawy', 'Hany El-Shenawy', 'هاني الشناوي'],
  ['Moataz Mandoh', 'Moataz Mandouh', 'Moataz Mandou', 'Moataz Manduh', 'معتز مندوه', 'معتز مندو'],
];

const HIDDEN_SQUASHED = new Set(
  HIDDEN_FROM_ATTENDANCE.flat().map((spelling) => normalizeAttendanceName(spelling)),
);

/** True when this person matches the default built-in hidden managers list. */
export const isDefaultHiddenFromAttendance = (
  person: AttendanceNameLike | string,
): boolean => {
  const candidates = typeof person === 'string' ? [person] : [person.name, person.ar];
  return candidates.some((value) => {
    const squashed = normalizeAttendanceName(value ?? '');
    return squashed.length > 0 && HIDDEN_SQUASHED.has(squashed);
  });
};

/**
 * True when this person's own row must not appear in the attendance table:
 *  • `disabled === true`  → explicitly disabled from «الهيكل»;
 *  • `disabled === false` → explicitly activated from «الهيكل» (appears in attendance);
 *  • `disabled === undefined` → uses `HIDDEN_FROM_ATTENDANCE`.
 */
export const isHiddenFromAttendance = (person: AttendanceNameLike | string): boolean => {
  if (typeof person !== 'string') {
    if (person.disabled === true) return true;
    if (person.disabled === false) return false;
  }
  return isDefaultHiddenFromAttendance(person);
};

/** The roster that the attendance table may render / export. */
export const visibleAttendanceSales = <T extends AttendanceNameLike>(sales: readonly T[]): T[] =>
  sales.filter((person) => !isHiddenFromAttendance(person));
