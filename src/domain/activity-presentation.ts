import type { CanonicalActivity, ActivityLap } from './activity';

export function formatActivityDuration(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0)
    return 'Unavailable';
  const total = Math.round(seconds),
    hours = Math.floor(total / 3600),
    minutes = Math.floor(total / 60) % 60;
  return `${hours ? `${hours}:${String(minutes).padStart(2, '0')}` : Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
export function formatActivityPace(
  seconds: number | null,
  meters: number | null,
) {
  return seconds !== null && seconds > 0 && meters !== null && meters > 0
    ? `${formatActivityDuration((seconds * 1000) / meters)} /km`
    : 'Unavailable';
}
export function polarFallbackTitle(
  sport: CanonicalActivity['sport'],
  localDate: string,
) {
  const names: Record<CanonicalActivity['sport'], string> = {
    run: 'Running',
    trail_run: 'Trail running',
    cycling: 'Cycling',
    swimming: 'Swimming',
    walking: 'Walking',
    hiking: 'Hiking',
    strength: 'Strength training',
    other: 'Polar activity',
  };
  return `${names[sport]} · ${localDate.slice(0, 10)}`;
}
export function groupActivityLaps<T extends Pick<ActivityLap, 'kind'>>(
  laps: T[],
) {
  return [
    { label: 'Manual laps', laps: laps.filter((l) => l.kind === 'manual') },
    {
      label: 'Automatic laps',
      laps: laps.filter((l) => l.kind === 'automatic'),
    },
    { label: 'Laps', laps: laps.filter((l) => !l.kind) },
  ].filter((g) => g.laps.length);
}
