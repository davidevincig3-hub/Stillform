import { test, expect, type BrowserContext } from '@playwright/test';
import {
  initialGymStore,
  gymStoreSchema,
  type GymStore,
} from '../../src/repositories/gym-storage';
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
for (const width of [390, 430, 1143])
  test(`account Gym cross-device persistence and retry at ${width}px`, async ({
    browser,
  }) => {
    let store: GymStore | null = null,
      revision = 0,
      loseResponse = false;
    const receipts = new Map<string, number>();
    const install = async (context: BrowserContext) =>
      context.route('**/api/gym', async (route) => {
        if (route.request().method() === 'GET')
          return route.fulfill({
            json: { owner, revision, initialized: !!store, store },
          });
        const body = route.request().postDataJSON();
        if (body.action === 'login')
          return route.fulfill({ json: { authenticated: true } });
        const prior = receipts.get(body.operation);
        if (prior)
          return route.fulfill({ json: { revision: prior, ok: true } });
        if (body.expected !== revision || (body.bootstrap && store))
          return route.fulfill({
            status: 409,
            json: {
              error:
                'Another device changed account Gym data. Reload cloud data; draft retained.',
            },
          });
        store = gymStoreSchema.parse(body.store);
        revision++;
        receipts.set(body.operation, revision);
        if (loseResponse) {
          loseResponse = false;
          return route.abort('failed');
        }
        return route.fulfill({ json: { revision, ok: true } });
      });
    const desktop = await browser.newContext({
        viewport: { width: 1143, height: 900 },
      }),
      phone = await browser.newContext({ viewport: { width, height: 900 } });
    await install(desktop);
    await install(phone);
    const seed = initialGymStore();
    seed.routines = [
      {
        id: 'routine-preserved',
        name: 'Synthetic Push',
        notes: '',
        createdAt: '2026-10-06T00:00:00Z',
        updatedAt: '2026-10-06T00:00:00Z',
        exercises: [
          {
            id: 're-preserved',
            exerciseId: seed.exercises[0].id,
            defaultSets: 2,
            repRange: null,
            notes: '',
          },
        ],
      },
    ];
    await desktop.addInitScript((s) => {
      if (!localStorage.getItem('adaptive-coach.gym.v2'))
        localStorage.setItem('adaptive-coach.gym.v2', JSON.stringify(s));
    }, seed);
    const d = await desktop.newPage(),
      p = await phone.newPage();
    await d.goto('/gym');
    await d.getByText('Account Gym · browser-local', { exact: true }).click();
    await d
      .getByRole('button', { name: 'Check / reload account', exact: true })
      .click();
    await d
      .getByRole('button', { name: 'Preview desktop migration', exact: true })
      .click();
    await expect(
      d.getByRole('button', { name: 'Confirm account bootstrap' }),
    ).toBeDisabled();
    await d.getByRole('checkbox', { name: /I approve uploading/ }).check();
    await d.getByRole('button', { name: 'Confirm account bootstrap' }).click();
    await expect(
      d
        .getByRole('region', { name: 'Account Gym persistence' })
        .getByRole('status'),
    ).toHaveText('Account Gym: synced');
    const localOriginal = await d.evaluate(() =>
      localStorage.getItem('adaptive-coach.gym.v2'),
    );
    await p.goto('/gym');
    await p.getByText('Account Gym · browser-local', { exact: true }).click();
    await p
      .getByRole('button', { name: 'Check / reload account', exact: true })
      .click();
    await expect(
      p
        .getByRole('region', { name: 'Account Gym persistence' })
        .getByRole('status'),
    ).toHaveText('Account Gym: synced');
    await p
      .getByRole('button', { name: 'Start Workout →', exact: true })
      .click();
    await expect(
      p.getByLabel('Chest press set 1 weight', { exact: true }),
    ).toBeVisible();
    loseResponse = true;
    await p.getByLabel('Chest press set 1 weight', { exact: true }).fill('60');
    await expect(p.getByRole('status')).toContainText('Account Gym: error');
    await p.reload();
    await expect(
      p.getByLabel('Chest press set 1 weight', { exact: true }),
    ).toHaveValue('60');
    await expect
      .poll(() => store?.active?.exercises[0].sets[0].weight)
      .toBe(60);
    await p.getByLabel('Chest press set 1 reps', { exact: true }).fill('8');
    await p
      .getByRole('button', { name: 'Log Chest press set 1', exact: true })
      .click();
    await p.getByRole('link', { name: /Leave workout/ }).click();
    await expect(
      p.getByRole('link', { name: /Workout in progress/ }),
    ).toBeVisible();
    await d
      .getByRole('button', { name: 'Check / reload account', exact: true })
      .click();
    await d.getByRole('link', { name: /Workout in progress/ }).click();
    await expect(
      d.getByLabel('Chest press set 1 weight', { exact: true }),
    ).toHaveValue('60');
    await d.getByLabel('Chest press set 2 weight', { exact: true }).fill('62');
    await expect
      .poll(() => store?.active?.exercises[0].sets[1].weight)
      .toBe(62);
    await p.reload();
    await p.getByRole('link', { name: /Workout in progress/ }).click();
    await expect(
      p.getByLabel('Chest press set 2 weight', { exact: true }),
    ).toHaveValue('62');
    await p
      .getByRole('button', { name: 'Finish workout', exact: true })
      .click();
    await expect.poll(() => store?.history.length).toBe(1);
    await expect(
      p.getByTestId('recent-exercises').getByText(/1 workout exposures/),
    ).toBeVisible();
    expect(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await d.evaluate(() => localStorage.getItem('adaptive-coach.gym.v2')),
    ).toBe(localOriginal);
    expect(store!.history[0].routineId).toBe('routine-preserved');
    await d.getByLabel('Chest press set 2 weight', { exact: true }).fill('65');
    await expect(d.getByRole('status')).toContainText('Account Gym: conflict');
    expect(store!.active).toBeNull();
    await d.getByRole('link', { name: /Leave workout/ }).click();
    const accountPanel = d.getByRole('region', {
      name: 'Account Gym persistence',
    });
    await accountPanel.locator('summary').click();
    await accountPanel
      .getByRole('button', {
        name: 'Keep draft backup and reload cloud',
        exact: true,
      })
      .click();
    await expect(accountPanel.getByRole('status')).toHaveText(
      'Account Gym: synced',
    );
    await expect(
      d.getByRole('link', { name: /Workout in progress/ }),
    ).toHaveCount(0);
    await desktop.close();
    await phone.close();
  });

