import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';
import { SearchOrdersDto } from './dto/search-orders.dto';

export interface ElasticsearchOrderHit {
  id: string;
  tenant_id: string;
  order_number: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  status: string;
  currency: string;
  total_amount: number;
  metadata: Record<string, any>;
  is_deleted: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface PaginatedSearchResponse<T> {
  hits: T[];
  totalEstimatedHits: number | { value: number; relation: string };
  searchAfter: (string | number)[] | null;
  took: number;
}

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);
  private readonly client: Client;
  private readonly indexName = 'orders_v1';

  constructor() {
    this.client = new Client({
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

  async onModuleInit(): Promise<void> {
    try {
      const ping = await this.client.ping();
      this.logger.log(`Connected to Elasticsearch cluster: ${ping}`);
    } catch (err) {
      this.logger.error('Failed to connect to Elasticsearch cluster on startup', err);
    }
  }

  /**
   * High-Performance Full-Text & Fuzzy Search with search_after Deep Pagination.
   *
   * Query Mechanics:
   * 1. Multi-match over `order_number` (boost: 4), `customer_name.autocomplete` (boost: 3),
   *    `customer_name` (boost: 2), and `customer_email.text` (boost: 2).
   * 2. AUTO fuzziness with prefix_length: 2 (avoids catastrophic combinatorial expansion).
   * 3. Phrase-prefix matching for live typing.
   * 4. search_after pagination ensures O(1) Lucene segment seek without the 10,000 max_result_window limit.
   */
  async searchOrders(dto: SearchOrdersDto): Promise<PaginatedSearchResponse<ElasticsearchOrderHit>> {
    const { query, status, tenantId, limit = 20, searchAfter } = dto;

    const filterClauses: any[] = [
      { term: { is_deleted: false } },
    ];

    if (status) {
      filterClauses.push({ term: { status } });
    }

    if (tenantId) {
      filterClauses.push({ term: { tenant_id: tenantId } });
    }

    const response = await this.client.search<ElasticsearchOrderHit>({
      index: this.indexName,
      size: limit,
      // search_after requires a deterministic tie-breaker sort
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
                  // Exact match on order number
                  {
                    term: {
                      order_number: {
                        value: query.toLowerCase(),
                        boost: 4.0,
                      },
                    },
                  },
                  // Edge-ngram autocomplete match on customer name
                  {
                    match: {
                      'customer_name.autocomplete': {
                        query,
                        boost: 3.0,
                      },
                    },
                  },
                  // Fuzzy match across customer name and email
                  {
                    multi_match: {
                      query,
                      fields: ['customer_name^2', 'customer_email.text^2'],
                      fuzziness: 'AUTO',
                      prefix_length: 2,
                      max_expansions: 20,
                    },
                  },
                  // Phrase prefix match
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

    const hits = response.hits.hits.map((hit) => hit._source!);
    const lastHit = response.hits.hits[response.hits.hits.length - 1];
    const nextSearchAfter = lastHit?.sort as (string | number)[] | undefined;

    return {
      hits,
      totalEstimatedHits: response.hits.total ?? 0,
      searchAfter: nextSearchAfter || null,
      took: response.took,
    };
  }

  /**
   * Idempotent Upsert with External Versioning.
   * Essential for CDC (Debezium): If Kafka redelivers older events or delivers out-of-order,
   * Elasticsearch rejects the update if incoming version <= existing version.
   */
  async upsertFromCDC(order: ElasticsearchOrderHit): Promise<void> {
    try {
      await this.client.index({
        index: this.indexName,
        id: order.id,
        version: order.version,
        version_type: 'external_gte', // external versioning guarantees no regression
        document: order,
      });
      this.logger.debug(`Synced order ${order.id} (version: ${order.version}) to Elasticsearch`);
    } catch (error: any) {
      if (error?.meta?.statusCode === 409) {
        this.logger.warn(`CDC version conflict ignored: Order ${order.id} already has higher/equal version`);
        return;
      }
      this.logger.error(`Failed to index order ${order.id} into Elasticsearch`, error);
      throw error;
    }
  }

  /**
   * Soft-delete or hard-delete synchronization from CDC.
   */
  async markDeletedFromCDC(orderId: string, version: number): Promise<void> {
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
    } catch (error: any) {
      if (error?.meta?.statusCode === 404) {
        this.logger.warn(`Order ${orderId} not found in Elasticsearch for deletion`);
        return;
      }
      this.logger.error(`Error deleting order ${orderId} in Elasticsearch`, error);
      throw error;
    }
  }
}
