# Chit Fund Management System — Complete Rebuild Architecture

> Based on: Full audit of existing codebase (42 API files, 21 frontend files, database schema),
> domain research (Chit Funds Act 1982, industry software patterns from Axinosys, GenericChit, ChitPro, ChitsApp)

---

## 1. CHIT FUND DOMAIN MODEL (How It Actually Works)

### Core Business Flow

```
1. PRODUCT CREATION (Admin defines a scheme template)
   ₹1,00,000 chit | 20 members | 20 months | ₹5,000/month

2. GROUP CREATION (A batch of that product)
   Silver #001 | starts Jan 2027 | 20 seats

3. MEMBER ENROLLMENT (Approval-based)
   Customer requests → Admin verifies KYC → Approves → Assigns ticket number
   Member gets a "Card" (ticket/slot) in the group

4. MONTHLY CYCLE (The core loop - repeats every month)
   a) COLLECTION: Collect installments from all members
   b) AUCTION: Members bid for the prize money (highest discount wins)
   c) SETTLEMENT: Calculate commission, dividend, prize
   d) PAYOUT: Disburse prize to winner minus deductions

5. POST-AUCTION MATH (Every month after auction)
   - Foreman Commission = 5% of chit value (capped by law)
   - Discount = Winner's bid amount (what they sacrifice)
   - Dividend = (Discount - Commission) / (Total Members - 1)
   - Prize Amount = Chit Value - Discount
   - Winner's new EMI = Base EMI (they already got their money)
   - Other members: Next EMI = Base EMI - Dividend (reduced installment)

6. MEMBER STATES
   REQUESTED → APPROVED → ACTIVE → PRIZED (lifted) → COMPLETED
   A "prized" member MUST provide guarantors and continues paying full EMI
   An "unprized" member gets monthly dividend reducing their installment

7. COMPLETION
   After all months done, all members prized → Group closes
```

### Key Domain Concepts

| Concept | Description |
|---------|-------------|
| **Chit Value** | Total pot amount (e.g., ₹1,00,000) |
| **Ticket/Card** | A member's slot. One person can hold multiple tickets |
| **Foreman** | The company operating the chit (earns commission) |
| **Commission** | Foreman's fee, max 5% of chit value per month |
| **Auction/Bid** | Monthly event where members bid discount to win prize |
| **Discount** | Amount the winner sacrifices from the pot |
| **Dividend** | Share of (discount - commission) given to non-prized members |
| **Prize Amount** | Chit Value - Discount (paid to winner) |
| **Prized Member** | Already received the pot. Must provide surety/guarantor |
| **Unprized Member** | Yet to receive. Gets dividend reducing their installment |
| **Installment** | Monthly payment = Base EMI - Dividend (for unprized members) |
| **Defaulter** | Member who missed payments beyond grace period |
| **Surety/Guarantor** | Required from prized members as security |

---

## 2. DATABASE SCHEMA (PostgreSQL - Proper Design)

### Design Principles
- All money in **paise** (integer, divide by 100 for display)
- Proper enums with CHECK constraints
- Immutable financial records (append-only ledger)
- Soft deletes on master data
- Version columns for optimistic locking on mutable counters
- Full audit trail with `createdBy`/`updatedBy`
- Proper foreign keys on ALL references
- Indexes on every query pattern

### Entity Relationship

```
Organization (multi-branch ready)
├── Branch
├── Staff (Admin, BranchAdmin, Collector, Accountant)
└── Product (scheme template)
    └── ChitGroup (batch/instance)
        ├── GroupMember (ticket holder)
        │   ├── Installment (monthly schedule)
        │   │   └── Payment (actual money received)
        │   └── Guarantor (surety for prized members)
        ├── Auction (monthly auction event)
        │   └── AuctionBid (individual bids)
        ├── Payout (money disbursed to winners)
        └── LedgerEntry (double-entry accounting)
```

### Tables

