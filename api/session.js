// GET /api/session - called once after sign-in: records the login and returns user + account.
import { guard, rpc, send } from "./_lib.js";
export default guard(async (req, res, who) => {
  const s = await rpc("session_for", { p_email: who.email });
  send(res, 200, s || who.session);
});
