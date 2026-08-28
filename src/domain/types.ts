export const BOOK_STATUS_ORDER = ["collect", "wish", "do"] as const;

export type BookStatus = (typeof BOOK_STATUS_ORDER)[number];

export const BOOK_STATUS_LABELS: Record<BookStatus, string> = {
  collect: "读过",
  wish: "想读",
  do: "在读",
};

export type ActiveJobState =
  | "checking_auth"
  | "discovering_lists"
  | "enriching_details";

export type BlockedJobState =
  | "auth_required"
  | "captcha_required"
  | "rate_limited"
  | "parse_error"
  | "failed";

export type JobState =
  | "idle"
  | ActiveJobState
  | "paused"
  | BlockedJobState
  | "completed";

export type ReviewTimeSource = "独立时间" | "标记时间回退" | null;

export type DetailStatus = "pending" | "complete" | "unavailable";

export interface ParsedListRecord {
  subjectId: string;
  status: BookStatus;
  title: string;
  subjectUrl: string;
  markedAt: string;
  myRating: number | null;
  shortReview: string;
  reviewedAt: string;
  reviewTimeSource: ReviewTimeSource;
  listSeenAt: string;
  authors: string[];
  publisher: string;
  publishedAt: string;
}

export interface ParsedBookDetails {
  title: string;
  isbn: string;
  pages: string;
  authors: string[];
  publisher: string;
  publishedAt: string;
  introduction: string;
}

export interface BookRecord extends ParsedListRecord, ParsedBookDetails {
  detailStatus: DetailStatus;
  warnings: string[];
}

export interface JobError {
  category: string;
  message: string;
  url?: string;
}

export interface RetryState {
  url: string;
  attempt: number;
}

export interface ExportJob {
  id: "current";
  state: JobState;
  resumeState: ActiveJobState | null;
  resumeAfterAuth: ActiveJobState | null;
  userId: string;
  userName: string;
  listCursors: Record<BookStatus, string | null>;
  completedLists: BookStatus[];
  recordsDiscovered: number;
  detailsCompleted: number;
  detailsUnavailable: number;
  warningCount: number;
  failureCount: number;
  requestCount: number;
  retry: RetryState | null;
  nextAllowedAt: string | null;
  currentUrl: string | null;
  pauseReason: string | null;
  lastError: JobError | null;
  startedAt: string;
  updatedAt: string;
}
