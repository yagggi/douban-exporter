export function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

export function normalizeInlineText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

export function normalizeMultilineText(value: string): string {
  const normalizedLines = value
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t\f\v ]+/gu, " ").trim());

  while (normalizedLines[0] === "") {
    normalizedLines.shift();
  }
  while (normalizedLines.at(-1) === "") {
    normalizedLines.pop();
  }

  const result: string[] = [];
  for (const line of normalizedLines) {
    if (line === "" && result.at(-1) === "") {
      continue;
    }
    result.push(line);
  }
  return result.join("\n");
}

export function elementMultilineText(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
  clone.querySelectorAll("p").forEach((node) => node.append("\n\n"));
  return normalizeMultilineText(clone.textContent ?? "");
}

export function breakSeparatedLines(element: Element): string[] {
  const lines: string[] = [];
  let currentLine = "";

  for (const node of element.childNodes) {
    if (node instanceof HTMLBRElement) {
      const normalized = normalizeInlineText(currentLine);
      if (normalized !== "") {
        lines.push(normalized);
      }
      currentLine = "";
      continue;
    }
    currentLine += node.textContent ?? "";
  }

  const trailing = normalizeInlineText(currentLine);
  if (trailing !== "") {
    lines.push(trailing);
  }
  return lines;
}

