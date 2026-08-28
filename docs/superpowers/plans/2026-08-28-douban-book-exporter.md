# 豆瓣图书导出 Chrome 扩展 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个使用当前 Chrome 豆瓣登录态、保守限速、可断点恢复并将个人图书记录导出为 CSV 的 Manifest V3 扩展。

**Architecture:** 管理页负责用户交互、目录授权和 CSV 写入；Service Worker 负责 Chrome 生命周期与离屏文档；离屏文档负责单并发抓取和 DOM 解析。任务、游标、记录和目录句柄以 IndexedDB 为事实来源，所有核心解析、状态、限速和 CSV 逻辑保持为可单元测试的纯模块。

**Tech Stack:** TypeScript 5、Vite 7、Manifest V3、Vitest、jsdom、fake-indexeddb、idb。

**Spec:** `docs/superpowers/specs/2026-08-28-douban-book-exporter-design.md`

## Global Constraints

- 最低支持 Chrome 116。
- 只申请 `https://*.douban.com/*` 主机权限以及 `downloads`、`offscreen`、`alarms` 权限。
- 不申请 `cookies` 或 `storage` 权限，不读取或记录 Cookie 值。
- 豆瓣请求始终单并发；正常间隔随机 4–8 秒，每 20 次额外冷却 45–90 秒。
- 403、429、验证码、登录失效和页面结构异常时停止自动请求。
- 每个列表页或详情项完成后，记录和游标在同一 IndexedDB 事务中提交。
- CSV 固定为设计文档定义的 14 列，使用 UTF-8 BOM 和 CRLF。
- 所有生产代码均包含在扩展包内，不加载远程脚本、字体或样式。
- 每个行为改动遵循 RED → GREEN → REFACTOR；提交前运行对应测试。

---

### Task 1: 建立可构建、可测试的 Manifest V3 骨架

**Files:**

- Create: `.gitignore`
- Create: `package.json`
- Create: `package-lock.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `public/manifest.json`
- Create: `app.html`
- Create: `offscreen.html`
- Create: `src/app/main.ts`
- Create: `src/app/styles.css`
- Create: `src/background/service-worker.ts`
- Create: `src/offscreen/main.ts`
- Create: `src/types/file-system-access.d.ts`
- Create: `tests/manifest.test.ts`

**Interfaces:**

- Produces: `npm test`, `npm run typecheck`, `npm run build`。
- Produces: `dist/manifest.json`，其中后台入口固定为 `assets/service-worker.js`。
- Produces: `app.html` 和 `offscreen.html` 两个扩展页面入口。

- [ ] **Step 1: 创建测试与构建工具配置**

`package.json` 使用以下脚本和依赖边界：

```json
{
  "name": "douban-book-exporter",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "idb": "^8.0.3"
  },
  "devDependencies": {
    "@types/chrome": "^0.1.0",
    "@types/node": "^24.0.0",
    "fake-indexeddb": "^6.2.2",
    "jsdom": "^26.1.0",
    "typescript": "^5.9.0",
    "vite": "^7.1.0",
    "vitest": "^3.2.0"
  }
}
```

`tsconfig.json` 启用 `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`，包含 `DOM`、`DOM.Iterable` 和 `WebWorker` lib，并将 `types` 设置为 `chrome`、`vitest/globals`、`node`。

- [ ] **Step 2: 安装锁定依赖**

Run: `npm install`

Expected: 生成 `package-lock.json`，命令退出码为 0。

- [ ] **Step 3: 编写失败的 manifest 合约测试**

```ts
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("extension manifest", () => {
  it("uses MV3 with only the approved permissions", async () => {
    const source = await readFile("public/manifest.json", "utf8");
    const manifest = JSON.parse(source) as {
      manifest_version: number;
      minimum_chrome_version: string;
      permissions: string[];
      host_permissions: string[];
      background: { service_worker: string; type: string };
    };

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.minimum_chrome_version).toBe("116");
    expect(manifest.permissions.sort()).toEqual(
      ["alarms", "downloads", "offscreen"].sort(),
    );
    expect(manifest.permissions).not.toContain("cookies");
    expect(manifest.permissions).not.toContain("storage");
    expect(manifest.host_permissions).toEqual(["https://*.douban.com/*"]);
    expect(manifest.background).toEqual({
      service_worker: "assets/service-worker.js",
      type: "module",
    });
  });
});
```

- [ ] **Step 4: 运行测试并确认因 manifest 缺失而失败**

Run: `npm test -- tests/manifest.test.ts`

Expected: FAIL，错误指向无法读取 `public/manifest.json`。

- [ ] **Step 5: 创建最小扩展骨架**

`public/manifest.json` 必须包含：

```json
{
  "manifest_version": 3,
  "name": "豆瓣图书导出器",
  "description": "将当前豆瓣账号标记的图书导出为 CSV。",
  "version": "0.1.0",
  "minimum_chrome_version": "116",
  "permissions": ["downloads", "offscreen", "alarms"],
  "host_permissions": ["https://*.douban.com/*"],
  "background": {
    "service_worker": "assets/service-worker.js",
    "type": "module"
  },
  "action": {
    "default_title": "打开豆瓣图书导出器"
  }
}
```

`vite.config.ts` 使用三个 Rollup 输入：`app.html`、`offscreen.html`、`src/background/service-worker.ts`，并把 entry 文件名固定为 `assets/[name].js`。两个 HTML 文件只加载各自的 TypeScript 入口，不包含内联脚本。

- [ ] **Step 6: 运行骨架验证**

Run: `npm test -- tests/manifest.test.ts && npm run typecheck && npm run build`

Expected: 测试 1 个通过；类型检查退出码 0；`dist/manifest.json`、`dist/app.html`、`dist/offscreen.html`、`dist/assets/service-worker.js` 存在。

- [ ] **Step 7: 提交骨架**

```bash
git add .gitignore package.json package-lock.json tsconfig.json vite.config.ts public app.html offscreen.html src tests/manifest.test.ts
git commit -m "build: 初始化 Chrome 扩展工程"
```

---

### Task 2: 定义任务状态、记录模型和限速策略

**Files:**

- Create: `src/domain/types.ts`
- Create: `src/domain/job-state.ts`
- Create: `src/domain/rate-policy.ts`
- Create: `tests/support/factories.ts`
- Create: `tests/domain/job-state.test.ts`
- Create: `tests/domain/rate-policy.test.ts`

**Interfaces:**

- Produces: `JobState`、`ActiveJobState`、`BookStatus`、`BookRecord`、`ExportJob`。
- Produces: `pauseJob(job, reason)`、`resumeJob(job)`、`blockJob(job, state, error)`、`completeJob(job)`。
- Produces: `normalDelayMs(requestCount, random)`、`retryDelayMs(attempt)`。

- [ ] **Step 1: 编写状态机失败测试**

```ts
import { describe, expect, it } from "vitest";

