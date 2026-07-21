import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';

const forbiddenApiHosts = [
  '153.127.66.79:10000',
  'sudden-physical-leonard-leo.trycloudflare.com',
];

function getFrontendEnv(): Record<string, string> {
  const command = 'docker exec portal-job-frontend sh -lc \'env | grep -E "^(INTERNAL_API_URL|NEXT_PUBLIC_API_URL|INTERNAL_GO_API_URL|NEXT_PUBLIC_GO_API_URL)="\'';

  try {
    const executable = process.platform === 'win32' ? 'wsl' : 'sh';
    const args = process.platform === 'win32'
      ? ['-e', 'sh', '-lc', command]
      : ['-lc', command];
    const output = execFileSync(
      executable,
      args,
      { encoding: 'utf8' },
    );

    return Object.fromEntries(
      output
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const index = line.indexOf('=');
          return [line.slice(0, index), line.slice(index + 1)];
        }),
    );
  } catch {
    return {};
  }
}

async function localApiIsRunning(request: import('@playwright/test').APIRequestContext) {
  const response = await request.get('http://localhost:10001/health', { timeout: 2_000 }).catch(() => null);
  return Boolean(response?.ok());
}

test.describe('local routing smoke', () => {
  test('frontend container uses local API endpoints', () => {
    const env = getFrontendEnv();

    test.skip(
      !env.INTERNAL_API_URL && !env.NEXT_PUBLIC_API_URL,
      'portal-job-frontend container is not running; start docker compose local first.',
    );

    expect(env.INTERNAL_API_URL).toBe('http://go-api:10001');
    expect(env.NEXT_PUBLIC_API_URL).toBe('http://localhost:10001');
    expect(env.INTERNAL_GO_API_URL).toBe('http://go-api:10001');
    expect(env.NEXT_PUBLIC_GO_API_URL).toBe('http://localhost:10001');
  });

  test('public pages render without calling production API from the browser', async ({ page, request }) => {
    test.skip(
      !(await localApiIsRunning(request)),
      'local go-api is not running; skipping.',
    );

    const health = await request.get('http://localhost:10001/health');
    expect(health.ok()).toBeTruthy();

    const seenUrls: string[] = [];
    page.on('request', (request) => {
      seenUrls.push(request.url());
    });

    await page.goto('/ja');
    await expect(page).toHaveTitle(/portal-job/i);

    await page.goto('/ja/shop');
    await expect(page.getByRole('heading').first()).toBeVisible();

    const leakedUrl = seenUrls.find((url) =>
      forbiddenApiHosts.some((host) => url.includes(host)),
    );
    expect(leakedUrl).toBeUndefined();
  });

  test('missing local shop detail does not create a server error', async ({ page, request }) => {
    test.skip(
      !(await localApiIsRunning(request)),
      'local go-api is not running; skipping.',
    );

    const response = await page.goto('/ja/shop/portal-job-e2e-missing-shop');

    expect(response?.status()).not.toBe(500);
    await expect(page.locator('body')).toContainText(/404|Not Found|Shop Not Found/i);
  });
});
