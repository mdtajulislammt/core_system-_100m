#!/usr/bin/env bash
# ============================================================================
# RUN 100M RECORD DATABASE SEED
# Usage:
#   ./database/run_seed_100m.sh [BATCH_SIZE] [TOTAL_RECORDS]
# Examples:
#   ./database/run_seed_100m.sh 500000 100000000   # Full 100M load
#   ./database/run_seed_100m.sh 100000 1000000     # Quick 1M smoke test
# ============================================================================

set -euo pipefail

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-orders_db}"
PGPASSWORD="${PGPASSWORD:-postgres}"
export PGPASSWORD

BATCH_SIZE="${1:-500000}"
TOTAL_RECORDS="${2:-100000000}"

echo "===================================================================="
echo "Connecting to PostgreSQL: ${DB_HOST}:${DB_PORT}/${DB_NAME}"
echo "Seeding Target: ${TOTAL_RECORDS} records (Batch Size: ${BATCH_SIZE})"
echo "===================================================================="

# 0. Ensure database exists
echo "[0/3] Ensuring database '${DB_NAME}' exists..."
psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" | grep -q 1 || \
psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d postgres -c "CREATE DATABASE ${DB_NAME};"

# 1. Apply DDL and ensure partitions exist
echo "[1/3] Ensuring tables and 2026 monthly partitions exist..."
psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -f "$(dirname "$0")/ddl.sql" > /dev/null

# 2. Register Stored Procedure
echo "[2/3] Installing seed procedure..."
psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -f "$(dirname "$0")/seed_100m.sql" > /dev/null

# 3. Execute Seeder with session tuning
echo "[3/3] Executing 100M bulk seed procedure..."
psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -v ON_ERROR_STOP=1 <<EOSQL
SET client_min_messages = NOTICE;
SET maintenance_work_mem = '2GB';
CALL seed_100m_orders(${BATCH_SIZE}, ${TOTAL_RECORDS});
EOSQL

echo "===================================================================="
echo "Verifying row counts per monthly partition:"
echo "===================================================================="
psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "
ANALYZE orders;
SELECT
    inhrelid::regclass AS partition_name,
    c.reltuples::bigint AS approximate_row_count
FROM pg_inherits
JOIN pg_class c ON c.oid = inhrelid
WHERE inhparent = 'orders'::regclass
ORDER BY partition_name;
"