import { pauseJob, resumeJob } from "../../src/domain/job-state";
import { makeJob } from "../support/factories";

describe("job state", () => {
  it("remembers the active state when pausing and resumes it", () => {
    const running = makeJob({ state: "discovering_lists" });
    const paused = pauseJob(running, "user");

    expect(paused.state).toBe("paused");
    expect(paused.resumeState).toBe("discovering_lists");
    expect(resumeJob(paused).state).toBe("discovering_lists");
  });

  it("rejects resuming a completed job", () => {
    const completed = makeJob({ state: "completed", resumeState: null });
    expect(() => resumeJob(completed)).toThrow("任务已完成，不能继续");
  });
});
```

同时创建 `tests/support/factories.ts`。它导出 `makeJob(overrides)`、`makeListRecord(overrides)` 和 `makeBookRecord(overrides)`；三个函数都返回字段完整、时间戳固定的对象，后续测试只覆盖与场景相关的字段。

- [ ] **Step 2: 运行状态测试并确认失败**

Run: `npm test -- tests/domain/job-state.test.ts`

Expected: FAIL，模块 `src/domain/job-state.ts` 不存在。

- [ ] **Step 3: 实现精确类型和状态转换**

`JobState` 必须是：

```ts
export type ActiveJobState =
  | "checking_auth"
  | "discovering_lists"
  | "enriching_details";

export type BlockedJobState =
  | "auth_required"
  | "captcha_required"
  | "rate_limited"
  | "parse_error"
  | "failed";

export type JobState =
  | "idle"
  | ActiveJobState
  | "paused"
  | BlockedJobState
  | "completed";
```

`BookStatus` 为 `collect | wish | do`，通过 `BOOK_STATUS_LABELS` 映射为中文。`BookRecord` 包含设计文档 14 列所需字段，以及 `subjectId`、`detailStatus`、`listSeenAt`、`warnings`。`ExportJob` 必须包含三个列表游标、请求计数、详情计数、重试信息、`nextAllowedAt`、`resumeState` 和 `lastError`。

- [ ] **Step 4: 运行状态测试并确认通过**

Run: `npm test -- tests/domain/job-state.test.ts`

Expected: PASS。

- [ ] **Step 5: 编写限速失败测试**

```ts
import { describe, expect, it } from "vitest";

import { normalDelayMs, retryDelayMs } from "../../src/domain/rate-policy";

describe("rate policy", () => {
  it("adds the normal jitter and the twentieth-request cooldown", () => {
    expect(normalDelayMs(1, () => 0)).toBe(4_000);
    expect(normalDelayMs(1, () => 1)).toBe(8_000);
    expect(normalDelayMs(20, () => 0)).toBe(49_000);
    expect(normalDelayMs(20, () => 1)).toBe(98_000);
  });

  it("uses the frozen retry schedule", () => {
    expect([1, 2, 3].map(retryDelayMs)).toEqual([30_000, 120_000, 600_000]);
    expect(() => retryDelayMs(4)).toThrow("重试次数超出上限");
  });
});
```

- [ ] **Step 6: 运行限速测试并确认失败**

Run: `npm test -- tests/domain/rate-policy.test.ts`

Expected: FAIL，模块 `src/domain/rate-policy.ts` 不存在。

- [ ] **Step 7: 实现冻结的限速策略**

`normalDelayMs` 将 `random()` 限制在 `0..1`，把正常抖动线性映射到 4–8 秒；请求数为 20 的倍数时，再加上映射到 45–90 秒的冷却。`retryDelayMs` 只接受 1、2、3。

- [ ] **Step 8: 运行领域测试和类型检查**

Run: `npm test -- tests/domain && npm run typecheck`

Expected: 全部通过。

- [ ] **Step 9: 提交领域模型**

```bash
git add src/domain tests/domain tests/support/factories.ts
git commit -m "feat: 定义导出任务状态与限速策略"
```

---

### Task 3: 实现豆瓣页面分类和 HTML 解析器

**Files:**

- Create: `src/parsers/text.ts`
- Create: `src/parsers/page-classifier.ts`
- Create: `src/parsers/list-page.ts`
- Create: `src/parsers/detail-page.ts`
- Create: `tests/fixtures/list-collect.html`
- Create: `tests/fixtures/list-wish-empty.html`
- Create: `tests/fixtures/detail-complete.html`
- Create: `tests/fixtures/detail-missing-fields.html`
- Create: `tests/fixtures/captcha.html`
- Create: `tests/parsers/page-classifier.test.ts`
- Create: `tests/parsers/list-page.test.ts`
- Create: `tests/parsers/detail-page.test.ts`

**Interfaces:**

- Produces: `classifyPage({ status, finalUrl, html }): PageClassification`。
- Produces: `parseListPage(document, status, fetchedAt): ParsedListPage`。
- Produces: `parseDetailPage(document, expectedSubjectId): ParsedBookDetails`。
- Produces: `normalizeInlineText`、`normalizeMultilineText`、`parseHtml`。

- [ ] **Step 1: 编写页面分类失败测试**

```ts
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { classifyPage } from "../../src/parsers/page-classifier";

