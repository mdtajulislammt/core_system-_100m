import { OrderStatus } from '@prisma/client';
export declare class UpdateOrderDto {
    status?: OrderStatus;
    totalAmount?: number;
    metadata?: Record<string, any>;
    expectedVersion: number;
}
