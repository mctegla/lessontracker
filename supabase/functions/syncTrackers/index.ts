import { getUserFromRequest, getGoogleAccessToken, serviceClient, corsHeaders } from '../_shared/google.ts';

function lessonStart(ev) {
  if (!ev.start) return null;
  const s = ev.start.dateTime || ev.start.date;
  return s ? new Date(s) : null;
}
function lessonDateStr(ev) {
  if (!ev.start) return null;
  if (ev.start.dateTime) return ev.start.dateTime.slice(0, 10);
  return ev.start.date || null;
}
function ymd(d) { return d.toISOString().slice(0, 10); }
function shiftDateStr(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function nameMatch(summary, primary, alternates) {
  const s = (summary || '').trim().toLowerCase();
  if (!s) return false;
  if (s === (primary || '').trim().toLowerCase()) return true;
  for (const a of (alternates || [])) { if (s === String(a).trim().toLowerCase()) return true; }
  return false;
}

async function gcalGet(headers, url) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error('GCal GET (' + res.status + '): ' + await res.text());
  return await res.json();
}
async function createEvent(headers, calId, title, dateStr, description) {
  const body = { summary: title, description, start: { date: dateStr }, end: { date: shiftDateStr(dateStr, 1) } };
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error('Create event failed: ' + await res.text());
  const d = await res.json(); return d.id;
}
async function updateEvent(headers, calId, id, title, dateStr, description) {
  const body = { summary: title, description, start: { date: dateStr }, end: { date: shiftDateStr(dateStr, 1) } };
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(id)}`, { method: 'PUT', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error('Update event failed: ' + await res.text());
}
async function deleteEvent(headers, calId, id) {
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(id)}`, { method: 'DELETE', headers });
  if (!res.ok && res.status !== 404) throw new Error('Delete event failed: ' + await res.text());
}
async function updateOrCreate(headers, calId, id, title, dateStr, desc) {
  if (id) {
    const ok = await updateEvent(headers, calId, id, title, dateStr, desc).then(() => true).catch(() => false);
    if (ok) return id;
    await deleteEvent(headers, calId, id).catch(() => {});
  }
  return await createEvent(headers, calId, title, dateStr, desc);
}
async function cleanOrphanEvents(headers, targetCal, titles, trackerName) {
  try {
    const cld = await gcalGet(headers, 'https://www.googleapis.com/calendar/v3/users/me/calendarList');
    const tMin = new Date(Date.now() - 400 * 86400000).toISOString();
    const tMax = new Date(Date.now() + 400 * 86400000).toISOString();
    for (const c of (cld.items || [])) {
      if (c.id === targetCal) continue;
      for (const title of titles) {
        const p = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', maxResults: '250', q: title, timeMin: tMin, timeMax: tMax });
        try {
          const d = await gcalGet(headers, `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(c.id)}/events?${p}`);
          for (const ev of (d.items || [])) {
            if (ev.status === 'cancelled') continue;
            if (ev.summary === title && (ev.description || '').includes(trackerName)) {
              await deleteEvent(headers, c.id, ev.id).catch(() => {});
            }
          }
        } catch (e) {}
      }
    }
  } catch (e) {}
}

async function maybeNotify(supabase, userId, t, type, message, packageNumber) {
  const { data: ex } = await supabase.from('app_notifications').select('id')
    .eq('user_id', userId).eq('tracker_id', t.id).eq('type', type).eq('package_number', packageNumber);
  if (ex && ex.length > 0) return;
  await supabase.from('app_notifications').insert({
    user_id: userId, tracker_id: t.id, tracker_name: t.name, type, message, package_number: packageNumber, cleared: false
  });
}

