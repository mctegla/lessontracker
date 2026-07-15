import { getUserFromRequest, getGoogleAccessToken, serviceClient, corsHeaders } from '../_shared/google.ts';

function lessonStart(ev) { if (!ev.start) return null; const s = ev.start.dateTime || ev.start.date; return s ? new Date(s) : null; }
function lessonDateStr(ev) { if (!ev.start) return null; if (ev.start.dateTime) return ev.start.dateTime.slice(0, 10); return ev.start.date || null; }
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
    const tracker_id = body.tracker_id;
    if (!tracker_id) return Response.json({ error: 'tracker_id required' }, { status: 400, headers: corsHeaders() });

    const supabase = serviceClient();
    const { data: t } = await supabase.from('trackers').select('*').eq('id', tracker_id).eq('user_id', user.id).single();
    if (!t) return Response.json({ error: 'not found' }, { status: 404, headers: corsHeaders() });

    const { accessToken } = await getGoogleAccessToken(user.id);
    const headers = { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

    const size = t.package_size || 1;
    const calId = t.scan_calendar_id || 'primary';
    const timeMinRaw = t.tracking_start_date || t.package_start_date;
    const timeMin = timeMinRaw ? new Date(timeMinRaw + 'T00:00:00') : new Date(0);
    const timeMax = new Date(Date.now() + 730 * 86400000);
    const params = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', maxResults: '2500', timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString() });
    let items = [];
    try {
      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?${params}`, { headers });
      if (res.ok) items = (await res.json()).items || [];
    } catch (e) {}

    const lessons = items
      .filter((ev) => ev.status !== 'cancelled' && nameMatch(ev.summary, t.lesson_event_name, t.alternate_lesson_event_names))
      .map((ev) => ({ start: lessonStart(ev), dateStr: lessonDateStr(ev), summary: ev.summary }))
      .filter((l) => l.start)
      .sort((a, b) => a.start - b.start);

    const now = new Date();
    const past = lessons.filter((l) => l.start <= now);
    const { data: logs } = await supabase.from('purchase_logs').select('*').eq('user_id', user.id).eq('tracker_id', tracker_id);
    let boundaries = (logs || [])
      .map((p) => ({ start: new Date((p.package_start_date || p.date_purchased) + 'T00:00:00'), size: p.package_size || size, number: p.package_number }))
      .filter((b) => !isNaN(b.start.getTime()))
      .sort((a, b) => a.start - b.start);
    if (boundaries.length === 0 && timeMinRaw) {
      boundaries = [{ start: new Date(timeMinRaw + 'T00:00:00'), size, number: 0 }];
    }

    const out = [];
    let curPkg = null, curCount = 0;
    for (const l of past) {
      while (boundaries.length && boundaries[0].start <= l.start) {
        curPkg = boundaries.shift();
        curCount = 0;
      }
      if (curPkg) {
        curCount++;
        if (curCount > curPkg.size) {
          out.push({ start: l.start.toISOString(), date: l.dateStr, summary: l.summary, position: null, package_number: null, counter: null, attended: true, before_package: false, beyond_package: true });
        } else {
          out.push({ start: l.start.toISOString(), date: l.dateStr, summary: l.summary, position: curCount, package_number: curPkg.number ?? 0, counter: `${curCount}/${curPkg.size}`, attended: true, before_package: false });
        }
      } else {
        out.push({ start: l.start.toISOString(), date: l.dateStr, summary: l.summary, position: null, package_number: null, counter: null, attended: true, before_package: true });
      }
    }
    return Response.json({ lessons: out, total: out.length, package_size: size }, { headers: corsHeaders() });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500, headers: corsHeaders() });
  }
});
