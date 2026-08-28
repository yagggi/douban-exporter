export interface FetchedPage {
  status: number;
  finalUrl: string;
  html: string;
  retryAfterMs: number | null;
}

export type FetchImplementation = (
  url: string,
  init: RequestInit,
) => Promise<Response>;

function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (value === null) {
    return null;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1_000);
  }
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

export async function fetchPage(
  url: string,
  fetchImpl: FetchImplementation = fetch,
  timeoutMs = 30_000,
): Promise<FetchedPage> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      credentials: "include",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
    });
    return {
      status: response.status,
      finalUrl: response.url || url,
      html: await response.text(),
      retryAfterMs: parseRetryAfter(response.headers.get("retry-after")),
    };
  } finally {
    clearTimeout(timeout);
  }
}
