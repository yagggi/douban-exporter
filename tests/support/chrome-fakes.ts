import { vi } from "vitest";

import type { OffscreenChromeApi } from "../../src/background/offscreen-manager";

export function makeOffscreenChrome(options: { contexts: unknown[] }) {
  return {
    runtime: {
      getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
      getContexts: vi.fn(async () => options.contexts),
    },
    offscreen: {
      createDocument: vi.fn(async () => {}),
      closeDocument: vi.fn(async () => {}),
    },
  } as unknown as OffscreenChromeApi & {
    runtime: {
      getURL: ReturnType<typeof vi.fn>;
      getContexts: ReturnType<typeof vi.fn>;
    };
    offscreen: {
      createDocument: ReturnType<typeof vi.fn>;
      closeDocument: ReturnType<typeof vi.fn>;
    };
  };
}

