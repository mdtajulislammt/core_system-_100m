import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { CursorUtil } from '../common/utils/cursor.util';
import { PaginatedResponseDto, PageInfo } from '../common/dto/paginated-response.dto';
import { Order, Prisma } from '@prisma/client';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * High-Throughput O(1) Keyset / Cursor Pagination over 100M rows.
   *
   * B-Tree Execution Mechanics:
   * 1. Eliminates OFFSET N scanning overhead (avoids scanning and discarding N index pages).
   * 2. Utilizes the composite index: (status, created_at DESC, id DESC) WHERE is_deleted = false.
   * 3. Performs an exact index seek directly to (cursor.createdAt, cursor.id) leaf page.
   * 4. Uses lookahead (limit + 1) to determine hasNextPage with zero COUNT(*) table scan overhead.
   */
  async findMany(query: QueryOrdersDto): Promise<PaginatedResponseDto<Order>> {
    const { cursor, limit = 20, status, tenantId, customerId } = query;

    // Base filtering condition using the partial index criteria
    const where: Prisma.OrderWhereInput = {
      isDeleted: false,
      ...(status && { status }),
      ...(tenantId && { tenantId }),
      ...(customerId && { customerId }),
    };

    // Apply Keyset / Cursor seek boundary
    if (cursor) {
      const decoded = CursorUtil.decode(cursor);

      // Keyset compound logic: (created_at < cursor.createdAt) OR (created_at = cursor.createdAt AND id < cursor.id)
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

    // Fetch limit + 1 items to determine if a subsequent page exists (Lookahead pattern)
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
      items.pop(); // Remove the extra lookahead item
    }

    const startCursor = items.length > 0 ? CursorUtil.encode(items[0].createdAt, items[0].id) : null;
    const endCursor = items.length > 0 ? CursorUtil.encode(items[items.length - 1].createdAt, items[items.length - 1].id) : null;

    const pageInfo: PageInfo = {
      hasNextPage,
      hasPreviousPage: cursor !== undefined && cursor !== null,
      startCursor,
      endCursor,
      count: items.length,
    };

    return new PaginatedResponseDto(items, pageInfo);
  }

  /**
   * Ultra-Performance Native PostgreSQL Row-Value Constructor Keyset Query.
   * Leverages PostgreSQL's native `(created_at, id) < ($1, $2)` tuple comparison,
   * which maps directly to a single-pass index scan in PostgreSQL query planner.
   */
  async findManyRawKeyset(query: QueryOrdersDto): Promise<PaginatedResponseDto<Order>> {
    const { cursor, limit = 20, status, tenantId } = query;
    const fetchLimit = limit + 1;

    let rows: Order[];

    if (cursor) {
      const decoded = CursorUtil.decode(cursor);
      rows = await this.prisma.$queryRaw<Order[]>`
        SELECT *
        FROM orders
        WHERE is_deleted = FALSE
          ${status ? Prisma.sql`AND status = ${status}::order_status` : Prisma.empty}
          ${tenantId ? Prisma.sql`AND tenant_id = ${tenantId}::uuid` : Prisma.empty}
          AND (created_at, id) < (${decoded.createdAt}, ${decoded.id}::uuid)
        ORDER BY created_at DESC, id DESC
        LIMIT ${fetchLimit};
      `;
    } else {
      rows = await this.prisma.$queryRaw<Order[]>`
        SELECT *
        FROM orders
        WHERE is_deleted = FALSE
          ${status ? Prisma.sql`AND status = ${status}::order_status` : Prisma.empty}
          ${tenantId ? Prisma.sql`AND tenant_id = ${tenantId}::uuid` : Prisma.empty}
        ORDER BY created_at DESC, id DESC
        LIMIT ${fetchLimit};
      `;
    }

    const hasNextPage = rows.length > limit;
    if (hasNextPage) {
      rows.pop();
    }

    const startCursor = rows.length > 0 ? CursorUtil.encode(rows[0].createdAt, rows[0].id) : null;
    const endCursor = rows.length > 0 ? CursorUtil.encode(rows[rows.length - 1].createdAt, rows[rows.length - 1].id) : null;

    return new PaginatedResponseDto(rows, {
      hasNextPage,
      hasPreviousPage: !!cursor,
      startCursor,
      endCursor,
      count: rows.length,
    });
  }

  /**
   * Creates a new order in an ACID transaction.
   */
  async create(dto: CreateOrderDto): Promise<Order> {
    return this.prisma.$transaction(async (tx) => {
      // Create new partitioned record
      const order = await tx.order.create({
        data: {
          tenantId: dto.tenantId,
          orderNumber: dto.orderNumber,
          customerId: dto.customerId,
          customerName: dto.customerName,
          customerEmail: dto.customerEmail,
          status: dto.status,
          currency: dto.currency,
          totalAmount: new Prisma.Decimal(dto.totalAmount),
          metadata: dto.metadata || {},
          version: 1,
        },
      });

      this.logger.log(`Order created: ${order.id} on partition slice`);
      return order;
    });
  }

  /**
   * Finds single order by composite key (id, createdAt) for partition pruning,
   * or by id alone using indexed lookups.
   */
  async findById(id: string, createdAt?: Date): Promise<Order> {
    let order: Order | null;

    if (createdAt) {
      // Partition-pruning path: directly routes to specific monthly partition
      order = await this.prisma.order.findUnique({
        where: {
          id_createdAt: {
            id,
            createdAt,
          },
        },
      });
    } else {
      // Scans active partitions using the primary key index
      order = await this.prisma.order.findFirst({
        where: {
          id,
          isDeleted: false,
        },
      });
    }

    if (!order || order.isDeleted) {
      throw new NotFoundException(`Order with id '${id}' not found`);
    }

    return order;
  }

  /**
   * Updates an order with Optimistic Concurrency Control (OCC).
   * Guarantees ACID safety without locking rows, preventing lost updates under extreme concurrency.
   */
  async update(id: string, createdAt: Date, dto: UpdateOrderDto): Promise<Order> {
    return this.prisma.$transaction(async (tx) => {
      // Atomic compare-and-swap update via version match
      const updatedCount = await tx.order.updateMany({
        where: {
          id,
          createdAt,
          version: dto.expectedVersion,
          isDeleted: false,
        },
        data: {
          ...(dto.status && { status: dto.status }),
          ...(dto.totalAmount !== undefined && { totalAmount: new Prisma.Decimal(dto.totalAmount) }),
          ...(dto.metadata && { metadata: dto.metadata }),
          version: { increment: 1 },
          updatedAt: new Date(),
        },
      });

      if (updatedCount.count === 0) {
        // Distinguish between Not Found and Concurrent Modification Conflict
        const existing = await tx.order.findUnique({
          where: { id_createdAt: { id, createdAt } },
        });

        if (!existing || existing.isDeleted) {
          throw new NotFoundException(`Order ${id} does not exist`);
        }

        throw new ConflictException(
          `Conflict: Order ${id} was modified concurrently (expected version ${dto.expectedVersion}, current version ${existing.version})`,
        );
      }

      // Fetch the updated instance
      const refreshed = await tx.order.findUnique({
        where: { id_createdAt: { id, createdAt } },
      });

      return refreshed!;
    });
  }

  /**
   * Soft-Deletes an order while preserving audit trail and triggering CDC tombstone event.
   */
  async softDelete(id: string, createdAt: Date, expectedVersion: number): Promise<void> {
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
        throw new NotFoundException(`Order ${id} does not exist or is already deleted`);
      }
      throw new ConflictException(`Concurrent update conflict on soft-deleting order ${id}`);
    }

    this.logger.log(`Order ${id} soft-deleted successfully.`);
  }
}
