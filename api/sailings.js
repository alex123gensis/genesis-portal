// GET /api/sailings - published vessel options (agents also see their own unpublished ones)
// POST /api/sailings { row } - agents add / edit their own; DELETE /api/sailings?id= - agents remove their own
import { guard, rpc, send } from "./_lib.js";
export default guard(async (req, res, who) => {
  const acc = who.session.account;
  if (req.method === "GET") {
    const rows = await rpc("account_sailings", { p_account: acc.id });
    return send(res, 200, { canEdit: !!acc.can_edit_sailings, sailings: rows || [] });
  }
  if (!acc.can_edit_sailings) return send(res, 403, { error: "Your account can view sailings but not enter them" });
  if (req.method === "POST") {
    const row = req.body && typeof req.body === "object" ? req.body.row || req.body : {};
    const id = await rpc("save_sailing", { p_account: acc.id, p_email: who.email, p_row: row });
    return send(res, 200, { id });
  }
  if (req.method === "DELETE") {
    const id = String((req.query && req.query.id) || "").trim();
    if (!id) return send(res, 400, { error: "id is needed" });
    await rpc("delete_sailing", { p_account: acc.id, p_email: who.email, p_id: id });
    return send(res, 200, { ok: true });
  }
  send(res, 405, { error: "Method not allowed" });
});
