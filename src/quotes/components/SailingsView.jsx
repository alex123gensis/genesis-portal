import { useEffect, useMemo, useState, useCallback } from "react";
import {
  fetchSailings, fetchRateCards, saveSailing, deleteSailing, saveRateCard, deleteRateCard,
  extractFromMessage, mergeImported, imageToDataUrl,
} from "../lib/sailingsApi.js";
import { fetchPortCountries } from "../lib/quotesApi.js";
import {
  DG_STATES, SAILING_TIMES, SPACE_STATES, SOURCES, canonPort, splitPorts, matchRateForSailing, todayIso, fmtDate, fmtMonth,
  usd, cardRate, cardDg, cardEmpty, sailingKey, rateKey, cleanRate,
} from "../lib/sailingsLogic.js";

// Sailings & Rates (13 Oct 2026, Alex) - the Genesis Sailing Board inside
// Quotes. One line per sailing; monthly rate cards on their own tab fill
// the slot rate / DG surcharge of any sailing on the same operator, route
// and month that has no rate of its own.

const INK = "#231E1E", ORANGE = "#F09128", MUTED = "#8a8578", LINE = "#e0ddd3", RED = "#C53030", GREEN = "#2E7D5B", AMBER = "#9a6200";
const INPUT = { width: "100%", padding: "8px 9px", border: "1px solid #ccc", borderRadius: 4, fontSize: 13, boxSizing: "border-box", background: "#fff" };
const LABEL = { fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: 3 };
const TH = { position: "sticky", top: 0, background: "#f7f6f2", textAlign: "left", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: MUTED, padding: "8px 10px", borderBottom: `1px solid ${LINE}`, whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" };
const TD = { padding: "8px 10px", borderBottom: `1px solid ${LINE}`, whiteSpace: "nowrap", fontSize: 12, verticalAlign: "middle" };
const MONO = { fontFamily: "Menlo, Consolas, monospace", fontSize: 11.5 };
const btn = (primary) => ({ padding: "8px 12px", border: `1px solid ${primary ? ORANGE : INK}`, borderRadius: 4, background: primary ? ORANGE : "#fff", color: primary ? "#fff" : INK, fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" });

const DG_COLOURS = { Accepted: [GREEN, "#E6F4EC"], "Not accepted": [RED, "#FBEAE7"], Restricted: [AMBER, "#FCF0D6"], "Not stated": [MUTED, "#f1efe9"] };
function DgPill({ value }) {
  const d = value || "Not stated";
  const [fg, bg] = DG_COLOURS[d] || DG_COLOURS["Not stated"];
  return <span style={{ background: bg, color: fg, padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700 }}>{d}</span>;
}
const CardTag = ({ children, title }) => (
  <span title={title} style={{ marginLeft: 6, padding: "1px 6px", borderRadius: 4, background: "#FDEBD6", color: "#9a5a12", fontSize: 10, fontWeight: 700 }}>{children}</span>
);
function Field({ label, children, full }) {
  return <div style={{ gridColumn: full ? "1 / -1" : undefined, minWidth: 0 }}><label style={LABEL}>{label}</label>{children}</div>;
}

const EMPTY_SAILING = { vessel: "", voyage: "", operator: "", service: "", pol: "", etd: "", pod: "", eta: "", via: "", cutoff: "", rotation: "", slot_rate: "", dg_surcharge: "", dg: "Not stated", dg_notes: "", space: "Offered", source: "Email", shared_by: "", received: "", notes: "" };
const EMPTY_RATE = { operator: "", month: "", pol: "", pod: "", via: "", rate20: "", rate40: "", empty20: "", empty40: "", dg: "Not stated", dg_sur20: "", dg_sur40: "", valid_till: "", equipment: "", terms: "", source: "Email", shared_by: "", received: "" };

export default function SailingsView() {
  const today = todayIso();
  const [tab, setTab] = useState("sailings"); // sailings | rates
  const [sailings, setSailings] = useState([]);
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [d1, setD1] = useState(""); const [d2, setD2] = useState("");
  const [q, setQ] = useState(""); const [op, setOp] = useState(""); const [dg, setDg] = useState("");
  const [upcoming, setUpcoming] = useState(true); const [month, setMonth] = useState("");
  const [sort, setSort] = useState({ k: "etd", dir: 1 });
  const [rSort, setRSort] = useState({ k: "month", dir: -1 });
  const [editSailing, setEditSailing] = useState(null); // row or {} for new
  const [editRate, setEditRate] = useState(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([fetchSailings(), fetchRateCards()]);
      setSailings(s); setRates(r); setError(null);
    } catch (e) { setError(e.message || String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const ops = useMemo(() => [...new Set([...sailings, ...rates].map((x) => x.operator).filter(Boolean))].sort(), [sailings, rates]);
  // One port name everywhere (26 Nov): the suggestions are the Data Master port list first; spellings already on the board come after.
  const [masterPorts, setMasterPorts] = useState([]);
  useEffect(() => { fetchPortCountries().then((r) => setMasterPorts((r || []).map((x) => String(x.port_name || "").trim().toUpperCase()).filter(Boolean))).catch(() => {}); }, []);
  const polList = useMemo(() => [...new Set([...masterPorts, ...[...sailings, ...rates].flatMap((x) => splitPorts(x.pol))])].sort(), [masterPorts, sailings, rates]);
  const podList = useMemo(() => [...new Set([...masterPorts, ...[...sailings, ...rates].flatMap((x) => splitPorts(x.pod))])].sort(), [masterPorts, sailings, rates]);
  const months = useMemo(() => [...new Set(rates.map((c) => c.month).filter(Boolean))].sort().reverse(), [rates]);
  const matched = useMemo(() => new Map(sailings.map((s) => [s.id, s.slot_rate ? null : matchRateForSailing(s, rates, today)])), [sailings, rates, today]);

  const has = (t, x) => String(t || "").toLowerCase().includes(x);
  const F = canonPort(from), T = canonPort(to), Q = q.trim().toLowerCase();

  const sailRows = useMemo(() => {
    const v = sailings.filter((s) => (!upcoming || !s.etd || s.etd >= today)
      && (!F || has(s.pol, F) || has(s.rotation, F)) && (!T || has(s.pod, T) || has(s.via, T) || has(s.rotation, T) || has(s.notes, T))
      && (!d1 || (s.etd && s.etd >= d1)) && (!d2 || (s.etd && s.etd <= d2)) && (!op || s.operator === op)
      && (!dg || (s.dg || "Not stated") === dg) && (!Q || Object.values(s).some((x) => has(x, Q))));
    return v.sort((a, b) => {
      const A = String(a[sort.k] ?? ""), B = String(b[sort.k] ?? "");
      if (!A && B) return 1; if (A && !B) return -1;
      return sort.dir * A.localeCompare(B, undefined, { numeric: true }) || String(a.etd || "9999").localeCompare(String(b.etd || "9999"));
    });
  }, [sailings, upcoming, today, F, T, d1, d2, op, dg, Q, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const rateRows = useMemo(() => {
    const v = rates.filter((c) => (!month || c.month === month) && (!op || c.operator === op)
      && (!F || !c.pol || has(c.pol, F)) && (!T || !c.pod || has(c.pod, T) || has(c.via, T))
      && (!dg || (c.dg || "Not stated") === dg) && (!Q || Object.values(c).some((x) => has(x, Q))));
    return v.sort((a, b) => {
      const A = String(a[rSort.k] ?? ""), B = String(b[rSort.k] ?? "");
      if (!A && B) return 1; if (A && !B) return -1;
      return rSort.dir * A.localeCompare(B, undefined, { numeric: true }) || String(a.operator).localeCompare(String(b.operator));
    });
  }, [rates, month, op, F, T, dg, Q, rSort]); // eslint-disable-line react-hooks/exhaustive-deps

  const up = sailings.filter((s) => !s.etd || s.etd >= today);
  const kpis = [
    ["Upcoming sailings", up.length, INK],
    ["DG not accepted", up.filter((s) => s.dg === "Not accepted").length, RED],
    ["Slot rate missing", up.filter((s) => !s.slot_rate && !matched.get(s.id)).length, AMBER],
    ["Rate cards this month", rates.filter((c) => c.month === today.slice(0, 7)).length, INK],
  ];
  const clear = () => { setFrom(""); setTo(""); setD1(""); setD2(""); setQ(""); setOp(""); setDg(""); setMonth(""); };

  if (loading) return <div>Loading sailings…</div>;
  if (error) return <div style={{ background: "#FBEAE7", border: `1px solid ${RED}`, borderRadius: 6, padding: 12, color: RED }}>{error}</div>;

  const head = (cols, s, setS) => (
    <tr>{cols.map(([k, t]) => (
      <th key={k} style={{ ...TH, color: s.k === k ? INK : MUTED }} onClick={() => k && setS((p) => (p.k === k ? { k, dir: -p.dir } : { k, dir: 1 }))}>
        {t}{s.k === k ? (s.dir > 0 ? " ↑" : " ↓") : ""}
      </th>
    ))}</tr>
  );

  return (
    <div>
      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", border: `1px solid ${LINE}`, borderRadius: 6, background: "#fff", marginBottom: 12 }}>
        {kpis.map(([label, n, c], i) => (
          <div key={label} style={{ padding: "10px 14px", borderLeft: i ? `1px solid ${LINE}` : "none" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: c }}>{n}</div>
            <div style={{ ...LABEL, marginBottom: 0 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Route finder */}
      <div style={{ border: `1px solid ${LINE}`, borderRadius: 6, background: "#fff", padding: 12, marginBottom: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr)", gap: 8, alignItems: "end" }}>
          <Field label="From (POL)"><input list="sl-pol" style={INPUT} value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Any port, e.g. NSA" /></Field>
          <button title="Swap" onClick={() => { setFrom(to); setTo(from); }} style={{ ...btn(false), padding: "8px 10px", borderRadius: 20 }}>⇄</button>
          <Field label="To (POD)"><input list="sl-pod" style={INPUT} value={to} onChange={(e) => setTo(e.target.value)} placeholder="Any port, e.g. JEA" /></Field>
        </div>
        <datalist id="sl-pol">{polList.map((p) => <option key={p} value={p} />)}</datalist>
        <datalist id="sl-pod">{podList.map((p) => <option key={p} value={p} />)}</datalist>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "end", marginTop: 8 }}>
          <Field label="Sailing from"><input type="date" style={INPUT} value={d1} onChange={(e) => setD1(e.target.value)} /></Field>
          <Field label="Sailing to"><input type="date" style={INPUT} value={d2} onChange={(e) => setD2(e.target.value)} /></Field>
          <button onClick={clear} style={{ ...btn(false), border: "none", color: MUTED }}>Clear</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 10, paddingTop: 10, borderTop: `1px solid ${LINE}` }}>
          <input style={{ ...INPUT, flex: "1 1 200px", width: "auto" }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search vessel, operator, remarks…" />
          <select style={{ ...INPUT, width: "auto" }} value={op} onChange={(e) => setOp(e.target.value)}>
            <option value="">All operators</option>{ops.map((o) => <option key={o}>{o}</option>)}
          </select>
          <select style={{ ...INPUT, width: "auto" }} value={dg} onChange={(e) => setDg(e.target.value)}>
            <option value="">All DG</option>{DG_STATES.map((d) => <option key={d}>{d}</option>)}
          </select>
          {tab === "sailings"
            ? <label style={{ fontSize: 12, color: MUTED, display: "flex", gap: 5, alignItems: "center" }}><input type="checkbox" checked={upcoming} onChange={(e) => setUpcoming(e.target.checked)} /> Upcoming only</label>
            : <select style={{ ...INPUT, width: "auto" }} value={month} onChange={(e) => setMonth(e.target.value)}>
                <option value="">All months</option>{months.map((m) => <option key={m} value={m}>{fmtMonth(m)}</option>)}
              </select>}
        </div>
      </div>

      {/* Tabs + actions */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 8 }}>
        {[["sailings", `Sailings (${sailings.length})`], ["rates", `Monthly rate cards (${rates.length})`]].map(([k, t]) => (
          <button key={k} onClick={() => setTab(k)} style={{ ...btn(false), background: tab === k ? INK : "#fff", color: tab === k ? "#fff" : INK }}>{t}</button>
        ))}
        <span style={{ flex: 1 }} />
        <button style={btn(true)} onClick={() => setImporting(true)}>⬇ Import from mail / WhatsApp</button>
        <button style={btn(false)} onClick={() => (tab === "sailings" ? setEditSailing({ ...EMPTY_SAILING, received: today }) : setEditRate({ ...EMPTY_RATE, month: today.slice(0, 7), received: today }))}>
          + Add {tab === "sailings" ? "sailing" : "rate card"}
        </button>
      </div>
      <div style={{ fontSize: 11, color: MUTED, marginBottom: 6 }}>
        {tab === "sailings" ? `${sailRows.length} of ${sailings.length} sailings` : `${rateRows.length} of ${rates.length} rate cards`}
        {(from || to) ? ` · ${from || "Any"} → ${to || "Any"}` : ""}
      </div>

      <div style={{ overflowX: "auto", border: `1px solid ${LINE}`, borderRadius: 6, background: "#fff" }}>
        {tab === "sailings" ? (
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1100 }}>
            <thead>{head([["pol", "POL"], ["pod", "POD"], ["via", "Via"], ["vessel", "Vessel"], ["voyage", "Voy"], ["etd", "ETD"], ["eta", "ETA"], ["cutoff", "Cut-off"], ["operator", "Operator"], ["slot_rate", "Slot rate (USD)"], ["dg", "DG"], ["dg_surcharge", "DG surch."], ["space", "Space"], ["portal_published", "Portal"], ["received", "Source"], ["notes", "Remarks"]], sort, setSort)}</thead>
            <tbody>
              {sailRows.map((s) => {
                const c = matched.get(s.id);
                const past = s.etd && s.etd < today;
                const remarks = [s.dg_notes, s.rotation, s.notes].filter(Boolean).join(" · ");
                let dgVal = s.dg || "Not stated", dgCard = false;
                if (dgVal === "Not stated" && c && c.dg && c.dg !== "Not stated") { dgVal = c.dg; dgCard = true; }
                return (
                  <tr key={s.id} onClick={() => setEditSailing(s)} style={{ cursor: "pointer", color: past ? "#aaa" : undefined }}>
                    <td style={{ ...TD, fontWeight: 700 }}>{s.pol || "—"}</td>
                    <td style={{ ...TD, fontWeight: 700, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }} title={s.pod}>{s.pod || "—"}</td>
                    <td style={TD}>{s.via || "—"}</td>
                    <td style={{ ...TD, fontWeight: 700 }}>{s.vessel}</td>
                    <td style={{ ...TD, ...MONO }}>{s.voyage || "—"}</td>
                    <td style={{ ...TD, ...MONO }}>{s.etd ? fmtDate(s.etd) : <span style={{ color: MUTED }}>TBA</span>}</td>
                    <td style={{ ...TD, ...MONO, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }} title={s.eta}>{s.eta || "—"}</td>
                    <td style={{ ...TD, ...MONO, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }} title={s.cutoff}>{s.cutoff || "—"}</td>
                    <td style={{ ...TD, maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis" }}>{s.operator || "—"}</td>
                    <td style={{ ...TD, ...MONO }}>
                      {s.slot_rate || (c ? <>{cardRate(c)}<CardTag title={`${c.operator} rate card, ${fmtMonth(c.month)}`}>{c.operator} {fmtMonth(c.month).slice(0, 3)} card</CardTag></>
                        : <span style={{ border: `1px dashed ${AMBER}`, color: AMBER, borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>Add rate</span>)}
                    </td>
                    <td style={TD}><DgPill value={dgVal} />{dgCard && <CardTag>card</CardTag>}</td>
                    <td style={{ ...TD, ...MONO }}>{s.dg_surcharge || (c && cardDg(c) ? <>{cardDg(c)}<CardTag>card</CardTag></> : "—")}</td>
                    <td style={{ ...TD, fontWeight: 700, color: s.space === "Confirmed" ? GREEN : ["Requested", "Awaiting"].includes(s.space) ? AMBER : undefined }}>{s.space || "—"}</td>
                    <td style={TD}>{s.portal_published ? <span style={{ background: GREEN, color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 10, fontWeight: 700 }} title={s.portal_account_id ? `Entered through the portal by ${s.portal_entered_by || "an agent"}` : "Published to the customer portal"}>{s.portal_account_id ? "AGENT" : "SHOWN"}</span> : <span style={{ color: MUTED }}>—</span>}</td>
                    <td style={TD}>{[s.source, s.received ? fmtDate(s.received) : ""].filter(Boolean).join(" · ")}</td>
                    <td style={{ ...TD, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", color: MUTED }} title={remarks}>{remarks}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1100 }}>
            <thead>{head([["month", "Month"], ["operator", "Operator"], ["pol", "POL"], ["pod", "POD"], ["via", "Via"], ["rate20", "20' (USD)"], ["rate40", "40' (USD)"], ["empty20", "Empty (USD)"], ["dg", "DG"], ["dg_sur20", "DG surch."], ["valid_till", "Valid till"], ["", "Sailings matched"], ["terms", "Terms"]], rSort, setRSort)}</thead>
            <tbody>
              {rateRows.map((c) => {
                const n = sailings.filter((s) => matched.get(s.id) === c).length;
                return (
                  <tr key={c.id} onClick={() => setEditRate(c)} style={{ cursor: "pointer", color: c.month && c.month < today.slice(0, 7) ? "#aaa" : undefined }}>
                    <td style={{ ...TD, fontWeight: 700 }}>{fmtMonth(c.month)}</td>
                    <td style={{ ...TD, fontWeight: 700 }}>{c.operator}</td>
                    <td style={TD}>{c.pol || "Any"}</td>
                    <td style={{ ...TD, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>{c.pod || "Any"}</td>
                    <td style={TD}>{c.via || "—"}</td>
                    <td style={{ ...TD, ...MONO }}>{usd(c.rate20) || "—"}</td>
                    <td style={{ ...TD, ...MONO }}>{usd(c.rate40) || "—"}</td>
                    <td style={{ ...TD, ...MONO }}>{cardEmpty(c) || "—"}</td>
                    <td style={TD}><DgPill value={c.dg} /></td>
                    <td style={{ ...TD, ...MONO }}>{cardDg(c) || "—"}</td>
                    <td style={{ ...TD, ...MONO }}>{c.valid_till ? fmtDate(c.valid_till) : "—"}</td>
                    <td style={{ ...TD, fontWeight: 700, color: n ? ORANGE : "#bbb" }}>{n}</td>
                    <td style={{ ...TD, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", color: MUTED }} title={c.terms}>{c.terms}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {(tab === "sailings" ? sailRows : rateRows).length === 0 && (
          <div style={{ padding: 30, textAlign: "center", color: MUTED, fontSize: 13 }}>
            {(tab === "sailings" ? sailings : rates).length ? "Nothing matches these filters. Try another port, widen the dates, or Clear." : "Nothing here yet. Use Import to add from an email, WhatsApp message or screenshot."}
          </div>
        )}
      </div>
      <p style={{ fontSize: 11, color: MUTED }}>Rate cards fill the slot rate and DG surcharge of sailings on the same operator, route and month that have no rate of their own (shown with a "card" tag). Schedules are as received and subject to change by the carrier.</p>

      {editSailing && <SailingForm row={editSailing} ops={ops} card={editSailing.id ? matched.get(editSailing.id) : null} onClose={() => setEditSailing(null)} onSaved={async () => { setEditSailing(null); await load(); }} />}
      {editRate && <RateForm row={editRate} ops={ops} onClose={() => setEditRate(null)} onSaved={async () => { setEditRate(null); await load(); }} />}
      {importing && <ImportPanel existing={{ sailings, rates }} onClose={() => setImporting(false)} onSaved={async () => { setImporting(false); await load(); }} />}
    </div>
  );
}

// ---- Drawers ----
function Drawer({ title, children, onClose }) {
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, background: "rgba(20,20,20,.45)", display: "flex", justifyContent: "flex-end", zIndex: 50 }}>
      <div style={{ background: "#f7f6f2", width: "min(560px, 100%)", height: "100%", overflow: "auto", padding: 18, boxSizing: "border-box" }}>
        <div style={{ fontWeight: 700, fontSize: 17, color: INK, marginBottom: 12 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

const toLocalInput = (iso) => { const d = new Date(iso); if (isNaN(d)) return ""; const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
function useFormState(row) {
  const [f, setF] = useState(() => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v == null ? "" : (SAILING_TIMES.has(k) && typeof v === "string" && v.length > 16 ? toLocalInput(v) : v)])));
  const bind = (k) => ({ value: f[k] ?? "", onChange: (e) => setF((p) => ({ ...p, [k]: e.target.value })) });
  return [f, bind];
}
function FormActions({ isNew, busy, err, onDelete, onClose }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      {err && <div style={{ color: RED, fontSize: 12, marginTop: 10 }}>{err}</div>}
      {confirm && (
        <div style={{ background: "#FBEAE7", color: RED, padding: 10, borderRadius: 4, marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          Delete this for everyone?
          <button type="button" style={{ ...btn(false), borderColor: RED, color: RED }} onClick={onDelete}>Delete</button>
          <button type="button" style={btn(false)} onClick={() => setConfirm(false)}>Keep</button>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 14 }}>
        {!isNew ? <button type="button" style={{ ...btn(false), borderColor: RED, color: RED }} onClick={() => setConfirm(true)}>Delete</button> : <span />}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" style={btn(false)} onClick={onClose}>Cancel</button>
          <button type="submit" style={btn(true)} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </>
  );
}

function SailingForm({ row, ops, card, onClose, onSaved }) {
  const [f, bind] = useFormState(row);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const submit = async (e) => {
    e.preventDefault(); if (!f.vessel.trim()) { setErr("Vessel name is needed."); return; }
    setBusy(true); setErr(null);
    try { await saveSailing(row.id, f); await onSaved(); } catch (x) { setErr(x.message || String(x)); setBusy(false); }
  };
  const del = async () => { try { await deleteSailing(row.id); await onSaved(); } catch (x) { setErr(x.message || String(x)); } };
  const G = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 };
  return (
    <Drawer title={row.id ? `${row.vessel}${row.voyage ? ` · ${row.voyage}` : ""}` : "Add sailing"} onClose={onClose}>
      <form onSubmit={submit} style={G}>
        <Field label="Vessel"><input style={INPUT} {...bind("vessel")} /></Field>
        <Field label="Voyage"><input style={INPUT} {...bind("voyage")} /></Field>
        <Field label="Operator / line"><input style={INPUT} list="sl-ops" {...bind("operator")} /></Field>
        <Field label="Service"><input style={INPUT} {...bind("service")} /></Field>
        <Field label="POL"><input style={INPUT} {...bind("pol")} /></Field>
        <Field label="ETD at POL"><input type="date" style={INPUT} {...bind("etd")} /></Field>
        <Field label="POD"><input style={INPUT} {...bind("pod")} /></Field>
        <Field label="ETA at POD"><input style={INPUT} {...bind("eta")} placeholder="02-Nov-26" /></Field>
        <Field label="Via / transship"><input style={INPUT} {...bind("via")} /></Field>
        <Field label="Cut-off"><input style={INPUT} {...bind("cutoff")} /></Field>
        <Field label="Port rotation" full><input style={INPUT} {...bind("rotation")} placeholder="NSA 26 Oct · Kandla 31 Oct · Jeddah 18 Nov" /></Field>
        <Field label={card && !f.slot_rate ? "Slot rate (USD) - from rate card" : "Slot rate (USD)"}>
          <input style={{ ...INPUT, background: "#FFF6EC", borderColor: ORANGE }} {...bind("slot_rate")} placeholder={card ? `${cardRate(card)} (${card.operator} ${fmtMonth(card.month)} card)` : "e.g. USD 1350 / 20'"} />
          {card && !f.slot_rate && <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>No rate of its own - the board shows the {card.operator} {fmtMonth(card.month)} rate card ({cardRate(card)}). Type here only if this sailing has a different rate.</div>}
        </Field>
        <Field label="DG surcharge (USD)"><input style={INPUT} {...bind("dg_surcharge")} placeholder={card && cardDg(card) ? `${cardDg(card)} (rate card)` : ""} /></Field>
        <Field label="DG acceptance"><select style={INPUT} {...bind("dg")}>{DG_STATES.map((d) => <option key={d}>{d}</option>)}</select></Field>
        <Field label="Space"><select style={INPUT} {...bind("space")}>{SPACE_STATES.map((d) => <option key={d}>{d}</option>)}</select></Field>
        <Field label="DG notes" full><input style={INPUT} {...bind("dg_notes")} /></Field>
        <Field label="Source"><select style={INPUT} {...bind("source")}>{SOURCES.map((d) => <option key={d}>{d}</option>)}</select></Field>
        <Field label="Shared by"><input style={INPUT} {...bind("shared_by")} /></Field>
        <Field label="Received"><input type="date" style={INPUT} {...bind("received")} /></Field>
        <Field label="Notes / terms" full><textarea style={{ ...INPUT, minHeight: 60, fontFamily: "inherit" }} {...bind("notes")} /></Field>
        <div style={{ gridColumn: "1 / -1", borderTop: `1px solid ${LINE}`, paddingTop: 8, fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Customer portal{row.portal_account_id ? ` · entered by ${row.portal_entered_by || "an agent"} through the portal` : ""}
        </div>
        <Field label="Show in customer portal"><label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "7px 0" }}>
          <input type="checkbox" checked={f.portal_published === true || f.portal_published === "true"} onChange={(e) => bind("portal_published").onChange({ target: { value: e.target.checked } })} /> Published (customers and agents see this sailing)</label></Field>
        <Field label="ETA at POD (date, for the portal)"><input type="date" style={INPUT} {...bind("eta_date")} /></Field>
        <Field label="Gate-in opens (POL)"><input type="datetime-local" style={INPUT} {...bind("gate_open")} /></Field>
        <Field label="Gate-in cut-off (POL)"><input type="datetime-local" style={INPUT} {...bind("gate_cutoff")} /></Field>
        <Field label="Document cut-off"><input type="datetime-local" style={INPUT} {...bind("doc_cutoff")} /></Field>
        <datalist id="sl-ops">{ops.map((o) => <option key={o} value={o} />)}</datalist>
        <div style={{ gridColumn: "1 / -1" }}><FormActions isNew={!row.id} busy={busy} err={err} onDelete={del} onClose={onClose} /></div>
      </form>
    </Drawer>
  );
}

function RateForm({ row, ops, onClose, onSaved }) {
  const [f, bind] = useFormState(row);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const submit = async (e) => {
    e.preventDefault(); if (!f.operator.trim()) { setErr("Operator is needed."); return; }
    setBusy(true); setErr(null);
    try { await saveRateCard(row.id, f); await onSaved(); } catch (x) { setErr(x.message || String(x)); setBusy(false); }
  };
  const del = async () => { try { await deleteRateCard(row.id); await onSaved(); } catch (x) { setErr(x.message || String(x)); } };
  const hl = { ...INPUT, background: "#FFF6EC", borderColor: ORANGE };
  return (
    <Drawer title={row.id ? `${row.operator} · ${fmtMonth(row.month)}` : "Add rate card"} onClose={onClose}>
      <form onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Operator / line"><input style={INPUT} list="sl-ops2" {...bind("operator")} /></Field>
        <Field label="Month"><input type="month" style={INPUT} {...bind("month")} /></Field>
        <Field label="POL"><input style={INPUT} {...bind("pol")} /></Field>
        <Field label="POD"><input style={INPUT} {...bind("pod")} /></Field>
        <Field label="Via / transship"><input style={INPUT} {...bind("via")} /></Field>
        <Field label="Valid till"><input type="date" style={INPUT} {...bind("valid_till")} /></Field>
        <Field label="Rate 20' (USD)"><input style={hl} inputMode="decimal" {...bind("rate20")} /></Field>
        <Field label="Rate 40' (USD)"><input style={hl} inputMode="decimal" {...bind("rate40")} /></Field>
        <Field label="Empty 20' (USD)"><input style={INPUT} inputMode="decimal" {...bind("empty20")} /></Field>
        <Field label="Empty 40' (USD)"><input style={INPUT} inputMode="decimal" {...bind("empty40")} /></Field>
        <Field label="DG acceptance"><select style={INPUT} {...bind("dg")}>{DG_STATES.map((d) => <option key={d}>{d}</option>)}</select></Field>
        <Field label="Equipment"><input style={INPUT} {...bind("equipment")} placeholder="SOC ISO tank" /></Field>
        <Field label="DG surcharge 20' (USD)"><input style={INPUT} inputMode="decimal" {...bind("dg_sur20")} /></Field>
        <Field label="DG surcharge 40' (USD)"><input style={INPUT} inputMode="decimal" {...bind("dg_sur40")} /></Field>
        <Field label="Source"><select style={INPUT} {...bind("source")}>{SOURCES.map((d) => <option key={d}>{d}</option>)}</select></Field>
        <Field label="Shared by"><input style={INPUT} {...bind("shared_by")} /></Field>
        <Field label="Terms / remarks" full><textarea style={{ ...INPUT, minHeight: 60, fontFamily: "inherit" }} {...bind("terms")} /></Field>
        <datalist id="sl-ops2">{ops.map((o) => <option key={o} value={o} />)}</datalist>
        <div style={{ gridColumn: "1 / -1" }}><FormActions isNew={!row.id} busy={busy} err={err} onDelete={del} onClose={onClose} /></div>
      </form>
    </Drawer>
  );
}

function ImportPanel({ existing, onClose, onSaved }) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]); // { name, url }
  const [source, setSource] = useState("WhatsApp");
  const [by, setBy] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState(null); // { sailings, rates }
  const [ticks, setTicks] = useState({});

  const addFiles = async (list) => {
    const imgs = [...list].filter((f) => f.type.startsWith("image/"));
    for (const f of imgs) {
      if (files.length >= 6) { setStatus("Up to 6 screenshots per import."); break; }
      try { const url = await imageToDataUrl(f); setFiles((p) => (p.length >= 6 ? p : [...p, { name: f.name || "screenshot", url }])); }
      catch (e) { setStatus(e.message); }
    }
  };
  const read = async () => {
    if (!text.trim() && !files.length) { setStatus("Paste a message or add a screenshot first."); return; }
    setBusy(true); setStatus("Reading with Claude…"); setFound(null);
    try {
      const out = await extractFromMessage(text, files.map((f) => f.url));
      setFound(out);
      const t = {}; out.sailings.forEach((_, i) => { t[`s${i}`] = true; }); out.rates.forEach((_, i) => { t[`r${i}`] = true; });
      setTicks(t); setStatus("");
    } catch (e) { setStatus(e.message || String(e)); }
    finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true);
    try {
      const pick = (arr, p) => arr.filter((_, i) => ticks[`${p}${i}`]);
      const r = await mergeImported({ sailings: pick(found.sailings, "s"), rates: pick(found.rates, "r") }, existing,
        { source, sharedBy: by.trim(), received: todayIso() });
      setStatus(`${r.added} added, ${r.updated} updated`);
      await onSaved();
    } catch (e) { setStatus(e.message || String(e)); setBusy(false); }
  };
  const exS = new Set(existing.sailings.map(sailingKey));
  const exR = new Set(existing.rates.map(rateKey));
  const tick = (k) => setTicks((p) => ({ ...p, [k]: !p[k] }));
  const card = { display: "grid", gridTemplateColumns: "auto 1fr", gap: 8, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 6, padding: 10, marginBottom: 6, cursor: "pointer" };
  const tag = { fontSize: 10, fontWeight: 700, color: ORANGE, textTransform: "uppercase", letterSpacing: "0.05em" };

  return (
    <Drawer title="Import schedules & rates" onClose={onClose}>
      <p style={{ fontSize: 12, color: MUTED, marginTop: 0 }}>Paste an email or WhatsApp message and/or add screenshots. Claude sorts what it finds into sailings and monthly rate cards for you to check before saving. Matching rows are updated, not duplicated.</p>
      <label style={LABEL}>Pasted text</label>
      <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ ...INPUT, minHeight: 130, fontFamily: "inherit" }}
        placeholder="Paste the email body or WhatsApp message. You can also paste a screenshot straight in here."
        onPaste={(e) => { const imgs = [...(e.clipboardData?.files || [])]; if (imgs.some((f) => f.type.startsWith("image/"))) { e.preventDefault(); addFiles(imgs); } }} />
      <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
        style={{ border: `1.5px dashed ${LINE}`, borderRadius: 6, padding: 12, marginTop: 8, background: "#fff" }}>
        <input type="file" accept="image/*" multiple onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>Choose screenshots or drop them here (up to 6)</div>
        {files.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {files.map((f, i) => (
              <div key={i} style={{ position: "relative", width: 72, height: 72, border: `1px solid ${LINE}`, borderRadius: 4, overflow: "hidden" }}>
                <img src={f.url} alt={f.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <button onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} style={{ position: "absolute", top: 2, right: 2, border: "none", background: INK, color: "#fff", borderRadius: 3, fontSize: 10, cursor: "pointer" }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <Field label="Received via"><select style={INPUT} value={source} onChange={(e) => setSource(e.target.value)}>{SOURCES.map((d) => <option key={d}>{d}</option>)}</select></Field>
        <Field label="Shared by"><input style={INPUT} value={by} onChange={(e) => setBy(e.target.value)} placeholder="Name or email of sender" /></Field>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 12 }}>
        <span style={{ fontSize: 12, color: MUTED }}>{status}</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btn(false)} onClick={onClose}>Close</button>
          <button style={btn(true)} onClick={read} disabled={busy}>Read message</button>
        </div>
      </div>

      {found && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            Found {found.sailings.length} sailing{found.sailings.length === 1 ? "" : "s"} and {found.rates.length} rate card{found.rates.length === 1 ? "" : "s"} — tick what to keep
          </div>
          {found.sailings.map((s, i) => (
            <label key={`s${i}`} style={card}>
              <input type="checkbox" checked={!!ticks[`s${i}`]} onChange={() => tick(`s${i}`)} />
              <div>
                <div style={tag}>Sailing · {exS.has(sailingKey(s)) ? "updates existing" : "new"}</div>
                <div style={{ fontWeight: 700 }}>{s.vessel}{s.voyage ? ` · ${s.voyage}` : ""}</div>
                <div style={{ fontSize: 12 }}>{s.pol || "—"} {s.etd ? fmtDate(s.etd) : ""} → {s.pod || "—"} {s.eta || ""}{s.via ? ` · via ${s.via}` : ""}</div>
                <div style={{ fontSize: 11, color: MUTED }}>{s.operator || "Operator ?"} · DG {s.dg || "Not stated"}{s.slot_rate ? ` · ${s.slot_rate}` : ""}</div>
              </div>
            </label>
          ))}
          {found.rates.map((c, i) => {
            const cc = cleanRate(c);
            return (
              <label key={`r${i}`} style={card}>
                <input type="checkbox" checked={!!ticks[`r${i}`]} onChange={() => tick(`r${i}`)} />
                <div>
                  <div style={tag}>Rate card · {exR.has(rateKey(cc)) ? "updates existing" : "new"}</div>
                  <div style={{ fontWeight: 700 }}>{c.operator} · {fmtMonth(cc.month)}</div>
                  <div style={{ fontSize: 12 }}>{c.pol || "Any"} → {c.pod || "Any"}{c.via ? ` · via ${c.via}` : ""}</div>
                  <div style={{ fontSize: 11, color: MUTED }}>{cardRate(cc) || "No rate"} · DG {cc.dg}{cardDg(cc) ? ` +${cardDg(cc)}` : ""}</div>
                </div>
              </label>
            );
          })}
          {(found.sailings.length + found.rates.length) > 0 && (
            <button style={{ ...btn(true), width: "100%", marginTop: 6 }} onClick={save} disabled={busy}>Add to Sailings &amp; Rates</button>
          )}
        </div>
      )}
    </Drawer>
  );
}
