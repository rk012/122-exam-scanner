# 122 Check-in Scanner

Mobile web app for 15-122 exam proctors: scan a packet's QR, sanity-check the
row on the check-in Google Sheet, and tick exactly one checkbox as the TA's own
Google account. Full spec lives in the wiki under
`projects/122-exam-checkin-scanner`.

**Status:** skeleton. The only thing the app does today is render which
deployment it is (QA or Prod).

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
