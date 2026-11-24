// Agents report tank events (gated in, sailed, arrived, delivered, empty returned); Genesis applies them in the Tank App.
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { CARD, INPUT, BTN, PRIMARY, DANGER, MUTED, GREEN, RED, AMBER, BLUE, DARK, ORANGE, Field, Pill, Msg, Empty, fmtD, fmtDT } from "../ui.jsx";

export const EVENT = {
  GATE_IN: ["Gated in at POL", BLUE, "Tanks received at the terminal (gate-in date)"],
  SAILED: ["Sailed", ORANGE, "Vessel departed - Genesis moves the tanks to In Transit"],
  ARRIVED: ["Arrived at POD", GREEN, "Vessel arrived - free time at destination starts"],
  DELIVERED: ["Delivered to consignee", DARK, "Tanks gated out to the consignee"],
  EMPTY_RETURNED: ["Empty returned to depot", "#6B5B95", "Tanks returned empty - ends the demurrage clock"],
};
export const EVENT_STATUS = { PENDING: ["Waiting for Genesis", AMBER], APPLIED: ["Applied", GREEN], REJECTED: ["Not accepted", RED], CANCELLED: ["Cancelled", MUTED] };
const ONE = (e) => EVENT[e] || [e, MUTED, ""];

/* panel under the tank list of a booking (agents only) */
export function ReportUpdate({ job, tanks, onSaved }) {
  const [meta, setMeta] = useState(null); const [err, setErr] = useState(null); const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false);
  const [ev, setEv] = useState(""); const [date, setDate] = useState(""); const [vessel, setVessel] = useState(""); const [voyage, setVoyage] = useState(""); const [sailingId, setSailingId] = useState("");
  const [place, setPlace] = useState(""); const [remarks, setRemarks] = useState(""); const [sel, setSel] = useState({}); const [sailings, setSailings] = useState([]);
  const load = useCallback(async () => { try { const r = await api(`/api/events?job=${encodeURIComponent(job.job_number)}`); setMeta(r); setErr(null); } catch (e) { setErr(e.message); } }, [job.job_number]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (ev === "SAILED" && !sailings.length) api("/api/sailings").then((r) => setSailings((r.sailings || []).filter((s) => !job.pol || !s.pol || s.pol.toUpperCase() === String(job.pol).toUpperCase()))).catch(() => {}); }, [ev, sailings.length, job.pol]);
  const allowed = (meta && meta.allowed) || [];
  const pending = useMemo(() => { const m = {}; ((meta && meta.pending) || []).forEach((p) => { m[`${p.tank_number}|${p.event}`] = p.event_date; }); return m; }, [meta]);
  const stageDone = (t, e) => (e === "GATE_IN" ? !!t.gate_in : e === "SAILED" ? !!t.sailed : e === "ARRIVED" ? !!t.arrived : e === "EMPTY_RETURNED" ? !!t.returned : false);
  const candidates = (tanks || []).filter((t) => ev && !pending[`${t.tank_number}|${ev}`] && !stageDone(t, ev));
  const chosen = candidates.filter((t) => sel[t.tank_number] !== false);
  const pickSailing = (id) => { setSailingId(id); const s = sailings.find((x) => String(x.id) === id); if (s) { setVessel(s.vessel || ""); setVoyage(s.voyage || ""); if (s.etd && !date) setDate(s.etd); } };
  const submit = async (e) => {
    e.preventDefault(); if (!ev || !date || !chosen.length) return;
    if (!window.confirm(`Report "${ONE(ev)[0]}" on ${date} for ${chosen.length} tank${chosen.length === 1 ? "" : "s"} of ${job.job_number}? Genesis will check and apply it.`)) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api("/api/events", { method: "POST", body: { row: { job: job.job_number, event: ev, date, vessel, voyage, sailingId, place, remarks, tanks: chosen.map((t) => t.tank_number) } } });
      const res = r.result || {};
      setMsg(`Reported for ${res.submitted} tank${res.submitted === 1 ? "" : "s"}.${(res.skipped || []).length ? ` Skipped: ${res.skipped.join("; ")}` : ""}`);
      setEv(""); setDate(""); setVessel(""); setVoyage(""); setSailingId(""); setPlace(""); setRemarks(""); setSel({});
      await load(); onSaved && onSaved();
    } catch (x) { setMsg(`Error: ${x.message}`); }
    setBusy(false);
  };
  if (err) return <Msg text={err} />;
  if (!meta) return null;
  if (!allowed.length) return null;
  const mine = (meta.events || []).slice(0, 12);
  return (
    <div style={{ ...CARD, borderColor: "#F09128", marginTop: 12 }}>
      <div style={{ fontWeight: 800, marginBottom: 4 }}>Report a tank update to Genesis</div>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>As {allowed.includes("GATE_IN") ? "POL" : "POD"} agent you can report: {allowed.map((a) => ONE(a)[0]).join(", ")}. Genesis checks each report and applies it to the tanks; you will see the status below.</div>
      <Msg text={msg} ok={msg && !/^Error/.test(msg)} onClose={() => setMsg(null)} />
      <form onSubmit={submit}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
          <Field label="Event"><select style={INPUT} value={ev} onChange={(e) => { setEv(e.target.value); setSel({}); }} required><option value="">—</option>{allowed.map((a) => <option key={a} value={a}>{ONE(a)[0]}</option>)}</select></Field>
          <Field label="Date" hint={ev ? ONE(ev)[2] : undefined}><input style={INPUT} type="date" value={date} max={new Date(Date.now() + 86400000).toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} required /></Field>
          {ev === "SAILED" && sailings.length > 0 && <Field label="From your sailing schedule"><select style={INPUT} value={sailingId} onChange={(e) => pickSailing(e.target.value)}><option value="">— type below —</option>{sailings.map((s) => <option key={s.id} value={s.id}>{s.vessel}{s.voyage ? ` ${s.voyage}` : ""} · {s.pol} → {s.pod}{s.etd ? ` · ETD ${fmtD(s.etd)}` : ""}</option>)}</select></Field>}
          {ev === "SAILED" && <Field label="Vessel"><input style={INPUT} value={vessel} onChange={(e) => setVessel(e.target.value)} required placeholder="Vessel name" /></Field>}
          {ev === "SAILED" && <Field label="Voyage"><input style={INPUT} value={voyage} onChange={(e) => setVoyage(e.target.value)} placeholder="e.g. 2412W" /></Field>}
          {ev === "EMPTY_RETURNED" && <Field label="Depot" span><input style={INPUT} value={place} onChange={(e) => setPlace(e.target.value)} required placeholder="Depot where the empty tanks were returned" /></Field>}
          {ev === "DELIVERED" && <Field label="Delivered to / place"><input style={INPUT} value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Consignee site (optional)" /></Field>}
          <Field label="Remarks" span><input style={INPUT} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional - seal numbers, carrier reference, anything Genesis should know" /></Field>
        </div>
        {ev && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Tanks ({chosen.length} of {candidates.length} selected)</div>
            {!candidates.length ? <div style={{ fontSize: 12, color: MUTED }}>Every tank on this booking already has this event, or it is already reported and waiting for Genesis.</div> : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {candidates.map((t) => <label key={t.tank_number} style={{ fontFamily: "monospace", fontSize: 12, border: `1px solid ${sel[t.tank_number] === false ? "#e0ddd3" : ORANGE}`, borderRadius: 6, padding: "4px 8px", cursor: "pointer", background: sel[t.tank_number] === false ? "#fff" : "#FFF6EC" }}>
                  <input type="checkbox" checked={sel[t.tank_number] !== false} onChange={(e) => setSel({ ...sel, [t.tank_number]: e.target.checked })} /> {t.tank_number}</label>)}
              </div>
            )}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button style={PRIMARY} disabled={busy || !ev || !date || !chosen.length}>{busy ? "Sending…" : "Send to Genesis"}</button>
        </div>
      </form>
      {mine.length > 0 && (
        <div style={{ marginTop: 14, borderTop: "1px solid #e0ddd3", paddingTop: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Your reports on this booking</div>
          <EventRows rows={mine} onChanged={load} compact />
        </div>
      )}
    </div>
  );
}

function EventRows({ rows, onChanged, compact }) {
  const [msg, setMsg] = useState(null);
  const cancel = async (r) => { if (!window.confirm(`Withdraw the "${ONE(r.event)[0]}" report for ${r.tank_number}?`)) return; try { await api(`/api/events?id=${r.id}`, { method: "DELETE" }); await onChanged(); } catch (e) { setMsg(`Error: ${e.message}`); } };
  return (
    <div style={{ overflowX: "auto" }}>
      <Msg text={msg} onClose={() => setMsg(null)} />
      <table style={{ minWidth: compact ? 600 : 900 }}>
        <thead><tr>{!compact && <th>Booking</th>}<th>Tank</th><th>Event</th><th>Date</th><th>Details</th><th>Reported</th><th>Status</th><th /></tr></thead>
        <tbody>{rows.map((r) => { const st = EVENT_STATUS[r.status] || [r.status, MUTED]; const e = ONE(r.event); return (
          <tr key={r.id}>
            {!compact && <td style={{ fontFamily: "monospace", fontWeight: 700 }}>{r.job_number}</td>}
            <td style={{ fontFamily: "monospace", fontWeight: 700 }}>{r.tank_number}</td>
            <td><Pill text={e[0]} color={e[1]} /></td><td>{fmtD(r.event_date)}</td>
            <td className="wrap" style={{ fontSize: 12 }}>{[r.vessel && `${r.vessel}${r.voyage ? ` ${r.voyage}` : ""}`, r.place, r.remarks].filter(Boolean).join(" · ") || "—"}</td>
            <td style={{ fontSize: 12 }}>{fmtDT(r.created_at)}<div style={{ fontSize: 11, color: MUTED }}>{r.submitted_by}</div></td>
            <td><Pill text={st[0]} color={st[1]} />{r.handle_note && <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{r.handle_note}</div>}</td>
            <td>{r.status === "PENDING" && <button style={{ ...DANGER, padding: "4px 8px", fontSize: 11 }} onClick={() => cancel(r)}>Withdraw</button>}</td>
          </tr>); })}</tbody>
      </table>
    </div>
  );
}

/* agent tab: everything reported in the last 6 months */
export default function UpdatesView() {
  const [rows, setRows] = useState(null); const [err, setErr] = useState(null); const [f, setF] = useState("ALL");
  const load = useCallback(async () => { try { const r = await api("/api/events"); setRows(r.events || []); setErr(null); } catch (e) { setErr(e.message); } }, []);
  useEffect(() => { load(); }, [load]);
  const list = (rows || []).filter((r) => f === "ALL" || r.status === f);
  const n = (s) => (rows || []).filter((r) => r.status === s).length;
  return (
    <div>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>Tank events you reported to Genesis. Open a booking under Bookings to report a new one.</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {[["ALL", "All"], ["PENDING", `Waiting (${n("PENDING")})`], ["APPLIED", `Applied (${n("APPLIED")})`], ["REJECTED", `Not accepted (${n("REJECTED")})`]].map(([k, l]) => (
          <button key={k} onClick={() => setF(k)} style={{ ...BTN, padding: "6px 10px", fontSize: 12, background: f === k ? DARK : "#fff", color: f === k ? "#fff" : DARK }}>{l}</button>))}
      </div>
      {err && <Msg text={err} />}
      {!rows && !err && <div style={{ color: MUTED }}>Loading…</div>}
      {rows && !list.length && <div style={CARD}><Empty text="Nothing reported yet." /></div>}
      {rows && list.length > 0 && <div style={{ ...CARD, padding: 0 }}><EventRows rows={list} onChanged={load} /></div>}
    </div>
  );
}