describe("classifyPage", () => {
  it("stops on a Douban captcha page", async () => {
    const html = await readFile("tests/fixtures/captcha.html", "utf8");
    expect(
      classifyPage({ status: 200, finalUrl: "https://sec.douban.com/", html }),
    ).toEqual({ kind: "captcha_required", diagnostic: "captcha" });
  });

  it("classifies status codes without retrying them", () => {
    expect(classifyPage({ status: 403, finalUrl: "https://book.douban.com/", html: "" }).kind).toBe("captcha_required");
    expect(classifyPage({ status: 429, finalUrl: "https://book.douban.com/", html: "" }).kind).toBe("rate_limited");
  });
});
```

- [ ] **Step 2: 运行分类测试并确认失败**

Run: `npm test -- tests/parsers/page-classifier.test.ts`

Expected: FAIL，分类模块不存在。

- [ ] **Step 3: 实现页面分类器**

分类优先级固定为：HTTP 429、HTTP 403、登录 URL/登录表单、`sec.douban.com` 或验证码关键词、HTTP 5xx、正常页面。分类结果不能包含完整 HTML 或响应头，只返回有限诊断字符串。

- [ ] **Step 4: 编写列表解析失败测试**

```ts
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { parseHtml } from "../../src/parsers/text";
import { parseListPage } from "../../src/parsers/list-page";

describe("parseListPage", () => {
  it("extracts status, rating, comment and fallback review time", async () => {
    const html = await readFile("tests/fixtures/list-collect.html", "utf8");
    const result = parseListPage(parseHtml(html), "collect", "2026-08-28T00:00:00.000Z");

    expect(result.records[0]).toMatchObject({
      subjectId: "1036274",
      status: "collect",
      title: "夏洛的网",
      markedAt: "2024-05-06",
      myRating: 5,
      shortReview: "一个蜘蛛和小猪的故事。",
      reviewedAt: "2024-05-06",
      reviewTimeSource: "标记时间回退",
    });
    expect(result.nextUrl).toBe("https://book.douban.com/people/example/collect?start=15");
  });

  it("recognizes an explicitly empty list", async () => {
    const html = await readFile("tests/fixtures/list-wish-empty.html", "utf8");
    expect(parseListPage(parseHtml(html), "wish", "2026-08-28T00:00:00.000Z")).toEqual({
      records: [],
      nextUrl: null,
      explicitlyEmpty: true,
    });
  });
});
```

- [ ] **Step 5: 运行列表测试并确认失败**

Run: `npm test -- tests/parsers/list-page.test.ts`

Expected: FAIL，列表解析模块不存在。

- [ ] **Step 6: 实现列表解析器**

解析器以 `li.item` 为首选条目选择器，并支持 `[data-subject-id]` 备用选择器；详情链接必须匹配 `/subject/(\d+)/`。评分从 `rating1-t` 到 `rating5-t` 类名提取。无条目时，只有页面存在明确空列表文案或状态总数为 0 才返回 `explicitlyEmpty: true`，否则抛出 `PageStructureError`。

- [ ] **Step 7: 编写详情解析失败测试**

```ts
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { parseDetailPage } from "../../src/parsers/detail-page";
import { parseHtml } from "../../src/parsers/text";

describe("parseDetailPage", () => {
  it("extracts the required publication fields and the longest intro", async () => {
    const html = await readFile("tests/fixtures/detail-complete.html", "utf8");
    expect(parseDetailPage(parseHtml(html), "1036274")).toEqual({
      title: "夏洛的网",
      isbn: "9787532733415",
      pages: "176",
      authors: ["[美] E.B.怀特", "[美国] 埃尔温·布鲁克斯·怀特"],
      publisher: "上海译文出版社",
      publishedAt: "2004-5",
      introduction: "一个蜘蛛和小猪的故事，写给孩子，也写给大人。\n\n第二段简介。",
    });
  });

  it("allows individual metadata fields to be absent", async () => {
    const html = await readFile("tests/fixtures/detail-missing-fields.html", "utf8");
    const result = parseDetailPage(parseHtml(html), "9999999");
    expect(result).toMatchObject({ isbn: "", pages: "", publisher: "", publishedAt: "" });
  });
});
```

- [ ] **Step 8: 运行详情测试并确认失败**

Run: `npm test -- tests/parsers/detail-page.test.ts`

Expected: FAIL，详情解析模块不存在。

- [ ] **Step 9: 实现详情解析器和文本规范化**

将 `#info` 中的 `<br>` 转成换行，再按中文标签 `作者`、`出版社`、`出版年`、`页数`、`ISBN` 解析。简介从 `#link-report .intro`、`.related_info .intro` 候选中选择规范化后最长的文本。详情页必须包含匹配 subject ID 的 canonical URL、页面 URL 元素或明确 `/subject/<id>/` 证据，否则抛出 `PageStructureError`。

