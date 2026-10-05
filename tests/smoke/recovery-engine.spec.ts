import { test, expect } from '@playwright/test';
import { assessRecovery } from '../../src/analytics/recovery-engine';
import { engineFixture, metricFixture } from '../helpers/recovery-engine';

test('Home and Recovery consume the same real engine result without sample recovery leakage', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1143, height: 900 });
  const engine = assessRecovery(engineFixture());
  const data = {
    realMode: true,
    connected: true,
    sleep: [],
    nightly: [],
    continuousDays: 0,
    ppiDays: 0,
    asOf: '2026-10-05T10:00:00Z',
    engine,
    engineInput: engineFixture(),
    recordCounts: { sleep: { provider: 2, valid: 0, excluded: 2 } },
    history: [],
  };
  await page.route('**/api/polar/recovery', (r) => r.fulfill({ json: data }));
  let sharedText = '';
  for (const path of ['/', '/recovery']) {
    await page.goto(path);
    const assessment = page.getByTestId('recovery-engine');
    await expect(assessment).toHaveAttribute('data-state', 'insufficient_data');
    await expect(assessment).toHaveAttribute(
      'data-explanation',
      'baseline_needed',
    );
    await expect(
      assessment.getByRole('heading', {
        name: 'Insufficient data',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      assessment.getByText('Confidence: insufficient', { exact: true }),
    ).toBeVisible();
    const text = await assessment.innerText();
    if (sharedText) expect(text).toBe(sharedText);
    else sharedText = text;
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByText('Small dip, stable trend', { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText('DEMO · SAMPLE DATA', { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText('42 nights · sample baseline', { exact: true }),
    ).toHaveCount(0);
  }
  await expect(
    page.getByRole('heading', { name: '0 valid sleep nights', exact: true }),
  ).toBeVisible();
});
for (const width of [390, 430])
  test(`Recovery engine real converging evidence remains readable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const engine = assessRecovery(
      engineFixture([
        metricFixture('hrv', 'autonomic', 40, 20),
        metricFixture('sleep', 'sleep', 8, 4),
      ]),
    );
    await page.route('**/api/polar/recovery', (r) =>
      r.fulfill({
        json: {
          realMode: true,
          connected: true,
          sleep: [],
          nightly: [],
          continuousDays: 0,
          ppiDays: 0,
          asOf: '2026-10-05T10:00:00Z',
          engine,
        },
      }),
    );
    await page.goto('/recovery');
    await expect(page.getByTestId('recovery-engine')).toHaveAttribute(
      'data-state',
      'possibly_suppressed',
    );
    await page.getByText('Explain recovery evidence', { exact: true }).click();
    await expect(
      page.getByText(/Product heuristics; not clinically/),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
test('configured backend failure never substitutes sample Recovery on Home or Recovery', async ({
  page,
}) => {
  await page.route('**/api/polar/recovery', (r) =>
    r.fulfill({ status: 503, json: { error: 'Unavailable' } }),
  );
  await page.route('**/api/polar/status', (r) =>
    r.fulfill({ json: { configured: true, connected: true } }),
  );
  for (const path of ['/', '/recovery']) {
    await page.goto(path);
    await expect(
      page.getByRole('heading', {
        name: 'Recovery assessment unavailable',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText('DEMO · SAMPLE DATA', { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText('Small dip, stable trend', { exact: true }),
    ).toHaveCount(0);
  }
});
