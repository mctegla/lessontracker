import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/lib/supabaseClient';

export function useGcalConnection() {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [calendars, setCalendars] = useState([]);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    try {
      const res = await base44.functions.invoke('gcalApi', { action: 'listCalendars' });
      setCalendars(res.data.calendars || []);
      setConnected(true);
      setError(null);
    } catch (e) {
      setConnected(false);
      setCalendars([]);
      setError('not_connected');
    }
  }, []);

  useEffect(() => {
    (async () => {
      await reload();
      setLoading(false);
    })();
  }, [reload]);

  // Kicks off Google's OAuth consent screen requesting Calendar access.
  // `state` carries the user's current Supabase access token so the
  // google-oauth-callback edge function can identify who's connecting.
  const connect = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const params = new URLSearchParams({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      redirect_uri: import.meta.env.VITE_GOOGLE_OAUTH_REDIRECT_URI,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent', // forces Google to return a refresh_token every time
      scope: [
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/calendar.readonly'
      ].join(' '),
      state: session.access_token
    });

    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }, []);

  return { loading, connected, calendars, error, reload, connect };
}
