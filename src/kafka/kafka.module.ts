import { Module } from '@nestjs/common';
import { OrderCdcConsumerService } from './order-consumer.service';
import { SearchModule } from '../search/search.module';

@Module({
  imports: [SearchModule],
  providers: [OrderCdcConsumerService],
})
export class KafkaModule {}
