import type {
  BookRecord,
  ExportJob,
  ParsedListRecord,
} from "../../src/domain/types";

const FIXED_TIME = "2026-08-28T00:00:00.000Z";

export function makeJob(overrides: Partial<ExportJob> = {}): ExportJob {
  return {
    id: "current",
    state: "idle",
    resumeState: null,
    resumeAfterAuth: null,
    userId: "example",
    userName: "示例用户",
    listCursors: { collect: null, wish: null, do: null },
    completedLists: [],
    recordsDiscovered: 0,
    detailsCompleted: 0,
    warningCount: 0,
    failureCount: 0,
    requestCount: 0,
    retry: null,
    nextAllowedAt: null,
    currentUrl: null,
    pauseReason: null,
    lastError: null,
    startedAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
    ...overrides,
  };
}

export function makeListRecord(
  overrides: Partial<ParsedListRecord> = {},
): ParsedListRecord {
  return {
    subjectId: "1036274",
    status: "collect",
    title: "夏洛的网",
    subjectUrl: "https://book.douban.com/subject/1036274/",
    markedAt: "2024-05-06",
    myRating: 5,
    shortReview: "一个蜘蛛和小猪的故事。",
    reviewedAt: "2024-05-06",
    reviewTimeSource: "标记时间回退",
    listSeenAt: FIXED_TIME,
    ...overrides,
  };
}

export function makeBookRecord(
  overrides: Partial<BookRecord> = {},
): BookRecord {
  const listRecord = makeListRecord(overrides);
  return {
    ...listRecord,
    isbn: "9787532733415",
    pages: "176",
    authors: ["[美] E.B.怀特"],
    publisher: "上海译文出版社",
    publishedAt: "2004-5",
    introduction: "一个蜘蛛和小猪的故事，写给孩子，也写给大人。",
    detailStatus: "complete",
    warnings: [],
    ...overrides,
  };
}
