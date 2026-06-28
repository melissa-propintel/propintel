"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function destFor(supabase: Awaited<ReturnType<typeof createClient>>, next: string): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "/login";
  const { data: p } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = (p?.role as string) ?? "client";
  if (role === "admin") return next && next.startsWith("/") ? next : "/orders";
  return "/portal";
}

export async function login(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}${next ? `&next=${encodeURIComponent(next)}` : ""}`);
  }
  redirect(await destFor(supabase, next));
}

export async function signup(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const company = String(formData.get("company") ?? "").trim();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { company } },
  });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}&mode=signup`);
  }
  // Email-confirmation on → no session yet; tell them to check their inbox.
  if (!data.session) {
    redirect(`/login?check=1`);
  }
  redirect("/portal");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
