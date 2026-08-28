import { describe, expect, it } from "vitest";

import { parseIdentity } from "../../src/crawler/routes";

describe("parseIdentity", () => {
  it("removes Douban's edit action from the current user name", () => {
    expect(
      parseIdentity({
        status: 200,
        finalUrl: "https://www.douban.com/people/54320814/",
        retryAfterMs: null,
        html: `
          <html>
            <head><title>山羊 笨拙与真诚的主页</title></head>
            <body>
              <a href="https://www.douban.com/people/54320814/">
                山羊 笨拙与真诚 (编辑)
              </a>
            </body>
          </html>`,
      }),
    ).toEqual({
      userId: "54320814",
      userName: "山羊 笨拙与真诚",
    });
  });
});
