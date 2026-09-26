import { build, isQa } from "@/lib/build";

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <h1 className="text-2xl font-semibold">Deployment status</h1>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-neutral-500">Build</dt>
        <dd className="font-mono">{build}</dd>
        <dt className="text-neutral-500">QA flag</dt>
        <dd className="font-mono">{isQa ? "enabled" : "disabled"}</dd>
      </dl>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        {isQa
          ? "This is the QA deployment. It will point at the fake-roster spreadsheet; nothing here touches real student data."
          : "This is the Prod deployment. It will point at the real check-in spreadsheet."}
      </p>
    </div>
  );
}
