import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Flag } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, isSameMonth, isSameDay, parseISO } from 'date-fns';
import { colorDot, colorDotForIndex } from '@/lib/trackerColors';

export default function LessonCalendar({ trackers }) {
  const [month, setMonth] = useState(new Date());
  const [selected, setSelected] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setSelected(trackers.map((t) => t.id)); }, [trackers]);

  useEffect(() => {
    if (!selected.length) { setLessons([]); return; }
    let cancel = false;
    setLoading(true);
    base44.functions.invoke('getCalendarLessons', { month: format(month, 'yyyy-MM'), tracker_ids: selected })
      .then((res) => { if (!cancel) setLessons(res.data?.lessons || []); })
      .catch(() => { if (!cancel) setLessons([]); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [month, selected]);

  const colorOf = (id) => {
    const t = trackers.find((x) => x.id === id);
    return t && t.color ? colorDot(t.color) : colorDotForIndex(trackers.findIndex((x) => x.id === id));
  };

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
    const arr = []; let d = start;
    while (d <= end) { arr.push(d); d = addDays(d, 1); }
    return arr;
  }, [month]);

  const lessonsByDay = useMemo(() => {
    const map = {};
    for (const l of lessons) { const k = format(parseISO(l.start), 'yyyy-MM-dd'); (map[k] = map[k] || []).push(l); }
    return map;
  }, [lessons]);

  const toggle = (id) => setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <CalIcon className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-heading font-semibold">{format(month, 'MMMM yyyy')}</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft className="w-4 h-4" /></Button>
          <Button variant="ghost" size="sm" onClick={() => setMonth(new Date())}>Today</Button>
          <Button variant="ghost" size="icon" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="w-4 h-4" /></Button>
        </div>
      </div>

      {trackers.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {trackers.map((t) => (
            <label key={t.id} className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
              <Checkbox checked={selected.includes(t.id)} onCheckedChange={() => toggle(t.id)} />
              <span className={`w-2.5 h-2.5 rounded-full ${colorOf(t.id)}`} />
              <span>{t.name}</span>
            </label>
          ))}
        </div>
      )}

      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="bg-muted py-1.5 text-center text-xs font-medium text-muted-foreground">{d}</div>
        ))}
        {days.map((d) => {
          const key = format(d, 'yyyy-MM-dd');
          const inMonth = isSameMonth(d, month);
          const today = isSameDay(d, new Date());
          const dayLessons = lessonsByDay[key] || [];
          return (
            <div key={key} className={`min-h-[84px] bg-card p-1.5 ${!inMonth ? 'opacity-40' : ''}`}>
              <div className={`text-xs mb-1 ${today ? 'font-bold text-primary' : 'text-muted-foreground'}`}>{format(d, 'd')}</div>
              <div className="space-y-1">
                {dayLessons.slice(0, 4).map((l, i) => (
                  <div key={i} className="flex items-center gap-1 text-[11px] leading-tight rounded bg-muted/60 px-1 py-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${colorOf(l.tracker_id)}`} />
                    {l.counter && <span className="font-medium">{l.counter}</span>}
                    <span className="text-muted-foreground truncate">{format(parseISO(l.start), 'h:mm a')}</span>
                    {l.position && l.package_size && l.position === l.package_size && (
                      <Flag className="w-3 h-3 text-amber-500 shrink-0 ml-auto" aria-label="Last lesson in package" />
                    )}
                  </div>
                ))}
                {dayLessons.length > 4 && <div className="text-[10px] text-muted-foreground">+{dayLessons.length - 4} more</div>}
              </div>
            </div>
          );
        })}
      </div>

      {loading && <div className="text-xs text-muted-foreground">Loading lessons…</div>}
    </div>
  );
}