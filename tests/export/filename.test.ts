import { describe, expect, it } from "vitest";

import { buildExportFilename } from "../../src/export/filename";

describe("buildExportFilename", () => {
  it("uses local time, sanitizes path characters and marks partial data", () => {
    expect(
      buildExportFilename({
        userName: "豆/友:01",
        partial: true,
        now: new Date(2026, 7, 28, 9, 7, 6),
      }),
    ).toBe("douban-books-豆_友_01-partial-20260828-090706.csv");
  });

  it("uses a stable fallback when the account has no display name", () => {
    expect(
      buildExportFilename({
        userName: "  ",
        partial: false,
        now: new Date(2026, 7, 28, 9, 7, 6),
      }),
    ).toBe("douban-books-douban-user-20260828-090706.csv");
  });
});
