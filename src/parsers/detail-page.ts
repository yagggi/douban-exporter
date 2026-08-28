import type { ParsedBookDetails } from "../domain/types";
import { PageStructureError } from "./errors";
import {
  breakSeparatedLines,
  elementMultilineText,
  normalizeInlineText,
} from "./text";

const SUBJECT_PATTERN = /\/subject\/(\d+)\/?/u;

function collectSubjectIds(document: Document): Set<string> {
  const values = [
    document.querySelector<HTMLLinkElement>("link[rel='canonical']")?.href,
    document
      .querySelector<HTMLMetaElement>("meta[property='og:url']")
      ?.getAttribute("content"),
    document.querySelector<HTMLElement>("[data-subject-id]")?.dataset.subjectId,
  ];
  const ids = new Set<string>();
  for (const value of values) {
    const subjectId = value?.match(SUBJECT_PATTERN)?.[1] ?? value?.match(/^\d+$/u)?.[0];
    if (subjectId) {
      ids.add(subjectId);
    }
  }
  return ids;
}

function parseInfo(document: Document): Map<string, string> {
  const info = document.querySelector("#info");
  if (!info) {
    throw new PageStructureError("详情页缺少出版信息区域");
  }

  const result = new Map<string, string>();
  for (const line of breakSeparatedLines(info)) {
    const match = /^([^:：]+)[:：]\s*(.*)$/u.exec(line);
    if (match?.[1]) {
      result.set(normalizeInlineText(match[1]), normalizeInlineText(match[2] ?? ""));
    }
  }
  return result;
}

function longestIntroduction(document: Document): string {
  return [...document.querySelectorAll("#link-report .intro, .related_info .intro")]
    .map(elementMultilineText)
    .sort((left, right) => right.length - left.length)[0] ?? "";
}

export function parseDetailPage(
  document: Document,
  expectedSubjectId: string,
): ParsedBookDetails {
  if (!collectSubjectIds(document).has(expectedSubjectId)) {
    throw new PageStructureError("详情页 subject ID 与请求目标不一致");
  }

  const title = normalizeInlineText(
    document.querySelector("#wrapper h1 span, h1 span")?.textContent ??
      document
        .querySelector<HTMLMetaElement>("meta[property='og:title']")
        ?.getAttribute("content") ??
      "",
  );
  if (title === "") {
    throw new PageStructureError("详情页缺少图书标题");
  }

  const info = parseInfo(document);
  const authors = (info.get("作者") ?? "")
    .split(/\s*\/\s*/u)
    .map(normalizeInlineText)
    .filter((author) => author !== "");

  return {
    title,
    isbn: info.get("ISBN") ?? "",
    pages: info.get("页数") ?? "",
    authors,
    publisher: info.get("出版社") ?? "",
    publishedAt: info.get("出版年") ?? "",
    introduction: longestIntroduction(document),
  };
}
