import { CursorPaginationDto } from '../../common/dto/cursor-pagination.dto';
import { OrderStatus } from '@prisma/client';
export declare class QueryOrdersDto extends CursorPaginationDto {
    status?: OrderStatus;
    tenantId?: string;
    customerId?: string;
}
