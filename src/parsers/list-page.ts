import type {
  BookStatus,
  ParsedListRecord,
  ReviewTimeSource,
} from "../domain/types";
import { PageStructureError } from "./errors";
import {
  elementMultilineText,
  normalizeInlineText,
} from "./text";

export interface ParsedListPage {
  records: ParsedListRecord[];
  nextUrl: string | null;
  explicitlyEmpty: boolean;
}

const SUBJECT_PATTERN = /\/subject\/(\d+)\/?/u;
const EMPTY_LIST_PATTERN = /(?:还没有|暂无)[^。\n]{0,20}(?:读过|想读|在读)(?:的书|图书|记录)?/u;

function canonicalSubjectUrl(subjectId: string): string {
  return `https://book.douban.com/subject/${subjectId}/`;
}

function extractRating(item: Element): number | null {
  for (const element of item.querySelectorAll<HTMLElement>("[class*='rating']")) {
    const match = [...element.classList]
      .map((className) => /^rating([1-5])-t$/u.exec(className))
      .find((candidate) => candidate !== null);
    if (match?.[1]) {
      return Number(match[1]);
    }
  }
  return null;
}

function extractMarkedAt(item: Element): string {
  const value = normalizeInlineText(
    item.querySelector(".short-note .date, .date")?.textContent ?? "",
  );
  return value.replace(/\s*(?:读过|想读|在读)\s*$/u, "");
}

function extractIndependentReviewTime(item: Element): string {
  const element = item.querySelector<HTMLElement>(
    "time.review-time, [data-review-time], .review-date",
  );
  if (!element) {
    return "";
  }
  return normalizeInlineText(
    element.getAttribute("datetime") ??
      element.dataset.reviewTime ??
      element.textContent ??
      "",
  );
}

function resolveReviewTime(
  hasReview: boolean,
  markedAt: string,
  independentTime: string,
): { reviewedAt: string; reviewTimeSource: ReviewTimeSource } {
  if (!hasReview) {
    return { reviewedAt: "", reviewTimeSource: null };
  }
  if (independentTime !== "") {
    return { reviewedAt: independentTime, reviewTimeSource: "独立时间" };
  }
  return { reviewedAt: markedAt, reviewTimeSource: "标记时间回退" };
}

function parseListItem(
  item: Element,
  status: BookStatus,
  fetchedAt: string,
): ParsedListRecord {
  const link = item.querySelector<HTMLAnchorElement>(
    "h2 a[href*='/subject/'], a[href*='/subject/']",
  );
  const subjectMatch = link?.getAttribute("href")?.match(SUBJECT_PATTERN);
  const subjectId = subjectMatch?.[1];
  const title = normalizeInlineText(link?.textContent ?? "");
  if (!subjectId || title === "") {
    throw new PageStructureError("列表项缺少可识别的图书链接或标题");
  }

  const markedAt = extractMarkedAt(item);
  const myRating = extractRating(item);
  const comment = item.querySelector(
    ".short-note .comment, .short-note p.comment, p.comment",
  );
  const shortReview = comment ? elementMultilineText(comment) : "";
  const reviewTime = resolveReviewTime(
    myRating !== null || shortReview !== "",
    markedAt,
    extractIndependentReviewTime(item),
  );

  return {
    subjectId,
    status,
    title,
    subjectUrl: canonicalSubjectUrl(subjectId),
    markedAt,
    myRating,
    shortReview,
    ...reviewTime,
    listSeenAt: fetchedAt,
  };
}

function extractNextUrl(document: Document): string | null {
  const href = document
    .querySelector<HTMLAnchorElement>(".paginator .next a, a[rel='next']")
    ?.getAttribute("href");
  if (!href) {
    return null;
  }
  const url = new URL(href, "https://book.douban.com/");
  if (url.protocol !== "https:" || url.hostname !== "book.douban.com") {
    throw new PageStructureError("下一页链接不属于豆瓣图书域名");
  }
  return url.toString();
}

export function parseListPage(
  document: Document,
  status: BookStatus,
  fetchedAt: string,
): ParsedListPage {
  const items = [
    ...document.querySelectorAll("li.item, [data-subject-id]"),
  ];
  if (items.length === 0) {
    const explicitlyEmpty = EMPTY_LIST_PATTERN.test(document.body.textContent ?? "");
    if (!explicitlyEmpty) {
      throw new PageStructureError("页面没有可识别的图书列表结构");
    }
    return { records: [], nextUrl: null, explicitlyEmpty: true };
  }

  return {
    records: items.map((item) => parseListItem(item, status, fetchedAt)),
    nextUrl: extractNextUrl(document),
    explicitlyEmpty: false,
  };
}

