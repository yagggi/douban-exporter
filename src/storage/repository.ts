import { type IDBPDatabase, openDB } from "idb";

import {
  BOOK_STATUS_ORDER,
  type BookRecord,
  type BookStatus,
  type ExportJob,
  type ParsedBookDetails,
  type ParsedListRecord,
} from "../domain/types";
import {
  DATABASE_NAME,
  DATABASE_VERSION,
  type ExporterDatabaseSchema,
} from "./schema";

export interface RepositoryHooks {
  beforeAtomicCommit?: () => void;
}

export interface CommitListPageInput {
  jobId: "current";
  status: BookStatus;
  records: ParsedListRecord[];
  nextUrl: string | null;
  committedAt: string;
}

function blankBookRecord(record: ParsedListRecord): BookRecord {
  return {
    ...record,
    isbn: "",
    pages: "",
    authors: [],
    publisher: "",
    publishedAt: "",
    introduction: "",
    detailStatus: "pending",
    warnings: [],
  };
}

function mergeListObservation(
  existing: BookRecord | undefined,
  incoming: ParsedListRecord,
): BookRecord {
  if (!existing) {
    return blankBookRecord(incoming);
  }
  if (incoming.listSeenAt < existing.listSeenAt) {
    return existing;
  }

  const statusChanged = existing.status !== incoming.status;
  const warnings = statusChanged
    ? [...new Set([...existing.warnings, "状态在抓取期间发生冲突"])]
    : existing.warnings;

  return {
    ...existing,
    ...incoming,
    warnings,
  };
}

function sortRecords(records: BookRecord[]): BookRecord[] {
  const statusRank = new Map(
    BOOK_STATUS_ORDER.map((status, index) => [status, index]),
  );
  return records.sort((left, right) => {
    const byStatus =
      (statusRank.get(left.status) ?? 0) - (statusRank.get(right.status) ?? 0);
    if (byStatus !== 0) {
      return byStatus;
    }
    const byDate = right.markedAt.localeCompare(left.markedAt);
    return byDate !== 0 ? byDate : left.title.localeCompare(right.title, "zh-CN");
  });
}

export class ExporterRepository {
  private constructor(
    private readonly database: IDBPDatabase<ExporterDatabaseSchema>,
    private readonly hooks: RepositoryHooks,
  ) {}

  static async open(
    name = DATABASE_NAME,
    hooks: RepositoryHooks = {},
  ): Promise<ExporterRepository> {
    const database = await openDB<ExporterDatabaseSchema>(
      name,
      DATABASE_VERSION,
      {
        upgrade(database) {
          database.createObjectStore("jobs");
          const records = database.createObjectStore("records", {
            keyPath: "subjectId",
          });
          records.createIndex("by-detail-status", "detailStatus");
          database.createObjectStore("settings");
        },
      },
    );
    return new ExporterRepository(database, hooks);
  }

  close(): void {
    this.database.close();
  }

  async createJob(job: ExportJob): Promise<void> {
    await this.database.put("jobs", job, "current");
  }

  async getJob(): Promise<ExportJob | undefined> {
    return this.database.get("jobs", "current");
  }

  async saveJob(job: ExportJob): Promise<void> {
    await this.database.put("jobs", job, "current");
  }

  async commitListPage(input: CommitListPageInput): Promise<void> {
    const transaction = this.database.transaction(
      ["jobs", "records"],
      "readwrite",
    );
    try {
      const jobs = transaction.objectStore("jobs");
      const records = transaction.objectStore("records");
      const job = await jobs.get(input.jobId);
      if (!job) {
        throw new Error("找不到当前导出任务");
      }

      for (const record of input.records) {
        if (record.status !== input.status) {
          throw new Error("列表记录状态与当前分页不一致");
        }
        const existing = await records.get(record.subjectId);
        await records.put(mergeListObservation(existing, record));
      }

      const completedLists =
        input.nextUrl === null
          ? BOOK_STATUS_ORDER.filter(
              (status) =>
                status === input.status || job.completedLists.includes(status),
            )
          : job.completedLists;
      const allListsComplete = completedLists.length === BOOK_STATUS_ORDER.length;
      const nextJob: ExportJob = {
        ...job,
        state: allListsComplete ? "enriching_details" : job.state,
        listCursors: {
          ...job.listCursors,
          [input.status]: input.nextUrl,
        },
        completedLists,
        recordsDiscovered: await records.count(),
        currentUrl: null,
        retry: null,
        updatedAt: input.committedAt,
      };

      this.hooks.beforeAtomicCommit?.();
      await jobs.put(nextJob, "current");
      await transaction.done;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // IndexedDB may already have aborted after a request failure.
      }
      try {
        await transaction.done;
      } catch {
        // The original error below is the actionable one.
      }
      throw error;
    }
  }

  async nextPendingRecord(): Promise<BookRecord | undefined> {
    return this.database.getFromIndex(
      "records",
      "by-detail-status",
      "pending",
    );
  }

  async commitDetails(
    subjectId: string,
    details: ParsedBookDetails,
    committedAt: string,
  ): Promise<void> {
    const transaction = this.database.transaction(
      ["jobs", "records"],
      "readwrite",
    );
    try {
      const jobs = transaction.objectStore("jobs");
      const records = transaction.objectStore("records");
      const [job, record] = await Promise.all([
        jobs.get("current"),
        records.get(subjectId),
      ]);
      if (!job) {
        throw new Error("找不到当前导出任务");
      }
      if (!record) {
        throw new Error(`找不到待补全图书: ${subjectId}`);
      }

      const wasPending = record.detailStatus === "pending";
      const nextRecord: BookRecord = {
        ...record,
        ...details,
        detailStatus: "complete",
      };
      const nextJob: ExportJob = {
        ...job,
        detailsCompleted: job.detailsCompleted + (wasPending ? 1 : 0),
        currentUrl: null,
        retry: null,
        updatedAt: committedAt,
      };

      this.hooks.beforeAtomicCommit?.();
      await records.put(nextRecord);
      await jobs.put(nextJob, "current");
      await transaction.done;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // IndexedDB may already have aborted after a request failure.
      }
      try {
        await transaction.done;
      } catch {
        // The original error below is the actionable one.
      }
      throw error;
    }
  }

  async listRecordsSnapshot(): Promise<BookRecord[]> {
    return sortRecords(await this.database.getAll("records"));
  }

  async saveDirectoryHandle(
    handle: FileSystemDirectoryHandle,
  ): Promise<void> {
    await this.database.put("settings", handle, "directoryHandle");
  }

  async getDirectoryHandle(): Promise<FileSystemDirectoryHandle | undefined> {
    return this.database.get("settings", "directoryHandle");
  }

  async resetTaskData(): Promise<void> {
    const transaction = this.database.transaction(
      ["jobs", "records"],
      "readwrite",
    );
    await Promise.all([
      transaction.objectStore("jobs").clear(),
      transaction.objectStore("records").clear(),
    ]);
    await transaction.done;
  }
}
