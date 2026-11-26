// Agent tank events (Inventory 109). GET -> my reports (?job= narrows; adds allowed events + pending per tank for that job);
// POST { row } -> submit a batch; DELETE ?id= -> cancel while PENDING.
import { guard, rpc, send } from "./_lib.js";
export default guard(async (req, res, who) => {
  const acc = who.session.account;
  if (req.method === "GET") {
    const job = String((req.query && req.query.job) || "").trim();
    if (job) {
      const [events, allowed, pending] = await Promise.all([
        rpc("my_tank_events", { p_account: acc.id, p_job: job }),
        acc.kind === "AGENT" ? rpc("allowed_events", { p_account: acc.id, p_job: job }) : [],
        acc.kind === "AGENT" ? rpc("pending_events_for_job", { p_account: acc.id, p_job: job }) : [],
      ]);
      return send(res, 200, { events: events || [], allowed: allowed || [], pending: pending || [] });
    }
    return send(res, 200, { events: (await rpc("my_tank_events", { p_account: acc.id, p_job: null })) || [] });
  }
  if (req.method === "POST") {
    if (acc.kind !== "AGENT") return send(res, 403, { error: "Only agents report tank events" });
    const row = req.body && typeof req.body === "object" ? req.body.row || req.body : {};
    return send(res, 200, { result: await rpc("submit_tank_events", { p_account: acc.id, p_email: who.email, p_row: row }) });
  }
  if (req.method === "DELETE") {
    const id = String((req.query && req.query.id) || "").trim();
    if (!id) return send(res, 400, { error: "id is needed" });
    await rpc("cancel_tank_event", { p_account: acc.id, p_email: who.email, p_id: id });
    return send(res, 200, { ok: true });
  }
  send(res, 405, { error: "Method not allowed" });
});