async function syncTracker(supabase, userId, t, headers) {
  const now = new Date();
  const size = t.package_size || 1;
  const warningValue = t.early_warning_value || 0;
  const unit = t.early_warning_unit || 'lessons';
  const scanCal = t.scan_calendar_id || 'primary';
  const targetCal = t.target_calendar_id || scanCal;
  const timeMin = new Date((t.tracking_start_date || t.package_start_date) + 'T00:00:00');
  const timeMax = new Date(now.getTime() + 730 * 86400000);
  const pkgStart = new Date(t.package_start_date + 'T00:00:00');

  const params = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', maxResults: '250', timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString() });
  const data = await gcalGet(headers, `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(scanCal)}/events?${params}`);
  const all = (data.items || [])
    .filter((ev) => ev.status !== 'cancelled' && nameMatch(ev.summary, t.lesson_event_name, t.alternate_lesson_event_names))
    .map((ev) => ({ id: ev.id, start: lessonStart(ev), dateStr: lessonDateStr(ev) }))
    .filter((x) => x.start)
    .sort((a, b) => a.start - b.start);

  let otherMatches = 0;
  try {
    const cld = await gcalGet(headers, 'https://www.googleapis.com/calendar/v3/users/me/calendarList');
    for (const c of (cld.items || [])) {
      if (c.id === scanCal) continue;
      const p2 = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', maxResults: '250', timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(), q: t.lesson_event_name });
      try {
        const d2 = await gcalGet(headers, `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(c.id)}/events?${p2}`);
        otherMatches += (d2.items || []).filter((ev) => ev.status !== 'cancelled' && nameMatch(ev.summary, t.lesson_event_name, t.alternate_lesson_event_names)).length;
      } catch (e) {}
    }
  } catch (e) {}

  const sincePkg = all.filter((x) => x.start >= pkgStart);
  const attended = sincePkg.filter((x) => x.start <= now);
  const completedPackages = t.recurring ? Math.floor(attended.length / size) : 0;
  const packageStartIdx = completedPackages * size;
  const currentLessons = sincePkg.slice(packageStartIdx, packageStartIdx + size);
  const currentAttended = currentLessons.filter((x) => x.start <= now).length;
  const remaining = Math.max(0, size - currentAttended);
  const lastLessonObj = currentLessons.length >= size ? currentLessons[size - 1] : null;
  const lastLesson = lastLessonObj ? lastLessonObj.start : null;
  const lastLessonDateStr = lastLessonObj ? lastLessonObj.dateStr : null;
  const nextLessonEv = all.find((x) => x.start > now);
  const nextLesson = nextLessonEv ? nextLessonEv.start : null;

  let warningExpectedDate = null;
  let warningEventDateStr = null;
  let warningActive = false;
  if (currentAttended < size) {
    if (unit === 'lessons') {
      const trigIdx = size - warningValue;
      if (trigIdx >= 1) {
        const ev = currentLessons[trigIdx - 1];
        if (ev) { warningExpectedDate = ev.start; warningEventDateStr = ev.dateStr; }
        if (currentAttended >= trigIdx) warningActive = true;
      }
    } else {
      if (lastLessonObj) {
        warningExpectedDate = new Date(lastLessonObj.start.getTime() - warningValue * 86400000);
        warningEventDateStr = shiftDateStr(lastLessonObj.dateStr, -warningValue);
        if (now >= warningExpectedDate) warningActive = true;
      }
    }
  }

  let status = 'on_track';
  if (currentAttended >= size) {
    status = (lastLesson && lastLesson < now) ? 'overdue' : 'due';
  } else if (warningActive) {
    status = 'warning_soon';
  }

  let alertMsg = null;
  if (all.length === 0) {
    alertMsg = 'No matching lesson events found for "' + t.lesson_event_name + '". Verify the lesson event name in Settings.';
  } else if (otherMatches > 0) {
    alertMsg = otherMatches + ' matching event(s) found in a different calendar. Edit Settings to include that calendar if desired.';
  }

  let warningEventId = t.warning_event_id || null;
  let dueEventId = t.due_event_id || null;
  const packageNumber = completedPackages;

  if (t.package_start_date) {
    const { data: startLog } = await supabase.from('purchase_logs').select('id')
      .eq('user_id', userId).eq('tracker_id', t.id).eq('date_purchased', t.package_start_date);
    if (!startLog || startLog.length === 0) {
      await supabase.from('purchase_logs').insert({
        user_id: userId, tracker_id: t.id, tracker_name: t.name, date_purchased: t.package_start_date,
        package_start_date: t.package_start_date, package_size: size, cost: t.cost_per_package ?? null,
        source: 'auto', package_number: 0
      });
    }
  }

  if (t.package_number !== completedPackages) {
    if (warningEventId) { await deleteEvent(headers, targetCal, warningEventId).catch(() => {}); warningEventId = null; }
    if (dueEventId) { await deleteEvent(headers, targetCal, dueEventId).catch(() => {}); dueEventId = null; }
    if (completedPackages > (t.package_number ?? 0) && completedPackages >= 1) {
      const startLesson = sincePkg[packageStartIdx];
      const purchaseDateStr = startLesson ? startLesson.dateStr : ymd(now);
      const { data: existingLog } = await supabase.from('purchase_logs').select('id')
        .eq('user_id', userId).eq('tracker_id', t.id).eq('package_number', completedPackages).eq('source', 'auto');
      if (!existingLog || existingLog.length === 0) {
        await supabase.from('purchase_logs').insert({
          user_id: userId, tracker_id: t.id, tracker_name: t.name, date_purchased: purchaseDateStr,
          package_start_date: purchaseDateStr, package_size: size, cost: t.cost_per_package ?? null,
          source: 'auto', package_number: completedPackages
        });
      }
    }
  }

  if (lastLessonObj) {
    const desc = 'Package complete! Total lessons used: ' + size + '. Purchase your next ' + t.name + ' package.';
    dueEventId = await updateOrCreate(headers, targetCal, dueEventId, t.reminder_event_title, lastLessonDateStr, desc);
    if (status === 'due' || status === 'overdue') {
      await maybeNotify(supabase, userId, t, 'due', t.name + ' package is complete — purchase the next package.', packageNumber);
    }
  } else if (dueEventId) {
    await deleteEvent(headers, targetCal, dueEventId).catch(() => {});
    dueEventId = null;
  }

  if (warningActive && warningEventDateStr) {
    const desc = 'Lesson package running low for ' + t.name + '. Current count: ' + currentAttended + ' of ' + size + '. Estimated last lesson: ' + (lastLessonDateStr || 'unknown') + '. Purchase the next package soon.';
    warningEventId = await updateOrCreate(headers, targetCal, warningEventId, t.warning_event_title, warningEventDateStr, desc);
    await maybeNotify(supabase, userId, t, 'warning', t.name + ' package is running low — ' + remaining + ' lesson(s) remaining.', packageNumber);
  } else if (warningEventId) {
    await deleteEvent(headers, targetCal, warningEventId).catch(() => {});
    warningEventId = null;
  }

  await cleanOrphanEvents(headers, targetCal, [t.reminder_event_title, t.warning_event_title], t.name);

  const computed = {
    count: currentAttended,
    total: size,
    remaining,
    next_lesson: nextLesson ? nextLesson.toISOString() : null,
    last_lesson: lastLesson ? lastLesson.toISOString() : null,
    last_lesson_date: lastLessonDateStr,
    warning_date: warningExpectedDate ? warningExpectedDate.toISOString() : null,
    warning_active: warningActive,
    status,
    package_number: packageNumber,
    other_calendar_matches: otherMatches,
    scheduled_in_current_package: currentLessons.length,
    computed_at: now.toISOString()
  };

  await supabase.from('trackers').update({
    package_number: packageNumber,
    warning_event_id: warningEventId,
    due_event_id: dueEventId,
    last_synced: now.toISOString(),
    last_sync_error: null,
    last_alert: alertMsg,
    last_computed: computed
  }).eq('id', t.id);

  return { id: t.id, name: t.name, status, count: currentAttended, total: size };
}

