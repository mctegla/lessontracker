// Handles the redirect back from Google's OAuth consent screen.
// Flow: frontend sends the logged-in user to Google's consent screen with
// `state` = that user's current Supabase access token. Google redirects back
// here with `code` + `state`. We verify the user from `state`, exchange the
// code for tokens, and store them in google_calendar_tokens.

import { serviceClient } from '../_shared/google.ts';

const APP_URL = Deno.env.get('APP_URL')!; // e.g. https://your-app.vercel.app
const FUNCTION_URL = Deno.env.get('GOOGLE_OAUTH_REDIRECT_URI')!; // this function's own URL, must match Google Cloud Console

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  if (errorParam) {
    return Response.redirect(`${APP_URL}/settings?gcal_error=${encodeURIComponent(errorParam)}`, 302);
  }
  if (!code || !state) {
    return Response.redirect(`${APP_URL}/settings?gcal_error=missing_code`, 302);
  }

  try {
    const supabase = serviceClient();
    const { data: userData, error: userError } = await supabase.auth.getUser(state);
    if (userError || !userData?.user) {
      return Response.redirect(`${APP_URL}/settings?gcal_error=invalid_session`, 302);
    }
    const user = userData.user;

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: FUNCTION_URL,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenRes.ok) {
      const details = await tokenRes.text();
      console.error('Token exchange failed:', details);
      return Response.redirect(`${APP_URL}/settings?gcal_error=token_exchange_failed`, 302);
    }

    const tok = await tokenRes.json();
    if (!tok.refresh_token) {
      // Google only returns a refresh_token the first time a user consents,
      // unless prompt=consent is forced (which the frontend does). If this
      // still happens, the user needs to revoke access in their Google
      // account and reconnect.
      return Response.redirect(`${APP_URL}/settings?gcal_error=no_refresh_token`, 302);
    }

    const expiresAt = new Date(Date.now() + tok.expires_in * 1000).toISOString();

    await supabase.from('google_calendar_tokens').upsert({
      user_id: user.id,
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      expires_at: expiresAt,
      scope: tok.scope,
      updated_at: new Date().toISOString()
    });

    return Response.redirect(`${APP_URL}/settings?gcal_connected=1`, 302);
  } catch (e) {
    console.error(e);
    return Response.redirect(`${APP_URL}/settings?gcal_error=unknown`, 302);
  }
});
