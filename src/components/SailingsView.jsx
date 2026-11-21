import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { CARD, INPUT, BTN, PRIMARY, DANGER, MUTED, ORANGE, GREEN, RED, AMBER, LINE, Field, Pill, Msg, Empty, fmtD, fmtDT, downloadCsv } from "../ui.jsx";

const DG = ["Not stated", "Accepted", "Restricted", "Not accepted"];
const SPACE = ["Offered", "Requested", "Awaiting", "Confirmed", "Full", "Closed"];
const toLocal = (iso) => { if (!iso) return ""; const d = new Date(iso); if (isNaN(d)) return ""; const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const toIso = (local) => { if (!local) return ""; const d = new Date(local); return isNaN(d) ? "" : d.toISOString(); };
const EMPTY = { vessel: "", voyage: "", operator: "", service: "", pol: "", pod: "", via: "", etd: "", eta: "", gate_open: "", gate_cutoff: "", doc_cutoff: "", dg: "Accepted", space: "Offered", dg_notes: "", notes: "" };
const daysTo = (d) => (d ? Math.round((new Date(d + "T00:00:00") - new Date(new Date().toDateString())) / 86400000) : null);

function Editor({ value, ports, onSaved, onClose }) {
  const [d, setD] = useState(() => ({ ...EMPTY, ...value, eta: value.eta || "", gate_open: toLocal(value.gate_open), gate_cutoff: toLocal(value.gate_cutoff), doc_cutoff: toLocal(value.doc_cutoff) }));
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const set = (k) => (e) => setD((p) => ({ ...p, [k]: e.target.value }));
  const save = async (e) => {
    e.preventDefault();
    if (!d.vessel.trim() || !d.pol.trim() || !d.pod.trim()) return setErr("Vessel, POL and POD are needed.");
    if (!d.etd) return setErr("ETD at POL is needed.");
    setBusy(true); setErr(null);
    try {
      const row = { ...d, id: value.id || "", gate_open: toIso(d.gate_open), gate_cutoff: toIso(d.gate_cutoff), doc_cutoff: toIso(d.doc_cutoff) };
      await api("/api/sailings", { method: "POST", body: { row } }); await onSaved();
    } catch (x) { setErr(x.message); setBusy(false); }
  };
  const del = async () => { if (!window.confirm("Remove this sailing from the schedule?")) return; try { await api(`/api/sailings?id=${encodeURIComponent(value.id)}`, { method: "DELETE" }); await onSaved(); } catch (x) { setErr(x.message); } };
  return (
    <form onSubmit={save} style={{ ...CARD, borderColor: ORANGE, marginBottom: 14 }}>
      <div style={{ fontWeight: 800, marginBottom: 10 }}>{value.id ? "Edit sailing" : "Add a sailing"}</div>
      <Msg text={err} onClose={() => setErr(null)} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
        <Field label="Vessel"><input style={INPUT} value={d.vessel} onChange={set("vessel")} required /></Field>
        <Field label="Voyage"><input style={INPUT} value={d.voyage} onChange={set("voyage")} /></Field>
        <Field label="Operator / line"><input style={INPUT} value={d.operator} onChange={set("operator")} /></Field>
        <Field label="Service"><input style={INPUT} value={d.service} onChange={set("service")} /></Field>
        <Field label="Port of loading (POL)"><input style={INPUT} list="ports" value={d.pol} onChange={set("pol")} required /></Field>
        <Field label="Port of discharge (POD)"><input style={INPUT} list="ports" value={d.pod} onChange={set("pod")} required /></Field>
        <Field label="Via / transhipment"><input style={INPUT} value={d.via} onChange={set("via")} /></Field>
        <Field label="ETD at POL"><input style={INPUT} type="date" value={d.etd || ""} onChange={set("etd")} required /></Field>
        <Field label="ETA at POD"><input style={INPUT} type="date" value={d.eta || ""} onChange={set("eta")} /></Field>
        <Field label="Gate-in opens at POL"><input style={INPUT} type="datetime-local" value={d.gate_open} onChange={set("gate_open")} /></Field>
        <Field label="Gate-in cut-off at POL"><input style={INPUT} type="datetime-local" value={d.gate_cutoff} onChange={set("gate_cutoff")} /></Field>
        <Field label="Document cut-off"><input style={INPUT} type="datetime-local" value={d.doc_cutoff} onChange={set("doc_cutoff")} /></Field>
        <Field label="DG acceptance"><select style={INPUT} value={d.dg} onChange={set("dg")}>{DG.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Space"><select style={INPUT} value={d.space} onChange={set("space")}>{SPACE.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="DG notes"><input style={INPUT} value={d.dg_notes} onChange={set("dg_notes")} /></Field>
        <Field label="Remarks" span><input style={INPUT} value={d.notes} onChange={set("notes")} placeholder="Rotation, terms, anything customers should know" /></Field>
      </div>
      <datalist id="ports">{ports.map((p) => <option key={p} value={p} />)}</datalist>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button style={PRIMARY} disabled={busy}>{busy ? "Saving…" : "Save sailing"}</button>
        <button type="button" style={BTN} onClick={onClose}>Cancel</button>
        {value.id && <button type="button" style={{ ...DANGER, marginLeft: "auto" }} onClick={del}>Remove</button>}
      </div>
    </form>
  );
}

export default function SailingsView({ account }) {
  const [data, setData] = useState(null); const [err, setErr] = useState(null);
  const [pol, setPol] = useState(""); const [pod, setPod] = useState(""); const [edit, setEdit] = useState(null); const [msg, setMsg] = useState(null);
  const load = useCallback(async () => { try { setData(await api("/api/sailings")); setErr(null); } catch (e) { setErr(e.message); } }, []);
  useEffect(() => { load(); }, [load]);
  const rows = (data && data.sailings) || [];
  const canEdit = !!(data && data.canEdit);
  const ports = useMemo(() => Array.from(new Set(rows.flatMap((r) => [r.pol, r.pod]).filter(Boolean))).sort(), [rows]);
  const pols = useMemo(() => Array.from(new Set(rows.map((r) => r.pol).filter(Boolean))).sort(), [rows]);
  const pods = useMemo(() => Array.from(new Set(rows.filter((r) => !pol || r.pol === pol).map((r) => r.pod).filter(Boolean))).sort(), [rows, pol]);
  const list = rows.filter((r) => (!pol || r.pol === pol) && (!pod || r.pod === pod));
  const csv = () => downloadCsv(`sailing_schedule_${new Date().toISOString().slice(0, 10)}.csv`, ["POL", "POD", "Via", "Vessel", "Voyage", "Operator", "ETD", "ETA", "Gate-in opens", "Gate-in cut-off", "Doc cut-off", "DG", "Space", "Remarks"],
    list.map((r) => [r.pol, r.pod, r.via, r.vessel, r.voyage, r.operator, r.etd, r.eta || r.eta_text, fmtDT(r.gate_open), fmtDT(r.gate_cutoff), fmtDT(r.doc_cutoff), r.dg, r.space, r.notes]));

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <select style={{ ...INPUT, maxWidth: 220 }} value={pol} onChange={(e) => { setPol(e.target.value); setPod(""); }}><option value="">Any port of loading</option>{pols.map((p) => <option key={p}>{p}</option>)}</select>
        <select style={{ ...INPUT, maxWidth: 220 }} value={pod} onChange={(e) => setPod(e.target.value)}><option value="">Any port of discharge</option>{pods.map((p) => <option key={p}>{p}</option>)}</select>
        <div style={{ fontSize: 12, color: MUTED }}>{list.length} sailing{list.length === 1 ? "" : "s"} · next 14 days and beyond</div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button style={BTN} onClick={csv} disabled={!list.length}>Download CSV</button>
          {canEdit && !edit && <button style={PRIMARY} onClick={() => setEdit({})}>+ Add sailing</button>}
        </div>
      </div>
      <Msg text={msg} ok onClose={() => setMsg(null)} />
      {err && <Msg text={err} />}
      {edit && <Editor value={edit} ports={ports} onSaved={async () => { setEdit(null); setMsg("Sailing saved - customers can see it now."); await load(); }} onClose={() => setEdit(null)} />}
      {!data && !err && <div style={{ color: MUTED }}>Loading schedule…</div>}
      {data && !list.length && <div style={CARD}><Empty text={canEdit ? "No sailings yet. Add the first vessel option with the button above." : "No sailings published for this route at the moment."} /></div>}
      {data && list.length > 0 && (
        <div style={{ ...CARD, padding: 0, overflowX: "auto" }}>
          <table style={{ minWidth: 1100 }}>
            <thead><tr><th>POL</th><th>POD</th><th className="hide-sm">Via</th><th>Vessel / voyage</th><th className="hide-sm">Operator</th><th>ETD</th><th>ETA</th><th>Gate-in opens</th><th>Gate-in cut-off</th><th className="hide-sm">Doc cut-off</th><th>DG</th><th>Space</th><th className="hide-sm">Remarks</th>{canEdit && <th />}</tr></thead>
            <tbody>{list.map((r) => {
              const dl = daysTo(r.etd); const past = dl != null && dl < 0; const cutSoon = r.gate_cutoff && (new Date(r.gate_cutoff) - Date.now()) < 3 * 86400000 && !past;
              return (
                <tr key={r.id} className={r.mine ? "row" : ""} onClick={() => r.mine && canEdit && setEdit(r)} style={{ color: past ? "#aaa" : undefined }}>
                  <td className="wrap" style={{ fontWeight: 700 }}>{r.pol}</td><td className="wrap" style={{ fontWeight: 700 }}>{r.pod}</td><td className="hide-sm wrap">{r.via || "—"}</td>
                  <td className="wrap">{r.vessel}{r.voyage ? <span style={{ color: MUTED }}> · {r.voyage}</span> : ""}{r.mine && <div style={{ fontSize: 10, color: ORANGE, fontWeight: 700 }}>ENTERED BY YOUR COMPANY{r.published ? "" : " · NOT PUBLISHED"}</div>}</td>
                  <td className="hide-sm">{r.operator || "—"}</td>
                  <td>{fmtD(r.etd)}{dl != null && dl >= 0 && dl <= 7 ? <div style={{ fontSize: 10, color: AMBER, fontWeight: 700 }}>in {dl} day{dl === 1 ? "" : "s"}</div> : null}</td>
                  <td>{r.eta ? fmtD(r.eta) : r.eta_text || "—"}</td>
                  <td>{fmtDT(r.gate_open)}</td>
                  <td style={{ color: cutSoon ? RED : undefined, fontWeight: cutSoon ? 700 : 400 }}>{fmtDT(r.gate_cutoff)}</td>
                  <td className="hide-sm">{fmtDT(r.doc_cutoff)}</td>
                  <td><Pill text={r.dg || "Not stated"} color={r.dg === "Accepted" ? GREEN : r.dg === "Not accepted" ? RED : r.dg === "Restricted" ? AMBER : MUTED} /></td>
                  <td>{r.space || "—"}</td>
                  <td className="hide-sm wrap" style={{ maxWidth: 240, fontSize: 12, color: "#555" }}>{[r.dg_notes, r.notes].filter(Boolean).join(" · ") || "—"}</td>
                  {canEdit && <td>{r.mine ? <button style={{ ...BTN, padding: "4px 8px", fontSize: 11 }} onClick={(e) => { e.stopPropagation(); setEdit(r); }}>Edit</button> : null}</td>}
                </tr>);
            })}</tbody>
          </table>
        </div>
      )}
      <div style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>Times are shown in your local time zone. Cut-offs in red are within 3 days.</div>
    </div>
  );
}
