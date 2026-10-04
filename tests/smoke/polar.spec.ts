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
test('connected zero-night Recovery succeeds without sample fallbacks and sample view is explicit', async ({
  page,
}) => {
  await page.route('**/api/polar/recovery', (r) => r.fulfill({ json: base }));
  await page.goto('/recovery');
  await expect(
    page.getByRole('heading', { name: '0 nights of sleep data' }),
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
    page.getByRole('heading', { name: '0 nights of sleep data' }),
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
      page.getByRole('heading', { name: '1 nights of sleep data' }),
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
