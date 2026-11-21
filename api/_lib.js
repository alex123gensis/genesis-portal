// Shared server helpers. The browser only ever holds a session on the PORTAL Supabase project (auth only);
// every data read goes through these functions, which call the MAIN project's portal.* RPCs with the service role
// and always pass the caller's own account id.
const PORTAL_URL = (process.env.PORTAL_SUPABASE_URL || "").trim();
const PORTAL_ANON = (process.env.PORTAL_SUPABASE_ANON_KEY || "").trim();
const MAIN_URL = (process.env.MAIN_SUPABASE_URL || "").trim() || "https://tciwjnbnskphpzyoczfb.supabase.co";
const MAIN_SERVICE = (process.env.MAIN_SUPABASE_SERVICE_ROLE_KEY || "").trim();

export function envProblem() {
  if (!PORTAL_URL || !PORTAL_ANON) return "PORTAL_SUPABASE_URL / PORTAL_SUPABASE_ANON_KEY are not set";
  if (!MAIN_SERVICE) return "MAIN_SUPABASE_SERVICE_ROLE_KEY is not set";
  return null;
}

async function call(url, init) {
  const r = await fetch(url, init);
  const text = await r.text();
  let body = null; try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  return { ok: r.ok, status: r.status, body };
}

// main-project RPC in schema portal, service role
export async function rpc(fn, args) {
  const r = await call(`${MAIN_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: MAIN_SERVICE, authorization: `Bearer ${MAIN_SERVICE}`, "content-type": "application/json", "content-profile": "portal", "accept-profile": "portal" },
    body: JSON.stringify(args || {}),
  });
  if (!r.ok) throw new Error((r.body && (r.body.message || r.body.hint || r.body.error)) || `Database error ${r.status}`);
  return r.body;
}

// Who is calling: verifies the portal-project JWT, then resolves the portal user + account in the main project.
export async function caller(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const u = await call(`${PORTAL_URL}/auth/v1/user`, { headers: { apikey: PORTAL_ANON, authorization: `Bearer ${token}` } });
  if (!u.ok || !u.body || !u.body.email) return null;
  const email = String(u.body.email).toLowerCase();
  const session = await rpc("whoami", { p_email: email });
  if (!session || !session.account) return { email, session: null };
  return { email, session };
}

export function send(res, status, body) { res.status(status).json(body); }

// wraps a handler: env check, auth, errors
export function guard(fn, { needAccount = true } = {}) {
  return async (req, res) => {
    const p = envProblem();
    if (p) return send(res, 500, { error: `Portal is not configured: ${p}` });
    try {
      const who = await caller(req);
      if (!who) return send(res, 401, { error: "Please sign in" });
      if (needAccount && !who.session) return send(res, 403, { error: "This login is not linked to a company account. Please contact Genesis." });
      return await fn(req, res, who);
    } catch (e) {
      return send(res, 500, { error: e.message || String(e) });
    }
  };
}
