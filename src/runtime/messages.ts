import type { ExportJob } from "../domain/types";

export type BackgroundCommand =
  | { type: "start_job" }
  | { type: "pause_job" }
  | { type: "resume_job" }
  | { type: "reset_job" }
  | { type: "offscreen_idle" };

export type CrawlerCommand =
  | { type: "crawler_start" }
  | { type: "crawler_pause" }
  | { type: "crawler_resume" };

export type RuntimeEvent = { type: "job_changed"; job: ExportJob };

const BACKGROUND_COMMAND_TYPES = new Set([
  "start_job",
  "pause_job",
  "resume_job",
  "reset_job",
  "offscreen_idle",
]);

const CRAWLER_COMMAND_TYPES = new Set([
  "crawler_start",
  "crawler_pause",
  "crawler_resume",
]);

function messageType(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return null;
  }
  return typeof value.type === "string" ? value.type : null;
}

export function isBackgroundCommand(value: unknown): value is BackgroundCommand {
  const type = messageType(value);
  return type !== null && BACKGROUND_COMMAND_TYPES.has(type);
}

export function isCrawlerCommand(value: unknown): value is CrawlerCommand {
  const type = messageType(value);
  return type !== null && CRAWLER_COMMAND_TYPES.has(type);
}

