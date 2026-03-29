import { test, expect } from '@playwright/test';

test.describe('smoke tests', () => {
  test('app loads and renders layout', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Minerva Money');
    await expect(page.getByRole('heading', { name: 'Minerva Money' })).toBeVisible();
  });

  test('API health check responds ok', async ({ request }) => {
    const response = await request.get('http://localhost:3001/health');
    expect(response.ok()).toBeTruthy();
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});
