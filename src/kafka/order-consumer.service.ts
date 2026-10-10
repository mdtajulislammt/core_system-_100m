import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Kafka, Consumer, EachBatchPayload } from 'kafkajs';
import { SearchService } from '../search/search.service';
import { RedisService } from '../cache/redis.service';

interface DebeziumOrderPayload {
  id: string;
  tenant_id: string;
  order_number: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  status: string;
  currency: string;
  total_amount: number;
  metadata: any;
  is_deleted: boolean;
  version: number;
  created_at: number | string;
  updated_at: number | string;
  __op?: 'c' | 'u' | 'd' | 'r'; 
}

@Injectable()
export class OrderCdcConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderCdcConsumerService.name);
  private kafka: Kafka;
  private consumer: Consumer;
  constructor(
    private readonly searchService: SearchService,
    private readonly redisService: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.kafka = new Kafka({
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
    } catch (err: any) {
      this.logger.warn(`Kafka broker not reachable (${err.message}). CDC consumer disabled until Kafka is started via docker compose.`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer?.disconnect();
  }


  private async handleBatch({ batch, resolveOffset, heartbeat, commitOffsetsIfNecessary }: EachBatchPayload): Promise<void> {
    for (const message of batch.messages) {
      if (!message.value) continue;

      try {
        const rawEvent = JSON.parse(message.value.toString('utf8'));
        const orderData: DebeziumOrderPayload = rawEvent;
        const op = orderData.__op || rawEvent.op || 'u';

        const createdAtIso = typeof orderData.created_at === 'number'
          ? new Date(orderData.created_at / 1000).toISOString()
          : new Date(orderData.created_at).toISOString();

        const updatedAtIso = typeof orderData.updated_at === 'number'
          ? new Date(orderData.updated_at / 1000).toISOString()
          : new Date(orderData.updated_at).toISOString();

        if (op === 'd' || orderData.is_deleted === true) {
          await this.searchService.markDeletedFromCDC(orderData.id, orderData.version);
        } else {
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
      } catch (err) {
        this.logger.error(`Error processing CDC message at offset ${message.offset}`, err);
        throw err;
      }
    }

    await commitOffsetsIfNecessary();
  }
}
