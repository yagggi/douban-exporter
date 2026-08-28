import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppController } from "../../src/app/controller";
import type { BackgroundCommand } from "../../src/runtime/messages";
import { ExporterRepository } from "../../src/storage/repository";
import { makeBookRecord, makeJob } from "../support/factories";

describe("AppController", () => {
  let databaseName: string;
  let repository: ExporterRepository;
  let messages: BackgroundCommand[];
  let downloads: Array<{ url: string; filename: string; saveAs: boolean }>;
  let revokedUrls: string[];
  let directoryWriteResult: boolean;
  let confirmResult: boolean;
  let controller: AppController;

  beforeEach(async () => {
    databaseName = `app-${crypto.randomUUID()}`;
    repository = await ExporterRepository.open(databaseName);
    messages = [];
    downloads = [];
    revokedUrls = [];
    directoryWriteResult = true;
    confirmResult = true;
    controller = new AppController({
      repository,
      runtime: {
        async sendMessage(message) {
          messages.push(message);
          return { ok: true };
        },
      },
      downloads: {
        async download(options) {
          downloads.push(options);
          return 1;
        },
      },
      directoryWriter: {
        async chooseDirectory() {
          return null;
        },
        async writeTextFile() {
          return directoryWriteResult;
        },
      },
      objectUrls: {
        create() {
          return "blob:test-export";
        },
        revoke(url) {
          revokedUrls.push(url);
        },
      },
      confirm: () => confirmResult,
      now: () => new Date(2026, 7, 28, 9, 7, 6),
    });
  });

  afterEach(async () => {
    repository.close();
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(databaseName);
      request.onsuccess = () => resolve();
    });
  });

  it("creates a fresh persisted job before asking the background to start", async () => {
    await controller.start();

    expect((await repository.getJob())?.state).toBe("checking_auth");
    expect(messages).toEqual([{ type: "start_job" }]);
  });

  it("resumes the exact saved phase before waking the offscreen crawler", async () => {
    await repository.createJob(
      makeJob({ state: "paused", resumeState: "enriching_details" }),
    );

    await controller.resume();

    expect(await repository.getJob()).toMatchObject({
      state: "checking_auth",
      resumeAfterAuth: "enriching_details",
    });
    expect(messages).toEqual([{ type: "resume_job" }]);
  });

  it("does not reset when the user cancels confirmation", async () => {
    confirmResult = false;
    await repository.createJob(makeJob({ state: "paused" }));

    await controller.reset();

    expect(messages).toEqual([]);
    expect(await repository.getJob()).toBeDefined();
  });

  it("downloads a stable completed snapshot through Chrome Downloads", async () => {
    await repository.createJob(
      makeJob({ state: "completed", userName: "豆友01" }),
    );
    await repository.commitListPage({
      jobId: "current",
      status: "collect",
      records: [makeBookRecord()],
      nextUrl: null,
      committedAt: "2026-08-28T01:00:00.000Z",
    });

    await controller.exportCsv();

    expect(downloads).toEqual([
      {
        url: "blob:test-export",
        filename: "douban-books-豆友01-20260828-090706.csv",
        saveAs: false,
      },
    ]);
    expect(revokedUrls).toEqual(["blob:test-export"]);
  });

  it("refuses a stale export click while the task is actively changing", async () => {
    await repository.createJob(
      makeJob({ state: "enriching_details", userName: "豆友01" }),
    );
    await repository.commitListPage({
      jobId: "current",
      status: "collect",
      records: [makeBookRecord()],
      nextUrl: null,
      committedAt: "2026-08-28T01:00:00.000Z",
    });

    await expect(controller.exportCsv()).rejects.toThrow("任务仍在运行");
    expect(downloads).toEqual([]);
  });

  it("does not silently fall back when custom-directory permission is denied", async () => {
    await repository.createJob(
      makeJob({ state: "paused", userName: "豆友01" }),
    );
    await repository.commitListPage({
      jobId: "current",
      status: "collect",
      records: [makeBookRecord()],
      nextUrl: null,
      committedAt: "2026-08-28T01:00:00.000Z",
    });
    await repository.saveDirectoryHandle({
      kind: "directory",
      name: "Books",
    } as FileSystemDirectoryHandle);
    directoryWriteResult = false;

    await expect(controller.exportCsv()).rejects.toThrow("目录写入权限");
    expect(downloads).toEqual([]);
  });

  it("keeps independent pagination while switching book status tabs", async () => {
    await repository.createJob(
      makeJob({ state: "paused", resumeState: "discovering_lists" }),
    );
    await repository.commitListPage({
      jobId: "current",
      status: "collect",
      records: Array.from({ length: 21 }, (_, index) =>
        makeBookRecord({
          subjectId: `collect-${index}`,
          status: "collect",
          title: `读过 ${index}`,
        }),
      ),
      nextUrl: null,
      committedAt: "2026-08-28T01:00:00.000Z",
    });
    await repository.commitListPage({
      jobId: "current",
      status: "wish",
      records: [
        makeBookRecord({ subjectId: "wish-1", status: "wish", title: "想读 1" }),
      ],
      nextUrl: null,
      committedAt: "2026-08-28T01:01:00.000Z",
    });

    controller.selectBookStatus("collect");
    controller.nextBookPage();
    expect((await controller.viewModel()).bookBrowser).toMatchObject({
      activeStatus: "collect",
      page: 2,
      totalPages: 2,
    });

    controller.selectBookStatus("wish");
    expect((await controller.viewModel()).bookBrowser).toMatchObject({
      activeStatus: "wish",
      page: 1,
      totalPages: 1,
    });

    controller.selectBookStatus("collect");
    expect((await controller.viewModel()).bookBrowser?.page).toBe(2);
  });
});
