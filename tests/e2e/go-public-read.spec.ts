import { expect, test, type APIRequestContext } from '@playwright/test';

const goApiBaseURL = process.env.E2E_GO_API_URL || 'http://localhost:10001';

async function getJSON<T>(request: APIRequestContext, baseURL: string, path: string): Promise<T> {
  const response = await request.get(`${baseURL}${path}`);
  expect(response.ok(), `${baseURL}${path}`).toBeTruthy();
  return response.json() as Promise<T>;
}

async function goApiIsRunning(request: APIRequestContext) {
  const response = await request.get(`${goApiBaseURL}/health`, { timeout: 2_000 }).catch(() => null);
  return Boolean(response?.ok());
}

test.describe('Go public read API parity', () => {
  test.beforeEach(async ({ request }) => {
    test.skip(
      !(await goApiIsRunning(request)),
      'go-api is not running; start it with docker compose --profile api up -d go-api.',
    );
  });

  test('shops list exposes the fields required by public pages', async ({ request }) => {
    const goShops = await getJSON<Record<string, unknown>[]>(request, goApiBaseURL, '/api/v1/shops/?limit=3');

    expect(Array.isArray(goShops)).toBeTruthy();
    expect(goShops.length).toBeGreaterThan(0);
    expect(goShops.length).toBeLessThanOrEqual(3);

    for (const shop of goShops) {
      expect(shop).toEqual(expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        slug: expect.any(String),
        tags: expect.any(Array),
        is_approved: true,
        claim_status: expect.any(String),
        media_assets: expect.any(Array),
      }));
      expect(Object.prototype.hasOwnProperty.call(shop, 'category')).toBeTruthy();
      expect(Object.prototype.hasOwnProperty.call(shop, 'description')).toBeTruthy();
      expect(Object.prototype.hasOwnProperty.call(shop, 'address')).toBeTruthy();
      expect(Object.prototype.hasOwnProperty.call(shop, 'contact_profile_id')).toBeTruthy();
    }
  });

  test('jobs list exposes job images and date fields required by public cards', async ({ request }) => {
    const goJobs = await getJSON<Record<string, unknown>[]>(request, goApiBaseURL, '/api/v1/jobs/?limit=3');

    expect(Array.isArray(goJobs)).toBeTruthy();
    expect(goJobs.length).toBeGreaterThan(0);
    expect(goJobs.length).toBeLessThanOrEqual(3);

    for (const job of goJobs) {
      expect(job).toEqual(expect.objectContaining({
        id: expect.any(String),
        shop_id: expect.any(String),
        title: expect.any(String),
        description: expect.any(String),
        status: 'open',
        media_assets: expect.any(Array),
      }));
      expect(Object.prototype.hasOwnProperty.call(job, 'employment_type')).toBeTruthy();
      expect(Object.prototype.hasOwnProperty.call(job, 'location')).toBeTruthy();
      expect(Object.prototype.hasOwnProperty.call(job, 'published_at')).toBeTruthy();

      for (const asset of job.media_assets as Record<string, unknown>[]) {
        expect(asset).toEqual(expect.objectContaining({
          id: expect.any(String),
          asset_type: expect.any(String),
          url: expect.any(String),
        }));
        expect(Object.prototype.hasOwnProperty.call(asset, 'job_post_id')).toBeTruthy();
      }
    }
  });

  test('shop and job detail endpoints return the same resource ids as their list endpoints', async ({ request }) => {
    const [shops, jobs] = await Promise.all([
      getJSON<Record<string, unknown>[]>(request, goApiBaseURL, '/api/v1/shops/?limit=1'),
      getJSON<Record<string, unknown>[]>(request, goApiBaseURL, '/api/v1/jobs/?limit=1'),
    ]);

    const shop = shops[0];
    const job = jobs[0];

    const [shopDetail, jobDetail] = await Promise.all([
      getJSON<Record<string, unknown>>(request, goApiBaseURL, `/api/v1/shops/${shop.slug}`),
      getJSON<Record<string, unknown>>(request, goApiBaseURL, `/api/v1/jobs/${job.id}`),
    ]);

    expect(shopDetail.id).toBe(shop.id);
    expect(jobDetail.id).toBe(job.id);
    expect(shopDetail.media_assets).toEqual(expect.any(Array));
    expect(jobDetail.media_assets).toEqual(expect.any(Array));
  });
});