```sql
-- ====== ORGANIZATION & STAFF ======

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  registration_no VARCHAR(100), -- Registrar of Chits registration
  gstin VARCHAR(15),
  pan VARCHAR(10),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(50),
  pincode VARCHAR(6),
  phone VARCHAR(15),
  email VARCHAR(255),
  logo_url TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(20) NOT NULL,
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(50),
  phone VARCHAR(15),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, code)
);

CREATE TYPE staff_role AS ENUM ('SUPER_ADMIN','BRANCH_ADMIN','ACCOUNTANT','COLLECTOR','VIEWER');

CREATE TABLE staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  branch_id UUID REFERENCES branches(id), -- NULL = org-level
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(15) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role staff_role NOT NULL DEFAULT 'VIEWER',
  is_active BOOLEAN DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====== CUSTOMERS ======

CREATE TYPE kyc_status AS ENUM ('PENDING','SUBMITTED','VERIFIED','REJECTED');

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  branch_id UUID REFERENCES branches(id),
  -- Login
  phone VARCHAR(15) NOT NULL,
  email VARCHAR(255),
  password_hash VARCHAR(255) NOT NULL,
  -- Identity
  name VARCHAR(255) NOT NULL,
  father_name VARCHAR(255),
  date_of_birth DATE,
  pan VARCHAR(10),
  aadhaar_last4 VARCHAR(4), -- Only last 4 stored
  -- Address
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(50),
  pincode VARCHAR(6),
  -- KYC
  kyc_status kyc_status DEFAULT 'PENDING',
  kyc_verified_at TIMESTAMPTZ,
  kyc_verified_by UUID REFERENCES staff(id),
  -- Bank (for payouts)
  bank_name VARCHAR(100),
  bank_account_no VARCHAR(20),
  bank_ifsc VARCHAR(11),
  bank_branch VARCHAR(100),
  upi_id VARCHAR(100),
  -- Meta
  photo_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ, -- soft delete

  UNIQUE(org_id, phone)
);

-- ====== PRODUCTS (Scheme Templates) ======

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  chit_value_paise BIGINT NOT NULL, -- ₹1,00,000 = 10000000
  member_count INT NOT NULL,
  tenure_months INT NOT NULL,
  base_installment_paise BIGINT NOT NULL, -- chit_value / tenure_months
  commission_percent NUMERIC(5,2) NOT NULL DEFAULT 5.00, -- max 5% by law
  min_bid_percent NUMERIC(5,2) DEFAULT 0, -- minimum auction bid %
  max_bid_percent NUMERIC(5,2) DEFAULT 40, -- maximum discount allowed
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(org_id, name),
  CHECK(member_count = tenure_months), -- one auction per month
  CHECK(base_installment_paise * tenure_months = chit_value_paise),
  CHECK(commission_percent >= 0 AND commission_percent <= 5),
  CHECK(member_count >= 2)
);

-- ====== CHIT GROUPS (Batches) ======

CREATE TYPE group_status AS ENUM ('DRAFT','OPEN','ACTIVE','FROZEN','COMPLETED','TERMINATED');

CREATE TABLE chit_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  branch_id UUID REFERENCES branches(id),
  product_id UUID NOT NULL REFERENCES products(id),
  group_number VARCHAR(30) NOT NULL, -- e.g., "SIL-2027-001"
  agreement_no VARCHAR(50), -- Legal agreement number
  status group_status DEFAULT 'DRAFT',
  start_date DATE NOT NULL,
  current_month INT DEFAULT 0, -- which month auction we're on
  total_seats INT NOT NULL,
  filled_seats INT DEFAULT 0,
  version INT DEFAULT 1, -- optimistic locking
  -- Calculated totals (denormalized for performance)
  total_collected_paise BIGINT DEFAULT 0,
  total_disbursed_paise BIGINT DEFAULT 0,
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(org_id, group_number),
  CHECK(filled_seats >= 0 AND filled_seats <= total_seats),
  CHECK(current_month >= 0 AND current_month <= total_seats)
);

-- ====== GROUP MEMBERS (Tickets/Cards) ======

CREATE TYPE member_status AS ENUM (
  'REQUESTED','APPROVED','ACTIVE','PRIZED','DEFAULTING','COMPLETED','REJECTED','WITHDRAWN'
);

CREATE TABLE group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES chit_groups(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  ticket_number INT NOT NULL, -- 1, 2, 3... (the "card" number)
  status member_status DEFAULT 'REQUESTED',
  -- Financial state
  base_installment_paise BIGINT NOT NULL, -- snapshot from product at join
  current_installment_paise BIGINT NOT NULL, -- adjusted after dividends
  total_paid_paise BIGINT DEFAULT 0,
  total_dividend_earned_paise BIGINT DEFAULT 0,
  arrears_paise BIGINT DEFAULT 0, -- outstanding balance
  -- Lifecycle dates
  joined_at TIMESTAMPTZ,
  prized_at TIMESTAMPTZ, -- when they won the auction
  prized_month INT, -- which month they won
  completed_at TIMESTAMPTZ,
  -- Approval
  approved_by UUID REFERENCES staff(id),
  approved_at TIMESTAMPTZ,
  -- Meta
  notes TEXT,
  version INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(group_id, ticket_number),
  UNIQUE(group_id, customer_id) -- one ticket per person per group
);

CREATE INDEX idx_group_members_customer ON group_members(customer_id);
CREATE INDEX idx_group_members_status ON group_members(status);

-- ====== INSTALLMENTS (Monthly Payment Schedule) ======

CREATE TYPE installment_status AS ENUM (
  'UPCOMING','DUE','PARTIALLY_PAID','PAID','OVERDUE','WAIVED'
);

CREATE TABLE installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES chit_groups(id),
  member_id UUID NOT NULL REFERENCES group_members(id),
  month_number INT NOT NULL,
  -- Amounts (all in paise)
  base_amount_paise BIGINT NOT NULL, -- original installment
  dividend_paise BIGINT DEFAULT 0, -- dividend credit for this month
  penalty_paise BIGINT DEFAULT 0, -- late fee charged
  net_amount_paise BIGINT NOT NULL, -- base - dividend + penalty (what they actually owe)
  paid_amount_paise BIGINT DEFAULT 0, -- how much collected so far
  balance_paise BIGINT NOT NULL, -- net - paid (what's still outstanding)
  -- Status
  status installment_status DEFAULT 'UPCOMING',
  due_date DATE NOT NULL,
  paid_date DATE, -- when fully settled
  -- Meta
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(member_id, month_number),
  CHECK(month_number >= 1),
  CHECK(balance_paise >= 0)
);

CREATE INDEX idx_installments_status ON installments(status);
CREATE INDEX idx_installments_due_date ON installments(due_date, status);
CREATE INDEX idx_installments_group_month ON installments(group_id, month_number);

-- ====== PAYMENTS (Actual Money Received) ======

CREATE TYPE payment_method AS ENUM ('CASH','UPI','NEFT','CHEQUE','ONLINE_GATEWAY');
CREATE TYPE payment_status AS ENUM ('PENDING','VERIFIED','REJECTED','REVERSED');

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installment_id UUID NOT NULL REFERENCES installments(id),
  receipt_number VARCHAR(50) NOT NULL UNIQUE, -- gapless sequence
  -- Amount
  amount_paise BIGINT NOT NULL CHECK(amount_paise > 0),
  method payment_method NOT NULL,
  -- References
  transaction_ref VARCHAR(100), -- UTR/UPI ref/Cheque no
  screenshot_url TEXT,
  -- Status
  status payment_status DEFAULT 'PENDING',
  -- Dates
  payment_date DATE NOT NULL, -- actual date money was paid
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES staff(id),
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  -- Collection
  collected_by UUID REFERENCES staff(id), -- field agent
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_payments_txn_ref ON payments(transaction_ref)
  WHERE transaction_ref IS NOT NULL; -- partial unique - only non-null refs must be unique
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_installment ON payments(installment_id);

-- ====== AUCTIONS ======

CREATE TYPE auction_status AS ENUM ('SCHEDULED','OPEN','COMPLETED','CANCELLED');

CREATE TABLE auctions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES chit_groups(id),
  month_number INT NOT NULL,
  status auction_status DEFAULT 'SCHEDULED',
  -- Amounts
  chit_value_paise BIGINT NOT NULL, -- snapshot
  commission_paise BIGINT NOT NULL, -- foreman fee for this month
  -- Result (filled after completion)
  winner_id UUID REFERENCES group_members(id),
  winning_bid_paise BIGINT, -- discount amount
  prize_amount_paise BIGINT, -- chit_value - discount
  dividend_per_member_paise BIGINT, -- (discount - commission) / (members - 1)
  -- Dates
  scheduled_date DATE,
  conducted_at TIMESTAMPTZ,
  conducted_by UUID REFERENCES staff(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(group_id, month_number),
  CHECK(month_number >= 1)
);

CREATE TABLE auction_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID NOT NULL REFERENCES auctions(id),
  member_id UUID NOT NULL REFERENCES group_members(id),
  bid_amount_paise BIGINT NOT NULL, -- how much discount they offer
  bid_time TIMESTAMPTZ DEFAULT NOW(),
  is_winner BOOLEAN DEFAULT FALSE,

  UNIQUE(auction_id, member_id) -- one bid per member per auction
);

-- ====== PAYOUTS (Money Disbursed to Winners) ======

CREATE TYPE payout_status AS ENUM ('PENDING','APPROVED','PROCESSING','COMPLETED','FAILED');

CREATE TABLE payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID NOT NULL REFERENCES auctions(id),
  member_id UUID NOT NULL REFERENCES group_members(id),
  -- Amounts
  prize_amount_paise BIGINT NOT NULL,
  deductions_paise BIGINT DEFAULT 0, -- any arrears/penalties deducted
  net_payout_paise BIGINT NOT NULL, -- prize - deductions
  -- Payment details
  method payment_method,
  transaction_ref VARCHAR(100),
  bank_account VARCHAR(20),
  bank_ifsc VARCHAR(11),
  -- Status
  status payout_status DEFAULT 'PENDING',
  approved_by UUID REFERENCES staff(id),
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(auction_id) -- one payout per auction
);

-- ====== GUARANTORS ======

CREATE TABLE guarantors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES group_members(id), -- the prized member
  guarantor_customer_id UUID REFERENCES customers(id), -- if registered
  -- If not a registered customer
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(15),
  address TEXT,
  id_proof_type VARCHAR(50), -- Aadhaar/PAN/Voter ID
  id_proof_number VARCHAR(50),
  id_proof_url TEXT,
  relationship VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  verified_by UUID REFERENCES staff(id),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====== PENALTIES ======

CREATE TABLE penalty_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id),
  name VARCHAR(100) NOT NULL,
  grace_days INT DEFAULT 0,
  penalty_type VARCHAR(20) NOT NULL CHECK(penalty_type IN ('FIXED','PERCENTAGE','PER_DAY')),
  value_paise BIGINT, -- for FIXED or PER_DAY
  value_percent NUMERIC(5,2), -- for PERCENTAGE
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE penalties_applied (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installment_id UUID NOT NULL REFERENCES installments(id),
  rule_id UUID REFERENCES penalty_rules(id),
  amount_paise BIGINT NOT NULL,
  reason TEXT,
  waived BOOLEAN DEFAULT FALSE,
  waived_by UUID REFERENCES staff(id),
  waived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====== DOCUMENTS ======

CREATE TYPE document_type AS ENUM (
  'AADHAAR','PAN','VOTER_ID','PASSPORT','BANK_PROOF',
  'ADDRESS_PROOF','PHOTO','PAYMENT_SCREENSHOT','AGREEMENT','OTHER'
);

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL, -- 'customer', 'payment', 'guarantor'
  entity_id UUID NOT NULL,
  doc_type document_type NOT NULL,
  file_url TEXT NOT NULL,
  file_name VARCHAR(255),
  file_size INT,
  mime_type VARCHAR(100),
  checksum VARCHAR(64), -- SHA-256 for integrity
  uploaded_by UUID, -- staff or customer
  verified BOOLEAN DEFAULT FALSE,
  verified_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_documents_entity ON documents(entity_type, entity_id);

-- ====== LEDGER (Double-Entry Accounting) ======

CREATE TYPE ledger_type AS ENUM ('DEBIT','CREDIT');

CREATE TABLE ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES chit_groups(id),
  -- Entry details
  entry_date DATE NOT NULL,
  narration TEXT NOT NULL,
  entry_type ledger_type NOT NULL,
  amount_paise BIGINT NOT NULL CHECK(amount_paise > 0),
  -- Account heads
  account_head VARCHAR(50) NOT NULL, -- COLLECTION, COMMISSION, DIVIDEND, PAYOUT, PENALTY, REFUND
  -- References
  ref_type VARCHAR(50), -- 'payment', 'payout', 'auction', 'penalty'
  ref_id UUID,
  member_id UUID REFERENCES group_members(id),
  -- Balance (running)
  running_balance_paise BIGINT,
  created_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ledger_group_date ON ledger_entries(group_id, entry_date);
CREATE INDEX idx_ledger_member ON ledger_entries(member_id);
CREATE INDEX idx_ledger_account ON ledger_entries(account_head);

-- ====== NOTIFICATIONS ======

CREATE TYPE notification_channel AS ENUM ('IN_APP','SMS','WHATSAPP','EMAIL','PUSH');
CREATE TYPE notification_status AS ENUM ('QUEUED','SENT','DELIVERED','FAILED','READ');

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_type VARCHAR(20) NOT NULL, -- 'customer' or 'staff'
  recipient_id UUID NOT NULL,
  channel notification_channel NOT NULL,
  -- Content
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  data JSONB, -- action links, metadata
  -- Delivery
  status notification_status DEFAULT 'QUEUED',
  provider_message_id VARCHAR(255),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  failure_reason TEXT,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_recipient ON notifications(recipient_type, recipient_id, status);

-- ====== AUDIT LOG ======

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  actor_type VARCHAR(20) NOT NULL, -- 'staff' or 'customer'
  actor_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL, -- 'CREATE','UPDATE','DELETE','APPROVE','REJECT','LOGIN'
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID,
  changes JSONB, -- { field: { old: x, new: y } }
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_actor ON audit_logs(actor_type, actor_id);
CREATE INDEX idx_audit_time ON audit_logs(created_at DESC);

-- ====== RECEIPTS ======

CREATE TABLE receipt_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  prefix VARCHAR(10) NOT NULL, -- 'RCP', 'PAY'
  current_number BIGINT DEFAULT 0,
  UNIQUE(org_id, prefix)
);
```

