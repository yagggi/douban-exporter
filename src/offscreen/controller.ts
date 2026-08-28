import type { CrawlerCommand } from "../runtime/messages";

export interface CrawlerRunner {
  run(): Promise<void>;
  requestPause(): void;
}

export class OffscreenController {
  private runner: CrawlerRunner | null = null;
  private activeRun: Promise<void> | null = null;

  constructor(
    private readonly createRunner: () => Promise<CrawlerRunner>,
    private readonly onIdle: () => Promise<void>,
  ) {}

  async handle(command: CrawlerCommand): Promise<void> {
    if (command.type === "crawler_pause") {
      this.runner?.requestPause();
      return;
    }
    if (this.activeRun) {
      return this.activeRun;
    }
    this.activeRun = this.runOnce();
    try {
      await this.activeRun;
    } finally {
      this.activeRun = null;
    }
  }

  private async runOnce(): Promise<void> {
    this.runner ??= await this.createRunner();
    try {
      await this.runner.run();
    } finally {
      await this.onIdle();
    }
  }
}
