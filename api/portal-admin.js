// Customer portal administration (Inventory 099). Managers create / reset / remove portal logins from CRM > Customer portal.
// Portal logins live in a SEPARATE Supabase project (auth only) so customers never hold a session on the main project.
//
// Env (Vercel): SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (main project)
//               PORTAL_SUPABASE_URL, PORTAL_SUPABASE_SERVICE_ROLE_KEY (portal project)
//               PORTAL_URL (optional, shown to the manager, e.g. https://portal.genesistanks.com)
// Body: { action: "create" | "reset" | "remove" | "preview", email?, name?, accountId? }  Authorization: Bearer <manager session JWT>

const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim() || "https://tciwjnbnskphpzyoczfb.supabase.co";
const ANON_KEY = (process.env.SUPABASE_ANON_KEY || "").trim() || "sb_publishable_RLFR972iq1-Z5Fz-qK62Qg_JWa8iflh";
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const PORTAL_URL_API = (process.env.PORTAL_SUPABASE_URL || "").trim().replace(/\/(rest|auth)\/v1\/?$/i, "").replace(/\/+$/, "");
const PORTAL_SERVICE_KEY = (process.env.PORTAL_SUPABASE_SERVICE_ROLE_KEY || "").trim();
const PORTAL_URL = (process.env.PORTAL_URL || "").trim();

async function j(url, init) {
  const r = await fetch(url, init);
  const text = await r.text();
  let body = null; try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  return { ok: r.ok, status: r.status, body };
}

async function managerFromToken(token) {
  if (!token) return null;
  const u = await j(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, authorization: `Bearer ${token}` } });
  if (!u.ok || !u.body || !u.body.id) return null;
  const can = await j(`${SUPABASE_URL}/rest/v1/rpc/can_access`, {
    method: "POST", headers: { apikey: ANON_KEY, authorization: `Bearer ${token}`, "content-type": "application/json", "content-profile": "crm" }, body: "{}",
  });
  return can.ok && can.body === true ? u.body : null;
}

