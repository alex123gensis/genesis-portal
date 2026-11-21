import { useState } from "react";
import { auth } from "../portalAuth.js";
import { api } from "../api.js";
import { CARD, INPUT, PRIMARY, MUTED, Field, Msg } from "../ui.jsx";

export default function ChangePassword({ onDone, forced }) {
  const [a, setA] = useState(""); const [b, setB] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const go = async (e) => {
    e.preventDefault();
    if (a.length < 8) return setErr("Use at least 8 characters.");
    if (a !== b) return setErr("The two passwords do not match.");
    setBusy(true); setErr(null);
    const { error } = await auth.auth.updateUser({ password: a });
    if (error) { setErr(error.message); setBusy(false); return; }
    try { await api("/api/password-changed", { method: "POST", body: {} }); } catch { /* flag only */ }
    onDone();
  };
  return (
    <form onSubmit={go} style={{ ...CARD, maxWidth: 420, margin: forced ? "40px auto" : 0 }}>
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{forced ? "Choose your own password" : "Change password"}</div>
      {forced && <div style={{ fontSize: 13, color: MUTED, marginBottom: 12 }}>You signed in with a temporary password. Please set a new one before continuing.</div>}
      <Msg text={err} onClose={() => setErr(null)} />
      <div style={{ display: "grid", gap: 10 }}>
        <Field label="New password"><input style={INPUT} type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} /></Field>
        <Field label="Repeat new password"><input style={INPUT} type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} /></Field>
        <button style={PRIMARY} disabled={busy}>{busy ? "Saving…" : "Save password"}</button>
      </div>
    </form>
  );
}

