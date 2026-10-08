export class PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
  count: number;
}

export class PaginatedResponseDto<T> {
  data: T[];
  pageInfo: PageInfo;

  constructor(data: T[], pageInfo: PageInfo) {
    this.data = data;
    this.pageInfo = pageInfo;
  }
}
