"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listAgents, createAgent, updateAgent, agentsConfigured, type Agent } from "@/lib/agents";

export default function AgentsPage() {
  const configured = agentsConfigured();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [states, setStates] = useState("");
  const [saving, setSaving] = useState(false);

  async function refresh() {
    if (!configured) {
      setLoading(false);
      return;
    }
    try {
      setAgents(await listAgents());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load agents.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createAgent({
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        coverage_states: states.trim().toUpperCase() || null,
        notes: null,
      });
      setName("");
      setEmail("");
      setPhone("");
      setStates("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the agent.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(a: Agent) {
    setAgents((prev) => prev.map((x) => (x.id === a.id ? { ...x, active: !x.active } : x)));
    try {
      await updateAgent(a.id, { active: !a.active });
    } catch {
      void refresh();
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-xs font-semibold uppercase tracking-wide text-pi-accent">← Home</Link>
        <Link href="/orders" className="text-xs font-semibold uppercase tracking-wide text-pi-accent">Orders →</Link>
      </div>

      <h1 className="text-2xl font-black text-pi-navy">Agents</h1>
      <p className="mt-1 text-sm text-slate-600">
        Your field roster. Add an agent once with the states they cover; on an order, the right agents float
        to the top by the property&apos;s state, and assigning one emails them automatically.
      </p>

      {!configured && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Agents need Supabase connected and the <code className="mx-1">agents</code> table. Run the SQL and this page goes live.
        </div>
      )}

      {configured && (
        <form onSubmit={submit} className="mt-5 rounded-lg border border-pi-border bg-white p-4">
          <p className="text-sm font-semibold text-pi-navy">Add an agent</p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. George Smith)" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <input value={states} onChange={(e) => setStates(e.target.value)} placeholder="Coverage states (e.g. TX, AL)" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <button type="submit" disabled={saving} className="mt-3 rounded-md bg-pi-navy px-5 py-2 text-sm font-semibold text-white hover:bg-pi-navy-soft disabled:opacity-60">
            {saving ? "Adding…" : "Add agent"}
          </button>
        </form>
      )}

      {error && <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {configured && (
        <div className="mt-5">
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : agents.length === 0 ? (
            <p className="text-sm text-slate-500">No agents yet. Add one above.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {agents.map((a) => (
                <div key={a.id} className={`flex items-center justify-between rounded-lg border border-pi-border bg-white p-3 ${a.active ? "" : "opacity-50"}`}>
                  <div>
                    <p className="text-sm font-semibold text-pi-navy">{a.name}</p>
                    <p className="text-xs text-slate-500">
                      {a.email || "no email"}{a.phone ? ` · ${a.phone}` : ""}
                      {a.coverage_states ? ` · covers ${a.coverage_states}` : ""}
                    </p>
                  </div>
                  <button onClick={() => toggleActive(a)} className="text-xs text-pi-accent hover:underline">
                    {a.active ? "Deactivate" : "Reactivate"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
