"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisThrottlerStorageService = void 0;
const common_1 = require("@nestjs/common");
const redis_service_1 = require("./redis.service");
let RedisThrottlerStorageService = class RedisThrottlerStorageService {
    redisService;
    constructor(redisService) {
        this.redisService = redisService;
    }
    async increment(key, ttl) {
        const redis = this.redisService.getClient();
        const redisKey = `throttle:${key}`;
        const luaScript = `
      local current = redis.call('INCR', KEYS[1])
      if tonumber(current) == 1 then
        redis.call('PEXPIRE', KEYS[1], ARGV[1])
      end
      local pttl = redis.call('PTTL', KEYS[1])
      return {current, pttl}
    `;
        const result = (await redis.eval(luaScript, 1, redisKey, ttl));
        const totalHits = result[0];
        const timeToExpire = Math.max(0, Math.ceil(result[1] / 1000));
        return {
            totalHits,
            timeToExpire,
        };
    }
};
exports.RedisThrottlerStorageService = RedisThrottlerStorageService;
exports.RedisThrottlerStorageService = RedisThrottlerStorageService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [redis_service_1.RedisService])
], RedisThrottlerStorageService);
//# sourceMappingURL=redis-throttler-storage.service.js.map