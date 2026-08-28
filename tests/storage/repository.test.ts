import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ParsedBookDetails } from "../../src/domain/types";
import {
  ExporterRepository,
  type RepositoryHooks,
} from "../../src/storage/repository";
import {
  makeJob,
  makeListRecord,
} from "../support/factories";

const COMPLETE_DETAILS: ParsedBookDetails = {
  title: "夏洛的网",
  isbn: "9787532733415",
  pages: "176",
  authors: ["[美] E.B.怀特"],
  publisher: "上海译文出版社",
  publishedAt: "2004-5",
  introduction: "一个蜘蛛和小猪的故事。",
};

describe("ExporterRepository", () => {
  let databaseName: string;
  let repository: ExporterRepository;
  let shouldFailCommit: boolean;

  beforeEach(async () => {
    databaseName = `test-${crypto.randomUUID()}`;
    shouldFailCommit = false;
    const hooks: RepositoryHooks = {
      beforeAtomicCommit: () => {
        if (shouldFailCommit) {
          throw new Error("quota");
        }
      },
    };
    repository = await ExporterRepository.open(databaseName, hooks);
    await repository.createJob(makeJob({ state: "discovering_lists" }));
  });

  afterEach(async () => {
    repository.close();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(databaseName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });

  it("commits discovered records and the next cursor together", async () => {
    await repository.commitListPage({
      jobId: "current",
      status: "collect",
      records: [makeListRecord({ subjectId: "1036274" })],
      nextUrl: "https://book.douban.com/people/example/collect?start=15",
      committedAt: "2026-08-28T01:00:00.000Z",
    });

    expect((await repository.getJob())?.listCursors.collect).toBe(
      "https://book.douban.com/people/example/collect?start=15",
    );
    expect((await repository.getJob())?.recordsDiscovered).toBe(1);
    expect(
      (await repository.listRecordsSnapshot()).map((record) => record.subjectId),
    ).toEqual(["1036274"]);
  });

  it("advances to detail enrichment when all three lists finish", async () => {
    for (const status of ["collect", "wish", "do"] as const) {
      await repository.commitListPage({
        jobId: "current",
        status,
        records: status === "collect" ? [makeListRecord()] : [],
        nextUrl: null,
        committedAt: "2026-08-28T01:00:00.000Z",
      });
    }

    expect(await repository.getJob()).toMatchObject({
      state: "enriching_details",
      completedLists: ["collect", "wish", "do"],
    });
  });

  it("keeps completed details when a later list observation changes status", async () => {
    await repository.commitListPage({
      jobId: "current",
      status: "collect",
      records: [makeListRecord()],
      nextUrl: null,
      committedAt: "2026-08-28T01:00:00.000Z",
    });
    await repository.commitDetails(
      "1036274",
      COMPLETE_DETAILS,
      "2026-08-28T01:30:00.000Z",
    );
    await repository.commitListPage({
      jobId: "current",
      status: "wish",
      records: [
        makeListRecord({
          status: "wish",
          listSeenAt: "2026-08-28T02:00:00.000Z",
        }),
      ],
      nextUrl: null,
      committedAt: "2026-08-28T02:00:00.000Z",
    });

    expect((await repository.listRecordsSnapshot())[0]).toMatchObject({
      status: "wish",
      isbn: "9787532733415",
      detailStatus: "complete",
      warnings: ["状态在抓取期间发生冲突"],
    });
    expect((await repository.getJob())?.warningCount).toBe(1);
  });

  it("does not advance detail progress when the atomic commit fails", async () => {
    await repository.commitListPage({
      jobId: "current",
      status: "collect",
      records: [makeListRecord()],
      nextUrl: null,
      committedAt: "2026-08-28T01:00:00.000Z",
    });
    shouldFailCommit = true;

    await expect(
      repository.commitDetails(
        "1036274",
        COMPLETE_DETAILS,
        "2026-08-28T02:00:00.000Z",
      ),
    ).rejects.toThrow("quota");

    expect((await repository.getJob())?.detailsCompleted).toBe(0);
    expect((await repository.nextPendingRecord())?.subjectId).toBe("1036274");
  });

  it("commits details once and does not return the book as pending again", async () => {
    await repository.commitListPage({
      jobId: "current",
      status: "collect",
      records: [makeListRecord()],
      nextUrl: null,
      committedAt: "2026-08-28T01:00:00.000Z",
    });

    await repository.commitDetails(
      "1036274",
      COMPLETE_DETAILS,
      "2026-08-28T02:00:00.000Z",
    );
    await repository.commitDetails(
      "1036274",
      COMPLETE_DETAILS,
      "2026-08-28T03:00:00.000Z",
    );

    expect((await repository.getJob())?.detailsCompleted).toBe(1);
    expect(await repository.nextPendingRecord()).toBeUndefined();
  });

  it("marks a removed subject unavailable and advances progress atomically", async () => {
    await repository.commitListPage({
      jobId: "current",
      status: "collect",
      records: [makeListRecord({ subjectId: "2076886" })],
      nextUrl: null,
      committedAt: "2026-08-28T01:00:00.000Z",
    });

    await repository.commitDetailUnavailable(
      "2076886",
      "豆瓣条目已删除或不再收录",
      "2026-08-28T02:00:00.000Z",
    );

    expect((await repository.listRecordsSnapshot())[0]).toMatchObject({
      subjectId: "2076886",
      detailStatus: "unavailable",
      authors: ["[美] E.B.怀特"],
      publisher: "上海译文出版社",
      publishedAt: "2004-5",
      warnings: ["豆瓣条目已删除或不再收录"],
    });
    expect(await repository.getJob()).toMatchObject({
      detailsUnavailable: 1,
      detailsCompleted: 0,
      warningCount: 1,
    });
    expect(await repository.nextPendingRecord()).toBeUndefined();
  });

  it("keeps directory settings when resetting task data", async () => {
    const handle = {
      kind: "directory",
      name: "Books",
    } as FileSystemDirectoryHandle;
    await repository.saveDirectoryHandle(handle);

    await repository.resetTaskData();

    expect(await repository.getJob()).toBeUndefined();
    expect(await repository.listRecordsSnapshot()).toEqual([]);
    expect((await repository.getDirectoryHandle())?.name).toBe("Books");
  });

  it("can explicitly return to the default download directory", async () => {
    const handle = {
      kind: "directory",
      name: "Books",
    } as FileSystemDirectoryHandle;
    await repository.saveDirectoryHandle(handle);

    await repository.clearDirectoryHandle();

    expect(await repository.getDirectoryHandle()).toBeUndefined();
  });
});
