import { test, expect } from '@playwright/test';
import { performanceHistory } from '../helpers/gym-performance';
import { selectGymView } from '../../src/repositories/gym-cloud-query';

for (const width of [390, 1143]) {
  test(`local exercise performance and unknown effort at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const store = performanceHistory();
    await page.addInitScript((s) => {
      if (!localStorage.getItem('adaptive-coach.gym.v2'))
        localStorage.setItem('adaptive-coach.gym.v2', JSON.stringify(s));
    }, store);
    await page.goto('/gym/exercises/synthetic-ex-0');
    await expect(
      page.getByRole('heading', { name: 'Recorded history & comparison' }),
    ).toBeVisible();
    await expect(page.getByText('+10.0 kg:', { exact: false })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('exercise-performance.png'),
      fullPage: true,
    });
    await page
      .getByText('Recent comparable exposures', { exact: true })
      .click();
    await expect(page.getByText(/65 kg · current/)).toBeVisible();
    await page
      .getByText('Why these sessions? / Excluded data', { exact: true })
      .click();
    await expect(
      page.getByText(/Three distinct session dates is a product evidence rule/),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    store.history.forEach((w) => {
      w.exercises[0].sets[0].rir = null;
    });
    await page.evaluate(
      (s) => localStorage.setItem('adaptive-coach.gym.v2', JSON.stringify(s)),
      store,
    );
    await page.reload();
    await expect(
      page.getByText(/Insufficient comparable evidence:/),
    ).toBeVisible();
  });
}
test('cloud exercise summary stays complete across paged history', async ({
  page,
}) => {
  const store = performanceHistory(30);
  const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
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
    const params = Object.fromEntries(
      new URL(route.request().url()).searchParams,
    );
    await route.fulfill({
      json: {
        owner,
        revision: 1,
        initialized: true,
        ...selectGymView(store, params),
      },
    });
  });
  await page.goto('/gym/exercises/synthetic-ex-0');
  await expect(
    page.getByText('30 workout exposures · 30 completed sets', {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'More exposures', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Previous exposures' }),
  ).toBeVisible();
  await expect(
    page.getByText('30 workout exposures · 30 completed sets', {
      exact: false,
    }),
  ).toBeVisible();
});
test('missing effort preserves recorded PRs and explains excluded evidence', async ({
  page,
}) => {
  const store = performanceHistory();
  store.history.forEach((w) => {
    w.exercises[0].sets[0].rir = null;
  });
  await page.addInitScript(
    (s) => localStorage.setItem('adaptive-coach.gym.v2', JSON.stringify(s)),
    store,
  );
  await page.goto('/gym/exercises/synthetic-ex-0');
  await expect(
    page.getByText(/Insufficient comparable evidence:/),
  ).toBeVisible();
  await page.getByText('Best recorded load', { exact: true }).click();
  await expect(page.getByText(/Machine · normal: 65 kg ·/)).toBeVisible();
  await page
    .getByText('Why these sessions? / Excluded data', { exact: true })
    .click();
  await expect(
    page.getByText('First-set effort unknown: 4 blocks'),
  ).toBeVisible();
});
