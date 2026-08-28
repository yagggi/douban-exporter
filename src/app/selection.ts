export function shouldDeferRefreshForSelection(
  root: HTMLElement,
  selection: Selection | null = window.getSelection(),
): boolean {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return false;
  }
  return [selection.anchorNode, selection.focusNode].some(
    (node) => node !== null && (node === root || root.contains(node)),
  );
}

