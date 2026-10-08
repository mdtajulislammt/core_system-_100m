import { OrderStatus } from '@prisma/client';
export declare class CreateOrderDto {
    tenantId: string;
    orderNumber: string;
    customerId: string;
    customerName: string;
    customerEmail: string;
    status?: OrderStatus;
    currency?: string;
    totalAmount: number;
    metadata?: Record<string, any>;
}
