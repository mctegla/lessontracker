import { RANGE_OPTIONS, RANGE_TOOLTIP, saveRange } from '@/lib/cost';
import { Info } from 'lucide-react';

export default function CostRangeSelector({ value, onChange }) {
  const change = (v) => { saveRange(v); onChange(v); };
  return (
    <div className="flex items-center gap-2">
      <select
        className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        value={value}
        onChange={(e) => change(e.target.value)}
      >
        {RANGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span className="relative group inline-flex">
        <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
        <span className="hidden group-hover:block absolute z-10 right-0 top-5 w-60 rounded-md bg-foreground text-background text-xs p-2 shadow-lg">
          {RANGE_TOOLTIP}
        </span>
      </span>
    </div>
  );
}