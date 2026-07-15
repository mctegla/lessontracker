function cellClass(count) {
  if (count >= 2) return 'bg-primary';
  if (count === 1) return 'bg-primary/40';
  return 'bg-muted';
}

export default function Heatmap({ weeks }) {
  return (
    <div className="flex flex-wrap gap-[3px] max-w-full">
      {(weeks || []).map((wk) => (
        <div
          key={wk.week_start}
          title={`${wk.week_start}: ${wk.count} lesson${wk.count === 1 ? '' : 's'}`}
          className={`w-2.5 h-2.5 rounded-sm ${cellClass(wk.count)}`}
        />
      ))}
    </div>
  );
}