- [ ] **Step 10: 运行全部解析测试和类型检查**

Run: `npm test -- tests/parsers && npm run typecheck`

Expected: 全部通过。

- [ ] **Step 11: 提交解析器**

```bash
git add src/parsers tests/fixtures tests/parsers
git commit -m "feat: 解析豆瓣图书列表与详情"
```

---

### Task 4: 建立 IndexedDB 仓储和原子断点

**Files:**

- Create: `src/storage/schema.ts`
- Create: `src/storage/repository.ts`
- Create: `tests/storage/repository.test.ts`

**Interfaces:**

- Produces: `openExporterDatabase(name?)`。
- Produces: `ExporterRepository`，方法为 `createJob`、`getJob`、`saveJob`、`commitListPage`、`nextPendingRecord`、`commitDetails`、`listRecordsSnapshot`、`saveDirectoryHandle`、`getDirectoryHandle`、`resetTaskData`。
- Consumes: `ExportJob`、`BookRecord`、`ParsedListRecord`、`ParsedBookDetails`。

- [ ] **Step 1: 编写原子提交失败测试**

```ts
import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import { ExporterRepository } from "../../src/storage/repository";
import { makeJob, makeListRecord } from "../support/factories";

describe("ExporterRepository", () => {
  let repository: ExporterRepository;

  beforeEach(async () => {
    repository = await ExporterRepository.open(`test-${crypto.randomUUID()}`);
    await repository.createJob(makeJob({ state: "discovering_lists" }));
  });

  it("commits discovered records and the next cursor together", async () => {
    await repository.commitListPage({
      jobId: "current",
      status: "collect",
      records: [makeListRecord({ subjectId: "1036274" })],
      nextUrl: "https://book.douban.com/next",
    });

    expect((await repository.getJob())?.listCursors.collect).toBe("https://book.douban.com/next");
    expect((await repository.listRecordsSnapshot()).map((record) => record.subjectId)).toEqual(["1036274"]);
  });

  it("keeps directory settings when resetting task data", async () => {
    const handle = { name: "Books" } as FileSystemDirectoryHandle;
    await repository.saveDirectoryHandle(handle);
    await repository.resetTaskData();
    expect((await repository.getDirectoryHandle())?.name).toBe("Books");
  });
});
```

- [ ] **Step 2: 运行仓储测试并确认失败**

Run: `npm test -- tests/storage/repository.test.ts`

Expected: FAIL，仓储模块不存在。

- [ ] **Step 3: 实现数据库 schema 与仓储**

数据库版本 1 包含 `jobs`、`records`、`settings` 三个 store。`jobs` 使用键 `current`；`records` 使用 `subjectId` key path，并建立 `detailStatus` 索引；`settings` 使用字符串键。`commitListPage` 和 `commitDetails` 均通过同一个 `readwrite` transaction 同时写记录和推进 job。

当同一 subject ID 再次出现时，比较 `listSeenAt`；新记录较晚则更新状态与列表字段，并向 `warnings` 添加 `状态在抓取期间发生冲突`。详情字段不因新的列表记录而丢失。

- [ ] **Step 4: 增加恢复和事务失败测试**

增加以下断言：

```ts
it("does not advance a detail cursor when the record write fails", async () => {
  const completeDetails = {
    title: "夏洛的网",
    isbn: "9787532733415",
    pages: "176",
    authors: ["[美] E.B.怀特"],
    publisher: "上海译文出版社",
    publishedAt: "2004-5",
    introduction: "一个蜘蛛和小猪的故事。",
  };
  repository.failNextCommitForTest(new Error("quota"));
  await expect(repository.commitDetails("1036274", completeDetails)).rejects.toThrow("quota");
  expect((await repository.getJob())?.detailsCompleted).toBe(0);
  expect((await repository.nextPendingRecord())?.subjectId).toBe("1036274");
});
```

测试故障入口只通过构造函数依赖 `beforeCommit?: () => void` 注入，不把测试专用方法放进生产类。

- [ ] **Step 5: 运行仓储测试和类型检查**

Run: `npm test -- tests/storage && npm run typecheck`

Expected: 全部通过。

- [ ] **Step 6: 提交仓储**

```bash
git add src/storage tests/storage tests/support/factories.ts
git commit -m "feat: 持久化抓取记录与恢复断点"
```

---

### Task 5: 实现 CSV 序列化、文件名和目录写入适配器

**Files:**

- Create: `src/export/csv.ts`
- Create: `src/export/filename.ts`
- Create: `src/export/directory.ts`
- Create: `tests/export/csv.test.ts`
- Create: `tests/export/filename.test.ts`
- Create: `tests/export/directory.test.ts`

