// Booking requests: customers and agents ask for a shipment; Genesis answers in the Tank App (Quotes > Booking requests).
import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { CARD, INPUT, BTN, PRIMARY, DANGER, MUTED, GREEN, RED, AMBER, BLUE, DARK, Field, Pill, Msg, Empty, fmtD, fmtDT } from "../ui.jsx";
import PortSelect, { usePorts } from "./PortSelect.jsx";

const STATUS = { NEW: ["Sent to Genesis", BLUE], IN_REVIEW: ["Being reviewed", AMBER], QUOTED: ["Quoted", GREEN], CONFIRMED: ["Confirmed - job opened", DARK], DECLINED: ["Declined", RED], CANCELLED: ["Cancelled", MUTED] };
const EMPTY = { pol: "", pod: "", product: "", unNo: "", imoClass: "", tanks: 1, cargoReady: "", preferredSailing: "", terms: "", remarks: "", onBehalfOf: "", msdsUrl: "", msdsName: "" };
const readAsDataUrl = (f) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(f); });

function Form({ account, ports, onSaved, onClose }) {
  const [d, setD] = useState(EMPTY); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null); const [uploading, setUploading] = useState(false);
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value });
  const onMsds = async (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f) return;
    if (f.size > 4 * 1024 * 1024) { setErr("The MSDS must be under 4 MB."); return; }
    setUploading(true); setErr(null);
    try { const r = await api("/api/msds", { method: "POST", body: { name: f.name, data: await readAsDataUrl(f) } }); setD((p) => ({ ...p, msdsUrl: r.url, msdsName: r.name })); } catch (x) { setErr(`MSDS upload failed: ${x.message}`); }
    setUploading(false);
  };
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await api("/api/requests", { method: "POST", body: { row: d } }); await onSaved(); } catch (x) { setErr(x.message); setBusy(false); }
  };
  return (
    <form onSubmit={save} style={{ ...CARD, borderColor: "#F09128", marginBottom: 14 }}>
      <div style={{ fontWeight: 800, marginBottom: 10 }}>New booking request</div>
      <Msg text={err} onClose={() => setErr(null)} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
        {account.kind === "AGENT" && <Field label="On behalf of (customer)" span><input style={INPUT} value={d.onBehalfOf} onChange={set("onBehalfOf")} placeholder="Customer company name" /></Field>}
        <Field label="Port of loading"><PortSelect ports={ports} value={d.pol} onChange={(v) => setD({ ...d, pol: v })} required /></Field>
        <Field label="Port of discharge"><PortSelect ports={ports} value={d.pod} onChange={(v) => setD({ ...d, pod: v })} required /></Field>
        <Field label="Number of tanks"><input style={INPUT} type="number" min="1" value={d.tanks} onChange={set("tanks")} required /></Field>
        <Field label="Cargo ready date"><input style={INPUT} type="date" value={d.cargoReady} onChange={set("cargoReady")} /></Field>
        <Field label="Product"><input style={INPUT} value={d.product} onChange={set("product")} placeholder="Trade name" /></Field>
        <Field label="UN number"><input style={INPUT} value={d.unNo} onChange={set("unNo")} placeholder="UN1993 or Non-DG" /></Field>
        <Field label="IMO class"><input style={INPUT} value={d.imoClass} onChange={set("imoClass")} placeholder="3" /></Field>
        <Field label="Preferred sailing / vessel"><input style={INPUT} value={d.preferredSailing} onChange={set("preferredSailing")} placeholder="e.g. first week of December" /></Field>
        <Field label="Terms"><select style={INPUT} value={d.terms} onChange={set("terms")}><option value="">—</option>{["PIER TO PIER", "DOOR TO PIER", "PIER TO DOOR", "DOOR TO DOOR", "LEASE"].map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="MSDS (PDF)" hint="Safety data sheet of the product - needed for DG cargo">
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <label style={{ ...BTN, display: "inline-block", cursor: "pointer" }}>{uploading ? "Uploading…" : d.msdsUrl ? "Replace" : "Choose file"}<input type="file" accept=".pdf,image/*" style={{ display: "none" }} onChange={onMsds} /></label>
            {d.msdsUrl ? <a href={d.msdsUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>{d.msdsName}</a> : <span style={{ fontSize: 12, color: MUTED }}>none</span>}
          </div>
        </Field>
        <Field label="Remarks" span><textarea style={{ ...INPUT, minHeight: 60 }} value={d.remarks} onChange={set("remarks")} placeholder="Heating, special handling, delivery address, anything Genesis should know" /></Field>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button style={PRIMARY} disabled={busy}>{busy ? "Sending…" : "Send request"}</button>
        <button type="button" style={BTN} onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}

export default function BookingRequestsView({ account }) {
  const [rows, setRows] = useState(null); const [err, setErr] = useState(null); const [msg, setMsg] = useState(null); const [open, setOpen] = useState(false);
  const ports = usePorts();
  const load = useCallback(async () => { try { const r = await api("/api/requests"); setRows(r.requests || []); setErr(null); } catch (e) { setErr(e.message); } }, []);
  useEffect(() => { load(); }, [load]);
  const cancel = async (r) => { if (!window.confirm("Cancel this booking request?")) return; try { await api(`/api/requests?id=${r.id}`, { method: "DELETE" }); setMsg("Request cancelled."); await load(); } catch (e) { setMsg(`Error: ${e.message}`); } };
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: MUTED }}>Ask Genesis for a shipment. You will see the status here and a quote or booking number once it is confirmed.</div>
        {!open && <button style={{ ...PRIMARY, marginLeft: "auto" }} onClick={() => setOpen(true)}>+ New booking request</button>}
      </div>
      <Msg text={msg} ok={msg && !/^Error/.test(msg)} onClose={() => setMsg(null)} />
      {err && <Msg text={err} />}
      {open && <Form account={account} ports={ports} onSaved={async () => { setOpen(false); setMsg("Request sent - Genesis will come back to you."); await load(); }} onClose={() => setOpen(false)} />}
      {!rows && !err && <div style={{ color: MUTED }}>Loading…</div>}
      {rows && !rows.length && <div style={CARD}><Empty text="No booking requests in the last 6 months." /></div>}
      {rows && rows.length > 0 && (
        <div style={{ ...CARD, padding: 0, overflowX: "auto" }}>
          <table style={{ minWidth: 900 }}>
            <thead><tr><th>Sent</th><th>Status</th><th>Route</th><th>Product</th><th>Tanks</th><th>Cargo ready</th>{account.kind === "AGENT" && <th>For</th>}<th>Genesis reply</th><th>Quote / booking</th><th /></tr></thead>
            <tbody>{rows.map((r) => { const st = STATUS[r.status] || [r.status, MUTED]; return (
              <tr key={r.id}>
                <td>{fmtDT(r.created_at)}<div style={{ fontSize: 11, color: MUTED }}>{r.requested_by}</div></td>
                <td><Pill text={st[0]} color={st[1]} /></td>
                <td className="wrap">{r.pol} → {r.pod}</td>
                <td className="wrap">{[r.product, r.un_no, r.imo_class].filter(Boolean).join(" · ") || "—"}{r.msds_url && <div><a href={r.msds_url} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>MSDS</a></div>}</td>
                <td style={{ textAlign: "right" }}>{r.tanks}</td><td>{fmtD(r.cargo_ready)}</td>
                {account.kind === "AGENT" && <td className="wrap">{r.on_behalf_of || "—"}</td>}
                <td className="wrap" style={{ fontSize: 12 }}>{r.genesis_note || "—"}</td>
                <td style={{ fontFamily: "monospace" }}>{r.job_number || r.quote_number || "—"}</td>
                <td>{["NEW", "IN_REVIEW"].includes(r.status) && <button style={{ ...DANGER, padding: "4px 8px", fontSize: 11 }} onClick={() => cancel(r)}>Cancel</button>}</td>
              </tr>); })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
