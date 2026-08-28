import { describe, expect, it, vi } from "vitest";

import { openOrFocusAppTab } from "../../src/background/app-tab";

describe("openOrFocusAppTab", () => {
  it("focuses an existing management page instead of opening a duplicate", async () => {
    const api = {
      runtime: {
        getURL: () => "chrome-extension://test/app.html",
      },
      tabs: {
        query: vi.fn(async () => [
          {
            id: 7,
            windowId: 3,
            url: "chrome-extension://test/app.html",
          },
        ]),
        update: vi.fn(async () => ({})),
        create: vi.fn(async () => ({})),
      },
      windows: {
        update: vi.fn(async () => ({})),
      },
    };

    await openOrFocusAppTab(api);

    expect(api.tabs.update).toHaveBeenCalledWith(7, { active: true });
    expect(api.windows.update).toHaveBeenCalledWith(3, { focused: true });
    expect(api.tabs.create).not.toHaveBeenCalled();
  });
});