let supabase; // module-level reference used inside syncTracker (matches original code's closure-free style)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  try {
    supabase = serviceClient();

    // Two ways this function runs:
    // 1) Called by a logged-in user from the app (Authorization: Bearer <user JWT>) -> sync only that user's trackers.
    // 2) Called by the pg_cron scheduled job (Authorization: Bearer <service role key>) -> sync ALL users' trackers.
    const authHeader = req.headers.get('Authorization') || '';
    const isServiceRoleCall = authHeader.includes(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '__none__');

    const body = await req.json().catch(() => ({}));
    const results = [];

    if (isServiceRoleCall) {
      // Scheduled job: loop over every user who has an active tracker.
      let query = supabase.from('trackers').select('*').eq('active', true);
      if (body.tracker_id) query = query.eq('id', body.tracker_id);
      const { data: trackers, error } = await query;
      if (error) throw error;

      for (const t of trackers || []) {
        try {
          const { accessToken } = await getGoogleAccessToken(t.user_id);
          const headers = { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
          results.push(await syncTracker(supabase, t.user_id, t, headers));
        } catch (e) {
          await supabase.from('trackers').update({ last_sync_error: e.message, last_synced: new Date().toISOString() }).eq('id', t.id);
          results.push({ id: t.id, error: e.message });
        }
      }
    } else {
      const user = await getUserFromRequest(req);
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });

      let query = supabase.from('trackers').select('*').eq('user_id', user.id).eq('active', true);
      if (body.tracker_id) query = query.eq('id', body.tracker_id);
      const { data: trackers, error } = await query;
      if (error) throw error;

      const { accessToken } = await getGoogleAccessToken(user.id);
      const headers = { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

      for (const t of trackers || []) {
        try {
          results.push(await syncTracker(supabase, user.id, t, headers));
        } catch (e) {
          await supabase.from('trackers').update({ last_sync_error: e.message, last_synced: new Date().toISOString() }).eq('id', t.id);
          results.push({ id: t.id, error: e.message });
        }
      }
    }

    return Response.json({ synced: results }, { headers: corsHeaders() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders() });
  }
});
