import { OnModuleInit } from '@nestjs/common';
import { SearchOrdersDto } from './dto/search-orders.dto';
export interface ElasticsearchOrderHit {
    id: string;
    tenant_id: string;
    order_number: string;
    customer_id: string;
    customer_name: string;
    customer_email: string;
    status: string;
    currency: string;
    total_amount: number;
    metadata: Record<string, any>;
    is_deleted: boolean;
    version: number;
    created_at: string;
    updated_at: string;
}
export interface PaginatedSearchResponse<T> {
    hits: T[];
    totalEstimatedHits: number | {
        value: number;
        relation: string;
    };
    searchAfter: (string | number)[] | null;
    took: number;
}
export declare class SearchService implements OnModuleInit {
    private readonly logger;
    private readonly client;
    private readonly indexName;
    constructor();
    onModuleInit(): Promise<void>;
    searchOrders(dto: SearchOrdersDto): Promise<PaginatedSearchResponse<ElasticsearchOrderHit>>;
    upsertFromCDC(order: ElasticsearchOrderHit): Promise<void>;
    markDeletedFromCDC(orderId: string, version: number): Promise<void>;
}
