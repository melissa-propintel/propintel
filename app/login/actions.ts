"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}${next ? `&next=${encodeURIComponent(next)}` : ""}`);
  }
  // Use the user from the sign-in result directly (a second getUser() can race the
  // freshly-set cookie and come back empty, bouncing back to /login).
  let role = "client";
  const uid = data.user?.id;
  if (uid) {
    const { data: p } = await supabase.from("profiles").select("role").eq("id", uid).maybeSingle();
    role = (p?.role as string) ?? "client";
  }
  const dest = role === "admin" ? (next && next.startsWith("/") ? next : "/orders") : "/portal";
  redirect(dest);
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
