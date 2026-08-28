import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { PageStructureError } from "../../src/parsers/errors";
import { parseListPage } from "../../src/parsers/list-page";
import { parseHtml } from "../../src/parsers/text";

describe("parseListPage", () => {
  it("parses the current subject-item list structure used by Douban", async () => {
    const html = await readFile(
      "tests/fixtures/list-current-subject-item.html",
      "utf8",
    );

    const result = parseListPage(
      parseHtml(html),
      "collect",
      "2026-08-28T00:00:00.000Z",
    );

    expect(result.records[0]).toMatchObject({
      subjectId: "10524274",
      status: "collect",
      title: "历史文物趣谈",
      markedAt: "2022-10-24",
      myRating: 4,
      shortReview: "历史掌故类的",
    });
    expect(result.nextUrl).toBe(
      "https://book.douban.com/people/example/collect?start=15&sort=time&rating=all&filter=all&mode=grid",
    );
  });

  it("extracts status, rating, comment and fallback review time", async () => {
    const html = await readFile("tests/fixtures/list-collect.html", "utf8");
    const result = parseListPage(
      parseHtml(html),
      "collect",
      "2026-08-28T00:00:00.000Z",
    );

    expect(result.records[0]).toEqual({
      subjectId: "1036274",
      status: "collect",
      title: "夏洛的网",
      subjectUrl: "https://book.douban.com/subject/1036274/",
      markedAt: "2024-05-06",
      myRating: 5,
      shortReview: "一个蜘蛛和小猪的故事。",
      reviewedAt: "2024-05-06",
      reviewTimeSource: "标记时间回退",
      listSeenAt: "2026-08-28T00:00:00.000Z",
    });
    expect(result.nextUrl).toBe(
      "https://book.douban.com/people/example/collect?start=15",
    );
    expect(result.explicitlyEmpty).toBe(false);
  });

  it("recognizes an explicitly empty list", async () => {
    const html = await readFile("tests/fixtures/list-wish-empty.html", "utf8");
    expect(
      parseListPage(parseHtml(html), "wish", "2026-08-28T00:00:00.000Z"),
    ).toEqual({ records: [], nextUrl: null, explicitlyEmpty: true });
  });

  it("recognizes Douban's current empty interest-list container", async () => {
    const html = await readFile(
      "tests/fixtures/list-current-empty-interest-list.html",
      "utf8",
    );

    expect(
      parseListPage(parseHtml(html), "do", "2026-08-28T00:00:00.000Z"),
    ).toEqual({ records: [], nextUrl: null, explicitlyEmpty: true });
  });

  it("uses an independent review timestamp when the page exposes one", () => {
    const html = `
      <li class="item">
        <h2><a href="/subject/42/">测试书</a></h2>
        <div class="short-note">
          <span class="date">2024-01-01 在读</span>
          <time class="review-time" datetime="2024-01-03T12:30:00+08:00"></time>
          <p class="comment">更新评价</p>
        </div>
      </li>`;

    expect(
      parseListPage(parseHtml(html), "do", "2026-08-28T00:00:00.000Z")
        .records[0],
    ).toMatchObject({
      reviewedAt: "2024-01-03T12:30:00+08:00",
      reviewTimeSource: "独立时间",
    });
  });

  it("fails closed when a non-empty page has no recognizable records", () => {
    const document = parseHtml("<html><body><main>最近阅读记录</main></body></html>");
    expect(() =>
      parseListPage(document, "collect", "2026-08-28T00:00:00.000Z"),
    ).toThrow(PageStructureError);
  });
});
