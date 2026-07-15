import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Flame, Trophy, Activity } from 'lucide-react';
import { format } from 'date-fns';
import Heatmap from '@/components/Heatmap';

export default function ConsistencyDetail({ open, onOpenChange, tracker, insight }) {
  if (!insight) return null;
  const projected = insight.projected_purchase_date;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tracker.name} — Consistency</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border bg-card p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Flame className="w-3 h-3 text-orange-500" />Current streak</div>
              <div className="text-xl font-semibold">{insight.streak} wk</div>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Trophy className="w-3 h-3 text-amber-500" />Longest streak</div>
              <div className="text-xl font-semibold">{insight.longest_streak} wk</div>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Activity className="w-3 h-3 text-blue-500" />Avg / week</div>
              <div className="text-xl font-semibold">{insight.avg_per_week_8}</div>
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-2">Lesson activity — past 52 weeks</div>
            <Heatmap weeks={insight.heatmap} />
          </div>

          <div className="divide-y text-sm">
            <div className="flex justify-between py-1.5"><span className="text-muted-foreground">Frequency (last 8 wk)</span><span className="font-medium">{insight.frequency_per_week}/wk</span></div>
            <div className="flex justify-between py-1.5"><span className="text-muted-foreground">Total lessons attended</span><span className="font-medium">{insight.total_lessons_attended}</span></div>
            <div className="flex justify-between py-1.5"><span className="text-muted-foreground">Cancelled lessons</span><span className="font-medium">{insight.cancelled_count}</span></div>
            <div className="flex justify-between py-1.5"><span className="text-muted-foreground">Projected purchase</span><span className="font-medium">{projected ? format(new Date(projected), 'EEE, MMM d, yyyy') : '—'}</span></div>
          </div>

          {insight.projection_confidence && (
            <div className="text-xs text-muted-foreground">{insight.projection_confidence}</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}