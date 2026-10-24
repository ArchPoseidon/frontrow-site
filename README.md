# FrontRow

Be the first to know about a show. FrontRow watches the Indian concert and festival calendar and alerts you on Telegram and email when an artist you follow announces a show in India.

## Run locally

1. Install Node 20+.
2. Copy `.env.example` to `.env.local` and fill in the values (never commit this file).
3. `npm install`
4. `npm run db:migrate` to create the tables in Neon.
5. `npm run dev`, then open http://localhost:3000.

## Google sign-in setup (one time)

1. Open https://console.cloud.google.com and create a project named FrontRow.
2. Go to APIs & Services > OAuth consent screen. Choose External, fill in the app name and your email, and save.
3. Under Audience, click **Publish app** so anyone can sign in (not only listed test users).
4. Go to Credentials > Create credentials > OAuth client ID > Web application.
5. Add these Authorized redirect URIs:
   - `https://<your-production-domain>/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/google`
6. Copy the Client ID and Client secret into `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` (locally and in Vercel).
7. Set `OWNER_EMAIL` to the Google email you will sign in with.

## Health check

`GET /api/health` returns JSON with database status and real counts.

## Adding a judge (Testing mode)

Google Cloud Console > APIs & Services > OAuth consent screen > Audience > Test users > Add users. Enter their exact Google email and save. It takes effect within a few minutes.

## Scheduling (cron-job.org), one time

Vercel's free plan only runs daily jobs, so cron-job.org calls the job routes. Only the 8:30 heartbeat uses Vercel's own cron.

**Automatic (recommended):**
1. Sign up free at https://cron-job.org and log in.
2. Click your name (top right) > **Settings** > **API** > **Create API key**. Copy it.
3. Put it in `.env.local` as `CRONJOB_API_KEY=...`, then run `npx tsx scripts/setup-cron.ts`. It creates the six schedules below and is safe to run again.

**By hand:** for each row, click **Create cronjob**, paste the URL, open **Advanced**, set the request method to **POST**, add the header `Authorization` = `Bearer <your CRON_SECRET>`, choose the timezone Asia/Kolkata, and set the schedule.

| Job | URL | When |
| --- | --- | --- |
| news | `<APP_URL>/api/jobs/news` | every 15 min |
| process | `<APP_URL>/api/jobs/process` | every 5 min |
| dispatch | `<APP_URL>/api/jobs/dispatch` | every 5 min |
| links | `<APP_URL>/api/jobs/links` | every 10 min |
| listings | `<APP_URL>/api/jobs/listings` | every 30 min (each page is scraped every 6 h) |
| sweep | `<APP_URL>/api/jobs/sweep` | every 30 min, 06:00 to 10:00 |

The System pulse on the radar turns each dot green once its job has run. The heartbeat message arrives on Telegram daily at 8:30.

## Google sign-in with Calendar permission (one time)

Sign-in now asks for identity (`openid email profile`) and permission to add events to the user's Google Calendar (`calendar.events`) on the same Google screen. "Add to calendar" always works inside FrontRow; with the permission it also writes to Google Calendar.

1. Open https://console.cloud.google.com and pick the FrontRow project (top bar, project picker).
2. **Enable the API:** left menu **APIs & Services > Library**, search **Google Calendar API**, click it, click **Enable**.
3. **Add the permission to the consent screen:** left menu **APIs & Services > OAuth consent screen** (it may be called **Google Auth Platform** now). Open **Data Access** (or **Scopes**), click **Add or remove scopes**, scroll to **Manual scope entry**, paste `https://www.googleapis.com/auth/calendar.events`, click **Add to table**, tick it, click **Update**, then **Save**.
4. **Keep it in Testing and list your judges:** open **Audience** (or **Test users**). The app stays in **Testing**. Click **Add users** and enter each judge's exact Google email (up to 100). Only listed emails can sign in. A new email takes a few minutes to start working.
5. **What judges will see:** because the calendar permission is a "sensitive" scope and the app is unverified, Google first shows "Google hasn't verified this app". They click **Continue** (on some screens **Advanced > Go to FrontRow (unsafe)**), then see two checkboxes: sign in and **See, create and change events**. They can untick the calendar box and still sign in; the Connections tab then shows Google Calendar as not connected, with a Connect button.
6. **Redirect URIs** are unchanged: `https://frontrow-pi-three.vercel.app/api/auth/callback/google` and `http://localhost:3000/api/auth/callback/google`.

Publishing the app to everyone later needs Google's verification review for the calendar scope (a form, a demo video and a privacy page, usually days to weeks). That is why the app stays in Testing for the judging.

## Backup crawler

Firecrawl is the main crawler (free credits, daily cap). When it is out of credits, rate-limited or failing, the app falls back to Scrape.do (`CRAWLER_API_KEY`, 1,000 free credits a month, capped at 900), then to Jina Reader. Usage shows in the daily heartbeat message.

## Letting judges connect Spotify

A Spotify app in development mode only lets people on its user list connect (up to 25). Anyone else sees "Spotify import is invite-only during beta" and can still search or paste artists.
1. Open https://developer.spotify.com/dashboard and click the FrontRow app.
2. Click **Settings**, then the **User Management** tab.
3. Click **Add new user**, enter the person's **name** and the **email address their Spotify account uses** (it must match exactly), and click **Add user**. It works within a minute.
4. The owner of the Spotify app must have Spotify Premium for development mode to stay active.
Refused connections show in the 8:30 heartbeat message with the email that was refused.

---
