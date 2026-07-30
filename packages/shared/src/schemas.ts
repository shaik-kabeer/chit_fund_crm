import { z } from 'zod';

// ====== AUTH ======

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const staffRegisterSchema = z.object({
  email: z.string().email(),
  phone: z.string().min(10).max(15),
  password: z.string().min(8),
  name: z.string().min(2).max(255),
  role: z.enum(['SUPER_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT', 'COLLECTOR', 'VIEWER']),
  branchId: z.string().uuid().optional(),
});
export type StaffRegisterInput = z.infer<typeof staffRegisterSchema>;

export const customerRegisterSchema = z.object({
  phone: z.string().min(10).max(15),
  email: z.string().email().optional(),
  password: z.string().min(8),
  name: z.string().min(2).max(255),
});
export type CustomerRegisterInput = z.infer<typeof customerRegisterSchema>;

// ====== PRODUCT ======

export const createProductSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  chitValuePaise: z.number().int().positive(),
  memberCount: z.number().int().min(2),
  tenureMonths: z.number().int().min(2),
  commissionPercent: z.number().min(0).max(5).default(5),
  minBidPercent: z.number().min(0).max(100).default(0),
  maxBidPercent: z.number().min(0).max(100).default(40),
}).refine(
  (data) => data.memberCount === data.tenureMonths,
  { message: 'Member count must equal tenure months (one auction per month)', path: ['memberCount'] }
).refine(
  (data) => {
    const expectedInstallment = Math.floor(data.chitValuePaise / data.tenureMonths);
    return expectedInstallment > 0;
  },
  { message: 'Chit value must be divisible into positive installments', path: ['chitValuePaise'] }
);
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  commissionPercent: z.number().min(0).max(5).optional(),
  minBidPercent: z.number().min(0).max(100).optional(),
  maxBidPercent: z.number().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// ====== CHIT GROUP ======

export const createGroupSchema = z.object({
  productId: z.string().uuid(),
  groupNumber: z.string().min(1).max(30),
  agreementNo: z.string().max(50).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
  branchId: z.string().uuid().optional(),
});
export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export const updateGroupStatusSchema = z.object({
  status: z.enum(['DRAFT', 'OPEN', 'ACTIVE', 'FROZEN', 'COMPLETED', 'TERMINATED']),
});
export type UpdateGroupStatusInput = z.infer<typeof updateGroupStatusSchema>;

// ====== CUSTOMER ======

export const createCustomerSchema = z.object({
  phone: z.string().min(10).max(15),
  email: z.string().email().optional(),
  password: z.string().min(8),
  name: z.string().min(2).max(255),
  fatherName: z.string().max(255).optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  pan: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/).optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().regex(/^\d{6}$/).optional(),
  branchId: z.string().uuid().optional(),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = createCustomerSchema.partial().omit({ password: true });
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const updateBankDetailsSchema = z.object({
  bankName: z.string().min(2).max(100),
  bankAccountNo: z.string().min(5).max(20),
  bankIfsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC format'),
  bankBranch: z.string().max(100).optional(),
  upiId: z.string().max(100).optional(),
});
export type UpdateBankDetailsInput = z.infer<typeof updateBankDetailsSchema>;

// ====== PAYMENT ======

export const submitPaymentSchema = z.object({
  installmentId: z.string().uuid(),
  amountPaise: z.number().int().positive(),
  method: z.enum(['CASH', 'UPI', 'NEFT', 'CHEQUE', 'ONLINE_GATEWAY']),
  transactionRef: z.string().max(100).optional(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  screenshotUrl: z.string().url().optional(),
});
export type SubmitPaymentInput = z.infer<typeof submitPaymentSchema>;

export const verifyPaymentSchema = z.object({
  paymentId: z.string().uuid(),
});
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;

export const rejectPaymentSchema = z.object({
  paymentId: z.string().uuid(),
  reason: z.string().min(5).max(500),
});
export type RejectPaymentInput = z.infer<typeof rejectPaymentSchema>;

// ====== AUCTION ======

export const conductAuctionSchema = z.object({
  groupId: z.string().uuid(),
  monthNumber: z.number().int().positive(),
  winnerId: z.string().uuid(),
  winningBidPaise: z.number().int().positive(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(500).optional(),
});
export type ConductAuctionInput = z.infer<typeof conductAuctionSchema>;

export const submitBidSchema = z.object({
  auctionId: z.string().uuid(),
  bidAmountPaise: z.number().int().positive(),
});
export type SubmitBidInput = z.infer<typeof submitBidSchema>;

// ====== MEMBERSHIP ======

export const joinGroupSchema = z.object({
  groupId: z.string().uuid(),
});
export type JoinGroupInput = z.infer<typeof joinGroupSchema>;

export const approveMemberSchema = z.object({
  memberId: z.string().uuid(),
  ticketNumber: z.number().int().positive().optional(),
});
export type ApproveMemberInput = z.infer<typeof approveMemberSchema>;

// ====== PAGINATION ======

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export type PaginationInput = z.infer<typeof paginationSchema>;
