export interface AppTabChromeApi {
  runtime: { getURL(path: string): string };
  tabs: {
    query(queryInfo: Record<string, never>): Promise<
      Array<{ id?: number; windowId?: number; url?: string }>
    >;
    update(tabId: number, updateProperties: { active: boolean }): Promise<unknown>;
    create(createProperties: { url: string }): Promise<unknown>;
  };
  windows: {
    update(windowId: number, updateInfo: { focused: boolean }): Promise<unknown>;
  };
}

export async function openOrFocusAppTab(
  api: AppTabChromeApi = chrome as unknown as AppTabChromeApi,
): Promise<void> {
  const appUrl = api.runtime.getURL("app.html");
  const tabs = await api.tabs.query({});
  const existing = tabs.find((tab) => tab.url === appUrl);
  if (existing?.id !== undefined) {
    await api.tabs.update(existing.id, { active: true });
    if (existing.windowId !== undefined) {
      await api.windows.update(existing.windowId, { focused: true });
    }
    return;
  }
  await api.tabs.create({ url: appUrl });
}

