// ====== API Response Types ======

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ErrorResponse {
  success: false;
  message: string;
  errors?: Record<string, string[]>;
  statusCode: number;
}

// ====== Auth Types ======

export interface TokenPayload {
  sub: string;
  type: 'staff' | 'customer';
  role?: string;
  orgId: string;
  branchId?: string;
  tokenVersion: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: string;
    type: 'staff' | 'customer';
  };
  tokens: AuthTokens;
}

// ====== Dashboard Stats ======

export interface AdminDashboardStats {
  totalCustomers: number;
  activeGroups: number;
  pendingPayments: number;
  pendingRequests: number;
  todayCollection: number;
  monthlyCollection: number;
  totalOutstanding: number;
  defaultingMembers: number;
}

export interface CustomerDashboardStats {
  activeChits: number;
  totalInvested: number;
  totalDividendEarned: number;
  nextPaymentDue: {
    amount: number;
    dueDate: string;
    groupName: string;
  } | null;
  upcomingPayments: Array<{
    installmentId: string;
    amount: number;
    dueDate: string;
    groupName: string;
    monthNumber: number;
  }>;
}

// ====== Group/Batch Types ======

export interface GroupSummary {
  id: string;
  groupNumber: string;
  productName: string;
  status: string;
  startDate: string;
  totalSeats: number;
  filledSeats: number;
  currentMonth: number;
  totalCollected: number;
  chitValue: number;
}

export interface MemberPaymentStatus {
  memberId: string;
  customerName: string;
  ticketNumber: number;
  status: string;
  totalPaid: number;
  totalDue: number;
  monthsPaid: number;
  monthsOverdue: number;
  lastPaymentDate: string | null;
}

// ====== Auction Types ======

export interface AuctionSummary {
  id: string;
  monthNumber: number;
  status: string;
  winnerName: string | null;
  winnerTicket: number | null;
  discount: number;
  prizeAmount: number;
  dividendPerMember: number;
  conductedAt: string | null;
}
