// CRM > Customer portal: who can log in to the portal and what they see (Inventory 099).
import { useCallback, useEffect, useMemo, useState } from "react";
import { INPUT, BTN, PRIMARY, DANGER, CARD, TH, TD, Field, Msg, Pill, Tile, Empty } from "../../hr/components/ui.jsx";
import { fetchPortalAccounts, fetchPortalUsers, fetchPortalLog, savePortalAccount, deletePortalAccount, setPortalUserActive, previewShipments, portalAdmin, PORTAL_KINDS } from "../lib/portalApi.js";

const MUTED = "#8a8578";
const fmtDT = (s) => (s ? new Date(s).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const STAGE = { PENDING: ["Awaiting tanks", "#8a8578"], ALLOCATED: ["Tanks allocated", "#1f6fb2"], LOADING: ["Loading", "#B7791F"], GATED_IN: ["Gated in", "#B7791F"], ON_WATER: ["On water", "#F09128"], ARRIVED: ["Arrived", "#2E7D5B"], RETURNED: ["Completed", "#231E1E"], CANCELLED: ["Cancelled", "#C53030"] };
const KIND_COLOR = { CUSTOMER: "#2E7D5B", AGENT: "#1f6fb2" };
const joinList = (a) => (a || []).join(", ");

function AccountForm({ value, crmAccounts, onSaved, onClose }) {
  const [d, setD] = useState(() => ({ ...value, customer_names: joinList(value.customer_names), shipper_names: joinList(value.shipper_names), product_patterns: joinList(value.product_patterns), job_numbers: joinList(value.job_numbers), agent_names: joinList(value.agent_names) }));
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const set = (k) => (e) => setD((p) => ({ ...p, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const save = async () => { setBusy(true); setErr(null); try { await onSaved(await savePortalAccount(d)); } catch (e) { setErr(e.message || String(e)); setBusy(false); } };
  const del = async () => { if (!window.confirm(`Delete portal account "${value.name}" and all its logins? Their portal users will no longer be able to sign in.`)) return; try { await deletePortalAccount(value.id); await onSaved(null); } catch (e) { setErr(e.message || String(e)); } };
  return (
    <div style={{ ...CARD, borderColor: "#F09128", marginBottom: 12 }}>
      <div style={{ fontWeight: 800, marginBottom: 10 }}>{value.id ? `Edit ${value.name}` : "New portal account"}</div>
      <Msg text={err} onClose={() => setErr(null)} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <Field label="Company name"><input style={INPUT} value={d.name || ""} onChange={set("name")} placeholder="Lubrizol" /></Field>
        <Field label="Kind"><select style={INPUT} value={d.kind || "CUSTOMER"} onChange={set("kind")}>{PORTAL_KINDS.map((k) => <option key={k} value={k}>{k === "CUSTOMER" ? "Customer - sees its shipments" : "Agent - enters sailings"}</option>)}</select></Field>
        <Field label="CRM account (optional)"><select style={INPUT} value={d.crm_account_id || ""} onChange={set("crm_account_id")}><option value="">—</option>{crmAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <Field label="Customer names on jobs / tanks" hint="Comma separated, exactly as on the quote or tank. The account sees every job with one of these customers."><input style={INPUT} value={d.customer_names} onChange={set("customer_names")} placeholder="LUBRIZOL, LUBRIZOL INDIA" /></Field>
        <Field label="Shipper names on quotes" hint="For cargo booked through an agent: the shipper on the quote."><input style={INPUT} value={d.shipper_names} onChange={set("shipper_names")} placeholder="LUBRIZOL" /></Field>
        <Field label="Product patterns" hint="SQL LIKE patterns on the product, e.g. LUBRIZOL% matches 'Lubrizol 9297'."><input style={INPUT} value={d.product_patterns} onChange={set("product_patterns")} placeholder="LUBRIZOL%" /></Field>
        <Field label="Extra job numbers" hint="Specific jobs to include whatever the names say."><input style={INPUT} value={d.job_numbers} onChange={set("job_numbers")} /></Field>
        <Field label="Agent names on quotes (agents)" hint="As typed in POL agent / POD agent on the quote. The agent sees bookings where it is the POL agent (until sailed + 14 days) or the POD agent (from sailing)."><input style={INPUT} value={d.agent_names || ""} onChange={set("agent_names")} placeholder="SEASPEED, SEA SPEED" /></Field>
        <Field label="Options"><div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, paddingTop: 6 }}>
          <label><input type="checkbox" checked={!!d.can_edit_sailings} onChange={set("can_edit_sailings")} /> Can enter and edit sailings (agents)</label>
          <label><input type="checkbox" checked={d.active !== false} onChange={set("active")} /> Active</label>
        </div></Field>
        <Field label="Notes"><input style={INPUT} value={d.notes || ""} onChange={set("notes")} /></Field>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button style={PRIMARY} disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        <button style={BTN} onClick={onClose}>Cancel</button>
        {value.id && <button style={{ ...DANGER, marginLeft: "auto" }} onClick={del}>Delete account</button>}
      </div>
    </div>
  );
}

function NewLogin({ account, onDone }) {
  const [email, setEmail] = useState(""); const [name, setName] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null); const [result, setResult] = useState(null);
  const create = async () => {
    setBusy(true); setErr(null);
    try { const r = await portalAdmin("create", { email, name, accountId: account.id }); setResult(r); await onDone(); }
    catch (e) { setErr(e.message || String(e)); }
    setBusy(false);
  };
  if (result) return (
    <div style={{ ...CARD, background: "#EAF5EE", borderColor: "#2E7D5B", marginTop: 8 }}>
      <div style={{ fontWeight: 800, marginBottom: 6 }}>{result.existed ? "Password reset for" : "Login created for"} {result.email}</div>
      <div style={{ fontSize: 13 }}>Temporary password: <code style={{ fontSize: 16, fontWeight: 800, background: "#fff", padding: "2px 8px", borderRadius: 4, letterSpacing: "0.05em" }}>{result.password}</code></div>
      <div style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>Shown once. Pass it to the person by phone or a separate message{result.portalUrl ? <> together with the portal address <b>{result.portalUrl}</b></> : ""}. They must change it on first sign-in.</div>
      <button style={{ ...BTN, marginTop: 8 }} onClick={() => { setResult(null); setEmail(""); setName(""); }}>Add another</button>
    </div>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr auto", gap: 8, alignItems: "end", marginTop: 8 }}>
      <Field label="E-mail"><input style={INPUT} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" /></Field>
      <Field label="Name"><input style={INPUT} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <button style={PRIMARY} disabled={busy || !email.includes("@")} onClick={create}>{busy ? "Creating…" : "Create login"}</button>
      {err && <div style={{ gridColumn: "1 / -1", color: "#C53030", fontSize: 12 }}>{err}</div>}
    </div>
  );
}

function Preview({ account }) {
  const [rows, setRows] = useState(null); const [err, setErr] = useState(null);
  useEffect(() => { let on = true; previewShipments(account.id).then((r) => on && setRows(r || [])).catch((e) => on && setErr(e.message)); return () => { on = false; }; }, [account.id]);
  if (err) return <Msg text={`Preview failed: ${err}`} />;
  if (!rows) return <div style={{ fontSize: 12, color: MUTED }}>Loading preview…</div>;
  if (!rows.length) return <Empty text="No jobs match this account's names yet. Check the customer / shipper names against the quotes." />;
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>{rows.length} shipment{rows.length === 1 ? "" : "s"} visible to {account.name} today</div>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760 }}>
        <thead><tr>{["Job", "Stage", "Customer", "Lane", "Product", "Tanks", "Depot out", "Sailed", "ETA / arrived", "Returned"].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{rows.slice(0, 40).map((r) => { const st = STAGE[r.stage] || [r.stage, MUTED]; return (
          <tr key={r.job_number}><td style={{ ...TD, fontFamily: "monospace" }}>{r.job_number}</td><td style={TD}><Pill text={st[0]} color={st[1]} /></td><td style={TD}>{r.customer}{r.shipper && r.shipper !== r.customer ? <span style={{ color: MUTED }}> · {r.shipper}</span> : ""}</td>
            <td style={TD}>{r.pol} → {r.pod}</td><td style={TD}>{r.product}</td><td style={{ ...TD, textAlign: "right" }}>{r.tank_count}/{r.tanks_required}</td><td style={TD}>{r.depot_out || "—"}</td><td style={TD}>{r.sailed || "—"}</td><td style={TD}>{r.arrived || r.eta || "—"}</td><td style={{ ...TD, textAlign: "right" }}>{r.returned_count}</td></tr>); })}</tbody>
      </table>
    </div>
  );
}

