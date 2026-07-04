// Server-side Supabase client for trusted routes (Stripe checkout/invoice/webhook)
// that have no user session. Uses the SERVICE ROLE key when set (bypasses RLS);
// falls back to anon (which scoped RLS will block — set the key before going live).
import { createClient } from "@supabase/supabase-js";

export function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
