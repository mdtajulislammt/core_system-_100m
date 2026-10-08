import { Controller, Get, Query } from '@nestjs/common';
import { SearchService, PaginatedSearchResponse, ElasticsearchOrderHit } from './search.service';
import { SearchOrdersDto } from './dto/search-orders.dto';

@Controller('search/orders')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async searchOrders(@Query() dto: SearchOrdersDto): Promise<PaginatedSearchResponse<ElasticsearchOrderHit>> {
    return this.searchService.searchOrders(dto);
  }
}
