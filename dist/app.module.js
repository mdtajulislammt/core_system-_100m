"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const throttler_1 = require("@nestjs/throttler");
const core_1 = require("@nestjs/core");
const prisma_module_1 = require("./database/prisma.module");
const redis_module_1 = require("./cache/redis.module");
const redis_throttler_storage_service_1 = require("./cache/redis-throttler-storage.service");
const orders_module_1 = require("./orders/orders.module");
const search_module_1 = require("./search/search.module");
const kafka_module_1 = require("./kafka/kafka.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
            }),
            throttler_1.ThrottlerModule.forRootAsync({
                imports: [redis_module_1.RedisModule],
                inject: [redis_throttler_storage_service_1.RedisThrottlerStorageService],
                useFactory: (storage) => ({
                    throttlers: [
                        {
                            name: 'default',
                            ttl: 60000,
                            limit: 120,
                        },
                        {
                            name: 'write',
                            ttl: 60000,
                            limit: 60,
                        },
                        {
                            name: 'search',
                            ttl: 60000,
                            limit: 300,
                        },
                    ],
                    storage,
                }),
            }),
            prisma_module_1.PrismaModule,
            redis_module_1.RedisModule,
            orders_module_1.OrdersModule,
            search_module_1.SearchModule,
            kafka_module_1.KafkaModule,
        ],
        providers: [
            {
                provide: core_1.APP_GUARD,
                useClass: throttler_1.ThrottlerGuard,
            },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map