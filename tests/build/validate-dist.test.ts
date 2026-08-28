import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// The production validator is an executable Node ESM script.
// @ts-expect-error JavaScript CLI modules do not ship a declaration file.
import { validateDist } from "../../scripts/validate-dist.mjs";

describe("validateDist", () => {
  it("reports a missing service worker referenced by the manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "douban-exporter-dist-"));
    await mkdir(join(root, "dist"));
    await writeFile(
      join(root, "dist/manifest.json"),
      JSON.stringify({
        manifest_version: 3,
        permissions: ["alarms", "downloads", "offscreen"],
        host_permissions: ["https://*.douban.com/*"],
        background: { service_worker: "assets/service-worker.js" },
      }),
    );
    await writeFile(join(root, "dist/app.html"), "<main></main>");
    await writeFile(join(root, "dist/offscreen.html"), "<main></main>");

    await expect(validateDist(root)).resolves.toContain(
      "manifest 引用的文件不存在: assets/service-worker.js",
    );
  });

  it("rejects an unexpected remote script from a built page", async () => {
    const root = await mkdtemp(join(tmpdir(), "douban-exporter-dist-"));
    await mkdir(join(root, "dist/assets"), { recursive: true });
    await writeFile(
      join(root, "dist/manifest.json"),
      JSON.stringify({
        manifest_version: 3,
        permissions: ["alarms", "downloads", "offscreen"],
        host_permissions: ["https://*.douban.com/*"],
        background: { service_worker: "assets/service-worker.js" },
      }),
    );
    await writeFile(
      join(root, "dist/app.html"),
      '<script src="https://evil.example/app.js"></script>',
    );
    await writeFile(join(root, "dist/offscreen.html"), "<main></main>");
    await writeFile(join(root, "dist/assets/service-worker.js"), "export {};");

    const errors = await validateDist(root);
    expect(
      errors.some((error: string) =>
        error.includes(
          "构建产物包含不允许的远程脚本: https://evil.example/app.js",
        ),
      ),
    ).toBe(true);
  });
});
