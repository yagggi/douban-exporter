import { afterEach, describe, expect, it } from "vitest";

import { resumeJob } from "../../src/domain/job-state";
import { MINE_URL } from "../../src/crawler/routes";
import type { FetchedPage } from "../../src/crawler/fetch-page";
import {
  authenticatedTwoBookScenario,
  type CrawlerHarness,
  makeCrawler,
} from "../support/crawler-harness";

describe("Crawler", () => {
  let harness: CrawlerHarness | undefined;

  afterEach(async () => {
    await harness?.cleanup();
    harness = undefined;
  });

  it("discovers all lists, enriches each book once and completes", async () => {
    harness = await makeCrawler();

    await harness.crawler.run();

    expect((await harness.repository.getJob())?.state).toBe("completed");
    expect(await harness.repository.listRecordsSnapshot()).toHaveLength(2);
    expect(
      harness.requestedUrls.filter((url) => url.endsWith("/subject/1036274/")),
    ).toHaveLength(1);
    expect(harness.observedSleeps).toContain(4_000);
  });

  it("commits the current detail before pausing and resumes without repeating it", async () => {
    harness = await makeCrawler({
      onRequest(url, crawler) {
        if (url.endsWith("/subject/1036274/")) {
          crawler.requestPause();
        }
      },
    });

    await harness.crawler.run();
    expect(await harness.repository.getJob()).toMatchObject({
      state: "paused",
      detailsCompleted: 1,
    });

    const paused = await harness.repository.getJob();
    if (!paused) throw new Error("测试任务不存在");
    await harness.repository.saveJob(resumeJob(paused));
    await harness.crawler.run();

    expect((await harness.repository.getJob())?.state).toBe("completed");
    expect(
      harness.requestedUrls.filter((url) => url.endsWith("/subject/1036274/")),
    ).toHaveLength(1);
    expect(
      harness.requestedUrls.filter((url) => url.endsWith("/subject/9999999/")),
    ).toHaveLength(1);
  });

  it("does not start another request when paused during a cooldown", async () => {
    let pauseSent = false;
    harness = await makeCrawler({
      onSleep(_milliseconds, crawler) {
        if (!pauseSent) {
          pauseSent = true;
          crawler.requestPause();
        }
      },
    });

    await harness.crawler.run();

    expect(harness.requestedUrls).toEqual([MINE_URL]);
    expect(await harness.repository.getJob()).toMatchObject({
      state: "paused",
      resumeState: "discovering_lists",
    });
  });

  it.each([
    [403, "captcha_required"],
    [429, "rate_limited"],
  ] as const)(
    "stops without issuing another request after HTTP %s",
    async (status, expectedState) => {
      const pages = new Map<string, FetchedPage>([
        [
          MINE_URL,
          {
            status,
            finalUrl: MINE_URL,
            html: "blocked",
            retryAfterMs: status === 429 ? 180_000 : null,
          },
        ],
      ]);
      harness = await makeCrawler({ pages });

      await harness.crawler.run();

      expect((await harness.repository.getJob())?.state).toBe(expectedState);
      expect(harness.requestedUrls).toEqual([MINE_URL]);
    },
  );

  it("stops on a captcha body returned with HTTP 200", async () => {
    const pages = new Map<string, FetchedPage>([
      [
        MINE_URL,
        {
          status: 200,
          finalUrl: "https://sec.douban.com/",
          html: "<h1>请输入验证码</h1>",
          retryAfterMs: null,
        },
      ],
    ]);
    harness = await makeCrawler({ pages });

    await harness.crawler.run();

    expect((await harness.repository.getJob())?.state).toBe("captcha_required");
    expect(harness.requestedUrls).toHaveLength(1);
  });

  it("retries server errors exactly three times with the frozen backoff", async () => {
    const pages = new Map<string, FetchedPage>([
      [
        MINE_URL,
        {
          status: 503,
          finalUrl: MINE_URL,
          html: "service unavailable",
          retryAfterMs: null,
        },
      ],
    ]);
    harness = await makeCrawler({ pages });

    await harness.crawler.run();

    expect(harness.requestedUrls).toEqual([
      MINE_URL,
      MINE_URL,
      MINE_URL,
      MINE_URL,
    ]);
    expect(harness.observedSleeps).toEqual([30_000, 120_000, 600_000]);
    expect(await harness.repository.getJob()).toMatchObject({
      state: "failed",
      resumeState: "checking_auth",
    });
  });

  it("fails closed when a list page loses its recognizable structure", async () => {
    const pages = authenticatedTwoBookScenario();
    const firstListUrl = [...pages.keys()].find((url) => url.includes("/collect?"));
    if (!firstListUrl) throw new Error("测试列表 URL 不存在");
    pages.set(firstListUrl, {
      status: 200,
      finalUrl: firstListUrl,
      html: "<html><body>新的未知列表结构</body></html>",
      retryAfterMs: null,
    });
    harness = await makeCrawler({ pages });

    await harness.crawler.run();

    expect((await harness.repository.getJob())?.state).toBe("parse_error");
  });
});
