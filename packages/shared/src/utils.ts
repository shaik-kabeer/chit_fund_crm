import { PAISE_PER_RUPEE } from './constants';

export function paiseToCurrency(paise: number | bigint, locale = 'en-IN'): string {
  const rupees = Number(paise) / PAISE_PER_RUPEE;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(rupees);
}

export { paiseToCurrency as formatCurrency };

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * PAISE_PER_RUPEE);
}

export function formatDate(date: string | Date, locale = 'en-IN'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function calculateDueDate(startDate: Date, monthOffset: number): Date {
  const date = new Date(startDate);
  const targetMonth = date.getMonth() + monthOffset;
  date.setMonth(targetMonth);

  // Clamp to end of month if the day overflowed
  const expectedMonth = ((startDate.getMonth() + monthOffset) % 12 + 12) % 12;
  if (date.getMonth() !== expectedMonth) {
    date.setDate(0); // last day of previous month
  }
  return date;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function getMonthLabel(startDate: Date | string, monthNumber: number, short = true): string {
  const d = typeof startDate === 'string' ? new Date(startDate) : new Date(startDate);
  const monthIndex = (d.getMonth() + monthNumber - 1) % 12;
  const year = d.getFullYear() + Math.floor((d.getMonth() + monthNumber - 1) / 12);
  const names = short ? MONTH_NAMES : MONTH_NAMES_FULL;
  return `M${monthNumber}-${names[monthIndex]} ${year}`;
}

export function computeEffectiveStatus(
  dbStatus: string,
  dueDate: Date | string,
  now?: Date,
): string {
  if (dbStatus === 'PAID' || dbStatus === 'WAIVED') return dbStatus;
  if (dbStatus === 'PARTIALLY_PAID') return dbStatus;

  const today = now || new Date();
  const due = typeof dueDate === 'string' ? new Date(dueDate) : new Date(dueDate);

  const todayMonth = today.getFullYear() * 12 + today.getMonth();
  const dueMonth = due.getFullYear() * 12 + due.getMonth();

  if (dueMonth > todayMonth) return 'UPCOMING';
  if (dueMonth === todayMonth) return 'DUE';
  return 'OVERDUE';
}

export function calculateDividend(
  discountPaise: bigint,
  commissionPaise: bigint,
  totalMembers: number
): bigint {
  const distributable = discountPaise - commissionPaise;
  if (distributable <= 0n || totalMembers <= 1) return 0n;
  return distributable / BigInt(totalMembers - 1);
}

export function calculateCommission(
  chitValuePaise: bigint,
  commissionPercent: number
): bigint {
  return (chitValuePaise * BigInt(Math.round(commissionPercent * 100))) / 10000n;
}

export function isValidTransition(
  transitions: Record<string, string[]>,
  currentStatus: string,
  newStatus: string
): boolean {
  const allowed = transitions[currentStatus];
  return allowed ? allowed.includes(newStatus) : false;
}
