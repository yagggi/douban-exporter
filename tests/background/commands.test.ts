import { describe, expect, it, vi } from "vitest";

import { handleBackgroundCommand } from "../../src/background/commands";

describe("handleBackgroundCommand", () => {
  it("ensures the offscreen document before starting a crawler", async () => {
    const order: string[] = [];
    const dependencies = {
      ensureOffscreen: vi.fn(async () => {
        order.push("ensure");
      }),
      closeOffscreen: vi.fn(async () => {}),
      sendToRuntime: vi.fn(async () => {
        order.push("send");
      }),
      waitForCrawlerIdle: vi.fn(async () => {}),
      resetTaskData: vi.fn(async () => {}),
    };

    await expect(
      handleBackgroundCommand({ type: "start_job" }, dependencies),
    ).resolves.toEqual({ ok: true });
    expect(order).toEqual(["ensure", "send"]);
    expect(dependencies.sendToRuntime).toHaveBeenCalledWith({
      type: "crawler_start",
    });
  });

  it("clears task data only after asking the crawler to pause", async () => {
    const order: string[] = [];
    const dependencies = {
      ensureOffscreen: vi.fn(async () => {}),
      closeOffscreen: vi.fn(async () => {
        order.push("close");
      }),
      sendToRuntime: vi.fn(async () => {
        order.push("pause");
      }),
      waitForCrawlerIdle: vi.fn(async () => {
        order.push("wait");
      }),
      resetTaskData: vi.fn(async () => {
        order.push("reset");
      }),
    };

    await handleBackgroundCommand({ type: "reset_job" }, dependencies);

    expect(order).toEqual(["pause", "wait", "reset", "close"]);
  });
});
