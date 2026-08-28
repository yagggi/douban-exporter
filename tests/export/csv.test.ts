import { describe, expect, it } from "vitest";

import { serializeBooksToCsv } from "../../src/export/csv";
import { makeBookRecord } from "../support/factories";

describe("serializeBooksToCsv", () => {
  it("writes the fixed 14-column header with BOM and CRLF", () => {
    const csv = serializeBooksToCsv([makeBookRecord()]);
    const [header, row] = csv.slice(1).split("\r\n");

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(header).toBe(
      '"状态","标题","ISBN","页数","作者","出版社","出版时间","简介","标记时间","我的评分","我的短评","评价时间","评价时间来源","豆瓣链接"',
    );
    expect(row?.split('","')).toHaveLength(14);
  });

  it("escapes commas, quotes and multiline text without flattening it", () => {
    const csv = serializeBooksToCsv([
      makeBookRecord({
        title: "书名,第二版",
        introduction: '第一行\n第二行有"引号"',
      }),
    ]);

    expect(csv).toContain('"书名,第二版"');
    expect(csv).toContain('"第一行\n第二行有""引号"""');
  });

  it("neutralizes spreadsheet formulas from remote or user-authored text", () => {
    const csv = serializeBooksToCsv([
      makeBookRecord({
        shortReview: '=HYPERLINK("https://bad.example")',
        introduction: "  @SUM(1,1)",
      }),
    ]);

    expect(csv).toContain('"\'=HYPERLINK(""https://bad.example"")"');
    expect(csv).toContain('"\'  @SUM(1,1)"');
  });

  it("exports absent values as empty quoted cells", () => {
    const csv = serializeBooksToCsv([
      makeBookRecord({
        isbn: "",
        myRating: null,
        reviewTimeSource: null,
      }),
    ]);

    expect(csv).toContain('"","176"');
    expect(csv).toContain('"2024-05-06","","一个蜘蛛和小猪的故事。"');
  });
});

