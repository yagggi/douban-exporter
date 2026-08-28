import type { DBSchema } from "idb";

import type {
  BookRecord,
  DetailStatus,
  ExportJob,
} from "../domain/types";

export const DATABASE_NAME = "douban-book-exporter";
export const DATABASE_VERSION = 1;

export interface ExporterDatabaseSchema extends DBSchema {
  jobs: {
    key: "current";
    value: ExportJob;
  };
  records: {
    key: string;
    value: BookRecord;
    indexes: { "by-detail-status": DetailStatus };
  };
  settings: {
    key: "directoryHandle";
    value: FileSystemDirectoryHandle;
  };
}

