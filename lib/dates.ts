/**
 * Resume dates are month-precision ("Aug 2026"), but Postgres stores DateTime.
 * Everything is normalised to the first of the month in UTC so that a date
 * entered in one timezone renders as the same month everywhere.
 */

/** "2026-08" (an <input type="month"> value) → Date */
export function monthToDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month - 1, 1));
}

/** Date → "2026-08", for round-tripping into <input type="month"> */
export function dateToMonth(date: Date | null | undefined): string {
  if (!date) return "";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Date → "Aug 2026", as it appears on the resume */
export function formatMonth(date: Date | null | undefined): string {
  if (!date) return "";
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** The date range as rendered on a resume: "Dec 2021 – Sep 2022", "Aug 2026 – Present" */
export function formatRange(
  start: Date | null | undefined,
  end: Date | null | undefined,
  isCurrent: boolean,
): string {
  const from = formatMonth(start);
  if (isCurrent) return from ? `${from} – Present` : "Present";
  const to = formatMonth(end);
  if (from && to) return `${from} – ${to}`;
  return from || to;
}
