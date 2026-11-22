// Sign-in is against the PORTAL Supabase project (auth only, no data). Values come from Vercel env vars at build time.
import { createClient } from "@supabase/supabase-js";
const url = (import.meta.env.VITE_PORTAL_SUPABASE_URL || "").trim().replace(/\/(rest|auth)\/v1\/?$/i, "").replace(/\/+$/, "");
const key = (import.meta.env.VITE_PORTAL_SUPABASE_ANON_KEY || "").trim();
export let configProblem = null;
if (!url || !key) configProblem = "VITE_PORTAL_SUPABASE_URL and VITE_PORTAL_SUPABASE_ANON_KEY must be set in Vercel, then redeploy.";
else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) configProblem = `VITE_PORTAL_SUPABASE_URL does not look like a Supabase project URL: "${url}". Expected https://<ref>.supabase.co`;
export const configured = !configProblem;
let client = null;
if (configured) { try { client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }); } catch (e) { configProblem = e.message || String(e); } }
export const auth = client;
