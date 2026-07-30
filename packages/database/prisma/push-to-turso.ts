import { createClient } from '@libsql/client';

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

const statements = [
  `CREATE TABLE IF NOT EXISTS "users" ("id" TEXT NOT NULL PRIMARY KEY, "email" TEXT NOT NULL, "phone" TEXT NOT NULL, "passwordHash" TEXT NOT NULL, "role" TEXT NOT NULL DEFAULT 'CUSTOMER', "isActive" INTEGER NOT NULL DEFAULT 1, "createdAt" TEXT NOT NULL DEFAULT (datetime('now')), "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS "customers" ("id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "name" TEXT NOT NULL, "kycStatus" TEXT NOT NULL DEFAULT 'PENDING', "kycDocuments" TEXT, "address" TEXT, "city" TEXT, "state" TEXT, "pincode" TEXT, "createdAt" TEXT NOT NULL DEFAULT (datetime('now')), "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS "products" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "description" TEXT, "totalValue" INTEGER NOT NULL, "memberCount" INTEGER NOT NULL, "monthlyAmount" INTEGER NOT NULL, "tenureMonths" INTEGER NOT NULL, "isActive" INTEGER NOT NULL DEFAULT 1, "createdAt" TEXT NOT NULL DEFAULT (datetime('now')), "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS "batches" ("id" TEXT NOT NULL PRIMARY KEY, "productId" TEXT NOT NULL, "batchNumber" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'OPEN', "startDate" TEXT NOT NULL, "availableSeats" INTEGER NOT NULL, "createdAt" TEXT NOT NULL DEFAULT (datetime('now')), "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS "batch_members" ("id" TEXT NOT NULL PRIMARY KEY, "batchId" TEXT NOT NULL, "customerId" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'REQUESTED', "currentEmi" INTEGER NOT NULL, "joinedAt" TEXT, "liftedAt" TEXT, "createdAt" TEXT NOT NULL DEFAULT (datetime('now')), "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY ("batchId") REFERENCES "batches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE, FOREIGN KEY ("customerId") REFERENCES "customers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS "payment_schedules" ("id" TEXT NOT NULL PRIMARY KEY, "batchMemberId" TEXT NOT NULL, "monthNumber" INTEGER NOT NULL, "amount" INTEGER NOT NULL, "dueDate" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING', "createdAt" TEXT NOT NULL DEFAULT (datetime('now')), "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY ("batchMemberId") REFERENCES "batch_members" ("id") ON DELETE RESTRICT ON UPDATE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS "payments" ("id" TEXT NOT NULL PRIMARY KEY, "scheduleId" TEXT NOT NULL, "method" TEXT NOT NULL, "amount" INTEGER NOT NULL, "transactionId" TEXT, "screenshotUrl" TEXT, "status" TEXT NOT NULL DEFAULT 'PENDING', "paidAt" TEXT NOT NULL DEFAULT (datetime('now')), "verifiedAt" TEXT, "verifiedBy" TEXT, "rejectedAt" TEXT, "rejectionNote" TEXT, "createdAt" TEXT NOT NULL DEFAULT (datetime('now')), "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY ("scheduleId") REFERENCES "payment_schedules" ("id") ON DELETE RESTRICT ON UPDATE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS "auction_results" ("id" TEXT NOT NULL PRIMARY KEY, "batchId" TEXT NOT NULL, "winnerId" TEXT NOT NULL, "monthNumber" INTEGER NOT NULL, "discount" INTEGER NOT NULL, "prizeAmount" INTEGER NOT NULL, "newEmi" INTEGER NOT NULL, "auctionDate" TEXT NOT NULL, "notes" TEXT, "createdAt" TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY ("batchId") REFERENCES "batches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS "requests" ("id" TEXT NOT NULL PRIMARY KEY, "customerId" TEXT NOT NULL, "type" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING', "metadata" TEXT, "createdAt" TEXT NOT NULL DEFAULT (datetime('now')), "resolvedAt" TEXT, "resolvedBy" TEXT, FOREIGN KEY ("customerId") REFERENCES "customers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS "notifications" ("id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "title" TEXT NOT NULL, "body" TEXT NOT NULL, "channel" TEXT NOT NULL DEFAULT 'PUSH', "isRead" INTEGER NOT NULL DEFAULT 0, "metadata" TEXT, "sentAt" TEXT NOT NULL DEFAULT (datetime('now')), "createdAt" TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS "penalty_rules" ("id" TEXT NOT NULL PRIMARY KEY, "productId" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT, "penaltyType" TEXT NOT NULL, "value" REAL NOT NULL, "gracePeriodDays" INTEGER NOT NULL DEFAULT 0, "isActive" INTEGER NOT NULL DEFAULT 1, FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS "settings" ("id" TEXT NOT NULL PRIMARY KEY, "key" TEXT NOT NULL, "value" TEXT NOT NULL, "grp" TEXT NOT NULL DEFAULT 'general')`,
  `CREATE TABLE IF NOT EXISTS "audit_logs" ("id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT, "action" TEXT NOT NULL, "entity" TEXT NOT NULL, "entityId" TEXT, "oldValue" TEXT, "newValue" TEXT, "ipAddress" TEXT, "createdAt" TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_key" ON "users"("phone")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "customers_userId_key" ON "customers"("userId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "batches_productId_batchNumber_key" ON "batches"("productId", "batchNumber")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "batch_members_batchId_customerId_key" ON "batch_members"("batchId", "customerId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "payment_schedules_batchMemberId_monthNumber_key" ON "payment_schedules"("batchMemberId", "monthNumber")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "payments_scheduleId_key" ON "payments"("scheduleId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "auction_results_batchId_monthNumber_key" ON "auction_results"("batchId", "monthNumber")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "settings_key_key" ON "settings"("key")`,
];

async function main() {
  console.log('Pushing schema to Turso...');
  console.log('URL:', process.env.TURSO_DATABASE_URL);

  for (const sql of statements) {
    try {
      await client.execute(sql);
      const tableName = sql.match(/"(\w+)"/)?.[1] || 'index';
      console.log(`  ✓ ${tableName}`);
    } catch (err: any) {
      console.error(`  ✗ Error:`, err.message);
    }
  }

  console.log('\nSchema push complete!');
}

main().catch(console.error);
