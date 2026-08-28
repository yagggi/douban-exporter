export interface ExportFilenameInput {
  userName: string;
  partial: boolean;
  now: Date;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

function safeUserName(userName: string): string {
  const trimmed = userName.trim();
  if (trimmed === "") {
    return "douban-user";
  }
  return trimmed.replace(/[\u0000-\u001F\u007F/\\:*?"<>|]/gu, "_");
}

export function buildExportFilename(input: ExportFilenameInput): string {
  const date = [
    input.now.getFullYear(),
    twoDigits(input.now.getMonth() + 1),
    twoDigits(input.now.getDate()),
  ].join("");
  const time = [
    twoDigits(input.now.getHours()),
    twoDigits(input.now.getMinutes()),
    twoDigits(input.now.getSeconds()),
  ].join("");
  const partial = input.partial ? "-partial" : "";
  return `douban-books-${safeUserName(input.userName)}${partial}-${date}-${time}.csv`;
}

