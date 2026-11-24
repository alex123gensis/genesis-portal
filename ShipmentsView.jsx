import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import BillOfLadingView from "./BillOfLadingView.jsx";
import DocumentsView from "./DocumentsView.jsx";
import TermsCard from "./TermsCard.jsx";
import { ReportUpdate, EVENT } from "./TankEvents.jsx";
import { CARD, INPUT, BTN, MUTED, ORANGE, GREEN, AMBER, BLUE, DARK, LINE, STAGE, STAGES, Pill, Tile, Msg, Empty, fmtD, downloadCsv } from "../ui.jsx";

const ROLE_LABEL = { CUSTOMER: ["Customer", GREEN], POL_AGENT: ["POL agent", BLUE], POD_AGENT: ["POD agent", ORANGE] };
const roleTags = (r) => String(r || "").split(",").filter(Boolean);
const ACTIVE = new Set(["PENDING", "ALLOCATED", "LOADING", "GATED_IN", "ON_WATER", "ARRIVED"]);

function Progress({ stage, small }) {
  const idx = STAGES.indexOf(stage);
  const labels = ["Allocated", "Loading", "Gated in", "On water", "Arrived", "Returned"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, minWidth: small ? 150 : 420 }}>
      {STAGES.map((s, i) => {
        const done = idx >= i, cur = idx === i;
        return (
          <div key={s} style={{ display: "flex", alignItems: "center", flex: i < STAGES.length - 1 ? 1 : "none" }}>
            <div title={labels[i]} style={{ width: small ? 10 : 16, height: small ? 10 : 16, borderRadius: "50%", background: done ? (cur ? ORANGE : GREEN) : "#e5e1d8", border: cur ? `3px solid #FFD9B3` : "none", boxSizing: "content-box" }} />
            {i < STAGES.length - 1 && <div style={{ flex: 1, height: small ? 2 : 3, background: idx > i ? GREEN : "#e5e1d8" }} />}
          </div>
        );
      })}
    </div>
  );
}

