const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const ABSOLUTE = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

/** SQLite stores `YYYY-MM-DD HH:MM:SS` in UTC with no marker of its own. */
export function parseDate(value: string): Date {
  return new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
}

export function relativeTime(value: string): string {
  const then = parseDate(value).getTime();
  if (Number.isNaN(then)) return '';

  const seconds = Math.round((then - Date.now()) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];

  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return RELATIVE.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}

export function absoluteTime(value: string): string {
  const date = parseDate(value);
  return Number.isNaN(date.getTime()) ? '' : ABSOLUTE.format(date);
}

/** Shortens a URL to the part a person actually reads. */
export function displayUrl(url: string, maxLength = 52): string {
  let text = url.replace(/^https?:\/\//, '').replace(/^www\./, '');
  if (text.endsWith('/')) text = text.slice(0, -1);
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/** A stable hue per domain so fallback cards stay recognisable between visits. */
export function domainHue(domain: string): number {
  let hash = 0;
  for (let index = 0; index < domain.length; index += 1) {
    hash = (hash * 31 + domain.charCodeAt(index)) % 360;
  }
  return hash;
}

export function initialsFor(domain: string): string {
  const name = domain.replace(/^www\./, '').split('.')[0] ?? domain;
  return name.slice(0, 2).toUpperCase();
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
