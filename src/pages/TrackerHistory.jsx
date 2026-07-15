import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useParams, Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Pencil, Trash2, ArrowLeft, RefreshCw } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { fmtMoney } from '@/lib/cost';
import LessonHistoryList from '@/components/LessonHistoryList';

const HISTORY_OPTIONS = [
  { value: 'all', label: 'All purchases' },
  { value: '12months', label: 'Past 12 months' },
  { value: 'ytd', label: 'Year to date' },
  { value: '6months', label: 'Past 6 months' },
  { value: '3months', label: 'Past 3 months' },
  { value: 'this_month', label: 'This month' }
];
const DEFAULT_HISTORY = 'ytd';
function historyStart(range) {
  const now = new Date();
  switch (range) {
    case '12months': return new Date(now.getTime() - 365 * 86400000);
    case '6months': return new Date(now.getTime() - 180 * 86400000);
    case '3months': return new Date(now.getTime() - 90 * 86400000);
    case 'this_month': return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'ytd': return new Date(now.getFullYear(), 0, 1);
    case 'all': default: return new Date(0);
  }
}

export default function TrackerHistory() {
  const { id } = useParams();
  const [tracker, setTracker] = useState(null);
  const [logs, setLogs] = useState([]);
  const [attended, setAttended] = useState(0);
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [range, setRange] = useState(DEFAULT_HISTORY);

  const load = useCallback(async () => {
    try {
      const t = await base44.entities.Tracker.get(id);
      setTracker(t);
      const res = await base44.functions.invoke('getInsights', {});
      const ins = res.data?.trackers?.find((x) => x.id === id);
      setLogs(ins?.purchase_logs || []);
      setAttended(ins?.total_lessons_attended || 0);
    } catch (e) {}
    try {
      const lr = await base44.functions.invoke('getTrackerLessons', { tracker_id: id });
      setLessons(lr.data?.lessons || []);
    } catch (e) { setLessons([]); }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const addNew = () => { setEditing(null); setFormOpen(true); };
  const edit = (l) => { setEditing(l); setFormOpen(true); };

  const remove = async (l) => {
    if (!confirm('Delete this purchase entry?')) return;
    await base44.entities.PurchaseLog.delete(l.id);
    setLogs((prev) => prev.filter((x) => x.id !== l.id));
  };

  const onSaved = async () => { await load(); };

  const rangeStartVal = historyStart(range);
  const filtered = logs.filter((l) => new Date(l.date_purchased + 'T00:00:00') >= rangeStartVal);
  const totalSpent = filtered.reduce((a, l) => a + (Number(l.cost) || 0), 0);
  const sorted = [...filtered].sort((a, b) => new Date(b.date_purchased) - new Date(a.date_purchased));
  let avgGap = null;
  if (sorted.length >= 2) {
    const gaps = [];
    for (let i = 0; i < sorted.length - 1; i++) gaps.push(Math.abs(differenceInDays(new Date(sorted[i].date_purchased), new Date(sorted[i + 1].date_purchased))));
    avgGap = (gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(0);
  }

  if (loading) return <div className="flex justify-center py-20"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!tracker) return <div className="text-muted-foreground">Tracker not found.</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/"><Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
          <div>
            <h1 className="text-2xl font-heading font-semibold">{tracker.name} — Purchase History</h1>
            <p className="text-sm text-muted-foreground">All logged package purchases, newest first.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select className="h-8 rounded-md border border-input bg-background px-2 text-sm" value={range} onChange={(e) => setRange(e.target.value)}>
            {HISTORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <Button size="sm" onClick={addNew}><Plus className="w-4 h-4 mr-1.5" />Log purchase</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Packages purchased</div>
          <div className="text-2xl font-semibold">{filtered.length}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Lessons completed</div>
          <div className="text-2xl font-semibold">{attended}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Total spent</div>
          <div className="text-2xl font-semibold">{fmtMoney(totalSpent)}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Avg time between purchases</div>
          <div className="text-2xl font-semibold">{avgGap != null ? `${avgGap} d` : '—'}</div>
        </div>
      </div>

      <div className="rounded-xl border bg-card divide-y">
        {sorted.length === 0 && (
          <div className="p-8 text-center text-muted-foreground text-sm">No purchases in this range. Adjust the filter or tap "Log purchase" to record one.</div>
        )}
        {sorted.map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-3 p-3 text-sm">
            <div className="flex items-center gap-3">
              <div className="font-medium w-28">{format(new Date(l.date_purchased + 'T00:00:00'), 'MMM d, yyyy')}</div>
              <div className="text-muted-foreground">{l.package_size || '—'} lessons · {fmtMoney(l.cost)}</div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${l.source === 'auto' ? 'bg-emerald-100 text-emerald-800' : 'bg-muted text-muted-foreground'}`}>{l.source}</span>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={() => edit(l)}><Pencil className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => remove(l)}><Trash2 className="w-4 h-4" /></Button>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading font-semibold">Lesson history</h2>
          <span className="text-xs text-muted-foreground">{lessons.length} lesson{lessons.length === 1 ? '' : 's'} since {(tracker.tracking_start_date || tracker.package_start_date) ? format(new Date((tracker.tracking_start_date || tracker.package_start_date) + 'T00:00:00'), 'MMM d, yyyy') : 'start'}</span>
        </div>
        <LessonHistoryList lessons={lessons} />
      </div>

      <PurchaseLogForm open={formOpen} onOpenChange={setFormOpen} initial={editing} tracker={tracker} onSaved={onSaved} />
    </div>
  );
}

function PurchaseLogForm({ open, onOpenChange, initial, tracker, onSaved }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [size, setSize] = useState(tracker?.package_size || 4);
  const [cost, setCost] = useState(tracker?.cost_per_package ? String(tracker.cost_per_package) : '');
  const [pkgStart, setPkgStart] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDate(initial?.date_purchased || new Date().toISOString().slice(0, 10));
      setSize(initial?.package_size || tracker?.package_size || 4);
      setCost(initial?.cost != null ? String(initial.cost) : (tracker?.cost_per_package ? String(tracker.cost_per_package) : ''));
      setPkgStart(initial?.package_start_date || initial?.date_purchased || new Date().toISOString().slice(0, 10));
    }
  }, [open, initial, tracker]);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        tracker_id: tracker.id,
        tracker_name: tracker.name,
        date_purchased: date,
        package_size: Number(size) || null,
        cost: cost ? Number(cost) : null,
        source: initial?.source || 'manual',
        package_number: initial?.package_number ?? null,
        package_start_date: pkgStart
      };
      if (initial) await base44.entities.PurchaseLog.update(initial.id, payload);
      else await base44.entities.PurchaseLog.create(payload);
      await onSaved();
      onOpenChange(false);
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{initial ? 'Edit purchase' : 'Log purchase'}</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="space-y-1.5"><Label className="text-xs">Date purchased</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Package start date</Label><Input type="date" value={pkgStart} onChange={(e) => setPkgStart(e.target.value)} /><p className="text-xs text-muted-foreground">When this package's lessons start counting. Defaults to date purchased.</p></div>
          <div className="space-y-1.5"><Label className="text-xs">Package size</Label><Input type="number" min="1" value={size} onChange={(e) => setSize(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Cost</Label><Input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !date}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}