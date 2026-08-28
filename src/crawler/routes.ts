import type { BookStatus } from "../domain/types";
import { PageStructureError } from "../parsers/errors";
import { normalizeInlineText, parseHtml } from "../parsers/text";
import type { FetchedPage } from "./fetch-page";

export const MINE_URL = "https://www.douban.com/mine/";

export interface DoubanIdentity {
  userId: string;
  userName: string;
}

export function buildInitialListUrls(
  userId: string,
): Record<BookStatus, string> {
  const encodedUserId = encodeURIComponent(userId);
  const build = (status: BookStatus): string => {
    const url = new URL(
      `https://book.douban.com/people/${encodedUserId}/${status}`,
    );
    url.searchParams.set("start", "0");
    url.searchParams.set("sort", "time");
    url.searchParams.set("rating", "all");
    url.searchParams.set("filter", "all");
    url.searchParams.set("mode", "grid");
    return url.toString();
  };
  return { collect: build("collect"), wish: build("wish"), do: build("do") };
}

function userIdFromUrl(value: string): string | null {
  const match = /\/people\/([^/?#]+)\/?/u.exec(value);
  if (!match?.[1]) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function cleanUserName(value: string): string {
  return normalizeInlineText(value).replace(
    /\s*[（(]\s*编辑\s*[)）]\s*$/u,
    "",
  );
}

export function parseIdentity(page: FetchedPage): DoubanIdentity {
  const document = parseHtml(page.html);
  const profileLinks = [
    ...document.querySelectorAll<HTMLAnchorElement>("a[href*='/people/']"),
  ];
  const userId =
    userIdFromUrl(page.finalUrl) ??
    profileLinks
      .map((link) => userIdFromUrl(link.href))
      .find((value): value is string => value !== null);
  if (!userId) {
    throw new PageStructureError("无法从豆瓣个人入口识别当前用户");
  }

  const matchingLink = profileLinks.find(
    (link) => userIdFromUrl(link.href) === userId,
  );
  const heading = normalizeInlineText(
    document.querySelector("#db-usr-profile h1, h1")?.textContent ?? "",
  ).replace(/的(?:读书)?主页$/u, "");
  const title = normalizeInlineText(document.title).replace(
    /的(?:读书)?主页(?:\s*\(豆瓣\))?$/u,
    "",
  );
  const userName = cleanUserName(
    normalizeInlineText(matchingLink?.textContent ?? "") ||
      heading ||
      title ||
      userId,
  );
  return { userId, userName };
}
