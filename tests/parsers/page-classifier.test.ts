import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { classifyPage } from "../../src/parsers/page-classifier";

describe("classifyPage", () => {
  it("stops on a Douban captcha page even when the response is 200", async () => {
    const html = await readFile("tests/fixtures/captcha.html", "utf8");
    expect(
      classifyPage({ status: 200, finalUrl: "https://sec.douban.com/", html }),
    ).toEqual({ kind: "captcha_required", diagnostic: "captcha" });
  });

  it("classifies 403 and 429 as non-retryable states", () => {
    expect(
      classifyPage({
        status: 403,
        finalUrl: "https://book.douban.com/",
        html: "",
      }),
    ).toEqual({ kind: "captcha_required", diagnostic: "forbidden" });
    expect(
      classifyPage({
        status: 429,
        finalUrl: "https://book.douban.com/",
        html: "",
      }),
    ).toEqual({ kind: "rate_limited", diagnostic: "too_many_requests" });
  });

  it("recognizes a redirected login page before parsing content", () => {
    expect(
      classifyPage({
        status: 200,
        finalUrl: "https://accounts.douban.com/passport/login",
        html: '<form action="/passport/login"><input name="password"></form>',
      }),
    ).toEqual({ kind: "auth_required", diagnostic: "login_page" });
  });

  it("leaves a normal book page available for parsing", () => {
    expect(
      classifyPage({
        status: 200,
        finalUrl: "https://book.douban.com/subject/1036274/",
        html: "<html><h1>夏洛的网</h1></html>",
      }),
    ).toEqual({ kind: "ok" });
  });
});

