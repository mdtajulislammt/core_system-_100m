export declare class PageInfo {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
    endCursor: string | null;
    count: number;
}
export declare class PaginatedResponseDto<T> {
    data: T[];
    pageInfo: PageInfo;
    constructor(data: T[], pageInfo: PageInfo);
}
