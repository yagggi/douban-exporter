import type { ExportJob } from "../domain/types";

export const BACKGROUND_COMMAND_TYPES = [
  "start_job",
  "pause_job",
  "resume_job",
  "reset_job",
  "offscreen_idle",
] as const;

export const CRAWLER_COMMAND_TYPES = [
  "crawler_start",
  "crawler_pause",
  "crawler_resume",
] as const;

export type BackgroundCommand = {
  type: (typeof BACKGROUND_COMMAND_TYPES)[number];
};

export type CrawlerCommand = {
  type: (typeof CRAWLER_COMMAND_TYPES)[number];
};

export type RuntimeEvent = { type: "job_changed"; job: ExportJob };

const BACKGROUND_COMMAND_TYPE_SET = new Set<string>(BACKGROUND_COMMAND_TYPES);
const CRAWLER_COMMAND_TYPE_SET = new Set<string>(CRAWLER_COMMAND_TYPES);

function messageType(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return null;
  }
  return typeof value.type === "string" ? value.type : null;
}

export function isBackgroundCommand(value: unknown): value is BackgroundCommand {
  const type = messageType(value);
  return type !== null && BACKGROUND_COMMAND_TYPE_SET.has(type);
}

export function isCrawlerCommand(value: unknown): value is CrawlerCommand {
  const type = messageType(value);
  return type !== null && CRAWLER_COMMAND_TYPE_SET.has(type);
}
