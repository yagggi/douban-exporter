export class PageStructureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PageStructureError";
  }
}

export class SubjectUnavailableError extends Error {
  constructor() {
    super("豆瓣条目已删除或不再收录");
    this.name = "SubjectUnavailableError";
  }
}
