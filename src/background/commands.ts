import type {
  BackgroundCommand,
  CrawlerCommand,
} from "../runtime/messages";

export interface BackgroundCommandDependencies {
  ensureOffscreen(): Promise<void>;
  closeOffscreen(): Promise<void>;
  sendToRuntime(message: CrawlerCommand): Promise<unknown>;
  waitForCrawlerIdle(): Promise<void>;
  resetTaskData(): Promise<void>;
}

export interface CommandResult {
  ok: true;
}

export async function handleBackgroundCommand(
  command: BackgroundCommand,
  dependencies: BackgroundCommandDependencies,
): Promise<CommandResult> {
  if (command.type === "start_job" || command.type === "resume_job") {
    await dependencies.ensureOffscreen();
    await dependencies.sendToRuntime({
      type: command.type === "start_job" ? "crawler_start" : "crawler_resume",
    });
  } else if (command.type === "pause_job") {
    await dependencies.sendToRuntime({ type: "crawler_pause" });
  } else if (command.type === "reset_job") {
    await dependencies.sendToRuntime({ type: "crawler_pause" });
    await dependencies.waitForCrawlerIdle();
    await dependencies.resetTaskData();
    await dependencies.closeOffscreen();
  } else {
    await dependencies.closeOffscreen();
  }
  return { ok: true };
}
