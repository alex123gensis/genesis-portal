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
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (Array.isArray(body.rows)) {
      // bulk upload from Excel: each row saved on its own so one bad row does not block the rest
      const results = [];
      for (const row of body.rows.slice(0, 500)) {
        try { results.push({ ok: true, id: await rpc("save_sailing", { p_account: acc.id, p_email: who.email, p_row: row }) }); }
        catch (e) { results.push({ ok: false, error: e.message || String(e) }); }
      }
      return send(res, 200, { results, saved: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length });
    }
    const row = body.row || body;
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
