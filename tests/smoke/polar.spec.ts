import { test, expect } from '@playwright/test';
import { emptyPolarStore, newPolarJob } from '../../src/domain/polar';
import { sleep, nightly } from '../helpers/polar';
const base = {
  realMode: true,
  connected: true,
  sleep: [],
  nightly: [],
  continuousDays: 0,
  ppiDays: 0,
  asOf: '2026-10-04T12:00:00Z',
};
const publicSleep = {
  date: sleep.sleepDate,
  source: 'polar',
  syncedAt: base.asOf,
  device: 'synthetic-device',
  sensorQuality: 'unknown',
  start: sleep.sleepResult.hypnogram.sleepStart,
  end: sleep.sleepResult.hypnogram.sleepEnd,
  asleepSeconds: 27000,
  spanSeconds: 28800,
  continuity: 3.5,
  efficiencyPercent: 93.75,
  interruptions: 2,
  awakeSeconds: 1800,
  phaseSeconds: { rem: 5000 },
  vendorSleepScore: 80,
  userModified: false,
  complete: true,
};
const publicNightly = {
  date: nightly.sleepResultDate,
  source: 'polar',
  syncedAt: base.asOf,
  device: null,
  sensorQuality: 'unknown',
  rmssdMs: 42,
  rriMs: 1000,
  respirationIntervalMs: 4000,
  vendor: { meanBaselineRmssd: 40 },
};
for (const width of [390, 430])
  test(`Recovery validity overrides exclude and restore provider records at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const records = [
      {
        ...publicSleep,
        date: '2026-10-02',
        validityOverride: null as null | {
          status: 'excluded' | 'valid';
          reason: string | null;
          adjudicatedAt: string;
          adjudicatedBy: 'user';
        },
      },
      {
        ...publicSleep,
        date: '2026-10-03',
        validityOverride: null as null | {
          status: 'excluded' | 'valid';
          reason: string | null;
          adjudicatedAt: string;
          adjudicatedBy: 'user';
        },
      },
    ];
    await page.route('**/api/polar/recovery', (r) => {
      const valid = records.filter(
        (s) => s.validityOverride?.status !== 'excluded',
      );
      return r.fulfill({
        json: {
          ...base,
          sleep: valid,
          recordCounts: {
            sleep: {
              provider: 2,
              valid: valid.length,
              excluded: 2 - valid.length,
            },
          },
          history: records.map((s) => ({
            family: 'sleep',
            date: s.date,
            source: 'polar',
            device: s.device,
            syncedAt: s.syncedAt,
            sensorQuality: 'unknown',
            validityOverride: s.validityOverride,
          })),
        },
      });
    });
    await page.route('**/api/polar/quality', (r) => {
      const body = r.request().postDataJSON();
      expect(body.records.length).toBe(1);
      expect(body.records[0].family).toBe('sleep');
      const record = records.find((s) => s.date === body.records[0].date)!;
      record.validityOverride = {
        status: body.status,
        reason: body.status === 'excluded' ? body.reason : null,
        adjudicatedAt: base.asOf,
        adjudicatedBy: 'user',
      };
      return r.fulfill({ json: { updated: 1 } });
    });
    await page.goto('/recovery');
    await expect(
      page.getByRole('heading', { name: '2 valid sleep nights' }),
    ).toBeVisible();
    await page
      .getByText('Provider history & validity (2 records)', { exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Exclude from recovery', exact: true })
      .first()
      .click();
    await expect(
      page.getByRole('heading', { name: '1 valid sleep nights' }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Exclude from recovery', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: '0 valid sleep nights' }),
    ).toBeVisible();
    await expect(
      page.getByText('2 Polar sleep records · 2 Polar records excluded', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText('Insufficient data', { exact: true }),
    ).toHaveCount(6);
    await page.reload();
    await expect(
      page.getByRole('heading', { name: '0 valid sleep nights' }),
    ).toBeVisible();
    await page
      .getByText('Provider history & validity (2 records)', { exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Restore', exact: true })
      .first()
      .click();
    await expect(
      page.getByRole('heading', { name: '1 valid sleep nights' }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
test('connected zero-night Recovery succeeds without sample fallbacks and sample view is explicit', async ({
  page,
}) => {
  await page.route('**/api/polar/recovery', (r) => r.fulfill({ json: base }));
  await page.goto('/recovery');
  await expect(
    page.getByRole('heading', { name: '0 valid sleep nights' }),
  ).toBeVisible();
  await expect(
    page.getByText('DEMO · SAMPLE DATA', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText('Insufficient data', { exact: true }),
  ).toHaveCount(6);
  await page.getByRole('button', { name: 'Show labelled sample view' }).click();
  await expect(
    page.getByText('DEMO · SAMPLE DATA', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Show real data' }).click();
  await expect(
    page.getByRole('heading', { name: '0 valid sleep nights' }),
  ).toBeVisible();
});
for (const width of [390, 430])
  test(`real Polar Recovery and sync controls ${width}px preserve navigation without overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route('**/api/polar/recovery', (r) =>
      r.fulfill({
        json: { ...base, sleep: [publicSleep], nightly: [publicNightly] },
      }),
    );
    await page.goto('/recovery');
    await expect(
      page.getByRole('heading', { name: '1 valid sleep nights' }),
    ).toBeVisible();
    await expect(page.getByText('42.0 ms · 2026-10-01')).toBeVisible();
    await page
      .getByRole('button', { name: 'Analyze Nightly RMSSD', exact: true })
      .click();
    await expect(
      page.getByText(/No AI or recovery decision computed/),
    ).toBeVisible();
    await page
      .getByRole('button', { name: '90d', exact: true })
      .first()
      .click();
    await expect(
      page
        .getByText(
          '1 observations / 90 days · 1 complete · baseline insufficient',
        )
        .first(),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    const state = {
      ...emptyPolarStore(),
      counts: { sleep: 0, nightly: 0, continuous: 0, ppi: 0 },
      sportsAvailable: 2,
    };
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.route('**/api/polar/status', (r) =>
      r.fulfill({
        json: {
          configured: true,
          authenticated: true,
          connected: true,
          scopes: ['training_sessions:read'],
          trainingCount: 0,
          state,
        },
      }),
    );
    await page.route('**/api/polar/sync', async (r) => {
      const body = r.request().postDataJSON();
      expect(body.families).toEqual(['training']);
      expect(body.restart).toBe(true);
      state.jobs.training = {
        ...newPolarJob(body.from, body.to),
        next: body.to,
        done: true,
        requests: 1,
        lastSuccess: base.asOf,
      };
      await r.fulfill({ json: state });
    });
    await page.goto('/integrations');
    await page
      .getByRole('button', { name: 'Sync training sessions', exact: true })
      .click();
    await expect(
      page.getByText(/Zero available records is a successful result/),
    ).toBeVisible();
    await expect(page.getByRole('navigation')).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    expect(pageErrors).toEqual([]);
  });