**Interfaces:**

- Produces: `serializeBooksToCsv(records): string`。
- Produces: `buildExportFilename({ userName, partial, now }): string`。
- Produces: `DirectoryWriter`，方法为 `chooseDirectory`、`ensureWritePermission`、`writeTextFile`。
- `DirectoryWriter.chooseDirectory` 只能从用户点击处理器调用 `window.showDirectoryPicker({ mode: "readwrite" })`，取消选择时返回 `null`。

- [ ] **Step 1: 编写 CSV 失败测试**

```ts
import { describe, expect, it } from "vitest";

import { serializeBooksToCsv } from "../../src/export/csv";
import { makeBookRecord } from "../support/factories";

describe("serializeBooksToCsv", () => {
  it("writes the fixed header, BOM, CRLF and escaped multiline fields", () => {
    const csv = serializeBooksToCsv([
      makeBookRecord({
        title: "书名,第二版",
        introduction: "第一行\n第二行有\"引号\"",
        shortReview: "=HYPERLINK(\"https://bad.example\")",
      }),
    ]);

    expect(csv.startsWith("\uFEFF\"状态\",\"标题\",\"ISBN\"")).toBe(true);
    expect(csv).toContain("\r\n");
    expect(csv).toContain("\"书名,第二版\"");
    expect(csv).toContain("\"第一行\n第二行有\"\"引号\"\"\"");
    expect(csv).toContain("\"'=HYPERLINK(\"\"https://bad.example\"\")\"");
  });
});
```

- [ ] **Step 2: 运行 CSV 测试并确认失败**

Run: `npm test -- tests/export/csv.test.ts`

Expected: FAIL，CSV 模块不存在。

- [ ] **Step 3: 实现 CSV 序列化**

列名严格来自设计文档。每个值先做公式入口中和，再把 `"` 替换为 `""` 并整体包裹双引号。行用 `\r\n` 连接，文件开头只添加一个 BOM。

- [ ] **Step 4: 编写文件名与目录失败测试**

文件名测试固定时间为 `2026-08-28T09:07:06+09:00`，断言：

```ts
expect(buildExportFilename({
  userName: "豆/友:01",
  partial: true,
  now: new Date("2026-08-28T00:07:06.000Z"),
})).toBe("douban-books-豆_友_01-partial-20260828-090706.csv");
```

目录测试使用实现 `queryPermission`、`requestPermission`、`getFileHandle` 的真实 fake handle，断言拒绝权限时不调用 `createWritable`，授权后完整写入并关闭 writer。

- [ ] **Step 5: 运行文件名与目录测试并确认失败**

Run: `npm test -- tests/export/filename.test.ts tests/export/directory.test.ts`

Expected: FAIL，对应模块不存在。

- [ ] **Step 6: 实现文件名和目录写入**

文件名按本地时区格式化，非法字符 `/\\:*?"<>|` 和控制字符替换为 `_`。`DirectoryWriter.ensureWritePermission` 先查询 `readwrite`，只有从用户点击事件调用时才允许执行 `requestPermission`。写入使用 `getFileHandle(name, { create: true })`、`createWritable()`、`write(csv)`、`close()`。

- [ ] **Step 7: 运行导出测试和类型检查**

Run: `TZ=Asia/Tokyo npm test -- tests/export && npm run typecheck`

Expected: 全部通过。

- [ ] **Step 8: 提交导出模块**

```bash
git add src/export src/types/file-system-access.d.ts tests/export tests/support/factories.ts
git commit -m "feat: 生成安全 CSV 并支持自定义目录"
```

---

### Task 6: 实现登录探测、请求分类和可恢复抓取器

**Files:**

- Create: `src/crawler/routes.ts`
- Create: `src/crawler/fetch-page.ts`
- Create: `src/crawler/crawler.ts`
- Create: `src/crawler/sleep.ts`
- Create: `tests/support/crawler-harness.ts`
- Create: `tests/crawler/fetch-page.test.ts`
- Create: `tests/crawler/crawler.test.ts`

**Interfaces:**

- Produces: `buildInitialListUrls(userId): Record<BookStatus, string>`。
- Produces: `fetchPage(url, fetchImpl, timeoutMs): Promise<FetchedPage>`。
- Produces: `Crawler.run(): Promise<void>`、`Crawler.requestPause(): void`。
- Consumes: `ExporterRepository` 接口、页面解析器、`Clock`、`RandomSource`、`Sleep`、`StatusPublisher`。
- Test support: `makeCrawler(options)` 创建独立 fake IndexedDB、按 URL 查找的 `Map<string, FetchedPage>`、已请求 URL 数组和可观察 sleep；`authenticatedTwoBookScenario()` 返回身份页、三个列表页和两本详情页；`firstRequestReturns(status)` 返回只包含身份探测响应的页面映射。

- [ ] **Step 1: 编写请求适配器失败测试**

```ts
import { describe, expect, it, vi } from "vitest";

import { fetchPage } from "../../src/crawler/fetch-page";

describe("fetchPage", () => {
  it("uses the current browser credentials and returns the final URL", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.credentials).toBe("include");
      return new Response("<html>ok</html>", { status: 200 });
    });

    const result = await fetchPage("https://www.douban.com/mine/", fetchImpl, 30_000);
    expect(result.status).toBe(200);
    expect(result.html).toBe("<html>ok</html>");
  });
});
```

