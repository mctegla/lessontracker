import { useState } from 'react';
import { format } from 'date-fns';
import { AlertCircle, CalendarClock, CalendarDays, CalendarRange, Bell, AlertTriangle, TrendingUp, History, Flame, Trophy, Activity, Pencil, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { fmtMoney } from '@/lib/cost';
import ConsistencyDetail from '@/components/ConsistencyDetail';

const STATUS = {
  on_track: { label: 'On Track', cls: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500' },
  warning_soon: { label: 'Warning Soon', cls: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  due: { label: 'Purchase Due', cls: 'bg-red-100 text-red-800', dot: 'bg-red-500' },
  overdue: { label: 'Overdue', cls: 'bg-red-600 text-white', dot: 'bg-red-700' },
  unknown: { label: 'No data', cls: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground' }
};

function Row({ icon, label, value }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted-foreground flex items-center gap-1.5">{icon}{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

export default function TrackerCard({ tracker, insight, onEdit }) {
  const [consistencyOpen, setConsistencyOpen] = useState(false);
  const c = tracker.last_computed || {};
  const total = c.total || tracker.package_size;
  const count = c.count ?? 0;
  const pct = total ? Math.min(100, Math.round((count / total) * 100)) : 0;
  const st = STATUS[c.status] || STATUS.unknown;
  const costPerLesson = tracker.cost_per_package ? tracker.cost_per_package / total : null;
  const projected = insight?.projected_purchase_date;
  const projectedConf = insight?.projection_confidence;

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-heading font-semibold text-lg">{tracker.name}</h3>
          <p className="text-xs text-muted-foreground">matching "{tracker.lesson_event_name}"{tracker.alternate_lesson_event_names?.length ? ` +${tracker.alternate_lesson_event_names.length} alternate${tracker.alternate_lesson_event_names.length === 1 ? '' : 's'}` : ''}</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${st.cls}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
          {st.label}
        </span>
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-sm text-muted-foreground">Package progress</span>
          <span className="text-sm font-semibold">{count} of {total} lessons used</span>
        </div>
        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="text-xs text-muted-foreground mt-1">{Math.max(0, total - count)} lessons remaining</div>
      </div>

      <div className="mt-4 divide-y">
        <Row icon={<CalendarRange className="w-3.5 h-3.5" />} label="Tracking since" value={tracker.package_start_date ? format(new Date(tracker.package_start_date + 'T00:00:00'), 'MMM d, yyyy') : '—'} />
        <Row icon={<CalendarClock className="w-3.5 h-3.5" />} label="Next lesson" value={c.next_lesson ? format(new Date(c.next_lesson), 'EEE, MMM d') : '—'} />
        <Row icon={<CalendarDays className="w-3.5 h-3.5" />} label="Est. last lesson" value={c.last_lesson ? format(new Date(c.last_lesson), 'EEE, MMM d') : '—'} />
        <Row icon={<Bell className="w-3.5 h-3.5" />} label="Warning triggers" value={c.warning_date ? format(new Date(c.warning_date), 'EEE, MMM d') : '—'} />
        <Row icon={<TrendingUp className="w-3.5 h-3.5" />} label="Projected purchase" value={projected ? format(new Date(projected), 'EEE, MMM d, yyyy') : '—'} />
        {costPerLesson != null && <Row icon={<span className="text-xs">$</span>} label="Cost per lesson" value={fmtMoney(costPerLesson)} />}
      </div>

      {projectedConf && (
        <div className="mt-2 text-xs text-muted-foreground">{projectedConf}</div>
      )}

      {tracker.last_alert && (
        <div className="mt-3 flex items-start gap-2 text-xs bg-amber-50 text-amber-900 rounded-md p-2.5">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{tracker.last_alert}</span>
        </div>
      )}
      {tracker.last_sync_error && (
        <div className="mt-2 text-xs text-destructive">Sync error: {tracker.last_sync_error}</div>
      )}

      {insight && (
        <button type="button" onClick={() => setConsistencyOpen(true)} className="mt-4 pt-3 border-t w-full text-left rounded-md -mx-1 px-1 transition-colors hover:bg-accent/40">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground">Consistency</span>
            <span className="text-xs text-muted-foreground inline-flex items-center gap-0.5">Details <ChevronRight className="w-3 h-3" /></span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1"><Flame className="w-3.5 h-3.5 text-orange-500" />{insight.streak}wk streak</span>
            <span className="inline-flex items-center gap-1"><Trophy className="w-3.5 h-3.5 text-amber-500" />{insight.longest_streak}wk best</span>
            <span className="inline-flex items-center gap-1"><Activity className="w-3.5 h-3.5 text-blue-500" />{insight.avg_per_week_8}/wk</span>
          </div>
        </button>
      )}

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to={`/history/${tracker.id}`} className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1">
            <History className="w-3.5 h-3.5" /> Purchase history
          </Link>
          {onEdit && (
            <button onClick={() => onEdit(tracker)} className="text-xs font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
          )}
        </div>
        {tracker.last_synced && <span className="text-xs text-muted-foreground">synced {format(new Date(tracker.last_synced), 'MMM d, h:mm a')}</span>}
      </div>

      <ConsistencyDetail open={consistencyOpen} onOpenChange={setConsistencyOpen} tracker={tracker} insight={insight} />
    </div>
  );
}