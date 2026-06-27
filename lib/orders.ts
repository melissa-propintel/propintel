// Orders — the spine that ties client + property + agent + report together.
// Persisted in Supabase (table `orders`). Browser-side CRUD via the anon client.

import { getSupabase, isStorageConfigured } from "./supabase-browser";

export type OrderStatus = "new" | "assigned" | "in_progress" | "ready" | "delivered";
// "field" is the legacy umbrella value (treated as full); new orders use the split.
export type ProductType = "desktop" | "field" | "field_lite" | "field_full";

export const STATUS_FLOW: OrderStatus[] = ["new", "assigned", "in_progress", "ready", "delivered"];

/** Any field-photo product (lite, full, or legacy "field"). */
export function isFieldProduct(p: string): boolean {
  return p.startsWith("field");
}

/** Which photo set the agent should capture. Legacy "field" = full. */
export function photoLevel(p: string): "lite" | "full" {
  return p === "field_lite" ? "lite" : "full";
}

export const PRODUCT_LABEL: Record<string, string> = {
  desktop: "Desktop value-check (no site visit)",
  field_lite: "Field — Lite (drive-by: front + neighbors)",
  field_full: "Field — Full inspection (all sides, mechanicals, interior)",
  field: "Field report",
};

export interface Order {
  id: string;
  order_number: string;
  client_name: string | null;
  property_address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  product_type: ProductType;
  status: OrderStatus;
  assigned_agent: string | null;
  loan_amount: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewOrder {
  order_number: string;
  client_name: string | null;
  property_address: string;
  product_type: ProductType;
  loan_amount: number | null;
  notes: string | null;
}

export function ordersConfigured(): boolean {
  return isStorageConfigured();
}

/** PI-YYYY-##### using a timestamp tail to avoid collisions without a sequence. */
export function generateOrderNumber(): string {
  const yr = new Date().getFullYear();
  const tail = Date.now().toString().slice(-5);
  return `PI-${yr}-${tail}`;
}

/** Fetch a single order by its order_number (used by the agent capture link). */
export async function getOrderByNumber(orderNumber: string): Promise<Order | null> {
  const s = getSupabase();
  if (!s || !orderNumber) return null;
  const { data, error } = await s.from("orders").select("*").eq("order_number", orderNumber).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Order) ?? null;
}

export async function listOrders(): Promise<Order[]> {
  const s = getSupabase();
  if (!s) return [];
  const { data, error } = await s.from("orders").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Order[];
}

export async function createOrder(o: NewOrder): Promise<Order> {
  const s = getSupabase();
  if (!s) throw new Error("Storage not configured.");
  const { data, error } = await s.from("orders").insert(o).select().single();
  if (error) throw new Error(error.message);
  return data as Order;
}

export async function updateOrder(id: string, patch: Partial<Order>): Promise<void> {
  const s = getSupabase();
  if (!s) throw new Error("Storage not configured.");
  const { error } = await s
    .from("orders")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
