const JOB_AGE_CONFIRMATION_KEY = 'portal-job_job_age_confirmed';
const CONFIRMATION_VERSION = 'v1';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

export function hasJobAgeConfirmation(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const stored = window.localStorage.getItem(JOB_AGE_CONFIRMATION_KEY);
  if (stored === CONFIRMATION_VERSION) {
    return true;
  }

  return document.cookie
    .split(';')
    .map((value) => value.trim())
    .includes(`${JOB_AGE_CONFIRMATION_KEY}=${CONFIRMATION_VERSION}`);
}

export function saveJobAgeConfirmation() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(JOB_AGE_CONFIRMATION_KEY, CONFIRMATION_VERSION);
  document.cookie = `${JOB_AGE_CONFIRMATION_KEY}=${CONFIRMATION_VERSION}; Max-Age=${MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
}
