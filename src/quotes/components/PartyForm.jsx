// Create / edit a customer, shipper, vendor or agent (Inventory 113). Duplicate check while typing; documents after the
// record exists; approval buttons for Management / Accounts. Used from the register and as a pop-up from the quote form.
import { useEffect, useMemo, useState } from "react";
import { ROLES, VENDOR_CATEGORIES, DOC_TYPES, STATUS, createParty, updateParty, renameParty, decideParty, fetchDocuments, uploadDocument, documentUrl, deleteDocument, lookAlikes } from "../lib/partiesApi.js";
import { INPUT, BTN, PRIMARY, DANGER, Field, Pill, Msg } from "../../hr/components/ui.jsx";

const MUTED = "#8a8578";
const EMPTY = { name: "", shortName: "", roles: [], category: "", address: "", city: "", country: "", contactName: "", phone: "", email: "", trn: "", paymentTerms: "", licenceNo: "", licenceExpiry: "", website: "", bankName: "", bankAccount: "", iban: "", swift: "", notes: "" };
const fmtD = (s) => (s ? new Date(String(s).slice(0, 10) + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "—");

export default function PartyForm({ party, preset, parties = [], canApprove = false, onSaved, onClose }) {
  const editing = !!(party && (party.customerId || party.vendorId));
  const [f, setF] = useState(() => editing ? { ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, party[k] == null ? (k === "roles" ? [] : "") : party[k]])), roles: party.roles || [] } : { ...EMPTY, ...(preset || {}) });
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null); const [saved, setSaved] = useState(editing ? party : null);
  const [docs, setDocs] = useState([]); const [docType, setDocType] = useState("TRADE_LICENCE"); const [docTitle, setDocTitle] = useState(""); const [docExpiry, setDocExpiry] = useState(""); const [docBusy, setDocBusy] = useState(false);
  const [reason, setReason] = useState(""); const [rename, setRename] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggle = (r) => setF({ ...f, roles: f.roles.includes(r) ? f.roles.filter((x) => x !== r) : [...f.roles, r] });
  const alikes = useMemo(() => (editing ? [] : lookAlikes(f.name, parties)), [f.name, parties, editing]);
  const exact = alikes.find((a) => a.exact);
  const current = saved;
  const loadDocs = async (p) => { try { setDocs(await fetchDocuments(p)); } catch (e) { setMsg(`Documents: ${e.message}`); } };
  useEffect(() => { if (current) loadDocs(current); }, [current && current.customerId, current && current.vendorId]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (e) => {
    e.preventDefault(); setMsg(null);
    if (!f.name.trim()) { setMsg("Error: the legal name is needed."); return; }
    if (!f.roles.length) { setMsg("Error: tick at least one role."); return; }
    if (exact) { setMsg(`Error: ${exact.p.name} is already in the register - open it instead of creating a new one.`); return; }
    setBusy(true);
    try {
      if (editing) {
        await updateParty(current, f);
        if (rename.trim() && rename.trim().toUpperCase() !== current.name) await renameParty(current, rename);
        setMsg("Saved."); onSaved && onSaved({ ...current, ...f, name: rename.trim() ? rename.trim().toUpperCase() : current.name });
      } else {
        const r = await createParty(f);
        const p = { ...f, name: r.name, customerId: r.customerId, vendorId: r.vendorId, status: r.status, roles: f.roles, key: r.name };
        setSaved(p); setMsg(r.status === "APPROVED" ? `${r.name} added and approved.` : `${r.name} added - waiting for approval by Management / Accounts. You can use it on quotes meanwhile.`);
        onSaved && onSaved(p);
      }
    } catch (x) { setMsg(`Error: ${x.message}`); }
    setBusy(false);
  };
  const decide = async (approve) => {
    if (!approve && !reason.trim()) { setMsg("Error: give a reason for rejecting."); return; }
    if (!window.confirm(approve ? `Approve ${current.name}?` : `Reject ${current.name}? Quotes will refuse this name.`)) return;
    setBusy(true);
    try { if (current.customerId) await decideParty("CUSTOMER", current.customerId, approve, reason); if (current.vendorId) await decideParty("VENDOR", current.vendorId, approve, reason); setSaved({ ...current, status: approve ? "APPROVED" : "REJECTED" }); setMsg(approve ? "Approved." : "Rejected."); onSaved && onSaved({ ...current, status: approve ? "APPROVED" : "REJECTED" }); }
    catch (x) { setMsg(`Error: ${x.message}`); }
    setBusy(false);
  };
  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0]; e.target.value = ""; if (!file || !current) return;
    if (file.size > 15 * 1024 * 1024) { setMsg("Error: file over 15 MB."); return; }
    setDocBusy(true); setMsg(null);
    try { await uploadDocument(current, file, docType, docTitle, docExpiry); setDocTitle(""); setDocExpiry(""); await loadDocs(current); } catch (x) { setMsg(`Error: ${x.message}`); }
    setDocBusy(false);
  };
  const openDoc = async (d) => { try { window.open(await documentUrl(d), "_blank"); } catch (x) { setMsg(`Error: ${x.message}`); } };
  const delDoc = async (d) => { if (!window.confirm(`Delete ${d.file_name}?`)) return; try { await deleteDocument(d); await loadDocs(current); } catch (x) { setMsg(`Error: ${x.message}`); } };
  const st = current && STATUS[current.status];
  const isVendor = f.roles.includes("VENDOR") || f.roles.includes("AGENT");

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, overflowY: "auto" }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={save} style={{ background: "#fff", borderRadius: 10, width: "100%", maxWidth: 860, padding: 18, boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{editing ? current.name : "New customer / vendor"}</div>
          {st && <Pill text={st[0]} color={st[1]} />}
          {current && current.createdBy && <span style={{ fontSize: 11, color: MUTED }}>created by {current.createdBy}{current.approvedBy ? ` · approved by ${current.approvedBy}` : ""}</span>}
          <button type="button" onClick={onClose} style={{ ...BTN, marginLeft: "auto" }}>Close</button>
        </div>
        <Msg text={msg} onClose={() => setMsg(null)} />
        {current && current.status === "REJECTED" && current.rejectReason && <div style={{ fontSize: 12, color: "#C53030", marginBottom: 8 }}>Rejected: {current.rejectReason}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {!editing ? (
            <Field label="Legal name (as on the trade licence) *" span>
              <input style={INPUT} value={f.name} onChange={set("name")} placeholder="e.g. BLUE OCEAN CHEMICALS LLC" autoFocus />
              {alikes.length > 0 && (
                <div style={{ marginTop: 6, border: `1px solid ${exact ? "#C53030" : "#B7791F"}`, background: exact ? "#FBEAE7" : "#FFF6EC", borderRadius: 6, padding: "6px 10px", fontSize: 12 }}>
                  <b>{exact ? "Already in the register:" : "Did you mean one of these?"}</b>
                  {alikes.map((a) => <div key={a.p.key}>{a.p.name} <span style={{ color: MUTED }}>({(a.p.roles || []).join(", ").toLowerCase()}{a.p.status !== "APPROVED" ? `, ${STATUS[a.p.status][0].toLowerCase()}` : ""})</span></div>)}
                </div>
              )}
            </Field>
          ) : canApprove && (
            <Field label="Rename (Management / Accounts only)" span><input style={INPUT} value={rename} onChange={(e) => setRename(e.target.value)} placeholder={current.name} /></Field>
          )}
          <Field label="Roles *" span>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
              {ROLES.map(([k, l]) => <label key={k} style={{ display: "flex", gap: 5, alignItems: "center" }}><input type="checkbox" checked={f.roles.includes(k)} onChange={() => toggle(k)} disabled={editing} /> {l}</label>)}
            </div>
            {editing && <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>Roles are fixed once created - ask Management to add a role.</div>}
          </Field>
          <Field label="Short name"><input style={INPUT} value={f.shortName} onChange={set("shortName")} placeholder="as shown in lists" /></Field>
          {isVendor && <Field label="Vendor category"><select style={INPUT} value={f.category} onChange={set("category")}><option value="">-</option>{VENDOR_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>}
          <Field label="Country"><input style={INPUT} value={f.country} onChange={set("country")} /></Field>
          <Field label="City"><input style={INPUT} value={f.city} onChange={set("city")} /></Field>
          <Field label="Address" span><textarea style={{ ...INPUT, minHeight: 56 }} value={f.address} onChange={set("address")} /></Field>
          <Field label="TRN / VAT number"><input style={INPUT} value={f.trn} onChange={set("trn")} /></Field>
          <Field label="Trade licence no."><input style={INPUT} value={f.licenceNo} onChange={set("licenceNo")} /></Field>
          <Field label="Licence expiry"><input style={INPUT} type="date" value={f.licenceExpiry ? String(f.licenceExpiry).slice(0, 10) : ""} onChange={set("licenceExpiry")} /></Field>
          <Field label="Payment terms"><input style={INPUT} value={f.paymentTerms} onChange={set("paymentTerms")} placeholder="e.g. 30 days" /></Field>
          <Field label="Contact person"><input style={INPUT} value={f.contactName} onChange={set("contactName")} /></Field>
          <Field label="Phone"><input style={INPUT} value={f.phone} onChange={set("phone")} /></Field>
          <Field label="E-mail"><input style={INPUT} value={f.email} onChange={set("email")} /></Field>
          <Field label="Website"><input style={INPUT} value={f.website} onChange={set("website")} /></Field>
          {isVendor && <>
            <Field label="Bank name"><input style={INPUT} value={f.bankName} onChange={set("bankName")} /></Field>
            <Field label="Account no."><input style={INPUT} value={f.bankAccount} onChange={set("bankAccount")} /></Field>
            <Field label="IBAN"><input style={INPUT} value={f.iban} onChange={set("iban")} /></Field>
            <Field label="SWIFT"><input style={INPUT} value={f.swift} onChange={set("swift")} /></Field>
          </>}
          <Field label="Notes" span><textarea style={{ ...INPUT, minHeight: 48 }} value={f.notes} onChange={set("notes")} /></Field>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button style={PRIMARY} disabled={busy || !!exact}>{busy ? "Saving…" : editing ? "Save changes" : "Create"}</button>
          {!current && <span style={{ fontSize: 12, color: MUTED }}>After creating you can upload the trade licence and other documents.</span>}
          {current && canApprove && current.status !== "APPROVED" && <><input style={{ ...INPUT, maxWidth: 260, marginLeft: "auto" }} placeholder="Reason (needed to reject)" value={reason} onChange={(e) => setReason(e.target.value)} /><button type="button" style={PRIMARY} disabled={busy} onClick={() => decide(true)}>Approve</button><button type="button" style={DANGER} disabled={busy} onClick={() => decide(false)}>Reject</button></>}
          {current && canApprove && current.status === "APPROVED" && <><input style={{ ...INPUT, maxWidth: 260, marginLeft: "auto" }} placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} /><button type="button" style={DANGER} disabled={busy} onClick={() => decide(false)}>Reject / block</button></>}
        </div>

        {current && (
          <div style={{ marginTop: 16, borderTop: "1px solid #e0ddd3", paddingTop: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Documents</div>
            <div style={{ display: "flex", gap: 6, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 8 }}>
              <div><label style={{ fontSize: 10, color: MUTED, fontWeight: 700, textTransform: "uppercase" }}>Type</label><select style={INPUT} value={docType} onChange={(e) => setDocType(e.target.value)}>{DOC_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
              <div><label style={{ fontSize: 10, color: MUTED, fontWeight: 700, textTransform: "uppercase" }}>Title</label><input style={INPUT} value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="optional" /></div>
              <div><label style={{ fontSize: 10, color: MUTED, fontWeight: 700, textTransform: "uppercase" }}>Expiry</label><input style={INPUT} type="date" value={docExpiry} onChange={(e) => setDocExpiry(e.target.value)} /></div>
              <label style={{ ...BTN, cursor: "pointer" }}>{docBusy ? "Uploading…" : "Upload file"}<input type="file" style={{ display: "none" }} onChange={onFile} accept=".pdf,image/*,.doc,.docx,.xls,.xlsx" /></label>
            </div>
            {!docs.length ? <div style={{ fontSize: 12, color: MUTED }}>No documents yet. Upload the trade licence and TRN / VAT certificate.</div> : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <tbody>{docs.map((d) => { const exp = d.expiry_date && d.expiry_date < new Date().toISOString().slice(0, 10); const soon = d.expiry_date && !exp && d.expiry_date <= new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10); return (
                  <tr key={d.id} style={{ borderBottom: "1px solid #f0ede6" }}>
                    <td style={{ padding: "5px 6px" }}><b>{(DOC_TYPES.find(([k]) => k === d.doc_type) || [d.doc_type, d.doc_type])[1]}</b>{d.title ? ` - ${d.title}` : ""}</td>
                    <td style={{ padding: "5px 6px" }}><button type="button" onClick={() => openDoc(d)} style={{ background: "none", border: "none", color: "#1f6fb2", cursor: "pointer", padding: 0, fontSize: 13, textDecoration: "underline" }}>{d.file_name}</button></td>
                    <td style={{ padding: "5px 6px", color: exp ? "#C53030" : soon ? "#B7791F" : MUTED }}>{d.expiry_date ? `${exp ? "EXPIRED " : soon ? "expires " : "valid to "}${fmtD(d.expiry_date)}` : ""}</td>
                    <td style={{ padding: "5px 6px", color: MUTED, fontSize: 11 }}>{d.uploaded_by} · {fmtD(d.uploaded_at)}</td>
                    <td style={{ padding: "5px 6px", textAlign: "right" }}><button type="button" style={{ ...DANGER, padding: "3px 8px", fontSize: 11 }} onClick={() => delDoc(d)}>Delete</button></td>
                  </tr>); })}</tbody>
              </table>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
