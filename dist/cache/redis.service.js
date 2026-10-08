"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var RedisService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisService = void 0;
const common_1 = require("@nestjs/common");
const ioredis_1 = require("ioredis");
let RedisService = RedisService_1 = class RedisService {
    logger = new common_1.Logger(RedisService_1.name);
    client;
    onModuleInit() {
        this.client = new ioredis_1.default({
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
    async onModuleDestroy() {
        await this.client.quit();
    }
    getClient() {
        return this.client;
    }
    async get(key) {
        const data = await this.client.get(key);
        if (!data)
            return null;
        try {
            return JSON.parse(data);
        }
        catch {
            return data;
        }
    }
    async set(key, value, ttlSeconds, jitterRangeSeconds = 10) {
        const jitter = Math.floor(Math.random() * (jitterRangeSeconds * 2 + 1)) - jitterRangeSeconds;
        const effectiveTtl = Math.max(1, ttlSeconds + jitter);
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        await this.client.set(key, serialized, 'EX', effectiveTtl);
    }
    async del(...keys) {
        if (keys.length === 0)
            return 0;
        return this.client.del(...keys);
    }
    async getOrSet(key, ttlSeconds, factory) {
        const cached = await this.get(key);
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
            }
            finally {
                await this.client.del(lockKey);
            }
        }
        else {
            await new Promise((resolve) => setTimeout(resolve, 100));
            return this.getOrSet(key, ttlSeconds, factory);
        }
    }
};
exports.RedisService = RedisService;
exports.RedisService = RedisService = RedisService_1 = __decorate([
    (0, common_1.Injectable)()
], RedisService);
//# sourceMappingURL=redis.service.js.map