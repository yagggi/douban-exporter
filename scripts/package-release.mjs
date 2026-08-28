import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = resolve(rootDirectory, "dist");
const artifactsDirectory = resolve(rootDirectory, "artifacts");
const manifest = JSON.parse(
  await readFile(resolve(distDirectory, "manifest.json"), "utf8"),
);
const version = manifest.version;
if (typeof version !== "string" || version === "") {
  throw new Error("dist/manifest.json 缺少有效版本号");
}

const expectedTag = `v${version}`;
const workflowTag = process.env.GITHUB_REF_NAME;
if (workflowTag && workflowTag !== expectedTag) {
  throw new Error(
    `Git tag ${workflowTag} 与 manifest 版本 ${version} 不一致，应使用 ${expectedTag}`,
  );
}

await mkdir(artifactsDirectory, { recursive: true });
const archiveName = `douban-book-exporter-${expectedTag}.zip`;
const archivePath = resolve(artifactsDirectory, archiveName);
const checksumPath = `${archivePath}.sha256`;
await Promise.all([
  rm(archivePath, { force: true }),
  rm(checksumPath, { force: true }),
]);

const zip = spawnSync("zip", ["-q", "-r", archivePath, "."], {
  cwd: distDirectory,
  encoding: "utf8",
});
if (zip.status !== 0) {
  throw new Error(`创建 Release ZIP 失败：${zip.stderr || zip.stdout}`);
}

const archive = await readFile(archivePath);
const checksum = createHash("sha256").update(archive).digest("hex");
await writeFile(
  checksumPath,
  `${checksum}  ${basename(archivePath)}\n`,
  "utf8",
);

console.log(`Release ZIP: ${archivePath}`);
console.log(`SHA-256: ${checksumPath}`);

