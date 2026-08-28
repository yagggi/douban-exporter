import { describe, expect, it } from "vitest";

import { sleep } from "../../src/crawler/sleep";

describe("sleep", () => {
  it("rejects promptly when the caller aborts a cooldown", async () => {
    const controller = new AbortController();
    const waiting = sleep(60_000, controller.signal);

    controller.abort();

    await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
  });
});
