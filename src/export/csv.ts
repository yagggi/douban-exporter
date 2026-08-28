import {
  BOOK_STATUS_LABELS,
  type BookRecord,
} from "../domain/types";

const CSV_HEADERS = [
  "状态",
  "标题",
  "ISBN",
  "页数",
  "作者",
  "出版社",
  "出版时间",
  "简介",
  "标记时间",
  "我的评分",
  "我的短评",
  "评价时间",
  "评价时间来源",
  "豆瓣链接",
] as const;

function neutralizeFormula(value: string): string {
  return /^\s*[=+\-@\t\r]/u.test(value) ? `'${value}` : value;
}

function quoteCell(value: string): string {
  return `"${neutralizeFormula(value).replaceAll('"', '""')}"`;
}

function recordCells(record: BookRecord): string[] {
  return [
    BOOK_STATUS_LABELS[record.status],
    record.title,
    record.isbn,
    record.pages,
    record.authors.join(" / "),
    record.publisher,
    record.publishedAt,
    record.introduction,
    record.markedAt,
    record.myRating === null ? "" : String(record.myRating),
    record.shortReview,
    record.reviewedAt,
    record.reviewTimeSource ?? "",
    record.subjectUrl,
  ];
}

export function serializeBooksToCsv(records: readonly BookRecord[]): string {
  const lines = [
    CSV_HEADERS.map(quoteCell).join(","),
    ...records.map((record) => recordCells(record).map(quoteCell).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}`;
}

