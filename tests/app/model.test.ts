import { describe, expect, it } from "vitest";

import { deriveViewModel } from "../../src/app/model";
import { makeJob } from "../support/factories";

describe("deriveViewModel", () => {
  it("offers an actionable captcha state without enabling a second start", () => {
    const model = deriveViewModel(
      makeJob({
        state: "captcha_required",
        resumeState: "enriching_details",
        detailsCompleted: 12,
        recordsDiscovered: 20,
        warningCount: 2,
        failureCount: 1,
      }),
      20,
      null,
    );

    expect(model.statusText).toContain("验证码");
    expect(model.canResume).toBe(true);
    expect(model.canStart).toBe(false);
    expect(model.canExport).toBe(true);
    expect(model.exportWillBePartial).toBe(true);
    expect(model.progressPercent).toBe(60);
    expect(model.warningCount).toBe(2);
    expect(model.failureCount).toBe(1);
  });

  it("shows the idle start action before a task exists", () => {
    const model = deriveViewModel(undefined, 0, "Books");
    expect(model).toMatchObject({
      statusText: "尚未开始",
      canStart: true,
      canPause: false,
      canResume: false,
      canExport: false,
      directoryText: "Books",
    });
  });
});
