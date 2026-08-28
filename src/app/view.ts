import type { BookStatus } from "../domain/types";
import type {
  BookBrowserViewModel,
  BookItemViewModel,
  PaginationItem,
} from "./book-browser";
import type { AppViewModel } from "./model";

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

function setText(node: Node, value: string): void {
  if (node.textContent !== value) node.textContent = value;
}

function setClassName(node: HTMLElement, value: string): void {
  if (node.className !== value) node.className = value;
}

function setHidden(node: HTMLElement, hidden: boolean): void {
  if (node.hidden !== hidden) node.hidden = hidden;
}

function syncChildren(parent: HTMLElement, desired: readonly Node[]): void {
  for (const [index, node] of desired.entries()) {
    const current = parent.childNodes[index] ?? null;
    if (current !== node) parent.insertBefore(node, current);
  }
  while (parent.childNodes.length > desired.length) {
    parent.lastChild?.remove();
  }
}

interface DetailView {
  root: HTMLElement;
  value: HTMLElement;
}

function createDetail(label: string): DetailView {
  const root = element("div", "detail-row");
  const value = element("dd");
  root.append(element("dt", undefined, label), value);
  return { root, value };
}

class ActionButtonView {
  readonly root: HTMLButtonElement;

  constructor(
    action: keyof AppActionHandlers,
    primary: boolean,
    onClick: () => void | Promise<void>,
  ) {
    this.root = element("button", primary ? "button primary" : "button");
    this.root.type = "button";
    this.root.dataset.action = action;
    this.root.addEventListener("click", () => void onClick());
  }

  update(label: string, enabled: boolean): void {
    setText(this.root, label);
    this.root.disabled = !enabled;
  }
}

class BookCardView {
  readonly root = element("li", "book-item");
  private readonly title = element("a", "book-title");
  private readonly badge = element("span", "detail-badge");
  private readonly listMeta = element("p", "book-list-meta");
  private readonly review = element("blockquote", "book-review");
  private readonly reviewText = element("p");
  private readonly metadata = element("dl", "book-metadata");
  private readonly pendingCopy = element(
    "p",
    "pending-copy",
    "列表信息已保存，等待访问详情页补全。",
  );
  private readonly author = createDetail("作者");
  private readonly publisher = createDetail("出版社");
  private readonly publishedAt = createDetail("出版时间");
  private readonly isbn = createDetail("ISBN");
  private readonly pages = createDetail("页数");

  constructor(subjectId: string) {
    this.root.dataset.subjectId = subjectId;
    this.title.target = "_blank";
    this.title.rel = "noreferrer";
    const heading = element("div", "book-heading");
    heading.append(this.title, this.badge);
    this.review.append(
      element("span", "book-review-label", "我的短评"),
      this.reviewText,
    );
    this.metadata.append(
      this.author.root,
      this.publisher.root,
      this.publishedAt.root,
      this.isbn.root,
      this.pages.root,
    );
    this.root.append(
      heading,
      this.listMeta,
      this.review,
      this.metadata,
      this.pendingCopy,
    );
  }

  update(book: BookItemViewModel): void {
    setText(this.title, book.title);
    if (this.title.href !== book.subjectUrl) this.title.href = book.subjectUrl;
    setClassName(this.badge, `detail-badge ${book.detailState}`);
    setText(this.badge, book.detailStateText);
    setText(
      this.listMeta,
      `${book.statusLabel} · ${book.markedAt} · ${book.ratingText}`,
    );
    setHidden(this.review, !book.hasShortReview);
    if (book.hasShortReview) setText(this.reviewText, book.shortReviewText);

    const completed = book.detailState === "complete";
    setHidden(this.metadata, !completed);
    setHidden(this.pendingCopy, completed);
    if (completed) {
      setText(this.author.value, book.authorsText);
      setText(this.publisher.value, book.publisherText);
      setText(this.publishedAt.value, book.publishedAtText);
      setText(this.isbn.value, book.isbnText);
      setText(this.pages.value, book.pagesText);
    }
  }
}

class BookBrowserView {
  readonly root = element("section", "card books-card");
  private readonly tabs = element("div", "book-tabs");
  private readonly empty = element("p", "empty-books");
  private readonly list = element("ul", "book-list");
  private readonly pagination = element("div", "pagination");
  private readonly pageNumbers = element("div", "page-numbers");
  private readonly previous: ActionButtonView;
  private readonly next: ActionButtonView;
  private readonly tabNodes = new Map<BookStatus, HTMLButtonElement>();
  private readonly bookNodes = new Map<string, BookCardView>();
  private readonly pageNodes = new Map<number, HTMLButtonElement>();
  private readonly ellipsisNodes = new Map<string, HTMLElement>();

