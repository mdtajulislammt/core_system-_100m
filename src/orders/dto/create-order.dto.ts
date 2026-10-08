import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus } from '@prisma/client';

export class CreateOrderDto {
  @IsUUID()
  @IsNotEmpty()
  tenantId: string;

  @IsString()
  @IsNotEmpty()
  orderNumber: string;

  @IsUUID()
  @IsNotEmpty()
  customerId: string;

  @IsString()
  @IsNotEmpty()
  customerName: string;

  @IsEmail()
  @IsNotEmpty()
  customerEmail: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus = OrderStatus.PENDING;

  @IsOptional()
  @IsString()
  currency?: string = 'USD';

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  totalAmount: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any> = {};
}
