import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';

const goApiBaseURL = process.env.E2E_GO_API_URL || 'http://localhost:10001';

function getFrontendEnv(): Record<string, string> {
  const command = 'docker exec portal-job-frontend sh -lc \'env | grep -E "^(NEXT_PUBLIC_PUBLIC_READ_API_URL|INTERNAL_PUBLIC_READ_API_URL)="\'';

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

test.describe('Go public read page smoke', () => {
  test('public pages render when Go public read API is enabled', async ({ page, request }) => {
    const env = getFrontendEnv();
    test.skip(
      env.NEXT_PUBLIC_PUBLIC_READ_API_URL !== goApiBaseURL,
      `frontend is not configured for Go public read API (${goApiBaseURL}).`,
    );

    const health = await request.get(`${goApiBaseURL}/health`);
    expect(health.ok()).toBeTruthy();

    const [jobs, shops] = await Promise.all([
      request.get(`${goApiBaseURL}/api/v1/jobs/?limit=1`).then((res) => res.json() as Promise<{ id: string; title: string }[]>),
      request.get(`${goApiBaseURL}/api/v1/shops/?limit=1`).then((res) => res.json() as Promise<{ slug: string; name: string }[]>),
    ]);

    await page.goto('/ja');
    await expect(page).toHaveTitle(/portal-job/i);

    await page.goto('/ja/jobs');
    await expect(page.getByRole('heading').first()).toBeVisible();
    if (jobs[0]) {
      await expect(page.getByText(jobs[0].title).first()).toBeVisible();
      await page.goto(`/ja/jobs/${jobs[0].id}`);
      await expect(page.getByRole('heading', { name: jobs[0].title })).toBeVisible();
    }

    await page.goto('/ja/shop');
    await expect(page.getByRole('heading').first()).toBeVisible();
    if (shops[0]) {
      await expect(page.getByText(shops[0].name).first()).toBeVisible();
      await page.goto(`/ja/shop/${shops[0].slug}`);
      await expect(page.getByRole('heading', { name: shops[0].name })).toBeVisible();
    }
  });
});