  constructor(private readonly handlers: () => AppActionHandlers) {
    this.root.append(
      element("h2", undefined, "已获取的书籍"),
      element(
        "p",
        "books-help",
        "列表数据保存后立即出现；详情补全状态会随抓取进度更新。",
      ),
    );
    this.tabs.setAttribute("role", "tablist");
    this.pageNumbers.setAttribute("aria-label", "书籍列表页码");
    this.previous = new ActionButtonView(
      "previousBookPage",
      false,
      () => this.handlers().previousBookPage(),
    );
    this.next = new ActionButtonView(
      "nextBookPage",
      false,
      () => this.handlers().nextBookPage(),
    );
    this.pagination.append(
      this.previous.root,
      this.pageNumbers,
      this.next.root,
    );
    this.root.append(this.tabs, this.empty, this.list, this.pagination);
  }

  private tab(status: BookStatus): HTMLButtonElement {
    const existing = this.tabNodes.get(status);
    if (existing) return existing;
    const button = element("button", "book-tab");
    button.type = "button";
    button.dataset.status = status;
    button.setAttribute("role", "tab");
    button.addEventListener("click", () =>
      this.handlers().selectBookStatus(status),
    );
    this.tabNodes.set(status, button);
    return button;
  }

  private book(model: BookItemViewModel): BookCardView {
    const existing = this.bookNodes.get(model.subjectId);
    if (existing) return existing;
    const book = new BookCardView(model.subjectId);
    this.bookNodes.set(model.subjectId, book);
    return book;
  }

  private page(item: Extract<PaginationItem, { kind: "page" }>): HTMLElement {
    let button = this.pageNodes.get(item.page);
    if (!button) {
      button = element("button", "page-number", String(item.page));
      button.type = "button";
      button.dataset.page = String(item.page);
      button.setAttribute("aria-label", `跳转到第 ${item.page} 页`);
      button.addEventListener("click", () =>
        this.handlers().goToBookPage(item.page),
      );
      this.pageNodes.set(item.page, button);
    }
    setClassName(button, item.selected ? "page-number selected" : "page-number");
    if (item.selected) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
    return button;
  }

  private ellipsis(item: Extract<PaginationItem, { kind: "ellipsis" }>): HTMLElement {
    let node = this.ellipsisNodes.get(item.key);
    if (!node) {
      node = element("span", "pagination-ellipsis", "…");
      this.ellipsisNodes.set(item.key, node);
    }
    return node;
  }

  update(model: BookBrowserViewModel): void {
    const tabs = model.tabs.map((tab) => {
      const button = this.tab(tab.status);
      setText(button, `${tab.label} ${tab.count}`);
      setClassName(button, tab.selected ? "book-tab selected" : "book-tab");
      button.setAttribute("aria-selected", String(tab.selected));
      return button;
    });
    syncChildren(this.tabs, tabs);

    const cards = model.items.map((item) => {
      const card = this.book(item);
      card.update(item);
      return card.root;
    });
    syncChildren(this.list, cards);
    setHidden(this.list, cards.length === 0);
    setText(this.empty, model.emptyText);
    setHidden(this.empty, cards.length !== 0);

    const pageItems = model.paginationItems.map((item) =>
      item.kind === "page" ? this.page(item) : this.ellipsis(item),
    );
    syncChildren(this.pageNumbers, pageItems);
    this.previous.update("上一页", model.canPrevious);
    this.next.update("下一页", model.canNext);
  }
}

class AppView {
  private handlers: AppActionHandlers;
  private readonly status = element("span", "status");
  private readonly progress = element("progress");
  private readonly progressCaption = element("p", "progress-caption");
  private readonly runState = createDetail("运行状态");
  private readonly account = createDetail("当前用户");
  private readonly detailProgress = createDetail("详情进度");
  private readonly recordCount = createDetail("已保存记录");
  private readonly requestCount = createDetail("豆瓣请求数");
  private readonly warningCount = createDetail("警告数");
  private readonly failureCount = createDetail("失败数");
  private readonly currentUrl = createDetail("当前页面");
  private readonly nextRequest = createDetail("下次允许请求");
  private readonly directory = element("p", "directory");
  private readonly notice = element("p", "message notice");
  private readonly error = element("p", "message error");
  private readonly partial = element(
    "p",
    "message warning",
    "当前导出会标记为 partial，数据尚不完整。",
  );
  private readonly start: ActionButtonView;
  private readonly pause: ActionButtonView;
  private readonly resume: ActionButtonView;
  private readonly exportCsv: ActionButtonView;
  private readonly reset: ActionButtonView;
  private readonly bookBrowser: BookBrowserView;

