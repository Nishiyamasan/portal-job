const TIMEZONE_SUFFIX_PATTERN = /(Z|[+-]\d{2}:?\d{2})$/;

export function parseApiDateTime(value: string) {
  return new Date(TIMEZONE_SUFFIX_PATTERN.test(value) ? value : `${value}Z`);
}

export function formatJapanTime(value: string) {
  return parseApiDateTime(value).toLocaleTimeString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatJapanDate(value: string) {
  return parseApiDateTime(value).toLocaleDateString('ja-JP', {
    timeZone: 'Asia/Tokyo',
  });
}
