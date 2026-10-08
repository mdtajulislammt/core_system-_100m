import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { Order } from '@prisma/client';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  async getOrders(@Query() query: QueryOrdersDto): Promise<PaginatedResponseDto<Order>> {
    return this.ordersService.findMany(query);
  }

  @Get('raw')
  async getOrdersRaw(@Query() query: QueryOrdersDto): Promise<PaginatedResponseDto<Order>> {
    return this.ordersService.findManyRawKeyset(query);
  }

  @Get(':id')
  async getOrderById(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('createdAt') createdAt?: string,
  ): Promise<Order> {
    const parsedDate = createdAt ? new Date(createdAt) : undefined;
    return this.ordersService.findById(id, parsedDate);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createOrder(@Body() dto: CreateOrderDto): Promise<Order> {
    return this.ordersService.create(dto);
  }

  @Patch(':id')
  async updateOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('createdAt') createdAtStr: string,
    @Body() dto: UpdateOrderDto,
  ): Promise<Order> {
    const createdAt = new Date(createdAtStr);
    return this.ordersService.update(id, createdAt, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async softDeleteOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('createdAt') createdAtStr: string,
    @Query('expectedVersion') expectedVersionStr: string,
  ): Promise<void> {
    const createdAt = new Date(createdAtStr);
    const expectedVersion = parseInt(expectedVersionStr, 10);
    await this.ordersService.softDelete(id, createdAt, expectedVersion);
  }
}
