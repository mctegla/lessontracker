import { getUserFromRequest, getGoogleAccessToken, corsHeaders } from '../_shared/google.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  try {
    const user = await getUserFromRequest(req);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders() });

    const { accessToken } = await getGoogleAccessToken(user.id);
    const headers = { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
    const body = await req.json().catch(() => ({}));

    if (body.action === 'listCalendars') {
      const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', { headers });
      if (!res.ok) return Response.json({ error: 'gcal_error', details: await res.text() }, { status: res.status, headers: corsHeaders() });
      const data = await res.json();
      return Response.json({ calendars: (data.items || []).map((c) => ({ id: c.id, summary: c.summary, primary: !!c.primary })) }, { headers: corsHeaders() });
    }

    if (body.action === 'createCalendar') {
      const name = (body.name || '').trim();
      if (!name) return Response.json({ error: 'name_required' }, { status: 400, headers: corsHeaders() });
      const res = await fetch('https://www.googleapis.com/calendar/v3/calendars', { method: 'POST', headers, body: JSON.stringify({ summary: name }) });
      if (!res.ok) return Response.json({ error: 'gcal_error', details: await res.text() }, { status: res.status, headers: corsHeaders() });
      const data = await res.json();
      return Response.json({ calendar: { id: data.id, summary: data.summary, primary: false } }, { headers: corsHeaders() });
    }

    if (body.action === 'deleteCalendar') {
      const calId = body.calendar_id;
      if (!calId) return Response.json({ error: 'calendar_id_required' }, { status: 400, headers: corsHeaders() });
      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}`, { method: 'DELETE', headers });
      if (!res.ok && res.status !== 404) return Response.json({ error: 'gcal_error', details: await res.text() }, { status: res.status, headers: corsHeaders() });
      return Response.json({ deleted: true }, { headers: corsHeaders() });
    }

    if (body.action === 'listEvents') {
      const calId = encodeURIComponent(body.calendar_id || 'primary');
      const params = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', maxResults: '250' });
      if (body.time_min) params.set('timeMin', new Date(body.time_min).toISOString());
      if (body.time_max) params.set('timeMax', new Date(body.time_max).toISOString());
      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calId}/events?${params}`, { headers });
      if (!res.ok) return Response.json({ error: 'gcal_error', details: await res.text() }, { status: res.status, headers: corsHeaders() });
      const data = await res.json();
      return Response.json({ events: data.items || [] }, { headers: corsHeaders() });
    }

    return Response.json({ error: 'unknown_action' }, { status: 400, headers: corsHeaders() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders() });
  }
});
