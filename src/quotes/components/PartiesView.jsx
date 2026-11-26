// Quotes > Customers & Vendors: the register every quote, cost line and agent field reads from (Inventory 113).
import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { fetchParties, partiesAttention, STATUS } from "../lib/partiesApi.js";
import PartyForm from "./PartyForm.jsx";
import { INPUT, BTN, PRIMARY, TH, TD, Card, Tile, Pill, Msg, Empty } from "../../hr/components/ui.jsx";

const MUTED = "#8a8578";
const ROLE_COLOR = { CUSTOMER: "#2E7D5B", SHIPPER: "#1f6fb2", VENDOR: "#6B5B95", AGENT: "#F09128" };
const fmtD = (s) => (s ? new Date(String(s).slice(0, 10) + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "—");

export default function PartiesView({ onChanged, openNew = null, onOpenNewDone }) {
  const [rows, setRows] = useState([]); const [att, setAtt] = useState({ pending: 0, licences: 0, canApprove: false }); const [err, setErr] = useState(null);
  const [q, setQ] = useState(""); const [role, setRole] = useState(""); const [status, setStatus] = useState(""); const [open, setOpen] = useState(null); const [creating, setCreating] = useState(false);
  const load = useCallback(async () => { try { const [r, a] = await Promise.all([fetchParties(), partiesAttention()]); setRows(r); setAtt(a); setErr(null); } catch (e) { setErr(e.message || String(e)); } }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (openNew) { setCreating(openNew); onOpenNewDone && onOpenNewDone(); } }, [openNew]); // eslint-disable-line react-hooks/exhaustive-deps
  const today = new Date().toISOString().slice(0, 10); const soon = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  const list = useMemo(() => { const s = q.trim().toUpperCase(); return rows.filter((p) => (!role || (p.roles || []).includes(role)) && (!status || p.status === status)
    && (!s || [p.name, p.shortName, p.country, p.city, p.trn, p.contactName, p.email].some((v) => String(v || "").toUpperCase().includes(s)))); }, [rows, q, role, status]);
  const excel = () => {
    const ws = XLSX.utils.json_to_sheet(list.map((p) => ({ Name: p.name, "Short name": p.shortName, Roles: (p.roles || []).join(", "), Category: p.category, Status: p.status, Country: p.country, City: p.city, Address: p.address, "TRN / VAT": p.trn, "Licence no": p.licenceNo, "Licence expiry": p.licenceExpiry, Contact: p.contactName, Phone: p.phone, Email: p.email, "Payment terms": p.paymentTerms, Documents: p.docs, "Used on quotes / tanks": p.used, "Created by": p.createdBy, "Approved by": p.approvedBy })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Customers & Vendors"); XLSX.writeFile(wb, `genesis_customers_vendors_${today}.xlsx`);
  };
  const saved = async () => { await load(); onChanged && onChanged(); };
  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <Tile label="Customers" value={rows.filter((p) => (p.roles || []).includes("CUSTOMER")).length} color="#2E7D5B" onClick={() => { setRole("CUSTOMER"); setStatus(""); }} />
        <Tile label="Vendors" value={rows.filter((p) => (p.roles || []).includes("VENDOR")).length} color="#6B5B95" onClick={() => { setRole("VENDOR"); setStatus(""); }} />
        <Tile label="Agents" value={rows.filter((p) => (p.roles || []).includes("AGENT")).length} color="#F09128" onClick={() => { setRole("AGENT"); setStatus(""); }} />
        <Tile label="Waiting for approval" value={att.pending} color={att.pending ? "#B7791F" : MUTED} sub={att.canApprove ? "you can approve" : "Management / Accounts approve"} onClick={() => { setRole(""); setStatus("PENDING"); }} />
        <Tile label="Licences expiring (60 d)" value={att.licences} color={att.licences ? "#C53030" : MUTED} onClick={() => { setRole(""); setStatus(""); setQ(""); }} />
      </div>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>Every customer, shipper, vendor and agent used on quotes and cost sheets comes from this register. Anyone can add one; Management and Accounts approve it after checking the trade licence and TRN. Quotes accept only names listed here.</div>
      {err && <Msg text={`Customers & Vendors: ${err}${/parties|schema|function/i.test(err) ? " - has Inventory migration 113 been run?" : ""}`} />}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <input style={{ ...INPUT, maxWidth: 320 }} placeholder="Search name, country, TRN, contact…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select style={{ ...INPUT, maxWidth: 160 }} value={role} onChange={(e) => setRole(e.target.value)}><option value="">All roles</option><option value="CUSTOMER">Customers</option><option value="SHIPPER">Shippers</option><option value="VENDOR">Vendors</option><option value="AGENT">Agents</option></select>
        <select style={{ ...INPUT, maxWidth: 180 }} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option value="PENDING">Waiting for approval</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select>
        <span style={{ fontSize: 12, color: MUTED }}>{list.length} of {rows.length}</span>
        <button style={{ ...BTN, marginLeft: "auto" }} onClick={excel} disabled={!list.length}>Excel</button>
        <button style={PRIMARY} onClick={() => setCreating({ roles: ["CUSTOMER"] })}>+ New customer / vendor</button>
      </div>
      <Card>
        {!list.length ? <Empty text="Nothing matches." /> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead><tr>{["Name", "Roles", "Status", "Country / city", "TRN / VAT", "Licence", "Docs", "Used", "Contact"].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead>
              <tbody>{list.map((p) => { const st = STATUS[p.status] || [p.status, MUTED]; const le = p.licenceExpiry ? String(p.licenceExpiry).slice(0, 10) : ""; return (
                <tr key={p.key} onClick={() => setOpen(p)} style={{ cursor: "pointer" }} className="row">
                  <td style={{ ...TD, fontWeight: 700 }}>{p.name}{p.shortName ? <div style={{ fontSize: 11, color: MUTED, fontWeight: 400 }}>{p.shortName}</div> : null}</td>
                  <td style={TD}>{(p.roles || []).map((r) => <span key={r} style={{ display: "inline-block", marginRight: 4, background: ROLE_COLOR[r] || MUTED, color: "#fff", borderRadius: 9, padding: "1px 7px", fontSize: 10, fontWeight: 800 }}>{r}</span>)}{p.category && !["CUSTOMER", "SHIPPER", "AGENT"].includes(p.category) ? <div style={{ fontSize: 11, color: MUTED }}>{p.category}</div> : null}</td>
                  <td style={TD}><Pill text={st[0]} color={st[1]} /></td>
                  <td style={TD}>{[p.country, p.city].filter(Boolean).join(" / ") || "—"}</td>
                  <td style={{ ...TD, fontFamily: "monospace" }}>{p.trn || "—"}</td>
                  <td style={{ ...TD, color: le && le < today ? "#C53030" : le && le <= soon ? "#B7791F" : undefined }}>{le ? fmtD(le) : "—"}</td>
                  <td style={{ ...TD, textAlign: "right" }}>{p.docs || "—"}</td><td style={{ ...TD, textAlign: "right" }}>{p.used || "—"}</td>
                  <td style={{ ...TD, fontSize: 12 }}>{[p.contactName, p.email].filter(Boolean).join(" · ") || "—"}</td>
                </tr>); })}</tbody>
            </table>
          </div>
        )}
      </Card>
      {open && <PartyForm party={open} parties={rows} canApprove={att.canApprove} onSaved={async (p) => { setOpen((o) => ({ ...o, ...p })); await saved(); }} onClose={() => setOpen(null)} />}
      {creating && <PartyForm preset={creating} parties={rows} canApprove={att.canApprove} onSaved={async () => { await saved(); }} onClose={() => setCreating(false)} />}
    </div>
  );
}
