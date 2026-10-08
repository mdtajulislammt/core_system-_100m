import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
export declare class RedisService implements OnModuleInit, OnModuleDestroy {
    private readonly logger;
    private client;
    onModuleInit(): void;
    onModuleDestroy(): Promise<void>;
    getClient(): Redis;
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: any, ttlSeconds: number, jitterRangeSeconds?: number): Promise<void>;
    del(...keys: string[]): Promise<number>;
    getOrSet<T>(key: string, ttlSeconds: number, factory: () => Promise<T>): Promise<T>;
}
