import { Crawler } from "../crawler/crawler";
import { fetchPage } from "../crawler/fetch-page";
import { sleep } from "../crawler/sleep";
import {
  isCrawlerCommand,
  type RuntimeEvent,
} from "../runtime/messages";
import { ExporterRepository } from "../storage/repository";
import { OffscreenController } from "./controller";
import { notifyRuntimeBestEffort } from "./notifier";

const repositoryPromise = ExporterRepository.open();

const controller = new OffscreenController(
  async () => {
    const repository = await repositoryPromise;
    return new Crawler({
      repository,
      fetchPage: (url) => fetchPage(url),
      sleep,
      random: Math.random,
      now: () => new Date(),
      publish: async (job) => {
        const event: RuntimeEvent = { type: "job_changed", job };
        await notifyRuntimeBestEffort(
          (message) => chrome.runtime.sendMessage(message),
          event,
        );
      },
    });
  },
  async () => {
    await chrome.runtime.sendMessage({ type: "offscreen_idle" });
  },
);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isCrawlerCommand(message)) {
    return false;
  }
  void controller.handle(message).catch((error: unknown) => {
    console.error("离屏抓取器执行失败", error);
  });
  sendResponse({ ok: true });
  return false;
});
