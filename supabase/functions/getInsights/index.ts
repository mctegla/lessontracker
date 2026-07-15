import { getUserFromRequest, getGoogleAccessToken, serviceClient, corsHeaders } from '../_shared/google.ts';

function lessonStart(ev) { if (!ev.start) return null; const s = ev.start.dateTime || ev.start.date; return s ? new Date(s) : null; }
function ymd(d) { return d.toISOString().slice(0, 10); }
function nameMatch(summary, primary, alternates) {
  const s = (summary || '').trim().toLowerCase();
  if (!s) return false;
  if (s === (primary || '').trim().toLowerCase()) return true;
  for (const a of (alternates || [])) { if (s === String(a).trim().toLowerCase()) return true; }
  return false;
}
function monthKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function monday(d) { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x; }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  try {
    const user = await getUserFromRequest(req);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });

    const supabase = serviceClient();
    const { accessToken } = await getGoogleAccessToken(user.id);
    const headers = { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
    const now = new Date();
    const since = new Date(now.getTime() - 366 * 86400000);

    const weeks = []; let w = monday(now); for (let i = 0; i < 52; i++) { weeks.push(new Date(w)); w = new Date(w.getTime() - 7 * 86400000); } weeks.reverse();
    const weekIdx = new Map(weeks.map((d, i) => [ymd(d), i]));
    const months = []; let m = new Date(now.getFullYear(), now.getMonth(), 1); for (let i = 0; i < 12; i++) { months.push(monthKey(m)); m = new Date(m.getFullYear(), m.getMonth() - 1, 1); } months.reverse();

    const { data: trackersRaw } = await supabase.from('trackers').select('*').eq('user_id', user.id);
    const trackers = (trackersRaw || []).filter((t) => t.active !== false);
    const { data: allLogs } = await supabase.from('purchase_logs').select('*').eq('user_id', user.id);

    const perTracker = [];
    const aggWeeks = new Array(52).fill(0);
    const aggMonths = new Array(12).fill(0);
    const aggCancelled = new Array(12).fill(0);
    const aggSpent = new Array(12).fill(0);

    for (const t of trackers) {
      const calId = t.scan_calendar_id || 'primary';
      const tStartRaw = t.tracking_start_date || t.package_start_date;
      const tStart = tStartRaw ? new Date(tStartRaw + 'T00:00:00') : since;
      const useMin = tStart < since ? tStart : since;
      const params = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', maxResults: '2500', timeMin: useMin.toISOString(), timeMax: now.toISOString() });
      let items = [];
      try {
        const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?${params}`, { headers });
        if (res.ok) { const d = await res.json(); items = d.items || []; }
      } catch (e) {}

      const matches = items.filter((ev) => nameMatch(ev.summary, t.lesson_event_name, t.alternate_lesson_event_names));
      const attended = matches.filter((ev) => ev.status !== 'cancelled').map(lessonStart).filter(Boolean).sort((a, b) => a - b);
      const cancelledCount = matches.filter((ev) => ev.status === 'cancelled').length;

      const wk = new Array(52).fill(0);
      for (const s of attended) { const i = weekIdx.get(ymd(monday(s))); if (i != null) wk[i]++; }
      const mo = new Array(12).fill(0); const cm = new Array(12).fill(0);
      for (const s of attended) { const i = months.indexOf(monthKey(s)); if (i >= 0) mo[i]++; }
      for (const ev of matches.filter((ev) => ev.status === 'cancelled')) { const s = lessonStart(ev); if (s) { const i = months.indexOf(monthKey(s)); if (i >= 0) cm[i]++; } }

      let cur = 0; for (let i = 51; i >= 0; i--) { if (wk[i] > 0) cur++; else break; }
      let longest = 0, run = 0; for (const c of wk) { if (c > 0) { run++; longest = Math.max(longest, run); } else run = 0; }
      const last8 = wk.slice(44).reduce((a, b) => a + b, 0);
      const avg8 = last8 / 8;
      const frequency = avg8;

      const c = t.last_computed || {};
      const size = t.package_size || 1;
      const remaining = c.remaining != null ? c.remaining : size;
      let projected = null;
      if (c.last_lesson) projected = new Date(c.last_lesson);
      else if (remaining <= 0) projected = now;
      else if (frequency > 0) projected = new Date(now.getTime() + remaining * 7 / frequency * 86400000);
      const enough = attended.length >= 4;
      const confidence = enough ? `Based on your recent pace of ${frequency.toFixed(1)} lessons per week` : 'Not enough history yet — projection available after 4 lessons';

      const logs = (allLogs || []).filter((l) => l.tracker_id === t.id).sort((a, b) => new Date(b.date_purchased) - new Date(a.date_purchased));
      const costPerLesson = t.cost_per_package != null ? (Number(t.cost_per_package) || 0) / (t.package_size || 1) : 0;
      const moPkg = new Array(12).fill(0); const moSpent = new Array(12).fill(0);
      for (const l of logs) { const i = months.indexOf(monthKey(new Date(l.date_purchased))); if (i >= 0) { moPkg[i]++; } }
      for (let i = 0; i < 12; i++) { moSpent[i] = mo[i] * costPerLesson; }

      const monthly = months.map((mk, i) => ({ month: mk, lessons: mo[i], cancelled: cm[i], packages: moPkg[i], spent: moSpent[i] }));
      const heatmap = weeks.map((d, i) => ({ week_start: ymd(d), count: wk[i] }));

      for (let i = 0; i < 52; i++) aggWeeks[i] += wk[i];
      for (let i = 0; i < 12; i++) { aggMonths[i] += mo[i]; aggCancelled[i] += cm[i]; aggSpent[i] += moSpent[i]; }

      perTracker.push({
        id: t.id, name: t.name,
        streak: cur, longest_streak: longest, avg_per_week_8: +avg8.toFixed(2), frequency_per_week: +frequency.toFixed(2),
        heatmap, monthly,
        projected_purchase_date: projected ? projected.toISOString() : null,
        projection_confidence: confidence,
        has_enough_history: enough,
        total_lessons_attended: attended.length,
        cancelled_count: cancelledCount,
        purchase_logs: logs
      });
    }

    let acur = 0; for (let i = 51; i >= 0; i--) { if (aggWeeks[i] > 0) acur++; else break; }
    let along = 0, arun = 0; for (const c of aggWeeks) { if (c > 0) { arun++; along = Math.max(along, arun); } else arun = 0; }
    const aggAvg = aggWeeks.slice(44).reduce((a, b) => a + b, 0) / 8;
    const aggMonthly = months.map((mk, i) => ({ month: mk, lessons: aggMonths[i], cancelled: aggCancelled[i], packages: 0, spent: aggSpent[i] }));
    for (const l of (allLogs || [])) { const i = months.indexOf(monthKey(new Date(l.date_purchased))); if (i >= 0) { aggMonthly[i].packages++; } }

    return Response.json({
      trackers: perTracker,
      aggregate: {
        streak: acur, longest_streak: along, avg_per_week_8: +aggAvg.toFixed(2),
        heatmap: weeks.map((d, i) => ({ week_start: ymd(d), count: aggWeeks[i] })),
        monthly: aggMonthly
      }
    }, { headers: corsHeaders() });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500, headers: corsHeaders() });
  }
});
