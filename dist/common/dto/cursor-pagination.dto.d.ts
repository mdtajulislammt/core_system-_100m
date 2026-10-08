export declare enum PaginationDirection {
    FORWARD = "FORWARD",
    BACKWARD = "BACKWARD"
}
export declare class CursorPaginationDto {
    cursor?: string;
    limit: number;
    direction: PaginationDirection;
}
