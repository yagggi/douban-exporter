import { describe, expect, it } from "vitest";

import { notifyRuntimeBestEffort } from "../../src/offscreen/notifier";

describe("notifyRuntimeBestEffort", () => {
  it("does not stop the crawler when no management page receives progress", async () => {
    await expect(
      notifyRuntimeBestEffort(async () => {
        throw new Error("Receiving end does not exist");
      }, { type: "job_changed" }),
    ).resolves.toBeUndefined();
  });
});
