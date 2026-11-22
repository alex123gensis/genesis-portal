// Excel upload for agents: Download template -> fill -> Upload -> preview with checks -> Save all.
import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { api } from "../api.js";
import { CARD, BTN, PRIMARY, MUTED, RED, GREEN, AMBER, Msg, fmtD, fmtDT } from "../ui.jsx";

export const TEMPLATE_COLUMNS = [
  ["Vessel", "vessel", "MSC ANNA"], ["Voyage", "voyage", "2649W"], ["Operator / line", "operator", "MSC"], ["Service", "service", "IPAK"],
  ["POL", "pol", "Nhava Sheva"], ["POD", "pod", "Jebel Ali"], ["Via", "via", ""],
  ["ETD at POL", "etd", "2026-12-02"], ["ETA at POD", "eta", "2026-12-06"],
  ["Gate-in opens", "gate_open", "2026-11-27 09:00"], ["Gate-in cut-off", "gate_cutoff", "2026-11-30 17:00"], ["Document cut-off", "doc_cutoff", "2026-11-29 17:00"],
  ["DG acceptance", "dg", "Accepted"], ["Space", "space", "Offered"], ["DG notes", "dg_notes", ""], ["Remarks", "notes", ""],
];
const DG = ["Not stated", "Accepted", "Restricted", "Not accepted"];
const SPACE = ["Offered", "Requested", "Awaiting", "Confirmed", "Full", "Closed"];

export function downloadTemplate() {
  const wb = XLSX.utils.book_new();
  const header = TEMPLATE_COLUMNS.map((c) => c[0]);
  const example = TEMPLATE_COLUMNS.map((c) => c[2]);
  const ws = XLSX.utils.aoa_to_sheet([header, example]);
  ws["!cols"] = header.map((h) => ({ wch: Math.max(14, h.length + 2) }));
  XLSX.utils.book_append_sheet(wb, ws, "Sailings");
  const notes = XLSX.utils.aoa_to_sheet([
    ["How to fill the Sailings sheet"], [""],
    ["One row per vessel option. Vessel, POL, POD and ETD are required; the rest is optional."],
    ["Dates: 2026-12-02 or 02/12/2026 or an Excel date cell. Times: 2026-11-30 17:00 (local port time)."],
    ["DG acceptance: Accepted, Restricted, Not accepted or Not stated. Space: Offered, Requested, Awaiting, Confirmed, Full or Closed."],
    ["Delete the example row before uploading. Rows with problems are shown before saving and can be fixed in the file."],
  ]);
  notes["!cols"] = [{ wch: 110 }];
  XLSX.utils.book_append_sheet(wb, notes, "Notes");
  XLSX.writeFile(wb, "genesis_sailings_template.xlsx");
}

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const HEADER_ALIASES = { vesselname: "vessel", voy: "voyage", voyageno: "voyage", line: "operator", carrier: "operator", portofloading: "pol", portofdischarge: "pod", transhipment: "via", transshipment: "via",
  etd: "etd", etdatpol: "etd", eta: "eta", etaatpod: "eta", gateinopens: "gate_open", gateopen: "gate_open", gatein: "gate_open", gateincutoff: "gate_cutoff", cutoff: "gate_cutoff", gatecutoff: "gate_cutoff",
  documentcutoff: "doc_cutoff", doccutoff: "doc_cutoff", sicutoff: "doc_cutoff", dg: "dg", dgacceptance: "dg", space: "space", dgnotes: "dg_notes", remarks: "notes", notes: "notes" };
