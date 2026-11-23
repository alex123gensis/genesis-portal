// Port drop-down fed by the Tank App's port master (plus any port already used on a quote). Typing filters; unknown names allowed.
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { INPUT } from "../ui.jsx";

let cache = null;
export function usePorts() {
  const [ports, setPorts] = useState(cache || []);
  useEffect(() => { let on = true; if (cache) return; api("/api/ports").then((r) => { cache = r.ports || []; if (on) setPorts(cache); }).catch(() => {}); return () => { on = false; }; }, []);
  return ports;
}
export default function PortSelect({ ports, value, onChange, required, placeholder = "Choose a port" }) {
  const known = ports.some((p) => p.name === String(value || "").toUpperCase());
  return (
    <select style={INPUT} value={known ? String(value).toUpperCase() : value ? "__other" : ""} required={required}
      onChange={(e) => { if (e.target.value === "__other") { const v = window.prompt("Port name (not in the list):", value || ""); if (v) onChange(v.toUpperCase()); } else onChange(e.target.value); }}>
      <option value="">{placeholder}</option>
      {ports.map((p) => <option key={p.name} value={p.name}>{p.name}{p.country ? ` (${p.country})` : ""}</option>)}
      <option value="__other">{value && !known ? `${String(value).toUpperCase()} (typed)` : "Other port…"}</option>
    </select>
  );
}
