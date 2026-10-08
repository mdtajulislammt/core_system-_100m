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
var SearchService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SearchService = void 0;
const common_1 = require("@nestjs/common");
const elasticsearch_1 = require("@elastic/elasticsearch");
let SearchService = SearchService_1 = class SearchService {
    logger = new common_1.Logger(SearchService_1.name);
    client;
    indexName = 'orders_v1';
    constructor() {
        this.client = new elasticsearch_1.Client({
            node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
            auth: process.env.ELASTICSEARCH_API_KEY
                ? { apiKey: process.env.ELASTICSEARCH_API_KEY }
                : process.env.ELASTICSEARCH_USERNAME
                    ? {
                        username: process.env.ELASTICSEARCH_USERNAME,
                        password: process.env.ELASTICSEARCH_PASSWORD || '',
                    }
                    : undefined,
            maxRetries: 3,
            requestTimeout: 5000,
            sniffOnStart: false,
        });
    }
    async onModuleInit() {
        try {
            const ping = await this.client.ping();
            this.logger.log(`Connected to Elasticsearch cluster: ${ping}`);
        }
        catch (err) {
            this.logger.error('Failed to connect to Elasticsearch cluster on startup', err);
        }
    }
    async searchOrders(dto) {
        const { query, status, tenantId, limit = 20, searchAfter } = dto;
        const filterClauses = [
            { term: { is_deleted: false } },
        ];
        if (status) {
            filterClauses.push({ term: { status } });
        }
        if (tenantId) {
            filterClauses.push({ term: { tenant_id: tenantId } });
        }
        const response = await this.client.search({
            index: this.indexName,
            size: limit,
            sort: [
                { created_at: { order: 'desc' } },
                { id: { order: 'desc' } },
            ],
            search_after: searchAfter && searchAfter.length > 0 ? searchAfter : undefined,
            query: {
                bool: {
                    must: [
                        {
                            bool: {
                                should: [
                                    {
                                        term: {
                                            order_number: {
                                                value: query.toLowerCase(),
                                                boost: 4.0,
                                            },
                                        },
                                    },
                                    {
                                        match: {
                                            'customer_name.autocomplete': {
                                                query,
                                                boost: 3.0,
                                            },
                                        },
                                    },
                                    {
                                        multi_match: {
                                            query,
                                            fields: ['customer_name^2', 'customer_email.text^2'],
                                            fuzziness: 'AUTO',
                                            prefix_length: 2,
                                            max_expansions: 20,
                                        },
                                    },
                                    {
                                        match_phrase_prefix: {
                                            customer_name: {
                                                query,
                                                boost: 2.0,
                                                max_expansions: 10,
                                            },
                                        },
                                    },
                                ],
                                minimum_should_match: 1,
                            },
                        },
                    ],
                    filter: filterClauses,
                },
            },
        });
        const hits = response.hits.hits.map((hit) => hit._source);
        const lastHit = response.hits.hits[response.hits.hits.length - 1];
        const nextSearchAfter = lastHit?.sort;
        return {
            hits,
            totalEstimatedHits: response.hits.total ?? 0,
            searchAfter: nextSearchAfter || null,
            took: response.took,
        };
    }
    async upsertFromCDC(order) {
        try {
            await this.client.index({
                index: this.indexName,
                id: order.id,
                version: order.version,
                version_type: 'external_gte',
                document: order,
            });
            this.logger.debug(`Synced order ${order.id} (version: ${order.version}) to Elasticsearch`);
        }
        catch (error) {
            if (error?.meta?.statusCode === 409) {
                this.logger.warn(`CDC version conflict ignored: Order ${order.id} already has higher/equal version`);
                return;
            }
            this.logger.error(`Failed to index order ${order.id} into Elasticsearch`, error);
            throw error;
        }
    }
    async markDeletedFromCDC(orderId, version) {
        try {
            await this.client.update({
                index: this.indexName,
                id: orderId,
                doc: {
                    is_deleted: true,
                    version,
                    updated_at: new Date().toISOString(),
                },
            });
            this.logger.log(`Marked order ${orderId} as deleted in Elasticsearch`);
        }
        catch (error) {
            if (error?.meta?.statusCode === 404) {
                this.logger.warn(`Order ${orderId} not found in Elasticsearch for deletion`);
                return;
            }
            this.logger.error(`Error deleting order ${orderId} in Elasticsearch`, error);
            throw error;
        }
    }
};
exports.SearchService = SearchService;
exports.SearchService = SearchService = SearchService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], SearchService);
//# sourceMappingURL=search.service.js.map