function mapHeader(h) {
  const n = norm(h);
  for (const [label, key] of TEMPLATE_COLUMNS) if (norm(label) === n) return key;
  return HEADER_ALIASES[n] || null;
}
const pad = (n) => String(n).padStart(2, "0");
const localIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function toDate(v) {
  if (v == null || v === "") return "";
  if (v instanceof Date) return isNaN(v) ? null : localIso(v);
  if (typeof v === "number") { const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${pad(d.m)}-${pad(d.d)}` : null; }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/); if (m) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; return `${y}-${pad(m[2])}-${pad(m[1])}`; }
  const d = new Date(s); return isNaN(d) ? null : localIso(d);
}
function toDateTime(v) {
  if (v == null || v === "") return "";
  if (v instanceof Date) return isNaN(v) ? null : v.toISOString();
  if (typeof v === "number") { const d = XLSX.SSF.parse_date_code(v); return d ? new Date(d.y, d.m - 1, d.d, d.H || 0, d.M || 0).toISOString() : null; }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})/); if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).toISOString();
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})[ T](\d{1,2}):(\d{2})/); if (m) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; return new Date(+y, +m[2] - 1, +m[1], +m[4], +m[5]).toISOString(); }
  const d = toDate(s); return d ? new Date(d + "T00:00:00").toISOString() : null;
}

export function parseWorkbook(buf) {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames.find((n) => /sailing/i.test(n)) || wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
  if (!aoa.length) return { rows: [], problems: ["The sheet is empty."] };
  const keys = aoa[0].map(mapHeader);
  const missing = ["vessel", "pol", "pod", "etd"].filter((k) => !keys.includes(k));
  if (missing.length) return { rows: [], problems: [`Columns not found: ${missing.join(", ")}. Use the template headings.`] };
  const rows = [];
  aoa.slice(1).forEach((r, i) => {
    if (!r.some((v) => String(v).trim() !== "")) return;
    const row = {}; const errs = [];
    keys.forEach((k, c) => { if (k) row[k] = r[c]; });
    const out = { vessel: String(row.vessel || "").trim(), voyage: String(row.voyage || "").trim(), operator: String(row.operator || "").trim(), service: String(row.service || "").trim(),
      pol: String(row.pol || "").trim(), pod: String(row.pod || "").trim(), via: String(row.via || "").trim(), dg_notes: String(row.dg_notes || "").trim(), notes: String(row.notes || "").trim() };
    if (!out.vessel) errs.push("vessel missing"); if (!out.pol) errs.push("POL missing"); if (!out.pod) errs.push("POD missing");
    out.etd = toDate(row.etd); if (!out.etd) errs.push("ETD missing or not a date");
    out.eta = toDate(row.eta); if (out.eta === null) errs.push("ETA not a date");
    for (const k of ["gate_open", "gate_cutoff", "doc_cutoff"]) { out[k] = toDateTime(row[k]); if (out[k] === null) errs.push(`${k.replace("_", " ")} not a date/time`); }
    const dg = DG.find((x) => norm(x) === norm(row.dg)); out.dg = dg || (String(row.dg || "").trim() ? null : "Not stated"); if (out.dg === null) { errs.push(`DG "${row.dg}" not recognised`); out.dg = "Not stated"; }
    const sp = SPACE.find((x) => norm(x) === norm(row.space)); out.space = sp || "Offered";
    if (out.vessel === "MSC ANNA" && out.voyage === "2649W" && out.pol === "Nhava Sheva" && out.pod === "Jebel Ali") errs.push("this is the example row from the template");
    rows.push({ line: i + 2, row: out, errs });
  });
  return { rows, problems: [] };
}

export default function SailingsUpload({ onDone, onClose }) {
  const [parsed, setParsed] = useState(null); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null); const [result, setResult] = useState(null);
  const fileRef = useRef(null);
  const pick = async (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try { setParsed(parseWorkbook(new Uint8Array(await f.arrayBuffer()))); setMsg(null); setResult(null); } catch (x) { setMsg(`Could not read the file: ${x.message}`); }
    e.target.value = "";
  };
  const good = parsed ? parsed.rows.filter((r) => !r.errs.length) : [];
  const save = async () => {
    setBusy(true); setMsg(null);
    try { const r = await api("/api/sailings", { method: "POST", body: { rows: good.map((g) => g.row) } }); setResult(r); if (r.saved) await onDone(r.saved); }
    catch (x) { setMsg(x.message); }
    setBusy(false);
  };
  return (
    <div style={{ ...CARD, borderColor: "#F09128", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ fontWeight: 800 }}>Upload sailings from Excel</div>
        <button style={BTN} onClick={downloadTemplate}>Download template</button>
        <button style={PRIMARY} onClick={() => fileRef.current && fileRef.current.click()}>Choose Excel file</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={pick} />
        <button style={{ ...BTN, marginLeft: "auto" }} onClick={onClose}>Close</button>
      </div>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>Fill the template (one row per vessel option), delete the example row, then choose the file. Rows are checked before anything is saved.</div>
      <Msg text={msg} onClose={() => setMsg(null)} />
      {parsed && parsed.problems.map((p) => <Msg key={p} text={p} />)}
      {result && <Msg ok={!result.failed} text={`${result.saved} sailing${result.saved === 1 ? "" : "s"} saved${result.failed ? `, ${result.failed} failed` : ""}. Customers can see them now.`} />}
      {parsed && parsed.rows.length > 0 && !result && (
        <>
          <div style={{ fontSize: 13, marginBottom: 6 }}><b>{good.length}</b> of {parsed.rows.length} rows ready{parsed.rows.length - good.length ? <span style={{ color: RED }}> · {parsed.rows.length - good.length} with problems (fix in the file and upload again, or save the good rows only)</span> : null}</div>
          <div style={{ overflowX: "auto", maxHeight: 360, overflowY: "auto", border: "1px solid #e0ddd3", borderRadius: 8 }}>
            <table style={{ minWidth: 1000 }}>
              <thead><tr><th>Row</th><th>Vessel / voyage</th><th>POL</th><th>POD</th><th>ETD</th><th>ETA</th><th>Gate-in opens</th><th>Gate-in cut-off</th><th>Doc cut-off</th><th>DG</th><th>Problems</th></tr></thead>
              <tbody>{parsed.rows.map((r) => (
                <tr key={r.line} style={{ background: r.errs.length ? "#FBEAE7" : undefined }}>
                  <td style={{ color: MUTED }}>{r.line}</td><td className="wrap">{r.row.vessel}{r.row.voyage ? ` · ${r.row.voyage}` : ""}</td><td className="wrap">{r.row.pol}</td><td className="wrap">{r.row.pod}</td>
                  <td>{r.row.etd ? fmtD(r.row.etd) : "—"}</td><td>{r.row.eta ? fmtD(r.row.eta) : "—"}</td><td>{r.row.gate_open ? fmtDT(r.row.gate_open) : "—"}</td><td>{r.row.gate_cutoff ? fmtDT(r.row.gate_cutoff) : "—"}</td><td>{r.row.doc_cutoff ? fmtDT(r.row.doc_cutoff) : "—"}</td>
                  <td>{r.row.dg}</td><td className="wrap" style={{ color: r.errs.length ? RED : GREEN, fontSize: 12 }}>{r.errs.length ? r.errs.join("; ") : "OK"}</td>
                </tr>))}</tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
            <button style={PRIMARY} disabled={busy || !good.length} onClick={save}>{busy ? "Saving…" : `Save ${good.length} sailing${good.length === 1 ? "" : "s"}`}</button>
            <span style={{ fontSize: 12, color: AMBER }}>{good.length < parsed.rows.length ? "Rows with problems are skipped." : ""}</span>
          </div>
        </>
      )}
    </div>
  );
}
