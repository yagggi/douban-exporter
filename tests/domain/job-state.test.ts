import { describe, expect, it } from "vitest";

import {
  blockJob,
  completeJob,
  pauseJob,
  resumeJob,
} from "../../src/domain/job-state";
import { makeJob } from "../support/factories";

describe("job state", () => {
  it("remembers the active state when pausing and resumes it", () => {
    const running = makeJob({ state: "discovering_lists" });
    const paused = pauseJob(running, "user", "2026-08-28T01:00:00.000Z");

    expect(paused).toMatchObject({
      state: "paused",
      resumeState: "discovering_lists",
      pauseReason: "user",
      updatedAt: "2026-08-28T01:00:00.000Z",
    });
    expect(resumeJob(paused, "2026-08-28T02:00:00.000Z")).toMatchObject({
      state: "discovering_lists",
      resumeState: null,
      pauseReason: null,
      updatedAt: "2026-08-28T02:00:00.000Z",
    });
  });

  it("keeps the interrupted phase when a blocking error occurs", () => {
    const running = makeJob({ state: "enriching_details" });
    const blocked = blockJob(
      running,
      "captcha_required",
      { category: "captcha", message: "豆瓣要求安全验证" },
      "2026-08-28T01:00:00.000Z",
    );

    expect(blocked).toMatchObject({
      state: "captcha_required",
      resumeState: "enriching_details",
      lastError: { category: "captcha", message: "豆瓣要求安全验证" },
    });
  });

  it("rejects resuming a completed job", () => {
    const completed = makeJob({ state: "completed", resumeState: null });
    expect(() => resumeJob(completed)).toThrow("任务已完成，不能继续");
  });

  it("clears resumable state when completing", () => {
    const running = makeJob({
      state: "enriching_details",
      resumeState: "discovering_lists",
      currentUrl: "https://book.douban.com/subject/1036274/",
      retry: { url: "https://book.douban.com/subject/1036274/", attempt: 2 },
    });

    expect(completeJob(running, "2026-08-28T03:00:00.000Z")).toMatchObject({
      state: "completed",
      resumeState: null,
      currentUrl: null,
      retry: null,
      nextAllowedAt: null,
    });
  });
});

