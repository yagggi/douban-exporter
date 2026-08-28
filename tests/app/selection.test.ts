import { afterEach, describe, expect, it, vi } from "vitest";

import { shouldDeferRefreshForSelection } from "../../src/app/selection";

function selectText(node: Text): Selection {
  const selection = window.getSelection();
  if (!selection) throw new Error("测试环境不支持 Selection");
  const range = document.createRange();
  range.selectNodeContents(node);
  selection.removeAllRanges();
  selection.addRange(range);
  return selection;
}

describe("shouldDeferRefreshForSelection", () => {
  afterEach(() => {
    window.getSelection()?.removeAllRanges();
    document.body.replaceChildren();
  });

  it("keeps a selected book title intact during an automatic refresh", () => {
    const root = document.createElement("main");
    const title = document.createElement("a");
    title.textContent = "奇迹集";
    root.append(title);
    document.body.append(root);
    const textNode = title.firstChild;
    if (!(textNode instanceof Text)) throw new Error("标题文本节点不存在");
    const selection = selectText(textNode);
    const render = vi.fn(() => root.replaceChildren(document.createTextNode("新页面")));

    if (!shouldDeferRefreshForSelection(root, selection)) {
      render();
    }

    expect(render).not.toHaveBeenCalled();
    expect(selection.toString()).toBe("奇迹集");
  });

  it("allows refresh when the selection is outside the extension root", () => {
    const root = document.createElement("main");
    const outside = document.createTextNode("外部文字");
    document.body.append(root, outside);
    const selection = selectText(outside);

    expect(shouldDeferRefreshForSelection(root, selection)).toBe(false);
  });
});