export default function PortalAdminView({ crmAccounts = [] }) {
  const [accounts, setAccounts] = useState([]); const [users, setUsers] = useState([]); const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true); const [err, setErr] = useState(null); const [msg, setMsg] = useState(null);
  const [edit, setEdit] = useState(null); const [open, setOpen] = useState(null); const [showLog, setShowLog] = useState(false);

  const load = useCallback(async () => {
    try { const [a, u, l] = await Promise.all([fetchPortalAccounts(), fetchPortalUsers(), fetchPortalLog(80)]); setAccounts(a || []); setUsers(u || []); setLog(l || []); setErr(null); }
    catch (e) { setErr(e.message || String(e)); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const usersByAccount = useMemo(() => { const m = new Map(); users.forEach((u) => { if (!m.has(u.account_id)) m.set(u.account_id, []); m.get(u.account_id).push(u); }); return m; }, [users]);
  const logins30 = useMemo(() => log.filter((l) => l.action === "LOGIN" && Date.now() - new Date(l.at) < 30 * 86400000).length, [log]);

  const reset = async (u) => {
    if (!window.confirm(`Reset the portal password for ${u.email}? The old password stops working immediately.`)) return;
    try { const r = await portalAdmin("reset", { email: u.email }); window.prompt(`New temporary password for ${u.email} (copy it now - shown once):`, r.password); await load(); } catch (e) { setMsg(e.message); }
  };
  const remove = async (u) => {
    if (!window.confirm(`Remove the portal login for ${u.email}? This cannot be undone.`)) return;
    try { await portalAdmin("remove", { email: u.email }); setMsg("Login deleted"); await load(); } catch (e) { setMsg(e.message); }
  };
  const toggle = async (u) => { try { await setPortalUserActive(u.id, !u.active); await load(); } catch (e) { setMsg(e.message); } };
  // "View portal as": opens the live portal in a new tab exactly as this account sees it (read-only, 30 minutes, logged) - Inventory 111
  const viewAs = async (a) => {
    const w = window.open("", "_blank");
    try { const r = await portalAdmin("preview", { accountId: a.id }); if (w) w.location = r.url; else window.open(r.url, "_blank"); setMsg(`Portal opened as ${a.name} (read-only preview, valid 30 minutes).`); await load(); }
    catch (e) { if (w) w.close(); setMsg(e.message); }
  };

  if (loading) return <div>Loading customer portal…</div>;
  if (err) return <Msg text={`Customer portal: ${err}${/does not exist|schema|permission/i.test(err) ? " - has Inventory migration 099 been run, and is schema portal exposed in the Data API?" : ""}`} />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: MUTED, maxWidth: 640 }}>Who can sign in to the customer portal and which shipments they see. Customers see tracking and published sailings; agents also enter sailings. Logins are created here; the temporary password is shown once.</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={BTN} onClick={() => setShowLog((v) => !v)}>{showLog ? "Hide activity" : "Activity log"}</button>
          <button style={PRIMARY} onClick={() => setEdit({ kind: "CUSTOMER", active: true })}>+ Portal account</button>
        </div>
      </div>
      <Msg text={msg} onClose={() => setMsg(null)} />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <Tile label="Portal accounts" value={accounts.filter((a) => a.active).length} sub={`${accounts.filter((a) => a.kind === "AGENT").length} agent${accounts.filter((a) => a.kind === "AGENT").length === 1 ? "" : "s"}`} />
        <Tile label="Logins" value={users.filter((u) => u.active).length} color="#2E7D5B" sub={`${users.filter((u) => u.must_change_password).length} not yet signed in`} />
        <Tile label="Sign-ins, 30 days" value={logins30} color="#F09128" />
      </div>
      {edit && <AccountForm value={edit} crmAccounts={crmAccounts} onSaved={async () => { setEdit(null); setMsg("Saved"); await load(); }} onClose={() => setEdit(null)} />}
      {showLog && (
        <div style={{ ...CARD, marginBottom: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Recent portal activity</div>
          {!log.length ? <Empty text="Nothing yet." /> : <table style={{ borderCollapse: "collapse", width: "100%" }}><tbody>{log.map((l) => (
            <tr key={l.id}><td style={{ ...TD, whiteSpace: "nowrap", color: MUTED }}>{fmtDT(l.at)}</td><td style={TD}>{l.email || "—"}</td><td style={TD}>{(accounts.find((a) => a.id === l.account_id) || {}).name || ""}</td><td style={TD}>{l.action === "PREVIEW_BY_GENESIS" ? "portal viewed by Genesis" : l.action.replace(/_/g, " ").toLowerCase()}{l.detail && l.detail.id ? ` · ${String(l.detail.id).slice(0, 8)}` : ""}{l.detail && l.detail.by ? ` by ${l.detail.by}` : ""}</td></tr>))}</tbody></table>}
        </div>
      )}
      {!accounts.length && <Empty text="No portal accounts yet. Add Lubrizol as a customer and Seaspeed as an agent." />}
      {accounts.map((a) => {
        const us = usersByAccount.get(a.id) || [];
        const isOpen = open === a.id;
        return (
          <div key={a.id} style={{ ...CARD, marginBottom: 10, opacity: a.active ? 1 : 0.6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{a.name}</div>
              <Pill text={a.kind} color={KIND_COLOR[a.kind]} />
              {a.can_edit_sailings && <Pill text="ENTERS SAILINGS" color="#B7791F" />}
              {!a.active && <Pill text="INACTIVE" color="#C53030" />}
              <div style={{ fontSize: 12, color: MUTED }}>{us.length} login{us.length === 1 ? "" : "s"}</div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <button style={{ ...BTN, background: "#F09128", border: "none", color: "#fff" }} onClick={() => viewAs(a)} title="Open the portal in a new tab exactly as this account sees it - read-only">View portal as {a.kind === "AGENT" ? "agent" : "customer"}</button>
                <button style={BTN} onClick={() => setOpen(isOpen ? null : a.id)}>{isOpen ? "Close" : "Logins & preview"}</button>
                <button style={BTN} onClick={() => setEdit(a)}>Edit</button>
              </div>
            </div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
              {[["Customers", a.customer_names], ["Shippers", a.shipper_names], ["Products", a.product_patterns], ["Jobs", a.job_numbers], ["Agent on quotes", a.agent_names]].filter(([, v]) => v && v.length).map(([k, v]) => <span key={k} style={{ marginRight: 10 }}>{k}: <b>{v.join(", ")}</b></span>)}{a.notes ? <div>{a.notes}</div> : null}
            </div>
            {isOpen && (
              <div style={{ marginTop: 10, borderTop: "1px solid #eee", paddingTop: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Logins</div>
                {!us.length ? <div style={{ fontSize: 12, color: MUTED }}>No logins yet.</div> : (
                  <table style={{ borderCollapse: "collapse", width: "100%" }}>
                    <thead><tr>{["E-mail", "Name", "Status", "Last sign-in", "Sign-ins", ""].map((h) => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                    <tbody>{us.map((u) => (
                      <tr key={u.id}>
                        <td style={TD}>{u.email}</td><td style={TD}>{u.name || "—"}</td>
                        <td style={TD}>{!u.active ? <Pill text="DISABLED" color="#C53030" /> : u.must_change_password ? <Pill text="TEMP PASSWORD" color="#B7791F" /> : <Pill text="ACTIVE" color="#2E7D5B" />}</td>
                        <td style={TD}>{fmtDT(u.last_login_at)}</td><td style={{ ...TD, textAlign: "right" }}>{u.login_count}</td>
                        <td style={{ ...TD, whiteSpace: "nowrap" }}>
                          <button style={{ ...BTN, padding: "4px 8px", fontSize: 11, marginRight: 4 }} onClick={() => reset(u)}>Reset password</button>
                          <button style={{ ...BTN, padding: "4px 8px", fontSize: 11, marginRight: 4 }} onClick={() => toggle(u)}>{u.active ? "Disable" : "Enable"}</button>
                          <button style={{ ...DANGER, padding: "4px 8px", fontSize: 11 }} onClick={() => remove(u)}>Remove</button>
                        </td>
                      </tr>))}</tbody>
                  </table>
                )}
                <NewLogin account={a} onDone={load} />
                <div style={{ fontWeight: 700, fontSize: 13, margin: "14px 0 4px" }}>What they see</div>
                <Preview account={a} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
