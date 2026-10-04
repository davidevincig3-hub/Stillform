import { test, expect } from '@playwright/test';
const header =
  'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe';
const csv =
  header +
  '\nSynthetic imported session,"12 gen 2025, 18:00","12 gen 2025, 19:00",Synthetic note,Synthetic press,1,Controlled,0,normal,80,10,,,9\nSynthetic imported session,"12 gen 2025, 18:00","12 gen 2025, 19:00",Synthetic note,Synthetic press,1,Controlled,1,failure,80,8,,,';
for (const width of [390, 430])
  test(`Hevy import ${width}px: preview, mapping, confirm, history and idempotency`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/gym');
    await page
      .getByText('Backup, export & Hevy import', { exact: true })
      .click();
    await page.getByLabel('Select Hevy CSV').setInputFiles({
      name: 'synthetic-hevy.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv),
    });
    await expect(
      page.getByText('1 workouts · 2 set rows · 1 exercise names', {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem('adaptive-coach.gym.v2') ?? '{"history":[]}',
          ).history.length,
      ),
    ).toBe(0);
    await expect(
      page.getByRole('button', { name: 'Review import summary' }),
    ).toBeDisabled();
    await page
      .getByLabel('Map Synthetic press', { exact: true })
      .selectOption('builtin-chest-press');
    await page.getByRole('button', { name: 'Review import summary' }).click();
    await expect(
      page.getByRole('button', { name: 'Confirm and import Hevy history' }),
    ).toBeDisabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('import-review.png'),
      fullPage: true,
    });
    await page
      .getByLabel('I reviewed timezone, mappings, duplicates and warnings')
      .check();
    await page
      .getByRole('button', { name: 'Confirm and import Hevy history' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Import complete' }),
    ).toBeVisible();
    await page.reload();
    await page.locator('summary').filter({ hasText: 'completed sets' }).click();
    await page.getByRole('link', { name: 'Open workout detail' }).click();
    await expect(
      page.getByText('Source: hevy_import · No heart rate required'),
    ).toBeVisible();
    await expect(
      page.getByText('Hevy exercise: Synthetic press'),
    ).toBeVisible();
    await expect(
      page.getByText('80 kg × 10 · 9 RPE · superset 1', { exact: false }),
    ).toBeVisible();
    await page.goto('/gym/exercises/builtin-chest-press');
    await expect(
      page.getByText('80 kg × 8 · failure · superset 1', { exact: true }),
    ).toBeVisible();
    await page.goto('/gym');
    await page
      .getByText('Routine templates · structure only', { exact: true })
      .click();
    await page.getByRole('button', { name: 'Use Push template' }).click();
    await page.getByRole('button', { name: 'Start Workout' }).click();
    await expect(
      page.getByText('80 kg × 10 · 9 RPE · superset 1', { exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Leave workout' }).click();
    await page
      .getByText('Backup, export & Hevy import', { exact: true })
      .click();
    await page.getByLabel('Select Hevy CSV').setInputFiles({
      name: 'synthetic-hevy.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv),
    });
    await expect(
      page.getByText(
        '1 duplicates will be skipped · 0 possible duplicates · 0 unresolved mappings',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByLabel('Map Synthetic press', { exact: true }),
    ).toHaveValue('builtin-chest-press');
    await page.getByRole('button', { name: 'Review import summary' }).click();
    await page
      .getByLabel('I reviewed timezone, mappings, duplicates and warnings')
      .check();
    await page
      .getByRole('button', { name: 'Confirm and import Hevy history' })
      .click();
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('adaptive-coach.gym.v2')!).history
            .length,
      ),
    ).toBe(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
test('custom exercise metadata and ambiguous duplicates require review', async ({
  page,
}) => {
  await page.goto('/gym');
  await page.getByText('Backup, export & Hevy import', { exact: true }).click();
  await page.getByLabel('Select Hevy CSV').setInputFiles({
    name: 'synthetic.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });
  await page
    .getByLabel('Map Synthetic press', { exact: true })
    .selectOption('create');
  await page.getByLabel('Muscle Synthetic press').fill('Chest');
  await page.getByRole('button', { name: 'Review import summary' }).click();
  await page
    .getByLabel('I reviewed timezone, mappings, duplicates and warnings')
    .check();
  await page
    .getByRole('button', { name: 'Confirm and import Hevy history' })
    .click();
  await page.getByLabel('Select Hevy CSV').setInputFiles({
    name: 'synthetic-changed.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv.replace('80,10', '81,10')),
  });
  await expect(
    page.getByText(
      '0 duplicates will be skipped · 1 possible duplicates · 0 unresolved mappings',
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Review import summary' }).click();
  await expect(
    page.getByText('Review possible duplicates', { exact: true }).last(),
  ).toBeVisible();
  await page
    .getByText('Review possible duplicates', { exact: true })
    .first()
    .click();
  await page.locator('select[aria-label^="Duplicate "]').selectOption('skip');
  await page.getByRole('button', { name: 'Review import summary' }).click();
  await page
    .getByLabel('I reviewed timezone, mappings, duplicates and warnings')
    .check();
  await page
    .getByRole('button', { name: 'Confirm and import Hevy history' })
    .click();
  const data = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('adaptive-coach.gym.v2')!),
  );
  expect(data.history.length).toBe(1);
  expect(
    data.exercises.filter((e: { custom: boolean }) => e.custom).length,
  ).toBe(1);
});

test('large synthetic preview paginates mapping and commits a complete batch', async ({
  page,
}) => {
  const rows = Array.from(
    { length: 4000 },
    (_, i) =>
      `Synthetic large session,"12 gen 2025, 18:00","12 gen 2025, 19:00",,Synthetic exercise ${Math.floor(i / 32)},,,${i % 32},normal,20,10,,,`,
  );
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/gym');
  await page.getByText('Backup, export & Hevy import', { exact: true }).click();
  await page.getByLabel('Select Hevy CSV').setInputFiles({
    name: 'synthetic-large.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(header + '\n' + rows.join('\n')),
  });
  await expect(
    page.getByText('1 workouts · 4000 set rows · 125 exercise names', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('select[aria-label^="Map "]')).toHaveCount(10);
  await page
    .getByRole('button', {
      name: 'Prepare custom exercises for all unresolved names',
    })
    .click();
  await page.getByRole('button', { name: 'Next mappings' }).click();
  await expect(page.locator('select[aria-label^="Map "]')).toHaveCount(10);
  await page.getByRole('button', { name: 'Review import summary' }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByLabel('I reviewed timezone, mappings, duplicates and warnings')
    .check();
  await page
    .getByRole('button', { name: 'Confirm and import Hevy history' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Import complete' }),
  ).toBeVisible();
  const counts = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('adaptive-coach.gym.v2')!);
    return {
      history: s.history.length,
      sets: s.history[0].exercises.reduce(
        (n: number, e: { sets: unknown[] }) => n + e.sets.length,
        0,
      ),
      custom: s.exercises.filter((e: { custom: boolean }) => e.custom).length,
    };
  });
  expect(counts).toEqual({ history: 1, sets: 4000, custom: 125 });
});
test('storage failure never leaves a partial imported batch', async ({
  page,
}) => {
  await page.goto('/gym');
  await page.getByText('Backup, export & Hevy import', { exact: true }).click();
  await page.getByLabel('Select Hevy CSV').setInputFiles({
    name: 'synthetic.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });
  await page
    .getByLabel('Map Synthetic press', { exact: true })
    .selectOption('create');
  await page.getByRole('button', { name: 'Review import summary' }).click();
  await page
    .getByLabel('I reviewed timezone, mappings, duplicates and warnings')
    .check();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'adaptive-coach.gym.v2')
        throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page
    .getByRole('button', { name: 'Confirm and import Hevy history' })
    .click();
  await expect(
    page.getByText('Batch could not be saved. Nothing imported.', {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem('adaptive-coach.gym.v2')),
  ).toBeNull();
  await expect(
    page.getByRole('heading', { name: 'Import complete' }),
  ).toHaveCount(0);
});