function Detail({ job, account, onBack }) {
  const [tanks, setTanks] = useState(null); const [err, setErr] = useState(null); const [sub, setSub] = useState("tracking"); const [pending, setPending] = useState({});
  const [nonce, setNonce] = useState(0);
  useEffect(() => { let on = true; api(`/api/tanks?job=${encodeURIComponent(job.job_number)}`).then((r) => on && setTanks(r.tanks)).catch((e) => on && setErr(e.message)); return () => { on = false; }; }, [job.job_number, nonce]);
  useEffect(() => {
    if (account.kind !== "AGENT") return undefined;
    let on = true;
    api(`/api/events?job=${encodeURIComponent(job.job_number)}`).then((r) => { if (!on) return; const m = {}; (r.pending || []).forEach((p) => { (m[p.tank_number] = m[p.tank_number] || []).push(p); }); setPending(m); }).catch(() => {});
    return () => { on = false; };
  }, [job.job_number, account.kind, nonce]);
  const st = STAGE[job.stage] || [job.stage, MUTED];
  const facts = [["Booking", job.job_number], ["Route", `${job.pol || "—"} → ${job.pod || "—"}`], ["Product", job.product || "—"], ["Tanks", `${job.tank_count} of ${job.tanks_required}`],
    ["Vessel", job.vessel ? `${job.vessel}${job.voyage ? ` · ${job.voyage}` : ""}` : "—"], ["Carrier", job.carrier || "—"], ["Bill of lading", job.bl_no || "—"], ["Booked on", fmtD(job.opened_at && job.opened_at.slice(0, 10))]];
  return (
    <div>
      <button style={{ ...BTN, marginBottom: 12 }} onClick={onBack}>← All shipments</button>
      <div style={{ ...CARD, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "monospace" }}>{job.job_number}</div>
          <Pill stage={job.stage} />
          <div style={{ fontSize: 14, color: "#444" }}>{job.pol} → {job.pod}</div>
        </div>
        <div style={{ overflowX: "auto", paddingBottom: 6 }}><Progress stage={job.stage} /></div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: MUTED, minWidth: 420, marginTop: 4 }}>{["Allocated", "Loading", "Gated in", "On water", "Arrived", "Returned"].map((l) => <span key={l}>{l}</span>)}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginTop: 16 }}>
          {facts.map(([k, v]) => <div key={k}><div style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.05em" }}>{k}</div><div style={{ fontSize: 14, fontWeight: 600 }}>{v}</div></div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${LINE}` }}>
          {[["Collected from depot", job.depot_out], ["Gated in at POL", job.gate_in], ["Sailed", job.sailed], [job.arrived ? "Arrived" : "Expected arrival", job.arrived || job.eta], ["Tanks returned empty", `${job.returned_count} of ${job.tank_count}`]].map(([k, v]) => (
            <div key={k}><div style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.05em" }}>{k}</div><div style={{ fontSize: 14, fontWeight: 600 }}>{typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? fmtD(v) : v || "—"}</div></div>))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {[["tracking", "Tracking"], ["bl", "Bill of lading"], ["terms", "Free time & detention"], ["documents", "Documents"]].map(([k, l]) => (
          <button key={k} onClick={() => setSub(k)} style={{ ...BTN, background: sub === k ? DARK : "#fff", color: sub === k ? "#fff" : DARK }}>{l}</button>))}
      </div>
      {sub === "bl" && <BillOfLadingView job={job} account={account} />}
      {sub === "documents" && <DocumentsView job={job} />}
      {sub === "terms" && <TermsCard job={job} />}
      {sub === "tracking" && <div style={CARD}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Tanks on this booking</div>
        {err && <Msg text={err} />}
        {!tanks && !err && <div style={{ color: MUTED, fontSize: 13 }}>Loading…</div>}
        {tanks && !tanks.length && <Empty text="No tanks allocated yet." />}
        {tanks && tanks.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ minWidth: 900 }}>
              <thead><tr><th>Tank</th><th>Status</th><th>Product</th><th>Depot out</th><th>Gated in</th><th>Sailed</th><th>ETA / arrived</th><th>Returned</th><th>B/L</th></tr></thead>
              <tbody>{tanks.map((t) => (
                <tr key={t.tank_number}>
                  <td style={{ fontFamily: "monospace", fontWeight: 700 }}>{t.tank_number}</td>
                  <td><Pill stage={t.stage} />{(pending[t.tank_number] || []).map((p) => <div key={p.event} style={{ fontSize: 10, color: AMBER, marginTop: 2 }} title="Reported by you, waiting for Genesis to apply">↻ {(EVENT[p.event] || [p.event])[0]} {fmtD(p.event_date)}</div>)}</td><td className="wrap">{t.product || "—"}</td>
                  <td>{fmtD(t.depot_out)}</td><td>{fmtD(t.gate_in)}</td><td>{fmtD(t.sailed)}</td>
                  <td>{t.arrived ? fmtD(t.arrived) : t.eta ? <span style={{ color: MUTED }}>ETA {fmtD(t.eta)}</span> : "—"}</td>
                  <td>{fmtD(t.returned)}</td><td style={{ fontFamily: "monospace" }}>{t.bl_no || "—"}</td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
        {account.kind === "AGENT" && tanks && tanks.length > 0 && <ReportUpdate job={job} tanks={tanks} onSaved={() => setNonce((n) => n + 1)} />}
      </div>}
    </div>
  );
}

export default function ShipmentsView({ account }) {
  const [rows, setRows] = useState(null); const [err, setErr] = useState(null);
  const [q, setQ] = useState(""); const [scope, setScope] = useState("ACTIVE"); const [stageF, setStageF] = useState(null); const [open, setOpen] = useState(null);
  useEffect(() => { let on = true; api("/api/shipments").then((r) => on && setRows(r.shipments)).catch((e) => on && setErr(e.message)); return () => { on = false; }; }, []);

  const counts = useMemo(() => { const c = {}; (rows || []).forEach((r) => { c[r.stage] = (c[r.stage] || 0) + 1; }); return c; }, [rows]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows || []).filter((r) => (scope === "ALL" || ACTIVE.has(r.stage)) && (!stageF || r.stage === stageF)
      && (!s || [r.job_number, r.pol, r.pod, r.product, r.vessel, r.bl_no, r.customer].some((v) => String(v || "").toLowerCase().includes(s))));
  }, [rows, q, scope, stageF]);

  const csv = () => downloadCsv(`genesis_shipments_${new Date().toISOString().slice(0, 10)}.csv`,
    ["Booking", "Status", "POL", "POD", "Product", "Tanks", "Depot out", "Gated in", "Sailed", "ETA", "Arrived", "Returned", "Vessel", "Voyage", "Carrier", "B/L"],
    list.map((r) => [r.job_number, (STAGE[r.stage] || [r.stage])[0], r.pol, r.pod, r.product, r.tank_count, r.depot_out, r.gate_in, r.sailed, r.eta, r.arrived, r.returned_count, r.vessel, r.voyage, r.carrier, r.bl_no]));

  if (open) return <Detail job={open} account={account} onBack={() => setOpen(null)} />;
  const tile = (stage, label, color) => <Tile label={label} value={counts[stage] || 0} color={color} on={stageF === stage} onClick={() => { setStageF(stageF === stage ? null : stage); setScope(stage === "RETURNED" ? "ALL" : scope); }} />;
  return (
    <div>
      <div className="tiles" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 14 }}>
        {tile("ON_WATER", "On water", ORANGE)}
        {tile("ARRIVED", "Arrived, not yet returned", GREEN)}
        {tile("LOADING", "Loading", AMBER)}
        {tile("ALLOCATED", "Tanks allocated", BLUE)}
        {tile("RETURNED", "Completed", DARK)}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <input style={{ ...INPUT, maxWidth: 320 }} placeholder="Search booking, port, product, vessel, B/L…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select style={{ ...INPUT, maxWidth: 180 }} value={scope} onChange={(e) => { setScope(e.target.value); setStageF(null); }}><option value="ACTIVE">Active shipments</option><option value="ALL">All, including completed</option></select>
        <div style={{ fontSize: 12, color: MUTED }}>{list.length} shipment{list.length === 1 ? "" : "s"}</div>
        <button style={{ ...BTN, marginLeft: "auto" }} onClick={csv} disabled={!list.length}>Download CSV</button>
      </div>
      {err && <Msg text={err} />}
      {!rows && !err && <div style={{ color: MUTED }}>Loading your shipments…</div>}
      {rows && !list.length && <div style={CARD}><Empty text={rows.length ? "Nothing matches the filter." : `No shipments are linked to ${account.name} yet.`} /></div>}
      {rows && list.length > 0 && (
        <div style={{ ...CARD, padding: 0, overflowX: "auto" }}>
          <table style={{ minWidth: 1000 }}>
            <thead><tr><th>Booking</th><th>Status</th><th>Progress</th><th>Route</th><th className="hide-sm">Product</th><th style={{ textAlign: "right" }}>Tanks</th><th>Depot out</th><th>Sailed</th><th>ETA / arrived</th><th>Vessel</th><th className="hide-sm">B/L</th></tr></thead>
            <tbody>{list.map((r) => (
              <tr key={r.job_number} className="row" onClick={() => setOpen(r)}>
                <td style={{ fontFamily: "monospace", fontWeight: 700 }}>{r.job_number}{account.kind === "AGENT" && r.customer ? <div style={{ fontSize: 11, color: MUTED, fontFamily: "Inter, sans-serif", fontWeight: 400 }}>{r.customer}</div> : null}{account.kind === "AGENT" && <div style={{ marginTop: 3, display: "flex", gap: 4 }}>{roleTags(r.roles).map((t) => <Pill key={t} text={(ROLE_LABEL[t] || [t])[0]} color={(ROLE_LABEL[t] || [t, MUTED])[1]} />)}</div>}</td>
                <td><Pill stage={r.stage} /></td>
                <td><Progress stage={r.stage} small /></td>
                <td className="wrap">{r.pol} → {r.pod}</td><td className="hide-sm wrap">{r.product || "—"}</td>
                <td style={{ textAlign: "right" }}>{r.tank_count}{r.tank_count < r.tanks_required ? <span style={{ color: MUTED }}> / {r.tanks_required}</span> : ""}</td>
                <td>{fmtD(r.depot_out)}</td><td>{fmtD(r.sailed)}</td>
                <td>{r.arrived ? fmtD(r.arrived) : r.eta ? <span style={{ color: MUTED }}>ETA {fmtD(r.eta)}</span> : "—"}</td>
                <td>{r.vessel || "—"}{r.voyage ? <span style={{ color: MUTED }}> {r.voyage}</span> : ""}</td>
                <td className="hide-sm" style={{ fontFamily: "monospace" }}>{r.bl_no || "—"}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