test('Polar is independently unconfigured and exposes only missing variable names', async ({
  request,
}) => {
  const r = await request.get('/api/polar/status');
  expect(r.status()).toBe(200);
  const b = await r.json();
  expect(b).toMatchObject({ configured: false, connected: false });
  expect(b.missing).toContain('POLAR_CLIENT_ID');
  expect(b.missing).not.toContain('STRAVA_CLIENT_ID');
  expect(JSON.stringify(b)).not.toContain('accessToken');
});

test('training dates follow configured Rome calendar instead of browser or UTC date, and remain UI dates', async ({
  browser,
}) => {
  const context = await browser.newContext({
    timezoneId: 'America/Los_Angeles',
    baseURL: test.info().project.use.baseURL,
  });
  try {
    const page = await context.newPage();
    await page.clock.install({ time: new Date('2026-03-28T23:30:00Z') });
    const state = {
      ...emptyPolarStore(),
      counts: { sleep: 0, nightly: 0, continuous: 0, ppi: 0 },
    };
    await page.route('**/api/polar/status', (r) =>
      r.fulfill({
        json: {
          configured: true,
          authenticated: true,
          connected: true,
          trainingTimeZone: 'Europe/Rome',
          scopes: ['training_sessions:read'],
          state,
          trainingCount: 0,
        },
      }),
    );
    await page.route('**/api/polar/sync', async (r) => {
      const body = r.request().postDataJSON();
      expect(body.from).toBe('2026-09-01');
      expect(body.to).toBe('2026-10-05');
      state.jobs.training = {
        ...newPolarJob(body.from, body.to),
        done: true,
        next: body.to,
        requests: 1,
      };
      await r.fulfill({ json: state });
    });
    await page.goto('/integrations');
    await expect(
      page.getByLabel('From (inclusive)', { exact: true }),
    ).toHaveValue('2025-12-29');
    await expect(
      page.getByLabel('To (exclusive)', { exact: true }),
    ).toHaveValue('2026-03-30');
    await expect(
      page.getByText(/Training calendar dates: Europe\/Rome/),
    ).toBeVisible();
    await page
      .getByLabel('From (inclusive)', { exact: true })
      .fill('2026-09-01');
    await page.getByLabel('To (exclusive)', { exact: true }).fill('2026-10-05');
    await page
      .getByRole('button', { name: 'Sync training sessions', exact: true })
      .click();
    await expect(
      page.getByText(/Zero available records is a successful result/),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

for (const width of [390, 430])
  test(`Polar provider diagnostics remain readable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const state = {
      ...emptyPolarStore(),
      counts: { sleep: 0, nightly: 0, continuous: 0, ppi: 0 },
      jobs: {
        training: {
          ...newPolarJob('2026-09-01', '2026-10-05'),
          errors: ['Polar request failed'],
          diagnostic: {
            endpoint: '/v4/data/training-sessions/list',
            status: 400,
            contentType: 'application/json',
            family: 'training',
            refreshed: true,
            refreshAttempted: true,
            body: JSON.stringify({
              error: "Value for key 'from' could not be parsed as datetime",
            }),
          },
        },
      },
    };
    await page.route('**/api/polar/status', (r) =>
      r.fulfill({
        json: {
          configured: true,
          authenticated: true,
          connected: true,
          scopes: ['training_sessions:read'],
          state,
          trainingCount: 0,
        },
      }),
    );
    await page.goto('/integrations');
    await page.getByText(/training: Backfill pending/).click();
    await page.getByText('Provider diagnostic', { exact: true }).click();
    await expect(page.getByText(/HTTP 400/)).toBeVisible();
    await expect(
      page.getByText(/could not be parsed as datetime/),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
  });
