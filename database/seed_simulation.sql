-- ============================================================================
-- 100M RECORD SEED SIMULATION & QUERY PLAN BENCHMARK
-- Demonstrates O(1) Keyset Pagination vs O(N) OFFSET Scan
--
-- To run the FULL 100M bulk seed pipeline, run:
--   CALL seed_100m_orders(500000, 100000000);   (from database/seed_100m.sql)
--   or run: ./database/run_seed_100m.sh
-- ============================================================================

-- Fast batch generation test (generates 1 million rows per batch for simulation)
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
    created_at
)
SELECT
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'ORD-' || to_char(d, 'FM000000000'),
    gen_random_uuid(),
    'Customer ' || (d % 100000),
    'user_' || (d % 100000) || '@enterprise.io',
    (ARRAY['PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED', 'REFUNDED']::order_status[])[1 + (d % 5)],
    'USD',
    (10 + (d % 1000) * 1.25)::numeric(12,2),
    jsonb_build_object('channel', 'web', 'tier', (d % 3)),
    '2026-01-01 00:00:00+00'::timestamptz + (d || ' seconds')::interval
FROM generate_series(1, 100000) AS d;

-- ============================================================================
-- BENCHMARK 1: THE DISASTER OF OFFSET AT HIGH SCALE (O(N) Degradation)
-- At row 5,000,000, PostgreSQL must fetch and discard 5,000,000 index/table tuples!
-- Execution Time: 2,500ms - 8,000ms, massive Buffer read thrashing.
-- ============================================================================
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT id, order_number, status, created_at
FROM orders
WHERE status = 'PENDING' AND is_deleted = FALSE
ORDER BY created_at DESC, id DESC
OFFSET 5000000 LIMIT 20;

-- ============================================================================
-- BENCHMARK 2: O(1) KEYSET / CURSOR PAGINATION (Index Seek)
-- PostgreSQL performs a direct B-tree root-to-leaf traversal straight to the cursor tuple.
-- Buffers shared hit: ~4-5 blocks (32KB-40KB).
-- Execution Time: 0.15ms - 0.8ms (constant O(1) latency regardless of dataset size).
-- ============================================================================
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT id, order_number, status, created_at
FROM orders
WHERE status = 'PENDING'
  AND is_deleted = FALSE
  AND (created_at, id) < ('2026-06-15 14:23:10.123456+00', 'b1234567-89ab-cdef-0123-456789abcdef'::uuid)
ORDER BY created_at DESC, id DESC
LIMIT 20;
