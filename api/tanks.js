// GET /api/tanks?job=<job number> - tanks on one of the caller's shipments
import { guard, rpc, send } from "./_lib.js";
export default guard(async (req, res, who) => {
  const job = String((req.query && req.query.job) || "").trim();
  if (!job) return send(res, 400, { error: "job is needed" });
  const rows = await rpc("account_shipment_tanks", { p_account: who.session.account.id, p_job: job });
  send(res, 200, { job, tanks: rows || [] });
});
