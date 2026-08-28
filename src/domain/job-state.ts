import type {
  ActiveJobState,
  BlockedJobState,
  ExportJob,
  JobError,
  JobState,
} from "./types";

const ACTIVE_STATES = new Set<JobState>([
  "checking_auth",
  "discovering_lists",
  "enriching_details",
]);

const RESUMABLE_STATES = new Set<JobState>([
  "paused",
  "auth_required",
  "captcha_required",
  "rate_limited",
  "parse_error",
  "failed",
]);

function currentTime(): string {
  return new Date().toISOString();
}

export function isActiveJobState(state: JobState): state is ActiveJobState {
  return ACTIVE_STATES.has(state);
}

export function pauseJob(
  job: ExportJob,
  reason: string,
  now = currentTime(),
): ExportJob {
  if (!isActiveJobState(job.state)) {
    throw new Error("只有运行中的任务可以暂停");
  }

  return {
    ...job,
    state: "paused",
    resumeState: job.state,
    pauseReason: reason,
    updatedAt: now,
  };
}

export function blockJob(
  job: ExportJob,
  state: BlockedJobState,
  error: JobError,
  now = currentTime(),
): ExportJob {
  if (!isActiveJobState(job.state)) {
    throw new Error("只有运行中的任务可以被错误阻塞");
  }

  return {
    ...job,
    state,
    resumeState: job.state,
    pauseReason: null,
    lastError: error,
    updatedAt: now,
  };
}

export function resumeJob(job: ExportJob, now = currentTime()): ExportJob {
  if (job.state === "completed") {
    throw new Error("任务已完成，不能继续");
  }
  if (!RESUMABLE_STATES.has(job.state)) {
    throw new Error("当前任务状态不能继续");
  }
  if (job.resumeState === null) {
    throw new Error("任务缺少可恢复阶段");
  }

  return {
    ...job,
    state: job.resumeState,
    resumeState: null,
    pauseReason: null,
    lastError: null,
    updatedAt: now,
  };
}

export function completeJob(job: ExportJob, now = currentTime()): ExportJob {
  if (!isActiveJobState(job.state)) {
    throw new Error("只有运行中的任务可以完成");
  }

  return {
    ...job,
    state: "completed",
    resumeState: null,
    currentUrl: null,
    retry: null,
    nextAllowedAt: null,
    pauseReason: null,
    lastError: null,
    updatedAt: now,
  };
}

