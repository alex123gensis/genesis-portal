import { auth } from "./portalAuth.js";
export async function api(path, { method = "GET", body } = {}) {
  const { data: { session } } = await auth.auth.getSession();
  const token = session && session.access_token;
  const r = await fetch(path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || `Request failed (${r.status})`); e.status = r.status; throw e; }
  return j;
}
