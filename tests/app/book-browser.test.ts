import { describe, expect, it } from "vitest";

import { deriveBookBrowser } from "../../src/app/book-browser";
import { makeBookRecord } from "../support/factories";

describe("deriveBookBrowser", () => {
  it("filters by status, paginates and exposes per-tab counts", () => {
    const records = [
      ...Array.from({ length: 21 }, (_, index) =>
        makeBookRecord({
          subjectId: `collect-${index}`,
          status: "collect",
          title: `读过 ${index}`,
        }),
      ),
      makeBookRecord({ subjectId: "wish-1", status: "wish", title: "想读 1" }),
      makeBookRecord({ subjectId: "do-1", status: "do", title: "在读 1" }),
    ];

    const model = deriveBookBrowser(records, "collect", 2, 20);

    expect(model.tabs).toEqual([
      { status: "collect", label: "读过", count: 21, selected: true },
      { status: "wish", label: "想读", count: 1, selected: false },
      { status: "do", label: "在读", count: 1, selected: false },
    ]);
    expect(model.page).toBe(2);
    expect(model.totalPages).toBe(2);
    expect(model.items).toHaveLength(1);
    expect(model.canPrevious).toBe(true);
    expect(model.canNext).toBe(false);
  });

  it("distinguishes pending list data from completed detail data", () => {
    const model = deriveBookBrowser(
      [
        makeBookRecord({
          subjectId: "pending",
          detailStatus: "pending",
          authors: [],
          isbn: "",
        }),
        makeBookRecord({
          subjectId: "complete",
          detailStatus: "complete",
          authors: ["示例作者"],
          isbn: "9780000000001",
        }),
      ],
      "collect",
      1,
      20,
    );

    expect(model.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subjectId: "pending",
          detailState: "pending",
          detailStateText: "等待详情补全",
        }),
        expect.objectContaining({
          subjectId: "complete",
          detailState: "complete",
          detailStateText: "详情已补全",
          authorsText: "示例作者",
          isbnText: "9780000000001",
        }),
      ]),
    );
  });

  it("builds clickable page numbers with ellipses and the last page", () => {
    const records = Array.from({ length: 201 }, (_, index) =>
      makeBookRecord({ subjectId: `book-${index}`, status: "collect" }),
    );

    const model = deriveBookBrowser(records, "collect", 6, 20);

    expect(
      model.paginationItems.map((item) =>
        item.kind === "page" ? item.page : "…",
      ),
    ).toEqual([1, "…", 4, 5, 6, 7, 8, "…", 11]);
    expect(
      model.paginationItems.find(
        (item) => item.kind === "page" && item.page === 6,
      ),
    ).toMatchObject({ selected: true });
  });
});
