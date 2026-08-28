export interface OffscreenChromeApi {
  runtime: {
    getURL(path: string): string;
    getContexts(filter: {
      contextTypes: string[];
      documentUrls: string[];
    }): Promise<unknown[]>;
  };
  offscreen: {
    createDocument(parameters: {
      url: string;
      reasons: string[];
      justification: string;
    }): Promise<void>;
    closeDocument(): Promise<void>;
  };
}

let creatingDocument: Promise<void> | null = null;

async function hasOffscreenDocument(api: OffscreenChromeApi): Promise<boolean> {
  const documentUrl = api.runtime.getURL("offscreen.html");
  const contexts = await api.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [documentUrl],
  });
  return contexts.length > 0;
}

export async function ensureOffscreenDocument(
  api: OffscreenChromeApi = chrome as unknown as OffscreenChromeApi,
): Promise<void> {
  if (creatingDocument) {
    return creatingDocument;
  }
  creatingDocument = (async () => {
    if (await hasOffscreenDocument(api)) {
      return;
    }
    await api.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["DOM_PARSER"],
      justification: "解析豆瓣页面并运行可恢复的低频导出任务",
    });
  })();
  try {
    await creatingDocument;
  } finally {
    creatingDocument = null;
  }
}

export async function closeOffscreenDocument(
  api: OffscreenChromeApi = chrome as unknown as OffscreenChromeApi,
): Promise<void> {
  if (creatingDocument) {
    await creatingDocument;
  }
  if (await hasOffscreenDocument(api)) {
    await api.offscreen.closeDocument();
  }
}

