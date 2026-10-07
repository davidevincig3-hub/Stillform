import { test, expect } from '@playwright/test';
import { performanceHistory } from '../helpers/gym-performance';
import { selectGymView } from '../../src/repositories/gym-cloud-query';
import { applyGymChanges } from '../../src/repositories/gym-cloud-changes';
import { startGymWorkout } from '../../src/repositories/gym-storage';
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
for (const width of [390, 430, 1143])
  test(`previous references survive saves, failed refresh and recovery at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    let store = performanceHistory(30),
      revision = 1,
      fail = false,
      reads = 0,
      writes = 0;
    store.history.forEach((w) => {
      w.exercises[0].equipment = null;
      w.exercises[0].sets[0].rir = null;
    });
    // Matching prior history exists beyond the recent workspace window.
    store.history.slice(-3).forEach((w) => {
      w.exercises[0].exerciseId = 'unrelated';
    });
    store = startGymWorkout(store, {
      id: 'routine',
      name: 'Synthetic routine',
      notes: '',
      createdAt: '2026-10-07T00:00:00Z',
      updatedAt: '2026-10-07T00:00:00Z',
      exercises: [
        {
          id: 're',
          exerciseId: 'synthetic-ex-0',
          defaultSets: 2,
          notes: '',
          repRange: null,
        },
      ],
    });
    await page.addInitScript(
      ({ user, active }) => {
        localStorage.setItem('stillform.gym.account', user);
        localStorage.setItem(
          `stillform.gym.account.${user}`,
          JSON.stringify({
            cacheVersion: 2,
            owner: user,
            revision: 1,
            active,
            stamp: '',
          }),
        );
      },
      { user: owner, active: store.active },
    );
    let release: (() => void) | undefined;
    let delayed = false;
    await page.route('**/api/gym{,?*}', async (route) => {
      if (route.request().method() === 'POST') {
        const input = route.request().postDataJSON();
        expect(input.expected).toBe(revision);
        store = applyGymChanges(store, input.changes);
        writes++;
        return route.fulfill({ json: { revision: ++revision, ok: true } });
      }
      const query = Object.fromEntries(
        new URL(route.request().url()).searchParams,
      );
      if (query.scope === 'previous') {
        reads++;
        if (delayed)
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        if (fail)
          return route.fulfill({
            status: 503,
            json: {
              error: 'History unavailable',
              diagnostic: {
                operation: 'gym_read',
                code: 'timeout',
                status: 503,
              },
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
    await page.goto('/gym/workout');
    const references = page.locator('.previous-performance');
    const acknowledged = async () => {
      await expect
        .poll(() =>
          page.evaluate(
            (user) =>
              JSON.parse(localStorage.getItem(`stillform.gym.account.${user}`)!)
                .revision,
            owner,
          ),
        )
        .toBe(revision);
      await expect(page.getByRole('status')).toHaveCount(0);
    };
    await expect(
      references.getByText('180 kg × 10', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Last 4 exposures', { exact: true }),
    ).toBeVisible();
    expect(reads).toBe(1);
    const weight = page.getByLabel('Synthetic exercise 000 set 1 weight', {
      exact: true,
    });
    await weight.fill('60');
    await page
      .getByLabel('Synthetic exercise 000 set 1 reps', { exact: true })
      .fill('8');
    await page
      .getByRole('button', {
        name: 'Log Synthetic exercise 000 set 1',
        exact: true,
      })
      .click();
    await expect
      .poll(() => store.active?.exercises[0].sets[0].completed)
      .toBe(true);
    await acknowledged();
    expect(reads).toBe(1);
    // An external completed-history change (not an active-set save) refreshes references.
    revision++;
    store.history[26].exercises[0].sets[0].weight = 181;
    delayed = true;
    fail = true;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect.poll(() => reads).toBe(2);
    await expect(
      references.getByText('180 kg × 10', { exact: true }),
    ).toBeVisible();
    delayed = false;
    release!();
    await expect(
      page.getByText(/Showing last available references; not refreshed/),
    ).toBeVisible();
    await expect.poll(() => reads).toBe(3); // exactly one automatic retry
    await expect(
      page.getByRole('button', { name: 'Retry previous history' }),
    ).toBeVisible();
    expect(
      (await page
        .getByRole('button', { name: 'Retry previous history' })
        .boundingBox())!.height,
    ).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('previous-read-failure.png'),
      fullPage: true,
    });
    await page
      .getByLabel('Synthetic exercise 000 set 2 weight', { exact: true })
      .fill('65');
    await expect.poll(() => store.active?.exercises[0].sets[1].weight).toBe(65);
    await acknowledged();
    await expect(
      references.getByText('180 kg × 10', { exact: true }),
    ).toBeVisible();
    const failedCount = reads;
    // Workspace refresh at the same revision must not cause an unbounded read retry.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await acknowledged();
    expect(reads).toBe(failedCount);
    fail = false;
    await page.getByRole('button', { name: 'Retry previous history' }).click();
    await expect(
      references.getByText('181 kg × 10', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/Showing last available references; not refreshed/),
    ).toHaveCount(0);
    expect(reads).toBe(4);
    expect(writes).toBeGreaterThan(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('previous-references.png'),
      fullPage: true,
    });
    await page.getByRole('link', { name: /Leave workout/ }).click();
    await page.getByRole('link', { name: /Workout in progress/ }).click();
    await expect(
      references.getByText('181 kg × 10', { exact: true }),
    ).toBeVisible();
    expect(reads).toBe(4); // remount uses the same owner/ID/history epoch memory result
  });

test('unavailable account history never substitutes the recent page, and authentication has no automatic retry', async ({
  page,
}) => {
  const base = performanceHistory();
  const store = startGymWorkout(base, {
    id: 'r',
    name: 'Synthetic',
    notes: '',
    createdAt: '2026-10-07T00:00:00Z',
    updatedAt: '2026-10-07T00:00:00Z',
    exercises: [
      {
        id: 're',
        exerciseId: 'synthetic-ex-0',
        defaultSets: 1,
        repRange: null,
        notes: '',
      },
    ],
  });
  let reads = 0;
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
    const query = Object.fromEntries(
      new URL(route.request().url()).searchParams,
    );
    if (query.scope === 'previous') {
      reads++;
      return route.fulfill({
        status: 401,
        json: { error: 'Account verification required' },
      });
    }
    return route.fulfill({
      json: {
        owner,
        revision: 1,
        initialized: true,
        ...selectGymView(store, query),
      },
    });
  });
  await page.clock.install();
  await page.goto('/gym/workout');
  await expect(
    page.getByText('History access requires account verification.', {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByText('65 kg × 10 @ 1 RIR', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/No account history available yet/),
  ).toBeVisible();
  await page.clock.fastForward(5000);
  expect(reads).toBe(1);
  await page.getByRole('button', { name: 'Retry previous history' }).click();
  await expect.poll(() => reads).toBe(2);
  await page.clock.fastForward(5000);
  expect(reads).toBe(2);
});
