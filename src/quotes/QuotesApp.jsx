import LanePlannerView from "./components/LanePlannerView.jsx";
import BookingRequestsView from "./components/BookingRequestsView.jsx";
import { useEffect, useState, useCallback } from "react";
import {
  fetchAllQuotes, createQuote, saveQuoteNumber, deleteQuote, duplicateQuote, fetchCustomers, addCustomer, fetchVendors, addVendor,
  fetchProducts, addProduct, fetchPortCodesMap, fetchPodRebatesMap, fetchCostHeads, addCostHead, fetchJobTankStats, fetchJobTankMovements,
  fetchPortCountries,
} from "./lib/quotesApi.js";
import { buildPortMap } from "./lib/scope.js";
import { setScopeContext } from "./lib/scopeStore.js";
import { nextQuoteNumber } from "./lib/quoteLogic.js";
import QuoteList, { displayStatus } from "./components/QuoteList.jsx";
import MonthlyProfitability from "./components/MonthlyProfitability.jsx";
import UnquotedJobs from "./components/UnquotedJobs.jsx";
import QuoteForm from "./components/QuoteForm.jsx";
import Dashboard from "./components/Dashboard.jsx";
import DataMasterView from "./components/DataMasterView.jsx";
import PartiesView from "./components/PartiesView.jsx";
import PartyForm from "./components/PartyForm.jsx";
import { fetchParties, partiesAttention } from "./lib/partiesApi.js";
import CompatibilityView from "./components/CompatibilityView.jsx";
import SailingsView from "./components/SailingsView.jsx";
import InvoiceReportView from "./components/InvoiceReportView.jsx";
import JobsView from "./components/JobsView.jsx";
import InvoicingView from "./components/InvoicingView.jsx";
import { fetchFlags, setFlag } from "./lib/jobsApi.js";
import CompleteDetailsModal from "./components/CompleteDetailsModal.jsx";

// Merge stage 2 (9 Nov 2026): the Quotes app as a section of the one Genesis
// app. The shell (App.jsx) owns login, the sidebar and which view is shown;
// this component owns the quotes data and the views that were Quotes' own.
// Nav keys are "q:<view>" / "q:list:<STATUS>", so the shell can list them.
export const QUOTES_NAV_GROUPS = [
  { title: "Overview", items: [
    { key: "q:dashboard", label: "Dashboard", icon: "\u25A3" },
    { key: "q:list", label: "Quote List", icon: "\u2630", qcount: "total" },
  ] },
  { title: "Quotes", items: [
    { key: "q:list:DRAFT", label: "Draft", icon: "\u25CB", qcount: "DRAFT" },
    { key: "q:list:SAVED", label: "Saved", icon: "\u25D4", qcount: "SAVED" },
    { key: "q:list:CONFIRMED", label: "Confirmed", icon: "\u25CF", qcount: "CONFIRMED" },
    { key: "q:list:LOST", label: "Lost", icon: "\u2715", qcount: "LOST" },
    { key: "q:new", label: "+ New Quote", icon: "\uFF0B", action: true },
  ] },
  { title: "Commercial", items: [
    { key: "q:profit", label: "Month-wise Profitability", icon: "$" },
    { key: "q:sailings", label: "Sailings & Rates", icon: "\u26F4" },
    { key: "q:compat", label: "Compatibility", icon: "\u2697" },
    { key: "q:invoices", label: "Invoices", icon: "\uD83E\uDDFE" },
    { key: "q:jobs", label: "Jobs", icon: "\u2691", flag: "jobs_module", title: "Preview until switched on" },
    { key: "q:billing", label: "Invoicing", icon: "\u00A4", flag: "jobs_module", title: "Preview until switched on" },
    { key: "q:requests", label: "Booking Requests", icon: "\u2709", title: "Requests from customers and agents through the portal" },
    { key: "q:parties", label: "Customers & Vendors", icon: "\u2302", title: "The register every quote and cost sheet reads from; anyone adds, Management / Accounts approve" },
    { key: "q:lanes", label: "Lane Planner", icon: "\u21BB", managerOnly: true, title: "Managers: round-trip economics per lane" },
  ] },
  { title: "Admin", items: [
    { key: "q:master", label: "Data Master", icon: "\uD83D\uDD12", title: "Managers only" },
  ] },
];
export const isQuotesKey = (k) => typeof k === "string" && k.startsWith("q:");
// "q:list:DRAFT" -> { view: "list", filter: "DRAFT" }
export const parseQuotesKey = (k) => { const p = String(k || "").split(":"); return { view: p[1] || "dashboard", filter: p[2] || null }; };
export const quotesTitle = (k) => {
  const { view, filter } = parseQuotesKey(k);
  if (view === "list") return filter ? `Quote List - ${filter.charAt(0) + filter.slice(1).toLowerCase()}` : "Quote List";
  const it = QUOTES_NAV_GROUPS.flatMap((g) => g.items).find((i) => i.key === k);
  return it ? it.label : "Quotes";
};
export const quotesWide = (k) => { const { view } = parseQuotesKey(k); return view === "sailings" || view === "invoices" || view === "list" || view === "profit" || view === "jobs" || view === "billing" || view === "requests"; };

