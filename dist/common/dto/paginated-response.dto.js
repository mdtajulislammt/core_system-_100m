"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaginatedResponseDto = exports.PageInfo = void 0;
class PageInfo {
    hasNextPage;
    hasPreviousPage;
    startCursor;
    endCursor;
    count;
}
exports.PageInfo = PageInfo;
class PaginatedResponseDto {
    data;
    pageInfo;
    constructor(data, pageInfo) {
        this.data = data;
        this.pageInfo = pageInfo;
    }
}
exports.PaginatedResponseDto = PaginatedResponseDto;
//# sourceMappingURL=paginated-response.dto.js.map