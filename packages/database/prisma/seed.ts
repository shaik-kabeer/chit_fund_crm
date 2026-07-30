import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding demo database...\n');

  await prisma.ledgerEntry.deleteMany({});
  await prisma.penaltyApplied.deleteMany({});
  await prisma.auctionBid.deleteMany({});
  await prisma.payout.deleteMany({});
  await prisma.auction.deleteMany({});
  await prisma.payment.deleteMany({});
  await prisma.installment.deleteMany({});
  await prisma.guarantor.deleteMany({});
  await prisma.groupMember.deleteMany({});
  await prisma.chitGroup.deleteMany({});
  await prisma.penaltyRule.deleteMany({});
  await prisma.productPayoutSchedule.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.document.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.receiptSequence.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.staff.deleteMany({});
  await prisma.branch.deleteMany({});
  await prisma.organization.deleteMany({});

  const org = await prisma.organization.create({
    data: {
      name: 'Stash Chit Funds Pvt Ltd',
      registrationNo: 'CHT/TN/2024/001',
      gstin: '33AABCS1234A1Z5',
      pan: 'AABCS1234A',
      address: '123 Anna Salai',
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600001',
      phone: '044-28123456',
      email: 'info@stashchits.com',
      paymentUpiId: 'stashchits@upi',
      paymentPhone: '9876500000',
    },
  });

  const mainBranch = await prisma.branch.create({
    data: { orgId: org.id, name: 'Head Office', code: 'HO', city: 'Chennai', state: 'Tamil Nadu' },
  });
  const hyBranch = await prisma.branch.create({
    data: { orgId: org.id, name: 'Hyderabad Branch', code: 'HYD', city: 'Hyderabad', state: 'Telangana' },
  });

  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const customerPassword = process.env.SEED_CUSTOMER_PASSWORD;
  if (!adminPassword || adminPassword.length < 8) {
    throw new Error('Set SEED_ADMIN_PASSWORD (min 8 chars) in the environment before seeding');
  }
  if (!customerPassword || customerPassword.length < 8) {
    throw new Error('Set SEED_CUSTOMER_PASSWORD (min 8 chars) in the environment before seeding');
  }

  const adminPass = await bcrypt.hash(adminPassword, 12);
  const custPass = await bcrypt.hash(customerPassword, 12);

  const admin = await prisma.staff.create({
    data: {
      orgId: org.id,
      email: 'admin@stashchits.com',
      phone: '9876500001',
      passwordHash: adminPass,
      name: 'Kabeer (Super Admin)',
      role: 'SUPER_ADMIN',
    },
  });
  await prisma.staff.create({
    data: {
      orgId: org.id,
      branchId: hyBranch.id,
      email: 'manager@stashchits.com',
      phone: '9876500002',
      passwordHash: adminPass,
      name: 'Rajesh (Branch Admin)',
      role: 'BRANCH_ADMIN',
    },
  });
  await prisma.staff.create({
    data: {
      orgId: org.id,
      branchId: mainBranch.id,
      email: 'collector@stashchits.com',
      phone: '9876500003',
      passwordHash: adminPass,
      name: 'Suresh (Collector)',
      role: 'COLLECTOR',
    },
  });

  const customers = await Promise.all([
    prisma.customer.create({
      data: {
        orgId: org.id, branchId: mainBranch.id,
        phone: '9876543001', email: 'rahul@email.com', passwordHash: custPass,
        name: 'Rahul Sharma', fatherName: 'Mohan Sharma',
        address: '45 MG Road', city: 'Chennai', state: 'Tamil Nadu', pincode: '600002',
        kycStatus: 'VERIFIED', kycVerifiedAt: new Date(),
        bankName: 'SBI', bankAccountNo: '1234567890', bankIfsc: 'SBIN0001234', upiId: 'rahul@upi',
      },
    }),
    prisma.customer.create({
      data: {
        orgId: org.id, branchId: mainBranch.id,
        phone: '9876543002', email: 'priya@email.com', passwordHash: custPass,
        name: 'Priya Reddy', fatherName: 'Krishna Reddy',
        address: '78 Jubilee Hills', city: 'Hyderabad', state: 'Telangana', pincode: '500033',
        kycStatus: 'VERIFIED', kycVerifiedAt: new Date(),
        bankName: 'HDFC', bankAccountNo: '9876543210', bankIfsc: 'HDFC0001234', upiId: 'priya@upi',
      },
    }),
    prisma.customer.create({
      data: {
        orgId: org.id, branchId: mainBranch.id,
        phone: '9876543003', passwordHash: custPass,
        name: 'Arun Kumar', city: 'Chennai', state: 'Tamil Nadu',
        kycStatus: 'SUBMITTED',
      },
    }),
    prisma.customer.create({
      data: {
        orgId: org.id, branchId: mainBranch.id,
        phone: '9876543004', passwordHash: custPass,
        name: 'Deepa Nair', city: 'Chennai', state: 'Tamil Nadu',
        kycStatus: 'VERIFIED', kycVerifiedAt: new Date(),
        bankName: 'ICICI', bankAccountNo: '5555666677', bankIfsc: 'ICIC0001234',
      },
    }),
    prisma.customer.create({
      data: {
        orgId: org.id, branchId: mainBranch.id,
        phone: '9876543005', passwordHash: custPass,
        name: 'Vijay Sundar', city: 'Chennai', state: 'Tamil Nadu',
        kycStatus: 'VERIFIED', kycVerifiedAt: new Date(),
      },
    }),
    prisma.customer.create({
      data: {
        orgId: org.id, branchId: hyBranch.id,
        phone: '9876543006', passwordHash: custPass,
        name: 'Sneha Iyer', city: 'Hyderabad', state: 'Telangana',
        kycStatus: 'VERIFIED', kycVerifiedAt: new Date(),
        bankName: 'Axis', bankAccountNo: '1122334455', bankIfsc: 'UTIB0001234',
      },
    }),
  ]);

  // Silver: ₹1L / 20 months — non-lifted ₹5,000, lifted ₹5,500
  // Payouts vary by month (higher early months, taper later)
  const silverPayouts = Array.from({ length: 20 }, (_, i) => {
    const month = i + 1;
    // Month 1: 90k, gradually up to 98k by month 20 (in paise)
    const rupees = 90000 + month * 400;
    return { monthNumber: month, payoutAmountPaise: BigInt(rupees * 100) };
  });

  const silver = await prisma.product.create({
    data: {
      orgId: org.id,
      name: 'Silver',
      description: '₹1 Lakh chit — 20 months. Payout varies by lift month.',
      chitValuePaise: 10000000n,
      memberCount: 20,
      tenureMonths: 20,
      baseInstallmentPaise: 500000n,
      liftedInstallmentPaise: 550000n,
      payoutAmountPaise: silverPayouts[0].payoutAmountPaise,
      auctionEnabled: false,
      commissionPercent: 5,
      createdBy: admin.id,
      payoutSchedule: { create: silverPayouts },
    },
  });

  // Gold: ₹5L / 25 months — same EMI, varying payouts
  const goldPayouts = Array.from({ length: 25 }, (_, i) => {
    const month = i + 1;
    const rupees = 450000 + month * 2000;
    return { monthNumber: month, payoutAmountPaise: BigInt(rupees * 100) };
  });

  const gold = await prisma.product.create({
    data: {
      orgId: org.id,
      name: 'Gold',
      description: '₹5 Lakh chit — 25 months. Same EMI before & after lift.',
      chitValuePaise: 50000000n,
      memberCount: 25,
      tenureMonths: 25,
      baseInstallmentPaise: 2000000n,
      liftedInstallmentPaise: 2000000n,
      payoutAmountPaise: goldPayouts[0].payoutAmountPaise,
      auctionEnabled: false,
      commissionPercent: 5,
      createdBy: admin.id,
      payoutSchedule: { create: goldPayouts },
    },
  });

  // Bronze: ₹50k / 10 months
  const bronzePayouts = Array.from({ length: 10 }, (_, i) => {
    const month = i + 1;
    const rupees = 45000 + month * 300;
    return { monthNumber: month, payoutAmountPaise: BigInt(rupees * 100) };
  });

  const bronze = await prisma.product.create({
    data: {
      orgId: org.id,
      name: 'Bronze',
      description: '₹50,000 chit — 10 months. Great starter plan.',
      chitValuePaise: 5000000n,
      memberCount: 10,
      tenureMonths: 10,
      baseInstallmentPaise: 500000n,
      liftedInstallmentPaise: 500000n,
      payoutAmountPaise: bronzePayouts[0].payoutAmountPaise,
      auctionEnabled: false,
      createdBy: admin.id,
      payoutSchedule: { create: bronzePayouts },
    },
  });

  const silverGroup = await prisma.chitGroup.create({
    data: {
      orgId: org.id,
      branchId: mainBranch.id,
      productId: silver.id,
      groupNumber: 'SIL-2026-001',
      status: 'ACTIVE',
      startDate: new Date('2026-01-01'),
      totalSeats: 20,
      filledSeats: 6,
      currentMonth: 3,
      totalCollectedPaise: 7250000n,
      totalDisbursedPaise: 9500000n,
      createdBy: admin.id,
    },
  });

  const goldGroup = await prisma.chitGroup.create({
    data: {
      orgId: org.id,
      branchId: mainBranch.id,
      productId: gold.id,
      groupNumber: 'GLD-2026-001',
      status: 'OPEN',
      startDate: new Date('2026-08-01'),
      totalSeats: 25,
      filledSeats: 2,
      createdBy: admin.id,
    },
  });

  const bronzeGroup = await prisma.chitGroup.create({
    data: {
      orgId: org.id,
      branchId: hyBranch.id,
      productId: bronze.id,
      groupNumber: 'BRZ-2026-001',
      status: 'OPEN',
      startDate: new Date('2026-09-01'),
      totalSeats: 10,
      filledSeats: 0,
      createdBy: admin.id,
    },
  });

  // Silver members — Rahul holds TWO parallel seats with different names
  const mRahulSelf = await prisma.groupMember.create({
    data: {
      groupId: silverGroup.id, customerId: customers[0].id,
      ticketNumber: 1, seatLabel: 'Self', status: 'PRIZED',
      baseInstallmentPaise: 500000n, currentInstallmentPaise: 550000n,
      totalPaidPaise: 1600000n,
      joinedAt: new Date('2026-01-01'), prizedAt: new Date('2026-02-10'), prizedMonth: 2,
      approvedById: admin.id, approvedAt: new Date('2025-12-15'),
    },
  });
  const mRahulFamily = await prisma.groupMember.create({
    data: {
      groupId: silverGroup.id, customerId: customers[0].id,
      ticketNumber: 6, seatLabel: 'Family', status: 'ACTIVE',
      baseInstallmentPaise: 500000n, currentInstallmentPaise: 500000n,
      totalPaidPaise: 1500000n,
      joinedAt: new Date('2026-01-01'),
      approvedById: admin.id, approvedAt: new Date('2025-12-15'),
    },
  });
  const mPriya = await prisma.groupMember.create({
    data: {
      groupId: silverGroup.id, customerId: customers[1].id,
      ticketNumber: 2, seatLabel: 'Self', status: 'ACTIVE',
      baseInstallmentPaise: 500000n, currentInstallmentPaise: 500000n,
      totalPaidPaise: 1500000n,
      joinedAt: new Date('2026-01-01'),
      approvedById: admin.id, approvedAt: new Date('2025-12-15'),
    },
  });
  const mArun = await prisma.groupMember.create({
    data: {
      groupId: silverGroup.id, customerId: customers[2].id,
      ticketNumber: 3, seatLabel: 'Self', status: 'ACTIVE',
      baseInstallmentPaise: 500000n, currentInstallmentPaise: 500000n,
      totalPaidPaise: 1000000n,
      joinedAt: new Date('2026-01-01'),
      approvedById: admin.id, approvedAt: new Date('2025-12-15'),
    },
  });
  const mDeepa = await prisma.groupMember.create({
    data: {
      groupId: silverGroup.id, customerId: customers[3].id,
      ticketNumber: 4, seatLabel: 'Self', status: 'ACTIVE',
      baseInstallmentPaise: 500000n, currentInstallmentPaise: 500000n,
      totalPaidPaise: 1500000n,
      joinedAt: new Date('2026-01-01'),
      approvedById: admin.id, approvedAt: new Date('2025-12-15'),
    },
  });
  const mVijay = await prisma.groupMember.create({
    data: {
      groupId: silverGroup.id, customerId: customers[4].id,
      ticketNumber: 5, seatLabel: 'Self', status: 'ACTIVE',
      baseInstallmentPaise: 500000n, currentInstallmentPaise: 500000n,
      totalPaidPaise: 1000000n,
      joinedAt: new Date('2026-01-01'),
      approvedById: admin.id, approvedAt: new Date('2025-12-15'),
    },
  });

  // Gold open enrollments
  await prisma.groupMember.create({
    data: {
      groupId: goldGroup.id, customerId: customers[0].id,
      ticketNumber: 1, seatLabel: 'Self', status: 'APPROVED',
      baseInstallmentPaise: 2000000n, currentInstallmentPaise: 2000000n,
      approvedById: admin.id, approvedAt: new Date(),
    },
  });
  await prisma.groupMember.create({
    data: {
      groupId: goldGroup.id, customerId: customers[1].id,
      ticketNumber: null, seatLabel: 'Self', status: 'REQUESTED',
      baseInstallmentPaise: 2000000n, currentInstallmentPaise: 2000000n,
    },
  });
  await prisma.groupMember.create({
    data: {
      groupId: goldGroup.id, customerId: customers[5].id,
      ticketNumber: null, seatLabel: 'Self', status: 'REQUESTED',
      baseInstallmentPaise: 2000000n, currentInstallmentPaise: 2000000n,
    },
  });

  await prisma.receiptSequence.create({
    data: { orgId: org.id, prefix: 'RCP', currentNumber: 20 },
  });

  // Installment schedules for all silver seats
  const silverMembers = [
    { member: mRahulSelf, paidMonths: 3, liftedFrom: 2 },
    { member: mRahulFamily, paidMonths: 3, liftedFrom: null },
    { member: mPriya, paidMonths: 3, liftedFrom: null },
    { member: mArun, paidMonths: 2, liftedFrom: null },
    { member: mDeepa, paidMonths: 3, liftedFrom: null },
    { member: mVijay, paidMonths: 2, liftedFrom: null },
  ];

  for (const { member, paidMonths, liftedFrom } of silverMembers) {
    const rows = [];
    for (let month = 1; month <= 20; month++) {
      const dueDate = new Date(2026, month - 1, 5);
      const isLifted = liftedFrom !== null && month >= liftedFrom;
      const amount = isLifted ? 550000n : 500000n;
      const isPaid = month <= paidMonths;
      const isDue = month === paidMonths + 1;

      rows.push({
        groupId: silverGroup.id,
        memberId: member.id,
        monthNumber: month,
        baseAmountPaise: amount,
        netAmountPaise: amount,
        paidAmountPaise: isPaid ? amount : 0n,
        balancePaise: isPaid ? 0n : amount,
        status: isPaid ? ('PAID' as const) : isDue ? ('DUE' as const) : ('UPCOMING' as const),
        dueDate,
        paidDate: isPaid ? dueDate : null,
      });
    }
    await prisma.installment.createMany({ data: rows });
  }

  // Verified payments for Priya months 1-3
  const priyaInst = await prisma.installment.findMany({
    where: { memberId: mPriya.id, monthNumber: { lte: 3 } },
    orderBy: { monthNumber: 'asc' },
  });
  for (const inst of priyaInst) {
        await prisma.payment.create({
      data: {
        installmentId: inst.id,
        amountPaise: 500000n,
        method: 'UPI',
        transactionRef: `UPI-PRIYA-M${inst.monthNumber}`,
        status: 'VERIFIED',
        receiptNumber: `RCP-0000001${inst.monthNumber}`,
        paymentDate: inst.dueDate,
        submittedAt: inst.dueDate,
        verifiedAt: inst.dueDate,
        verifiedById: admin.id,
      },
    });
  }

  // Pending payment for Arun month 3 (for admin verification queue)
  const arunDue = await prisma.installment.findFirst({
    where: { memberId: mArun.id, monthNumber: 3 },
  });
  if (arunDue) {
    await prisma.payment.create({
      data: {
        installmentId: arunDue.id,
        amountPaise: 500000n,
        method: 'UPI',
        transactionRef: 'UPI-ARUN-PENDING-001',
        status: 'PENDING',
        receiptNumber: 'RCP-00000020',
        paymentDate: new Date(),
        submittedAt: new Date(),
      },
    });
  }

  // Pending payment for Vijay month 3
  const vijayDue = await prisma.installment.findFirst({
    where: { memberId: mVijay.id, monthNumber: 3 },
  });
  if (vijayDue) {
    await prisma.payment.create({
      data: {
        installmentId: vijayDue.id,
        amountPaise: 500000n,
        method: 'NEFT',
        transactionRef: 'NEFT-VIJAY-001',
        status: 'PENDING',
        receiptNumber: 'RCP-00000021',
        paymentDate: new Date(),
        submittedAt: new Date(),
      },
    });
  }

  // Payout for Rahul (lifted)
  await prisma.payout.create({
    data: {
      memberId: mRahulSelf.id,
      prizeAmountPaise: 9500000n,
      netPayoutPaise: 9500000n,
      status: 'COMPLETED',
      method: 'NEFT',
      transactionRef: 'PAYOUT-RAHUL-001',
      approvedById: admin.id,
      approvedAt: new Date('2026-02-12'),
      paidAt: new Date('2026-02-14'),
    },
  });

  console.log('Seed complete!\n');
  console.log('Login phones (passwords come from SEED_* env vars — not printed):\n');
  console.log('  ADMIN / STAFF  (toggle "Admin / Staff")');
  console.log('    Phone: 9876500001   (Super Admin)');
  console.log('    Phone: 9876500002   (Branch Admin)');
  console.log('    Phone: 9876500003   (Collector)\n');
  console.log('  MEMBER  (toggle "Member")');
  console.log('    Phone: 9876543001   (Rahul)');
  console.log('    Phone: 9876543002   (Priya)');
  console.log('    Phone: 9876543003   (Arun)');
  console.log('    Phone: 9876543006   (Sneha)');
  console.log(`\n  Org: ${org.name}`);
  console.log(`  Groups: ${silverGroup.groupNumber} (ACTIVE), ${goldGroup.groupNumber} (OPEN), ${bronzeGroup.groupNumber} (OPEN)`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
