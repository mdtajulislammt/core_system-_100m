import { PrismaService } from '../database/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { Order } from '@prisma/client';
export declare class OrdersService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    findMany(query: QueryOrdersDto): Promise<PaginatedResponseDto<Order>>;
    findManyRawKeyset(query: QueryOrdersDto): Promise<PaginatedResponseDto<Order>>;
    create(dto: CreateOrderDto): Promise<Order>;
    findById(id: string, createdAt?: Date): Promise<Order>;
    update(id: string, createdAt: Date, dto: UpdateOrderDto): Promise<Order>;
    softDelete(id: string, createdAt: Date, expectedVersion: number): Promise<void>;
}
