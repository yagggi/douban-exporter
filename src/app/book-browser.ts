import {
  BOOK_STATUS_LABELS,
  BOOK_STATUS_ORDER,
  type BookRecord,
  type BookStatus,
} from "../domain/types";

export interface BookTabViewModel {
  status: BookStatus;
  label: string;
  count: number;
  selected: boolean;
}

export interface BookItemViewModel {
  subjectId: string;
  statusLabel: string;
  title: string;
  subjectUrl: string;
  markedAt: string;
  ratingText: string;
  detailState: "pending" | "complete";
  detailStateText: "等待详情补全" | "详情已补全";
  authorsText: string;
  publisherText: string;
  publishedAtText: string;
  isbnText: string;
  pagesText: string;
}

export interface BookBrowserViewModel {
  tabs: BookTabViewModel[];
  activeStatus: BookStatus;
  items: BookItemViewModel[];
  page: number;
  totalPages: number;
  canPrevious: boolean;
  canNext: boolean;
  paginationItems: PaginationItem[];
  emptyText: string;
}

export type PaginationItem =
  | { kind: "page"; page: number; selected: boolean }
  | { kind: "ellipsis"; key: string };

function buildPaginationItems(page: number, totalPages: number): PaginationItem[] {
  const visiblePages = new Set<number>([1, totalPages]);
  if (totalPages <= 7) {
    for (let candidate = 1; candidate <= totalPages; candidate += 1) {
      visiblePages.add(candidate);
    }
  } else if (page <= 4) {
    for (let candidate = 1; candidate <= 5; candidate += 1) {
      visiblePages.add(candidate);
    }
  } else if (page >= totalPages - 3) {
    for (let candidate = totalPages - 4; candidate <= totalPages; candidate += 1) {
      visiblePages.add(candidate);
    }
  } else {
    for (let candidate = page - 2; candidate <= page + 2; candidate += 1) {
      visiblePages.add(candidate);
    }
  }

  const pages = [...visiblePages]
    .filter((candidate) => candidate >= 1 && candidate <= totalPages)
    .sort((left, right) => left - right);
  const result: PaginationItem[] = [];
  let previous = 0;
  for (const candidate of pages) {
    if (previous !== 0 && candidate - previous > 1) {
      result.push({ kind: "ellipsis", key: `${previous}-${candidate}` });
    }
    result.push({ kind: "page", page: candidate, selected: candidate === page });
    previous = candidate;
  }
  return result;
}

function itemViewModel(record: BookRecord): BookItemViewModel {
  const completed = record.detailStatus === "complete";
  return {
    subjectId: record.subjectId,
    statusLabel: BOOK_STATUS_LABELS[record.status],
    title: record.title,
    subjectUrl: record.subjectUrl,
    markedAt: record.markedAt || "未知日期",
    ratingText: record.myRating === null ? "未评分" : `${record.myRating} 星`,
    detailState: completed ? "complete" : "pending",
    detailStateText: completed ? "详情已补全" : "等待详情补全",
    authorsText: record.authors.join(" / ") || "—",
    publisherText: record.publisher || "—",
    publishedAtText: record.publishedAt || "—",
    isbnText: record.isbn || "—",
    pagesText: record.pages || "—",
  };
}

export function deriveBookBrowser(
  records: readonly BookRecord[],
  activeStatus: BookStatus,
  requestedPage: number,
  pageSize = 20,
): BookBrowserViewModel {
  const matchingRecords = records.filter(
    (record) => record.status === activeStatus,
  );
  const totalPages = Math.max(1, Math.ceil(matchingRecords.length / pageSize));
  const page = Math.min(totalPages, Math.max(1, requestedPage));
  const offset = (page - 1) * pageSize;

  return {
    tabs: BOOK_STATUS_ORDER.map((status) => ({
      status,
      label: BOOK_STATUS_LABELS[status],
      count: records.filter((record) => record.status === status).length,
      selected: status === activeStatus,
    })),
    activeStatus,
    items: matchingRecords.slice(offset, offset + pageSize).map(itemViewModel),
    page,
    totalPages,
    canPrevious: page > 1,
    canNext: page < totalPages,
    paginationItems: buildPaginationItems(page, totalPages),
    emptyText: `${BOOK_STATUS_LABELS[activeStatus]}列表暂时为空`,
  };
}
