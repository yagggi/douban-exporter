import {
  blockJob,
  completeJob,
  isActiveJobState,
  pauseJob,
} from "../domain/job-state";
import { normalDelayMs, retryDelayMs } from "../domain/rate-policy";
import {
  BOOK_STATUS_ORDER,
  type BlockedJobState,
  type ExportJob,
  type JobError,
} from "../domain/types";
import { parseDetailPage } from "../parsers/detail-page";
import { PageStructureError } from "../parsers/errors";
import { parseListPage } from "../parsers/list-page";
import { classifyPage } from "../parsers/page-classifier";
import { parseHtml } from "../parsers/text";
import type { ExporterRepository } from "../storage/repository";
import type { FetchedPage } from "./fetch-page";
import {
  MINE_URL,
  buildInitialListUrls,
  parseIdentity,
} from "./routes";

export interface CrawlerDependencies {
  repository: ExporterRepository;
  fetchPage: (url: string) => Promise<FetchedPage>;
  sleep: (milliseconds: number) => Promise<void>;
  random: () => number;
  now: () => Date;
  publish: (job: ExportJob) => Promise<void>;
}

const DEFAULT_RATE_LIMIT_PAUSE_MS = 10 * 60_000;
const MAX_RETRIES = 3;

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "未知错误";
}

export class Crawler {
  private pauseRequested = false;
  private running = false;

  constructor(private readonly dependencies: CrawlerDependencies) {}

  requestPause(): void {
    this.pauseRequested = true;
  }

