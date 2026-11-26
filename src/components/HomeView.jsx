import { useEffect, useState } from "react";
import { TankIcon } from "./TankLoader.jsx";
import { transitDays, allocatedDays } from "../lib/tankLogic.js";
import { fetchAttention, fetchAccounts } from "../crm/lib/crmApi.js";

// Welcome page (Alex, 9 Nov; refined 12 Nov: "looks very crude - make it presentable and user-friendly").
// Three parts: greeting + what needs attention today, the three sections with their live numbers and quick
// links, and the tools shared by everyone. Quiet, card-based, one accent per section.
const INK = "#231E1E", MUTED = "#8a8578", LINE = "#e6e2d8", BG = "#fff";
const SECTIONS = { inv: "#231E1E", quotes: "#F09128", hr: "#2E7D5B", crm: "#6B46C1" };
const today = () => new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

function Stat({ label, value, onClick, tone }) {
  return (
    <button onClick={onClick} disabled={!onClick} style={{ textAlign: "left", background: "transparent", border: "none", padding: "6px 8px", borderRadius: 6, cursor: onClick ? "pointer" : "default", minWidth: 0 }}
      onMouseEnter={(e) => { if (onClick) e.currentTarget.style.background = "#f6f4ee"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
      <div style={{ fontSize: typeof value === "number" ? 22 : 16, fontWeight: 700, color: tone || INK, lineHeight: 1.3, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 11, color: MUTED, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
    </button>
  );
}
function Chip({ label, onClick, accent }) {
  return (
    <button onClick={onClick} style={{ border: `1px solid ${LINE}`, background: BG, color: INK, borderRadius: 999, padding: "5px 11px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.color = accent; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = LINE; e.currentTarget.style.color = INK; }}>{label}</button>
  );
}
function Section({ title, desc, accent, icon, stats, links, cta, onOpen }) {
  return (
    <div style={{ background: BG, border: `1px solid ${LINE}`, borderRadius: 12, padding: "16px 18px 14px", display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 1px 2px rgba(35,30,30,0.04)", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flex: "none" }}>{icon}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: INK, lineHeight: 1.2 }}>{title}</div>
          <div style={{ fontSize: 12, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{desc}</div>
        </div>
        <button onClick={onOpen} style={{ border: "none", background: accent, color: "#fff", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{cta} {"→"}</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "2px 6px", borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}`, padding: "6px 0" }}>
        {stats.map((s) => <Stat key={s.label} {...s} />)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{links.map((l) => <Chip key={l.label} label={l.label} onClick={l.onClick} accent={accent} />)}</div>
    </div>
  );
}
function Alert({ count, text, onClick, tone }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 10, background: BG, border: `1px solid ${LINE}`, borderLeft: `4px solid ${tone}`, borderRadius: 8, padding: "9px 12px", cursor: "pointer", textAlign: "left", minWidth: 0 }}>
      <span style={{ fontSize: 18, fontWeight: 800, color: tone, fontVariantNumeric: "tabular-nums" }}>{count}</span>
      <span style={{ fontSize: 12.5, color: INK, lineHeight: 1.25 }}>{text}</span>
    </button>
  );
}
function Tool({ icon, title, sub, onClick }) {
  return (
    <button onClick={onClick} style={{ textAlign: "left", display: "flex", gap: 12, alignItems: "center", background: BG, border: `1px solid ${LINE}`, borderRadius: 10, padding: "11px 13px", cursor: "pointer", minWidth: 0 }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(35,30,30,0.08)"; }} onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; }}>
      <span style={{ width: 34, height: 34, borderRadius: 9, background: "#f3f1ea", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flex: "none" }}>{icon}</span>
      <span style={{ minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 13.5, color: INK }}>{title}</div><div style={{ fontSize: 11.5, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div></span>
    </button>
  );
}

export default function HomeView({ user, profile, tanks, qcounts, hrStatus = {}, crmAllowed = false, pendingCount = 0, requestCount = 0, eventCount = 0, partyAtt = {}, onGo }) {
  const [crm, setCrm] = useState(null);
  useEffect(() => { if (!crmAllowed) return; Promise.all([fetchAccounts(), fetchAttention()]).then(([a, att]) => setCrm({ accounts: a, att })).catch(() => setCrm(null)); }, [crmAllowed]);
  const fleet = tanks.filter((t) => t.ownership !== "THIRD_PARTY" && t.ownership !== "CUSTOMER_OWNED");
  const n = (f) => fleet.filter(f).length;
  const me = hrStatus.me || null;
  const isHr = hrStatus.level === "HR" || hrStatus.level === "MANAGEMENT";
  const rawName = (me && (me.short_name || me.full_name)) || (profile && profile.full_name) || (user && user.email ? user.email.split("@")[0].split(".")[0] : "");
  const name = rawName ? rawName.charAt(0).toUpperCase() + rawName.slice(1) : "";
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // what needs attention today - computed from the data the shell already holds
  const todayIso = new Date().toISOString().slice(0, 10);
  const in60 = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  const stale = n((t) => (allocatedDays(t) || 0) > 14);
  const longTransit = n((t) => t.status === "IN TRANSIT" && (transitDays(t) || 0) > 45);
  const noEta = n((t) => (t.status === "DEPOT OUT" || t.status === "EXPORT OUT") && !t.etaPod);
  const testsDue = n((t) => t.nextTestDate && t.nextTestDate <= in60 && t.status !== "MT UC");
  const alerts = [
    pendingCount && { count: pendingCount, text: "jobs opened from a quote still waiting for tanks", onClick: () => onGo("pending"), tone: "#F09128" },
    requestCount && { count: requestCount, text: "booking requests from the portal waiting for a reply", onClick: () => onGo("q:requests"), tone: "#1f6fb2" },
    eventCount && { count: eventCount, text: "tank updates reported by agents waiting to be applied", onClick: () => onGo("agentupdates"), tone: "#F09128" },
    partyAtt.canApprove && partyAtt.pending && { count: partyAtt.pending, text: "new customers / vendors waiting for your approval", onClick: () => onGo("q:parties"), tone: "#B7791F" },
    partyAtt.licences && { count: partyAtt.licences, text: "customer / vendor trade licences expiring within 60 days", onClick: () => onGo("q:parties"), tone: "#C53030" },
    stale && { count: stale, text: "tanks allocated over 14 days and not yet out of the depot", onClick: () => onGo("allocated"), tone: "#B7791F" },
    longTransit && { count: longTransit, text: "tanks in transit over 45 days - arrival probably not entered", onClick: () => onGo("arrival"), tone: "#C53030" },
    noEta && { count: noEta, text: "export tanks without an ETA at POD", onClick: () => onGo("depotout"), tone: "#B7791F" },
    testsDue && { count: testsDue, text: "tanks with a test due within 60 days", onClick: () => onGo("reports"), tone: "#1f6fb2" },
    hrStatus.approvals && { count: hrStatus.approvals, text: "HR requests waiting for your approval", onClick: () => onGo("h:approvals"), tone: SECTIONS.hr },
    isHr && hrStatus.expiring && { count: hrStatus.expiring, text: "staff documents expiring within 90 days", onClick: () => onGo("h:people"), tone: "#C53030" },
    crm && crm.att.filter((x) => x.kind === "OVERDUE").length && { count: crm.att.filter((x) => x.kind === "OVERDUE").length, text: "customer follow-ups overdue", onClick: () => onGo("c:activities"), tone: "#C53030" },
    crm && crm.att.filter((x) => x.kind === "DUE_TODAY" || x.kind === "MEETING_TODAY").length && { count: crm.att.filter((x) => x.kind === "DUE_TODAY" || x.kind === "MEETING_TODAY").length, text: "customer follow-ups or meetings today", onClick: () => onGo("c:activities"), tone: SECTIONS.crm },
  ].filter(Boolean);
  const director = me && me.is_director;
  const quickHr = !me ? null : isHr ? { label: "HR dashboard", key: "h:dashboard" } : director ? { label: "My profile", key: "h:me" } : { label: "Check in / out", key: "h:attendance" };

  return (
    <div style={{ maxWidth: 1180, display: "grid", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, color: INK, letterSpacing: "-0.01em" }}>{greet}{name ? `, ${name}` : ""}.</div>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>{today()}{me && me.office ? ` · ${me.office === "COCHIN" ? "Cochin" : "Dubai"} office` : ""}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {quickHr && <button onClick={() => onGo(quickHr.key)} style={{ border: "none", background: SECTIONS.hr, color: "#fff", borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{quickHr.label}</button>}
          <button onClick={() => onGo("ask")} style={{ border: `1px solid ${INK}`, background: BG, color: INK, borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", gap: 8, alignItems: "center" }}><TankIcon size={18} /> Ask Genesis</button>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Needs attention</div>
        {alerts.length ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 8 }}>{alerts.map((a, i) => <Alert key={i} {...a} />)}</div>
        ) : (
          <div style={{ background: BG, border: `1px solid ${LINE}`, borderLeft: `4px solid ${SECTIONS.hr}`, borderRadius: 8, padding: "9px 12px", fontSize: 12.5, color: INK }}>All clear - nothing is overdue right now.</div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 14 }}>
        <Section title="Inventory" desc="Tank master, fleet lifecycle, leases, demurrage, reports" accent={SECTIONS.inv} icon={"▣"} cta="Open" onOpen={() => onGo("dashboard")}
          stats={[
            { label: "Fleet", value: fleet.length, onClick: () => onGo("master") },
            { label: "Available", value: n((t) => t.status === "MT AVAILABLE"), onClick: () => onGo("available"), tone: "#2E7D5B" },
            { label: "Allocated", value: n((t) => t.status === "MT ALLOCATED"), onClick: () => onGo("allocated") },
            { label: "Export out", value: n((t) => t.status === "DEPOT OUT" || t.status === "EXPORT OUT"), onClick: () => onGo("depotout") },
            { label: "In transit", value: n((t) => t.status === "IN TRANSIT"), onClick: () => onGo("arrival") },
            { label: "On lease", value: n((t) => t.status === "ON LEASE"), onClick: () => onGo("localLease") },
          ]}
          links={[{ label: "Daily status", onClick: () => onGo("daily") }, { label: "Depot tanks", onClick: () => onGo("depot") }, { label: "Demurrage", onClick: () => onGo("demurrage") }, { label: "Utilisation", onClick: () => onGo("utilisation") }, { label: "Reports", onClick: () => onGo("reports") }]} />
        <Section title="Quotes" desc="Costing, quotations, bills of lading, invoices" accent={SECTIONS.quotes} icon={"≡"} cta="Open" onOpen={() => onGo("q:dashboard")}
          stats={[
            { label: "Quotes", value: qcounts.total || 0, onClick: () => onGo("q:list") },
            { label: "Draft", value: qcounts.DRAFT || 0, onClick: () => onGo("q:list:DRAFT") },
            { label: "Saved", value: qcounts.SAVED || 0, onClick: () => onGo("q:list:SAVED") },
            { label: "Confirmed", value: qcounts.CONFIRMED || 0, onClick: () => onGo("q:list:CONFIRMED"), tone: "#2E7D5B" },
            { label: "Lost", value: qcounts.LOST || 0, onClick: () => onGo("q:list:LOST"), tone: qcounts.LOST ? "#C53030" : undefined },
          ]}
          links={[{ label: "+ New quote", onClick: () => onGo("q:new") }, { label: "Invoices", onClick: () => onGo("q:invoices") }, { label: "Sailings & rates", onClick: () => onGo("q:sailings") }, { label: "Profitability", onClick: () => onGo("q:profit") }, { label: "Compatibility", onClick: () => onGo("q:compat") }]} />
        <Section title="HR" desc="Attendance, leave, approvals, people, loans, updates" accent={SECTIONS.hr} icon={"☺"} cta="Open" onOpen={() => onGo(quickHr ? quickHr.key : "h:me")}
          stats={isHr ? [
            { label: "Active staff", value: hrStatus.active || 0, onClick: () => onGo("h:people") },
            { label: "Approvals waiting", value: hrStatus.approvals || 0, onClick: () => onGo("h:approvals"), tone: hrStatus.approvals ? "#B7791F" : undefined },
            { label: "Docs due (90 d)", value: hrStatus.expiring || 0, onClick: () => onGo("h:people"), tone: hrStatus.expiring ? "#C53030" : undefined },
          ] : [
            { label: "My level", value: hrStatus.level === "NONE" || !hrStatus.level ? "-" : hrStatus.level.charAt(0) + hrStatus.level.slice(1).toLowerCase(), onClick: () => onGo("h:me") },
            { label: "Approvals waiting", value: hrStatus.approvals || 0, onClick: () => onGo("h:approvals"), tone: hrStatus.approvals ? "#B7791F" : undefined },
            { label: "Office", value: me && me.office ? (me.office === "COCHIN" ? "Cochin" : "Dubai") : "-" },
          ]}
          links={[...(director ? [] : [{ label: "My attendance", onClick: () => onGo("h:attendance") }, { label: "My leave", onClick: () => onGo("h:leave") }]), { label: "My profile", onClick: () => onGo("h:me") }, { label: "Updates", onClick: () => onGo("h:updates") }, ...(isHr ? [{ label: "People & documents", onClick: () => onGo("h:people") }] : [])]} />
        {crmAllowed && <Section title="CRM" desc="Customers, prospects, calls & meetings, profit by customer" accent={SECTIONS.crm} icon={"\u2606"} cta="Open" onOpen={() => onGo("c:dashboard")}
          stats={[
            { label: "Customers", value: crm ? crm.accounts.filter((a) => a.kind === "CUSTOMER" && a.status === "ACTIVE").length : "-", onClick: () => onGo("c:accounts") },
            { label: "Open prospects", value: crm ? crm.accounts.filter((a) => a.kind === "PROSPECT" && !["WON", "LOST"].includes(a.stage)).length : "-", onClick: () => onGo("c:pipeline") },
            { label: "Follow-ups overdue", value: crm ? crm.att.filter((x) => x.kind === "OVERDUE").length : "-", onClick: () => onGo("c:activities"), tone: crm && crm.att.some((x) => x.kind === "OVERDUE") ? "#C53030" : undefined },
          ]}
          links={[{ label: "Accounts", onClick: () => onGo("c:accounts") }, { label: "Pipeline", onClick: () => onGo("c:pipeline") }, { label: "Log a call", onClick: () => onGo("c:activities") }]} />}
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Tools for everyone</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 8 }}>
          <Tool icon={<TankIcon size={22} />} title="Ask Genesis" sub="Questions answered from live data" onClick={() => onGo("ask")} />
          <Tool icon={"☷"} title="Daily Status" sub="Today's inventory status report" onClick={() => onGo("daily")} />
          <Tool icon={"⛴"} title="Sailings & Rates" sub="Vessel schedules and carrier rate cards" onClick={() => onGo("q:sailings")} />
          <Tool icon={"☑"} title="Invoices" sub="Invoiced, partially invoiced, still to invoice" onClick={() => onGo("q:invoices")} />
          <Tool icon={"▤"} title="Utilisation" sub="Fleet utilisation report and dashboard" onClick={() => onGo("utilisation")} />
          <Tool icon={"☰"} title="Tank Master" sub="Find any tank" onClick={() => onGo("master")} />
        </div>
      </div>
    </div>
  );
}
