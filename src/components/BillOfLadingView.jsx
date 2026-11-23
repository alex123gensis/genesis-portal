// Bill of lading on a booking. Agent: draft, submit, issue. Customer: review, approve or ask for changes. Both: preview / print.
import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { buildBillOfLadingHTML, blFileName } from "../lib/blDocument.js";
import { openForPrint, downloadHtml } from "../lib/printHtml.js";
import { CARD, INPUT, BTN, PRIMARY, DANGER, MUTED, ORANGE, GREEN, RED, AMBER, BLUE, DARK, LINE, Field, Pill, Msg, fmtDT } from "../ui.jsx";

const STAGES = ["DRAFT", "SUBMITTED", "APPROVED", "ISSUED"];
const STAGE_LABEL = { DRAFT: ["Draft", MUTED], SUBMITTED: ["Waiting for customer approval", AMBER], APPROVED: ["Approved by customer", GREEN], CHANGES_REQUESTED: ["Changes requested", RED], ISSUED: ["Issued", DARK] };
const FIELDS = [
  ["shipperText", "Shipper", "area"], ["consignee", "Consignee", "area"], ["notifyParty", "Notify party", "area"],
  ["pol", "Port of loading"], ["pod", "Port of discharge"], ["placeOfReceipt", "Place of receipt"], ["placeOfDelivery", "Place of delivery"],
  ["vesselName", "Vessel"], ["voyageNo", "Voyage"], ["carrier", "Carrier"], ["sailingDate", "Sailing date", "date"],
  ["routing", "Routing", "select", ["Direct", "Transhipment"]], ["transhipmentPort", "Transhipment port"], ["transhipmentVesselName", "T/S vessel"], ["transhipmentVoyageNo", "T/S voyage"],
  ["productDG", "Product / UN / class"], ["cargoDescription", "Cargo description (as printed)", "area"],
  ["termsCode", "Terms", "select", ["CY TO FO", "CY TO CY", "FO TO FO", "DOOR TO DOOR"]], ["freightPrepaidCollect", "Freight", "select", ["PREPAID", "COLLECT"]],
  ["numberOfOriginals", "Originals", "select", ["THREE (3)", "ONE (1)", "ZERO (0) - SEAWAY BILL"]], ["forwardingAgent", "Forwarding agent"],
  ["placeOfIssue", "Place of issue"], ["dateOfIssue", "Date of issue", "date"], ["mblNo", "Master B/L no."],
  ["deliveryContactName", "Delivery contact"], ["deliveryContactAddress", "Delivery address", "area"],
  ["excessValueDeclaration", "Excess value declaration"], ["specialRemarks", "Special remarks", "area"],
];

function Progress({ stage }) {
  const idx = stage === "CHANGES_REQUESTED" ? 0 : STAGES.indexOf(stage);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 12 }}>
      {STAGES.map((s, i) => (
        <div key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ padding: "3px 9px", borderRadius: 10, fontWeight: 700, background: i <= idx ? (i === idx ? ORANGE : GREEN) : "#e5e1d8", color: i <= idx ? "#fff" : "#888" }}>{["Draft", "Submitted", "Customer approved", "Issued"][i]}</span>
          {i < STAGES.length - 1 && <span style={{ color: "#bbb" }}>&rsaquo;</span>}
        </div>
      ))}
    </div>
  );
}

function Containers({ rows, tanks, onChange, readOnly }) {
  const set = (i, k, v) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const add = (no = "") => onChange([...rows, { containerNo: no, sealNo: "", netWeight: "", grossWeight: "" }]);
  const missing = (tanks || []).filter((t) => !rows.some((r) => String(r.containerNo || "").toUpperCase() === t));
  return (
    <div>
      <table style={{ marginBottom: 8 }}>
        <thead><tr><th>Container</th><th>Seal no.</th><th>Net weight (kg)</th><th>Gross weight (kg)</th>{!readOnly && <th />}</tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i}>
            <td>{readOnly ? <b style={{ fontFamily: "monospace" }}>{r.containerNo}</b> : <input style={{ ...INPUT, fontFamily: "monospace" }} value={r.containerNo || ""} onChange={(e) => set(i, "containerNo", e.target.value.toUpperCase())} />}</td>
            <td>{readOnly ? r.sealNo || "—" : <input style={INPUT} value={r.sealNo || ""} onChange={(e) => set(i, "sealNo", e.target.value)} />}</td>
            <td>{readOnly ? r.netWeight || "—" : <input style={INPUT} inputMode="decimal" value={r.netWeight ?? ""} onChange={(e) => set(i, "netWeight", e.target.value)} />}</td>
            <td>{readOnly ? r.grossWeight || "—" : <input style={INPUT} inputMode="decimal" value={r.grossWeight ?? ""} onChange={(e) => set(i, "grossWeight", e.target.value)} />}</td>
            {!readOnly && <td><button style={{ ...DANGER, padding: "4px 8px", fontSize: 11 }} onClick={() => onChange(rows.filter((_, j) => j !== i))}>Remove</button></td>}
          </tr>))}
          {!rows.length && <tr><td colSpan={5} style={{ color: MUTED }}>No containers yet.</td></tr>}
        </tbody>
      </table>
      {!readOnly && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {missing.map((t) => <button key={t} style={{ ...BTN, padding: "4px 9px", fontSize: 11 }} onClick={() => add(t)}>+ {t}</button>)}
          <button style={{ ...BTN, padding: "4px 9px", fontSize: 11 }} onClick={() => add("")}>+ Other container</button>
        </div>
      )}
    </div>
  );
}

