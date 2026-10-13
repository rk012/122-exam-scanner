import { NextResponse, type NextFetchEvent, type NextProxy, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { googleTokensFromCookie } from "@/lib/google/access";
import { isExpired } from "@/lib/google/refresh";

// Auth.js's own middleware: reads the session, which runs the jwt callback
// (refreshing an expiring Google token), and re-issues the session cookie.
// Typing passThrough as NextProxy selects auth()'s middleware overload.
const passThrough: NextProxy = () => NextResponse.next();
const withSession = auth(passThrough);

/**
 * Refreshes an expiring Google token in the session cookie on routes that
 * call Google as the user. Authorization stays in the pages and handlers.
 */
export async function proxy(request: NextRequest, event: NextFetchEvent) {
  // Leave the cookie alone unless the token needs refreshing. Next.js counts a
  // cookie set here as the request changing cookies, which makes every server
  // action refetch the whole page.
  const tokens = await googleTokensFromCookie(request.headers);
  if (!tokens || !isExpired(tokens, Math.floor(Date.now() / 1000))) return NextResponse.next();

  // triggers auth/jwt callback which refreshes token
  const authResponse = await withSession(request, event);
  const setCookies = new NextResponse(null, { headers: authResponse?.headers }).cookies.getAll();

  // Hand the re-issued cookie to the page or handler serving this request too,
  // or it would still see the expired token and refresh a second time.
  for (const { name, value, maxAge } of setCookies) {
    if (maxAge === 0 || value === "") request.cookies.delete(name);
    else request.cookies.set(name, value);
  }
  const response = NextResponse.next({ request: { headers: request.headers } });
  for (const cookie of setCookies) response.cookies.set(cookie);
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/api/scan/:path*"],
};
