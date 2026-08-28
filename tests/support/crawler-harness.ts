import "fake-indexeddb/auto";

import { Crawler, type CrawlerDependencies } from "../../src/crawler/crawler";
import type { FetchedPage } from "../../src/crawler/fetch-page";
import {
  MINE_URL,
  buildInitialListUrls,
} from "../../src/crawler/routes";
import { ExporterRepository } from "../../src/storage/repository";
import { makeJob } from "./factories";

function page(url: string, html: string, status = 200): FetchedPage {
  return {
    status,
    finalUrl: url,
    html,
    retryAfterMs: null,
  };
}

function listItem(
  subjectId: string,
  title: string,
  statusLabel: string,
  rating: number | null,
  comment: string,
): string {
  const ratingHtml = rating ? `<span class="rating${rating}-t"></span>` : "";
  const commentHtml = comment ? `<p class="comment">${comment}</p>` : "";
  return `
    <li class="item">
      <h2><a href="/subject/${subjectId}/">${title}</a></h2>
      <div class="short-note">
        ${ratingHtml}
        <span class="date">2024-05-06 ${statusLabel}</span>
        ${commentHtml}
      </div>
    </li>`;
}

function detailPage(subjectId: string, title: string, isbn: string): string {
  return `
    <html>
      <head><link rel="canonical" href="https://book.douban.com/subject/${subjectId}/"></head>
      <body>
        <div id="wrapper"><h1><span>${title}</span></h1></div>
        <div id="info">
          <span class="pl">作者:</span> 示例作者<br>
          <span class="pl">出版社:</span> 示例出版社<br>
          <span class="pl">出版年:</span> 2026-8<br>
          <span class="pl">页数:</span> 200<br>
          <span class="pl">ISBN:</span> ${isbn}<br>
        </div>
        <div id="link-report"><div class="intro"><p>${title}简介</p></div></div>
      </body>
    </html>`;
}

export function authenticatedTwoBookScenario(): Map<string, FetchedPage> {
  const listUrls = buildInitialListUrls("example");
  return new Map([
    [
      MINE_URL,
      page(
        "https://www.douban.com/people/example/",
        `<html><head><title>示例用户的读书主页</title></head><body><a href="https://www.douban.com/people/example/">示例用户</a></body></html>`,
      ),
    ],
    [
      listUrls.collect,
      page(
        listUrls.collect,
        `<html><body><ul>${listItem("1036274", "夏洛的网", "读过", 5, "很好")}</ul></body></html>`,
      ),
    ],
    [
      listUrls.wish,
      page(
        listUrls.wish,
        `<html><body><ul>${listItem("9999999", "测试书", "想读", null, "")}</ul></body></html>`,
      ),
    ],
    [
      listUrls.do,
      page(
        listUrls.do,
        "<html><body><div class=\"interest-list-empty\">还没有在读的书</div></body></html>",
      ),
    ],
    [
      "https://book.douban.com/subject/1036274/",
      page(
        "https://book.douban.com/subject/1036274/",
        detailPage("1036274", "夏洛的网", "9787532733415"),
      ),
    ],
    [
      "https://book.douban.com/subject/9999999/",
      page(
        "https://book.douban.com/subject/9999999/",
        detailPage("9999999", "测试书", "9780000000002"),
      ),
    ],
  ]);
}

export interface CrawlerHarnessOptions {
  pages?: Map<string, FetchedPage>;
  onRequest?: (url: string, crawler: Crawler) => void;
  onSleep?: (milliseconds: number, crawler: Crawler) => void;
}

export interface CrawlerHarness {
  crawler: Crawler;
  repository: ExporterRepository;
  requestedUrls: string[];
  observedSleeps: number[];
  cleanup(): Promise<void>;
}

export async function makeCrawler(
  options: CrawlerHarnessOptions = {},
): Promise<CrawlerHarness> {
  const databaseName = `crawler-${crypto.randomUUID()}`;
  const repository = await ExporterRepository.open(databaseName);
  await repository.createJob(
    makeJob({
      state: "checking_auth",
      userId: "",
      userName: "",
      listCursors: { collect: null, wish: null, do: null },
    }),
  );
  const requestedUrls: string[] = [];
  const observedSleeps: number[] = [];
  let currentTime = Date.parse("2026-08-28T00:00:00.000Z");
  const pages = options.pages ?? authenticatedTwoBookScenario();
  let crawler: Crawler;

  const dependencies: CrawlerDependencies = {
    repository,
    fetchPage: async (url) => {
      requestedUrls.push(url);
      options.onRequest?.(url, crawler);
      const response = pages.get(url);
      if (!response) {
        throw new Error(`测试场景缺少 URL: ${url}`);
      }
      return response;
    },
    sleep: async (milliseconds) => {
      observedSleeps.push(milliseconds);
      options.onSleep?.(milliseconds, crawler);
      currentTime += milliseconds;
    },
    random: () => 0,
    now: () => new Date(currentTime),
    publish: async () => {},
  };
  crawler = new Crawler(dependencies);

  return {
    crawler,
    repository,
    requestedUrls,
    observedSleeps,
    async cleanup() {
      repository.close();
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(databaseName);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    },
  };
}
