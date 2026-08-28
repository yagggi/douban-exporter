import type { AppViewModel } from "./model";

export interface AppActionHandlers {
  start(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  exportCsv(): Promise<void>;
  chooseDirectory(): Promise<void>;
  useDefaultDirectory(): Promise<void>;
  reset(): Promise<void>;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function detail(label: string, value: string): HTMLElement {
  const row = element("div", "detail-row");
  row.append(element("dt", undefined, label), element("dd", undefined, value));
  return row;
}

function actionButton(
  action: keyof AppActionHandlers,
  label: string,
  enabled: boolean,
  handler: () => Promise<void>,
  primary = false,
): HTMLButtonElement {
  const button = element("button", primary ? "button primary" : "button", label);
  button.type = "button";
  button.dataset.action = action;
  button.disabled = !enabled;
  button.addEventListener("click", () => void handler());
  return button;
}

export function renderApp(
  root: HTMLElement,
  model: AppViewModel,
  handlers: AppActionHandlers,
): void {
  const header = element("header", "hero");
  header.append(
    element("p", "eyebrow", "本地、低频、可恢复"),
    element("h1", undefined, "豆瓣图书导出器"),
    element(
      "p",
      "subtitle",
      "导出读过、想读和在读的图书，不读取或上传 Cookie。",
    ),
  );

  const statusCard = element("section", "card status-card");
  const statusHeader = element("div", "section-heading");
  statusHeader.append(
    element("h2", undefined, "任务状态"),
    element("span", `status ${model.statusTone}`, model.statusText),
  );
  const progress = element("progress");
  progress.max = 100;
  progress.value = model.progressPercent;
  progress.setAttribute("aria-label", "详情抓取进度");
  const details = element("dl", "details-grid");
  details.append(
    detail("当前用户", model.accountText),
    detail("详情进度", model.progressText),
    detail("已保存记录", String(model.recordCount)),
    detail("豆瓣请求数", String(model.requestCount)),
    detail("当前页面", model.currentUrlText),
    detail("下次允许请求", model.nextRequestText),
  );
  statusCard.append(statusHeader, progress, details);

  const directoryCard = element("section", "card");
  directoryCard.append(
    element("h2", undefined, "保存位置"),
    element("p", "directory", model.directoryText),
  );
  const directoryActions = element("div", "actions secondary-actions");
  directoryActions.append(
    actionButton("chooseDirectory", "选择目录", true, handlers.chooseDirectory),
    actionButton(
      "useDefaultDirectory",
      "使用默认下载目录",
      true,
      handlers.useDefaultDirectory,
    ),
  );
  directoryCard.append(directoryActions);

  const noticeArea = element("div", "message-stack");
  if (model.noticeText) {
    noticeArea.append(element("p", "message notice", model.noticeText));
  }
  if (model.errorText) {
    const error = element("p", "message error", model.errorText);
    error.setAttribute("role", "alert");
    noticeArea.append(error);
  }
  if (model.exportWillBePartial) {
    noticeArea.append(
      element("p", "message warning", "当前导出会标记为 partial，数据尚不完整。"),
    );
  }

  const actions = element("section", "card action-card");
  actions.append(element("h2", undefined, "操作"));
  const buttons = element("div", "actions");
  buttons.append(
    actionButton("start", "开始导出任务", model.canStart, handlers.start, true),
    actionButton("pause", "暂停", model.canPause, handlers.pause),
    actionButton("resume", "继续", model.canResume, handlers.resume, true),
    actionButton(
      "exportCsv",
      model.exportWillBePartial ? "导出 partial CSV" : "导出 CSV",
      model.canExport,
      handlers.exportCsv,
    ),
    actionButton("reset", "重新开始", model.canReset, handlers.reset),
  );
  actions.append(buttons);

  const footer = element(
    "footer",
    undefined,
    "遇到验证码、403 或 429 时扩展会停止请求，请稍后手动继续。",
  );
  root.replaceChildren(header, noticeArea, statusCard, directoryCard, actions, footer);
}

