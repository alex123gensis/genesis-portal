// POST /api/msds { name, data } (data = base64 data URL, <= 4 MB) -> stores the MSDS in the main project's quote-msds bucket, returns its URL
import { guard, send } from "./_lib.js";
const MAIN_URL = String(process.env.MAIN_SUPABASE_URL || "").trim().replace(/\/(rest|auth)\/v1\/?$/i, "").replace(/\/+$/, "") || "https://tciwjnbnskphpzyoczfb.supabase.co";
const SERVICE = String(process.env.MAIN_SUPABASE_SERVICE_ROLE_KEY || "").trim();
export const config = { api: { bodyParser: { sizeLimit: "6mb" } } };
export default guard(async (req, res, who) => {
  if (req.method !== "POST") return send(res, 405, { error: "POST only" });
  const b = req.body && typeof req.body === "object" ? req.body : {};
  const m = /^data:([^;]+);base64,(.+)$/.exec(String(b.data || ""));
  if (!m) return send(res, 400, { error: "No file received" });
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 4 * 1024 * 1024) return send(res, 400, { error: "File is larger than 4 MB" });
  const safe = String(b.name || "msds.pdf").replace(/[^\w.\-]+/g, "_").slice(-80);
  const path = `portal-requests/${who.session.account.id}/${Date.now()}_${safe}`;
  const r = await fetch(`${MAIN_URL}/storage/v1/object/quote-msds/${path}`, { method: "POST", headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": m[1] || "application/octet-stream", "x-upsert": "true" }, body: buf });
  if (!r.ok) return send(res, 500, { error: `Upload failed (${r.status})` });
  send(res, 200, { url: `${MAIN_URL}/storage/v1/object/public/quote-msds/${path}`, name: safe });
});