export default function BillOfLadingView({ job, account }) {
  const [data, setData] = useState(null); const [err, setErr] = useState(null); const [msg, setMsg] = useState(null);
  const [form, setForm] = useState(null); const [rows, setRows] = useState([]); const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState(""); const [issueNo, setIssueNo] = useState("");
  const load = useCallback(async () => {
    try { const d = await api(`/api/bl?job=${encodeURIComponent(job.job_number)}`); setData(d); setErr(null);
      if (d.bl) { const f = {}; FIELDS.forEach(([k]) => { f[k] = d.bl[k] ?? ""; }); setForm(f); setRows(d.containers || []); setIssueNo(d.bl.blNumber || ""); }
    } catch (e) { setErr(e.message); }
  }, [job.job_number]);
  useEffect(() => { load(); }, [load]);

  const post = async (body, okMsg) => {
    setBusy(true); setMsg(null);
    try { const d = await api("/api/bl", { method: "POST", body: { job: job.job_number, ...body } }); setData(d);
      if (d.bl) { const f = {}; FIELDS.forEach(([k]) => { f[k] = d.bl[k] ?? ""; }); setForm(f); setRows(d.containers || []); setIssueNo(d.bl.blNumber || ""); }
      if (okMsg) setMsg(okMsg);
    } catch (e) { setMsg(`Error: ${e.message}`); }
    setBusy(false);
  };
  const start = () => post({ action: "save", fields: {}, containers: (data.tanks || []).map((t) => ({ containerNo: t })) }, "Draft created from the booking - complete the details below.");
  const save = () => post({ action: "save", fields: form, containers: rows }, "Draft saved.");
  const submit = async () => { await post({ action: "save", fields: form, containers: rows }); await post({ action: "submit" }, "Submitted - the customer has been asked to approve."); };
  const issue = () => { if (!window.confirm(`Issue this bill of lading as ${issueNo || "(number needed)"}? It becomes final and locked.`)) return; post({ action: "issue", blNumber: issueNo }, "Bill of lading issued."); };
  const decide = (approve) => post({ action: "decision", approve, comment }, approve ? "Approved - the agent can now issue the B/L." : "Sent back to the agent with your comments.");

  const isAgent = account.kind === "AGENT";
  const bl = data && data.bl;
  const stage = bl ? bl.stage : null;
  const isFinal = bl && bl.blStatus === "FINAL";
  const preview = () => { const merged = { ...bl, ...(data.canEdit && form ? form : {}) }; openForPrint(buildBillOfLadingHTML(data.quote || {}, merged, data.canEdit ? rows : data.containers, isFinal), blFileName(merged, data.quote)); };
  const download = () => { const merged = { ...bl, ...(data.canEdit && form ? form : {}) }; downloadHtml(buildBillOfLadingHTML(data.quote || {}, merged, data.canEdit ? rows : data.containers, isFinal), `${blFileName(merged, data.quote)}${isFinal ? "" : " (draft)"}`); };

  if (err) return <Msg text={err} />;
  if (!data) return <div style={{ color: MUTED }}>Loading…</div>;

  if (!bl) {
    return (
      <div style={CARD}>
        <Msg text={msg} ok={msg && !/^Error/.test(msg)} onClose={() => setMsg(null)} />
        {data.noQuote && <div style={{ fontSize: 13 }}>Genesis has not linked a quote to this booking yet, so a bill of lading cannot be drafted here. Please ask your Genesis contact.</div>}
        {data.genesisDraft && <div style={{ fontSize: 13, color: MUTED }}>Genesis is preparing the bill of lading for this booking. It will appear here once issued.</div>}
        {data.agentDrafting && <div style={{ fontSize: 13, color: MUTED }}>{isAgent ? "The bill of lading is being prepared by the agent at the port of loading. It will appear here once issued." : "The agent is drafting the bill of lading. You will be asked to approve it once it is submitted."}</div>}
        {!data.noQuote && !data.genesisDraft && !data.agentDrafting && (isAgent && data.canEdit
          ? <><div style={{ fontSize: 13, marginBottom: 10 }}>No bill of lading yet for this booking. The draft starts pre-filled from the quote and the {data.tanks.length} allocated tank{data.tanks.length === 1 ? "" : "s"}.</div><button style={PRIMARY} disabled={busy} onClick={start}>Start draft B/L</button></>
          : <div style={{ fontSize: 13, color: MUTED }}>No bill of lading has been drafted for this booking yet.</div>)}
        {!data.noQuote && !data.genesisDraft && !data.agentDrafting && isAgent && !data.canEdit && <div style={{ fontSize: 13, color: MUTED }}>The bill of lading is drafted by the agent at the port of loading. It will appear here once issued.</div>}
      </div>
    );
  }

  const st = STAGE_LABEL[stage] || [stage, MUTED];
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={CARD}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Bill of lading {bl.blNumber ? <span style={{ fontFamily: "monospace" }}>{bl.blNumber}</span> : ""}</div>
          <Pill text={st[0]} color={st[1]} />
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button style={BTN} onClick={preview}>{isFinal ? "Print B/L" : "Preview draft"}</button>
            <button style={BTN} onClick={download}>Download</button>
          </div>
        </div>
        <Progress stage={stage} />
        {stage === "CHANGES_REQUESTED" && <div style={{ marginTop: 10, background: "#FBEAE7", border: `1px solid ${RED}`, borderRadius: 6, padding: 10, fontSize: 13 }}><b>Customer asked for changes</b> ({bl.customerDecisionBy}, {fmtDT(bl.customerDecisionAt)}): {bl.customerComment}</div>}
        {stage === "APPROVED" && <div style={{ marginTop: 10, fontSize: 12, color: GREEN }}>Approved by {bl.customerDecisionBy} on {fmtDT(bl.customerDecisionAt)}.</div>}
        {isFinal && <div style={{ marginTop: 10, fontSize: 12, color: MUTED }}>Issued by {bl.finalizedBy || bl.issuedBy} on {fmtDT(bl.finalizedAt)}. Changes now go through Genesis.</div>}
        <Msg text={msg} ok={msg && !/^Error/.test(msg)} onClose={() => setMsg(null)} />
      </div>

      {data.canApprove && (
        <div style={{ ...CARD, borderColor: ORANGE }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Your approval is needed</div>
          <div style={{ fontSize: 13, color: MUTED, marginBottom: 8 }}>Check the draft (Preview draft above). Approve it, or describe what must change.</div>
          <textarea style={{ ...INPUT, minHeight: 70 }} placeholder="Comments or requested changes (required when asking for changes)" value={comment} onChange={(e) => setComment(e.target.value)} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button style={PRIMARY} disabled={busy} onClick={() => decide(true)}>Approve draft</button>
            <button style={DANGER} disabled={busy || !comment.trim()} onClick={() => decide(false)}>Request changes</button>
          </div>
        </div>
      )}

      {data.canEdit && form ? (
        <div style={CARD}>
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Draft details</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {FIELDS.map(([k, label, type, opts]) => (
              <Field key={k} label={label} span={type === "area"}>
                {type === "area" ? <textarea style={{ ...INPUT, minHeight: 56 }} value={form[k] || ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                  : type === "select" ? <select style={INPUT} value={form[k] || ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })}><option value="">—</option>{opts.map((o) => <option key={o}>{o}</option>)}</select>
                  : <input style={INPUT} type={type === "date" ? "date" : "text"} value={form[k] || ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />}
              </Field>))}
          </div>
          <div style={{ fontWeight: 800, margin: "16px 0 6px" }}>Containers</div>
          <Containers rows={rows} tanks={data.tanks} onChange={setRows} />
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
            <button style={BTN} disabled={busy} onClick={save}>Save draft</button>
            {stage !== "APPROVED" && <button style={PRIMARY} disabled={busy} onClick={submit}>{stage === "SUBMITTED" ? "Re-submit to customer" : "Submit for customer approval"}</button>}
            {stage === "APPROVED" && <>
              <input style={{ ...INPUT, maxWidth: 220 }} placeholder="B/L number" value={issueNo} onChange={(e) => setIssueNo(e.target.value)} />
              <button style={{ ...PRIMARY, background: GREEN }} disabled={busy || !issueNo.trim()} onClick={issue}>Issue bill of lading</button>
            </>}
            <span style={{ fontSize: 12, color: MUTED }}>{stage === "SUBMITTED" ? "Waiting for the customer. Saving again returns it to draft." : stage === "APPROVED" ? "Approved - enter the carrier's B/L number and issue." : ""}</span>
          </div>
        </div>
      ) : (
        <div style={CARD}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Details</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, fontSize: 13 }}>
            {FIELDS.filter(([k]) => bl[k]).map(([k, label]) => <div key={k}><div style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div><div style={{ whiteSpace: "pre-line" }}>{bl[k]}</div></div>)}
          </div>
          <div style={{ fontWeight: 800, margin: "14px 0 6px" }}>Containers</div>
          <Containers rows={data.containers || []} readOnly />
        </div>
      )}

      {bl.history && bl.history.length > 0 && (
        <div style={{ ...CARD, fontSize: 12, color: MUTED }}>
          <div style={{ fontWeight: 700, color: DARK, marginBottom: 4 }}>History</div>
          {[...bl.history].reverse().slice(0, 12).map((h, i) => <div key={i}>{fmtDT(h.at)} · {h.by} · {String(h.action).toLowerCase().replace(/_/g, " ")}{h.comment ? ` - ${h.comment}` : ""}{h.blNumber ? ` ${h.blNumber}` : ""}</div>)}
        </div>
      )}
    </div>
  );
}
