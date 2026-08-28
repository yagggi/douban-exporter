import { isActiveJobState } from "../domain/job-state";
import type { ExportJob } from "../domain/types";

const POLL_INTERVAL_MS = 250;

export async function waitForCrawlerIdle(
  getJob: () => Promise<ExportJob | undefined>,
  sleep: (milliseconds: number) => Promise<void>,
  timeoutMs = 35_000,
  now: () => number = Date.now,
): Promise<void> {
  const deadline = now() + timeoutMs;
  while (true) {
    const job = await getJob();
    if (!job || !isActiveJobState(job.state)) {
      return;
    }
    const remaining = deadline - now();
    if (remaining <= 0) {
      throw new Error("等待抓取器暂停超时，任务数据未清除");
    }
    await sleep(Math.min(POLL_INTERVAL_MS, remaining));
  }
}

