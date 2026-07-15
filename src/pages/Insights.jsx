import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { RefreshCw } from 'lucide-react';
import CostRangeSelector from '@/components/CostRangeSelector';
import { fmtMoney, loadRange, filterLogs, sumSpent, rangeStart, RANGE_OPTIONS } from '@/lib/cost';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthLabel(mk) {
  const [y, m] = mk.split('-');
  return `${MONTH_NAMES[Number(m) - 1]} ${y.slice(2)}`;
}
function monthStart(mk) {
  const [y, m] = mk.split('-');
  return new Date(Number(y), Number(m) - 1, 1);
}
function rangeLabel(range) {
  return (RANGE_OPTIONS.find((o) => o.value === range) || {}).label || 'Selected range';
}

export default function Insights() {
  const [data, setData] = useState(null);
  const [trackers, setTrackers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(loadRange());
  const [spendId, setSpendId] = useState('all');

  const load = useCallback(async () => {
    try {
      const [res, t] = await Promise.all([
        base44.functions.invoke('getInsights', {}),
        base44.entities.Tracker.list('-created_date')
      ]);
      setData(res.data);
      setTrackers(t);
    } catch (e) { setData(null); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex justify-center py-20"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!data) return <div className="text-muted-foreground">Insights unavailable. Make sure Google Calendar is connected.</div>;

  const start = rangeStart(range);
  const allMonthly = data.aggregate?.monthly || [];
  const monthly = allMonthly.filter((m) => monthStart(m.month) >= start);
  const chartData = monthly.map((m) => ({ label: monthLabel(m.month), lessons: m.lessons }));
  const tableMonthly = [...monthly].reverse();

  const lessonsTotal = monthly.reduce((a, m) => a + m.lessons, 0);
  const packagesTotal = monthly.reduce((a, m) => a + m.packages, 0);
  const spentTotal = monthly.reduce((a, m) => a + m.spent, 0);
  const weeks = Math.max(1, (Date.now() - start.getTime()) / (7 * 86400000));
  const avgWeek = (lessonsTotal / weeks).toFixed(1);
  const rl = rangeLabel(range);

  // spending card
  const trackerOptions = [{ id: 'all', name: 'All trackers' }, ...trackers];
  const insightFor = (id) => data.trackers?.find((t) => t.id === id);
  const hasAnyCost = trackers.some((t) => t.cost_per_package != null);
  const spendTracker = spendId === 'all' ? null : trackers.find((t) => t.id === spendId);
  const allLogs = data.trackers?.flatMap((t) => t.purchase_logs || []) || [];
  const spendLogs = spendTracker ? (insightFor(spendTracker.id)?.purchase_logs || []) : allLogs;
  const logsInRange = filterLogs(spendLogs, range);
  const totalSpent = sumSpent(logsInRange);
  const projectedAnnualFor = (t) => {
    const ins = insightFor(t.id);
    const freq = ins?.frequency_per_week || 0;
    const size = t.package_size || 1;
    const cost = t.cost_per_package;
    if (!cost || !freq) return 0;
    return Math.ceil((freq * 52) / size) * cost;
  };
  const projectedAnnual = spendTracker ? projectedAnnualFor(spendTracker) : trackers.reduce((a, t) => a + projectedAnnualFor(t), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-heading font-semibold">Insights</h1>
          <p className="text-sm text-muted-foreground">Lesson frequency and spending — {rl.toLowerCase()}.</p>
        </div>
        <CostRangeSelector value={range} onChange={setRange} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Lessons ({rl})</div>
          <div className="text-2xl font-semibold">{lessonsTotal}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Packages ({rl})</div>
          <div className="text-2xl font-semibold">{packagesTotal}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Spent ({rl})</div>
          <div className="text-2xl font-semibold">{fmtMoney(spentTotal)}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Avg / week ({rl})</div>
          <div className="text-2xl font-semibold">{avgWeek}</div>
        </div>
      </div>

      {hasAnyCost && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-heading font-semibold">Spending</h2>
            <select className="h-8 rounded-md border border-input bg-background px-2 text-sm" value={spendId} onChange={(e) => setSpendId(e.target.value)}>
              {trackerOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-muted-foreground">Total spent{spendTracker ? ` · ${spendTracker.name}` : ' (all trackers)'}</div>
              <div className="text-xl font-semibold">{fmtMoney(totalSpent)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Projected annual spend</div>
              <div className="text-xl font-semibold">{projectedAnnual ? fmtMoney(projectedAnnual) : '—'}</div>
            </div>
            {spendTracker ? (
              <div>
                <div className="text-xs text-muted-foreground">Cost per lesson</div>
                <div className="text-xl font-semibold">{fmtMoney(spendTracker.cost_per_package / (spendTracker.package_size || 1))}</div>
              </div>
            ) : (
              trackers.filter((t) => t.cost_per_package != null).map((t) => {
                const ins = insightFor(t.id);
                const spent = sumSpent(filterLogs(ins?.purchase_logs || [], range));
                const perLesson = t.cost_per_package / (t.package_size || 1);
                return (
                  <div key={t.id}>
                    <div className="text-xs text-muted-foreground">{t.name}</div>
                    <div className="text-sm font-semibold">{fmtMoney(spent)} <span className="text-muted-foreground font-normal">· {fmtMoney(perLesson)}/lesson</span></div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card p-5">
        <h2 className="font-heading font-semibold mb-4">Lessons per month</h2>
        {chartData.length === 0 ? (
          <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">No lessons in this range.</div>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-45} textAnchor="end" height={50} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} />
                <Bar dataKey="lessons" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-card divide-y">
        {tableMonthly.length === 0 && (
          <div className="p-8 text-center text-muted-foreground text-sm">No months in this range.</div>
        )}
        {tableMonthly.map((m) => (
          <div key={m.month} className="grid grid-cols-5 gap-2 p-3 text-sm">
            <div className="font-medium">{monthLabel(m.month)}</div>
            <div><span className="text-muted-foreground">Lessons:</span> {m.lessons}</div>
            <div><span className="text-muted-foreground">Cancelled:</span> {m.cancelled}</div>
            <div><span className="text-muted-foreground">Packages:</span> {m.packages}</div>
            <div><span className="text-muted-foreground">Spent:</span> {fmtMoney(m.spent)}</div>
          </div>
        ))}
      </div>

      {monthly.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <h2 className="font-heading font-semibold mb-3">Monthly averages</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-muted-foreground">Avg lessons / month</div>
              <div className="text-xl font-semibold">{(lessonsTotal / monthly.length).toFixed(1)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Avg cancelled / month</div>
              <div className="text-xl font-semibold">{(monthly.reduce((a, m) => a + (m.cancelled || 0), 0) / monthly.length).toFixed(1)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Avg packages / month</div>
              <div className="text-xl font-semibold">{(packagesTotal / monthly.length).toFixed(1)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Avg spent / month</div>
              <div className="text-xl font-semibold">{fmtMoney(spentTotal / monthly.length)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}