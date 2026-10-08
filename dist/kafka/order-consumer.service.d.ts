import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SearchService } from '../search/search.service';
import { RedisService } from '../cache/redis.service';
export declare class OrderCdcConsumerService implements OnModuleInit, OnModuleDestroy {
    private readonly searchService;
    private readonly redisService;
    private readonly logger;
    private kafka;
    private consumer;
    constructor(searchService: SearchService, redisService: RedisService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    private handleBatch;
}
