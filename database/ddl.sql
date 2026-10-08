-- ============================================================================
-- HIGH-SCALE POSTGRESQL ARCHITECTURE & DDL (100M RECORD SCALE)
-- Partitioning Strategy: Declarative Range Partitioning by `created_at` (Monthly)
-- ============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Define Custom Enums
DO $$ BEGIN
    CREATE TYPE order_status AS ENUM (
        'PENDING',
        'PROCESSING',
        'COMPLETED',
        'CANCELLED',
        'REFUNDED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Master Partitioned Table Definition
-- Note: In PostgreSQL declarative partitioning, any UNIQUE or PRIMARY KEY
-- constraint MUST include all columns from the partition key (`created_at`).
CREATE TABLE IF NOT EXISTS orders (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    order_number VARCHAR(64) NOT NULL,
    customer_id UUID NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    status order_status NOT NULL DEFAULT 'PENDING',
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ NULL,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT pk_orders PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- 4. Initial Partitions Provisioning (Monthly Slices)
-- Partitions for 2026 quarters/months
CREATE TABLE IF NOT EXISTS orders_y2026m01 PARTITION OF orders
    FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2026-02-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS orders_y2026m02 PARTITION OF orders
    FOR VALUES FROM ('2026-02-01 00:00:00+00') TO ('2026-03-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS orders_y2026m03 PARTITION OF orders
    FOR VALUES FROM ('2026-03-01 00:00:00+00') TO ('2026-04-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS orders_y2026m04 PARTITION OF orders
    FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-05-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS orders_y2026m05 PARTITION OF orders
    FOR VALUES FROM ('2026-05-01 00:00:00+00') TO ('2026-06-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS orders_y2026m06 PARTITION OF orders
    FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS orders_y2026m07 PARTITION OF orders
    FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS orders_y2026m08 PARTITION OF orders
    FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS orders_y2026m09 PARTITION OF orders
    FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS orders_y2026m10 PARTITION OF orders
    FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS orders_y2026m11 PARTITION OF orders
    FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS orders_y2026m12 PARTITION OF orders
    FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');

-- Default Partition as safety catch for unexpected timestamp bounds
CREATE TABLE IF NOT EXISTS orders_default PARTITION OF orders DEFAULT;

-- ============================================================================
-- 5. COMPOSITE B-TREE INDEXES (OPTIMIZED FOR O(1) KEYSET PAGINATION)
-- ============================================================================

-- A. Primary Cursor Pagination Index by Status
-- Order: (status, created_at DESC, id DESC)
-- Rationale:
-- 1. `status` matches exact equality filter.
-- 2. `created_at DESC` matches descending sort order and range boundary.
-- 3. `id DESC` guarantees deterministic tie-breaker for identical timestamps.
-- 4. Partial index `WHERE is_deleted = FALSE` eliminates 100% of soft-deleted rows
--    from index pages, maximizing buffer pool hit rates and preventing index bloat.
CREATE INDEX IF NOT EXISTS idx_orders_status_created_id
    ON orders (status, created_at DESC, id DESC)
    WHERE is_deleted = FALSE;

-- B. Customer Keyset Pagination Index
CREATE INDEX IF NOT EXISTS idx_orders_customer_created_id
    ON orders (customer_id, created_at DESC, id DESC)
    WHERE is_deleted = FALSE;

-- C. Tenant-level Order Number lookup (Hot OLTP Path)
CREATE INDEX IF NOT EXISTS idx_orders_tenant_ordernum
    ON orders (tenant_id, order_number)
    WHERE is_deleted = FALSE;

-- D. CDC Timestamp Sync Index (Used by Debezium/Log Catchup if falling back to JDBC)
CREATE INDEX IF NOT EXISTS idx_orders_updated_at
    ON orders (updated_at ASC);

-- ============================================================================
-- 6. HIGH-CONCURRENCY STORAGE & VACUUM TUNING (100M WORKLOAD)
-- ============================================================================

-- HOT (Heap-Only Tuples) update optimization:
-- In PostgreSQL declarative partitioning, storage parameters must be applied to leaf partitions.
DO $$
DECLARE
    part RECORD;
BEGIN
    FOR part IN
        SELECT inhrelid::regclass::text AS tablename
        FROM pg_inherits
        WHERE inhparent = 'orders'::regclass
    LOOP
        EXECUTE format('ALTER TABLE %s SET (
            fillfactor = 90,
            autovacuum_vacuum_scale_factor = 0.02,
            autovacuum_analyze_scale_factor = 0.01,
            autovacuum_vacuum_cost_limit = 2000,
            autovacuum_vacuum_cost_delay = 2
        )', part.tablename);
    END LOOP;
END $$;

-- ============================================================================
-- 7. AUTOMATED PARTITION MAINTENANCE (PL/pgSQL PROCEDURE)
-- Pre-creates rolling partitions 3 months in advance
-- ============================================================================
CREATE OR REPLACE PROCEDURE create_next_months_partitions(months_ahead INT DEFAULT 3)
LANGUAGE plpgsql
AS $$
DECLARE
    target_date DATE;
    partition_start TEXT;
    partition_end TEXT;
    partition_name TEXT;
    sql_stmt TEXT;
BEGIN
    FOR i IN 1..months_ahead LOOP
        target_date := (date_trunc('month', CURRENT_DATE) + (i || ' month')::INTERVAL)::DATE;
        partition_name := 'orders_y' || to_char(target_date, 'YYYY') || 'm' || to_char(target_date, 'MM');
        partition_start := to_char(target_date, 'YYYY-MM-DD 00:00:00+00');
        partition_end := to_char((target_date + '1 month'::INTERVAL)::DATE, 'YYYY-MM-DD 00:00:00+00');

        sql_stmt := format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF orders FOR VALUES FROM (%L) TO (%L);',
            partition_name, partition_start, partition_end
        );
        EXECUTE sql_stmt;
        RAISE NOTICE 'Partition % verified or created.', partition_name;
    END LOOP;
END;
$$;