export default function QuotesApp({ user, profile, navKey, onNav, focusJob, onFocusJobDone, focusJobPage, onFocusJobPageDone, createNonce, onCounts, flags = {}, onFlagsChanged, tanks = [], onOpenTank }) {
  const { view, filter: listFilter } = parseQuotesKey(navKey);
  const isManager = !!(profile && (profile.is_manager || ["admin", "manager"].includes(profile.role)));
  const [focusJobNumber, setFocusJobNumber] = useState("");
  const [focusTab, setFocusTab] = useState("");
  const openJobPage = (jn, tab) => { setSelectedId(null); setFocusJobNumber(jn); setFocusTab(tab || ""); setView("jobs"); };
  // Inventory > Pending Allocation (and anything else outside Quotes) asks for a job page by number
  useEffect(() => { if (focusJobPage) { setSelectedId(null); setFocusJobNumber(focusJobPage); setFocusTab(""); onFocusJobPageDone && onFocusJobPageDone(); } }, [focusJobPage]); // eslint-disable-line react-hooks/exhaustive-deps
  const setView = (v) => onNav(`q:${v}`);
  const setListFilter = (f) => onNav(f ? `q:list:${f}` : "q:list");
  const goToList = (status = null) => setListFilter(status);

  // Region scope (Quotes 042): same profile as Inventory; the port -> country map comes from the quotes port_codes.
  const [portMap, setPortMap] = useState({});
  useEffect(() => { if (user) fetchPortCountries().then((ports) => setPortMap(buildPortMap(ports, []))).catch(() => {}); }, [user]);
  useEffect(() => { setScopeContext({ profile, portMap, userId: user ? user.id : null }); }, [profile, portMap, user]);

  const [compatProduct, setCompatProduct] = useState("");
  const [quotes, setQuotes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [newParty, setNewParty] = useState(null);     // { name, roles, apply } - opened from a quote field (Inventory 113)
  const [partyList, setPartyList] = useState([]); const [partyCan, setPartyCan] = useState(false);
  const [vendors, setVendors] = useState([]);
  const [products, setProducts] = useState([]);
  const [costHeads, setCostHeads] = useState([]);
  const [portCodes, setPortCodes] = useState({});
  const [podRebates, setPodRebates] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [jobStats, setJobStats] = useState({});
  const [jobStatsError, setJobStatsError] = useState(false);
  const [jobStatsAt, setJobStatsAt] = useState(null);
  const [jobStatsBusy, setJobStatsBusy] = useState(false);
  const [jobMovements, setJobMovements] = useState({});
  const [jobMovementsError, setJobMovementsError] = useState(false);

  const refreshJobStats = useCallback(async (quoteList) => {
    const list = quoteList || quotes;
    const jobNumbers = [...new Set(list.flatMap((x) => x.jobNumbers || []).map((j) => (j || "").trim()).filter(Boolean))];
    setJobStatsBusy(true);
    try {
      const [stats, moves] = await Promise.all([
        fetchJobTankStats(jobNumbers),
        fetchJobTankMovements(jobNumbers).then((m) => ({ ok: true, m })).catch(() => ({ ok: false, m: {} })),
      ]);
      setJobStats(stats); setJobStatsError(false); setJobMovements(moves.m); setJobMovementsError(!moves.ok); setJobStatsAt(new Date());
    } catch {
      setJobStats({}); setJobStatsError(true); setJobMovements({}); setJobMovementsError(true);
    } finally { setJobStatsBusy(false); }
  }, [quotes]);

  const load = useCallback(async () => {
    try {
      const [q, c, v, p, pc, pr, ch] = await Promise.all([
        fetchAllQuotes(), fetchCustomers(), fetchVendors(), fetchProducts(), fetchPortCodesMap(), fetchPodRebatesMap(), fetchCostHeads(),
      ]);
      setQuotes(q); setCustomers(c); setVendors(v); setProducts(p); setPortCodes(pc); setPodRebates(pr); setCostHeads(ch || []);
      setError(null);
      await refreshJobStats(q);
    } catch (err) {
      setError(err.message || String(err));
    } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (user) load(); }, [load, user]);

  // sidebar counts for the shell
  useEffect(() => {
    if (!onCounts) return;
    const by = (s) => quotes.filter((x) => displayStatus(x) === s).length;
    onCounts({ total: quotes.length, DRAFT: by("DRAFT"), SAVED: by("SAVED"), CONFIRMED: by("CONFIRMED"), LOST: by("LOST") });
  }, [quotes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open the quote linked to a job (deep link ?job=, or the Inventory sailing-date check).
  useEffect(() => {
    if (!focusJob || loading || !quotes.length) return;
    const q = quotes.find((x) => (x.jobNumbers || []).some((j) => String(j).trim().toUpperCase() === focusJob));
    if (q) setSelectedId(q.id);
    else { alert(`No quote is linked to job ${focusJob} yet. Link the job on its quote first.`); onFocusJobDone && onFocusJobDone(); }
  }, [focusJob, loading, quotes]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if ((view === "dashboard" || view === "profit") && !loading) refreshJobStats(); }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  const patchQuote = useCallback((id, patch) => { setQuotes((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q))); }, []);
  const patchItem = useCallback((quoteId, itemId, field, value) => {
    setQuotes((qs) => qs.map((q) => {
      if (q.id !== quoteId) return q;
      const mapList = (list) => (list || []).map((it) => (it.id === itemId ? { ...it, [field]: value } : it));
      const costs = Object.fromEntries(Object.entries(q.costs || {}).map(([k, v]) => [k, mapList(v)]));
      return { ...q, costs, leaseItems: mapList(q.leaseItems) };
    }));
  }, []);

  const selected = quotes.find((q) => q.id === selectedId) || null;

  const handleCreate = useCallback(async () => {
    const id = await createQuote();
    await load();
    setSelectedId(id);
  }, [load]);
  // "+ New Quote" in the shell's sidebar bumps createNonce
  useEffect(() => { if (createNonce) handleCreate(); }, [createNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveQuoteNumber = async (quote) => { await saveQuoteNumber(quote.id, nextQuoteNumber(quote.pol, quote.pod, quotes, portCodes)); await load(); };
  const handleDelete = async (quoteId) => { await deleteQuote(quoteId); await load(); setSelectedId(null); };
  const handleDuplicate = async (quote) => {
    try { const newId = await duplicateQuote(quote); await load(); setSelectedId(newId); }
    catch (err) { alert("Duplicate failed: " + (err?.message || String(err))); }
  };
  const handleAddCustomer = async (name) => { await addCustomer(name); await load(); };
  const handleAddVendor = async (name) => { await addVendor(name); await load(); };
  const handleAddCostHead = async (name, section) => { await addCostHead(name, section); await load(); };
  const handleAddProduct = async (name) => { await addProduct(name); await load(); };

  return (
    <>
      {loading && <div>Loading quotes…</div>}
      {error && <div style={{ background: "#FBEAE7", border: "1px solid #C53030", borderRadius: 6, padding: 12, color: "#C53030" }}>Error: {error}</div>}

      {!loading && !error && view === "dashboard" && (
        <Dashboard quotes={quotes} podRebates={podRebates} jobStats={jobStats} jobStatsError={jobStatsError} movements={jobMovements}
          jobStatsAt={jobStatsAt} jobStatsBusy={jobStatsBusy} onRefresh={() => refreshJobStats()} onNavigate={goToList} />
      )}
      {!loading && !error && view === "master" && <DataMasterView onChanged={load} onOpenParties={() => setView("parties")} />}
      {!loading && !error && view === "parties" && <PartiesView onChanged={load} />}
      {!loading && !error && view === "sailings" && <SailingsView />}
      {!loading && !error && view === "invoices" && <InvoiceReportView quotes={quotes} podRebates={podRebates} onOpenQuote={(id) => setSelectedId(id)} />}
      {!loading && !error && view === "requests" && <BookingRequestsView quotes={quotes} onOpenQuote={async (id) => { await load(); setSelectedId(id); setView("list"); }} onChanged={load} />}
      {!loading && !error && view === "lanes" && (isManager ? <LanePlannerView quotes={quotes} podRebates={podRebates} user={user} isManager={isManager} /> : <div style={{ color: "#C53030" }}>The Lane Planner is for managers.</div>)}
      {!loading && !error && view === "billing" && ((flags.jobs_module || isManager) ? <InvoicingView quotes={quotes} podRebates={podRebates} tanks={tanks} onOpenJob={openJobPage} /> : <div style={{ color: "#C53030" }}>Invoicing is not switched on yet.</div>)}
      {!loading && !error && view === "jobs" && ((flags.jobs_module || isManager) ? <JobsView quotes={quotes} podRebates={podRebates} jobStats={jobStats} tanks={tanks} onOpenTank={onOpenTank} focusJobNumber={focusJobNumber} focusTab={focusTab} onFocusDone={() => setFocusJobNumber("")} user={user} isManager={isManager} flagOn={!!flags.jobs_module} onToggleFlag={async (on) => { try { await setFlag("jobs_module", on, user && user.email); onFlagsChanged && onFlagsChanged(await fetchFlags()); } catch (e) { alert(e.message); } }} onOpenQuote={(id) => setSelectedId(id)} /> : <div style={{ color: "#C53030" }}>Jobs are not switched on yet.</div>)}
      {!loading && !error && view === "compat" && <CompatibilityView quotes={quotes} initialProduct={compatProduct} onChanged={load} />}
      {!loading && !error && view === "profit" && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, fontSize: 11, color: "#8a8578", marginBottom: 8 }}>
            {jobStatsAt && !jobStatsBusy && <span>Inventory movements as of {jobStatsAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
            {jobStatsBusy && <span>Refreshing…</span>}
            <button onClick={() => refreshJobStats()} disabled={jobStatsBusy}
              style={{ border: "1px solid #231E1E", borderRadius: 4, background: "#fff", color: "#231E1E", padding: "4px 9px", fontSize: 11, fontWeight: 700, cursor: jobStatsBusy ? "default" : "pointer" }}>
              ↻ Refresh
            </button>
          </div>
          <MonthlyProfitability quotes={quotes.filter((q) => displayStatus(q) === "CONFIRMED")} podRebates={podRebates} movements={jobMovements} movementsError={jobMovementsError} />
          <div style={{ fontSize: 12, fontWeight: 700, color: "#8a8578", textTransform: "uppercase", letterSpacing: "0.04em", margin: "22px 0 8px" }}>Quote coverage</div>
          <UnquotedJobs quotes={quotes} />
        </>
      )}
      {!loading && !error && view === "list" && (
        <QuoteList quotes={quotes} podRebates={podRebates} jobStats={jobStats} statusFilter={listFilter} onStatusFilter={setListFilter} onSelect={setSelectedId} onCreate={handleCreate} />
      )}

      {!loading && !error && !selected && <CompleteDetailsModal onDone={load} />}

      {selected && (
        <QuoteForm
          quote={selected} customers={customers} vendors={vendors} products={products} portCodes={portCodes} podRebates={podRebates}
          focusJob={focusJob} jobsOn={!!flags.jobs_module} onOpenJob={openJobPage}
          onClose={() => { setSelectedId(null); onFocusJobDone && onFocusJobDone(); }}
          onChanged={load} onPatch={patchQuote} onPatchItem={patchItem}
          onAddCustomer={handleAddCustomer} onAddVendor={handleAddVendor} onAddParty={async (req) => { try { const [l, a] = await Promise.all([fetchParties(), partiesAttention()]); setPartyList(l); setPartyCan(!!a.canApprove); } catch { setPartyList([]); } setNewParty(req); }} costHeads={costHeads} onAddCostHead={handleAddCostHead} onAddProduct={handleAddProduct}
          onOpenCompat={(name) => { setCompatProduct(name || ""); setSelectedId(null); setView("compat"); }}
          onSaveNumber={() => handleSaveQuoteNumber(selected)} onDelete={() => handleDelete(selected.id)} onDuplicate={() => handleDuplicate(selected)}
        />
      )}
      {newParty && <PartyForm preset={{ name: newParty.name || "", roles: newParty.roles || ["CUSTOMER"] }} parties={partyList} canApprove={partyCan}
        onSaved={async (p) => { await load(); if (newParty.apply && p && p.name) newParty.apply(p.name); setNewParty(null); }} onClose={() => setNewParty(null)} />}
    </>
  );
}
