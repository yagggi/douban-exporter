import type { ExportJob } from "./types";

export function createExportJob(
  now = new Date().toISOString(),
): ExportJob {
  return {
    id: "current",
    state: "checking_auth",
    resumeState: null,
    resumeAfterAuth: null,
    userId: "",
    userName: "",
    listCursors: { collect: null, wish: null, do: null },
    completedLists: [],
    recordsDiscovered: 0,
    detailsCompleted: 0,
    warningCount: 0,
    failureCount: 0,
    requestCount: 0,
    retry: null,
    nextAllowedAt: null,
    currentUrl: null,
    pauseReason: null,
    lastError: null,
    startedAt: now,
    updatedAt: now,
  };
}
