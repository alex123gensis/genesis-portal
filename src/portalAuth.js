// Sign-in is against the PORTAL Supabase project (auth only, no data). Values come from Vercel env vars at build time.
import { createClient } from "@supabase/supabase-js";
const url = (import.meta.env.VITE_PORTAL_SUPABASE_URL || "").trim();
const key = (import.meta.env.VITE_PORTAL_SUPABASE_ANON_KEY || "").trim();
export const configured = !!(url && key);
export const auth = configured ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null;
