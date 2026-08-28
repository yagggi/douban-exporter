import { describe, expect, it } from "vitest";

import { waitForCrawlerIdle } from "../../src/background/wait-for-idle";
import { makeJob } from "../support/factories";

describe("waitForCrawlerIdle", () => {
  it("waits until the persisted job leaves an active state", async () => {
    const jobs = [
      makeJob({ state: "enriching_details" }),
      makeJob({ state: "paused", resumeState: "enriching_details" }),
    ];
    const waits: number[] = [];

    await waitForCrawlerIdle(
      async () => jobs.shift(),
      async (milliseconds) => {
        waits.push(milliseconds);
      },
      35_000,
      () => 0,
    );

    expect(waits).toEqual([250]);
  });

  it("times out instead of deleting data while a request is still active", async () => {
    let now = 0;
    await expect(
      waitForCrawlerIdle(
        async () => makeJob({ state: "enriching_details" }),
        async (milliseconds) => {
          now += milliseconds;
        },
        500,
        () => now,
      ),
    ).rejects.toThrow("等待抓取器暂停超时");
  });
});
