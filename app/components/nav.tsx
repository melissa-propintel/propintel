"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/login/actions";

// Hidden on the agent capture view (agents shouldn't see the rest of the app)
// and on the clean report view (for printing).
const HIDE_PREFIXES = ["/capture", "/report"];

type Viewer = { email: string | null; role: "admin" | "client" } | null;

export function Nav({ viewer }: { viewer: Viewer }) {
  const pathname = usePathname();
  if (HIDE_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  const isAdmin = viewer?.role === "admin";

  return (
    <header className="no-print border-b border-pi-border bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-2.5">
        <Link href="/" className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/propintel-logo.svg" alt="PropIntel — Property Intelligence" className="h-9 w-auto" />
        </Link>

        <nav className="flex items-center gap-4 text-sm">
          {isAdmin && (
            <>
              <Link href="/orders" className="text-slate-600 hover:text-pi-navy">Orders</Link>
              <Link href="/agents" className="text-slate-600 hover:text-pi-navy">Agents</Link>
              <Link href="/lookup" className="text-slate-600 hover:text-pi-navy">New report</Link>
              <Link href="/bulk" className="text-slate-600 hover:text-pi-navy">Portfolio</Link>
              <Link href="/audit" className="text-slate-600 hover:text-pi-navy">Audit a BPO</Link>
              <Link href="/capture" className="text-slate-600 hover:text-pi-navy">Field photos</Link>
            </>
          )}
          {viewer && !isAdmin && (
            <Link href="/portal" className="text-slate-600 hover:text-pi-navy">My portal</Link>
          )}
          {viewer ? (
            <form action={logout}>
              <button className="text-slate-600 hover:text-pi-navy">Sign out</button>
            </form>
          ) : (
            <>
              <Link href="/login" className="text-slate-600 hover:text-pi-navy">Sign in</Link>
              <Link
                href="/login?mode=signup"
                className="rounded-lg bg-pi-green-deep px-3 py-1.5 font-medium text-white hover:bg-pi-navy-soft transition"
              >
                Order a report
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
