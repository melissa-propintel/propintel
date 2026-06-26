"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AddressBar() {
  const [address, setAddress] = useState("");
  const router = useRouter();

  function go(e: React.FormEvent) {
    e.preventDefault();
    const a = address.trim();
    if (!a) return;
    router.push(`/lookup?address=${encodeURIComponent(a)}`);
  }

  return (
    <form onSubmit={go} className="flex w-full max-w-xl flex-col gap-2 sm:flex-row">
      <input
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="Enter a property address…"
        className="flex-1 rounded-lg border border-white/20 bg-white/95 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:bg-white"
      />
      <button
        type="submit"
        className="rounded-lg bg-white px-6 py-3 text-sm font-semibold text-pi-navy shadow hover:bg-blue-50"
      >
        Run a report →
      </button>
    </form>
  );
}
