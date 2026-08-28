import { describe, expect, it } from "vitest";

import {
  DirectoryWriter,
  type DirectoryPicker,
} from "../../src/export/directory";

interface MemoryDirectoryOptions {
  queryPermission: PermissionState;
  requestPermission: PermissionState;
}

function memoryDirectory(options: MemoryDirectoryOptions) {
  const writes: string[] = [];
  let requestedPermissions = 0;
  let createdFiles = 0;
  const handle = {
    kind: "directory",
    name: "Books",
    async queryPermission() {
      return options.queryPermission;
    },
    async requestPermission() {
      requestedPermissions += 1;
      return options.requestPermission;
    },
    async getFileHandle() {
      createdFiles += 1;
      return {
        async createWritable() {
          return {
            async write(value: string) {
              writes.push(value);
            },
            async close() {
              writes.push("<closed>");
            },
          };
        },
      };
    },
  } as unknown as FileSystemDirectoryHandle;

  return {
    handle,
    writes,
    requestedPermissions: () => requestedPermissions,
    createdFiles: () => createdFiles,
  };
}

describe("DirectoryWriter", () => {
  it("returns null when the user cancels the system directory picker", async () => {
    const picker: DirectoryPicker = {
      async showDirectoryPicker() {
        throw new DOMException("cancelled", "AbortError");
      },
    };
    await expect(new DirectoryWriter(picker).chooseDirectory()).resolves.toBeNull();
  });

  it("does not prompt or create a file outside a user gesture", async () => {
    const memory = memoryDirectory({
      queryPermission: "prompt",
      requestPermission: "granted",
    });
    const writer = new DirectoryWriter({
      async showDirectoryPicker() {
        return memory.handle;
      },
    });

    await expect(
      writer.writeTextFile(memory.handle, "books.csv", "content", false),
    ).resolves.toBe(false);
    expect(memory.requestedPermissions()).toBe(0);
    expect(memory.createdFiles()).toBe(0);
  });

  it("requests permission during a user gesture and closes the completed file", async () => {
    const memory = memoryDirectory({
      queryPermission: "prompt",
      requestPermission: "granted",
    });
    const writer = new DirectoryWriter({
      async showDirectoryPicker() {
        return memory.handle;
      },
    });

    await expect(
      writer.writeTextFile(memory.handle, "books.csv", "内容", true),
    ).resolves.toBe(true);
    expect(memory.requestedPermissions()).toBe(1);
    expect(memory.writes).toEqual(["内容", "<closed>"]);
  });

  it("does not create a file after permission is denied", async () => {
    const memory = memoryDirectory({
      queryPermission: "denied",
      requestPermission: "denied",
    });
    const writer = new DirectoryWriter({
      async showDirectoryPicker() {
        return memory.handle;
      },
    });

    await expect(
      writer.writeTextFile(memory.handle, "books.csv", "内容", true),
    ).resolves.toBe(false);
    expect(memory.createdFiles()).toBe(0);
  });
});
