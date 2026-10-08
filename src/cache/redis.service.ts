import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  onModuleInit(): void {
    this.client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      enableAutoPipelining: true,
    });

    this.client.connect().catch((err) => {
      this.logger.error('Redis connection error on init', err);
    });

    this.client.on('connect', () => {
      this.logger.log('Connected to Redis cluster for caching & rate limiting');
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  getClient(): Redis {
    return this.client;
  }

  /**
   * Retrieves deserialized object from cache.
   */
  async get<T>(key: string): Promise<T | null> {
    const data = await this.client.get(key);
    if (!data) return null;
    try {
      return JSON.parse(data) as T;
    } catch {
      return data as unknown as T;
    }
  }

  /**
   * Sets cache key with TTL and randomized Jitter to prevent Cache Avalanche.
   * Cache Avalanche occurs when millions of keys expire simultaneously, causing massive DB thrashing.
   */
  async set(key: string, value: any, ttlSeconds: number, jitterRangeSeconds: number = 10): Promise<void> {
    const jitter = Math.floor(Math.random() * (jitterRangeSeconds * 2 + 1)) - jitterRangeSeconds;
    const effectiveTtl = Math.max(1, ttlSeconds + jitter);
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    await this.client.set(key, serialized, 'EX', effectiveTtl);
  }

  /**
   * Deletes one or more cache keys.
   */
  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return this.client.del(...keys);
  }

  /**
   * Cache-Aside Pattern with Distributed Mutex (Single-Flight Lock).
   * Prevents "Thundering Herd" / Cache Stampede:
   * When a hot key expires in a 100M row dataset, thousands of concurrent requests
   * would otherwise hit PostgreSQL simultaneously. The distributed lock ensures
   * only ONE process computes the query while others wait and read from cache.
   */
  async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    factory: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const lockKey = `lock:${key}`;
    const acquiredLock = await this.client.set(lockKey, '1', 'PX', 5000, 'NX');

    if (acquiredLock === 'OK') {
      try {
        const freshData = await factory();
        await this.set(key, freshData, ttlSeconds);
        return freshData;
      } finally {
        await this.client.del(lockKey);
      }
    } else {
      // Another worker is recalculating; wait 100ms and retry reading cache
      await new Promise((resolve) => setTimeout(resolve, 100));
      return this.getOrSet(key, ttlSeconds, factory);
    }
  }
}
