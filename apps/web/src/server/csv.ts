export function toCsv(headers: string[], rows: string[][]): string {
  const escape = (val: string) => {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) {
    lines.push(row.map(v => escape(v ?? '')).join(','));
  }
  return lines.join('\n');
}

export function formatDateIso(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().slice(0, 10);
}

export function formatAmountRupee(paise: bigint | number | null | undefined): string {
  if (paise == null) return '0';
  return (Number(paise) / 100).toFixed(2);
}
