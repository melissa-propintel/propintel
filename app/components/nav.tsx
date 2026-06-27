"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Hidden on the agent capture view (agents shouldn't see the rest of the app)
// and on the clean report view (for printing).
const HIDE_PREFIXES = ["/capture", "/report"];

export function Nav() {
  const pathname = usePathname();
  if (HIDE_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  return (
    <header className="no-print border-b border-pi-border bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-2.5">
        <Link href="/" className="text-sm font-black tracking-tight text-pi-navy">
          PropIntel
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/orders" className="text-slate-600 hover:text-pi-navy">
            Orders
          </Link>
          <Link href="/agents" className="text-slate-600 hover:text-pi-navy">
            Agents
          </Link>
          <Link href="/lookup" className="text-slate-600 hover:text-pi-navy">
            New report
          </Link>
          <Link href="/bulk" className="text-slate-600 hover:text-pi-navy">
            Portfolio
          </Link>
          <Link href="/audit" className="text-slate-600 hover:text-pi-navy">
            Audit a BPO
          </Link>
          <Link href="/capture" className="text-slate-600 hover:text-pi-navy">
            Field photos
          </Link>
        </nav>
      </div>
    </header>
  );
}
