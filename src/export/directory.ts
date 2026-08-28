export interface DirectoryPicker {
  showDirectoryPicker(
    options?: DirectoryPickerOptions,
  ): Promise<FileSystemDirectoryHandle>;
}

export class DirectoryWriter {
  constructor(
    private readonly picker: DirectoryPicker = window,
  ) {}

  async chooseDirectory(): Promise<FileSystemDirectoryHandle | null> {
    try {
      return await this.picker.showDirectoryPicker({
        id: "douban-book-exporter",
        mode: "readwrite",
        startIn: "downloads",
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return null;
      }
      throw error;
    }
  }

  async ensureWritePermission(
    handle: FileSystemDirectoryHandle,
    mayRequestPermission: boolean,
  ): Promise<boolean> {
    const descriptor: FileSystemHandlePermissionDescriptor = {
      mode: "readwrite",
    };
    const current = await handle.queryPermission(descriptor);
    if (current === "granted") {
      return true;
    }
    if (current !== "prompt" || !mayRequestPermission) {
      return false;
    }
    return (await handle.requestPermission(descriptor)) === "granted";
  }

  async writeTextFile(
    handle: FileSystemDirectoryHandle,
    fileName: string,
    contents: string,
    mayRequestPermission: boolean,
  ): Promise<boolean> {
    if (!(await this.ensureWritePermission(handle, mayRequestPermission))) {
      return false;
    }

    const file = await handle.getFileHandle(fileName, { create: true });
    const writable = await file.createWritable();
    await writable.write(contents);
    await writable.close();
    return true;
  }
}