  async run(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      while (true) {
        const job = await this.dependencies.repository.getJob();
        if (!job || !isActiveJobState(job.state)) {
          return;
        }
        if (this.pauseRequested) {
          await this.saveAndPublish(
            pauseJob(job, "user", this.nowIso()),
          );
          return;
        }

        if (job.state === "checking_auth") {
          await this.processIdentity();
        } else if (job.state === "discovering_lists") {
          await this.processNextListPage(job);
        } else {
          await this.processNextDetail(job);
        }
      }
    } finally {
      this.running = false;
      this.pauseRequested = false;
    }
  }

  private nowIso(): string {
    return this.dependencies.now().toISOString();
  }

  private async saveAndPublish(job: ExportJob): Promise<void> {
    await this.dependencies.repository.saveJob(job);
    await this.dependencies.publish(job);
  }

  private async waitUntilAllowed(job: ExportJob): Promise<void> {
    if (job.nextAllowedAt === null) {
      return;
    }
    const remaining = Date.parse(job.nextAllowedAt) - this.dependencies.now().getTime();
    if (remaining > 0) {
      await this.dependencies.sleep(remaining);
    }
  }

  private async recordRequestAttempt(
    job: ExportJob,
    url: string,
    minimumDelayMs = 0,
  ): Promise<ExportJob> {
    const requestCount = job.requestCount + 1;
    const normalDelay = normalDelayMs(requestCount, this.dependencies.random);
    const delay = Math.max(normalDelay, minimumDelayMs);
    const nextJob: ExportJob = {
      ...job,
      requestCount,
      currentUrl: url,
      nextAllowedAt: new Date(
        this.dependencies.now().getTime() + delay,
      ).toISOString(),
      updatedAt: this.nowIso(),
    };
    await this.saveAndPublish(nextJob);
    return nextJob;
  }

  private async block(
    job: ExportJob,
    state: BlockedJobState,
    error: JobError,
  ): Promise<null> {
    await this.saveAndPublish(blockJob(job, state, error, this.nowIso()));
    return null;
  }

  private async retryOrFail(
    job: ExportJob,
    url: string,
    category: string,
    message: string,
  ): Promise<boolean> {
    const previousAttempt = job.retry?.url === url ? job.retry.attempt : 0;
    const attempt = previousAttempt + 1;
    if (attempt > MAX_RETRIES) {
      await this.block(job, "failed", { category, message, url });
      return false;
    }

    const delay = retryDelayMs(attempt);
    const currentWait = Math.max(
      0,
      Date.parse(job.nextAllowedAt ?? "") - this.dependencies.now().getTime(),
    );
    const retryJob: ExportJob = {
      ...job,
      retry: { url, attempt },
      nextAllowedAt: new Date(
        this.dependencies.now().getTime() + Math.max(delay, currentWait),
      ).toISOString(),
      lastError: { category, message, url },
      updatedAt: this.nowIso(),
    };
    await this.saveAndPublish(retryJob);
    await this.waitUntilAllowed(retryJob);
    return true;
  }

  private async request(url: string): Promise<FetchedPage | null> {
    while (true) {
      const beforeRequest = await this.dependencies.repository.getJob();
      if (!beforeRequest || !isActiveJobState(beforeRequest.state)) {
        return null;
      }
      await this.waitUntilAllowed(beforeRequest);
      if (this.pauseRequested) {
        const current = await this.dependencies.repository.getJob();
        if (current && isActiveJobState(current.state)) {
          await this.saveAndPublish(
            pauseJob(current, "user", this.nowIso()),
          );
        }
        return null;
      }

      let page: FetchedPage;
      try {
        page = await this.dependencies.fetchPage(url);
      } catch (error) {
        const attempted = await this.recordRequestAttempt(beforeRequest, url);
        const shouldRetry = await this.retryOrFail(
          attempted,
          url,
          error instanceof DOMException && error.name === "AbortError"
            ? "timeout"
            : "network",
          safeErrorMessage(error),
        );
        if (!shouldRetry) {
          return null;
        }
        continue;
      }

      const classification = classifyPage(page);
      const rateLimitDelay =
        classification.kind === "rate_limited"
          ? (page.retryAfterMs ?? DEFAULT_RATE_LIMIT_PAUSE_MS)
          : 0;
      const attempted = await this.recordRequestAttempt(
        beforeRequest,
        url,
        rateLimitDelay,
      );

      if (classification.kind === "ok") {
        const successful: ExportJob = {
          ...attempted,
          retry: null,
          lastError: null,
        };
        await this.saveAndPublish(successful);
        return page;
      }
      if (classification.kind === "server_error") {
        const shouldRetry = await this.retryOrFail(
          attempted,
          url,
          "server_error",
          `豆瓣服务器返回 ${page.status}`,
        );
        if (shouldRetry) {
          continue;
        }
        return null;
      }
      if (classification.kind === "auth_required") {
        return this.block(attempted, "auth_required", {
          category: classification.diagnostic,
          message: "豆瓣登录状态不可用",
          url,
        });
      }
      if (classification.kind === "captcha_required") {
        return this.block(attempted, "captcha_required", {
          category: classification.diagnostic,
          message: "豆瓣要求安全验证，任务已暂停",
          url,
        });
      }
      if (classification.kind === "rate_limited") {
        return this.block(attempted, "rate_limited", {
          category: classification.diagnostic,
          message: "豆瓣限制了请求频率，任务已暂停",
          url,
        });
      }
      return this.block(attempted, "failed", {
        category: classification.diagnostic,
        message: `豆瓣返回不可处理的 HTTP 状态 ${page.status}`,
        url,
      });
    }
  }

  private async blockParseError(error: unknown, url: string): Promise<void> {
    const job = await this.dependencies.repository.getJob();
    if (!job || !isActiveJobState(job.state)) {
      return;
    }
    await this.block(job, "parse_error", {
      category:
        error instanceof PageStructureError ? "page_structure" : "parse_error",
      message: safeErrorMessage(error),
      url,
    });
  }

  private async processIdentity(): Promise<void> {
    const page = await this.request(MINE_URL);
    if (!page) {
      return;
    }
    try {
      const identity = parseIdentity(page);
      const job = await this.dependencies.repository.getJob();
      if (!job || job.state !== "checking_auth") {
        return;
      }
      if (job.userId !== "" && job.userId !== identity.userId) {
        await this.block(job, "auth_required", {
          category: "account_mismatch",
          message: "当前登录的豆瓣账号与此导出任务不一致",
          url: MINE_URL,
        });
        return;
      }
      const isInitialAuthentication = job.userId === "";
      await this.saveAndPublish({
        ...job,
        state: job.resumeAfterAuth ?? "discovering_lists",
        resumeAfterAuth: null,
        userId: identity.userId,
        userName: identity.userName,
        listCursors: isInitialAuthentication
          ? buildInitialListUrls(identity.userId)
          : job.listCursors,
        currentUrl: null,
        updatedAt: this.nowIso(),
      });
    } catch (error) {
      if (error instanceof PageStructureError) {
        const job = await this.dependencies.repository.getJob();
        if (job && isActiveJobState(job.state)) {
          await this.block(job, "auth_required", {
            category: "identity_missing",
            message: error.message,
            url: MINE_URL,
          });
        }
      } else {
        await this.blockParseError(error, MINE_URL);
      }
    }
  }

  private async processNextListPage(job: ExportJob): Promise<void> {
    const status = BOOK_STATUS_ORDER.find(
      (candidate) => !job.completedLists.includes(candidate),
    );
    if (!status) {
      await this.saveAndPublish({
        ...job,
        state: "enriching_details",
        updatedAt: this.nowIso(),
      });
      return;
    }
    const url = job.listCursors[status];
    if (!url) {
      await this.blockParseError(
        new PageStructureError("列表任务缺少下一页 URL"),
        MINE_URL,
      );
      return;
    }

    const page = await this.request(url);
    if (!page) {
      return;
    }
    try {
      const parsed = parseListPage(parseHtml(page.html), status, this.nowIso());
      await this.dependencies.repository.commitListPage({
        jobId: "current",
        status,
        records: parsed.records,
        nextUrl: parsed.nextUrl,
        committedAt: this.nowIso(),
      });
      const nextJob = await this.dependencies.repository.getJob();
      if (nextJob) {
        await this.dependencies.publish(nextJob);
      }
    } catch (error) {
      await this.blockParseError(error, url);
    }
  }

  private async processNextDetail(job: ExportJob): Promise<void> {
    const record = await this.dependencies.repository.nextPendingRecord();
    if (!record) {
      await this.saveAndPublish(completeJob(job, this.nowIso()));
      return;
    }

    const page = await this.request(record.subjectUrl);
    if (!page) {
      return;
    }
    try {
      const details = parseDetailPage(parseHtml(page.html), record.subjectId);
      await this.dependencies.repository.commitDetails(
        record.subjectId,
        details,
        this.nowIso(),
      );
      const nextJob = await this.dependencies.repository.getJob();
      if (nextJob) {
        await this.dependencies.publish(nextJob);
      }
    } catch (error) {
      await this.blockParseError(error, record.subjectUrl);
    }
  }
}
