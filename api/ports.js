// GET /api/ports -> port master for drop-downs
import { guard, rpc, send } from "./_lib.js";
export default guard(async (req, res) => { send(res, 200, { ports: await rpc("port_names", {}) }); });