---

## 3. API ARCHITECTURE (NestJS)

### Module Structure

```
apps/api/src/
├── main.ts
├── app.module.ts
├── common/
│   ├── guards/          (JwtAuth, Roles, Ownership, Throttle)
│   ├── interceptors/    (AuditLog, Transform, Timeout)
│   ├── decorators/      (CurrentUser, Roles, ApiPaginated)
│   ├── pipes/           (ParsePagination, ValidateEnum)
│   ├── filters/         (GlobalException, PrismaException)
│   ├── middleware/      (RequestLogger, CorrelationId)
│   └── dto/             (PaginationQuery, SortQuery)
├── modules/
│   ├── auth/            (Login, Register, RefreshToken, ForgotPassword)
│   ├── staff/           (Staff CRUD, role management)
│   ├── customer/        (Customer CRUD, KYC workflow, bank details)
│   ├── product/         (Product CRUD with invariant validation)
│   ├── chit-group/      (Group lifecycle, seat management)
│   ├── membership/      (Join flow, approval, ticket assignment)
│   ├── installment/     (Schedule generation, due date management)
│   ├── payment/         (Collection, verification, receipt generation)
│   ├── auction/         (Auction lifecycle, bidding, settlement)
│   ├── payout/          (Prize disbursement, approval workflow)
│   ├── dividend/        (Calculation, distribution, EMI adjustment)
│   ├── penalty/         (Rule management, auto-calculation, waiver)
│   ├── guarantor/       (Surety management for prized members)
│   ├── document/        (Upload, verification, S3 integration)
│   ├── ledger/          (Double-entry recording, trial balance)
│   ├── notification/    (Multi-channel, templates, delivery tracking)
│   ├── report/          (Collection, defaulter, batch, member reports)
│   ├── settings/        (Org configuration, penalty rules)
│   └── audit/           (Log viewer, search, export)
├── jobs/                (Cron: overdue marking, reminders, report generation)
└── prisma/              (PrismaService, health check)
```

