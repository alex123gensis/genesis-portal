import { useEffect, useMemo, useState, useCallback } from "react";
import genesisLogo from "./assets/genesis-logo.png";
import { fetchAllTanks, fetchPortNames, fetchCustomers, fetchPortCountries, fetchDepots } from "./lib/tanksApi.js";
import { buildPortMap } from "./lib/scope.js";
import { setScopeContext, currentScopeLabel } from "./lib/scopeStore.js";
import { AVAILABLE_STATUS } from "./lib/tankLogic.js";
import { buildDailyStatusHTML } from "./lib/dailyReport.js";
import { getCurrentUser, onAuthStateChange, fetchUserProfile, signOut } from "./lib/authApi.js";
import { canEditTab } from "./lib/permissions.js";
import LoginScreen from "./components/LoginScreen.jsx";
import TankList from "./components/TankList.jsx";
import CertificateBulkUpload from "./components/CertificateBulkUpload.jsx";
import DailyImport from "./components/DailyImport.jsx";
import TankDetail from "./components/TankDetail.jsx";
import ReportPreview from "./components/ReportPreview.jsx";
import PendingAllocationView from "./components/PendingAllocationView.jsx";
import { fetchOpenJobs } from "./quotes/lib/jobsApi.js";
import { ArrivalStage, FclStage, DepotStage, AvailableStage, AllocatedStage, DepotOutStage, RepoStage } from "./components/FleetStages.jsx";
import { registerFleet } from "./lib/jobDateCheck.js";
import { countOpenBookingRequests } from "./quotes/lib/bookingRequestsApi.js";
import { countOpenAgentEvents } from "./lib/agentEventsApi.js";
import AgentUpdatesView from "./components/AgentUpdatesView.jsx";
import PartyForm from "./quotes/components/PartyForm.jsx";
import { fetchParties, partiesAttention } from "./quotes/lib/partiesApi.js";
import DemurrageView from "./components/DemurrageView.jsx";
import LocalLeaseView from "./components/LocalLeaseView.jsx";
import ReportsView from "./components/ReportsView.jsx";
import Dashboard from "./components/Dashboard.jsx";
import ThirdPartyView from "./components/ThirdPartyView.jsx";
import CustomerTanksView from "./components/CustomerTanksView.jsx";
import UpdateLagView from "./components/UpdateLagView.jsx";
import SailingsView from "./components/SailingsView.jsx";
import RepairLogView from "./components/RepairLogView.jsx";
import AuditLogView from "./components/AuditLogView.jsx";
import TankLifecycleView from "./components/TankLifecycleView.jsx";
import ThirdPartyStatusView from "./components/ThirdPartyStatusView.jsx";
import DetentionProjectView from "./components/DetentionProjectView.jsx";
import DepotStorageView from "./components/DepotStorageView.jsx";
import FleetByOwnerView from "./components/FleetByOwnerView.jsx";
import UtilisationView from "./components/UtilisationView.jsx";
import { TankIcon } from "./components/TankLoader.jsx";
import AskHub from "./components/AskHub.jsx";
import HomeView from "./components/HomeView.jsx";
import QuotesApp, { QUOTES_NAV_GROUPS, isQuotesKey, quotesTitle, quotesWide } from "./quotes/QuotesApp.jsx";
import HrApp, { HR_ALL_ITEMS, hrNavGroups, isHrKey } from "./hr/HrApp.jsx";
import CrmApp, { CRM_NAV_GROUPS, isCrmKey } from "./crm/CrmApp.jsx";
import { fetchFlags as fetchQuoteFlags } from "./quotes/lib/jobsApi.js";
import { fetchMe as fetchHrMe, myApprovals as fetchHrApprovals, fetchEmployees as fetchHrEmployees, fetchDocuments as fetchHrDocuments } from "./hr/lib/hrApi.js";

