import { OrderStatus } from '@prisma/client';
export declare class SearchOrdersDto {
    query: string;
    status?: OrderStatus;
    tenantId?: string;
    limit: number;
    searchAfter?: (string | number)[];
}