test('migration approval is invalidated when the desktop snapshot changes', async ({
  page,
}) => {
  const seed = initialGymStore();
  await page.addInitScript(
    (s) => localStorage.setItem('adaptive-coach.gym.v2', JSON.stringify(s)),
    seed,
  );
  await page.route('**/api/gym', (route) =>
    route.fulfill({
      json: { owner, revision: 0, initialized: false, store: null },
    }),
  );
  await page.goto('/gym');
  await page.getByText('Account Gym · browser-local', { exact: true }).click();
  await page
    .getByRole('button', { name: 'Check / reload account', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Preview desktop migration', exact: true })
    .click();
  await page.getByRole('checkbox', { name: /I approve uploading/ }).check();
  const confirm = page.getByRole('button', {
    name: 'Confirm account bootstrap',
  });
  await expect(confirm).toBeEnabled();
  await page.evaluate(() => {
    const value = JSON.parse(localStorage.getItem('adaptive-coach.gym.v2')!);
    value.exercisePreferences[value.exercises[0].id] = {
      pinned: true,
      dismissed: false,
    };
    localStorage.setItem('adaptive-coach.gym.v2', JSON.stringify(value));
    window.dispatchEvent(new Event('stillform-storage-change'));
  });
  await expect(confirm).toBeDisabled();
  await page
    .getByRole('button', { name: 'Preview desktop migration', exact: true })
    .click();
  await expect(
    page.getByRole('checkbox', { name: /I approve uploading/ }),
  ).not.toBeChecked();
  await expect(confirm).toBeDisabled();
});
