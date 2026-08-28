import { describe, expect, it } from "vitest";

import { normalDelayMs, retryDelayMs } from "../../src/domain/rate-policy";

describe("rate policy", () => {
  it("keeps ordinary requests inside the frozen jitter range", () => {
    expect(normalDelayMs(1, () => 0)).toBe(4_000);
    expect(normalDelayMs(1, () => 1)).toBe(8_000);
  });

  it("adds an extra cooldown after every twentieth request", () => {
    expect(normalDelayMs(20, () => 0)).toBe(49_000);
    expect(normalDelayMs(20, () => 1)).toBe(98_000);
    expect(normalDelayMs(19, () => 0)).toBe(4_000);
  });

  it("clamps an invalid random source instead of escaping the safety range", () => {
    expect(normalDelayMs(1, () => -1)).toBe(4_000);
    expect(normalDelayMs(1, () => 2)).toBe(8_000);
  });

  it("uses exactly three increasingly conservative retries", () => {
    expect([1, 2, 3].map(retryDelayMs)).toEqual([30_000, 120_000, 600_000]);
    expect(() => retryDelayMs(4)).toThrow("重试次数超出上限");
  });
});