const svc = (key) => ({ apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" });

function makePassword() {
  // 12 chars, readable (no 0/O/1/l), two digits, one symbol
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ", digits = "23456789", sym = "!#$%&*+?";
  const pick = (s) => s[Math.floor(Math.random() * s.length)];
  const arr = [];
  for (let i = 0; i < 9; i++) arr.push(pick(letters));
  arr.push(pick(digits), pick(digits), pick(sym));
  for (let i = arr.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); [arr[i], arr[k]] = [arr[k], arr[i]]; }
  return arr.join("");
}

async function portalUserByEmail(email) {
  const r = await j(`${PORTAL_URL_API}/auth/v1/admin/users?page=1&per_page=1000`, { headers: svc(PORTAL_SERVICE_KEY) });
  if (!r.ok) throw new Error(`Portal project: ${r.status} ${(r.body && (r.body.msg || r.body.message || r.body.error)) || ""}`);
  const users = (r.body && r.body.users) || [];
  return users.find((u) => String(u.email || "").toLowerCase() === email) || null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!SERVICE_KEY) return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set on Vercel" });
  if (!PORTAL_URL_API || !PORTAL_SERVICE_KEY) return res.status(500).json({ error: "PORTAL_SUPABASE_URL / PORTAL_SUPABASE_SERVICE_ROLE_KEY are not set on Vercel - the portal project is not connected yet" });
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const manager = await managerFromToken(token);
  if (!manager) return res.status(403).json({ error: "Managers and Management only" });

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const action = String(body.action || "");
  const email = String(body.email || "").trim().toLowerCase();
  const mainHeaders = { ...svc(SERVICE_KEY), "accept-profile": "portal", "content-profile": "portal" };

  /* "View portal as this account" (Inventory 111): a 30-minute read-only preview link; the portal shows exactly what the account sees */
  if (action === "preview") {
    const accountId = String(body.accountId || "").trim();
    if (!accountId) return res.status(400).json({ error: "accountId is needed" });
    if (!PORTAL_URL) return res.status(500).json({ error: "PORTAL_URL is not set on Vercel (the address of the portal, e.g. https://portal.genesistanks.com)" });
    const r = await j(`${SUPABASE_URL}/rest/v1/preview_tokens`, { method: "POST", headers: { ...mainHeaders, prefer: "return=representation" }, body: JSON.stringify({ account_id: accountId, created_by: manager.email }) });
    if (!r.ok || !Array.isArray(r.body) || !r.body[0]) return res.status(500).json({ error: `Could not create the preview: ${(r.body && (r.body.message || r.body.hint)) || r.status} - has Inventory migration 111 been run?` });
    j(`${SUPABASE_URL}/rest/v1/rpc/purge_preview_tokens`, { method: "POST", headers: mainHeaders, body: "{}" }).catch(() => {});
    const base = String(body.host || "").trim() || PORTAL_URL;
    return res.status(200).json({ ok: true, url: `${base.replace(/\/+$/, "")}/?preview=${r.body[0].token}`, expiresAt: r.body[0].expires_at });
  }

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: "A valid e-mail is needed" });

  try {
    if (action === "create") {
      const accountId = String(body.accountId || "");
      if (!accountId) return res.status(400).json({ error: "accountId is needed" });
      const password = makePassword();
      let existing = await portalUserByEmail(email);
      let authId;
      if (existing) {
        const u = await j(`${PORTAL_URL_API}/auth/v1/admin/users/${existing.id}`, { method: "PUT", headers: svc(PORTAL_SERVICE_KEY), body: JSON.stringify({ password, email_confirm: true }) });
        if (!u.ok) throw new Error(`Portal project: ${(u.body && (u.body.msg || u.body.message)) || u.status}`);
        authId = existing.id;
      } else {
        const u = await j(`${PORTAL_URL_API}/auth/v1/admin/users`, { method: "POST", headers: svc(PORTAL_SERVICE_KEY), body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name: body.name || "" } }) });
        if (!u.ok) throw new Error(`Portal project: ${(u.body && (u.body.msg || u.body.message)) || u.status}`);
        authId = u.body.id;
      }
      const row = { account_id: accountId, email, name: String(body.name || "").trim() || null, auth_user_id: authId, active: true, must_change_password: true, created_by: manager.id };
      const have = await j(`${SUPABASE_URL}/rest/v1/users?select=id&email=ilike.${encodeURIComponent(email)}`, { headers: mainHeaders });
      const up = have.ok && Array.isArray(have.body) && have.body.length
        ? await j(`${SUPABASE_URL}/rest/v1/users?email=ilike.${encodeURIComponent(email)}`, { method: "PATCH", headers: mainHeaders, body: JSON.stringify(row) })
        : await j(`${SUPABASE_URL}/rest/v1/users`, { method: "POST", headers: mainHeaders, body: JSON.stringify(row) });
      if (!up.ok) throw new Error(`Main project: ${(up.body && up.body.message) || up.status} - has Inventory 099 been run and schema portal exposed?`);
      await j(`${SUPABASE_URL}/rest/v1/access_log`, { method: "POST", headers: mainHeaders, body: JSON.stringify({ email, account_id: accountId, action: existing ? "RESET_BY_GENESIS" : "CREATED_BY_GENESIS", detail: { by: manager.email } }) });
      return res.status(200).json({ ok: true, email, password, portalUrl: PORTAL_URL, existed: !!existing });
    }
    if (action === "reset") {
      const existing = await portalUserByEmail(email);
      if (!existing) return res.status(404).json({ error: "No portal login with that e-mail" });
      const password = makePassword();
      const u = await j(`${PORTAL_URL_API}/auth/v1/admin/users/${existing.id}`, { method: "PUT", headers: svc(PORTAL_SERVICE_KEY), body: JSON.stringify({ password }) });
      if (!u.ok) throw new Error(`Portal project: ${(u.body && (u.body.msg || u.body.message)) || u.status}`);
      await j(`${SUPABASE_URL}/rest/v1/users?email=ilike.${encodeURIComponent(email)}`, { method: "PATCH", headers: mainHeaders, body: JSON.stringify({ must_change_password: true, active: true }) });
      await j(`${SUPABASE_URL}/rest/v1/access_log`, { method: "POST", headers: mainHeaders, body: JSON.stringify({ email, action: "RESET_BY_GENESIS", detail: { by: manager.email } }) });
      return res.status(200).json({ ok: true, email, password, portalUrl: PORTAL_URL });
    }
    if (action === "remove") {
      const existing = await portalUserByEmail(email);
      if (existing) {
        const d = await j(`${PORTAL_URL_API}/auth/v1/admin/users/${existing.id}`, { method: "DELETE", headers: svc(PORTAL_SERVICE_KEY) });
        if (!d.ok) throw new Error(`Portal project: ${(d.body && (d.body.msg || d.body.message)) || d.status}`);
      }
      await j(`${SUPABASE_URL}/rest/v1/users?email=ilike.${encodeURIComponent(email)}`, { method: "DELETE", headers: mainHeaders });
      await j(`${SUPABASE_URL}/rest/v1/access_log`, { method: "POST", headers: mainHeaders, body: JSON.stringify({ email, action: "REMOVED_BY_GENESIS", detail: { by: manager.email } }) });
      return res.status(200).json({ ok: true, email });
    }
    return res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