- [ ] **Step 2: 运行请求测试并确认失败**

Run: `npm test -- tests/crawler/fetch-page.test.ts`

Expected: FAIL，请求模块不存在。

- [ ] **Step 3: 实现请求适配器**

使用 `AbortController` 实现 30 秒超时；只接受 GET；设置 `credentials: "include"`、`redirect: "follow"`、`cache: "no-store"`。错误对象只包含 URL、错误类别和安全消息，不包含请求头。

- [ ] **Step 4: 编写抓取主循环失败测试**

测试使用内存仓储、真实解析器和按 URL 返回 fixture 的 fake fetch。核心场景：

```ts
it("discovers all lists, enriches each book once and completes", async () => {
  const crawler = makeCrawler({
    pages: authenticatedTwoBookScenario(),
    random: () => 0,
    sleep: async (ms) => observedSleeps.push(ms),
  });

  await crawler.run();

  expect((await crawler.repository.getJob())?.state).toBe("completed");
  expect(await crawler.repository.listRecordsSnapshot()).toHaveLength(2);
  expect(crawler.requestedUrls.filter((url) => url.includes("/subject/1036274/"))).toHaveLength(1);
  expect(observedSleeps).toContain(4_000);
});

it("commits the current item before honoring pause", async () => {
  const crawler = makeCrawler({ onFirstDetailResponse: (instance) => instance.requestPause() });
  await crawler.run();
  expect((await crawler.repository.getJob())?.state).toBe("paused");
  expect((await crawler.repository.listRecordsSnapshot())[0]?.detailStatus).toBe("complete");
});

it.each([
  [403, "captcha_required"],
  [429, "rate_limited"],
])("stops without issuing another request after HTTP %s", async (status, expectedState) => {
  const crawler = makeCrawler({ pages: firstRequestReturns(status) });
  await crawler.run();
  expect((await crawler.repository.getJob())?.state).toBe(expectedState);
  expect(crawler.requestedUrls).toHaveLength(1);
});
```

- [ ] **Step 5: 运行抓取测试并确认失败**

Run: `npm test -- tests/crawler/crawler.test.ts`

Expected: FAIL，抓取器模块不存在。

- [ ] **Step 6: 实现身份和列表阶段**

身份请求解析 `/people/<id>/`，并从页面标题或个人链接得到显示名。创建三个初始列表 URL。每个列表页在下一次请求前调用 `commitListPage`。分类为登录、验证码、429 或解析异常时调用 `blockJob` 并返回。

- [ ] **Step 7: 实现详情阶段、暂停和重试**

每轮通过 `nextPendingRecord()` 取得一条记录，请求并解析后调用 `commitDetails`。只有网络、超时和 5xx 使用 30 秒、2 分钟、10 分钟退避；三次后进入 `failed`。每次成功请求后持久化 `requestCount` 和 `nextAllowedAt`，再调用可注入的 `sleep`。暂停标志只在当前请求解析和提交后生效。

- [ ] **Step 8: 增加恢复和解析失败测试**

覆盖：已完成详情不再请求、冷却尚未结束时先 sleep、Chrome 重建后从下一列表 URL 继续、验证码 HTML 即使 HTTP 200 也停止、无法识别列表和详情结构进入 `parse_error`。

- [ ] **Step 9: 运行抓取测试、领域测试和类型检查**

Run: `npm test -- tests/crawler tests/domain tests/parsers tests/storage && npm run typecheck`

Expected: 全部通过。

- [ ] **Step 10: 提交抓取器**

```bash
git add src/crawler tests/crawler tests/support
git commit -m "feat: 实现限速且可恢复的豆瓣抓取器"
```

---

### Task 7: 接入离屏文档和 Service Worker 生命周期

**Files:**

- Create: `src/runtime/messages.ts`
- Create: `src/background/offscreen-manager.ts`
- Create: `src/background/startup.ts`
- Modify: `src/background/service-worker.ts`
- Modify: `src/offscreen/main.ts`
- Create: `tests/support/chrome-fakes.ts`
- Create: `tests/background/offscreen-manager.test.ts`
- Create: `tests/background/startup.test.ts`
- Create: `tests/offscreen/controller.test.ts`

**Interfaces:**

- Produces: `UiCommand` 联合类型：`get_snapshot`、`start_job`、`pause_job`、`resume_job`、`reset_job`。
- Produces: `CrawlerCommand` 联合类型：`crawler_start`、`crawler_pause`、`crawler_resume`。
- Produces: `ensureOffscreenDocument()`、`closeOffscreenDocument()`。
- Produces: `recoverInterruptedJob(repository)`。
- Test support: `makeOffscreenChrome({ contexts })` 返回带 Vitest spy 的 `runtime.getContexts`、`offscreen.createDocument` 和 `offscreen.closeDocument`；`makeRepositoryWithJob(overrides)` 创建独立 fake IndexedDB 并写入一条 current job。

- [ ] **Step 1: 编写离屏生命周期失败测试**