### Security Architecture

```
┌─────────────────────────────────────────────┐
│  Request Pipeline                            │
├─────────────────────────────────────────────┤
│ 1. Helmet (security headers)                │
│ 2. CORS (strict origin)                     │
│ 3. Rate Limiter (per IP, per user)          │
│ 4. Request Logger (correlation ID)          │
│ 5. JWT Validation (DB lookup on every req)  │
│ 6. Role Guard (staff_role enum check)       │
│ 7. Ownership Guard (tenant + resource)      │
│ 8. DTO Validation (class-validator strict)  │
│ 9. Business Logic                           │
│ 10. Audit Interceptor (log mutations)       │
│ 11. Response Transform (strip internals)    │
└─────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Auth**: Access token (15min) + Refresh token (7d) stored in httpOnly cookies (NOT localStorage). Token has a `version` field; any password change / deactivation increments version, invalidating all existing tokens instantly.

2. **Multi-tenancy**: Every query is scoped by `org_id`. Staff can only see their org's data. Branch-level staff further scoped by `branch_id`.

3. **Ownership**: A dedicated `OwnershipGuard` that resolves the resource's `org_id` and `branch_id` and compares against the authenticated user's scope. No more ad-hoc `if (customerId !== ...)` scattered in services.

4. **Money**: All amounts in paise (BIGINT). Never float. Display formatting is frontend-only. Arithmetic uses integer math with explicit rounding rules for dividends.

5. **Idempotency**: All mutation endpoints accept `Idempotency-Key` header. Duplicate submissions return the cached response.

6. **Optimistic Locking**: Mutable counters (`filled_seats`, `balance_paise`) use `version` column. Update includes `WHERE version = :expectedVersion`.

7. **Transactions**: Every multi-step financial operation (auction settlement, payment verification, payout) is a single DB transaction with all checks inside.

---

## 4. AUCTION SETTLEMENT (The Core Algorithm)

```typescript
async settleAuction(auctionId: string, winnerId: string, bidAmount: bigint) {
  return this.prisma.$transaction(async (tx) => {
    // 1. Lock the auction row
    const auction = await tx.auction.findUniqueOrThrow({ where: { id: auctionId } });
    if (auction.status !== 'OPEN') throw new ConflictException('Auction not open');

    // 2. Validate winner eligibility
    const winner = await tx.groupMember.findUniqueOrThrow({ where: { id: winnerId } });
    if (winner.status !== 'ACTIVE') throw new BadRequestException('Member not eligible');
    if (winner.prized_at) throw new BadRequestException('Already prized');

    // 3. Calculate settlement
    const commission = (auction.chit_value_paise * BigInt(product.commission_percent * 100)) / 10000n;
    const dividend = (bidAmount - commission) / BigInt(totalMembers - 1);
    const prizeAmount = auction.chit_value_paise - bidAmount;

    // 4. Update auction result
    await tx.auction.update({
      where: { id: auctionId },
      data: {
        status: 'COMPLETED',
        winner_id: winnerId,
        winning_bid_paise: bidAmount,
        prize_amount_paise: prizeAmount,
        dividend_per_member_paise: dividend,
        commission_paise: commission,
        conducted_at: new Date(),
      },
    });

    // 5. Mark winner as PRIZED
    await tx.groupMember.update({
      where: { id: winnerId },
      data: { status: 'PRIZED', prized_at: new Date(), prized_month: auction.month_number },
    });

    // 6. Apply dividend to all unprized members' next installment
    const unprizedMembers = await tx.groupMember.findMany({
      where: { group_id: auction.group_id, status: 'ACTIVE' },
    });
    for (const member of unprizedMembers) {
      await tx.installment.updateMany({
        where: { member_id: member.id, month_number: auction.month_number + 1 },
        data: {
          dividend_paise: dividend,
          net_amount_paise: { decrement: Number(dividend) },
          balance_paise: { decrement: Number(dividend) },
        },
      });
    }

    // 7. Create payout record for winner
    await tx.payout.create({
      data: {
        auction_id: auctionId,
        member_id: winnerId,
        prize_amount_paise: prizeAmount,
        net_payout_paise: prizeAmount, // deductions applied separately
        status: 'PENDING',
      },
    });

    // 8. Ledger entries (double-entry)
    await tx.ledgerEntry.createMany({ data: [
      { group_id, entry_type: 'DEBIT', amount_paise: commission, account_head: 'COMMISSION', narration: `Month ${auction.month_number} commission` },
      { group_id, entry_type: 'CREDIT', amount_paise: dividend * BigInt(unprizedMembers.length), account_head: 'DIVIDEND', narration: `Month ${auction.month_number} dividend distribution` },
      { group_id, entry_type: 'DEBIT', amount_paise: prizeAmount, account_head: 'PAYOUT', narration: `Prize to ticket #${winner.ticket_number}`, member_id: winnerId },
    ]});

    // 9. Advance group month counter
    await tx.chitGroup.update({
      where: { id: auction.group_id },
      data: { current_month: auction.month_number },
    });
  });
}
```

---

## 5. FRONTEND ARCHITECTURE (Next.js 14 App Router)

### Route Structure

```
apps/web/src/app/
├── (auth)/
│   ├── login/
│   ├── register/
│   └── forgot-password/
├── (customer)/
│   ├── dashboard/           -- overview: active chits, upcoming payments, notifications
│   ├── chits/
│   │   ├── available/       -- browse open groups, request to join
│   │   └── [id]/            -- detailed chit view: schedule, dividends, auction history
│   ├── payments/            -- payment history, receipts download
│   ├── profile/             -- edit profile, KYC upload, bank details
│   └── notifications/
├── (admin)/
│   ├── dashboard/           -- KPIs: collection rate, pending approvals, defaulters
│   ├── customers/
│   │   ├── page.tsx         -- customer list with search/filter
│   │   └── [id]/            -- full customer profile, all their chits
│   ├── products/            -- product CRUD
│   ├── groups/
│   │   ├── page.tsx         -- all groups with status filter
│   │   └── [id]/
│   │       ├── members/     -- member list, payment status grid
│   │       ├── auctions/    -- conduct auction, history
│   │       ├── payments/    -- collect/verify payments for this group
│   │       └── ledger/      -- group ledger view
│   ├── collections/         -- today's collections, pending verifications
│   ├── auctions/            -- upcoming & recent auctions across groups
│   ├── payouts/             -- pending payouts, approval queue
│   ├── requests/            -- join requests, KYC approvals
│   ├── reports/             -- all report types with date/group filters
│   ├── settings/            -- org config, penalty rules, notification templates
│   └── audit-log/           -- searchable audit trail
└── api/                     -- Next.js API routes (if needed for BFF)
```

### Key Frontend Patterns

1. **Auth**: httpOnly cookie-based. Middleware.ts handles route protection server-side. No localStorage tokens.
2. **Data Fetching**: TanStack Query with proper error boundaries, loading skeletons, and hierarchical cache keys (`['groups', groupId, 'members']`).
3. **Forms**: React Hook Form + Zod (shared schemas from packages/shared). Server-side validation always the source of truth.
4. **Optimistic Updates**: For payment verification queue (rapid-fire admin actions).
5. **Real-time**: Server-Sent Events for notification badges and live collection tracking.
6. **Accessibility**: Proper ARIA labels, keyboard navigation, screen reader announcements for all actions.
7. **Error Handling**: Global error boundary, per-query error states with retry, toast for mutations, proper 401 → redirect flow.

---

## 6. IMPLEMENTATION PHASES

### Phase 1: Foundation (2-3 weeks)
- [ ] PostgreSQL schema with all tables, constraints, indexes
- [ ] NestJS: Auth (staff + customer), Guards, Audit interceptor
- [ ] Product CRUD, Group lifecycle (draft → open → active)
- [ ] Customer management with KYC flow
- [ ] Member enrollment (join → approve → assign ticket)
- [ ] Installment schedule generation
- [ ] Payment collection + verification workflow
- [ ] Admin: Dashboard, Customer list, Group detail, Payment queue
- [ ] Customer: Dashboard, My chits, Payment upload

### Phase 2: Auction & Financial Core (2 weeks)
- [ ] Auction module (schedule, conduct, record bids, settle)
- [ ] Dividend calculation and EMI adjustment
- [ ] Payout workflow (approve → process → complete)
- [ ] Guarantor management for prized members
- [ ] Ledger entries (auto-generated on financial events)
- [ ] Receipt generation (gapless numbering)
- [ ] Penalty rules + auto-calculation

### Phase 3: Operations & Reports (1-2 weeks)
- [ ] Cron jobs: overdue marking, payment reminders
- [ ] Notification system (in-app + SMS/WhatsApp)
- [ ] Reports: Collection, Defaulter, Batch summary, Member ledger
- [ ] PDF/CSV export
- [ ] Document management (S3 upload, signed URLs)
- [ ] Settings panel

### Phase 4: Scale & Polish (1-2 weeks)
- [ ] Multi-branch support
- [ ] Advanced roles (Collector, Accountant)
- [ ] Bulk operations (bulk collection entry)
- [ ] Analytics dashboard with charts
- [ ] Mobile-responsive optimization / PWA
- [ ] Performance: query optimization, caching, pagination everywhere

---

## 7. TECH STACK (Final)

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Database | PostgreSQL 16 | Proper enums, JSONB, CHECK constraints, BIGINT for money, row-level locking |
| ORM | Prisma 5+ | Type safety, migrations, excellent DX |
| Backend | NestJS 10 | Modular, guards/interceptors, dependency injection, scheduling |
| Frontend | Next.js 14 (App Router) | SSR for SEO pages, RSC for data, middleware for auth |
| UI | Shadcn/ui + Tailwind | Professional components, accessible, customizable |
| State | TanStack Query + Zustand | Server state + client state separation |
| Validation | Zod (shared) | Single source of truth for types across stack |
| Auth | JWT in httpOnly cookies | XSS-proof, auto-sent on every request |
| File Storage | S3 (MinIO locally) | Signed URLs, no public access |
| Caching | Redis | Session store, rate limiting, job queues |
| Jobs | BullMQ + @nestjs/schedule | Reliable background jobs with retry |
| Testing | Vitest + Playwright | Unit + integration + E2E |
| Logging | Pino | Structured JSON logs, correlation IDs |
| Deployment | Docker Compose → Railway/Fly.io | Simple production deployment |

---

## 8. WHAT MAKES THIS DIFFERENT FROM THE CURRENT CODEBASE

| Issue in Current | Fix in Rebuild |
|-----------------|---------------|
| No auction logic at all | Full auction module with bids, settlement, dividend distribution |
| Money stored as Int rupees | BIGINT paise with CHECK constraints |
| No ownership checks (IDOR) | OwnershipGuard on every endpoint |
| JWT in localStorage | httpOnly cookies with version-based revocation |
| No rate limiting | @nestjs/throttler + per-endpoint config |
| Rejected payment = permanent lock | Multiple payments per installment, partial payments |
| No ledger/accounting | Double-entry ledger auto-generated on every financial event |
| No audit trail | AuditInterceptor logs every mutation with actor, IP, changes |
| No indexes | Proper indexes on every query pattern |
| No migrations | Prisma migrate with full history |
| Single SQLite file over HTTP | PostgreSQL with connection pooling |
| No tests | Vitest for business logic, Playwright for flows |
| `any` types everywhere | Shared Zod schemas, strict TypeScript |
| No pagination | Cursor-based pagination on all list endpoints |
| No receipts | Gapless receipt sequence per org |
| No notifications (events fire into void) | Multi-channel notification with delivery tracking |
| No penalty system | Configurable rules + auto-calculation + waiver flow |
| No payout records | Full payout lifecycle with approval |
| No guarantor tracking | Guarantor module for prized members |
| Seats can go negative (race condition) | Optimistic locking + CHECK constraint |
| Due dates overflow on month-end | Proper date-fns with `endOfMonth` clamping |

---

This plan is ready for implementation. Shall I proceed with Phase 1?
