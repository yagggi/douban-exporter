import { describe, expect, it } from "vitest";

import { createExportJob } from "../../src/domain/create-job";

describe("createExportJob", () => {
  it("starts at authentication with empty cursors and counters", () => {
    expect(createExportJob("2026-08-28T00:00:00.000Z")).toEqual({
      id: "current",
      state: "checking_auth",
      resumeState: null,
      userId: "",
      userName: "",
      listCursors: { collect: null, wish: null, do: null },
      completedLists: [],
      recordsDiscovered: 0,
      detailsCompleted: 0,
      requestCount: 0,
      retry: null,
      nextAllowedAt: null,
      currentUrl: null,
      pauseReason: null,
      lastError: null,
      startedAt: "2026-08-28T00:00:00.000Z",
      updatedAt: "2026-08-28T00:00:00.000Z",
    });
  });
});

