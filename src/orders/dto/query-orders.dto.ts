import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { CursorPaginationDto } from '../../common/dto/cursor-pagination.dto';
import { OrderStatus } from '@prisma/client';

export class QueryOrdersDto extends CursorPaginationDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;
}
