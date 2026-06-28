// Client delivery bundles: store generated report PDFs in Supabase + a row with
// a shareable token, so a client can open one link and download all their reports.

import { getSupabase, isStorageConfigured } from "./supabase-browser";

export const REPORTS_BUCKET = "reports";

export interface DeliveryItem {
  address: string;
  path: string; // storage path within the reports bucket
  url: string; // public URL
  light: string | null; // GREEN/YELLOW/RED if known
  valueLow: number | null;
  valueHigh: number | null;
  highlights?: string[]; // the 3-5 line read, shown beside the property on the link
}

export interface Delivery {
  id: string;
  token: string;
  client_name: string | null;
  items: DeliveryItem[];
  created_at: string;
}

export function deliveriesConfigured(): boolean {
  return isStorageConfigured();
}

export function makeToken(): string {
  // URL-safe, hard to guess, no Math.random dependency concerns in the browser.
  const a = new Uint8Array(9);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 14);
}

function safeName(s: string): string {
  return (s || "report").replace(/[^\w.-]+/g, "_").slice(0, 60);
}

/** Upload one report PDF for a delivery; returns its item record. */
export async function uploadReport(
  token: string,
  index: number,
  address: string,
  pdf: Blob,
  meta: { light?: string | null; valueLow?: number | null; valueHigh?: number | null; highlights?: string[] },
): Promise<DeliveryItem> {
  const s = getSupabase();
  if (!s) throw new Error("Storage not configured.");
  const path = `${token}/${String(index + 1).padStart(3, "0")}-${safeName(address)}.pdf`;
  const { error } = await s.storage.from(REPORTS_BUCKET).upload(path, pdf, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) throw new Error(error.message);
  const { data } = s.storage.from(REPORTS_BUCKET).getPublicUrl(path);
  return {
    address,
    path,
    url: data.publicUrl,
    light: meta.light ?? null,
    valueLow: meta.valueLow ?? null,
    valueHigh: meta.valueHigh ?? null,
    highlights: meta.highlights ?? [],
  };
}

export async function createDelivery(token: string, clientName: string | null, items: DeliveryItem[]): Promise<void> {
  const s = getSupabase();
  if (!s) throw new Error("Storage not configured.");
  const { error } = await s.from("deliveries").insert({ token, client_name: clientName, items });
  if (error) throw new Error(error.message);
}

export async function getDelivery(token: string): Promise<Delivery | null> {
  const s = getSupabase();
  if (!s) return null;
  const { data, error } = await s.from("deliveries").select("*").eq("token", token).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Delivery) ?? null;
}
