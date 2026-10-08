import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/orders_db?connection_limit=10',
    },
  },
});

async function main() {
  const batchSize = parseInt(process.env.SEED_BATCH_SIZE || '100000', 10); // 1 Lakh (100k) per batch
  const totalRecords = parseInt(process.env.SEED_TOTAL_RECORDS || '100000000', 10); // 100M records
  const concurrency = parseInt(process.env.SEED_CONCURRENCY || '2', 10); // 2 parallel pipelines

  console.log('========================================================================================');
  console.log('🚀 HIGH-THROUGHPUT STREAMING 100M DATABASE SEEDER');
  console.log(`🎯 Target Records:     ${totalRecords.toLocaleString()}`);
  console.log(`📦 Batch Size:         ${batchSize.toLocaleString()} (1 Lakh rows per batch)`);
  console.log(`⚡ Concurrency Level:  ${concurrency} parallel worker streams`);
  console.log('========================================================================================');

  // Handle graceful cancellation (Ctrl+C)
  let isInterrupted = false;
  process.on('SIGINT', async () => {
    console.log('\n⚠️ Interruption received (Ctrl+C). Waiting for active batch to finish safely...');
    isInterrupted = true;
  });

  // Check where we can resume from
  let startFrom = 1;
  try {
    const lastRecord: any = await prisma.$queryRawUnsafe(`
      SELECT order_number
      FROM orders
      ORDER BY created_at DESC, id DESC
      LIMIT 1;
    `);

    if (lastRecord.length > 0 && lastRecord[0].order_number) {
      const match = lastRecord[0].order_number.match(/ORD-2026-(\d+)/);
      if (match) {
        const lastId = parseInt(match[1], 10);
        if (lastId < totalRecords) {
          startFrom = lastId + 1;
          console.log(`🔄 [Auto-Resume] Found existing data up to order #${lastId.toLocaleString()}.`);
          console.log(`⏩ Resuming automatically from record #${startFrom.toLocaleString()}...\n`);
        } else {
          console.log(`✅ Table already contains ${lastId.toLocaleString()} records (Target reached!).\n`);
          await printPartitionSummary();
          return;
        }
      }
    }
  } catch (err) {
    console.log('ℹ️ Starting fresh seed from record #1.\n');
  }

  const overallStartTime = Date.now();
  let totalInsertedThisSession = 0;
  let currentRecordPointer = startFrom;
  let batchIndex = 0;

  async function executeSingleBatch(startId: number, endId: number): Promise<number> {
    const count = endId - startId + 1;
    await prisma.$executeRawUnsafe(`
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
          ('a0000000-0000-0000-0000-' || lpad((1 + (s % 10))::text, 12, '0'))::uuid,
          ('ORD-2026-' || lpad(s::text, 9, '0')),
          ('c0000000-0000-0000-0000-' || lpad((1 + (s % 1000000))::text, 12, '0'))::uuid,
          ('Customer ' || (s % 1000000)),
          ('buyer_' || (s % 1000000) || '@enterprise.io'),
          (ARRAY['PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED', 'REFUNDED']::order_status[])[1 + (s % 5)],
          (ARRAY['USD', 'EUR', 'GBP']::text[])[1 + (s % 3)],
          (10.00 + ((s % 149000)::numeric / 100.00)),
          '{"channel":"web","tier":"gold"}'::jsonb,
          FALSE,
          1,
          ('2026-01-01 00:00:00+00'::timestamptz + ((s * 0.31536) || ' seconds')::interval),
          ('2026-01-01 00:30:00+00'::timestamptz + ((s * 0.31536) || ' seconds')::interval)
      FROM generate_series(${startId}, ${endId}) AS s;
    `);
    return count;
  }

  try {
    while (currentRecordPointer <= totalRecords && !isInterrupted) {
      // Build concurrent tasks
      const batchTasks: Promise<number>[] = [];
      const batchStarts: { start: number; end: number; batchNum: number }[] = [];

      for (let c = 0; c < concurrency && currentRecordPointer <= totalRecords; c++) {
        batchIndex++;
        const startId = currentRecordPointer;
        const endId = Math.min(startId + batchSize - 1, totalRecords);
        currentRecordPointer = endId + 1;

        batchStarts.push({ start: startId, end: endId, batchNum: batchIndex });
      }

      // Execute current concurrent batch window
      const t0 = Date.now();
      const results = await Promise.all(
        batchStarts.map((item) => executeSingleBatch(item.start, item.end))
      );
      const batchDurationSec = (Date.now() - t0) / 1000;

      const batchSum = results.reduce((a, b) => a + b, 0);
      totalInsertedThisSession += batchSum;

      const currentTotal = startFrom - 1 + totalInsertedThisSession;
      const elapsedSec = (Date.now() - overallStartTime) / 1000;
      const overallRate = Math.round(totalInsertedThisSession / Math.max(elapsedSec, 0.001));
      const instantRate = Math.round(batchSum / Math.max(batchDurationSec, 0.001));
      const percent = ((currentTotal / totalRecords) * 100).toFixed(2);
      const remainingRecords = totalRecords - currentTotal;
      const etaMinutes = remainingRecords > 0 ? (remainingRecords / overallRate / 60).toFixed(1) : '0.0';

      // Live terminal progress log
      console.log(
        `[⚡ LIVE LOG] Inserted: ${currentTotal.toLocaleString()} / ${totalRecords.toLocaleString()} (${percent}%) | ` +
        `Speed: ${instantRate.toLocaleString()} rows/s (Avg: ${overallRate.toLocaleString()} rows/s) | ` +
        `Batch: ${batchDurationSec.toFixed(2)}s | Elapsed: ${(elapsedSec / 60).toFixed(1)}m | ETA: ${etaMinutes}m`
      );
    }

    if (isInterrupted) {
      console.log(`\n🛑 Seeding paused by user at record #${(startFrom - 1 + totalInsertedThisSession).toLocaleString()}.`);
      console.log('💡 You can run `npm run seed:ts` again at any time to resume without losing progress.');
    } else {
      console.log('\n🎉 ALL 100,000,000 RECORDS SEEDED SUCCESSFULLY!');
    }

    await printPartitionSummary();
  } catch (error) {
    console.error('\n❌ Seeding encountered an error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

async function printPartitionSummary() {
  try {
    console.log('\n📊 Refreshing PostgreSQL partition table statistics...');
    await prisma.$executeRawUnsafe('ANALYZE orders;');

    const partitionCounts: any = await prisma.$queryRawUnsafe(`
      SELECT
        inhrelid::regclass::text AS partition_name,
        c.reltuples::bigint::text AS estimated_rows
      FROM pg_inherits
      JOIN pg_class c ON c.oid = inhrelid
      WHERE inhparent = 'orders'::regclass
      ORDER BY partition_name;
    `);

    console.log('\nPartition Distribution Summary:');
    console.table(partitionCounts);
  } catch (err) {
    console.error('Failed to print partition summary', err);
  }
}

main();
