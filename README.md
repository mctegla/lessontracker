# Lesson Tracker (Supabase edition)

This app was migrated off Base44. It's a React/Vite frontend backed by
Supabase (Postgres + Auth + Edge Functions), reading and writing lesson
reminder events on the user's Google Calendar.

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com), create a new project.
2. In **Project Settings > API**, copy the **Project URL**, **anon public
   key**, and **service_role key** — you'll need all three below.
3. In **Database > Extensions**, enable `pg_cron` and `pg_net` (needed for
   the scheduled sync job).

## 2. Run the database migration

Open **SQL Editor** in the Supabase dashboard and run the contents of
`supabase/migrations/0001_init.sql`. This creates the `trackers`,
`purchase_logs`, `app_notifications`, `profiles`, and
`google_calendar_tokens` tables, with row-level security so each user only
ever sees their own data.

Leave the `cron.schedule(...)` block at the bottom commented out for now —
you'll come back to it in step 6.

## 3. Set up the Google Cloud OAuth client

Since you already have a Google Cloud project:

1. Go to **APIs & Services > Library**, enable the **Google Calendar API**
   if it isn't already.
2. Go to **APIs & Services > Credentials > Create Credentials > OAuth
   client ID**, type **Web application**.
3. Add an **Authorized redirect URI**:
   `https://YOUR-PROJECT-REF.supabase.co/functions/v1/google-oauth-callback`
4. Save, and copy the **Client ID** and **Client Secret**.
5. Under **OAuth consent screen**, make sure the two Calendar scopes are
   listed (`calendar.events`, `calendar.readonly`). If the app is in
   "Testing" mode, add your own Google account as a test user.

This is separate from any Google sign-in you use for logging into the app
itself — it's specifically what lets the backend read/write your calendar.

## 4. Configure Supabase Auth

In **Authentication → Sign In / Up** (provider settings may be under a
slightly different tab depending on your dashboard version — look for
"Auth Providers" or "Providers"):

- Email: on. Turn **Confirm email** OFF — since this is a personal,
  single-user app, there's no need for email verification, and it avoids
  needing custom SMTP (as of June 2026, new free-tier Supabase projects
  can't customize auth email templates unless custom SMTP is configured,
  which requires a verified domain you don't have). With confirmation off,
  `signUp()` logs the user in immediately.
- Google: on, using the same Client ID/Secret from step 3, or a separate
  OAuth client if you'd rather keep calendar access and app login
  credentials fully separate.

Password-reset emails still go through Supabase's default sender, which
only delivers to your project's **team member** email addresses — since
you're the project owner, your own email is covered, so "Forgot password"
will still work for you without any SMTP setup. If you ever add other
users, you'll need custom SMTP (e.g. Resend's free tier) for both
password resets and to re-enable "Confirm email."

## 5. Deploy the Edge Functions

Install the Supabase CLI (Mac):
```bash
brew install supabase/tap/supabase
supabase login
supabase link --project-ref YOUR-PROJECT-REF
```

Set the secrets the functions need:
```bash
supabase secrets set GOOGLE_CLIENT_ID=your-client-id
supabase secrets set GOOGLE_CLIENT_SECRET=your-client-secret
supabase secrets set APP_URL=https://your-deployed-frontend-url
supabase secrets set GOOGLE_OAUTH_REDIRECT_URI=https://YOUR-PROJECT-REF.supabase.co/functions/v1/google-oauth-callback
```
(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically
inside every Edge Function — you don't need to set those yourself.)

Deploy all five functions plus the OAuth callback:
```bash
supabase functions deploy syncTrackers
supabase functions deploy gcalApi
supabase functions deploy getInsights
supabase functions deploy getCalendarLessons
supabase functions deploy getTrackerLessons
supabase functions deploy google-oauth-callback
```

## 6. Turn on the scheduled sync

Back in the SQL Editor, uncomment and run the `cron.schedule(...)` block at
the bottom of `0001_init.sql`, filling in your project ref and service role
key. This re-syncs every user's calendars every 30 minutes, same as the
original Base44 workflow.

## 7. Configure and run the frontend

```bash
cp .env.example .env.local
```
Fill in `.env.local` with the values from steps 1 and 3.

```bash
npm install
npm run dev
```

## 8. Deploy the frontend

Any static host works (Vercel, Netlify, etc.) — just set the same four
environment variables from `.env.local` in the host's dashboard, and update
`APP_URL` in the Supabase function secrets (step 5) to match the deployed
URL once you have it.

## Notes on what changed from the Base44 version

- **Auth**: email/password + Google sign-in, now via Supabase Auth. Signup
  logs you in immediately (no emailed code/link) since email confirmation
  is turned off — see step 4 for why.
- **Google Calendar connection**: this used to happen invisibly through
  Base44's "connector." Now there's an explicit **Connect Google Calendar**
  button on the Settings page, and refresh tokens are stored in the new
  `google_calendar_tokens` table.
- **Backend logic**: the five backend functions (`syncTrackers`, `gcalApi`,
  `getInsights`, `getCalendarLessons`, `getTrackerLessons`) kept their exact
  matching/counting/streak logic — only the data-access layer changed
  (Base44 entities → Supabase tables).
- **Scheduled sync**: Base44's cron workflow is now a `pg_cron` job calling
  the `syncTrackers` function every 30 minutes.
