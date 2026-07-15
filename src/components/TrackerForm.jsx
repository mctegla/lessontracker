import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { base44 } from '@/api/base44Client';
import AlternateNamesEditor from '@/components/AlternateNamesEditor';
import { TRACKER_COLORS } from '@/lib/trackerColors';

const DEFAULTS = {
  name: '',
  lesson_event_name: '',
  package_size: 4,
  early_warning_value: 2,
  early_warning_unit: 'lessons',
  recurring: true,
  reminder_event_title: 'Lesson package due',
  warning_event_title: 'Lesson package running low',
  scan_calendar_id: '',
  target_calendar_id: '',
  package_start_date: new Date().toISOString().slice(0, 10),
  tracking_start_date: new Date().toISOString().slice(0, 10),
  cost_per_package: '',
  alternate_lesson_event_names: [],
  color: 'blue'
};

export default function TrackerForm({ open, onOpenChange, initial, calendars, onSaved }) {
  const [form, setForm] = useState(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(null);
  const isEdit = !!initial;

  useEffect(() => {
    if (open) {
      const init = { ...DEFAULTS, ...(initial || {}) };
      if (initial && initial.cost_per_package != null) init.cost_per_package = String(initial.cost_per_package);
      if (!init.tracking_start_date) init.tracking_start_date = init.package_start_date;
      setForm(init);
      setConfirmOpen(false);
      setPending(null);
    }
  }, [open, initial]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const costPerLesson = form.cost_per_package && Number(form.package_size) ? (Number(form.cost_per_package) / Number(form.package_size)) : null;

  const build = () => ({
    name: form.name.trim(),
    lesson_event_name: form.lesson_event_name.trim(),
    package_size: Number(form.package_size) || 1,
    early_warning_value: Number(form.early_warning_value) || 0,
    early_warning_unit: form.early_warning_unit,
    recurring: form.recurring,
    reminder_event_title: form.reminder_event_title.trim() || 'Lesson package due',
    warning_event_title: form.warning_event_title.trim() || 'Lesson package running low',
    scan_calendar_id: form.scan_calendar_id,
    target_calendar_id: form.target_calendar_id || form.scan_calendar_id,
    package_start_date: form.package_start_date,
    tracking_start_date: form.tracking_start_date,
    cost_per_package: form.cost_per_package ? Number(form.cost_per_package) : null,
    alternate_lesson_event_names: (form.alternate_lesson_event_names || []).filter(Boolean),
    color: form.color || 'blue',
    active: true
  });

  const persist = async (data) => {
    if (isEdit) await base44.entities.Tracker.update(initial.id, data);
    else await base44.entities.Tracker.create(data);
  };

  const onSubmit = async () => {
    if (!form.name.trim() || !form.lesson_event_name.trim() || !form.package_start_date) return;
    const data = build();
    if (isEdit && Number(initial.package_size) !== data.package_size) {
      setPending(data); setConfirmOpen(true); return;
    }
    setSaving(true);
    try { await persist(data); await onSaved(data); onOpenChange(false); } finally { setSaving(false); }
  };

  const confirmApply = async () => {
    setSaving(true);
    try { await persist(pending); await onSaved(pending); setConfirmOpen(false); onOpenChange(false); } finally { setSaving(false); }
  };

  const field = (label, children) => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit tracker' : 'New tracker'}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-2">
            {field('Tracker name', <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Tennis" />)}
            {field('Lesson event name', <Input value={form.lesson_event_name} onChange={(e) => set('lesson_event_name', e.target.value)} placeholder="Tennis Lesson" />)}
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Alternate lesson event names (optional)</Label>
              <AlternateNamesEditor value={form.alternate_lesson_event_names || []} onChange={(v) => set('alternate_lesson_event_names', v)} />
              <p className="text-xs text-muted-foreground">Matched case-insensitively. Use these if the calendar event name changed over time.</p>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Calendar color</Label>
              <div className="flex flex-wrap gap-2">
                {TRACKER_COLORS.map((c) => (
                  <button type="button" key={c.value} onClick={() => set('color', c.value)} className={`w-7 h-7 rounded-full ${c.dot} border-2 transition ${form.color === c.value ? 'border-foreground' : 'border-transparent'}`} title={c.label} />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Used for this tracker's lessons on the dashboard calendar.</p>
            </div>
            {field('Package size', <Input type="number" min="1" value={form.package_size} onChange={(e) => set('package_size', e.target.value)} />)}
            {field('Tracking start date', (
              <>
                <Input type="date" value={form.tracking_start_date} onChange={(e) => set('tracking_start_date', e.target.value)} />
                <p className="text-xs text-muted-foreground">How far back to match lesson events. Back-date to include past lessons in calendar, card, and insights.</p>
              </>
            ))}
            {field('Package start date', (
              <>
                <Input type="date" value={form.package_start_date} onChange={(e) => set('package_start_date', e.target.value)} />
                <p className="text-xs text-muted-foreground">When the current lesson package starts counting usage (lesson 1).</p>
              </>
            ))}
            {field('Cost per package (optional)', <Input type="number" min="0" step="0.01" value={form.cost_per_package} onChange={(e) => set('cost_per_package', e.target.value)} placeholder="150" />)}
            {field('Cost per lesson (auto)', (
              <div className="h-9 flex items-center px-2 text-sm text-muted-foreground rounded-md border bg-muted/40">
                {costPerLesson != null ? `$${costPerLesson.toFixed(2)}` : '—'}
              </div>
            ))}
            {field('Early warning value', <Input type="number" min="0" value={form.early_warning_value} onChange={(e) => set('early_warning_value', e.target.value)} />)}
            {field('Early warning unit', (
              <select className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm" value={form.early_warning_unit} onChange={(e) => set('early_warning_unit', e.target.value)}>
                <option value="lessons">lessons before last</option>
                <option value="days">days before last</option>
              </select>
            ))}
            {field('Scan calendar (lessons)', (
              <select className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm" value={form.scan_calendar_id} onChange={(e) => set('scan_calendar_id', e.target.value)}>
                <option value="">Primary calendar</option>
                {calendars.map((c) => <option key={c.id} value={c.id}>{c.summary}</option>)}
              </select>
            ))}
            {field('Reminder calendar (write)', (
              <select className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm" value={form.target_calendar_id} onChange={(e) => set('target_calendar_id', e.target.value)}>
                <option value="">Same as scan calendar</option>
                {calendars.map((c) => <option key={c.id} value={c.id}>{c.summary}</option>)}
              </select>
            ))}
            {field('Reminder event title', <Input value={form.reminder_event_title} onChange={(e) => set('reminder_event_title', e.target.value)} />)}
            {field('Warning event title', <Input value={form.warning_event_title} onChange={(e) => set('warning_event_title', e.target.value)} />)}
            <div className="col-span-2 flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Recurring tracking</div>
                <div className="text-xs text-muted-foreground">Auto-start the next package when this one completes</div>
              </div>
              <Switch checked={form.recurring} onCheckedChange={(v) => set('recurring', v)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={onSubmit} disabled={saving || !form.name.trim() || !form.lesson_event_name.trim()}>
              {saving ? 'Saving…' : isEdit ? 'Save & rescan' : 'Create tracker'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Change package size?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Changing the package size from {initial?.package_size} to {pending?.package_size} will recalculate this tracker from its package start date ({form.package_start_date}). The current count and all reminder events on your calendar will be updated to match. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={confirmApply} disabled={saving}>{saving ? 'Applying…' : 'Apply & recalculate'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}