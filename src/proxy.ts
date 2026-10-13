import { NextResponse, type NextFetchEvent, type NextProxy, type NextRequest } from "next/server";
import { auth } from "@/auth";

// Auth.js's own middleware: reads the session, which runs the jwt callback
// (refreshing an expiring Google token), and re-issues the session cookie.
// Typing passThrough as NextMiddleware selects auth()'s middleware overload.
const passThrough: NextProxy = () => NextResponse.next();
const withSession = auth(passThrough);

/**
 * Keeps the Google token in the session cookie fresh on routes that call
 * Google as the user. Authorization stays in the pages and handlers.
 */
export async function proxy(request: NextRequest, event: NextFetchEvent) {
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