  constructor(root: HTMLElement, handlers: AppActionHandlers) {
    this.handlers = handlers;
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

    const noticeArea = element("div", "message-stack");
    this.error.setAttribute("role", "alert");
    noticeArea.append(this.notice, this.error, this.partial);

    const statusCard = element("section", "card status-card");
    const statusHeader = element("div", "section-heading");
    statusHeader.append(element("h2", undefined, "任务状态"), this.status);
    this.progress.max = 100;
    this.progress.setAttribute("aria-label", "详情抓取进度");
    const details = element("dl", "details-grid");
    details.append(
      this.runState.root,
      this.account.root,
      this.detailProgress.root,
      this.recordCount.root,
      this.requestCount.root,
      this.warningCount.root,
      this.failureCount.root,
      this.currentUrl.root,
      this.nextRequest.root,
    );
    statusCard.append(
      statusHeader,
      this.progress,
      this.progressCaption,
      details,
    );

    const directoryCard = element("section", "card");
    directoryCard.append(element("h2", undefined, "保存位置"), this.directory);
    const directoryActions = element("div", "actions secondary-actions");
    const chooseDirectory = new ActionButtonView(
      "chooseDirectory",
      false,
      () => this.handlers.chooseDirectory(),
    );
    const useDefaultDirectory = new ActionButtonView(
      "useDefaultDirectory",
      false,
      () => this.handlers.useDefaultDirectory(),
    );
    chooseDirectory.update("选择目录", true);
    useDefaultDirectory.update("使用默认下载目录", true);
    directoryActions.append(
      chooseDirectory.root,
      useDefaultDirectory.root,
    );
    directoryCard.append(directoryActions);

    const actions = element("section", "card action-card");
    actions.append(element("h2", undefined, "操作"));
    const buttons = element("div", "actions");
    this.start = new ActionButtonView("start", true, () => this.handlers.start());
    this.pause = new ActionButtonView("pause", false, () => this.handlers.pause());
    this.resume = new ActionButtonView("resume", true, () => this.handlers.resume());
    this.exportCsv = new ActionButtonView(
      "exportCsv",
      false,
      () => this.handlers.exportCsv(),
    );
    this.reset = new ActionButtonView("reset", false, () => this.handlers.reset());
    buttons.append(
      this.start.root,
      this.pause.root,
      this.resume.root,
      this.exportCsv.root,
      this.reset.root,
    );
    actions.append(buttons);

    this.bookBrowser = new BookBrowserView(() => this.handlers);
    const footer = element(
      "footer",
      undefined,
      "遇到验证码、403 或 429 时扩展会停止请求，请稍后手动继续。",
    );
    root.replaceChildren(
      header,
      noticeArea,
      statusCard,
      directoryCard,
      actions,
      this.bookBrowser.root,
      footer,
    );
  }

  setHandlers(handlers: AppActionHandlers): void {
    this.handlers = handlers;
  }

  update(model: AppViewModel): void {
    setText(this.status, model.statusText);
    setClassName(this.status, `status ${model.statusTone}`);
    if (model.progressMode === "determinate") {
      this.progress.value = model.progressPercent;
    } else {
      this.progress.removeAttribute("value");
    }
    setText(this.progressCaption, model.progressCaption);
    setText(this.runState.value, model.runStateText);
    setText(this.account.value, model.accountText);
    setText(this.detailProgress.value, model.progressText);
    setText(this.recordCount.value, String(model.recordCount));
    setText(this.requestCount.value, String(model.requestCount));
    setText(this.warningCount.value, String(model.warningCount));
    setText(this.failureCount.value, String(model.failureCount));
    setText(this.currentUrl.value, model.currentUrlText);
    setText(this.nextRequest.value, model.nextRequestText);
    setText(this.directory, model.directoryText);

    setText(this.notice, model.noticeText);
    setHidden(this.notice, model.noticeText === "");
    setText(this.error, model.errorText);
    setHidden(this.error, model.errorText === "");
    setHidden(this.partial, !model.exportWillBePartial);

    this.start.update("开始导出任务", model.canStart);
    this.pause.update("暂停", model.canPause);
    this.resume.update("继续", model.canResume);
    this.exportCsv.update(
      model.exportWillBePartial ? "导出 partial CSV" : "导出 CSV",
      model.canExport,
    );
    this.reset.update("重新开始", model.canReset);

    setHidden(this.bookBrowser.root, model.bookBrowser === undefined);
    if (model.bookBrowser) this.bookBrowser.update(model.bookBrowser);
  }
}

const views = new WeakMap<HTMLElement, AppView>();

export function renderApp(
  root: HTMLElement,
  model: AppViewModel,
  handlers: AppActionHandlers,
): void {
  let view = views.get(root);
  if (!view) {
    view = new AppView(root, handlers);
    views.set(root, view);
  } else {
    view.setHandlers(handlers);
  }
  view.update(model);
}
