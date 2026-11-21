// POST /api/password-changed - the browser changed the password on the portal project; clear the first-login flag
import { guard, rpc, send } from "./_lib.js";
export default guard(async (req, res, who) => {
  await rpc("password_changed", { p_email: who.email });
  send(res, 200, { ok: true });
}, { needAccount: false });
