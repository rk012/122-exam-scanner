/**
 * Which deployment this is. The spec calls for two deployments from one
 * codebase: QA (fake-roster spreadsheet) and Prod (real spreadsheet). The only
 * behavioral difference between them is the QA badge in the UI, but every
 * sheet ID / OAuth client / log store must also key off this value.
 *
 * Source of truth is the APP_ENV environment variable:
 *   - committed `.env` sets APP_ENV=qa, so every local dev/build defaults to QA
 *   - the Prod Vercel project sets APP_ENV=prod in its dashboard, which
 *     overrides the .env file (real env vars always win over .env files)
 *
 * Anything other than exactly "qa" or "prod" throws at startup rather than
 * guessing, so a typo can never quietly run as the wrong deployment.
 */
export type Build = "qa" | "prod";

function readBuild(): Build {
  const raw = process.env.APP_ENV;
  if (raw === "qa" || raw === "prod") return raw;
  throw new Error(
    `APP_ENV must be "qa" or "prod", got ${JSON.stringify(raw)}. ` +
      `Local dev should pick up APP_ENV=qa from the committed .env file.`,
  );
}

export const build: Build = readBuild();
export const isQa = build === "qa";
