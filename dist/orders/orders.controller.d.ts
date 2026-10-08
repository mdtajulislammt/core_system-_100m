import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { Order } from '@prisma/client';
export declare class OrdersController {
    private readonly ordersService;
    constructor(ordersService: OrdersService);
    getOrders(query: QueryOrdersDto): Promise<PaginatedResponseDto<Order>>;
    getOrdersRaw(query: QueryOrdersDto): Promise<PaginatedResponseDto<Order>>;
    getOrderById(id: string, createdAt?: string): Promise<Order>;
    createOrder(dto: CreateOrderDto): Promise<Order>;
    updateOrder(id: string, createdAtStr: string, dto: UpdateOrderDto): Promise<Order>;
    softDeleteOrder(id: string, createdAtStr: string, expectedVersionStr: string): Promise<void>;
}
