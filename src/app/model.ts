import { isActiveJobState } from "../domain/job-state";
import type { ExportJob, JobState } from "../domain/types";

export interface AppViewModel {
  accountText: string;
  statusText: string;
  statusTone: "neutral" | "running" | "warning" | "success" | "error";
  progressText: string;
  progressPercent: number;
  recordCount: number;
  requestCount: number;
  currentUrlText: string;
  nextRequestText: string;
  directoryText: string;
  errorText: string;
  noticeText: string;
  canStart: boolean;
  canPause: boolean;
  canResume: boolean;
  canExport: boolean;
  canReset: boolean;
  exportWillBePartial: boolean;
}

const STATUS_TEXT: Record<JobState, string> = {
  idle: "尚未开始",
  checking_auth: "正在检查豆瓣登录状态",
  discovering_lists: "正在读取读过、想读和在读列表",
  enriching_details: "正在补充图书详情",
  paused: "任务已暂停，可从当前断点继续",
  auth_required: "需要先在普通豆瓣标签页登录",
  captcha_required: "遇到豆瓣验证码，已安全暂停",
  rate_limited: "豆瓣限制了请求频率，已安全暂停",
  parse_error: "豆瓣页面结构无法可靠识别，已暂停",
  failed: "任务因连续错误而停止",
  completed: "全部图书已经抓取完成",
};

function statusTone(job: ExportJob | undefined): AppViewModel["statusTone"] {
  if (!job || job.state === "idle" || job.state === "paused") {
    return "neutral";
  }
  if (isActiveJobState(job.state)) {
    return "running";
  }
  if (job.state === "completed") {
    return "success";
  }
  return job.state === "failed" || job.state === "parse_error"
    ? "error"
    : "warning";
}

function canResume(job: ExportJob | undefined): boolean {
  return Boolean(
    job?.resumeState &&
      [
        "paused",
        "auth_required",
        "captcha_required",
        "rate_limited",
        "parse_error",
        "failed",
      ].includes(job.state),
  );
}

export function deriveViewModel(
  job: ExportJob | undefined,
  recordCount: number,
  directoryName: string | null,
  noticeText = "",
  localErrorText = "",
): AppViewModel {
  const discovered = job?.recordsDiscovered ?? 0;
  const completed = job?.detailsCompleted ?? 0;
  const canExport = Boolean(
    job && recordCount > 0 && !isActiveJobState(job.state),
  );
  const progressPercent =
    discovered === 0
      ? 0
      : Math.min(100, Math.round((completed / discovered) * 100));

  return {
    accountText: job?.userName || "尚未识别当前用户",
    statusText: job ? STATUS_TEXT[job.state] : "尚未开始",
    statusTone: statusTone(job),
    progressText: `${completed} / ${discovered}`,
    progressPercent,
    recordCount,
    requestCount: job?.requestCount ?? 0,
    currentUrlText: job?.currentUrl ?? "无",
    nextRequestText: job?.nextAllowedAt
      ? new Date(job.nextAllowedAt).toLocaleString()
      : "无",
    directoryText:
      directoryName ?? "Chrome 默认下载目录（通常为 ~/Downloads）",
    errorText: localErrorText || job?.lastError?.message || "",
    noticeText,
    canStart: !job || job.state === "idle",
    canPause: Boolean(job && isActiveJobState(job.state)),
    canResume: canResume(job),
    canExport,
    canReset: Boolean(job),
    exportWillBePartial: Boolean(canExport && job?.state !== "completed"),
  };
}

