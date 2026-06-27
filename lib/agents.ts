// Agents roster — reusable field agents with coverage areas, so orders can pick
// an agent (filtered by the property's state) instead of re-keying every time.

import { getSupabase, isStorageConfigured } from "./supabase-browser";

export interface Agent {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  coverage_states: string | null; // comma-separated, e.g. "TX,AL"
  notes: string | null;
  active: boolean;
  created_at: string;
}

export interface NewAgent {
  name: string;
  email: string | null;
  phone: string | null;
  coverage_states: string | null;
  notes: string | null;
}

export function agentsConfigured(): boolean {
  return isStorageConfigured();
}

/** Normalize a coverage string to an array of uppercase 2-letter codes. */
export function coverageList(s: string | null): string[] {
  if (!s) return [];
  return s
    .split(/[,\s]+/)
    .map((x) => x.trim().toUpperCase())
    .filter((x) => /^[A-Z]{2}$/.test(x));
}

/** Pull a 2-letter state code out of a free-text US address, if present. */
export function stateFromAddress(addr: string): string | null {
  const m = addr.toUpperCase().match(/\b([A-Z]{2})\b(?:[ ,]+\d{5}(?:-\d{4})?)?\s*$/);
  return m ? m[1] : null;
}

export async function listAgents(): Promise<Agent[]> {
  const s = getSupabase();
  if (!s) return [];
  const { data, error } = await s.from("agents").select("*").order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Agent[];
}

export async function createAgent(a: NewAgent): Promise<Agent> {
  const s = getSupabase();
  if (!s) throw new Error("Storage not configured.");
  const { data, error } = await s.from("agents").insert(a).select().single();
  if (error) throw new Error(error.message);
  return data as Agent;
}

export async function updateAgent(id: string, patch: Partial<Agent>): Promise<void> {
  const s = getSupabase();
  if (!s) throw new Error("Storage not configured.");
  const { error } = await s.from("agents").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Agents sorted so those covering `state` come first. */
export function rankByCoverage(agents: Agent[], state: string | null): Agent[] {
  if (!state) return agents;
  const st = state.toUpperCase();
  return [...agents].sort((a, b) => {
    const ac = coverageList(a.coverage_states).includes(st) ? 0 : 1;
    const bc = coverageList(b.coverage_states).includes(st) ? 0 : 1;
    return ac - bc || a.name.localeCompare(b.name);
  });
}
