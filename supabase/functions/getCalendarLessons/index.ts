import { getUserFromRequest, getGoogleAccessToken, serviceClient, corsHeaders } from '../_shared/google.ts';

function lessonStart(ev) { if (!ev.start) return null; const s = ev.start.dateTime || ev.start.date; return s ? new Date(s) : null; }
function lessonEnd(ev) { if (!ev.end) return null; const s = ev.end.dateTime || ev.end.date; return s ? new Date(s) : null; }
function nameMatch(summary, primary, alternates) {
  const s = (summary || '').trim().toLowerCase();
  if (!s) return false;
  if (s === (primary || '').trim().toLowerCase()) return true;
  for (const a of (alternates || [])) { if (s === String(a).trim().toLowerCase()) return true; }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  try {
    const user = await getUserFromRequest(req);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });

    const body = await req.json().catch(() => ({}));
    const month = body.month || new Date().toISOString().slice(0, 7);
    const [y, m] = month.split('-').map(Number);
    const monthStart = new Date(y, m - 1, 1);
    const monthEnd = new Date(y, m, 1);

    const supabase = serviceClient();
    const { accessToken } = await getGoogleAccessToken(user.id);
    const headers = { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

    const { data: allTrackersRaw } = await supabase.from('trackers').select('*').eq('user_id', user.id);
    const allTrackers = (allTrackersRaw || []).filter((t) => t.active !== false);
    const ids = Array.isArray(body.tracker_ids) && body.tracker_ids.length ? body.tracker_ids : null;
    const trackers = ids ? allTrackers.filter((t) => ids.includes(t.id)) : allTrackers;
    const { data: allLogs } = await supabase.from('purchase_logs').select('*').eq('user_id', user.id);

    const out = [];
    for (const t of trackers) {
      const size = t.package_size || 1;
      const calId = t.scan_calendar_id || 'primary';
      const fminRaw = t.tracking_start_date || t.package_start_date;
      const fmin = fminRaw ? new Date(fminRaw + 'T00:00:00') : monthStart;
      const params = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', maxResults: '2500', timeMin: fmin.toISOString(), timeMax: monthEnd.toISOString() });
      let items = [];
      try {
        const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?${params}`, { headers });
        if (res.ok) items = (await res.json()).items || [];
      } catch (e) {}

      const lessons = items
        .filter((ev) => ev.status !== 'cancelled' && nameMatch(ev.summary, t.lesson_event_name, t.alternate_lesson_event_names))
        .map((ev) => ({ start: lessonStart(ev), end: lessonEnd(ev), summary: ev.summary }))
        .filter((l) => l.start)
        .sort((a, b) => a.start - b.start);

      const logs = (allLogs || []).filter((l) => l.tracker_id === t.id);
      let boundaries = logs
        .map((p) => ({ start: new Date((p.package_start_date || p.date_purchased) + 'T00:00:00'), size: p.package_size || size, number: p.package_number }))
        .filter((b) => !isNaN(b.start.getTime()))
        .sort((a, b) => a.start - b.start);
      if (boundaries.length === 0 && fminRaw) {
        boundaries = [{ start: new Date(fminRaw + 'T00:00:00'), size, number: 0 }];
      }

      let curPkg = null, curCount = 0;
      for (const l of lessons) {
        while (boundaries.length && boundaries[0].start <= l.start) {
          curPkg = boundaries.shift();
          curCount = 0;
        }
        let position = null, pkg = null, counter = null, beyond = false;
        if (curPkg) {
          curCount++;
          if (curCount > curPkg.size) {
            beyond = true;
          } else {
            position = curCount;
            pkg = curPkg.number ?? 0;
            counter = `${curCount}/${curPkg.size}`;
          }
        }
        const d = l.start;
        if (d >= monthStart && d < monthEnd) {
          out.push({
            start: d.toISOString(),
            end: l.end ? l.end.toISOString() : null,
            summary: l.summary,
            tracker_id: t.id,
            tracker_name: t.name,
            position,
            package_size: size,
            package_number: pkg,
            counter,
            beyond_package: beyond
          });
        }
      }
    }
    out.sort((a, b) => new Date(a.start) - new Date(b.start));
    return Response.json({ lessons: out }, { headers: corsHeaders() });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500, headers: corsHeaders() });
  }
});
