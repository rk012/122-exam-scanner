# 122 Check-in Scanner

Mobile web app for 15-122 exam proctors: scan a packet's QR, sanity-check the
row on the check-in Google Sheet, and tick exactly one checkbox as the TA's own
Google account. Full spec lives in the wiki under
`projects/122-exam-checkin-scanner`.

**Status:** skeleton. Today the app has Google sign-in restricted to Andrew
accounts, a proctor allowlist that gates access, and a superadmin page for
managing it.

## Stack

- Next.js (App Router, TypeScript, Tailwind), managed with pnpm
- Deployed to Vercel as **two projects from one repo** (see below)

## Local dev

```sh
pnpm install
pnpm dev        # http://localhost:3000, runs as QA
pnpm test       # vitest
```

The committed `.env` sets `APP_ENV=qa`, so local dev and local builds are
always the QA build. To preview the Prod UI locally:

```sh
APP_ENV=prod pnpm dev
```

## Configuration

Only a handful of values are environment-specific, and they are the only
values that live in Vercel env vars (see `.env.example` for the full list with
comments). `src/lib/env.ts` is the single place that reads them.

| Variable                     | Purpose |
|------------------------------|---------|
| `APP_ENV`                    | `qa` or `prod`; drives the QA badge and nothing else in code |
| `GOOGLE_OAUTH_CLIENT_ID`     | OAuth client for sign-in and the Sheets write as the TA |
| `GOOGLE_OAUTH_CLIENT_SECRET` | The matching client secret; server-only, never `NEXT_PUBLIC_` |
| `AUTH_SECRET`                | Signs session cookies; `openssl rand -base64 32` |
| `SUPERUSERS`                 | Comma-separated Andrew IDs allowed to edit the setup screen |
| `DATABASE_URL`               | Pooled Neon connection string for this deployment's own database |

Everything else is **configured in-app** by a superuser and stored in the app's
backend: the active spreadsheet ID, rooms and timeslots, and the proctor
allowlist. The QA deployment is not special-cased in code; a superuser just
points it at the QA spreadsheet from the setup screen. Never add a second
environment switch for these.

Secrets are read **lazily**: a missing value does not break `next build`, it
fails the first request that needs it with an error naming the variable. The
home page lists which secrets are present (never their values), so after
setting them in Vercel you can confirm the deployment picked them up.

### Setting secrets in Vercel

Dashboard: Project → Settings → Environment Variables. Scope each value to the
environment it belongs to (Production for the Prod values, Preview for QA) and
tick **Sensitive** for `GOOGLE_OAUTH_CLIENT_SECRET` and `AUTH_SECRET` so they
cannot be read back out of the dashboard.

CLI equivalent:

```sh
pnpm dlx vercel env add GOOGLE_OAUTH_CLIENT_ID production
pnpm dlx vercel env add GOOGLE_OAUTH_CLIENT_SECRET production --sensitive
pnpm dlx vercel env add AUTH_SECRET production --sensitive
pnpm dlx vercel env add SUPERUSERS production
```

For local development put the same keys in `.env.local` (gitignored).

## Sign-in (Google OAuth)

