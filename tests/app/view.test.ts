import { describe, expect, it, vi } from "vitest";

import { renderApp } from "../../src/app/view";
import { deriveBookBrowser } from "../../src/app/book-browser";
import { deriveViewModel } from "../../src/app/model";
import { makeBookRecord, makeJob } from "../support/factories";

describe("renderApp", () => {
  it("orders controls before the fetched-books section", () => {
    const root = document.createElement("div");
    const model = {
      ...deriveViewModel(makeJob({ state: "paused" }), 1, null),
      bookBrowser: deriveBookBrowser([makeBookRecord()], "collect", 1),
    };

    renderApp(root, model, emptyHandlers());

    expect(
      [...root.querySelectorAll("section h2")].map(
        (heading) => heading.textContent,
      ),
    ).toEqual(["任务状态", "保存位置", "操作", "已获取的书籍"]);
  });

  it("renders list discovery as visibly running indeterminate work", () => {
    const root = document.createElement("div");
    const model = deriveViewModel(
      makeJob({ state: "discovering_lists", recordsDiscovered: 225 }),
      225,
      null,
    );

    renderApp(root, model, emptyHandlers());

    const progress = root.querySelector("progress");
    expect(progress?.hasAttribute("value")).toBe(false);
    expect(root.textContent).toContain("运行状态运行中");
    expect(root.textContent).toContain("列表扫描进行中，已发现 225 本");
  });

  it("renders untrusted account text without interpreting HTML", () => {
    const root = document.createElement("div");
    const model = deriveViewModel(
      makeJob({
        state: "paused",
        resumeState: "discovering_lists",
        userName: '<img src=x onerror="alert(1)">',
      }),
      2,
      null,
    );

    renderApp(root, model, emptyHandlers());

    expect(root.querySelector("img")).toBeNull();
    expect(root.textContent).toContain('<img src=x onerror="alert(1)">');
  });

  it("connects the enabled continue action to its handler", () => {
    const root = document.createElement("div");
    const resume = vi.fn(async () => {});
    const handlers = { ...emptyHandlers(), resume };
    const model = deriveViewModel(
      makeJob({ state: "paused", resumeState: "discovering_lists" }),
      1,
      null,
    );
    renderApp(root, model, handlers);

    root
      .querySelector<HTMLButtonElement>('[data-action="resume"]')
      ?.click();

    expect(resume).toHaveBeenCalledTimes(1);
  });

  it("renders status tabs and detail completion badges", () => {
    const root = document.createElement("div");
    const selectBookStatus = vi.fn();
    const handlers = { ...emptyHandlers(), selectBookStatus };
    const model = {
      ...deriveViewModel(makeJob({ state: "paused" }), 2, null),
      bookBrowser: deriveBookBrowser(
        [
          makeBookRecord({ subjectId: "pending", detailStatus: "pending" }),
          makeBookRecord({ subjectId: "complete", detailStatus: "complete" }),
        ],
        "collect",
        1,
      ),
    };

    renderApp(root, model, handlers);

    expect(root.textContent).toContain("等待详情补全");
    expect(root.textContent).toContain("详情已补全");
    root.querySelector<HTMLButtonElement>('[data-status="wish"]')?.click();
    expect(selectBookStatus).toHaveBeenCalledWith("wish");
  });

  it("renders the saved short review on its book card", () => {
    const root = document.createElement("div");
    const record = makeBookRecord({
      title: "奇迹集",
      shortReview: "短暂而洋洋自得。 （南阳）",
    });
    const model = {
      ...deriveViewModel(makeJob({ state: "paused" }), 1, null),
      bookBrowser: deriveBookBrowser([record], "collect", 1),
    };

    renderApp(root, model, emptyHandlers());

    expect(root.textContent).toContain("我的短评");
    expect(root.textContent).toContain("短暂而洋洋自得。 （南阳）");
  });

  it("renders an unavailable badge for a removed Douban subject", () => {
    const root = document.createElement("div");
    const record = makeBookRecord({
      subjectId: "2076886",
      title: "已删除的书",
      detailStatus: "unavailable",
    });
    renderApp(
      root,
      {
        ...deriveViewModel(makeJob({ state: "paused" }), 1, null),
        bookBrowser: deriveBookBrowser([record], "collect", 1),
      },
      emptyHandlers(),
    );

    expect(root.textContent).toContain("详情不可用");
    expect(root.textContent).toContain("豆瓣条目已删除或不再收录");
  });

  it("renders clickable page numbers including the last page", () => {
    const root = document.createElement("div");
    const goToBookPage = vi.fn();
    const handlers = { ...emptyHandlers(), goToBookPage };
    const records = Array.from({ length: 201 }, (_, index) =>
      makeBookRecord({ subjectId: `book-${index}`, status: "collect" }),
    );
    const model = {
      ...deriveViewModel(makeJob({ state: "paused" }), records.length, null),
      bookBrowser: deriveBookBrowser(records, "collect", 6),
    };

    renderApp(root, model, handlers);

    expect(root.querySelector('[data-page="11"]')).not.toBeNull();
    expect(root.textContent).toContain("…");
    root.querySelector<HTMLButtonElement>('[data-page="11"]')?.click();
    expect(goToBookPage).toHaveBeenCalledWith(11);
  });

  it("keeps action button nodes stable across model updates", () => {
    const root = document.createElement("div");
    const handlers = emptyHandlers();
    renderApp(
      root,
      deriveViewModel(
        makeJob({ state: "paused", resumeState: "discovering_lists" }),
        1,
        null,
      ),
      handlers,
    );
    const resetButton = root.querySelector('[data-action="reset"]');
    expect(resetButton).not.toBeNull();

    renderApp(
      root,
      deriveViewModel(makeJob({ state: "completed" }), 1, null),
      handlers,
    );

    expect(root.querySelector('[data-action="reset"]')).toBe(resetButton);
  });

  it("reorders two keyed book cards without recreating either node", () => {
    const root = document.createElement("div");
    const handlers = emptyHandlers();
    const first = makeBookRecord({ subjectId: "first", title: "第一本" });
    const second = makeBookRecord({ subjectId: "second", title: "第二本" });
    const base = deriveViewModel(makeJob({ state: "paused" }), 2, null);
    renderApp(
      root,
      { ...base, bookBrowser: deriveBookBrowser([first, second], "collect", 1) },
      handlers,
    );
    const firstNode = root.querySelector('[data-subject-id="first"]');
    const secondNode = root.querySelector('[data-subject-id="second"]');
    expect(firstNode).not.toBeNull();
    expect(secondNode).not.toBeNull();

    renderApp(
      root,
      { ...base, bookBrowser: deriveBookBrowser([second, first], "collect", 1) },
      handlers,
    );

    expect([...root.querySelectorAll(".book-item")]).toEqual([
      secondNode,
      firstNode,
    ]);
  });

  it("keeps tab and persistent page-number nodes stable", () => {
    const root = document.createElement("div");
    const handlers = emptyHandlers();
    const records = Array.from({ length: 201 }, (_, index) =>
      makeBookRecord({ subjectId: `book-${index}` }),
    );
    const base = deriveViewModel(makeJob({ state: "paused" }), records.length, null);
    renderApp(
      root,
      { ...base, bookBrowser: deriveBookBrowser(records, "collect", 6) },
      handlers,
    );
    const collectTab = root.querySelector('[data-status="collect"]');
    const lastPage = root.querySelector('[data-page="11"]');
    expect(collectTab).not.toBeNull();
    expect(lastPage).not.toBeNull();

    renderApp(
      root,
      { ...base, bookBrowser: deriveBookBrowser(records, "collect", 7) },
      handlers,
    );

    expect(root.querySelector('[data-status="collect"]')).toBe(collectTab);
    expect(root.querySelector('[data-page="11"]')).toBe(lastPage);
  });

  it("uses only the latest handlers without duplicate button listeners", () => {
    const root = document.createElement("div");
    const firstReset = vi.fn(async () => {});
    const secondReset = vi.fn(async () => {});
    const model = deriveViewModel(makeJob({ state: "paused" }), 1, null);
    renderApp(root, model, { ...emptyHandlers(), reset: firstReset });
    renderApp(root, model, { ...emptyHandlers(), reset: secondReset });

    root.querySelector<HTMLButtonElement>('[data-action="reset"]')?.click();

    expect(firstReset).not.toHaveBeenCalled();
    expect(secondReset).toHaveBeenCalledTimes(1);
  });

  it("releases off-page book card nodes instead of caching every visited page", () => {
    const root = document.createElement("div");
    const handlers = emptyHandlers();
    const records = Array.from({ length: 21 }, (_, index) =>
      makeBookRecord({ subjectId: `book-${index}` }),
    );
    const base = deriveViewModel(makeJob({ state: "paused" }), records.length, null);
    renderApp(
      root,
      { ...base, bookBrowser: deriveBookBrowser(records, "collect", 1) },
      handlers,
    );
    const original = root.querySelector('[data-subject-id="book-0"]');
    expect(original).not.toBeNull();

    renderApp(
      root,
      { ...base, bookBrowser: deriveBookBrowser(records, "collect", 2) },
      handlers,
    );
    renderApp(
      root,
      { ...base, bookBrowser: deriveBookBrowser(records, "collect", 1) },
      handlers,
    );

    expect(root.querySelector('[data-subject-id="book-0"]')).not.toBe(original);
  });

  it("updates a keyed book card without replacing its node", () => {
    const root = document.createElement("div");
    const handlers = emptyHandlers();
    const pending = makeBookRecord({
      subjectId: "same-book",
      title: "奇迹集",
      detailStatus: "pending",
    });
    renderApp(
      root,
      {
        ...deriveViewModel(makeJob({ state: "enriching_details" }), 1, null),
        bookBrowser: deriveBookBrowser([pending], "collect", 1),
      },
      handlers,
    );
    const originalCard = root.querySelector(".book-item");

    renderApp(
      root,
      {
        ...deriveViewModel(makeJob({ state: "paused" }), 1, null),
        bookBrowser: deriveBookBrowser(
          [
            makeBookRecord({
              ...pending,
              subjectId: "same-book",
              title: "奇迹集",
              detailStatus: "complete",
              isbn: "9787218076690",
            }),
          ],
          "collect",
          1,
        ),
      },
      handlers,
    );

    expect(root.querySelector(".book-item")).toBe(originalCard);
    expect(originalCard?.textContent).toContain("详情已补全");
  });

  it("preserves the selected book text node when unrelated fields update", () => {
    const root = document.createElement("div");
    const handlers = emptyHandlers();
    const record = makeBookRecord({ title: "奇迹集" });
    const firstModel = {
      ...deriveViewModel(makeJob({ state: "enriching_details" }), 1, null),
      bookBrowser: deriveBookBrowser([record], "collect", 1),
    };
    renderApp(root, firstModel, handlers);
    const title = root.querySelector(".book-title");
    const textNode = title?.firstChild;
    const selection = window.getSelection();
    if (!(textNode instanceof Text) || !selection) {
      throw new Error("测试环境无法建立标题选区");
    }
    const range = document.createRange();
    range.selectNodeContents(textNode);
    selection.removeAllRanges();
    selection.addRange(range);

    renderApp(
      root,
      {
        ...deriveViewModel(
          makeJob({ state: "enriching_details", requestCount: 9 }),
          1,
          null,
        ),
        bookBrowser: deriveBookBrowser([record], "collect", 1),
      },
      handlers,
    );

    expect(root.querySelector(".book-title")?.firstChild).toBe(textNode);
    selection.removeAllRanges();
  });
});

function emptyHandlers() {
  return {
    start: async () => {},
    pause: async () => {},
    resume: async () => {},
    exportCsv: async () => {},
    chooseDirectory: async () => {},
    useDefaultDirectory: async () => {},
    reset: async () => {},
    selectBookStatus: () => {},
    previousBookPage: () => {},
    nextBookPage: () => {},
    goToBookPage: () => {},
  };
}
