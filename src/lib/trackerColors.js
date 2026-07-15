export const TRACKER_COLORS = [
  { value: 'blue', label: 'Blue', dot: 'bg-blue-500' },
  { value: 'emerald', label: 'Green', dot: 'bg-emerald-500' },
  { value: 'amber', label: 'Amber', dot: 'bg-amber-500' },
  { value: 'purple', label: 'Purple', dot: 'bg-purple-500' },
  { value: 'rose', label: 'Rose', dot: 'bg-rose-500' },
  { value: 'cyan', label: 'Cyan', dot: 'bg-cyan-500' },
  { value: 'orange', label: 'Orange', dot: 'bg-orange-500' },
  { value: 'pink', label: 'Pink', dot: 'bg-pink-500' }
];

export function colorDot(value) {
  const c = TRACKER_COLORS.find((c) => c.value === value);
  return c ? c.dot : TRACKER_COLORS[0].dot;
}

export function colorDotForIndex(i) {
  return TRACKER_COLORS[Math.max(0, i) % TRACKER_COLORS.length].dot;
}