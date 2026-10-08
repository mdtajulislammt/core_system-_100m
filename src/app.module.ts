import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './database/prisma.module';
import { RedisModule } from './cache/redis.module';
import { RedisThrottlerStorageService } from './cache/redis-throttler-storage.service';
import { OrdersModule } from './orders/orders.module';
import { SearchModule } from './search/search.module';
import { KafkaModule } from './kafka/kafka.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [RedisThrottlerStorageService],
      useFactory: (storage: RedisThrottlerStorageService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: 60000,
            limit: 120, // General read limit: 120 req/min
          },
          {
            name: 'write',
            ttl: 60000,
            limit: 60,  // Stricter write limit: 60 req/min
          },
          {
            name: 'search',
            ttl: 60000,
            limit: 300, // Search throughput: 300 req/min
          },
        ],
        storage,
      }),
    }),
    PrismaModule,
    RedisModule,
    OrdersModule,
    SearchModule,
    KafkaModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
