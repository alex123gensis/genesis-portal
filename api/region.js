// GET /api/region -> empty tanks at depots in the agent's ports, with idle days (agents only; customers get an empty list)
import { guard, rpc, send } from "./_lib.js";
export default guard(async (req, res, who) => {
  send(res, 200, await rpc("region_inventory", { p_account: who.session.account.id }));
});
