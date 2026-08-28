import { isActiveJobState, pauseJob } from "../domain/job-state";
import type { ExporterRepository } from "../storage/repository";

export async function recoverInterruptedJob(
  repository: ExporterRepository,
  now = new Date().toISOString(),
  reason = "browser_restart",
): Promise<void> {
  const job = await repository.getJob();
  if (!job || !isActiveJobState(job.state)) {
    return;
  }
  await repository.saveJob(pauseJob(job, reason, now));
}

