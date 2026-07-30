// Valid state transitions
export const GROUP_STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['OPEN'],
  OPEN: ['ACTIVE', 'TERMINATED'],
  ACTIVE: ['FROZEN', 'COMPLETED'],
  FROZEN: ['ACTIVE', 'TERMINATED'],
  COMPLETED: [],
  TERMINATED: [],
};

export const MEMBER_STATUS_TRANSITIONS: Record<string, string[]> = {
  REQUESTED: ['APPROVED', 'REJECTED'],
  APPROVED: ['ACTIVE'],
  ACTIVE: ['PRIZED', 'DEFAULTING', 'WITHDRAWN'],
  PRIZED: ['COMPLETED', 'DEFAULTING'],
  DEFAULTING: ['ACTIVE', 'WITHDRAWN'],
  COMPLETED: [],
  REJECTED: [],
  WITHDRAWN: [],
};

export const INSTALLMENT_STATUS_TRANSITIONS: Record<string, string[]> = {
  UPCOMING: ['DUE'],
  DUE: ['PARTIALLY_PAID', 'PAID', 'OVERDUE'],
  PARTIALLY_PAID: ['PAID', 'OVERDUE'],
  OVERDUE: ['PARTIALLY_PAID', 'PAID', 'WAIVED'],
  PAID: [],
  WAIVED: [],
};

export const PAYMENT_STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['VERIFIED', 'REJECTED'],
  VERIFIED: ['REVERSED'],
  REJECTED: [],
  REVERSED: [],
};

// Financial constants
export const MAX_COMMISSION_PERCENT = 5; // Chit Funds Act 1982 cap
export const PAISE_PER_RUPEE = 100;

// Pagination defaults
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
