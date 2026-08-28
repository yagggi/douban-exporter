import { describe, expect, it } from "vitest";

import {
  closeOffscreenDocument,
  ensureOffscreenDocument,
} from "../../src/background/offscreen-manager";
import { makeOffscreenChrome } from "../support/chrome-fakes";

describe("offscreen manager", () => {
  it("coalesces concurrent creation into one DOM parser document", async () => {
    const chromeApi = makeOffscreenChrome({ contexts: [] });

    await Promise.all([
      ensureOffscreenDocument(chromeApi),
      ensureOffscreenDocument(chromeApi),
    ]);

    expect(chromeApi.offscreen.createDocument).toHaveBeenCalledTimes(1);
    expect(chromeApi.offscreen.createDocument).toHaveBeenCalledWith({
      url: "offscreen.html",
      reasons: ["DOM_PARSER"],
      justification: "解析豆瓣页面并运行可恢复的低频导出任务",
    });
  });

  it("does not create or close a document when the desired state already holds", async () => {
    const existing = makeOffscreenChrome({
      contexts: [{ contextType: "OFFSCREEN_DOCUMENT" }],
    });
    await ensureOffscreenDocument(existing);
    expect(existing.offscreen.createDocument).not.toHaveBeenCalled();

    const missing = makeOffscreenChrome({ contexts: [] });
    await closeOffscreenDocument(missing);
    expect(missing.offscreen.closeDocument).not.toHaveBeenCalled();
  });
});

