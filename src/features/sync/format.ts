/** Device-local date and time, e.g. "30/10/2026, 14:05". */
export function formatClock(epochMs: number, locale: string): string {
  return new Date(epochMs).toLocaleString(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}
