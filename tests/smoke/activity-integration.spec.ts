import { test, expect } from '@playwright/test';
import { syntheticGymHistory } from '../helpers/gym-history';
import { canonicalActivitySchema } from '../../src/domain/activity';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
const store = syntheticGymHistory();

test('hydrated Polar detail shows separate lap families and readable series on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const now = '2026-10-01T08:00:00Z';
  const activity = canonicalActivitySchema.parse({
    id: 'synthetic-polar-detail',
    sport: 'run',
    title: 'Running · 2026-10-01',
    startedAt: now,
    localStart: '2026-10-01T10:00:00',
    timeZone: 'UTC offset 120 min',
    elapsedSeconds: 2100,
    movingSeconds: null,
    distanceM: 5000,
    elevationM: 26.7,
    averageHr: 155,
    maxHr: 185,
    averageSpeed: null,
    device: null,
    status: 'confirmed',
    quality: { available: [], missing: [], confidence: 'recorded' },
    fieldSources: {},
    sourceKeys: ['polar:synthetic'],
    gymWorkoutId: null,
    plannedSessionId: null,
    createdAt: now,
    updatedAt: now,
  });
  const laps = Array.from({ length: 7 }, (_, i) => ({
    index: i,
    kind: i < 2 ? 'manual' : 'automatic',
    exerciseId: 'synthetic',
    startedAt: null,
    elapsedSeconds: i < 2 ? 900 : 420,
    movingSeconds: null,
    distanceM: i < 2 ? 2100 : 1000,
    averageSpeed: null,
    averageHr: 155,
    maxHr: 185,
    sourceKey: 'polar:synthetic',
  }));
  const samples = ['HEART_RATE', 'SPEED', 'DISTANCE'].map((type) => ({
    type,
    unit: type === 'HEART_RATE' ? 'bpm' : 'provider_unspecified',
    count: 2100,
    intervalMillis: 1000,
  }));
  await page.route('**/api/activities/*', (r) =>
    r.fulfill({
      json: {
        activity,
        sources: [],
        rich: [
          {
            sourceKey: 'polar:synthetic',
            fetchedAt: now,
            streamStatus: samples.map((s) => ({
              kind: `Polar exercise 1 · ${s.type}`,
              samples: s.count,
              seriesType: 'interval 1000 ms',
            })),
            laps,
            warnings: [],
            polar: {
              sensorQuality: 'unknown',
              exercises: [
                {
                  id: 'synthetic',
                  runningIndex: 38,
                  trainingLoad: {},
                  samples,
                  zones: [],
                  pauses: [],
                  routes: {},
                  statistics: {},
                },
              ],
            },
          },
        ],
      },
    }),
  );
  await page.goto('/activities/synthetic-polar-detail');
  await expect(page.locator('h1')).toHaveText('Running · 2026-10-01');
  await expect(
    page.getByText('35:00 / Unavailable', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('7:00 /km (includes pauses)', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('27 m', { exact: true })).toBeVisible();
  await expect(
    page.getByText('No available streams.', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText('Samples available; unit unverified', { exact: true }),
  ).toBeVisible();
  await page.getByText('Manual laps (2)', { exact: true }).click();
  await page.getByText('Automatic laps (5)', { exact: true }).click();
  await expect(
    page.getByText(
      /Lap 1 · exercise synthetic: 1000 m · 7:00 · 7:00 \/km elapsed pace/,
    ),
  ).toBeVisible();
  for (const width of [390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});

test('Polar canonical sessions become visible in Running after catalog classification, without rich-detail hydration', async ({
  page,
}) => {
  const now = '2026-10-01T08:00:00Z';
  const activities = Array.from({ length: 5 }, (_, i) =>
    canonicalActivitySchema.parse({
      id: `synthetic-polar-${i}`,
      title:
        i === 4 ? 'Synthetic Polar swim' : 'Synthetic Polar run ' + (i + 1),
      sport: 'other',
      startedAt: now,
      localStart: null,
      timeZone: null,
      elapsedSeconds: 3600,
      movingSeconds: null,
      distanceM: null,
      elevationM: null,
      averageHr: null,
      maxHr: null,
      averageSpeed: null,
      device: null,
      status: 'confirmed',
      quality: {
        available: ['sport'],
        missing: ['averageHr'],
        confidence: 'limited',
      },
      fieldSources: { sport: `polar:synthetic:${i}` },
      sourceKeys: [`polar:synthetic:${i}`],
      gymWorkoutId: null,
      plannedSessionId: null,
      createdAt: now,
      updatedAt: now,
    }),
  );
  const sources = activities.map((a, i) => ({
    key: a.sourceKeys[0],
    provider: 'polar',
    externalId: String(i),
    athleteId: null,
    activityId: a.id,
    providerType: i === 4 ? '103' : '1',
    syncedAt: now,
    device: null,
    fingerprint: 'synthetic',
    deleted: false,
  }));
  await page.route('**/api/activities', (r) =>
    r.fulfill({ json: { activities, sources, reviews: [] } }),
  );
  await page.goto('/running');
  await expect(
    page.getByText(/No activities match the current sport\/search filters/),
  ).toBeVisible();
  for (let i = 0; i < 5; i++) {
    activities[i].sport = i === 4 ? 'swimming' : 'run';
    sources[i].providerType = i === 4 ? 'POOL_SWIMMING' : 'RUNNING';
  }
  await page.reload();
  for (let i = 1; i <= 4; i++)
    await expect(
      page.getByText(`Synthetic Polar run ${i}`, { exact: true }),
    ).toBeVisible();
  await expect(
    page.getByText('Synthetic Polar swim', { exact: true }),
  ).toHaveCount(0);
  await page.getByRole('link', { name: 'All activities →' }).click();
  await expect(
    page.getByText('Synthetic Polar swim', { exact: true }),
  ).toBeVisible();
  for (let i = 1; i <= 4; i++)
    await expect(
      page.getByText(`Synthetic Polar run ${i}`, { exact: true }),
    ).toBeVisible();
});
async function seed(page: import('@playwright/test').Page) {
  await page.addInitScript((s) => {
    if (!localStorage.getItem('adaptive-coach.gym.v2'))
      localStorage.setItem('adaptive-coach.gym.v2', JSON.stringify(s));
  }, store);
}
test('Gym main has three recent workouts and search-first exercise history; full browsers paginate/filter', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/gym');
  const summaries = page
    .locator('summary')
    .filter({ hasText: 'completed sets' });
  await expect(summaries).toHaveCount(3);
  await expect(summaries.first()).toContainText('Synthetic workout 029');
  await expect(
    page
      .getByTestId('exercise-history-search')
      .getByRole('link', { name: /Synthetic exercise/ }),
  ).toHaveCount(3);
  await page.getByLabel('Search exercise history').fill('exercise 126');
  await expect(
    page
      .getByTestId('exercise-history-search')
      .getByRole('link', { name: /Synthetic exercise 126/ }),
  ).toBeVisible();
  await expect(
    page
      .getByTestId('exercise-history-search')
      .getByRole('link', { name: /Synthetic exercise/ }),
  ).toHaveCount(1);
  await page
    .getByRole('link', { name: /Browse all exercise histories/ })
    .click();
  await expect(
    page.getByRole('link', { name: /Synthetic exercise/ }),
  ).toHaveCount(20);
  await page.getByLabel('Sort exercises').selectOption('name');
  await expect(
    page.getByRole('link', { name: /Synthetic exercise 000/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Next exercises' }).click();
  await expect(page.getByText('Page 2', { exact: true })).toBeVisible();
  await page.goto('/gym/history');
  await expect(
    page.locator('summary').filter({ hasText: 'completed sets' }),
  ).toHaveCount(20);
  await page.getByRole('button', { name: 'Next workouts' }).click();
  await expect(
    page.locator('summary').filter({ hasText: 'completed sets' }),
  ).toHaveCount(10);
  await page.getByLabel('Search completed workouts').fill('workout 005');
  await expect(
    page.locator('summary').filter({ hasText: 'completed sets' }),
  ).toHaveCount(1);
  await page.locator('summary').filter({ hasText: 'completed sets' }).click();
  await page.getByRole('link', { name: /Open workout detail/ }).click();
  await expect(page.locator('h1')).toContainText('Synthetic workout 005');
});
for (const width of [390, 430])
  test(`history/integration mobile ${width}px has no overflow and preserves navigation`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await seed(page);
    for (const path of [
      '/gym',
      '/gym/history',
      '/gym/exercise-history',
      '/activities',
      '/integrations',
    ]) {
      await page.goto(path);
      await expect(page.getByRole('navigation')).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
    }
    await page.goto('/gym/history');
    await page.getByLabel('Search completed workouts').fill('workout 029');
    await page.locator('summary').filter({ hasText: 'completed sets' }).click();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
  });
test('synthetic real running history/detail and streams are separate from sample analytics', async ({
  page,
}) => {
  const now = '2026-10-01T08:00:00Z';
  const key = 'strava:7:1';
  const n = {
    activity: canonicalActivitySchema.parse({
      id: 'synthetic-run',
      title: 'Synthetic Run 1',
      sport: 'run',
      startedAt: now,
      localStart: null,
      timeZone: null,
      elapsedSeconds: 3600,
      movingSeconds: 3500,
      distanceM: 10000,
      elevationM: null,
      averageHr: null,
      maxHr: null,
      averageSpeed: null,
      device: null,
      status: 'confirmed',
      quality: {
        available: ['distanceM', 'elapsedSeconds'],
        missing: ['averageHr'],
        confidence: 'recorded',
      },
      fieldSources: { distanceM: key },
      sourceKeys: [key],
      gymWorkoutId: null,
      plannedSessionId: null,
      createdAt: now,
      updatedAt: now,
    }),
    source: {
      key,
      provider: 'strava',
      externalId: '1',
      athleteId: '7',
      activityId: 'synthetic-run',
      providerType: 'Run',
      syncedAt: now,
      device: null,
      fingerprint: 'synthetic',
      deleted: false,
      raw: {},
      previous: [],
    },
  };
  const { raw, previous, ...source } = n.source;
  void raw;
  void previous;
  await page.route('**/api/activities', (r) =>
    r.fulfill({
      json: { activities: [n.activity], sources: [source], reviews: [] },
    }),
  );
  await page.route('**/api/activities/*', (r) =>
    r.fulfill({
      json: {
        activity: n.activity,
        sources: [source],
        rich: [
          {
            sourceKey: source.key,
            fetchedAt: n.source.syncedAt,
            streamStatus: [{ kind: 'time', samples: 2, seriesType: 'time' }],
            laps: [],
            warnings: [],
          },
        ],
      },
    }),
  );
  await page.goto('/running');
  await expect(page.getByText(/Sample running analytics below/)).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Real running workout history' }),
  ).toBeVisible();
  await page.getByRole('link', { name: /Synthetic Run 1/ }).click();
  await expect(page.locator('h1')).toHaveText('Synthetic Run 1');
  await expect(page.getByText('time: 2 samples · time')).toBeVisible();
  await expect(page.getByText('HR average / max')).toBeVisible();
});
test('unconfigured integration APIs expose no secrets and webhooks stay disabled', async ({
  page,
}) => {
  await page.goto('/integrations');
  await expect(
    page.getByRole('heading', { name: 'Secure setup required' }),
  ).toBeVisible();
  const status = await page.request.get('/api/integrations/status');
  expect(status.status()).toBe(200);
  expect(await status.json()).toMatchObject({
    configured: false,
    connected: false,
  });
  const api = await page.request.get('/api/activities');
  expect(api.status()).toBe(401);
  expect(await api.text()).not.toContain('token');
  const webhook = await page.request.post('/api/strava/webhook', { data: {} });
  expect(webhook.status()).toBe(503);
});

test('production browser bundles contain no server integration secrets/configuration', async () => {
  test.skip(
    process.env.PLAYWRIGHT_PRODUCTION !== '1',
    'Bundle audit requires production build',
  );
  async function files(dir: string): Promise<string[]> {
    return (
      await Promise.all(
        (await readdir(dir, { withFileTypes: true })).map((e) =>
          e.isDirectory()
            ? files(join(dir, e.name))
            : Promise.resolve(
                e.name.endsWith('.js') ? [join(dir, e.name)] : [],
              ),
        ),
      )
    ).flat();
  }
  const chunks = await files('.next/static');
  expect(chunks.length).toBeGreaterThan(0);
  for (const path of chunks) {
    const body = await readFile(path, 'utf8');
    for (const variable of [
      'STRAVA_CLIENT_SECRET',
      'POLAR_CLIENT_SECRET',
      'SUPABASE_SECRET_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'INTEGRATION_ENCRYPTION_KEY',
      'DEV_INTEGRATION_ACCESS_KEY',
    ])
      expect(body, path).not.toContain(variable);
  }
});

test('deployment trace excludes private imports, environment files and dev credential files', async () => {
  test.skip(
    process.env.PLAYWRIGHT_PRODUCTION !== '1',
    'Trace audit requires production build',
  );
  async function manifests(dir: string): Promise<string[]> {
    return (
      await Promise.all(
        (await readdir(dir, { withFileTypes: true })).map((e) =>
          e.isDirectory()
            ? manifests(join(dir, e.name))
            : Promise.resolve(
                e.name.endsWith('.nft.json') ? [join(dir, e.name)] : [],
              ),
        ),
      )
    ).flat();
  }
  const all = await manifests('.next');
  expect(all.length).toBeGreaterThan(0);
  for (const p of all) {
    const manifest = JSON.parse(await readFile(p, 'utf8')) as {
      files: string[];
    };
    expect(
      manifest.files.some((f) =>
        /(^|[/\\])(local-imports|\.integration-dev|\.env[^/\\]*)([/\\]|$)/.test(
          f,
        ),
      ),
    ).toBe(false);
  }
});
