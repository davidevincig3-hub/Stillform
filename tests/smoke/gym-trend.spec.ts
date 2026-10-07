import { test, expect } from '@playwright/test';
import { trendHistory } from '../helpers/gym-trend';
import { polarCalendarDate } from '../../src/domain/polar-training-range';
import { selectGymView } from '../../src/repositories/gym-cloud-query';

for (const width of [390, 430, 1143]) {
  test(`local trend, muscle drilldown, descriptive unknown effort and history at ${width}px`, async ({
    page,
  }, testInfo) => {
    const asOf = polarCalendarDate(new Date(), 'Europe/Rome');
    const store = trendHistory(asOf);
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(
      (s) => localStorage.setItem('adaptive-coach.gym.v2', JSON.stringify(s)),
      store,
    );
    await page.goto('/gym');
    const card = page.getByTestId('gym-performance-trend');
    await expect(
      card.getByRole('heading', { name: 'Performance trend', exact: true }),
    ).toBeVisible();
    await expect(card.locator('.trend-value')).toContainText('140.0');
    await card.getByText('Muscle groups', { exact: true }).click();
    await card.getByLabel('View muscle group').selectOption('g:Back');
    await card.getByLabel('View exercise').selectOption('synthetic-ex-0');
    await expect(
      card.getByRole('link', { name: 'Open full exercise history →' }),
    ).toBeVisible();
    await card
      .getByText('Contributors, exclusions & method', { exact: true })
      .click();
    await card
      .locator('summary')
      .filter({ hasText: /Synthetic exercise 000 · block/ })
      .click();
    await expect(
      card.getByText(/Effort coverage: baseline 0\/4; final 0\/4/),
    ).toBeVisible();
    await expect(card.getByText(/Model: general/)).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('gym-trend.png'),
      fullPage: true,
    });
    await card
      .getByRole('link', { name: 'Open full exercise history →' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Recorded history & comparison' }),
    ).toBeVisible();
    await expect(
      page.getByText(/Insufficient comparable evidence/),
    ).toBeVisible();
  });
}
test('account trend is computed beyond workspace pages, navigates in memory, survives refresh error and retries', async ({
  page,
}) => {
  const asOf = polarCalendarDate(new Date(), 'Europe/Rome');
  const store = trendHistory(asOf),
    owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  let revision = 1,
    reads = 0,
    fail = false;
  await page.addInitScript((user) => {
    localStorage.setItem('stillform.gym.account', user);
    localStorage.setItem(
      `stillform.gym.account.${user}`,
      JSON.stringify({
        cacheVersion: 2,
        owner: user,
        revision: 1,
        active: null,
        stamp: '',
      }),
    );
  }, owner);
  await page.route('**/api/gym{,?*}', async (route) => {
    expect(route.request().method()).toBe('GET');
    const query = Object.fromEntries(
      new URL(route.request().url()).searchParams,
    );
    if (query.scope === 'trend') {
      reads++;
      if (fail)
        return route.fulfill({
          status: 503,
          json: {
            error: 'Trend unavailable',
            diagnostic: { operation: 'gym_read', status: 503, code: 'timeout' },
          },
        });
    }
    return route.fulfill({
      json: {
        owner,
        revision,
        initialized: true,
        ...selectGymView(store, query),
      },
    });
  });
  await page.goto('/gym');
  const card = page.getByTestId('gym-performance-trend');
  await expect(card.locator('.trend-value')).toContainText('140.0');
  expect(reads).toBe(1);
  await card.getByText('Muscle groups', { exact: true }).click();
  await card.getByLabel('View muscle group').selectOption('g:Back');
  await card.getByLabel('View exercise').selectOption('synthetic-ex-0');
  expect(reads).toBe(1);
  fail = true;
  revision++;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(card.getByRole('alert')).toContainText(
    'Last available result is not refreshed',
  );
  await expect(card.locator('.trend-value')).toContainText('140.0');
  await expect.poll(() => reads).toBe(3); // refresh + one controlled retry
  fail = false;
  store.history.at(-1)!.exercises[0].sets[0].weight = 100;
  await card.getByRole('button', { name: 'Retry performance trend' }).click();
  await expect(card.getByRole('alert')).toHaveCount(0);
  expect(reads).toBe(4);
  await card
    .getByRole('link', { name: 'Open full exercise history →' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Recorded history & comparison' }),
  ).toBeVisible();
  expect(reads).toBe(4);
});
test('unassigned history produces no muscle aggregate but keeps its individual trend and history access', async ({
  page,
}) => {
  const asOf = polarCalendarDate(new Date(), 'Europe/Rome'),
    store = trendHistory(asOf);
  store.history.forEach((w) => {
    w.exercises[0].primaryMuscleGroup = null;
  });
  store.exercises[0].primaryMuscleGroup = 'Chest';
  await page.addInitScript(
    (s) => localStorage.setItem('adaptive-coach.gym.v2', JSON.stringify(s)),
    store,
  );
  await page.goto('/gym');
  const card = page.getByTestId('gym-performance-trend');
  await expect(
    card.getByText(/Insufficient data for this trend/),
  ).toBeVisible();
  await expect(card.getByRole('img')).toHaveCount(0);
  await card.getByText('Muscle groups', { exact: true }).click();
  await card.getByLabel('View muscle group').selectOption('unassigned');
  await expect(card.getByRole('img')).toHaveCount(0);
  await card.getByLabel('View exercise').selectOption('synthetic-ex-0');
  await expect(card.locator('.trend-value')).toContainText('140.0');
  await expect(
    card.getByRole('link', { name: 'Open full exercise history →' }),
  ).toBeVisible();
});
