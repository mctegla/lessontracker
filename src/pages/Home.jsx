import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import TrackerCard from '@/components/TrackerCard';
import LessonCalendar from '@/components/LessonCalendar';
import TrackerForm from '@/components/TrackerForm';
import { useGcalConnection } from '@/hooks/useGcalConnection';
import { Button } from '@/components/ui/button';
import { RefreshCw, Plus, Bell, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';

export default function Home() {
  const [trackers, setTrackers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [insights, setInsights] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [progressId, setProgressId] = useState('all');
  const { calendars } = useGcalConnection();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  const openNew = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (t) => { setEditing(t); setFormOpen(true); };
  const onSavedTracker = async (data) => {
    setBusy(true);
    try {
      const id = editing?.id;
      if (id) await base44.functions.invoke('syncTrackers', { tracker_id: id });
      else {
        const fresh = await base44.entities.Tracker.list('-created_date');
        const match = fresh.find((t) => t.name === data.name && t.lesson_event_name === data.lesson_event_name);
        if (match) await base44.functions.invoke('syncTrackers', { tracker_id: match.id });
      }
      await Promise.all([load(), loadInsights()]);
    } catch (e) {}
    finally { setBusy(false); }
  };

  const loadInsights = useCallback(async () => {
    try { const res = await base44.functions.invoke('getInsights', {}); setInsights(res.data); }
    catch (e) { setInsights(null); }
  }, []);

  const load = useCallback(async () => {
    try {
      const [t, n] = await Promise.all([base44.entities.Tracker.list('-created_date'), base44.entities.AppNotification.filter({ cleared: false })]);
      setTrackers(t); setNotifications(n);
    } catch (e) { setTrackers([]); setNotifications([]); }
  }, []);

  useEffect(() => {
    (async () => { await Promise.all([load(), loadInsights()]); setLoading(false); })();
    const u1 = base44.entities.Tracker.subscribe(() => { base44.entities.Tracker.list('-created_date').then(setTrackers).catch(() => {}); });
    const u2 = base44.entities.AppNotification.subscribe(() => { base44.entities.AppNotification.filter({ cleared: false }).then(setNotifications).catch(() => {}); });
    return () => { u1(); u2(); };
  }, [load, loadInsights]);

  const syncNow = async () => {
    setSyncing(true);
    try { await base44.functions.invoke('syncTrackers', {}); await Promise.all([load(), loadInsights()]); } finally { setSyncing(false); }
  };

  const clearNotification = async (n) => {
    await base44.entities.AppNotification.update(n.id, { cleared: true });
    setNotifications((prev) => prev.filter((x) => x.id !== n.id));
  };

  const latestSync = trackers.reduce((acc, t) => { if (!t.last_synced) return acc; const d = new Date(t.last_synced); return (!acc || d > acc) ? d : acc; }, null);
  const insightFor = (id) => insights?.trackers?.find((t) => t.id === id);

  // progress selection
  const progTracker = progressId === 'all' ? null : trackers.find((t) => t.id === progressId);
  const totalUsed = trackers.reduce((a, t) => a + (t.last_computed?.count ?? 0), 0);
  const totalSize = trackers.reduce((a, t) => a + (t.last_computed?.total ?? t.package_size ?? 0), 0);
  const pUsed = progTracker ? (progTracker.last_computed?.count ?? 0) : totalUsed;
  const pTotal = progTracker ? (progTracker.last_computed?.total ?? progTracker.package_size ?? 0) : totalSize;
  const pRemaining = Math.max(0, pTotal - pUsed);
  const pPct = pTotal ? Math.min(100, Math.round((pUsed / pTotal) * 100)) : 0;

  const trackerOptions = [{ id: 'all', name: 'All trackers' }, ...trackers];

  if (loading) return <div className="flex justify-center py-20"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{latestSync ? `Last synced ${format(latestSync, 'MMM d, h:mm a')}` : 'Not synced yet'}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1.5" />New tracker</Button>
          <Button variant="outline" size="sm" onClick={syncNow} disabled={syncing}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />{syncing ? 'Syncing…' : 'Sync now'}
          </Button>
        </div>
      </div>

      {notifications.length > 0 && (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div key={n.id} className={`flex items-start justify-between gap-3 rounded-lg border p-3 text-sm ${n.type === 'due' ? 'bg-red-50 border-red-200 text-red-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
              <span className="flex items-start gap-2"><Bell className="w-4 h-4 mt-0.5 shrink-0" />{n.message}</span>
              <button onClick={() => clearNotification(n)} className="shrink-0 opacity-70 hover:opacity-100"><X className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}

      {trackers.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground mb-4">You don't have any lesson trackers yet.</p>
          <Link to="/settings"><Button><Plus className="w-4 h-4 mr-1.5" />Create your first tracker</Button></Link>
        </div>
      ) : (
        <>
          <LessonCalendar trackers={trackers} />

          {totalSize > 0 && (
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="text-sm text-muted-foreground">{progTracker ? `${progTracker.name} package` : 'All active packages'}</span>
                <select className="h-8 rounded-md border border-input bg-background px-2 text-sm" value={progressId} onChange={(e) => setProgressId(e.target.value)}>
                  {trackerOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-sm font-semibold">{pUsed} of {pTotal} used · {pRemaining} left</span>
              </div>
              <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${pPct}%` }} />
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {trackers.map((t) => <TrackerCard key={t.id} tracker={t} insight={insightFor(t.id)} onEdit={openEdit} />)}
          </div>

        </>
      )}

      <TrackerForm open={formOpen} onOpenChange={setFormOpen} initial={editing} calendars={calendars} onSaved={onSavedTracker} />
    </div>
  );
}