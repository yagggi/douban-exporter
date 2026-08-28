import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { parseDetailPage } from "../../src/parsers/detail-page";
import { PageStructureError } from "../../src/parsers/errors";
import { parseHtml } from "../../src/parsers/text";

describe("parseDetailPage", () => {
  it("extracts publication fields and the longest introduction", async () => {
    const html = await readFile("tests/fixtures/detail-complete.html", "utf8");
    expect(parseDetailPage(parseHtml(html), "1036274")).toEqual({
      title: "夏洛的网",
      isbn: "9787532733415",
      pages: "176",
      authors: ["[美] E.B.怀特", "[美国] 埃尔温·布鲁克斯·怀特"],
      publisher: "上海译文出版社",
      publishedAt: "2004-5",
      introduction:
        "一个蜘蛛和小猪的故事，写给孩子，也写给大人。\n\n第二段简介。",
    });
  });

  it("allows individual publication fields to be absent", async () => {
    const html = await readFile(
      "tests/fixtures/detail-missing-fields.html",
      "utf8",
    );
    expect(parseDetailPage(parseHtml(html), "9999999")).toEqual({
      title: "没有出版信息的书",
      isbn: "",
      pages: "",
      authors: ["无名氏"],
      publisher: "",
      publishedAt: "",
      introduction: "",
    });
  });

  it("rejects a detail page for a different subject", async () => {
    const html = await readFile("tests/fixtures/detail-complete.html", "utf8");
    expect(() => parseDetailPage(parseHtml(html), "9999999")).toThrow(
      PageStructureError,
    );
  });

  it("classifies a removed Douban subject as unavailable", async () => {
    const html = await readFile("tests/fixtures/detail-unavailable.html", "utf8");
    try {
      parseDetailPage(parseHtml(html), "2076886");
      throw new Error("预期解析器拒绝已删除条目");
    } catch (error) {
      expect(error).toMatchObject({
        name: "SubjectUnavailableError",
        message: "豆瓣条目已删除或不再收录",
      });
    }
  });
});
