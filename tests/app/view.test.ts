import { describe, expect, it, vi } from "vitest";

import { renderApp } from "../../src/app/view";
import { deriveBookBrowser } from "../../src/app/book-browser";
import { deriveViewModel } from "../../src/app/model";
import { makeBookRecord, makeJob } from "../support/factories";

describe("renderApp", () => {
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
  };
}
