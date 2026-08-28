export class PageStructureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PageStructureError";
  }
}

