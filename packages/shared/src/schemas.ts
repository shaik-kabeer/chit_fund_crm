import { z } from 'zod';

// ====== AUTH ======

export const staffLoginSchema = z.object({
  phone: z.string().min(10).max(15),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});
export type StaffLoginInput = z.infer<typeof staffLoginSchema>;

export const customerLoginSchema = z.object({
  phone: z.string().min(10).max(15),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});
export type CustomerLoginInput = z.infer<typeof customerLoginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(8, 'Password must be at least 8 characters'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const adminResetPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
});
export type AdminResetPasswordInput = z.infer<typeof adminResetPasswordSchema>;

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

const monthlyPayoutEntrySchema = z.object({
  monthNumber: z.number().int().positive(),
  payoutAmountPaise: z.number().int().positive(),
});

export const createProductSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  chitValuePaise: z.number().int().positive(),
  memberCount: z.number().int().min(2),
  tenureMonths: z.number().int().min(2),
  commissionPercent: z.number().min(0).max(5).default(5),
  minBidPercent: z.number().min(0).max(100).default(0),
  maxBidPercent: z.number().min(0).max(100).default(40),
  baseInstallmentPaise: z.number().int().positive().optional(),
  liftedInstallmentPaise: z.number().int().positive().optional(),
  payoutAmountPaise: z.number().int().positive().optional(),
  monthlyPayouts: z.array(monthlyPayoutEntrySchema).optional(),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  commissionPercent: z.number().min(0).max(5).optional(),
  minBidPercent: z.number().min(0).max(100).optional(),
  maxBidPercent: z.number().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
  baseInstallmentPaise: z.number().int().positive().optional(),
  liftedInstallmentPaise: z.number().int().positive().optional(),
  monthlyPayouts: z.array(monthlyPayoutEntrySchema).optional(),
});
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// ====== CHIT GROUP ======

export const createGroupSchema = z.object({
  productId: z.string().uuid(),
  groupNumber: z.string().min(1).max(30),
  agreementNo: z.string().max(50).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format').optional(),
  branchId: z.string().uuid().optional(),
});
export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export const updateGroupSchema = z.object({
  groupNumber: z.string().min(1).max(30).optional(),
  agreementNo: z.string().max(50).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format').optional(),
  branchId: z.string().uuid().nullable().optional(),
});
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

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
  bankName: z.string().min(2).max(100).optional(),
  bankAccountNo: z.string().min(5).max(20).optional(),
  bankIfsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC format').optional(),
  bankBranch: z.string().max(100).optional(),
  upiId: z.string().max(100).optional(),
});
export type UpdateBankDetailsInput = z.infer<typeof updateBankDetailsSchema>;

export const kycSubmitSchema = z.object({
  name: z.string().optional(),
  fatherName: z.string().optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  pan: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/).optional(),
  aadhaarLast4: z.string().regex(/^\d{4}$/).optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
});
export type KycSubmitInput = z.infer<typeof kycSubmitSchema>;

export const updateKycStatusSchema = z.object({
  status: z.enum(['VERIFIED', 'REJECTED']),
  reason: z.string().min(5).max(500).optional(),
});
export type UpdateKycStatusInput = z.infer<typeof updateKycStatusSchema>;

// ====== PAYMENT ======

export const submitPaymentSchema = z.object({
  installmentId: z.string().uuid(),
  amountPaise: z.number().int().positive(),
  method: z.enum(['CASH', 'UPI', 'NEFT', 'CHEQUE', 'ONLINE_GATEWAY']),
  transactionRef: z.string().max(100).optional(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  screenshotUrl: z.string().optional(),
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

export const markAsPaidSchema = z.object({
  installmentId: z.string().uuid(),
  amountPaise: z.number().int().positive(),
  method: z.enum(['CASH', 'UPI', 'NEFT', 'CHEQUE', 'ONLINE_GATEWAY']).default('CASH'),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(200).optional(),
});
export type MarkAsPaidInput = z.infer<typeof markAsPaidSchema>;

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
  seatLabel: z.string().max(60).optional(),
  quantity: z.number().int().min(1).max(10).optional().default(1),
});
export type JoinGroupInput = z.infer<typeof joinGroupSchema>;

export const adminAddSeatSchema = z.object({
  groupId: z.string().uuid(),
  customerId: z.string().uuid(),
  seatLabel: z.string().max(60).optional(),
});
export type AdminAddSeatInput = z.infer<typeof adminAddSeatSchema>;

export const updateSeatLabelSchema = z.object({
  seatLabel: z.string().min(1).max(60),
});
export type UpdateSeatLabelInput = z.infer<typeof updateSeatLabelSchema>;

export const liftMemberSchema = z.object({
  monthNumber: z.number().int().positive().optional(),
});
export type LiftMemberInput = z.infer<typeof liftMemberSchema>;

export const approveMemberSchema = z.object({
  memberId: z.string().uuid(),
  ticketNumber: z.number().int().positive().optional(),
});
export type ApproveMemberInput = z.infer<typeof approveMemberSchema>;

export const rejectMemberSchema = z.object({
  reason: z.string().max(500).optional(),
});
export type RejectMemberInput = z.infer<typeof rejectMemberSchema>;

// ====== PAGINATION ======

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export type PaginationInput = z.infer<typeof paginationSchema>;
