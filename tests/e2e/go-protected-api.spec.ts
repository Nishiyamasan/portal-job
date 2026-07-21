import { expect, test } from '@playwright/test';

const goApiBaseURL = process.env.E2E_GO_API_URL || 'http://localhost:10001';

async function goApiIsRunning(request: import('@playwright/test').APIRequestContext) {
  const response = await request.get(`${goApiBaseURL}/health`, { timeout: 2_000 }).catch(() => null);
  return Boolean(response?.ok());
}

test.describe('Go protected API smoke', () => {
  test.beforeEach(async ({ request }) => {
    test.skip(
      !(await goApiIsRunning(request)),
      'go-api is not running; skipping endpoint checks.',
    );
  });

  test('Go-routed protected endpoints require authentication', async ({ request }) => {
    const health = await request.get(`${goApiBaseURL}/health`);
    expect(health.ok()).toBeTruthy();

    const endpoints = [
      { method: 'get', path: '/api/v1/auth/me' },
      { method: 'get', path: '/api/v1/auth/me/job-seeker-profile' },
      { method: 'get', path: '/api/v1/auth/me/memberships' },
      { method: 'get', path: '/api/v1/jobs/my-jobs' },
      { method: 'get', path: '/api/v1/jobs/my-applications' },
      { method: 'get', path: '/api/v1/messages/conversations' },
      { method: 'get', path: '/api/v1/shops/me/favorites' },
      { method: 'get', path: '/api/v1/admin/owner-applications' },
      { method: 'get', path: '/api/v1/n2-supervisor-portal-xyz/stats' },
      { method: 'get', path: '/api/v1/n2-supervisor-portal-xyz/shops' },
      { method: 'get', path: '/api/v1/media/upload-intent' },
      { method: 'post', path: '/api/v1/shops/00000000-0000-0000-0000-000000000000/favorite' },
      { method: 'post', path: '/api/v1/jobs/' },
      { method: 'post', path: '/api/v1/jobs/00000000-0000-0000-0000-000000000000/apply' },
      { method: 'post', path: '/api/v1/messages/' },
      { method: 'post', path: '/api/v1/owner-applications/' },
      { method: 'post', path: '/api/v1/push/subscriptions' },
      { method: 'post', path: '/api/v1/media/assets' },
    ] as const;

    for (const endpoint of endpoints) {
      const response = endpoint.method === 'get'
        ? await request.get(`${goApiBaseURL}${endpoint.path}`)
        : await request.post(`${goApiBaseURL}${endpoint.path}`, { data: {} });

      expect(response.status(), endpoint.path).toBe(401);
    }
  });
});
