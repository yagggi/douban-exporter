import { describe, expect, it } from "vitest";

import { deriveViewModel } from "../../src/app/model";
import { makeJob } from "../support/factories";

describe("deriveViewModel", () => {
  it("makes active list discovery explicit and uses indeterminate progress", () => {
    const model = deriveViewModel(
      makeJob({
        state: "discovering_lists",
        recordsDiscovered: 225,
        detailsCompleted: 0,
      }),
      225,
      null,
    );

    expect(model).toMatchObject({
      runStateText: "运行中",
      statusText: "运行中 · 正在读取读过、想读和在读列表",
      progressMode: "indeterminate",
      progressCaption: "列表扫描进行中，已发现 225 本",
      progressText: "0 / 225",
    });
  });

  it("switches to determinate progress while enriching details", () => {
    const model = deriveViewModel(
      makeJob({
        state: "enriching_details",
        recordsDiscovered: 225,
        detailsCompleted: 45,
      }),
      225,
      null,
    );

    expect(model).toMatchObject({
      runStateText: "运行中",
      progressMode: "determinate",
      progressCaption: "正在补充图书详情：45 / 225",
      progressPercent: 20,
    });
  });

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
