import { build, isQa } from "@/lib/build";
import { env } from "@/lib/env";

// Reads process.env at request time so the Vercel dashboard values show up
// without a rebuild.
export const dynamic = "force-dynamic";

function Status({ ok, label }: { ok: boolean; label: string }) {
  return (
    <dd className={`font-mono ${ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
      {label}
    </dd>
  );
}

export default function Home() {
  const superusers = env.superusers;
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <h1 className="text-2xl font-semibold">Deployment status</h1>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-neutral-500">Build</dt>
        <dd className="font-mono">{build}</dd>
        <dt className="text-neutral-500">QA flag</dt>
        <dd className="font-mono">{isQa ? "enabled" : "disabled"}</dd>
        <dt className="text-neutral-500">Google OAuth client</dt>
        <Status ok={env.hasGoogleOAuth} label={env.hasGoogleOAuth ? "configured" : "missing"} />
        <dt className="text-neutral-500">Auth secret</dt>
        <Status ok={env.hasAuthSecret} label={env.hasAuthSecret ? "configured" : "missing"} />
        <dt className="text-neutral-500">Database</dt>
        <Status ok={env.hasDatabaseUrl} label={env.hasDatabaseUrl ? "configured" : "missing"} />
        <dt className="text-neutral-500">Superusers</dt>
        <dd className="font-mono">{superusers.size} configured</dd>
      </dl>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        {isQa
          ? "This is the QA deployment. It will point at the fake-roster spreadsheet; nothing here touches real student data."
          : "This is the Prod deployment. It will point at the real check-in spreadsheet."}
      </p>
    </div>
  );
}
