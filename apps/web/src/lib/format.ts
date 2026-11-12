const DAY_MS = 86_400_000;

/** YYYY-MM-DD calendar date of an instant in a time zone. */
function calendarDate(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Whole calendar days from `now` to `target` in the viewer's time zone. */
export function calendarDaysBetween(now: Date, target: Date, timeZone: string): number {
  const a = Date.parse(calendarDate(now, timeZone));
  const b = Date.parse(calendarDate(target, timeZone));
  return Math.round((b - a) / DAY_MS);
}

export function formatDate(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, { timeZone, month: 'short', day: 'numeric' }).format(d);
}

export function formatDateTime(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/** "just now", "5 minutes ago", "yesterday", "3 days ago". */
export function formatRelative(d: Date, now: Date): string {
  const diffSec = Math.round((d.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 45) return 'just now';
  if (abs < 3600) return relative.format(Math.round(diffSec / 60), 'minute');
  if (abs < DAY_MS / 1000) return relative.format(Math.round(diffSec / 3600), 'hour');
  return relative.format(Math.round(diffSec / 86400), 'day');
}

/** "Overdue by 2 days", "Due today", "Due tomorrow", "Due Jun 29". */
export function formatDue(nextDueAt: Date, now: Date, timeZone: string): string {
  const days = calendarDaysBetween(now, nextDueAt, timeZone);
  if (days < 0) return `Overdue by ${-days} day${days === -1 ? '' : 's'}`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due ${formatDate(nextDueAt, timeZone)}`;
}

/** Value for <input type="date" max>: today's date in the browser's zone. */
export function todayInputValue(): string {
  return calendarDate(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);
}
