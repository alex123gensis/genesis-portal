// GET /api/documents?job= -> issued B/L, Genesis invoices, uploaded invoice files, tank certificates, MSDS - with public URLs
import { guard, rpc, send } from "./_lib.js";
const MAIN_URL = String(process.env.MAIN_SUPABASE_URL || "").trim().replace(/\/(rest|auth)\/v1\/?$/i, "").replace(/\/+$/, "") || "https://tciwjnbnskphpzyoczfb.supabase.co";
const pub = (bucket, path) => `${MAIN_URL}/storage/v1/object/public/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
export default guard(async (req, res, who) => {
  const job = String((req.query && req.query.job) || "").trim();
  if (!job) return send(res, 400, { error: "job is needed" });
  const d = await rpc("account_documents", { p_account: who.session.account.id, p_job: job });
  if (d && Array.isArray(d.tanks)) d.tanks.forEach((t) => { (t.files || []).forEach((f) => { f.url = pub("tank-certificates", f.path); }); });
  send(res, 200, d);
});
