import { expect, test } from '@playwright/test';
import { getFrontendRuntimeEnv, getTestAuth } from './auth-helpers';

const goApiBaseURL = process.env.E2E_GO_API_URL || 'http://localhost:10001';

type Shop = {
  id: string;
  name?: string;
  is_approved?: boolean;
};

type JobPost = {
  id: string;
  shop_id: string;
  title: string;
  description: string;
  status: string;
};

async function goApiIsRunning(request: import('@playwright/test').APIRequestContext) {
  const response = await request.get(`${goApiBaseURL}/health`, { timeout: 2_000 }).catch(() => null);
  return Boolean(response?.ok());
}

test.describe('Go authenticated API smoke', () => {
  test.beforeEach(async ({ request }) => {
    test.skip(
      !(await goApiIsRunning(request)),
      'go-api is not running; skipping endpoint checks.',
    );
  });

  test('authenticated reads and low-risk writes use Go API successfully', async ({ request }) => {
    const auth = await getTestAuth(request);
    const headers = { Authorization: `Bearer ${auth.accessToken}` };

    const health = await request.get(`${goApiBaseURL}/health`);
    expect(health.ok()).toBeTruthy();

    const [myJobs, conversations, shops] = await Promise.all([
      request.get(`${goApiBaseURL}/api/v1/jobs/my-jobs`, { headers }),
      request.get(`${goApiBaseURL}/api/v1/messages/conversations`, { headers }),
      request.get(`${goApiBaseURL}/api/v1/shops/?limit=1`),
    ]);

    expect(myJobs.status()).toBe(200);
    expect(conversations.status()).toBe(200);
    expect(Array.isArray(await myJobs.json())).toBeTruthy();
    expect(Array.isArray(await conversations.json())).toBeTruthy();

    const publicShops = await shops.json() as Shop[];
    test.skip(publicShops.length === 0, 'No public shop is available for favorite smoke.');

    const favorite = await request.post(`${goApiBaseURL}/api/v1/shops/${publicShops[0].id}/favorite`, { headers });
    expect([200, 201]).toContain(favorite.status());

    const unfavorite = await request.delete(`${goApiBaseURL}/api/v1/shops/${publicShops[0].id}/favorite`, { headers });
    expect([200, 204]).toContain(unfavorite.status());
  });

  test('job CRUD uses Go API when the test user has an approved manageable shop', async ({ request }) => {
    const auth = await getTestAuth(request);
    const headers = { Authorization: `Bearer ${auth.accessToken}` };
    const runtimeEnv = getFrontendRuntimeEnv();
    const primaryApiBaseURL = process.env.E2E_PRIMARY_API_URL || runtimeEnv.NEXT_PUBLIC_API_URL || 'http://localhost:10000';

    const shopsResponse = await request.get(`${primaryApiBaseURL}/api/v1/shops/admin/all`, { headers });
    test.skip(shopsResponse.status() === 401 || shopsResponse.status() === 403, 'Test user cannot access owner shops.');

    if (!shopsResponse.ok()) {
      throw new Error(`Failed to load owner shops: ${shopsResponse.status()} ${await shopsResponse.text()}`);
    }

    const shops = await shopsResponse.json() as Shop[];
    const shop = shops.find((candidate) => candidate.is_approved) || shops[0];
    test.skip(!shop, 'Test user has no manageable shop for job CRUD smoke.');
    test.skip(shop.is_approved === false, 'Test user has no approved shop for job CRUD smoke.');

    const timestamp = Date.now();
    const createResponse = await request.post(`${goApiBaseURL}/api/v1/jobs/`, {
      headers,
      data: {
        shop_id: shop.id,
        title: `E2E Go job ${timestamp}`,
        description: 'Created by authenticated Go API smoke test.',
        employment_type: 'E2E',
        location: 'Tokyo',
        status: 'draft',
        published_at: new Date().toISOString(),
      },
    });
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json() as JobPost;
    expect(created.shop_id).toBe(shop.id);

    const updateResponse = await request.put(`${goApiBaseURL}/api/v1/jobs/${created.id}`, {
      headers,
      data: {
        title: `${created.title} updated`,
        description: `${created.description} Updated.`,
        employment_type: 'E2E',
        location: 'Tokyo',
        status: 'draft',
        published_at: new Date().toISOString(),
      },
    });
    expect(updateResponse.status()).toBe(200);
    const updated = await updateResponse.json() as JobPost;
    expect(updated.title).toContain('updated');

    const deleteResponse = await request.delete(`${goApiBaseURL}/api/v1/jobs/${created.id}`, { headers });
    expect(deleteResponse.status()).toBe(204);
  });
});
