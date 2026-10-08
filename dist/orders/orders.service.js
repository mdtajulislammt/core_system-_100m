"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var OrdersService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrdersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../database/prisma.service");
const cursor_util_1 = require("../common/utils/cursor.util");
const paginated_response_dto_1 = require("../common/dto/paginated-response.dto");
const client_1 = require("@prisma/client");
let OrdersService = OrdersService_1 = class OrdersService {
    prisma;
    logger = new common_1.Logger(OrdersService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findMany(query) {
        const { cursor, limit = 20, status, tenantId, customerId } = query;
        const where = {
            isDeleted: false,
            ...(status && { status }),
            ...(tenantId && { tenantId }),
            ...(customerId && { customerId }),
        };
        if (cursor) {
            const decoded = cursor_util_1.CursorUtil.decode(cursor);
            where.AND = [
                {
                    OR: [
                        { createdAt: { lt: decoded.createdAt } },
                        {
                            createdAt: decoded.createdAt,
                            id: { lt: decoded.id },
                        },
                    ],
                },
            ];
        }
        const items = await this.prisma.order.findMany({
            where,
            take: limit + 1,
            orderBy: [
                { createdAt: 'desc' },
                { id: 'desc' },
            ],
        });
        const hasNextPage = items.length > limit;
        if (hasNextPage) {
            items.pop();
        }
        const startCursor = items.length > 0 ? cursor_util_1.CursorUtil.encode(items[0].createdAt, items[0].id) : null;
        const endCursor = items.length > 0 ? cursor_util_1.CursorUtil.encode(items[items.length - 1].createdAt, items[items.length - 1].id) : null;
        const pageInfo = {
            hasNextPage,
            hasPreviousPage: cursor !== undefined && cursor !== null,
            startCursor,
            endCursor,
            count: items.length,
        };
        return new paginated_response_dto_1.PaginatedResponseDto(items, pageInfo);
    }
    async findManyRawKeyset(query) {
        const { cursor, limit = 20, status, tenantId } = query;
        const fetchLimit = limit + 1;
        let rows;
        if (cursor) {
            const decoded = cursor_util_1.CursorUtil.decode(cursor);
            rows = await this.prisma.$queryRaw `
        SELECT *
        FROM orders
        WHERE is_deleted = FALSE
          ${status ? client_1.Prisma.sql `AND status = ${status}::order_status` : client_1.Prisma.empty}
          ${tenantId ? client_1.Prisma.sql `AND tenant_id = ${tenantId}::uuid` : client_1.Prisma.empty}
          AND (created_at, id) < (${decoded.createdAt}, ${decoded.id}::uuid)
        ORDER BY created_at DESC, id DESC
        LIMIT ${fetchLimit};
      `;
        }
        else {
            rows = await this.prisma.$queryRaw `
        SELECT *
        FROM orders
        WHERE is_deleted = FALSE
          ${status ? client_1.Prisma.sql `AND status = ${status}::order_status` : client_1.Prisma.empty}
          ${tenantId ? client_1.Prisma.sql `AND tenant_id = ${tenantId}::uuid` : client_1.Prisma.empty}
        ORDER BY created_at DESC, id DESC
        LIMIT ${fetchLimit};
      `;
        }
        const hasNextPage = rows.length > limit;
        if (hasNextPage) {
            rows.pop();
        }
        const startCursor = rows.length > 0 ? cursor_util_1.CursorUtil.encode(rows[0].createdAt, rows[0].id) : null;
        const endCursor = rows.length > 0 ? cursor_util_1.CursorUtil.encode(rows[rows.length - 1].createdAt, rows[rows.length - 1].id) : null;
        return new paginated_response_dto_1.PaginatedResponseDto(rows, {
            hasNextPage,
            hasPreviousPage: !!cursor,
            startCursor,
            endCursor,
            count: rows.length,
        });
    }
    async create(dto) {
        return this.prisma.$transaction(async (tx) => {
            const order = await tx.order.create({
                data: {
                    tenantId: dto.tenantId,
                    orderNumber: dto.orderNumber,
                    customerId: dto.customerId,
                    customerName: dto.customerName,
                    customerEmail: dto.customerEmail,
                    status: dto.status,
                    currency: dto.currency,
                    totalAmount: new client_1.Prisma.Decimal(dto.totalAmount),
                    metadata: dto.metadata || {},
                    version: 1,
                },
            });
            this.logger.log(`Order created: ${order.id} on partition slice`);
            return order;
        });
    }
    async findById(id, createdAt) {
        let order;
        if (createdAt) {
            order = await this.prisma.order.findUnique({
                where: {
                    id_createdAt: {
                        id,
                        createdAt,
                    },
                },
            });
        }
        else {
            order = await this.prisma.order.findFirst({
                where: {
                    id,
                    isDeleted: false,
                },
            });
        }
        if (!order || order.isDeleted) {
            throw new common_1.NotFoundException(`Order with id '${id}' not found`);
        }
        return order;
    }
    async update(id, createdAt, dto) {
        return this.prisma.$transaction(async (tx) => {
            const updatedCount = await tx.order.updateMany({
                where: {
                    id,
                    createdAt,
                    version: dto.expectedVersion,
                    isDeleted: false,
                },
                data: {
                    ...(dto.status && { status: dto.status }),
                    ...(dto.totalAmount !== undefined && { totalAmount: new client_1.Prisma.Decimal(dto.totalAmount) }),
                    ...(dto.metadata && { metadata: dto.metadata }),
                    version: { increment: 1 },
                    updatedAt: new Date(),
                },
            });
            if (updatedCount.count === 0) {
                const existing = await tx.order.findUnique({
                    where: { id_createdAt: { id, createdAt } },
                });
                if (!existing || existing.isDeleted) {
                    throw new common_1.NotFoundException(`Order ${id} does not exist`);
                }
                throw new common_1.ConflictException(`Conflict: Order ${id} was modified concurrently (expected version ${dto.expectedVersion}, current version ${existing.version})`);
            }
            const refreshed = await tx.order.findUnique({
                where: { id_createdAt: { id, createdAt } },
            });
            return refreshed;
        });
    }
    async softDelete(id, createdAt, expectedVersion) {
        const result = await this.prisma.order.updateMany({
            where: {
                id,
                createdAt,
                version: expectedVersion,
                isDeleted: false,
            },
            data: {
                isDeleted: true,
                deletedAt: new Date(),
                version: { increment: 1 },
                updatedAt: new Date(),
            },
        });
        if (result.count === 0) {
            const existing = await this.prisma.order.findUnique({
                where: { id_createdAt: { id, createdAt } },
            });
            if (!existing || existing.isDeleted) {
                throw new common_1.NotFoundException(`Order ${id} does not exist or is already deleted`);
            }
            throw new common_1.ConflictException(`Concurrent update conflict on soft-deleting order ${id}`);
        }
        this.logger.log(`Order ${id} soft-deleted successfully.`);
    }
};
exports.OrdersService = OrdersService;
exports.OrdersService = OrdersService = OrdersService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], OrdersService);
//# sourceMappingURL=orders.service.js.map