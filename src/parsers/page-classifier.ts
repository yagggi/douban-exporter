export interface PageInput {
  status: number;
  finalUrl: string;
  html: string;
}

export type PageClassification =
  | { kind: "ok" }
  | { kind: "auth_required"; diagnostic: "login_page" }
  | {
      kind: "captcha_required";
      diagnostic: "captcha" | "forbidden";
    }
  | { kind: "rate_limited"; diagnostic: "too_many_requests" }
  | { kind: "server_error"; diagnostic: `http_${number}` }
  | { kind: "http_error"; diagnostic: `http_${number}` };

const LOGIN_URL_PATTERN = /accounts\.douban\.com\/(?:passport\/)?login/iu;
const LOGIN_FORM_PATTERN = /<form[^>]+(?:passport\/login|accounts\.douban\.com)[\s\S]*?<input[^>]+(?:password|name=["']?password)/iu;
const CAPTCHA_TEXT_PATTERN = /(?:请输入验证码|检测到有异常请求|豆瓣安全验证|访问异常)/u;

export function classifyPage(input: PageInput): PageClassification {
  if (input.status === 429) {
    return { kind: "rate_limited", diagnostic: "too_many_requests" };
  }
  if (input.status === 403) {
    return { kind: "captcha_required", diagnostic: "forbidden" };
  }
  if (
    LOGIN_URL_PATTERN.test(input.finalUrl) ||
    LOGIN_FORM_PATTERN.test(input.html)
  ) {
    return { kind: "auth_required", diagnostic: "login_page" };
  }
  if (
    input.finalUrl.includes("sec.douban.com") ||
    CAPTCHA_TEXT_PATTERN.test(input.html)
  ) {
    return { kind: "captcha_required", diagnostic: "captcha" };
  }
  if (input.status >= 500) {
    return {
      kind: "server_error",
      diagnostic: `http_${input.status}`,
    };
  }
  if (input.status >= 400) {
    return {
      kind: "http_error",
      diagnostic: `http_${input.status}`,
    };
  }
  return { kind: "ok" };
}

