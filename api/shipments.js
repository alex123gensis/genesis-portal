// GET /api/shipments - the caller's shipments (jobs matched to their account)
import { guard, rpc, send } from "./_lib.js";
export default guard(async (req, res, who) => {
  const rows = await rpc("account_shipments", { p_account: who.session.account.id });
  send(res, 200, { account: who.session.account, shipments: rows || [] });
});
