import "./styles.css";

import { DirectoryWriter } from "../export/directory";
import type { RuntimeEvent } from "../runtime/messages";
import { ExporterRepository } from "../storage/repository";
import { AppController } from "./controller";
import { renderApp, type AppActionHandlers } from "./view";

const root = document.querySelector<HTMLElement>("#app");

async function bootstrap(root: HTMLElement): Promise<void> {
  const repository = await ExporterRepository.open();
  const controller = new AppController({
    repository,
    runtime: {
      sendMessage: (message) => chrome.runtime.sendMessage(message),
    },
    downloads: {
      download: (options) => chrome.downloads.download(options),
    },
    directoryWriter: new DirectoryWriter(),
    objectUrls: {
      create: (blob) => URL.createObjectURL(blob),
      revoke: (url) => URL.revokeObjectURL(url),
    },
    confirm: (message) => window.confirm(message),
    now: () => new Date(),
  });

  let rendering = false;
  const refresh = async (): Promise<void> => {
    if (rendering) return;
    rendering = true;
    try {
      renderApp(root, await controller.viewModel(), handlers);
    } finally {
      rendering = false;
    }
  };
  const run = async (action: () => Promise<void>): Promise<void> => {
    try {
      await action();
    } catch (error) {
      controller.setError(error);
    }
    await refresh();
  };
  const handlers: AppActionHandlers = {
    start: () => run(() => controller.start()),
    pause: () => run(() => controller.pause()),
    resume: () => run(() => controller.resume()),
    exportCsv: () => run(() => controller.exportCsv()),
    chooseDirectory: () => run(() => controller.chooseDirectory()),
    useDefaultDirectory: () => run(() => controller.useDefaultDirectory()),
    reset: () => run(() => controller.reset()),
  };

  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      (message as RuntimeEvent).type === "job_changed"
    ) {
      void refresh();
    }
    return false;
  });
  window.setInterval(() => void refresh(), 1_000);
  await refresh();
}

if (root) {
  root.textContent = "豆瓣图书导出器正在初始化…";
  void bootstrap(root).catch((error: unknown) => {
    root.textContent = `扩展初始化失败：${
      error instanceof Error ? error.message : "未知错误"
    }`;
  });
}
