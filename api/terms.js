// GET /api/terms?job= -> free time and detention tariff for the caller's role on the booking (never freight)
import { guard, rpc, send } from "./_lib.js";
export default guard(async (req, res, who) => {
  const job = String((req.query && req.query.job) || "").trim();
  if (!job) return send(res, 400, { error: "job is needed" });
  send(res, 200, await rpc("account_terms", { p_account: who.session.account.id, p_job: job }));
});
