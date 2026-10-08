import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus } from '@prisma/client';

export class UpdateOrderDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  totalAmount?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  /**
   * Expected record version for Optimistic Concurrency Control (OCC).
   * Prevents lost updates under high concurrency without table/row locking.
   */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsNotEmpty()
  expectedVersion: number;
}
