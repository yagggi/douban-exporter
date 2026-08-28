import { describe, expect, it, vi } from "vitest";

import { fetchPage } from "../../src/crawler/fetch-page";

describe("fetchPage", () => {
  it("uses the current browser credentials and safe cache policy", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init).toMatchObject({
        method: "GET",
        credentials: "include",
        redirect: "follow",
        cache: "no-store",
      });
      return new Response("<html>ok</html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    });

    const result = await fetchPage(
      "https://www.douban.com/mine/",
      fetchImpl,
      30_000,
    );

    expect(result).toMatchObject({
      status: 200,
      finalUrl: "https://www.douban.com/mine/",
      html: "<html>ok</html>",
      retryAfterMs: null,
    });
  });

  it("parses Retry-After seconds for conservative 429 recovery", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("slow down", {
        status: 429,
        headers: { "retry-after": "180" },
      }),
    );

    await expect(
      fetchPage("https://book.douban.com/", fetchImpl, 30_000),
    ).resolves.toMatchObject({ retryAfterMs: 180_000 });
  });

  it("aborts a request that exceeds its timeout", async () => {
    const fetchImpl = vi.fn(
      async (_url: string, init?: RequestInit): Promise<Response> =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );

    await expect(
      fetchPage("https://book.douban.com/", fetchImpl, 1),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
