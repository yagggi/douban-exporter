import type { AppViewModel } from "./model";
import type { BookStatus } from "../domain/types";
import type { BookBrowserViewModel } from "./book-browser";

export interface AppActionHandlers {
  start(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  exportCsv(): Promise<void>;
  chooseDirectory(): Promise<void>;
  useDefaultDirectory(): Promise<void>;
  reset(): Promise<void>;
  selectBookStatus(status: BookStatus): void;
  previousBookPage(): void;
  nextBookPage(): void;
  goToBookPage(page: number): void;
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

function renderBookBrowser(
  model: BookBrowserViewModel,
  handlers: AppActionHandlers,
): HTMLElement {
  const card = element("section", "card books-card");
  card.append(
    element("h2", undefined, "已获取的书籍"),
    element(
      "p",
      "books-help",
      "列表数据保存后立即出现；详情补全状态会随抓取进度更新。",
    ),
  );

  const tabs = element("div", "book-tabs");
  tabs.setAttribute("role", "tablist");
  for (const tab of model.tabs) {
    const button = element(
      "button",
      tab.selected ? "book-tab selected" : "book-tab",
      `${tab.label} ${tab.count}`,
    );
    button.type = "button";
    button.dataset.status = tab.status;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(tab.selected));
    button.addEventListener("click", () => handlers.selectBookStatus(tab.status));
    tabs.append(button);
  }
  card.append(tabs);

  if (model.items.length === 0) {
    card.append(element("p", "empty-books", model.emptyText));
  } else {
    const list = element("ul", "book-list");
    for (const book of model.items) {
      const item = element("li", "book-item");
      const heading = element("div", "book-heading");
      const title = element("a", "book-title", book.title);
      title.href = book.subjectUrl;
      title.target = "_blank";
      title.rel = "noreferrer";
      heading.append(
        title,
        element(
          "span",
          `detail-badge ${book.detailState}`,
          book.detailStateText,
        ),
      );
      item.append(
        heading,
        element(
          "p",
          "book-list-meta",
          `${book.statusLabel} · ${book.markedAt} · ${book.ratingText}`,
        ),
      );
      if (book.detailState === "complete") {
        const metadata = element("dl", "book-metadata");
        metadata.append(
          detail("作者", book.authorsText),
          detail("出版社", book.publisherText),
          detail("出版时间", book.publishedAtText),
          detail("ISBN", book.isbnText),
          detail("页数", book.pagesText),
        );
        item.append(metadata);
      } else {
        item.append(
          element("p", "pending-copy", "列表信息已保存，等待访问详情页补全。"),
        );
      }
      list.append(item);
    }
    card.append(list);
  }

  const pagination = element("div", "pagination");
  const pageNumbers = element("div", "page-numbers");
  pageNumbers.setAttribute("aria-label", "书籍列表页码");
  for (const item of model.paginationItems) {
    if (item.kind === "ellipsis") {
      pageNumbers.append(element("span", "pagination-ellipsis", "…"));
      continue;
    }
    const pageButton = element(
      "button",
      item.selected ? "page-number selected" : "page-number",
      String(item.page),
    );
    pageButton.type = "button";
    pageButton.dataset.page = String(item.page);
    pageButton.setAttribute("aria-label", `跳转到第 ${item.page} 页`);
    if (item.selected) {
      pageButton.setAttribute("aria-current", "page");
    }
    pageButton.addEventListener("click", () => handlers.goToBookPage(item.page));
    pageNumbers.append(pageButton);
  }
  pagination.append(
    actionButton(
      "previousBookPage",
      "上一页",
      model.canPrevious,
      async () => handlers.previousBookPage(),
    ),
    pageNumbers,
    actionButton(
      "nextBookPage",
      "下一页",
      model.canNext,
      async () => handlers.nextBookPage(),
    ),
  );
  card.append(pagination);
  return card;
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
  if (model.progressMode === "determinate") {
    progress.value = model.progressPercent;
  }
  progress.setAttribute("aria-label", "详情抓取进度");
  const progressCaption = element(
    "p",
    "progress-caption",
    model.progressCaption,
  );
  const details = element("dl", "details-grid");
  details.append(
    detail("运行状态", model.runStateText),
    detail("当前用户", model.accountText),
    detail("详情进度", model.progressText),
    detail("已保存记录", String(model.recordCount)),
    detail("豆瓣请求数", String(model.requestCount)),
    detail("警告数", String(model.warningCount)),
    detail("失败数", String(model.failureCount)),
    detail("当前页面", model.currentUrlText),
    detail("下次允许请求", model.nextRequestText),
  );
  statusCard.append(statusHeader, progress, progressCaption, details);

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
  const bookBrowser = model.bookBrowser
    ? renderBookBrowser(model.bookBrowser, handlers)
    : null;
  root.replaceChildren(
    header,
    noticeArea,
    statusCard,
    directoryCard,
    actions,
    ...(bookBrowser ? [bookBrowser] : []),
    footer,
  );
}
