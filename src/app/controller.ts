import { createExportJob } from "../domain/create-job";
import {
  isActiveJobState,
  resumeJobWithAuthCheck,
} from "../domain/job-state";
import type { BackgroundCommand } from "../runtime/messages";
import type { ExporterRepository } from "../storage/repository";
import { serializeBooksToCsv } from "../export/csv";
import { buildExportFilename } from "../export/filename";
import { deriveViewModel, type AppViewModel } from "./model";

interface RuntimeGateway {
  sendMessage(
    message: BackgroundCommand,
  ): Promise<{ ok: boolean; error?: string } | undefined>;
}

interface DownloadGateway {
  download(options: {
    url: string;
    filename: string;
    saveAs: boolean;
  }): Promise<number>;
}

interface DirectoryGateway {
  chooseDirectory(): Promise<FileSystemDirectoryHandle | null>;
  writeTextFile(
    handle: FileSystemDirectoryHandle,
    fileName: string,
    contents: string,
    mayRequestPermission: boolean,
  ): Promise<boolean>;
}

interface ObjectUrlGateway {
  create(blob: Blob): string;
  revoke(url: string): void;
}

export interface AppControllerDependencies {
  repository: ExporterRepository;
  runtime: RuntimeGateway;
  downloads: DownloadGateway;
  directoryWriter: DirectoryGateway;
  objectUrls: ObjectUrlGateway;
  confirm(message: string): boolean;
  now(): Date;
}

export class AppController {
  private noticeText = "";
  private errorText = "";

  constructor(private readonly dependencies: AppControllerDependencies) {}

  setError(error: unknown): void {
    this.errorText = error instanceof Error ? error.message : "未知错误";
    this.noticeText = "";
  }

  clearMessages(): void {
    this.errorText = "";
    this.noticeText = "";
  }

  async viewModel(): Promise<AppViewModel> {
    const [job, recordCount, directoryHandle] = await Promise.all([
      this.dependencies.repository.getJob(),
      this.dependencies.repository.countRecords(),
      this.dependencies.repository.getDirectoryHandle(),
    ]);
    return deriveViewModel(
      job,
      recordCount,
      directoryHandle?.name ?? null,
      this.noticeText,
      this.errorText,
    );
  }

  private async send(command: BackgroundCommand): Promise<void> {
    const result = await this.dependencies.runtime.sendMessage(command);
    if (result && !result.ok) {
      throw new Error(result.error || "后台命令执行失败");
    }
  }

  async start(): Promise<void> {
    this.clearMessages();
    await this.dependencies.repository.resetTaskData();
    await this.dependencies.repository.createJob(
      createExportJob(this.dependencies.now().toISOString()),
    );
    await this.send({ type: "start_job" });
    this.noticeText = "导出任务已经开始";
  }

  async pause(): Promise<void> {
    this.clearMessages();
    await this.send({ type: "pause_job" });
    this.noticeText = "将在当前请求安全保存后暂停";
  }

  async resume(): Promise<void> {
    this.clearMessages();
    const job = await this.dependencies.repository.getJob();
    if (!job) {
      throw new Error("没有可继续的任务");
    }
    await this.dependencies.repository.saveJob(
      resumeJobWithAuthCheck(job, this.dependencies.now().toISOString()),
    );
    await this.send({ type: "resume_job" });
    this.noticeText = "任务已从断点继续";
  }

  async reset(): Promise<void> {
    if (!this.dependencies.confirm("重新开始会清除当前任务和已抓取记录，是否继续？")) {
      return;
    }
    this.clearMessages();
    await this.send({ type: "reset_job" });
    this.noticeText = "任务数据已清除，下载目录设置已保留";
  }

  async chooseDirectory(): Promise<void> {
    this.clearMessages();
    const handle = await this.dependencies.directoryWriter.chooseDirectory();
    if (!handle) {
      return;
    }
    await this.dependencies.repository.saveDirectoryHandle(handle);
    this.noticeText = `已选择目录：${handle.name}`;
  }

  async useDefaultDirectory(): Promise<void> {
    this.clearMessages();
    await this.dependencies.repository.clearDirectoryHandle();
    this.noticeText = "将使用 Chrome 默认下载目录";
  }

  async exportCsv(): Promise<void> {
    this.clearMessages();
    const job = await this.dependencies.repository.getJob();
    if (!job) {
      throw new Error("没有可以导出的任务");
    }
    if (isActiveJobState(job.state)) {
      throw new Error("任务仍在运行，请先暂停再导出部分数据");
    }
    const records = await this.dependencies.repository.listRecordsSnapshot();
    if (records.length === 0) {
      throw new Error("当前还没有已保存的图书记录");
    }
    const partial = job.state !== "completed";
    const filename = buildExportFilename({
      userName: job.userName,
      partial,
      now: this.dependencies.now(),
    });
    const csv = serializeBooksToCsv(records);
    const directoryHandle =
      await this.dependencies.repository.getDirectoryHandle();
    if (directoryHandle) {
      const written = await this.dependencies.directoryWriter.writeTextFile(
        directoryHandle,
        filename,
        csv,
        true,
      );
      if (!written) {
        throw new Error("自定义目录写入权限不可用，请重新选择目录或改用默认目录");
      }
    } else {
      const objectUrl = this.dependencies.objectUrls.create(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
      );
      try {
        await this.dependencies.downloads.download({
          url: objectUrl,
          filename,
          saveAs: false,
        });
      } finally {
        this.dependencies.objectUrls.revoke(objectUrl);
      }
    }
    this.noticeText = partial
      ? `已导出部分数据：${filename}`
      : `CSV 已导出：${filename}`;
  }
}
