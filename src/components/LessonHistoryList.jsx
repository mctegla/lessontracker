import { format } from 'date-fns';
import { CheckCircle2, Circle } from 'lucide-react';

export default function LessonHistoryList({ lessons }) {
  if (!lessons || lessons.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground text-sm">
        No lessons found since your tracking start date. Sync your calendar to pull in past lessons.
      </div>
    );
  }
  const sorted = [...lessons].sort((a, b) => new Date(b.start) - new Date(a.start));
  return (
    <div className="rounded-xl border bg-card divide-y">
      {sorted.map((l, i) => (
        <div key={i} className="flex items-center justify-between gap-3 p-3 text-sm">
          <div className="flex items-center gap-3 min-w-0">
            {l.attended ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : <Circle className="w-4 h-4 text-muted-foreground shrink-0" />}
            <div className="font-medium w-28 shrink-0">{format(new Date(l.start), 'MMM d, yyyy')}</div>
            <div className="text-muted-foreground truncate">{l.summary}</div>
          </div>
          <div className="text-right shrink-0">
            {l.before_package ? (
              <div className="text-xs text-muted-foreground">Prior to first package</div>
            ) : l.beyond_package || l.counter == null ? null : (
              <>
                {l.package_number != null && <div className="text-xs text-muted-foreground">Package {l.package_number + 1}</div>}
                <div className="font-medium">Lesson {l.counter}</div>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}