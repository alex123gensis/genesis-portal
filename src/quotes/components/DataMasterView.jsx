import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { MASTER_KINDS, fetchMaster, saveMaster, deleteMaster, verifyManager, syncDepotsFromInventory } from "../lib/masterApi.js";
import ManagerApproval from "./ManagerApproval.jsx";

const INPUT = { width: "100%", padding: "8px 9px", border: "1px solid #ccc", borderRadius: 4, fontSize: 13, boxSizing: "border-box" };
const LABEL = { fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "#8a8578", display: "block", marginBottom: 3 };
const CARD = { border: "1px solid #e0ddd3", borderRadius: 6, background: "#fff", padding: 12, marginBottom: 8 };
const BTN = (solid, color = "#231E1E") => ({ padding: "8px 12px", border: solid ? "none" : `1px solid ${color}`, borderRadius: 4, background: solid ? color : "#fff", color: solid ? "#fff" : color, fontWeight: 700, fontSize: 12, cursor: "pointer" });
const TH = { textAlign: "left", padding: "6px 8px", fontSize: 11, color: "#8a8578", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #e0ddd3", whiteSpace: "nowrap" };
const TD = { padding: "6px 8px", fontSize: 13, borderBottom: "1px solid #f0ede6", verticalAlign: "top" };

// Data Master (12 Oct, Alex): every customer, vendor, depot, port and
// product the two apps use, with addresses and contact details, in one
// manager-only place. Names are auto-listed as they are used on quotes
// (database triggers, migration 032); managers fill in the details here.
// The manager's name + password are kept for the session and sent with
// every save - the database does the check, nothing is trusted client-side.
export default function DataMasterView({ onChanged, onOpenParties }) {
  const [session, setSession] = useState(null); // { manager, password }
  const [kind, setKind] = useState("CUSTOMER");
  const [rows, setRows] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null); // row (with master_id) or {} for new
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const def = MASTER_KINDS.find((k) => k.key === kind);

  const load = async (k = kind) => {
    setLoading(true);
    try { const list = await fetchMaster(k); setRows((r) => ({ ...r, [k]: list })); setError(null); }
    catch (e) { setError(/list_master|schema cache|function/i.test(e.message || "") ? "Data Master needs Quotes migration 032." : (e.message || String(e))); }
    setLoading(false);
  };
  useEffect(() => { if (session) load(kind); }, [kind, session]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = rows[kind] || [];
  const hasDetails = (r) => !!(r.address || r.contact_name || r.phone || r.email || (kind === "PRODUCT" && (r.un_no || r.imo_class)) || (kind === "PORT" && r.code));
  const visible = useMemo(() => {
    const q = search.trim().toUpperCase();
    return list.filter((r) => (!onlyMissing || !hasDetails(r)) && (!q || Object.values(r).some((v) => typeof v === "string" && v.toUpperCase().includes(q))))
      .sort((a, b) => String(a[def.nameField] || "").localeCompare(String(b[def.nameField] || "")));
  }, [list, search, onlyMissing, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const startEdit = (r) => { setEditing(r); const d = {}; def.fields.forEach(([f]) => { d[f] = r[f] == null ? "" : String(r[f]); }); setDraft(d); };
  const save = async () => {
    const nameOk = def.fields.filter(([, l]) => l.endsWith("*")).every(([f]) => String(draft[f] || "").trim());
    if (!nameOk) { setError("Fill in the fields marked *."); return; }
    setBusy(true);
    try {
      const row = {}; def.fields.forEach(([f]) => { row[f] = draft[f] === "" ? null : draft[f]; });
      if (kind === "PORT") row.pod_rebate = draft.pod_rebate === "" ? "" : draft.pod_rebate;
      await saveMaster(kind, editing.master_id || null, row, session.manager, session.password);
      setEditing(null); setError(null); await load(); onChanged && onChanged();
    } catch (e) { setError(e.message || String(e)); if (/password/i.test(e.message || "")) setSession(null); }
    setBusy(false);
  };
  const remove = async (r) => {
    if (!window.confirm(`Delete ${r[def.nameField]} from the ${def.label} master? Quotes already using the name keep it.`)) return;
    try { await deleteMaster(kind, r.master_id, session.manager, session.password); await load(); onChanged && onChanged(); }
    catch (e) { setError(e.message || String(e)); }
  };
  const sync = async () => {
    setBusy(true);
    try { const n = await syncDepotsFromInventory(list, session.manager, session.password); await load(); setError(null); window.alert(n ? `${n} depot${n === 1 ? "" : "s"} added from Inventory.` : "Depot list already complete."); }
    catch (e) { setError(e.message || String(e)); }
    setBusy(false);
  };
  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    MASTER_KINDS.forEach((k) => {
      const l = rows[k.key]; if (!l) return;
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(l.map((r) => { const o = {}; k.fields.forEach(([f, label]) => { o[label.replace(" *", "")] = r[f] ?? ""; }); return o; })), k.label.replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
    });
    XLSX.writeFile(wb, `Genesis-Data-Master-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  const loadAll = async () => { for (const k of MASTER_KINDS) if (!rows[k.key]) await load(k.key); };

  if (!session) {
    return (
      <div>
        <div style={{ background: "#f0f0f0", borderRadius: 6, padding: 10, marginBottom: 10, fontWeight: 700 }}>Data Master — managers only</div>
        <ManagerApproval title="Open the Data Master" description="Customers, vendors, depots, ports and products with their addresses and contacts. Changes here feed both apps, so only a manager can open it."
          actionLabel="Open" onApprove={async (manager, password) => { if (!(await verifyManager(manager, password))) throw new Error("Manager name or password is not correct."); setSession({ manager, password }); }} />
      </div>
    );
  }

  const missing = list.filter((r) => !hasDetails(r)).length;
  return (
    <div>
      <div style={{ background: "#f0f0f0", borderRadius: 6, padding: 10, marginBottom: 10, fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <span>Data Master <span style={{ fontWeight: 400, color: "#666", fontSize: 12 }}>· {session.manager}</span></span>
        <span style={{ display: "flex", gap: 6 }}>
          <button onClick={async () => { await loadAll(); exportExcel(); }} style={BTN(false, "#2E7D5B")}>📊 Excel (all)</button>
          <button onClick={() => setSession(null)} style={BTN(false)}>Lock</button>
        </span>
      </div>
      <p style={{ fontSize: 13, color: "#666", marginTop: 0 }}>Names appear here automatically as they are used on quotes and cost lines; fill in the details once and both apps can use them. Depots come from the Inventory depot master — use "Sync from Inventory" after adding a depot there.</p>
      {error && <div style={{ background: "#FBEAE7", border: "1px solid #C53030", borderRadius: 4, padding: 8, color: "#C53030", fontSize: 12, marginBottom: 10 }}>{error}</div>}

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {MASTER_KINDS.map((k) => <button key={k.key} onClick={() => { setKind(k.key); setEditing(null); setSearch(""); }} style={{ ...BTN(kind === k.key), flex: 1 }}>{k.label}{rows[k.key] ? ` (${rows[k.key].length})` : ""}</button>)}
      </div>
      {(kind === "CUSTOMER" || kind === "VENDOR") && (
        <div style={{ ...CARD, borderColor: "#F09128", background: "#FFF6EC", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13 }}><b>Customers and vendors are now managed in the Customers &amp; Vendors register</b> (with trade licence, TRN / VAT and documents, approved by Management / Accounts). This tab stays for quick corrections by managers.</div>
          {onOpenParties && <button onClick={onOpenParties} style={{ ...BTN(true, "#F09128"), marginLeft: "auto" }}>Open Customers &amp; Vendors</button>}
        </div>
      )}
      <div style={{ display: "none" }}>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input style={{ ...INPUT, flex: 1, minWidth: 200 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${def.label.toLowerCase()}…`} />
        <label style={{ fontSize: 12, color: "#666", whiteSpace: "nowrap" }}><input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> only without details ({missing})</label>
        {kind === "DEPOT" && <button onClick={sync} disabled={busy} style={BTN(false, "#2B6CB0")}>⟳ Sync from Inventory</button>}
        <button onClick={() => startEdit({})} style={BTN(true, "#F09128")}>+ Add</button>
      </div>

      {editing && (
        <div style={{ ...CARD, background: "#faf9f5", borderColor: "#F09128" }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>{editing.master_id ? `Edit — ${editing[def.nameField]}` : `New ${def.label.replace(/s$| \(.*$/, "")}`}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {def.fields.map(([f, label, type]) => (
              <div key={f} style={{ gridColumn: type === "area" ? "1 / -1" : "auto" }}>
                <label style={LABEL}>{label}</label>
                {type === "area"
                  ? <textarea style={{ ...INPUT, fontFamily: "inherit", minHeight: 56 }} value={draft[f] || ""} onChange={(e) => setDraft({ ...draft, [f]: e.target.value })} />
                  : <input style={INPUT} value={draft[f] || ""} onChange={(e) => setDraft({ ...draft, [f]: e.target.value })} />}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <button onClick={() => setEditing(null)} style={{ ...BTN(false), flex: 1 }}>Cancel</button>
            <button onClick={save} disabled={busy} style={{ ...BTN(true, "#2E7D5B"), flex: 2 }}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </div>
      )}

      {loading && !list.length ? <div style={{ color: "#999", padding: 20, textAlign: "center" }}>Loading…</div> : visible.length === 0 ? <div style={{ color: "#999", padding: 20, textAlign: "center" }}>Nothing here{search ? " matches" : ""}.</div> : (
        <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #e0ddd3", borderRadius: 6 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              <th style={TH}>{kind === "DEPOT" ? "Depot · Location" : kind === "PORT" ? "Port · Code" : "Name"}</th>
              {kind === "PRODUCT" ? <><th style={TH}>UN / IMO / PG</th><th style={TH}>SG</th></> : kind === "PORT" ? <><th style={TH}>Country</th><th style={TH}>POD rebate</th></> : <><th style={TH}>Address</th><th style={TH}>Contact</th></>}
              <th style={TH}>Notes</th><th style={TH}></th>
            </tr></thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.master_id} style={{ cursor: "pointer" }} onClick={() => startEdit(r)}>
                  <td style={{ ...TD, fontWeight: 700 }}>{r[def.nameField]}{kind === "DEPOT" ? <span style={{ fontWeight: 400, color: "#666" }}> · {r.location}{r.country ? `, ${r.country}` : ""}</span> : kind === "PORT" ? <span style={{ fontWeight: 400, color: "#666", fontFamily: "monospace" }}> · {r.code}</span> : r.category ? <span style={{ fontWeight: 400, color: "#8a8578", fontSize: 11 }}> · {r.category}</span> : null}{!hasDetails(r) && <span style={{ marginLeft: 6, fontSize: 10, color: "#C9862A", fontWeight: 700 }}>NO DETAILS</span>}</td>
                  {kind === "PRODUCT" ? <><td style={TD}>{[r.un_no, r.imo_class, r.packing_group].filter(Boolean).join(" / ") || "—"}</td><td style={TD}>{r.sg ?? "—"}</td></>
                    : kind === "PORT" ? <><td style={TD}>{r.country || "—"}</td><td style={TD}>{r.pod_rebate != null ? `$${r.pod_rebate}` : "—"}</td></>
                    : <><td style={{ ...TD, whiteSpace: "pre-line", fontSize: 12 }}>{[r.address, [r.city, r.country].filter(Boolean).join(", ")].filter(Boolean).join("\n") || "—"}</td><td style={{ ...TD, fontSize: 12 }}>{[r.contact_name, r.phone, r.email].filter(Boolean).join(" · ") || "—"}</td></>}
                  <td style={{ ...TD, fontSize: 12, color: "#666" }}>{[kind !== "PRODUCT" && kind !== "PORT" && kind !== "DEPOT" ? r.payment_terms : null, r.notes].filter(Boolean).join(" · ") || ""}</td>
                  <td style={{ ...TD, whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => startEdit(r)} style={{ ...BTN(false), padding: "3px 8px", fontSize: 11 }}>Edit</button>{" "}
                    <button onClick={() => remove(r)} style={{ ...BTN(false, "#C53030"), padding: "3px 8px", fontSize: 11 }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
