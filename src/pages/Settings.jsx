import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useGcalConnection } from '@/hooks/useGcalConnection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, RefreshCw, Calendar, AlertTriangle, Link2 } from 'lucide-react';

export default function Settings() {
  const { loading, connected, calendars, reload, connect, disconnect } = useGcalConnection();
  const [newName, setNewName] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);

  // Show feedback after returning from the Google OAuth consent screen
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gcalError = params.get('gcal_error');
    const gcalConnected = params.get('gcal_connected');
    if (gcalError) setError('Google Calendar connection failed: ' + gcalError);
    if (gcalConnected) reload();
    if (gcalError || gcalConnected) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [reload]);

  const addCalendar = async () => {
    if (!newName.trim()) return;
    setAdding(true); setError(null);
    try {
      await base44.functions.invoke('gcalApi', { action: 'createCalendar', name: newName.trim() });
      setNewName('');
      await reload();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to create calendar');
    } finally { setAdding(false); }
  };

  const removeCalendar = async (c) => {
    if (c.primary) return;
    if (!confirm(`Remove the "${c.summary}" calendar? This permanently deletes it from your Google account.`)) return;
    setBusyId(c.id); setError(null);
    try {
      await base44.functions.invoke('gcalApi', { action: 'deleteCalendar', calendar_id: c.id });
      await reload();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to remove calendar');
    } finally { setBusyId(null); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your Google Calendar connection.</p>
      </div>

      {!connected && !loading && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 p-4 text-sm space-y-3">
          <p>Google Calendar isn't connected. Background sync will wait until the connection is restored.</p>
          <Button size="sm" onClick={connect}><Link2 className="w-4 h-4 mr-1.5" />Connect Google Calendar</Button>
        </div>
      )}

      {connected && (
        <div className="rounded-lg border bg-card p-4 text-sm flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">Connected to Google Calendar — {calendars.length} calendar(s) available.</span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={reload} disabled={loading}><RefreshCw className="w-4 h-4 mr-1.5" />Refresh</Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              if (!confirm('Disconnect Google Calendar? Background sync will stop until you reconnect.')) return;
              await disconnect();
            }}
          >
            Disconnect
          </Button>
        </div>
      )}

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <h2 className="font-heading font-semibold">Calendars</h2>
        <div className="divide-y">
          {calendars.length === 0 && !loading && (
            <div className="py-4 text-center text-sm text-muted-foreground">No calendars found.</div>
          )}
          {calendars.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="flex items-center gap-2 min-w-0">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">{c.summary}</span>
                {c.primary && <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">primary</span>}
              </span>
              <Button variant="ghost" size="icon" disabled={c.primary || busyId === c.id} onClick={() => removeCalendar(c)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Input placeholder="New calendar name…" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCalendar()} />
          <Button size="sm" onClick={addCalendar} disabled={adding || !newName.trim()}><Plus className="w-4 h-4 mr-1.5" />{adding ? 'Adding…' : 'Add calendar'}</Button>
        </div>
        {error && (
          <div className="flex items-start gap-2 text-xs text-destructive"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{error}</div>
        )}
      </div>
    </div>
  );
}