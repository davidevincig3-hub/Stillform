import { test, expect } from '@playwright/test';
for (const width of [390, 430]) {
  test(`private production access at ${width}px requires sign-in and does not disclose personal data`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const path of [
      '/gym',
      '/running',
      '/recovery',
      '/plan',
      '/integrations',
      '/activities',
      '/',
    ]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\?next=/);
      await expect(
        page.getByRole('heading', { name: 'Sign in to Stillform' }),
      ).toBeVisible();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect((await request.get('/api/session')).status()).toBe(401);
    const crossSite = await request.post('/api/session', {
      headers: { origin: 'https://foreign.test' },
      data: {
        action: 'login',
        email: 'synthetic@example.test',
        password: 'synthetic-only',
      },
    });
    expect(crossSite.status()).toBe(403);
    await page
      .getByLabel('Email', { exact: true })
      .fill('synthetic@example.test');
    await page.getByLabel('Password', { exact: true }).fill('synthetic-only');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: 'Account sign-in is not configured' }),
    ).toBeVisible();
  });
}
