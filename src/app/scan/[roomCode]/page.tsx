import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { env } from "@/lib/env";
import { isProctor } from "@/lib/users/proctors";
import { Scanner } from "./Scanner";

export const dynamic = "force-dynamic";

export default async function ScanPage({ params }: PageProps<"/scan/[roomCode]">) {
  const session = await auth();
  // The home page explains why someone can't scan, so send them there.
  if (!session?.user || !env.hasDatabaseUrl || !(await isProctor(getDb(), session.user.andrewId))) {
    redirect("/");
  }
  const { roomCode } = await params;
  return (
    <div className="mx-auto w-full max-w-md">
      <Scanner roomCode={roomCode} />
    </div>
  );
}
