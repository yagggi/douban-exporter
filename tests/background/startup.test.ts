import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";

import { recoverInterruptedJob } from "../../src/background/startup";
import { ExporterRepository } from "../../src/storage/repository";
import { makeJob } from "../support/factories";

describe("recoverInterruptedJob", () => {
  const resources: Array<{ name: string; repository: ExporterRepository }> = [];

  afterEach(async () => {
    for (const resource of resources.splice(0)) {
      resource.repository.close();
      await new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase(resource.name);
        request.onsuccess = () => resolve();
      });
    }
  });

  it.each(["checking_auth", "discovering_lists", "enriching_details"] as const)(
    "pauses interrupted %s work at browser startup",
    async (state) => {
      const name = `startup-${state}-${crypto.randomUUID()}`;
      const repository = await ExporterRepository.open(name);
      resources.push({ name, repository });
      await repository.createJob(makeJob({ state }));

      await recoverInterruptedJob(
        repository,
        "2026-08-28T09:00:00.000Z",
      );

      expect(await repository.getJob()).toMatchObject({
        state: "paused",
        resumeState: state,
        pauseReason: "browser_restart",
      });
    },
  );

  it("leaves an already paused task unchanged", async () => {
    const name = `startup-paused-${crypto.randomUUID()}`;
    const repository = await ExporterRepository.open(name);
    resources.push({ name, repository });
    const original = makeJob({
      state: "paused",
      resumeState: "discovering_lists",
      updatedAt: "2026-08-28T01:00:00.000Z",
    });
    await repository.createJob(original);

    await recoverInterruptedJob(repository, "2026-08-28T09:00:00.000Z");

    expect(await repository.getJob()).toEqual(original);
  });
});

