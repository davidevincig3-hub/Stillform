import { test, expect } from '@playwright/test';
import { syntheticGymHistory } from '../helpers/gym-history';
import { exportGymJson } from '../../src/repositories/gym-export';
import { recentExercises } from '../../src/analytics/gym-shortlist';
import { networkInterfaces } from 'node:os';
import { lanAddresses } from '../../scripts/dev-lan.mjs';

test('actual LAN HTTP origin logs and resumes without secure-context APIs', async ({
  page,
}) => {
  const host = lanAddresses(networkInterfaces())[0]?.address;
  test.skip(
    !host,
    'No private IPv4 interface is available on this test machine',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`http://${host}:3100/gym`);
  expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
  expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe('undefined');
  await page
    .getByText('Routine templates · structure only', { exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Use Push template', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Start Workout →', exact: true })
    .click();
  await page.getByLabel('Chest press set 1 weight', { exact: true }).fill('60');
  await page.getByLabel('Chest press set 1 reps', { exact: true }).fill('8');
  await page
    .getByRole('button', { name: 'Log Chest press set 1', exact: true })
    .click();
  await page.getByRole('link', { name: /Leave workout/ }).click();
  await expect(page).toHaveURL(/\/gym$/);
  await expect(
    page.getByRole('link', { name: /Workout in progress/ }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('link', { name: /Workout in progress/ }).click();
  await expect(
    page.getByLabel('Chest press set 1 weight', { exact: true }),
  ).toHaveValue('60');
  await page
    .getByRole('button', { name: 'Finish workout', exact: true })
    .click();
  await expect(
    page.getByTestId('recent-exercises').getByText(/1 workout exposures/),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

for (const width of [390, 430, 1143])
  test(`daily Gym bootstrap, shortlist and LAN-compatible logging at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    // Simulate the API missing on a real, non-secure LAN HTTP origin.
    await page.addInitScript(() =>
      Object.defineProperty(crypto, 'randomUUID', {
        value: undefined,
        configurable: true,
      }),
    );
    const source = syntheticGymHistory(3);
    const first = recentExercises(source, '2026-10-06T10:00:00Z').rows[0]
      .exercise;
    await page.goto('/gym');
    await page
      .getByText('Backup, export & Hevy import', { exact: true })
      .click();
    await page.getByLabel('Stillform JSON backup').setInputFiles({
      name: 'synthetic-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(exportGymJson(source)),
    });
    await expect(
      page.getByRole('heading', { name: 'Review backup copy' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Confirm JSON bootstrap' }),
    ).toBeDisabled();
    await page
      .getByLabel(
        'I reviewed this backup and want to copy it into this empty browser',
      )
      .check();
    await page.getByRole('button', { name: 'Confirm JSON bootstrap' }).click();
    await expect(
      page.getByText('Backup copied. Original IDs and provenance preserved.'),
    ).toBeVisible();
    const recent = page.getByTestId('recent-exercises');
    await expect(
      recent.getByText(/127 recent exercises detected/),
    ).toBeVisible();
    await expect(
      recent.getByRole('link', { name: /Synthetic exercise/ }),
    ).toHaveCount(6);
    await recent
      .getByRole('button', { name: `Pin ${first.name}`, exact: true })
      .click();
    await page.reload();
    await expect(
      recent.getByRole('button', { name: `Unpin ${first.name}`, exact: true }),
    ).toBeVisible();
    await recent
      .getByRole('button', { name: `Dismiss ${first.name}`, exact: true })
      .click();
    await expect(
      recent.getByRole('link', { name: first.name, exact: true }),
    ).toHaveCount(0);
    await recent
      .getByText('Dismissed suggestions (1)', { exact: true })
      .click();
    await recent
      .getByRole('button', { name: `Restore ${first.name}`, exact: true })
      .click();
    await page
      .getByRole('link', { name: 'Create routine', exact: true })
      .click();
    await page
      .getByLabel('Routine name', { exact: true })
      .fill('Daily session');
    await page
      .getByRole('button', {
        name: `Add ${first.name} from recent`,
        exact: true,
      })
      .click();
    await page
      .getByRole('button', { name: 'Save routine', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Start Workout →', exact: true })
      .click();
    await page
      .getByLabel(`${first.name} set 1 weight`, { exact: true })
      .fill('50');
    await page
      .getByLabel(`${first.name} set 1 reps`, { exact: true })
      .fill('10');
    await page
      .getByRole('button', { name: `Log ${first.name} set 1`, exact: true })
      .click();
    await page.getByRole('link', { name: /Leave workout/ }).click();
    await expect(page).toHaveURL(/\/gym$/);
    await expect(
      page.getByRole('link', { name: /Workout in progress/ }),
    ).toBeVisible();
    await page.reload();
    await page.getByRole('link', { name: /Workout in progress/ }).click();
    await expect(
      page.getByLabel(`${first.name} set 1 weight`, { exact: true }),
    ).toHaveValue('50');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole('button', { name: 'Finish workout', exact: true })
      .click();
    await expect(
      recent.getByRole('link', { name: first.name, exact: true }),
    ).toBeVisible();
    await expect(recent.getByText(/2 workout exposures/).first()).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByText('Backup, export & Hevy import', { exact: true })
      .click();
    await expect(page.getByLabel('Stillform JSON backup')).toBeDisabled();
  });