// Side navigation (Alex, 13 Oct: "very cluttered - side tabs, click opens
// the page"). Groups collapse; counts show live stage sizes.
const HOME_GROUPS = [
  { title: "Welcome", items: [
    { key: "home", label: "Home", icon: "\u2302" },
    { key: "ask", label: "Ask Genesis", icon: <TankIcon size={18} /> },
    { key: "daily", label: "Daily Status", icon: "\u2637", action: true },
  ] },
];
const NAV_GROUPS = [
  { title: "Overview", items: [
    { key: "dashboard", label: "Dashboard", icon: "\u25A3" },
    { key: "master", label: "Tank Master", icon: "\u2630" },
    { key: "owners", label: "Fleet by Owner", icon: "\u2616" },
  ] },
  { title: "Fleet Lifecycle", items: [
    { key: "pending", label: "Pending Allocation", icon: "\u25CC", pcount: true, title: "Jobs opened from a quote that still need tanks" },
    { key: "available", label: "Empty Available", icon: "\u25CB", count: (t) => t.filter((x) => x.status === "MT AVAILABLE").length },
    { key: "allocated", label: "Empty Allocated", icon: "\u25D4", count: (t) => t.filter((x) => x.status === "MT ALLOCATED").length },
    { key: "depotout", label: "Export Out", icon: "\u2197", count: (t) => t.filter((x) => x.status === "DEPOT OUT" || x.status === "EXPORT OUT").length },
    { key: "arrival", label: "In Transit", icon: "\u2693", count: (t) => t.filter((x) => x.status === "IN TRANSIT").length },
    { key: "fcl", label: "FCL", icon: "\u25A0", count: (t) => t.filter((x) => x.status === "FCL" || x.status === "FCL LONG ON DEMURRAGE").length },
    { key: "depot", label: "Depot Tanks", icon: "\u2302", count: (t) => t.filter((x) => x.status === "MT UC").length },
    { key: "repo", label: "Tank Repo", icon: "\u21C4", count: (t) => t.filter((x) => x.status === "MT REPO").length },
    { key: "agentupdates", label: "Agent Updates", icon: "\u21BB", ucount: true, title: "Gate-in, sailing, arrival and return dates reported by agents through the portal" },
  ] },
  { title: "Commercial", items: [
    { key: "sailings", label: "Sailings", icon: "\u2693" },
    { key: "localLease", label: "On Lease", icon: "\u2696", count: (t) => t.filter((x) => x.status === "ON LEASE").length },
    { key: "demurrage", label: "Demurrage", icon: "\u23F1" },
    { key: "storage", label: "Depot Storage", icon: "\u2616" },
  ] },
  { title: "Other Fleets", items: [
    { key: "thirdparty", label: "Third Party", icon: "\u2691", count: (t) => t.filter((x) => x.ownership === "THIRD_PARTY").length, also: ["tpstatus"] },
    { key: "customer", label: "Customer Tanks", icon: "\u2691", count: (t) => t.filter((x) => x.ownership === "CUSTOMER_OWNED").length },
    { key: "detention", label: "Detention Project", icon: "\u26A0" },
  ] },
  { title: "Records", items: [
    { key: "lifecycle", label: "Tank Life Cycle", icon: "\u21BB" },
    { key: "repairs", label: "Repairs", icon: "\u2699" },
    { key: "history", label: "History", icon: "\u2630" },
    { key: "discipline", label: "Update Discipline", icon: "\u2691" },
  ] },
  { title: "Reports", items: [
    { key: "reports", label: "Reports", icon: "\u2637" },
    { key: "utilisation", label: "Utilisation", icon: "\u25A4" },
    { key: "daily", label: "Daily Status", icon: "\u2637", action: true },
  ] },
];
const ALL_ITEMS = [...HOME_GROUPS, ...NAV_GROUPS, ...QUOTES_NAV_GROUPS, ...CRM_NAV_GROUPS].flatMap((g) => g.items).concat(HR_ALL_ITEMS);
const itemFor = (tab) => ALL_ITEMS.find((i) => i.key === tab || (i.also || []).includes(tab)) || (isQuotesKey(tab) ? { key: tab, label: quotesTitle(tab) } : null);

