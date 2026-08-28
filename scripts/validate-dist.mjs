import { access, readFile, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const EXPECTED_PERMISSIONS = ["alarms", "downloads", "offscreen"];
const EXPECTED_HOST_PERMISSIONS = ["https://*.douban.com/*"];
const INERT_NAMESPACE_URLS = new Set([
  "http://www.w3.org/1999/xhtml",
  "http://www.w3.org/2000/svg",
]);

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await filesBelow(path)));
    } else {
      files.push(path);
    }
  }
  return files;
}

function sameMembers(actual, expected) {
  return (
    Array.isArray(actual) &&
    JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort())
  );
}

function allowedRuntimeUrl(value) {
  if (INERT_NAMESPACE_URLS.has(value)) {
    return true;
  }
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "douban.com" || url.hostname.endsWith(".douban.com"))
    );
  } catch {
    return false;
  }
}

function inspectBuiltSource(source, extension) {
  const errors = [];
  if (extension === ".html") {
    const remoteScripts = source.matchAll(
      /<script\b[^>]*\bsrc=["'](https?:\/\/[^"']+)["'][^>]*>/giu,
    );
    for (const match of remoteScripts) {
      errors.push(`构建产物包含不允许的远程脚本: ${match[1]}`);
    }
  }

  const urls = source.matchAll(/https?:\/\/[^\s"'`<>\\)]+/gu);
  for (const match of urls) {
    const value = match[0];
    if (!allowedRuntimeUrl(value)) {
      errors.push(`构建产物包含不允许的远程 URL: ${value}`);
    }
  }
  return errors;
}

export async function validateDist(rootDirectory = process.cwd()) {
  const distDirectory = resolve(rootDirectory, "dist");
  const manifestPath = join(distDirectory, "manifest.json");
  const errors = [];
  if (!(await exists(manifestPath))) {
    return ["构建产物缺少 manifest.json"];
  }

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.manifest_version !== 3) {
    errors.push("manifest_version 必须为 3");
  }
  if (manifest.minimum_chrome_version !== undefined && manifest.minimum_chrome_version !== "116") {
    errors.push("minimum_chrome_version 必须为 116");
  }
  if (!sameMembers(manifest.permissions, EXPECTED_PERMISSIONS)) {
    errors.push("manifest 权限超出已批准范围");
  }
  if (!sameMembers(manifest.host_permissions, EXPECTED_HOST_PERMISSIONS)) {
    errors.push("manifest 主机权限超出豆瓣 HTTPS 域名");
  }

  const requiredFiles = [
    manifest.background?.service_worker,
    "app.html",
    "offscreen.html",
  ].filter((value) => typeof value === "string");
  for (const requiredFile of requiredFiles) {
    if (!(await exists(join(distDirectory, requiredFile)))) {
      errors.push(`manifest 引用的文件不存在: ${requiredFile}`);
    }
  }

  if (await exists(distDirectory)) {
    for (const file of await filesBelow(distDirectory)) {
      const extension = file.endsWith(".html")
        ? ".html"
        : file.endsWith(".js")
          ? ".js"
          : "";
      if (!extension) continue;
      const source = await readFile(file, "utf8");
      for (const error of inspectBuiltSource(source, extension)) {
        errors.push(`${error} (${relative(distDirectory, file)})`);
      }
    }
  }
  return [...new Set(errors)];
}

const executedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === executedPath) {
  const errors = await validateDist(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    process.exitCode = 1;
  } else {
    console.log("构建产物校验通过");
  }
}