```ts
import { describe, expect, it, vi } from "vitest";

import { ensureOffscreenDocument } from "../../src/background/offscreen-manager";

describe("ensureOffscreenDocument", () => {
  it("creates exactly one DOM parser document", async () => {
    const chromeApi = makeOffscreenChrome({ contexts: [] });
    await Promise.all([
      ensureOffscreenDocument(chromeApi),
      ensureOffscreenDocument(chromeApi),
    ]);
    expect(chromeApi.offscreen.createDocument).toHaveBeenCalledTimes(1);
    expect(chromeApi.offscreen.createDocument).toHaveBeenCalledWith({
      url: "offscreen.html",
      reasons: ["DOM_PARSER"],
      justification: "解析豆瓣页面并运行可恢复的低频导出任务",
    });
  });
});
```

- [ ] **Step 2: 运行离屏测试并确认失败**

Run: `npm test -- tests/background/offscreen-manager.test.ts`

Expected: FAIL，离屏管理模块不存在。

- [ ] **Step 3: 实现离屏管理并处理并发创建**

使用模块内单个 `creatingPromise` 合并并发调用；通过 `chrome.runtime.getContexts` 查询 `OFFSCREEN_DOCUMENT`；创建失败后必须清空 promise，允许下一次重试。

- [ ] **Step 4: 编写启动恢复失败测试**

```ts
it.each(["checking_auth", "discovering_lists", "enriching_details"] as const)(
  "pauses interrupted %s work at browser startup",
  async (state) => {
    const repository = await makeRepositoryWithJob({ state });
    await recoverInterruptedJob(repository);
    expect((await repository.getJob())?.state).toBe("paused");
    expect((await repository.getJob())?.resumeState).toBe(state);
  },
);
```

- [ ] **Step 5: 实现消息合约、启动恢复和后台入口**

`service-worker.ts` 注册：

- `chrome.action.onClicked`：查找已打开的 `app.html`，存在则聚焦，不存在则创建。
- `chrome.runtime.onStartup`：调用 `recoverInterruptedJob`。
- 每分钟 `chrome.alarms` 健康检查：仅当 job 处于活动阶段时确保离屏文档存在。
- `chrome.runtime.onMessage`：验证消息 discriminant，转发开始/暂停/继续命令；未知消息返回结构化错误。

`offscreen/main.ts` 只创建一个 `CrawlerController`，重复 start/resume 不得并发运行两个 `Crawler.run()`。

- [ ] **Step 6: 增加离屏控制器并发和暂停测试**

断言连续发送两个 `crawler_start` 只调用一次 `run()`；`crawler_pause` 在 runner 存在时调用 `requestPause()`；runner 结束后关闭离屏文档请求只发送一次。

- [ ] **Step 7: 运行运行时测试、类型检查和构建**

Run: `npm test -- tests/background tests/offscreen && npm run typecheck && npm run build`

Expected: 全部通过，生产构建退出码 0。

- [ ] **Step 8: 提交 Chrome 生命周期接入**

```bash
git add src/runtime src/background src/offscreen tests/background tests/offscreen
git commit -m "feat: 接入离屏抓取与浏览器生命周期"
```

---

### Task 8: 完成管理页、目录选择和导出交互

**Files:**

- Create: `src/app/model.ts`
- Create: `src/app/view.ts`
- Create: `src/app/controller.ts`
- Modify: `src/app/main.ts`
- Modify: `src/app/styles.css`
- Modify: `app.html`
- Create: `tests/app/model.test.ts`
- Create: `tests/app/controller.test.ts`
- Create: `tests/app/view.test.ts`

**Interfaces:**

- Produces: `deriveViewModel(job, recordCount, directoryName): AppViewModel`。
- Produces: `AppController`，方法为 `initialize`、`start`、`pause`、`resume`、`reset`、`chooseDirectory`、`useDefaultDirectory`、`exportCsv`。
- Consumes: `ExporterRepository`、`DirectoryWriter`、`chrome.runtime.sendMessage`、`chrome.downloads.download`。

- [ ] **Step 1: 编写视图模型失败测试**

```ts
import { describe, expect, it } from "vitest";

import { deriveViewModel } from "../../src/app/model";
import { makeJob } from "../support/factories";

describe("deriveViewModel", () => {
  it("shows a precise captcha action without enabling start", () => {
    const model = deriveViewModel(
      makeJob({ state: "captcha_required", detailsCompleted: 12 }),
      20,
      null,
    );
    expect(model.statusText).toContain("验证码");
    expect(model.canResume).toBe(true);
    expect(model.canStart).toBe(false);
    expect(model.canExportPartial).toBe(true);
  });
});
```

- [ ] **Step 2: 运行视图模型测试并确认失败**

Run: `npm test -- tests/app/model.test.ts`

Expected: FAIL，管理页模型不存在。

- [ ] **Step 3: 实现视图模型和语义 HTML**

`app.html` 包含一个 `main`，分为账号、任务进度、保存位置、错误详情和操作区域。所有动态内容通过 `textContent` 或属性赋值，不使用不可信 `innerHTML`。按钮必须有可见中文文本和稳定 `data-action` 属性。

- [ ] **Step 4: 编写控制器失败测试**

覆盖：

- start 发送 `start_job`，成功后重新读取 snapshot。
- reset 调用注入的 `confirm`；取消时不写数据库。
- 默认导出从稳定 snapshot 生成 Blob URL，调用 `chrome.downloads.download({ saveAs: false })`，最终 revoke URL。
- 自定义目录权限拒绝时显示错误且不调用默认下载作为静默回退。
- 非 completed 状态导出时文件名包含 `partial`。

- [ ] **Step 5: 运行控制器测试并确认失败**

