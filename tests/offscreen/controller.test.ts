import { describe, expect, it, vi } from "vitest";

import { OffscreenController } from "../../src/offscreen/controller";

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function deferredValue<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve = (_value: T) => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("OffscreenController", () => {
  it("does not run two crawler loops concurrently", async () => {
    const run = deferred();
    const runner = {
      run: vi.fn(() => run.promise),
      requestPause: vi.fn(),
    };
    const onIdle = vi.fn(async () => {});
    const controller = new OffscreenController(async () => runner, onIdle);

    const first = controller.handle({ type: "crawler_start" });
    const second = controller.handle({ type: "crawler_resume" });
    await Promise.resolve();

    expect(runner.run).toHaveBeenCalledTimes(1);
    run.resolve();
    await Promise.all([first, second]);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it("forwards pause to the active crawler", async () => {
    const run = deferred();
    const runner = {
      run: vi.fn(() => run.promise),
      requestPause: vi.fn(),
    };
    const controller = new OffscreenController(async () => runner, async () => {});

    const running = controller.handle({ type: "crawler_start" });
    await Promise.resolve();
    await controller.handle({ type: "crawler_pause" });

    expect(runner.requestPause).toHaveBeenCalledTimes(1);
    run.resolve();
    await running;
  });

  it("preserves a pause received while the crawler is still being created", async () => {
    const creation = deferredValue<{
      run(): Promise<void>;
      requestPause(): void;
    }>();
    const runner = {
      run: vi.fn(async () => {}),
      requestPause: vi.fn(),
    };
    const controller = new OffscreenController(
      () => creation.promise,
      async () => {},
    );

    const starting = controller.handle({ type: "crawler_start" });
    await controller.handle({ type: "crawler_pause" });
    creation.resolve(runner);
    await starting;

    expect(runner.requestPause).toHaveBeenCalledTimes(1);
  });
});
