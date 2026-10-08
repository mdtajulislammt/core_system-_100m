import { SearchService, PaginatedSearchResponse, ElasticsearchOrderHit } from './search.service';
import { SearchOrdersDto } from './dto/search-orders.dto';
export declare class SearchController {
    private readonly searchService;
    constructor(searchService: SearchService);
    searchOrders(dto: SearchOrdersDto): Promise<PaginatedSearchResponse<ElasticsearchOrderHit>>;
}
