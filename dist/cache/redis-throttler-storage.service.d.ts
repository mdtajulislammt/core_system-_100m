import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { RedisService } from './redis.service';
export declare class RedisThrottlerStorageService implements ThrottlerStorage {
    private readonly redisService;
    constructor(redisService: RedisService);
    increment(key: string, ttl: number): Promise<ThrottlerStorageRecord>;
}
