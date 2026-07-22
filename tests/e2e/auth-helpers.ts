import { type APIRequestContext, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';

export type TestAuth = {
  accessToken: string;
  userId: string;
  email: string;
};

type RuntimeEnv = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  NEXT_PUBLIC_API_URL?: string;
};

function runShell(command: string) {
  const executable = process.platform === 'win32' ? 'wsl' : 'sh';
  const args = process.platform === 'win32'
    ? ['-e', 'sh', '-lc', command]
    : ['-lc', command];

  return execFileSync(executable, args, { encoding: 'utf8' });
}

function parseEnvOutput(output: string): Record<string, string> {
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
}

export function getFrontendRuntimeEnv(): RuntimeEnv {
  const command = 'docker exec portal-job-frontend sh -lc \'env | grep -E "^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|NEXT_PUBLIC_API_URL)="\'';

  try {
    return parseEnvOutput(runShell(command));
  } catch {
    return {};
  }
}

export async function getTestAuth(request: APIRequestContext): Promise<TestAuth> {
  const runtimeEnv = getFrontendRuntimeEnv();
  const supabaseUrl = process.env.E2E_SUPABASE_URL || runtimeEnv.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.E2E_SUPABASE_ANON_KEY || runtimeEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = process.env.E2E_AUTH_EMAIL || process.env.E2E_TEST_EMAIL || '';
  const password = process.env.E2E_AUTH_PASSWORD || process.env.E2E_TEST_PASSWORD || '';

  test.skip(!supabaseUrl || !supabaseAnonKey, 'Supabase env is unavailable; start the frontend container or set E2E_SUPABASE_URL/E2E_SUPABASE_ANON_KEY.');
  test.skip(!email || !password, 'Authenticated E2E requires E2E_AUTH_EMAIL and E2E_AUTH_PASSWORD.');
  if (!supabaseUrl || !supabaseAnonKey || !email || !password) {
    throw new Error('Authenticated E2E configuration is incomplete.');
  }

  const response = await request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    data: {
      email,
      password,
    },
  });

  test.skip(response.status() === 400 || response.status() === 401, 'Authenticated E2E credentials were rejected.');

  if (!response.ok()) {
    throw new Error(`Failed to obtain Supabase test token: ${response.status()} ${await response.text()}`);
  }

  const body = await response.json() as { access_token?: string; user?: { id?: string; email?: string } };
  if (!body.access_token || !body.user?.id) {
    throw new Error('Supabase auth response did not include an access token.');
  }

  return {
    accessToken: body.access_token,
    userId: body.user.id,
    email: body.user.email || email,
  };
}
