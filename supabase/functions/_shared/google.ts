// Shared helper used by every edge function to get a valid Google Calendar
// access token for the requesting user, refreshing it via Google's OAuth
// token endpoint if it has expired. This replaces Base44's
// `base44.asServiceRole.connectors.getConnection('googlecalendar')`.

import { createClient } from 'npm:@supabase/supabase-js@2';

export function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}

// Verifies the caller's JWT (from the Authorization header) and returns the
// authenticated user, or null if the request isn't authenticated.
export async function getUserFromRequest(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  const token = authHeader.replace('Bearer ', '');
  const supabase = serviceClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

// Returns { accessToken } for the given user, refreshing via Google if the
// stored access token is expired or about to expire.
export async function getGoogleAccessToken(userId: string): Promise<{ accessToken: string }> {
  const supabase = serviceClient();
  const { data: row, error } = await supabase
    .from('google_calendar_tokens')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !row) {
    throw new Error('Google Calendar is not connected for this user.');
  }

  const expiresAt = new Date(row.expires_at).getTime();
  const bufferMs = 60_000; // refresh a minute early
  if (Date.now() < expiresAt - bufferMs) {
    return { accessToken: row.access_token };
  }

  // Refresh the token
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: row.refresh_token,
      grant_type: 'refresh_token'
    })
  });

  if (!res.ok) {
    throw new Error('Failed to refresh Google token: ' + (await res.text()));
  }

  const tok = await res.json();
  const newExpiresAt = new Date(Date.now() + tok.expires_in * 1000).toISOString();

  await supabase
    .from('google_calendar_tokens')
    .update({
      access_token: tok.access_token,
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId);

  return { accessToken: tok.access_token };
}

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}
