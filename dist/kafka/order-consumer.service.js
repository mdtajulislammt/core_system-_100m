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
var OrderCdcConsumerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderCdcConsumerService = void 0;
const common_1 = require("@nestjs/common");
const kafkajs_1 = require("kafkajs");
const search_service_1 = require("../search/search.service");
const redis_service_1 = require("../cache/redis.service");
let OrderCdcConsumerService = OrderCdcConsumerService_1 = class OrderCdcConsumerService {
    searchService;
    redisService;
    logger = new common_1.Logger(OrderCdcConsumerService_1.name);
    kafka;
    consumer;
    constructor(searchService, redisService) {
        this.searchService = searchService;
        this.redisService = redisService;
    }
    async onModuleInit() {
        this.kafka = new kafkajs_1.Kafka({
            clientId: 'nestjs-cdc-consumer',
            brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
            retry: {
                initialRetryTime: 300,
                retries: 8,
            },
        });
        this.consumer = this.kafka.consumer({
            groupId: 'cdc-elasticsearch-sync-group',
            sessionTimeout: 30000,
            heartbeatInterval: 3000,
        });
        try {
            await this.consumer.connect();
            await this.consumer.subscribe({
                topic: 'orders.cdc.events',
                fromBeginning: false,
            });
            await this.consumer.run({
                autoCommit: false,
                eachBatch: this.handleBatch.bind(this),
            });
            this.logger.log('CDC Kafka Consumer subscribed to orders.cdc.events');
        }
        catch (err) {
            this.logger.warn(`Kafka broker not reachable (${err.message}). CDC consumer disabled until Kafka is started via docker compose.`);
        }
    }
    async onModuleDestroy() {
        await this.consumer?.disconnect();
    }
    async handleBatch({ batch, resolveOffset, heartbeat, commitOffsetsIfNecessary }) {
        for (const message of batch.messages) {
            if (!message.value)
                continue;
            try {
                const rawEvent = JSON.parse(message.value.toString('utf8'));
                const orderData = rawEvent;
                const op = orderData.__op || rawEvent.op || 'u';
                const createdAtIso = typeof orderData.created_at === 'number'
                    ? new Date(orderData.created_at / 1000).toISOString()
                    : new Date(orderData.created_at).toISOString();
                const updatedAtIso = typeof orderData.updated_at === 'number'
                    ? new Date(orderData.updated_at / 1000).toISOString()
                    : new Date(orderData.updated_at).toISOString();
                if (op === 'd' || orderData.is_deleted === true) {
                    await this.searchService.markDeletedFromCDC(orderData.id, orderData.version);
                }
                else {
                    await this.searchService.upsertFromCDC({
                        id: orderData.id,
                        tenant_id: orderData.tenant_id,
                        order_number: orderData.order_number,
                        customer_id: orderData.customer_id,
                        customer_name: orderData.customer_name,
                        customer_email: orderData.customer_email,
                        status: orderData.status,
                        currency: orderData.currency,
                        total_amount: Number(orderData.total_amount),
                        metadata: typeof orderData.metadata === 'string' ? JSON.parse(orderData.metadata) : (orderData.metadata || {}),
                        is_deleted: orderData.is_deleted,
                        version: orderData.version,
                        created_at: createdAtIso,
                        updated_at: updatedAtIso,
                    });
                }
                await this.redisService.del(`order:${orderData.id}`);
                resolveOffset(message.offset);
                await heartbeat();
            }
            catch (err) {
                this.logger.error(`Error processing CDC message at offset ${message.offset}`, err);
                throw err;
            }
        }
        await commitOffsetsIfNecessary();
    }
};
exports.OrderCdcConsumerService = OrderCdcConsumerService;
exports.OrderCdcConsumerService = OrderCdcConsumerService = OrderCdcConsumerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [search_service_1.SearchService,
        redis_service_1.RedisService])
], OrderCdcConsumerService);
//# sourceMappingURL=order-consumer.service.js.map