Sign-in uses [Auth.js](https://authjs.dev) with the Google provider. `src/auth.ts`
is the whole configuration. Only verified `@andrew.cmu.edu` accounts inside the
CMU Google Workspace (Google's `hd` claim) are allowed in; anyone else is
bounced back to the sign-in page with an explanation.

- The signed-in identity is the **Andrew ID** (email local part).
- **Role** is `superadmin` when the Andrew ID is in `SUPERUSERS`, else `user`.
  It is computed on every request, so editing `SUPERUSERS` needs no re-login.
- Scopes: `openid email profile` plus the Sheets scope
  (`https://www.googleapis.com/auth/spreadsheets`), with `access_type=offline`
  and `prompt=consent` so Google issues a refresh token.

### How auth works

The whole session is one cookie: a JWT **encrypted** (not just signed) with a
key derived from `AUTH_SECRET`. There is no session or user table, and the
browser can't read the cookie's contents.

1. **Sign-in.** Google redirects back to `/api/auth/callback/google`. The
   `jwt` callback in `src/auth.ts` stores the Andrew ID and Google's access
   token, refresh token, expiry and granted scopes in the cookie. This is the
   only call where `account` is set.
2. **Every request to `/admin` or `/api/scan`** passes through
   `src/proxy.ts`. It runs Auth.js's middleware, which decrypts the cookie and
   runs the `jwt` callback. If the access token expires within 60s, the
   callback refreshes it (`src/lib/google/refresh.ts`). Auth.js then
   re-encrypts the cookie. The proxy sends that cookie to the browser and also
   to the page or handler serving the same request. A proxy is needed because
   pages can't set cookies; without it a refreshed token would be thrown away
   and refreshed again on every request.
3. **Identity.** Pages and handlers call `auth()` for `andrewId` and `role`.
   The `session` callback never includes Google tokens, because Auth.js also
   returns that object to the browser at `/api/auth/session`.
4. **Google access.** Server code that calls Sheets as the user uses
   `getGoogleAccess()` (`src/lib/google/access.ts`, server-only). It decrypts
   the cookie itself and returns the access token, `missing` (Sheets scope not
   granted) or `expired` (refresh failed; sign in again).

Sessions last Auth.js's default 30 days from the last request through the
proxy. Proctor status is checked against the database on every request, so
removing someone from the list cuts off their session immediately.

### One-time GCP setup (per deployment)

1. In the GCP project, **APIs & Services → OAuth consent screen**. Choose user
   type **Internal** if the project lives in the CMU Workspace org (no test-user
   cap, only andrew accounts). Otherwise External + Testing, which caps test
   users at 100.
2. **Credentials → Create credentials → OAuth client ID → Web application.**
   Authorized redirect URI: `https://<deployment host>/api/auth/callback/google`.
   For local dev also add `http://localhost:3000/api/auth/callback/google`.
3. Put the client ID and secret in that deployment's env vars (see
   Configuration above). Use a different client for QA and Prod.

### Local notes

`pnpm dev` trusts `localhost` automatically. If you test a production build
locally with `pnpm start`, also set `AUTH_TRUST_HOST=true`; on Vercel this is
implied by the `VERCEL` env var and nothing extra is needed.

## Database (Neon Postgres + Drizzle)

The app's own backend holds only non-student data: today the **proctor
allowlist**, later the scan log and active-sheet config. Schema lives in
`src/db/schema.ts`; SQL migrations in `src/db/migrations/` are generated by
Drizzle and committed.

- **Runtime:** Neon over HTTP via `@neondatabase/serverless`. `getDb()` in
  `src/db/index.ts` connects lazily from `DATABASE_URL`, so builds and pages
  that don't touch the database work without one.
- **Tests:** the same repository code runs against an in-process PGlite
  database with the real migrations applied. No network, no fixtures to keep
  in sync.
- **One Neon project per deployment.** Create two projects at neon.com (QA and
  Prod) and paste each pooled connection string as that deployment's
  `DATABASE_URL`. Don't use the Vercel integration's preview branching: it
  copies Prod's data into every preview, which would hand QA the real sheet
  config.

```sh
pnpm db:generate     # after editing schema.ts: writes a new migration
DATABASE_URL=... pnpm db:migrate   # applies pending migrations to that database
```

Run `db:migrate` once against each Neon project before the first deploy that
needs the new table, and again whenever a migration is added.

### Admin page

`/admin` (superadmins only) holds every admin setting:

- **Active sheet:** the spreadsheet and tab the scanner uses. It shows the
  spreadsheet's name and the tab, both linking to Google Sheets, plus the
  rooms read live from the tab's layout. Saving first checks reachability and
  the TEMPLATE layout using the superadmin's own Google access. `TEMPLATE`
  itself is refused as the tab name. The tab can be left blank (saved as
  `null`) or cleared later, and **Clear spreadsheet** deletes the config row;
  scanning is disabled until both a spreadsheet and a tab are set.
- **Users:** superadmins (read-only, from `SUPERUSERS`) and the proctor list,
  where you add or remove Andrew IDs. The two are independent: a superadmin
  who also scans adds themselves to the proctor list. A signed-in account not
  on the list sees "Not authorized" on the home page.

## QA vs Prod

`src/lib/build.ts` reads `APP_ENV` and exports `build` (`"qa" | "prod"`) and
`isQa`. Any other value throws at startup. Every environment-specific thing
(sheet ID, OAuth client, scan-log store) must key off this one value; the UI
difference is the `QA` badge in the header.

| Deployment | Vercel project      | Branch | `APP_ENV` |
|------------|---------------------|--------|-----------|
| QA         | `exam-scanner-qa`   | `main` | `qa` (default from `.env`) |
| Prod       | `exam-scanner`      | `main` | `prod` (set in Vercel dashboard) |

Both projects deploy from `main`. Every push to `main` redeploys QA and Prod
together; the only difference between them is the `APP_ENV` variable set on
the Prod project. If you ever need Prod to lag behind QA, the escape hatch is
to disable auto-deploy on the Prod project and promote a deployment by hand in
the Vercel dashboard.

Two separate Vercel projects (rather than one project with preview branches)
so that each has its own stable URL, its own env vars and secrets, and no
Vercel preview-auth wall in front of proctors' phones.

### One-time Vercel setup

1. Push this repo to GitHub.
2. In Vercel, **Add New Project** → import the repo → name it `exam-scanner-qa`.
   Do not set `APP_ENV`. Deploy.
3. **Add New Project** again from the same repo → name it `exam-scanner`.
   Settings → Environment Variables → `APP_ENV` = `prod` (Production only). Deploy.
4. Confirm the QA URL shows the `QA` badge and the Prod URL does not.

Equivalent CLI, if you prefer it (`pnpm dlx vercel login` first):

```sh
pnpm dlx vercel link --project exam-scanner-qa
pnpm dlx vercel git connect
pnpm dlx vercel link --project exam-scanner        # relink to the prod project
pnpm dlx vercel env add APP_ENV production          # enter: prod
```
