export const RANGE_OPTIONS = [
  { value: 'month', label: 'Past month' },
  { value: '6months', label: 'Past 6 months' },
  { value: '12months', label: 'Past 12 months' },
  { value: 'ytd', label: 'Year to date' },
  { value: 'all', label: 'Since first purchase' }
];

export const DEFAULT_RANGE = 'ytd';
export const RANGE_TOOLTIP = 'Past 12 Months is a rolling window from today backward; Year to Date resets every January 1.';

export function rangeStart(range) {
  const now = new Date();
  switch (range) {
    case 'month': return new Date(now.getTime() - 30 * 86400000);
    case '6months': return new Date(now.getTime() - 180 * 86400000);
    case '12months': return new Date(now.getTime() - 365 * 86400000);
    case 'ytd': return new Date(now.getFullYear(), 0, 1);
    case 'all': return new Date(0);
    default: return new Date(now.getFullYear(), 0, 1);
  }
}

export function filterLogs(logs, range) {
  const start = rangeStart(range);
  return (logs || []).filter((l) => new Date(l.date_purchased + 'T00:00:00') >= start);
}

export function sumSpent(logs) {
  return logs.reduce((acc, l) => acc + (Number(l.cost) || 0), 0);
}

export function loadRange() {
  try { return localStorage.getItem('lpt_cost_range') || DEFAULT_RANGE; } catch (e) { return DEFAULT_RANGE; }
}
export function saveRange(r) { try { localStorage.setItem('lpt_cost_range', r); } catch (e) {} }

export function fmtMoney(n) {
  if (n == null || isNaN(n)) return '—';
  return '$' + Number(n).toFixed(2);
}