function Sidebar({ tab, onPick, tanks, open, onClose, user, profile, availableCount, allocatedCount, qcounts, mode, onMode, hrStatus, crmAllowed, crmStatus, flags = {}, pendingCount = 0, eventCount = 0 }) {
  const isManager = !!(profile && (profile.is_manager || ["admin", "manager"].includes(profile.role)));
  const [collapsed, setCollapsed] = useState({});
  const current = itemFor(tab);
  const fleet = tanks.filter((t) => t.ownership !== "THIRD_PARTY" && t.ownership !== "CUSTOMER_OWNED");
  // Two sections (Alex, 9 Nov: "very cluttered - two main tabs, Inventory and Quotes, and put all related tabs inside")
  const groups = mode === "quotes" ? QUOTES_NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => (!i.flag || flags[i.flag] || isManager) && (!i.managerOnly || isManager)).map((i) => (i.flag && !flags[i.flag] ? { ...i, label: `${i.label} (preview)` } : i)) })) : mode === "home" ? HOME_GROUPS : mode === "hr" ? hrNavGroups(hrStatus.level, hrStatus.me) : mode === "crm" ? CRM_NAV_GROUPS : NAV_GROUPS;
  const tiles = mode === "quotes"
    ? [["Quotes", qcounts.total || 0, "#fff"], ["Draft", qcounts.DRAFT || 0, "#f4b860"], ["Confirmed", qcounts.CONFIRMED || 0, "#7fd1a3"]]
    : mode === "home" ? []
    : mode === "hr" ? [["Staff", hrStatus.active || 0, "#fff"], ["Approvals", hrStatus.approvals || 0, "#f4b860"], ["Docs due", hrStatus.expiring || 0, "#9ecbff"]]
    : mode === "crm" ? [["Accounts", crmStatus.accounts || 0, "#fff"], ["Overdue", crmStatus.overdue || 0, "#f4b860"], ["Due today", crmStatus.dueToday || 0, "#9ecbff"]]
    : [["Fleet", fleet.length, "#fff"], ["Available", availableCount, "#7fd1a3"], ["Allocated", allocatedCount, "#f4b860"]];
  return (
    <>
      {open && <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 40 }} className="gi-backdrop" />}
      <nav className={`gi-sidebar${open ? " open" : ""}`}>
        <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid #3a3434" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img src={genesisLogo} alt="Genesis" style={{ height: 30, width: "auto", background: "#fff", borderRadius: 4, padding: 2 }} />
            <div style={{ fontWeight: 800, fontSize: 15, color: "#fff" }}>Genesis Tank App</div>
          </div>
          {/* section list (Alex, 12 Nov: "expand the left side a bit or keep it as a list") */}
          <div style={{ display: "grid", gap: 3, marginTop: 10 }}>
            {[["home", "Home", "\u2302", null], ["inv", "Inventory", "\u25A3", fleet.length], ["quotes", "Quotes", "\u2261", qcounts.total || 0], ["hr", "HR", "\u263A", hrStatus.approvals || null], ...(crmAllowed ? [["crm", "CRM", "\u2606", (crmStatus.overdue || 0) + (crmStatus.dueToday || 0) || null]] : [])].map(([m, l, ic, c]) => (
              <button key={m} onClick={() => onMode(m)}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "7px 10px", border: "none", borderRadius: 6, cursor: "pointer", textAlign: "left",
                  background: mode === m ? "#F09128" : "#2d2828", color: mode === m ? "#fff" : "#d8d2c8", fontSize: 13, fontWeight: 700 }}>
                <span style={{ width: 18, textAlign: "center", fontSize: 14, opacity: 0.9 }}>{ic}</span>
                <span style={{ flex: 1 }}>{l}</span>
                {c !== null && c !== undefined && <span style={{ fontSize: 11, fontWeight: 700, background: mode === m ? "rgba(255,255,255,0.25)" : "#3a3434", color: mode === m ? "#fff" : (m === "hr" ? "#f4b860" : "#bdb6ad"), borderRadius: 10, padding: "1px 7px" }}>{c}</span>}
              </button>
            ))}
          </div>
          {tiles.length > 0 && <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            {tiles.map(([l, v, c]) => (
              <div key={l} style={{ flex: 1, background: "#3a3434", borderRadius: 6, padding: "6px 4px", textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: c }}>{v}</div>
                <div style={{ fontSize: 9, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.04em" }}>{l}</div>
              </div>
            ))}
          </div>}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {groups.map((g) => (
            <div key={g.title}>
              <button onClick={() => setCollapsed((c) => ({ ...c, [g.title]: !c[g.title] }))}
                style={{ width: "100%", textAlign: "left", background: "none", border: "none", color: "#9a938a", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", padding: "10px 16px 4px", cursor: "pointer" }}>
                {collapsed[g.title] ? "\u25B8" : "\u25BE"} {g.title}
              </button>
              {!collapsed[g.title] && g.items.map((it) => {
                const active = current && current.key === it.key;
                const n = it.count ? it.count(tanks) : it.pcount ? (pendingCount || null) : it.ucount ? (eventCount || null) : it.qcount ? (qcounts[it.qcount] || 0) : null;
                return (
                  <button key={it.key} onClick={() => { onPick(it); onClose(); }} title={it.title}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, textAlign: "left", padding: "8px 16px 8px 18px", border: "none", cursor: "pointer",
                      background: active ? "#F09128" : it.action ? "#3a3434" : "transparent", color: active ? "#fff" : it.action ? "#f4b860" : "#e8e4dc", fontWeight: active || it.action ? 800 : 600, fontSize: 13,
                      borderLeft: active ? "4px solid #fff" : "4px solid transparent" }}>
                    <span style={{ width: 16, textAlign: "center", opacity: 0.8 }}>{it.icon}</span>
                    <span style={{ flex: 1 }}>{it.label}</span>
                    {n != null && n > 0 && <span style={{ background: active ? "#fff" : "#3a3434", color: active ? "#F09128" : "#ddd", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>{n}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div style={{ padding: "10px 14px", borderTop: "1px solid #3a3434", fontSize: 11, color: "#bbb", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`${user.email} - ${currentScopeLabel()}`}>{user.email}{profile ? ` \u00b7 ${profile.role}` : ""}{profile && profile.scope_countries ? ` \u00b7 ${profile.scope_countries.join(" ")}` : ""}</span>
          <button onClick={signOut} style={{ padding: "4px 8px", border: "1px solid #666", background: "transparent", color: "#ddd", borderRadius: 4, fontSize: 11, cursor: "pointer", flex: "none" }}>Sign out</button>
        </div>
      </nav>
    </>
  );
}

const LAYOUT_CSS = `
  .gi-shell { display: flex; min-height: 100vh; font-family: Arial, sans-serif; background: #f6f4ef; }
  .gi-sidebar { width: 250px; flex: none; background: #231E1E; color: #fff; display: flex; flex-direction: column; position: sticky; top: 0; height: 100vh; z-index: 50; }
  .gi-main { flex: 1; min-width: 0; padding: 18px 22px 40px; }
  .gi-content { max-width: 980px; margin: 0 auto; }
  .gi-content.q { max-width: 1100px; }
  .gi-content.wide { max-width: 1280px; }
  .gi-topbar { display: none; }
  @media (max-width: 860px) {
    .gi-sidebar { position: fixed; left: -270px; transition: left .2s; height: 100vh; }
    .gi-sidebar.open { left: 0; }
    .gi-main { padding: 12px 12px 40px; }
    .gi-topbar { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  }
`;

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = still checking, null = not signed in
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    getCurrentUser().then(setUser);
    const unsubscribe = onAuthStateChange(setUser);
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) { setProfile(null); setScopeContext({ profile: null, portMap: {}, userId: null }); return; }
    fetchUserProfile(user.id).then(setProfile).catch(() => setProfile(null));
  }, [user]);
  // Region scope (Inventory 074): profile + port -> country map, kept in scopeStore for every tab.
  const [portMap, setPortMap] = useState({});
  useEffect(() => {
    if (!user) return;
    Promise.all([fetchPortCountries(), fetchDepots().catch(() => [])]).then(([ports, depots]) => setPortMap(buildPortMap(ports, depots))).catch(() => {});
  }, [user]);
  useEffect(() => { setScopeContext({ profile, portMap, userId: user ? user.id : null }); }, [profile, portMap, user]);

  const [tanks, setTanks] = useState([]);
  useEffect(() => { registerFleet(tanks); }, [tanks]);
  const [portNames, setPortNames] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  // ?tab=c:activities (CRM digest e-mail) opens that page after sign-in
  const [tab, setTab] = useState(() => { try { const t = (new URLSearchParams(window.location.search).get("tab") || "").trim(); return t && ALL_ITEMS.some((i) => i.key === t) ? t : "home"; } catch { return "home"; } });
  const [lifecycleTank, setLifecycleTank] = useState("");
  const openLifecycle = (tankNumber) => { setLifecycleTank(tankNumber); setTab("lifecycle"); };
  const [showDailyReport, setShowDailyReport] = useState(false);
  const [navOpen, setNavOpen] = useState(false); // mobile drawer (must be declared before the sign-in returns below)
  // Quotes section (merge stage 2): counts for the sidebar, "+ New Quote" trigger, and the job to open
  // (deep link ?job=GCT... from older links, or the sailing-date invoice check raising "genesis:open-job").
  const [qcounts, setQcounts] = useState({});
  const modeOf = (t) => (t === "home" || t === "ask" ? "home" : isQuotesKey(t) ? "quotes" : isHrKey(t) ? "hr" : isCrmKey(t) ? "crm" : "inv");
  const mode = modeOf(tab);
  const [hrStatus, setHrStatus] = useState({ level: "NONE" });
  useEffect(() => { if (user) { fetchHrMe().then(({ level, me }) => setHrStatus((st) => ({ ...st, level, me }))).catch(() => {}); fetchHrApprovals().then((a) => setHrStatus((st) => ({ ...st, approvals: (a || []).length }))).catch(() => {});
      Promise.all([fetchHrEmployees(), fetchHrDocuments().catch(() => [])]).then(([emps, docs]) => setHrStatus((st) => ({ ...st, active: emps.filter((e) => e.active && !e.is_director).length, expiring: docs.filter((d) => d.expiry_date && (new Date(d.expiry_date) - Date.now()) / 86400000 <= 90).length }))).catch(() => {}); } }, [user]);
  const [lastTab, setLastTab] = useState({ home: "home", inv: "dashboard", quotes: "q:dashboard", hr: "h:attendance", crm: "c:dashboard" });
  const [crmStatus, setCrmStatus] = useState({});
  const [flags, setFlags] = useState({});
  useEffect(() => { if (user) fetchQuoteFlags().then(setFlags).catch(() => {}); }, [user]);
  useEffect(() => { setLastTab((l) => ({ ...l, [modeOf(tab)]: tab })); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const switchMode = (m) => { setTab(m === "quotes" ? (lastTab.quotes || "q:dashboard") : m === "home" ? "home" : m === "hr" ? (lastTab.hr || "h:attendance") : m === "crm" ? (lastTab.crm || "c:dashboard") : (lastTab.inv || "dashboard")); window.scrollTo({ top: 0 }); };
  // CRM (Alex, 13 Nov): managers and Management only - a Tank App manager / admin profile or an HR level of MANAGER / MANAGEMENT
  const crmAllowed = !!(profile && (profile.is_manager || ["admin", "manager"].includes(profile.role))) || ["MANAGER", "MANAGEMENT"].includes(hrStatus.level);
  const [createNonce, setCreateNonce] = useState(0);
  const [focusJob, setFocusJob] = useState(() => { try { return (new URLSearchParams(window.location.search).get("job") || "").trim().toUpperCase(); } catch { return ""; } });
  useEffect(() => {
    if (focusJob) { setTab("q:list"); try { window.history.replaceState({}, "", window.location.pathname); } catch { /* ignore */ } }
  }, [focusJob]);
  useEffect(() => {
    const h = (e) => { const job = String((e.detail && e.detail.job) || e.detail || "").trim().toUpperCase(); if (job) { setFocusJob(job); setTab("q:list"); window.scrollTo({ top: 0 }); } };
    window.addEventListener("genesis:open-job", h);
    const h2 = (e) => { const job = String((e.detail && e.detail.job) || e.detail || "").trim().toUpperCase(); if (job) { setFocusJobPage(job); setTab("q:jobs"); window.scrollTo({ top: 0 }); } };
    window.addEventListener("genesis:open-jobpage", h2);
    const h3 = () => { load(); };   // a job delete released its tanks (094): refresh the fleet
    window.addEventListener("genesis:tanks-changed", h3);
    return () => { window.removeEventListener("genesis:open-job", h); window.removeEventListener("genesis:open-jobpage", h2); window.removeEventListener("genesis:tanks-changed", h3); };
  }, []);
  const [focusJobPage, setFocusJobPage] = useState("");
  // jobs waiting for tanks (Inventory > Pending Allocation badge): open jobs whose allocated tanks fall short of required
  const [openJobs, setOpenJobs] = useState([]);
  const [requestCount, setRequestCount] = useState(0);
  const [eventCount, setEventCount] = useState(0);
  const pendingCount = useMemo(() => { const m = {}; tanks.forEach((t) => { const jn = String(t.manualJobNumber || "").trim().toUpperCase(); if (jn) m[jn] = (m[jn] || 0) + 1; }); return openJobs.filter((j) => (Number(j.tanks_required) || 0) - Math.max(m[j.job_number] || 0, Number(j.tanks_allocated) || 0) > 0).length; }, [openJobs, tanks]);

  const load = useCallback(async () => {
    try {
      const [data, ports, custs] = await Promise.all([fetchAllTanks(), fetchPortNames(), fetchCustomers()]);
      setTanks(data);
      fetchOpenJobs().then((r) => setOpenJobs(r || [])).catch(() => {});
      countOpenBookingRequests().then(setRequestCount).catch(() => {});
      countOpenAgentEvents().then(setEventCount).catch(() => {});
      partiesAttention().then(setPartyAtt).catch(() => {});
      setPortNames(ports);
      setCustomers(custs);
      setError(null);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Inventory 113: customers are created in the register (pop-up form), never from a typed name
  const [newParty, setNewParty] = useState(null); const [partyList, setPartyList] = useState([]); const [partyAtt, setPartyAtt] = useState({ pending: 0, licences: 0, canApprove: false });
  const handleAddCustomer = async (name) => { try { setPartyList(await fetchParties()); } catch { setPartyList([]); } setNewParty({ name: String(name || ""), roles: ["CUSTOMER"] }); };

  useEffect(() => { if (user) load(); }, [user, load]);

  const selected = tanks.find((t) => t.id === selectedId) || null;
  const availableCount = tanks.filter((t) => t.status === AVAILABLE_STATUS).length;
  const allocatedCount = tanks.filter((t) => t.status === "MT ALLOCATED").length;

  if (user === undefined) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#999" }}>Checking sign-in…</div>;
  }
  if (user === null) {
    return <LoginScreen />;
  }

  const pick = (it) => {
    if (it.action && it.key === "daily") { setShowDailyReport(true); return; }
    if (it.action && it.key === "q:new") { setTab("q:list"); setCreateNonce((n) => n + 1); window.scrollTo({ top: 0 }); return; }
    setTab(it.key); window.scrollTo({ top: 0 });
  };
  const current = itemFor(tab);
  const canEdit = (k) => canEditTab(profile?.role, k);

  return (
    <div className="gi-shell">
      <style>{LAYOUT_CSS}</style>
      <Sidebar tab={tab} onPick={pick} tanks={tanks} open={navOpen} onClose={() => setNavOpen(false)} user={user} profile={profile} availableCount={availableCount} allocatedCount={allocatedCount} qcounts={qcounts} mode={mode} onMode={switchMode} hrStatus={hrStatus} crmAllowed={crmAllowed} crmStatus={crmStatus} flags={flags} pendingCount={pendingCount} eventCount={eventCount} />
      <main className="gi-main">
        <div className="gi-topbar">
          <button onClick={() => setNavOpen(true)} style={{ padding: "6px 10px", border: "1px solid #231E1E", background: "#fff", borderRadius: 4, fontSize: 16, cursor: "pointer" }}>{"\u2630"}</button>
          <img src={genesisLogo} alt="Genesis" style={{ height: 28, width: "auto" }} />
          <span style={{ fontWeight: 800 }}>{current ? current.label : "Genesis Tank App"}</span>
        </div>
        <div className={`gi-content${isQuotesKey(tab) ? (quotesWide(tab) ? " q wide" : " q") : ""}`}>
          {tab !== "home" && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <h1 style={{ color: "#231E1E", margin: 0, fontSize: 22 }}>{current ? current.label : "Genesis Tank App"}</h1>
            <span style={{ fontSize: 12, color: "#8a8578" }}>{isQuotesKey(tab) ? "Costing & Quotation \u00b7 " : isHrKey(tab) ? "HR \u00b7 Genesis staff \u00b7 " : isCrmKey(tab) ? "CRM \u00b7 customers & prospects \u00b7 " : ""}live Supabase data{loading ? " \u00b7 loading\u2026" : ""}</span>
          </div>}

          {/* Quotes section stays mounted so its data (and the sidebar counts) persist while other tabs are used */}
          {tab === "home" && <HomeView user={user} profile={profile} tanks={tanks} qcounts={qcounts} hrStatus={hrStatus} crmAllowed={crmAllowed} pendingCount={pendingCount} requestCount={requestCount} eventCount={eventCount} partyAtt={partyAtt} crmStatus={crmStatus} onGo={(k) => pick(ALL_ITEMS.find((i) => i.key === k) || { key: k })} />}
          {isHrKey(tab) && <HrApp user={user} navKey={tab} onStatus={setHrStatus} onNav={(k) => pick(ALL_ITEMS.find((i) => i.key === k) || { key: k })} />}
          {isCrmKey(tab) && (crmAllowed ? <CrmApp user={user} navKey={tab} tanks={tanks} isMgmt={hrStatus.level === "MANAGEMENT" || (profile && profile.role === "admin")} onStatus={setCrmStatus} onNav={(k) => pick(ALL_ITEMS.find((i) => i.key === k) || { key: k })} /> : <div style={{ color: "#C53030" }}>The CRM is for managers and Management.</div>)}
          <div style={{ display: isQuotesKey(tab) ? "block" : "none" }}>
            <QuotesApp user={user} profile={profile} flags={flags} onFlagsChanged={setFlags} tanks={tanks} onOpenTank={(t) => setSelectedId(t.id)} navKey={isQuotesKey(tab) ? tab : "q:dashboard"} onNav={(k) => { setTab(k); window.scrollTo({ top: 0 }); }}
              focusJob={focusJob} onFocusJobDone={() => setFocusJob("")} focusJobPage={focusJobPage} onFocusJobPageDone={() => setFocusJobPage("")} createNonce={createNonce} onCounts={setQcounts} />
          </div>

          {tab === "ask" && <AskHub user={user} defaultScope="inventory" />}
          {!isQuotesKey(tab) && !isHrKey(tab) && !isCrmKey(tab) && tab !== "home" && tab !== "ask" && loading && <div>Loading fleet{"\u2026"}</div>}
          {!isQuotesKey(tab) && !isHrKey(tab) && !isCrmKey(tab) && error && <div style={{ background: "#FBEAE7", border: "1px solid #C53030", borderRadius: 6, padding: 12, color: "#C53030" }}>Error loading tanks: {error}</div>}

          {!isQuotesKey(tab) && !isHrKey(tab) && !isCrmKey(tab) && tab !== "home" && tab !== "ask" && !loading && !error && (
            <>
              {tab === "dashboard" && <Dashboard tanks={tanks} onNavigate={setTab} />}
              {tab === "master" && (
                <>
                  <DailyImport tanks={tanks} onChanged={load} />
                  <CertificateBulkUpload />
                  <TankList tanks={tanks} onSelect={setSelectedId} />
                </>
              )}
              {tab === "arrival" && <ArrivalStage tanks={tanks} onChanged={load} canEdit={canEdit("arrival")} />}
              {tab === "fcl" && <FclStage tanks={tanks} onChanged={load} canEdit={canEdit("fcl")} />}
              {tab === "depot" && <DepotStage tanks={tanks} onChanged={load} canEdit={canEdit("depot")} />}
              {tab === "pending" && <PendingAllocationView tanks={tanks} onChanged={load} portNames={portNames} customers={customers} onAddCustomer={handleAddCustomer} canEdit={canEdit("available")} onOpenJob={(jn) => { window.dispatchEvent(new CustomEvent("genesis:open-jobpage", { detail: { job: jn } })); }} />}
              {tab === "available" && <AvailableStage tanks={tanks} onChanged={load} portNames={portNames} customers={customers} onAddCustomer={handleAddCustomer} canEdit={canEdit("available")} />}
              {tab === "allocated" && <AllocatedStage tanks={tanks} onChanged={load} canEdit={canEdit("allocated")} onNavigate={setTab} />}
              {tab === "depotout" && <DepotOutStage tanks={tanks} onChanged={load} canEdit={canEdit("depotout")} />}
              {tab === "repo" && <RepoStage tanks={tanks} onChanged={load} />}
              {tab === "agentupdates" && <AgentUpdatesView tanks={tanks} onChanged={load} canEdit={canEdit("arrival")} />}
              {newParty && <PartyForm preset={newParty} parties={partyList} canApprove={partyAtt.canApprove} onSaved={async () => { await load(); setNewParty(null); }} onClose={() => setNewParty(null)} />}
              {tab === "demurrage" && <DemurrageView tanks={tanks} onSelect={setSelectedId} onChanged={load} />}
              {tab === "localLease" && <LocalLeaseView tanks={tanks} onSelect={setSelectedId} onChanged={load} />}
              {tab === "thirdparty" && <ThirdPartyView tanks={tanks} onChanged={load} onOpenLifecycle={openLifecycle} />}
              {tab === "discipline" && <UpdateLagView onSelect={openLifecycle} />}
              {tab === "sailings" && <SailingsView tanks={tanks} onOpenLifecycle={openLifecycle} />}
              {tab === "customer" && <CustomerTanksView tanks={tanks} onChanged={load} onOpenLifecycle={openLifecycle} onSelect={setSelectedId} />}
              {tab === "detention" && <DetentionProjectView />}
              {tab === "storage" && <DepotStorageView tanks={tanks} onSelect={setSelectedId} />}
              {tab === "tpstatus" && <ThirdPartyStatusView tanks={tanks} onNavigate={setTab} onOpenLifecycle={openLifecycle} />}
              {tab === "repairs" && <RepairLogView />}
              {tab === "reports" && <ReportsView tanks={tanks} />}
              {tab === "owners" && <FleetByOwnerView tanks={tanks} onSelect={setSelectedId} />}
              
              {tab === "utilisation" && <UtilisationView tanks={tanks} onSelect={setSelectedId} />}
              {tab === "lifecycle" && <TankLifecycleView tanks={tanks} onSelect={setSelectedId} initialTank={lifecycleTank} />}
              {tab === "history" && <AuditLogView />}
            </>
          )}
        </div>
      </main>

      {selected && (
        <TankDetail tank={selected} onClose={() => setSelectedId(null)} onChanged={load} />
      )}

      {showDailyReport && (
        <ReportPreview title="Daily Inventory Status" html={buildDailyStatusHTML(tanks)} onClose={() => setShowDailyReport(false)} />
      )}
    </div>
  );
}
