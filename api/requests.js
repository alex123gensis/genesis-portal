// GET /api/requests -> my booking requests; POST { row } -> create; DELETE ?id= -> cancel (while NEW / IN_REVIEW)
import { guard, rpc, send } from "./_lib.js";
export default guard(async (req, res, who) => {
  const acc = who.session.account;
  if (req.method === "GET") return send(res, 200, { requests: await rpc("my_booking_requests", { p_account: acc.id }) });
  if (req.method === "POST") {
    const row = req.body && typeof req.body === "object" ? req.body.row || req.body : {};
    return send(res, 200, { request: await rpc("create_booking_request", { p_account: acc.id, p_email: who.email, p_row: row }) });
  }
  if (req.method === "DELETE") {
    const id = String((req.query && req.query.id) || "").trim();
    if (!id) return send(res, 400, { error: "id is needed" });
    await rpc("cancel_booking_request", { p_account: acc.id, p_email: who.email, p_id: id });
    return send(res, 200, { ok: true });
  }
  send(res, 405, { error: "Method not allowed" });
});
