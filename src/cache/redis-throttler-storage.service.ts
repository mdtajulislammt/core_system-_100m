import { Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { RedisService } from './redis.service';

@Injectable()
export class RedisThrottlerStorageService implements ThrottlerStorage {
  constructor(private readonly redisService: RedisService) {}

  /**
   * Atomic sliding window rate-limiting counter in Redis using Lua script.
   */
  async increment(key: string, ttl: number): Promise<ThrottlerStorageRecord> {
    const redis = this.redisService.getClient();
    const redisKey = `throttle:${key}`;

    // Redis Lua script for atomic sliding window rate limiting
    const luaScript = `
      local current = redis.call('INCR', KEYS[1])
      if tonumber(current) == 1 then
        redis.call('PEXPIRE', KEYS[1], ARGV[1])
      end
      local pttl = redis.call('PTTL', KEYS[1])
      return {current, pttl}
    `;

    const result = (await redis.eval(luaScript, 1, redisKey, ttl)) as [number, number];
    const totalHits = result[0];
    const timeToExpire = Math.max(0, Math.ceil(result[1] / 1000));

    return {
      totalHits,
      timeToExpire,
    };
  }
}
