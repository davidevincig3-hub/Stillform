import { test, expect } from '@playwright/test';
test('core navigation and persisted workout lifecycle', async ({ page }) => {
  await page.goto('/');
  for (const name of ['Recovery', 'Running', 'Plan', 'Gym', 'Home']) {
    await page
      .getByRole('navigation')
      .getByRole('link', { name, exact: true })
      .click();
    await expect(page.locator('h1')).toBeVisible();
  }
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Gym', exact: true })
    .click();
  await page
    .getByText('Routine templates · structure only', { exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Use Push template', exact: true })
    .click();
  await page.getByRole('button', { name: 'Start Workout' }).click();
  await page.getByLabel('Chest press set 1 weight', { exact: true }).fill('60');
  await page.getByLabel('Chest press set 1 reps', { exact: true }).fill('10');
  await page.getByLabel('Chest press set 1 rir', { exact: true }).fill('2');
  await page
    .getByRole('button', { name: 'Log Chest press set 1', exact: true })
    .click();
  await page.getByRole('link', { name: 'Leave workout' }).click();
  await expect(
    page.getByRole('link', { name: /Workout in progress/ }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Recovery', exact: true })
    .click();
  await expect(
    page.getByRole('link', { name: /Workout in progress/ }),
  ).toBeVisible();
  await page.getByRole('link', { name: /Workout in progress/ }).click();
  await expect(
    page.getByLabel('Chest press set 1 weight', { exact: true }),
  ).toHaveValue('60');
  await page
    .getByRole('button', { name: 'Finish workout', exact: true })
    .click();
  await expect(
    page.locator('summary').filter({ hasText: 'completed sets' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: /Workout in progress/ }),
  ).toHaveCount(0);
});
test('labels, chart context, goals, coach and dark theme', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const path of ['/', '/recovery', '/running', '/gym', '/plan']) {
    await page.goto(path);
    await expect(
      page.getByText(
        path.startsWith('/gym')
          ? 'GYM · REAL LOCAL DATA'
          : 'DEMO · SAMPLE DATA',
        { exact: true },
      ),
    ).toBeVisible();
  }
  const goal =
    'Run faster at the same heart rate while keeping my gym schedule stable.';
  await page.getByLabel('What would you like to work toward?').fill(goal);
  await page.getByRole('button', { name: 'Save goal', exact: true }).click();
  await page.reload();
  await expect(
    page.getByLabel('What would you like to work toward?'),
  ).toHaveValue(goal);
  await page.getByRole('button', { name: 'Accept demo adjustment' }).click();
  await expect(
    page.getByRole('heading', { name: 'Easy run · adjusted' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText('Your choice: accepted. Saved locally.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Toggle dark mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Open AI Coach' }).click();
  await page.getByLabel('Ask about this page').fill('Why hold the plan?');
  await page.getByRole('button', { name: 'Try contextual question' }).click();
  await expect(page.getByText(/Demo only. Your question about/)).toBeVisible();
  await page.getByRole('button', { name: 'Open full chat' }).click();
  await expect(page.locator('.full-chat')).toBeVisible();
  await page.getByRole('button', { name: 'Close coach' }).click();
  await page.goto('/recovery');
  await page.getByRole('button', { name: '7d', exact: true }).first().click();
  await page
    .getByRole('button', { name: 'Analyze', exact: true })
    .first()
    .click();
  await page.getByText('Inspect chart context').first().click();
  const context = JSON.parse(await page.locator('pre').first().innerText());
  expect(context.timeframeDays).toBe(7);
  expect(context.points).toHaveLength(7);
  expect(context.isMock).toBe(true);
  await page.goto('/running/run-1');
  await expect(
    page.getByRole('heading', { name: 'Easy aerobic run' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test('mobile layouts and PWA assets', async ({ page, request }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/', '/recovery', '/running', '/gym', '/plan']) {
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByRole('navigation')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(
        `${path === '/' ? 'home' : path.slice(1)}-mobile.png`,
      ),
      fullPage: true,
    });
  }
  for (const path of [
    '/manifest.webmanifest',
    '/icon-192.png',
    '/icon-512.png',
    '/offline.html',
    '/sw.js',
  ])
    expect((await request.get(path)).status()).toBe(200);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.screenshot({
    path: testInfo.outputPath('home-desktop.png'),
    fullPage: true,
  });
});
test('set editing, extra exercises and browser back preserve active session', async ({
  page,
}) => {
  await page.goto('/gym');
  await page
    .getByText('Routine templates · structure only', { exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Use Push template', exact: true })
    .click();
  await page.getByRole('button', { name: 'Start Workout' }).click();
  await page
    .getByRole('button', { name: 'Finish workout', exact: true })
    .click();
  await expect(page.locator('main').getByRole('alert')).toContainText(
    'Log at least one completed set',
  );
  await page
    .getByRole('button', { name: 'Add set', exact: false })
    .first()
    .click();
  await expect(
    page.getByLabel('Chest press set 4 reps', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Remove Chest press set 4', exact: true })
    .click();
  await page
    .getByLabel('Add an exercise', { exact: true })
    .selectOption('builtin-calf-raise');
  await page
    .getByRole('button', { name: 'Add exercise', exact: false })
    .click();
  await page.getByLabel('Calf raise set 1 reps', { exact: true }).fill('12');
  await page
    .getByRole('button', { name: 'Log Calf raise set 1', exact: true })
    .click();
  await page.getByLabel('Calf raise set 1 reps', { exact: true }).fill('13');
  await expect(
    page.getByRole('button', { name: 'Log Calf raise set 1', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
  await page
    .getByRole('button', { name: 'Log Calf raise set 1', exact: true })
    .click();
  await page.goBack();
  await expect(
    page.getByRole('link', { name: /Workout in progress/ }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('link', { name: /Workout in progress/ }).click();
  await expect(
    page.getByLabel('Calf raise set 1 reps', { exact: true }),
  ).toHaveValue('13');
  await page
    .getByRole('button', { name: 'Finish workout', exact: true })
    .click();
  await page.locator('summary').filter({ hasText: 'completed sets' }).click();
  await expect(page.getByText('Bodyweight × 13')).toBeVisible();
});
test('mobile navigation, workout discard and chart context', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/recovery');
  await page.getByRole('button', { name: '7d', exact: true }).first().click();
  await page
    .getByRole('button', { name: 'Analyze', exact: true })
    .first()
    .click();
  await expect(page.getByText('Inspect chart context').first()).toBeVisible();
  await page.goto('/gym');
  await page
    .getByText('Routine templates · structure only', { exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Use Push template', exact: true })
    .click();
  await page.getByRole('button', { name: 'Start Workout' }).click();
  await page
    .getByRole('button', { name: 'Discard workout', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirm discard', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Start Workout' }),
  ).toBeVisible();
  await expect(page.getByRole('navigation')).toBeVisible();
});
