import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
async function template(page: Page) {
  await page.goto('/gym');
  await page
    .getByText('Routine templates · structure only', { exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Use Push template', exact: true })
    .click();
}
async function logSet(page: Page, weight = '80', reps = '10', rir = '1') {
  await page
    .getByLabel('Chest press set 1 weight', { exact: true })
    .fill(weight);
  await page.getByLabel('Chest press set 1 reps', { exact: true }).fill(reps);
  if (rir)
    await page.getByLabel('Chest press set 1 rir', { exact: true }).fill(rir);
  await page
    .getByRole('button', { name: 'Log Chest press set 1', exact: true })
    .click();
}
test('routine create/edit/rename/reorder/duplicate/delete persists', async ({
  page,
}) => {
  await page.goto('/gym');
  await page.getByRole('link', { name: 'Create routine', exact: true }).click();
  await page.getByLabel('Routine name', { exact: true }).fill('Personal Upper');
  await page
    .getByLabel('Exercise library', { exact: true })
    .selectOption('builtin-chest-press');
  await page
    .getByRole('button', { name: 'Add to routine', exact: true })
    .click();
  await page.getByLabel('Chest press default sets').fill('2');
  await page.getByLabel('Chest press minimum reps').fill('8');
  await page.getByLabel('Chest press maximum reps').fill('12');
  await page.getByLabel('Chest press routine notes').fill('Controlled tempo');
  await page
    .getByLabel('Exercise library', { exact: true })
    .selectOption('builtin-shoulder-press');
  await page
    .getByRole('button', { name: 'Add to routine', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Move Shoulder press up', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: '1. Shoulder press', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save routine', exact: true }).click();
  await expect(page).toHaveURL('/gym');
  await page.reload();
  await page
    .getByRole('link', { name: 'Edit Personal Upper', exact: true })
    .click();
  await expect(page.getByLabel('Chest press default sets')).toHaveValue('2');
  await page.getByLabel('Routine name', { exact: true }).fill('Upper renamed');
  await page
    .getByRole('button', {
      name: 'Remove Shoulder press from routine',
      exact: true,
    })
    .click();
  await page.getByRole('button', { name: 'Save routine', exact: true }).click();
  await page
    .getByRole('button', { name: 'Duplicate Upper renamed', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Upper renamed copy', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Delete Upper renamed routine', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirm delete routine', exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Upper renamed', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Upper renamed copy', exact: true }),
  ).toBeVisible();
});
test('custom exercise editing and selection from library', async ({ page }) => {
  await page.goto('/gym/exercises');
  await page
    .getByRole('button', { name: 'Create custom exercise', exact: true })
    .click();
  await page
    .getByLabel('Exercise name', { exact: true })
    .fill('My cable press');
  await page.getByLabel('Primary muscle group', { exact: true }).fill('Chest');
  await page.getByLabel('Equipment · optional', { exact: true }).fill('Cable');
  await page
    .getByRole('button', { name: 'Save exercise', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Edit My cable press', exact: true })
    .click();
  await page
    .getByLabel('Exercise name', { exact: true })
    .fill('My single-arm cable press');
  await page
    .getByRole('button', { name: 'Save exercise', exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole('heading', {
      name: 'My single-arm cable press',
      exact: true,
    }),
  ).toBeVisible();
  await page.goto('/gym/routines/new');
  await page.getByLabel('Routine name', { exact: true }).fill('Custom day');
  await page
    .getByLabel('Exercise library', { exact: true })
    .selectOption({ label: 'My single-arm cable press · Chest · custom' });
  await page
    .getByRole('button', { name: 'Add to routine', exact: true })
    .click();
  await page.getByRole('button', { name: 'Save routine', exact: true }).click();
  await page.getByRole('button', { name: 'Start Workout' }).click();
  await expect(
    page.getByRole('heading', {
      name: 'My single-arm cable press',
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText('No previous real exposure yet.')).toBeVisible();
  await page
    .getByRole('button', { name: 'Discard workout', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirm discard', exact: true })
    .click();
});
test('actual history, effort options, previous performance and detail deletion', async ({
  page,
}) => {
  await template(page);
  await page.getByRole('button', { name: 'Start Workout' }).click();
  await expect(
    page.getByText('No previous real exposure yet.').first(),
  ).toBeVisible();
  await expect(page.getByText('60 kg', { exact: false })).toHaveCount(0);
  await logSet(page);
  await expect(
    page.getByRole('button', { name: 'Unlog Chest press set 1', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Chest press set 2 reps', { exact: true }).fill('8');
  const options = page.locator('.set-block').nth(1);
  await options.locator('summary').click();
  await page.getByLabel('Chest press set 2 RPE', { exact: true }).fill('9');
  await options.getByLabel('Reached failure').check();
  await page
    .getByRole('button', { name: 'Log Chest press set 2', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Finish workout', exact: true })
    .click();
  await expect(page).toHaveURL('/gym');
  await page.reload();
  await page.locator('summary').filter({ hasText: 'completed sets' }).click();
  await expect(
    page.getByText('80 kg × 10 @ 1 RIR', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'Open workout detail', exact: false })
    .click();
  await expect(
    page.getByText('Source: local_logger · No heart rate required'),
  ).toBeVisible();
  await expect(
    page.getByText('Bodyweight × 8 · 9 RPE · failure', { exact: false }),
  ).toBeVisible();
  await page.goto('/gym');
  await page.getByRole('button', { name: 'Start Workout' }).click();
  await expect(
    page.getByText('80 kg × 10 @ 1 RIR', { exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Leave workout' }).click();
  await page.goto('/gym/exercises/builtin-chest-press');
  await expect(
    page.getByText('80 kg × 10 @ 1 RIR', { exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Push →', exact: true }).click();
  await page
    .getByRole('button', { name: 'Delete workout', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirm delete workout', exact: true })
    .click();
  await expect(
    page.getByText('No confirmed completed workouts yet.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('link', { name: /Workout in progress/ }).click();
  await expect(
    page.getByText('No previous real exposure yet.').first(),
  ).toBeVisible();
});
test('JSON/CSV downloads and invalid Hevy preview never import', async ({
  page,
}, testInfo) => {
  await template(page);
  await page.getByRole('button', { name: 'Start Workout' }).click();
  await logSet(page);
  await page
    .getByRole('button', { name: 'Finish workout', exact: true })
    .click();
  await page.getByText('Backup, export & Hevy import', { exact: true }).click();
  let pending = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Export JSON backup', exact: true })
    .click();
  let download = await pending;
  const jsonPath = testInfo.outputPath('backup.json');
  await download.saveAs(jsonPath);
  const backup = JSON.parse(await readFile(jsonPath, 'utf-8'));
  expect(backup.formatVersion).toBe(1);
  expect(backup.storageVersion).toBe(2);
  expect(backup.data.history[0].exercises[0].sets[0].weight).toBe(80);
  expect(backup.data.routines).toHaveLength(1);
  pending = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Export CSV history', exact: true })
    .click();
  download = await pending;
  const csvPath = testInfo.outputPath('history.csv');
  await download.saveAs(csvPath);
  expect(await readFile(csvPath, 'utf-8')).toContain('local_logger');
  await page.getByLabel('Select Hevy CSV').setInputFiles({
    name: 'hevy.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('unknown,columns\nnot,parsed'),
  });
  await expect(
    page.getByText(/CSV must contain exactly the 14 verified Hevy columns/),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('adaptive-coach.gym.v2')!).history
          .length,
    ),
  ).toBe(1);
});
for (const width of [390, 430])
  test(`mobile logger ${width}px: tap targets, persistence and global navigation`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await template(page);
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await logSet(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    for (const selector of ['.set-check', '.set-delete']) {
      const box = await page.locator(selector).first().boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({
      path: testInfo.outputPath(`workout-${width}.png`),
      fullPage: true,
    });
    await page.getByRole('link', { name: 'Leave workout' }).click();
    for (const name of ['Home', 'Recovery', 'Running', 'Plan', 'Gym']) {
      await page
        .getByRole('navigation')
        .getByRole('link', { name, exact: true })
        .click();
      await expect(
        page.getByRole('link', { name: /Workout in progress/ }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    await page.reload();
    await page.getByRole('link', { name: /Workout in progress/ }).click();
    await expect(
      page.getByLabel('Chest press set 1 weight', { exact: true }),
    ).toHaveValue('80');
    await page.getByRole('button', { name: 'Open AI Coach' }).click();
    await expect(
      page.getByText('Context: active workout.', { exact: false }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Close coach' }).click();
    await page
      .getByRole('button', { name: 'Finish workout', exact: true })
      .click();
    await expect(page).toHaveURL('/gym');
    await page.reload();
    await expect(
      page.locator('summary').filter({ hasText: 'completed sets' }),
    ).toBeVisible();
  });
test('legacy active/history stay available but never become personal evidence without review', async ({
  page,
}) => {
  const timestamp = new Date().toISOString();
  const exercise = {
    id: 'old-ex',
    name: 'Chest press',
    muscleGroup: 'Chest',
    previous: 'FAKE 999 kg',
    sets: [
      {
        id: 'old-set',
        weight: 70,
        reps: 8,
        rir: null,
        rpe: null,
        failure: false,
        completed: true,
        loggedAt: timestamp,
      },
    ],
  };
  const session = {
    id: 'old-active',
    routineName: 'Older Push',
    startedAt: timestamp,
    endedAt: null,
    status: 'active',
    exercises: [exercise],
  };
  await page.addInitScript(
    ({ session, timestamp }) => {
      if (!localStorage.getItem('legacy-fixture-installed')) {
        localStorage.setItem(
          'adaptive-coach.workouts.v1',
          JSON.stringify({
            version: 1,
            active: session,
            history: [
              {
                ...session,
                id: 'old-completed',
                status: 'completed',
                endedAt: timestamp,
              },
            ],
          }),
        );
        localStorage.setItem('legacy-fixture-installed', 'true');
      }
    },
    { session, timestamp },
  );
  await page.goto('/gym');
  await expect(
    page.getByText('Older V1 records · review required'),
  ).toBeVisible();
  await expect(
    page.getByText('No confirmed completed workouts yet.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('link', { name: /Workout in progress/ }).click();
  await expect(page.getByText('No previous real exposure yet.')).toBeVisible();
  await expect(page.getByText('FAKE 999 kg')).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByLabel('Chest press set 1 weight', { exact: true }),
  ).toHaveValue('70');
  await page
    .getByRole('button', {
      name: 'Confirm this is my real workout',
      exact: true,
    })
    .click();
  await page
    .getByRole('button', { name: 'Finish workout', exact: true })
    .click();
  await expect(page).toHaveURL('/gym');
  await page.reload();
  await expect(
    page.locator('summary').filter({ hasText: 'completed sets' }),
  ).toBeVisible();
});
