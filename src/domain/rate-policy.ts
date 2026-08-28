const NORMAL_MIN_MS = 4_000;
const NORMAL_MAX_MS = 8_000;
const COOLDOWN_MIN_MS = 45_000;
const COOLDOWN_MAX_MS = 90_000;
const COOLDOWN_EVERY_REQUESTS = 20;
const RETRY_DELAYS_MS = [30_000, 120_000, 600_000] as const;

function boundedRandom(random: () => number): number {
  return Math.min(1, Math.max(0, random()));
}

function jitter(minimum: number, maximum: number, random: () => number): number {
  return Math.round(minimum + (maximum - minimum) * boundedRandom(random));
}

export function normalDelayMs(
  completedRequestCount: number,
  random: () => number = Math.random,
): number {
  const normalDelay = jitter(NORMAL_MIN_MS, NORMAL_MAX_MS, random);
  const needsCooldown =
    completedRequestCount > 0 &&
    completedRequestCount % COOLDOWN_EVERY_REQUESTS === 0;

  if (!needsCooldown) {
    return normalDelay;
  }

  return normalDelay + jitter(COOLDOWN_MIN_MS, COOLDOWN_MAX_MS, random);
}

export function retryDelayMs(attempt: number): number {
  const delay = RETRY_DELAYS_MS[attempt - 1];
  if (delay === undefined) {
    throw new Error("重试次数超出上限");
  }
  return delay;
}
