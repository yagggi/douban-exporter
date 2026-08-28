import { isActiveJobState } from "../domain/job-state";
import {
  isBackgroundCommand,
  type CrawlerCommand,
} from "../runtime/messages";
import { ExporterRepository } from "../storage/repository";
import { openOrFocusAppTab } from "./app-tab";
import { handleBackgroundCommand } from "./commands";
import {
  closeOffscreenDocument,
  ensureOffscreenDocument,
} from "./offscreen-manager";
import { recoverInterruptedJob } from "./startup";
import { waitForCrawlerIdle } from "./wait-for-idle";

const HEALTH_ALARM = "douban-exporter-health";
const repositoryPromise = ExporterRepository.open();

async function commandDependencies() {
  const repository = await repositoryPromise;
  return {
    ensureOffscreen: () => ensureOffscreenDocument(),
    closeOffscreen: () => closeOffscreenDocument(),
    sendToRuntime: (message: CrawlerCommand) => chrome.runtime.sendMessage(message),
    waitForCrawlerIdle: () =>
      waitForCrawlerIdle(
        () => repository.getJob(),
        (milliseconds) =>
          new Promise((resolve) => setTimeout(resolve, milliseconds)),
      ),
    resetTaskData: () => repository.resetTaskData(),
  };
}

chrome.action.onClicked.addListener(() => {
  void openOrFocusAppTab();
});

chrome.runtime.onInstalled.addListener((details) => {
  void (async () => {
    const repository = await repositoryPromise;
    if (details.reason === "update") {
      await recoverInterruptedJob(
        repository,
        new Date().toISOString(),
        "extension_reload",
      );
    }
    await chrome.alarms.create(HEALTH_ALARM, { periodInMinutes: 1 });
  })();
});

chrome.runtime.onStartup.addListener(() => {
  void repositoryPromise.then((repository) => recoverInterruptedJob(repository));
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== HEALTH_ALARM) {
    return;
  }
  void (async () => {
    const repository = await repositoryPromise;
    const job = await repository.getJob();
    if (!job || !isActiveJobState(job.state)) {
      return;
    }
    await ensureOffscreenDocument();
    await chrome.runtime.sendMessage({ type: "crawler_resume" });
  })();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isBackgroundCommand(message)) {
    return false;
  }
  void (async () => {
    try {
      const result = await handleBackgroundCommand(
        message,
        await commandDependencies(),
      );
      sendResponse(result);
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "未知后台错误",
      });
    }
  })();
  return true;
});
