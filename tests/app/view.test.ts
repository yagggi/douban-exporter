import { describe, expect, it, vi } from "vitest";

import { renderApp } from "../../src/app/view";
import { deriveViewModel } from "../../src/app/model";
import { makeJob } from "../support/factories";

describe("renderApp", () => {
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
  };
}
