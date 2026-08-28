import { afterEach, describe, expect, it } from "vitest";

import { resumeJobWithAuthCheck } from "../../src/domain/job-state";
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
    await harness.repository.saveJob(resumeJobWithAuthCheck(paused));
    await harness.crawler.run();

    expect((await harness.repository.getJob())?.state).toBe("completed");
    expect(
      harness.requestedUrls.filter((url) => url.endsWith("/subject/1036274/")),
    ).toHaveLength(1);
    expect(harness.requestedUrls.filter((url) => url === MINE_URL)).toHaveLength(
      2,
    );
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

  it("wakes a long cooldown immediately when pause is requested", async () => {
    let signalSleepStarted = () => {};
    const sleepStarted = new Promise<void>((resolve) => {
      signalSleepStarted = resolve;
    });
    let releaseSleep = () => {};
    harness = await makeCrawler({
      sleepImplementation: async (_milliseconds, signal) =>
        new Promise<void>((resolve) => {
          releaseSleep = resolve;
          signal?.addEventListener("abort", () => resolve(), { once: true });
          signalSleepStarted();
        }),
    });

    const running = harness.crawler.run();
    await sleepStarted;
    harness.crawler.requestPause();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect((await harness.repository.getJob())?.state).toBe("paused");
    releaseSleep();
    await running;
  });

  it("honors a pause that arrives immediately before the run loop starts", async () => {
    harness = await makeCrawler();
    harness.crawler.requestPause();

    await harness.crawler.run();

    expect(harness.requestedUrls).toEqual([]);
    expect(await harness.repository.getJob()).toMatchObject({
      state: "paused",
      resumeState: "checking_auth",
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

  it("treats a successful page without a user identity as authentication required", async () => {
    const pages = new Map<string, FetchedPage>([
      [
        MINE_URL,
        {
          status: 200,
          finalUrl: MINE_URL,
          html: "<html><body>无法识别的个人入口</body></html>",
          retryAfterMs: null,
        },
      ],
    ]);
    harness = await makeCrawler({ pages });

    await harness.crawler.run();

    expect(await harness.repository.getJob()).toMatchObject({
      state: "auth_required",
      resumeState: "checking_auth",
    });
  });

  it("does not continue an existing task under a different Douban account", async () => {
    harness = await makeCrawler();
    const job = await harness.repository.getJob();
    if (!job) throw new Error("测试任务不存在");
    await harness.repository.saveJob({
      ...job,
      state: "checking_auth",
      userId: "another-user",
      userName: "另一个用户",
      resumeAfterAuth: "enriching_details",
    });

    await harness.crawler.run();

    expect(await harness.repository.getJob()).toMatchObject({
      state: "auth_required",
      resumeAfterAuth: "enriching_details",
      lastError: { category: "account_mismatch" },
    });
    expect(harness.requestedUrls).toEqual([MINE_URL]);
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

  it("does not re-enter a retry backoff after pause wakes it", async () => {
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
    let signalSleepStarted = () => {};
    const sleepStarted = new Promise<void>((resolve) => {
      signalSleepStarted = resolve;
    });
    let signalPaused = () => {};
    const paused = new Promise<void>((resolve) => {
      signalPaused = resolve;
    });
    let sleepCallCount = 0;
    harness = await makeCrawler({
      pages,
      sleepImplementation: async (_milliseconds, signal) => {
        sleepCallCount += 1;
        signalSleepStarted();
        if (sleepCallCount > 1) return;
        await new Promise<void>((resolve) => {
          signal?.addEventListener("abort", () => resolve(), { once: true });
        });
      },
      onPublish(job) {
        if (job.state === "paused") signalPaused();
      },
    });

    const running = harness.crawler.run();
    await sleepStarted;
    harness.crawler.requestPause();
    await paused;
    await running;

    expect((await harness.repository.getJob())?.state).toBe("paused");
    expect(harness.observedSleeps).toEqual([30_000]);
    expect(harness.requestedUrls).toEqual([MINE_URL]);
  });

  it("does not enter retry backoff when pause arrives as retry state is saved", async () => {
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
    let pauseSent = false;
    harness = await makeCrawler({
      pages,
      onPublish(job, crawler) {
        if (!pauseSent && job.retry?.attempt === 1) {
          pauseSent = true;
          crawler.requestPause();
        }
      },
    });

    await harness.crawler.run();

    expect((await harness.repository.getJob())?.state).toBe("paused");
    expect(harness.observedSleeps).toEqual([]);
    expect(harness.requestedUrls).toEqual([MINE_URL]);
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

  it("continues after a removed subject and completes the remaining books", async () => {
    const pages = authenticatedTwoBookScenario();
    pages.set("https://book.douban.com/subject/1036274/", {
      status: 200,
      finalUrl: "https://book.douban.com/subject/1036274/",
      html: "<html><body>呃... 你想访问的条目豆瓣不收录。</body></html>",
      retryAfterMs: null,
    });
    harness = await makeCrawler({ pages });

    await harness.crawler.run();

    expect(await harness.repository.getJob()).toMatchObject({
      state: "completed",
      detailsCompleted: 1,
      detailsUnavailable: 1,
      warningCount: 1,
      failureCount: 0,
    });
    expect(await harness.repository.listRecordsSnapshot()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subjectId: "1036274",
          detailStatus: "unavailable",
        }),
        expect.objectContaining({
          subjectId: "9999999",
          detailStatus: "complete",
        }),
      ]),
    );
  });
});
