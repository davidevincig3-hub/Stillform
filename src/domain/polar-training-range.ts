import { z } from 'zod';

export const DEFAULT_POLAR_TIME_ZONE = 'Europe/Rome';

export function validatePolarTimeZone(timeZone: string): string {
  return new Intl.DateTimeFormat('en', { timeZone }).resolvedOptions().timeZone;
}

export function polarCalendarDate(now: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// The live training endpoint accepts ISO local datetimes, but rejects Z/offsets.
// Calendar boundaries are wall times in the selected zone, not UTC instants.
// Do not parse the input dates as UTC or add fixed 24-hour elapsed durations.
export function serializePolarTrainingRange(
  from: string,
  to: string,
  timeZone = DEFAULT_POLAR_TIME_ZONE,
): { from: string; to: string } {
  validatePolarTimeZone(timeZone);
  z.iso.date().parse(from);
  z.iso.date().parse(to);
  if (from >= to)
    throw new RangeError(
      'Training range must have an exclusive end after its start',
    );
  return { from: `${from}T00:00:00`, to: `${to}T00:00:00` };
}
