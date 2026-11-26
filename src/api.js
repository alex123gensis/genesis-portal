import { auth } from "./portalAuth.js";
// Genesis preview (Inventory 111): ?preview=<token> in the address opens the portal read-only as one account; the token is kept for this tab only.
export const previewToken = () => { try { const q = new URLSearchParams(window.location.search).get("preview"); if (q) { sessionStorage.setItem("genesis_preview", q); window.history.replaceState({}, "", window.location.pathname); } return sessionStorage.getItem("genesis_preview") || ""; } catch { return ""; } };
export const endPreview = () => { try { sessionStorage.removeItem("genesis_preview"); } catch { /* ignore */ } window.location.href = window.location.pathname; };
export async function api(path, { method = "GET", body } = {}) {
  const pv = previewToken();
  let token = null;
  if (!pv && auth) { const { data: { session } } = await auth.auth.getSession(); token = session && session.access_token; }
  const r = await fetch(path, { method, headers: { "content-type": "application/json", ...(pv ? { "x-genesis-preview": pv } : token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || `Request failed (${r.status})`); e.status = r.status; throw e; }
  return j;
}