Run: `npm test -- tests/app/controller.test.ts tests/app/view.test.ts`

Expected: FAIL，控制器和视图模块不存在。

- [ ] **Step 6: 实现管理页控制器**

管理页每秒刷新一次只读 snapshot，并监听 `chrome.runtime.onMessage` 的 `job_changed` 事件即时刷新。开始、暂停、继续和重新开始期间禁用相应按钮，避免重复命令。`exportCsv` 先读取一次 records snapshot，再生成文件，确保导出内容稳定。

- [ ] **Step 7: 实现可读且响应式的样式**

使用系统字体、明确的 focus-visible、状态 badge、进度条和窄屏单列布局。颜色满足正文与背景至少 4.5:1 对比度；错误不能只靠颜色表达。禁止外部字体、图片和 CSS。

- [ ] **Step 8: 运行管理页测试、类型检查和构建**

Run: `npm test -- tests/app tests/export && npm run typecheck && npm run build`

Expected: 全部通过。

- [ ] **Step 9: 提交管理页**

```bash
git add app.html src/app src/export tests/app tests/export
git commit -m "feat: 完成导出管理页与文件保存"
```

---

### Task 9: 完成构建校验、文档和交付检查

**Files:**

- Create: `tests/build/validate-dist.test.ts`
- Create: `scripts/validate-dist.mjs`
- Modify: `package.json`
- Create: `README.md`

**Interfaces:**

- Produces: `validateDist(rootDirectory): Promise<string[]>` 和 `npm run validate:dist`。
- Produces: 本地构建和 `chrome://extensions` 加载说明。

- [ ] **Step 1: 编写构建产物校验失败测试**

```ts
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { validateDist } from "../../scripts/validate-dist.mjs";

describe("validateDist", () => {
  it("reports a missing service worker referenced by the manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "douban-exporter-dist-"));
    await mkdir(join(root, "dist"));
    await writeFile(join(root, "dist/manifest.json"), JSON.stringify({
      background: { service_worker: "assets/service-worker.js" },
    }));

    await expect(validateDist(root)).resolves.toContain(
      "manifest 引用的文件不存在: assets/service-worker.js",
    );
  });
});
```

- [ ] **Step 2: 运行校验测试并确认失败**

Run: `npm test -- tests/build/validate-dist.test.ts`

Expected: FAIL，`scripts/validate-dist.mjs` 不存在。

- [ ] **Step 3: 创建构建产物校验脚本**

`scripts/validate-dist.mjs` 导出 `validateDist(rootDirectory)`，读取 `dist/manifest.json`，验证 manifest 引用的 Service Worker 和 `app.html`、`offscreen.html` 存在；扫描 `dist/**/*.js` 和 `dist/**/*.html`，若发现 `http://`、非豆瓣的 `https://` 运行时代码引用或内联远程脚本则返回错误数组。直接执行脚本时打印全部错误并以 1 退出，无错误时以 0 退出。

在 `package.json` 添加：

```json
"validate:dist": "node scripts/validate-dist.mjs",
"check": "npm test && npm run typecheck && npm run build && npm run validate:dist"
```

- [ ] **Step 4: 运行构建校验测试并确认通过**

Run: `npm test -- tests/build/validate-dist.test.ts && npm run build && npm run validate:dist`

Expected: 测试、构建和产物校验全部通过。

- [ ] **Step 5: 编写 README**

README 必须包含：

- 功能和 14 列字段列表。
- 隐私与权限说明，明确不读取 Cookie 值。
- `npm install`、`npm run build`。
- 打开 `chrome://extensions`、启用开发者模式、加载 `dist/`。
- 先在普通豆瓣标签页登录，再打开扩展。
- 开始、暂停、继续、完整导出和 partial 导出操作。
- 默认下载目录、自定义目录授权和权限失效处理。
- 4–8 秒限速、每 20 次冷却以及大型书库可能耗时数小时。
- 遇到验证码、403、429 时停止操作并稍后手动继续，不建议绕过。
- 当前真实账号端到端验收步骤。

- [ ] **Step 6: 运行完整验证**

Run: `npm run check && git diff --check`

Expected: 所有测试通过；类型检查退出码 0；生产构建和 dist 校验退出码 0；`git diff --check` 无输出。

- [ ] **Step 7: 进行代码审查并修复发现**

使用 `code-review` 技能从设计提交 `71b3363` 审查 Standards 和 Spec 两个维度。每个有效发现先添加失败测试，再修复并重跑相关测试；若无发现，保留审查结论。

- [ ] **Step 8: 再次运行新鲜完整验证**

Run: `npm run check && git status --short && git diff --check`

Expected: 完整验证通过；只包含预期文档或源码变更；没有未跟踪构建垃圾。

- [ ] **Step 9: 提交最终集成与文档**

```bash
git add README.md package.json package-lock.json scripts tests/build docs/superpowers/specs/2026-08-28-douban-book-exporter-design.md docs/superpowers/plans/2026-08-28-douban-book-exporter.md
git commit -m "docs: 补充扩展安装与验收说明"
```

- [ ] **Step 10: 记录人工验收边界**

最终交付明确列出：自动测试、类型检查、构建和产物校验结果；同时说明由于没有可连接的 Chrome 会话，真实豆瓣登录态、当前私有列表和目录选择器仍需用户按 README 步骤加载 `dist/` 验收。
