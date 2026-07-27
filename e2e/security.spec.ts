import { test, expect } from '@playwright/test';
import { MockApiHandler } from './fixtures/mock-api';

let mock;

// ─── 1. CSP IN HTML ───

test.describe('Content Security Policy', () => {
  test.beforeEach(async ({ page }) => {
    mock = new MockApiHandler();
    await mock.setup(page);
  });

  test.afterEach(() => {
    if (mock) mock.reset();
  });

  test('CSP meta tag is present in index.html', async ({ page }) => {
    await page.goto('/features-bug');
    const cspMeta = await page.locator('meta[http-equiv="Content-Security-Policy"]');
    await expect(cspMeta).toHaveAttribute('content', /default-src 'self'/);
  });
});

// ─── 2. TOKEN STORAGE CHECK ───

test.describe('Token storage', () => {
  test.beforeEach(async ({ page }) => {
    mock = new MockApiHandler();
    await mock.setup(page);
    await page.goto('/features-bug');
    await page.evaluate(() => {
      sessionStorage.setItem('token', 'fake-jwt-token-for-testing');
    });
    await page.reload();
    await page.waitForSelector('.card', { timeout: 15000 });
  });

  test.afterEach(() => {
    if (mock) mock.reset();
  });

  test('token is stored in sessionStorage but NOT in localStorage', async ({ page }) => {
    const sessionToken = await page.evaluate(() => sessionStorage.getItem('token'));
    const localToken = await page.evaluate(() => localStorage.getItem('token'));
    expect(sessionToken).not.toBeNull();
    expect(localToken).toBeNull();
  });
});
