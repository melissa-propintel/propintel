// Session refresh + route protection.
//
// Gate model:
//  - PUBLIC (no login): home, login/signup, sample, delivery links (/d), the
//    field-capture token tool, the clean /report view, and APIs.
//  - ADMIN ONLY: the internal tools (/lookup, /orders, /bulk, /audit, /agents).
//  - AUTHENTICATED (admin or client): /portal.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Exact public paths.
const PUBLIC = new Set(["/", "/login", "/signup", "/sample"]);
// Public path prefixes (token pages, static, APIs, clean views).
const PUBLIC_PREFIX = ["/d/", "/capture", "/report", "/api/", "/_next/", "/auth/", "/favicon"];
// Internal tools — admin only.
const ADMIN_PREFIX = ["/lookup", "/orders", "/bulk", "/audit", "/agents", "/extract"];

function isPublic(path: string): boolean {
  if (PUBLIC.has(path)) return true;
  return PUBLIC_PREFIX.some((p) => path.startsWith(p));
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Auth not configured (e.g. local dev / missing env) → don't gate, don't crash.
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supaAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supaUrl || !supaAnon) return response;

  const supabase = createServerClient(
    supaUrl,
    supaAnon,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  if (isPublic(path)) return response;

  // Not signed in → send to login (remember where they were going).
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // Signed in: enforce admin-only tools.
  const needsAdmin = ADMIN_PREFIX.some((p) => path.startsWith(p));
  if (needsAdmin) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if ((profile?.role ?? "client") !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/portal";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
