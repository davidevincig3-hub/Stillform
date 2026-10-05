import { it, expect, vi, afterEach } from 'vitest';
import {
  serializePolarTrainingRange,
  polarCalendarDate,
} from '../../src/domain/polar-training-range';
import { PolarClient, PolarError } from '../../src/server/polar-client';
import { polarSyncStep } from '../../src/server/polar-service';
import { integrationConfig } from '../../src/server/integration-config';
import { MemoryRepository } from '../helpers/integrations';
import { polarConfig, polarConnection } from '../helpers/polar-server';

afterEach(() => vi.useRealTimers());

it('serializes inclusive/exclusive UI dates as accepted Rome local midnights, without UTC shifts', async () => {
  expect(
    serializePolarTrainingRange('2026-09-01', '2026-10-05', 'Europe/Rome'),
  ).toEqual({
    from: '2026-09-01T00:00:00',
    to: '2026-10-05T00:00:00',
  });
  const http = vi.fn(async (url: RequestInfo | URL) => {
    const q = new URL(String(url)).searchParams;
    expect(q.get('from')).toBe('2026-09-01T00:00:00');
    expect(q.get('to')).toBe('2026-10-05T00:00:00');
    expect(q.has('features')).toBe(false);
    return Response.json({ trainingSessions: [] });
  });
  await new PolarClient(
    { ...polarConfig, polarTimeZone: 'Europe/Rome' },
    http,
  ).window(polarConnection, 'training', '2026-09-01', '2026-10-05');
  expect(http).toHaveBeenCalledOnce();
});

it.each([
  ['2026-03-29', '2026-03-30', '+01:00', '+02:00', 23],
  ['2026-10-25', '2026-10-26', '+02:00', '+01:00', 25],
])(
  'preserves full Rome calendar day %s across DST, rather than assuming 24 elapsed hours',
  (from, to, startOffset, endOffset, hours) => {
    const result = serializePolarTrainingRange(from, to, 'Europe/Rome');
    expect(result).toEqual({ from: `${from}T00:00:00`, to: `${to}T00:00:00` });
    expect(
      (Date.parse(result.to + endOffset) -
        Date.parse(result.from + startOffset)) /
        3600000,
    ).toBe(hours);
    expect(
      polarCalendarDate(new Date(result.from + startOffset), 'Europe/Rome'),
    ).toBe(from);
    expect(
      polarCalendarDate(new Date(result.to + endOffset), 'Europe/Rome'),
    ).toBe(to);
  },
);

it('uses the configured calendar timezone for today at UTC date boundaries', () => {
  const now = new Date('2026-03-28T23:30:00Z');
  expect(polarCalendarDate(now, 'Europe/Rome')).toBe('2026-03-29');
  expect(polarCalendarDate(now, 'America/New_York')).toBe('2026-03-28');
  expect(integrationConfig({}).polarTimeZone).toBe('Europe/Rome');
  expect(
    integrationConfig({ POLAR_TIME_ZONE: 'America/New_York' }).polarTimeZone,
  ).toBe('America/New_York');
  expect(() =>
    serializePolarTrainingRange('2026-02-30', '2026-03-02', 'Europe/Rome'),
  ).toThrow();
  expect(() =>
    serializePolarTrainingRange('2026-03-01', '2026-03-01', 'Europe/Rome'),
  ).toThrow();
  expect(() =>
    serializePolarTrainingRange('2026-03-01', '2026-03-02', 'invalid-zone'),
  ).toThrow();
});

it('validates an exclusive tomorrow boundary against the configured calendar rather than UTC today', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-03-28T23:30:00Z'));
  const repo = new MemoryRepository();
  repo.polarCredential = structuredClone(polarConnection);
  const client = new PolarClient(
    { ...polarConfig, polarTimeZone: 'Europe/Rome' },
    async () => Response.json({ trainingSessions: [] }),
  );
  await polarSyncStep('owner', repo, client, {
    families: ['training'],
    from: '2026-03-29',
    to: '2026-03-30',
  });
  expect(repo.polarState.jobs.training!.done).toBe(true);
  await expect(
    polarSyncStep('owner', repo, client, {
      families: ['training'],
      from: '2026-03-29',
      to: '2026-03-31',
    }),
  ).rejects.toMatchObject({ status: 400 });
});

it('keeps adjacent 90-day calendar chunks contiguous across DST without changing checkpoint dates', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
  const repo = new MemoryRepository();
  repo.polarCredential = structuredClone(polarConnection);
  const calls: string[] = [];
  const client = new PolarClient(polarConfig, async (url) => {
    calls.push(String(url));
    return Response.json({ trainingSessions: [] });
  });
  await polarSyncStep('owner', repo, client, {
    families: ['training'],
    from: '2026-01-01',
    to: '2026-04-11',
  });
  expect(repo.polarState.jobs.training!.next).toBe('2026-04-01');
  vi.advanceTimersByTime(1200);
  await polarSyncStep('owner', repo, client, { families: ['training'] });
  const [first, second] = calls.map((url) => new URL(url).searchParams);
  expect(first.get('from')).toBe('2026-01-01T00:00:00');
  expect(first.get('to')).toBe('2026-04-01T00:00:00');
  expect(second.get('from')).toBe(first.get('to'));
  expect(second.get('to')).toBe('2026-04-11T00:00:00');
  expect(repo.polarState.jobs.training).toMatchObject({
    next: '2026-04-11',
    done: true,
  });
  await expect(
    client.window(polarConnection, 'training', '2026-01-01', '2026-04-02'),
  ).rejects.toMatchObject({ status: 400 });
});

it.each(['sleep', 'nightly', 'ppi', 'continuous'] as const)(
  'retains independently verified date-only %s contract',
  async (family) => {
    const client = new PolarClient(polarConfig, async (url) => {
      const q = new URL(String(url)).searchParams;
      expect(q.get('from')).toBe('2026-10-01');
      expect(q.get('to')).toBe('2026-10-02');
      return Response.json({});
    });
    await client.window(polarConnection, family, '2026-10-01', '2026-10-02');
  },
);

it('applies the same boundary serializer to one-day training detail requests while preserving diagnostics', async () => {
  const client = new PolarClient(polarConfig, async (url) => {
    const q = new URL(String(url)).searchParams;
    expect(q.get('from')).toBe('2026-10-01T00:00:00');
    expect(q.get('to')).toBe('2026-10-02T00:00:00');
    expect(q.getAll('features')).toContain('samples');
    return Response.json(
      { error: 'Provider diagnostic remains available' },
      { status: 503 },
    );
  });
  await expect(
    client.window(
      polarConnection,
      'training',
      '2026-10-01',
      '2026-10-02',
      true,
    ),
  ).rejects.toMatchObject({
    status: 503,
    diagnostic: {
      family: 'training',
      status: 503,
      body: JSON.stringify({ error: 'Provider diagnostic remains available' }),
    },
  });
  await expect(
    client.window(
      polarConnection,
      'training',
      '2026-10-01',
      '2026-10-03',
      true,
    ),
  ).rejects.toBeInstanceOf(PolarError);
});
