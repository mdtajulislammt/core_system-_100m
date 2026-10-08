-- ============================================================================
-- HIGH-PERFORMANCE 100 MILLION (100M) RECORD SEED PROCEDURE
-- Designed for PostgreSQL 14+ Declarative Partitioned Architecture
-- ============================================================================

-- Drop if exists
DROP PROCEDURE IF EXISTS seed_100m_orders(INT, INT);

/**
 * Stored Procedure: seed_100m_orders
 *
 * Parameters:
 *   - p_batch_size: Number of records per transaction batch (default: 500,000)
 *   - p_total_records: Total records to generate (default: 100,000,000)
 *
 * Engineering Features:
 *   1. Periodic COMMIT after each batch: Prevents WAL bloat and huge undo log memory.
 *   2. Temporarily disables synchronous_commit for the session to 10x write throughput.
 *   3. Spreads timestamps evenly across all 12 monthly partitions of 2026.
 *   4. Emits real-time progress notices with percentage, rows/sec, and elapsed time.
 */
CREATE OR REPLACE PROCEDURE seed_100m_orders(
    p_batch_size INT DEFAULT 500000,
    p_total_records INT DEFAULT 100000000
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_total_batches INT;
    v_batch INT;
    v_start_id BIGINT;
    v_end_id BIGINT;
    v_start_time TIMESTAMPTZ;
    v_batch_start TIMESTAMPTZ;
    v_batch_end TIMESTAMPTZ;
    v_elapsed_sec NUMERIC;
    v_batch_sec NUMERIC;
    v_rate NUMERIC;
    v_total_inserted BIGINT := 0;
    v_base_timestamp TIMESTAMPTZ := '2026-01-01 00:00:00+00';
    -- 365 days / 100,000,000 rows = ~0.31536 seconds per row spacing
    v_step_seconds DOUBLE PRECISION := 31536000.0 / p_total_records;
BEGIN
    v_total_batches := CEIL(p_total_records::NUMERIC / p_batch_size::NUMERIC)::INT;
    v_start_time := clock_timestamp();

    RAISE NOTICE '====================================================================';
    RAISE NOTICE 'STARTING 100M DATA SEEDING';
    RAISE NOTICE 'Total Target Records: %', p_total_records;
    RAISE NOTICE 'Batch Size:           %', p_batch_size;
    RAISE NOTICE 'Total Batches:        %', v_total_batches;
    RAISE NOTICE 'Target Date Range:    2026-01-01 to 2026-12-31 across 12 monthly partitions';
    RAISE NOTICE '====================================================================';

    -- Session-level optimizations for bulk loading
    PERFORM set_config('synchronous_commit', 'off', false);
    PERFORM set_config('work_mem', '128MB', false);

    FOR v_batch IN 1..v_total_batches LOOP
        v_batch_start := clock_timestamp();
        v_start_id := ((v_batch - 1)::BIGINT * p_batch_size) + 1;
        v_end_id := LEAST(v_batch::BIGINT * p_batch_size, p_total_records::BIGINT);

        -- Insert batch using set-returning generate_series
        INSERT INTO orders (
            tenant_id,
            order_number,
            customer_id,
            customer_name,
            customer_email,
            status,
            currency,
            total_amount,
            metadata,
            is_deleted,
            version,
            created_at,
            updated_at
        )
        SELECT
            -- 10 synthetic tenant UUIDs
            ('a0000000-0000-0000-0000-' || lpad((1 + (s % 10))::text, 12, '0'))::uuid AS tenant_id,
            -- Formatted zero-padded order number
            ('ORD-2026-' || lpad(s::text, 9, '0')) AS order_number,
            -- Customer ID pooled over 1,000,000 unique customers for realistic Cardinality
            ('c0000000-0000-0000-0000-' || lpad((1 + (s % 1000000))::text, 12, '0'))::uuid AS customer_id,
            ('Customer ' || (s % 1000000)) AS customer_name,
            ('buyer_' || (s % 1000000) || '@enterprise.io') AS customer_email,
            -- Realistic status distribution: 60% COMPLETED, 15% PROCESSING, 10% PENDING, 10% CANCELLED, 5% REFUNDED
            CASE (s % 20)
                WHEN 0 THEN 'PENDING'::order_status
                WHEN 1 THEN 'PENDING'::order_status
                WHEN 2 THEN 'PROCESSING'::order_status
                WHEN 3 THEN 'PROCESSING'::order_status
                WHEN 4 THEN 'PROCESSING'::order_status
                WHEN 5 THEN 'CANCELLED'::order_status
                WHEN 6 THEN 'CANCELLED'::order_status
                WHEN 7 THEN 'REFUNDED'::order_status
                ELSE 'COMPLETED'::order_status
            END AS status,
            -- Currency distribution
            CASE (s % 5)
                WHEN 0 THEN 'EUR'
                WHEN 1 THEN 'GBP'
                ELSE 'USD'
            END AS currency,
            -- Total amount between $9.99 and $1500.00
            (10.00 + ((s % 149000)::numeric / 100.00)) AS total_amount,
            -- Fast JSONB metadata object
            jsonb_build_object(
                'channel', CASE (s % 3) WHEN 0 THEN 'web' WHEN 1 THEN 'mobile' ELSE 'pos' END,
                'items_count', 1 + (s % 7),
                'priority', (s % 4 = 0)
            ) AS metadata,
            FALSE AS is_deleted,
            1 AS version,
            -- Chronological timestamp distribution across 2026
            (v_base_timestamp + ((s * v_step_seconds) || ' seconds')::interval) AS created_at,
            (v_base_timestamp + (((s * v_step_seconds) + 1800) || ' seconds')::interval) AS updated_at
        FROM generate_series(v_start_id, v_end_id) AS s;

        v_total_inserted := v_total_inserted + (v_end_id - v_start_id + 1);

        -- CRUCIAL: Commit transaction after each batch to release WAL buffers and memory
        COMMIT;

        v_batch_end := clock_timestamp();
        v_batch_sec := EXTRACT(EPOCH FROM (v_batch_end - v_batch_start));
        v_elapsed_sec := EXTRACT(EPOCH FROM (v_batch_end - v_start_time));
        v_rate := ROUND((v_end_id - v_start_id + 1) / GREATEST(v_batch_sec, 0.001));

        -- Real-time progress reporting every batch
        RAISE NOTICE 'Batch %/% completed | Inserted: %/% (% %%) | Batch Speed: % rows/sec | Elapsed: % min',
            v_batch,
            v_total_batches,
            v_total_inserted,
            p_total_records,
            ROUND((v_total_inserted::NUMERIC / p_total_records::NUMERIC) * 100, 2),
            v_rate,
            ROUND(v_elapsed_sec / 60.0, 2);

    END LOOP;

    -- Reset session configs
    PERFORM set_config('synchronous_commit', 'on', false);

    RAISE NOTICE '====================================================================';
    RAISE NOTICE '100M SEED COMPLETED SUCCESSFULLY!';
    RAISE NOTICE 'Total Records: %', v_total_inserted;
    RAISE NOTICE 'Total Time:    % minutes', ROUND(EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) / 60.0, 2);
    RAISE NOTICE '====================================================================';
END;
$$;
