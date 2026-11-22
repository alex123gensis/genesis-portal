// GET  /api/bl?job=   -> the booking's bill of lading as the caller may see it (+ quote, containers, tanks, permissions)
// POST /api/bl { job, action: "save" | "submit" | "issue" | "decision", fields?, containers?, blNumber?, approve?, comment? }
import { guard, rpc, send } from "./_lib.js";
export default guard(async (req, res, who) => {
  const acc = who.session.account;
  if (req.method === "GET") {
    const job = String((req.query && req.query.job) || "").trim();
    if (!job) return send(res, 400, { error: "job is needed" });
    return send(res, 200, await rpc("account_bl", { p_account: acc.id, p_job: job }));
  }
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  const b = req.body && typeof req.body === "object" ? req.body : {};
  const job = String(b.job || "").trim();
  if (!job) return send(res, 400, { error: "job is needed" });
  switch (b.action) {
    case "save": return send(res, 200, await rpc("agent_bl_save", { p_account: acc.id, p_email: who.email, p_job: job, p_fields: b.fields || {}, p_containers: Array.isArray(b.containers) ? b.containers : null }));
    case "submit": return send(res, 200, await rpc("agent_bl_submit", { p_account: acc.id, p_email: who.email, p_job: job }));
    case "issue": return send(res, 200, await rpc("agent_bl_issue", { p_account: acc.id, p_email: who.email, p_job: job, p_bl_number: String(b.blNumber || "") }));
    case "decision": return send(res, 200, await rpc("customer_bl_decision", { p_account: acc.id, p_email: who.email, p_job: job, p_approve: !!b.approve, p_comment: String(b.comment || "") }));
    default: return send(res, 400, { error: "Unknown action" });
  }
});
