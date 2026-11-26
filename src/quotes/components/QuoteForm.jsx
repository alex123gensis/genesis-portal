import { useState, useRef, useEffect, useMemo, Fragment } from "react";
import { quoteInScope, currentScopeLabel } from "../lib/scopeStore.js";
import SearchField from "./SearchField.jsx";
import { quoteFileName,
  minLoad80, maxLoad95, sectionTotal, totalCost, totalPlyDays, podRebateFor, totalSell, marginOf, rentalPerDay,
  COST_SECTIONS, COST_SECTION_ORDER, fmt, num,
  QUOTE_TYPES, quoteTypeOf, isExport, isLease, isRepo, isManaged, isExportLike,
  LEASE_BASES, leaseRateDaily, leaseRateOnDay, leaseAccruedRevenue, leaseHasSlabs, quoteJobNumbers, onHireCharge, offHireCharge, leasePerDayRevenue, leasePerTankRevenue, leasePerTankMargin,
  CURRENCIES, DEFAULT_FX_USD_AED, fxRate, fxRateFor, sellCurrency, currencySymbol, toUsd,
} from "../lib/quoteLogic.js";
import { DEFAULT_SLABS, slabSummary } from "../lib/leaseSlabs.js";
import { LEASE_REVENUE_SECTION } from "../lib/quoteFields.js";
import { updateQuoteField, updateCostItem, addCostItem, removeCostItem, uploadMsds, unconfirmQuote, defaultValidityIso, validityRuleText, refreshQuoteFx } from "../lib/quotesApi.js";
import ManagerApproval from "./ManagerApproval.jsx";
import { COMPAT_STATUSES } from "../lib/compatibility.js";
import { StatusPill } from "./CompatibilityView.jsx";
import SailingRatePicker from "./SailingRatePicker.jsx";
import { downloadQuoteExcel } from "../lib/quoteExcel.js";
import { buildQuotationHTML, inclusionsFor, isIncluded, isOverridden, defaultIncluded, TERMS_OPTIONS, termsOf, termsLabel } from "../lib/quotationDocument.js";
import { downloadQuotationDocx } from "../lib/quotationDocx.js";
import { buildLeaseAgreementHTML, LEASE_DEFAULTS } from "../lib/leaseAgreement.js";
import { downloadLeaseAgreementDocx } from "../lib/leaseAgreementDocx.js";
import { extractPdfText, parseMsds, msdsToQuoteFields } from "../lib/msdsExtract.js";
import { fetchTanksForJob } from "../lib/quotesApi.js";
import ReportPreview from "./ReportPreview.jsx";
import JobLink from "./JobLink.jsx";
import BillOfLading from "./BillOfLading.jsx";

const INPUT_STYLE = { width: "100%", padding: "8px 9px", border: "1px solid #ccc", borderRadius: 4, fontSize: 13, boxSizing: "border-box" };
const LABEL_STYLE = { fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "#8a8578", display: "block", marginBottom: 3 };

function Field({ label, children }) {
  return <div style={{ marginBottom: 10 }}><label style={LABEL_STYLE}>{label}</label>{children}</div>;
}

// Once locked (Saved), every field across all three tabs is read-only —
// Details, Costing, and Rental/Margin alike — until Edit unlocks it again.
// A Confirmed quote is permanently locked: no Edit button appears at all.
export default function QuoteForm({ quote, customers, vendors, products, portCodes, podRebates, jobsOn = false, onOpenJob, onClose, onChanged, onPatch, onPatchItem, onAddCustomer, onAddVendor, onAddParty, onAddProduct, onSaveNumber, onDelete, onDuplicate, onOpenCompat, costHeads = [], onAddCostHead, focusJob = "" }) {
  const agentNames = useMemo(() => Array.from(new Set([...(vendors || []).map((v) => (typeof v === "string" ? v : v.name)), quote.polAgent, quote.podAgent].filter(Boolean).map((x) => String(x).toUpperCase()))).sort(), [vendors, quote.polAgent, quote.podAgent]);
  const [tab, setTab] = useState("details");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [saveState, setSaveState] = useState("idle"); // idle | pending | error
  const [saveError, setSaveError] = useState(null);
  const [showQuotation, setShowQuotation] = useState(false);

  const isConfirmed = quote.status === "CONFIRMED";
  // Region scope (Quotes 042): a quote outside the user's countries / accounts is read-only here.
  const outOfScope = !quoteInScope(quote);
  const readOnly = quote.locked || isConfirmed || outOfScope;

  // Typing is instant; the database catches up after a short pause.
  //
  // A keystroke patches the quote in App state (so the controlled input
  // shows the character at once) and schedules the write for 500ms later,
  // keyed per field so a burst of typing into one field collapses into one
  // write carrying the final value. Nothing here triggers a full reload —
  // the patched state already matches what the write will store.
  //
  // flush() runs every pending write now. It is called before anything that
  // reloads from the server (Save, Duplicate, Delete, Close, unmount), so a
  // reload can never overwrite a keystroke that was still waiting to be sent.
  const pendingRef = useRef(new Map());
  const WRITE_DELAY_MS = 500;

  const runWrite = async (run) => {
    try {
      await run();
      if (pendingRef.current.size === 0) { setSaveState("idle"); setSaveError(null); }
    } catch (err) {
      setSaveState("error");
      setSaveError(err.message || String(err));
    }
  };
  const schedule = (key, run) => {
    const p = pendingRef.current;
    const prev = p.get(key);
    if (prev) clearTimeout(prev.timer);
    const timer = setTimeout(() => { p.delete(key); runWrite(run); }, WRITE_DELAY_MS);
    p.set(key, { run, timer });
    setSaveState("pending");
  };
  const flush = async () => {
    const p = pendingRef.current;
    const runs = [...p.values()].map((v) => { clearTimeout(v.timer); return v.run; });
    p.clear();
    await Promise.all(runs.map((run) => runWrite(run)));
  };
  useEffect(() => () => { flush(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Text fields: patch now, write later.
  const set = (field, value) => {
    if (readOnly) return;
    onPatch(quote.id, { [field]: value });
    schedule(`q:${field}`, () => updateQuoteField(quote.id, field, value));
  };
  // Discrete controls (type, status, product pick): patch now, write now.
  // There is no burst to collapse and the user expects them to stick.
  const setNow = async (patch) => {
    if (readOnly) return;
    onPatch(quote.id, patch);
    setSaveState("pending");
    await runWrite(async () => {
      for (const [field, value] of Object.entries(patch)) await updateQuoteField(quote.id, field, value);
    });
  };

  const pickProduct = (p) => setNow({ product: p.name, unNo: p.unNo, imoClass: p.imoClass, sg: p.sg });

  const todayIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  // Validity rule (15 Oct): a blank validity means end of the month the quote is dated in
  const validityOf = (it) => it.validUntil || defaultValidityIso(quote.quoteDate || new Date());
  const quoteValidity = quote.validity || defaultValidityIso(quote.quoteDate || new Date());
  // cost heads: this section's heads first, then the rest (and any head with no section)
  const headsFor = (section) => [...costHeads.filter((h) => h.section === section), ...costHeads.filter((h) => h.section !== section)].map((h) => h.name);
  const setItem = (itemId, field, value) => {
    if (readOnly) return;
    onPatchItem(quote.id, itemId, field, value);
    schedule(`i:${itemId}:${field}`, () => updateCostItem(itemId, field, value));
  };
  const addItem = async (section) => {
    if (readOnly) return;
    await flush();
    const nextOrder = (quote.costs[section] || []).length;
    await addCostItem(quote.id, section, nextOrder);
    await onChanged();
  };
  const removeItem = async (itemId) => { if (readOnly) return; await flush(); await removeCostItem(itemId); await onChanged(); };
  // Extra lease revenue lines: same table and API as cost lines, different
  // section, each carrying a per-tank / per-day basis.
  const addLeaseItem = async () => {
    if (readOnly) return;
    await flush();
    await addCostItem(quote.id, LEASE_REVENUE_SECTION, (quote.leaseItems || []).length, "TANK");
    await onChanged();
  };

  // Slab-wise lease rate: the whole list is one jsonb field, so every edit
  // rewrites the list (debounced like any other keystroke). The rows are
  // kept as typed - blank "to day" while the operator is mid-edit is fine,
  // normaliseSlabs sorts it out for the maths and the document.
  const slabMode = leaseHasSlabs(quote) ? "slab" : "flat";
  const slabRows = Array.isArray(quote.leaseRateSlabs) ? quote.leaseRateSlabs : [];
  const writeSlabs = (rows) => set("leaseRateSlabs", rows);
  const setSlab = (i, key, value) => writeSlabs(slabRows.map((s, j) => (j === i ? { ...s, [key]: value } : s)));
  const addSlab = () => {
    // insert before the open-ended tail, one step of the same width as the previous slab
    const closed = slabRows.slice(0, -1);
    const prevTo = parseInt(closed[closed.length - 1]?.upTo, 10) || 0;
    const prevFrom = parseInt(closed[closed.length - 2]?.upTo, 10) || 0;
    const width = prevTo - prevFrom > 0 ? prevTo - prevFrom : 90;
    const tail = slabRows[slabRows.length - 1] || { upTo: null, rate: "" };
    writeSlabs([...closed, { upTo: prevTo + width, rate: tail.rate }, tail]);
  };
  const removeSlab = (i) => writeSlabs(slabRows.filter((_, j) => j !== i));

  // Currency: each line has its own; the sell block has one per quote. All
  // totals shown are USD at the quote's rate (AED per 1 USD).
  const sellCur = sellCurrency(quote);
  const sym = currencySymbol(sellCur);
  const fx = fxRate(quote);
  const anyAed = sellCur !== "USD" || [...COST_SECTION_ORDER.flatMap((k) => quote.costs[k] || []), ...(quote.leaseItems || [])].some((it) => it.currency && it.currency !== "USD");
  const CurrencyToggle = ({ value, onChange }) => (
    <select value={value || "USD"} onChange={(e) => onChange(e.target.value)} disabled={readOnly} title="Currency of this line"
      style={{ flex: "none", height: 34, padding: "0 6px", border: "1px solid #231E1E", borderRadius: 4, fontSize: 11, fontWeight: 700, background: (value || "USD") === "USD" ? "#fff" : "#231E1E", color: (value || "USD") === "USD" ? "#231E1E" : "#fff" }}>
      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
    </select>
  );
  const usdHint = (amount, cur) => (cur && cur !== "USD" && num(amount) ? <span style={{ fontSize: 11, color: "#8a8578", whiteSpace: "nowrap" }}>= ${fmt(toUsd(quote, amount, cur))} at {fxRateFor(quote, cur)}</span> : null);
  const [fxBusy, setFxBusy] = useState(false);
  const [fxMsg, setFxMsg] = useState(null);
  const refreshFx = async () => {
    setFxBusy(true); setFxMsg(null);
    try { const r = await refreshQuoteFx(quote.id); setNow({ fxRates: r, fxRatesAt: new Date().toISOString(), fxUsdAed: r.AED || quote.fxUsdAed }); setFxMsg("Live rates fetched."); await onChanged(); }
    catch (e) { setFxMsg(/fx_rates|schema cache/i.test(e.message || "") ? "Rates fetched but cannot be stored - run Quotes migration 035 first." : (e.message || String(e))); }
    setFxBusy(false);
  };
  // A quote with no rate snapshot yet (created offline, or before 035) fetches
  // them the first time its costing is opened - the box is never blank.
  useEffect(() => {
    if (readOnly || fxBusy || quote.fxRatesAt) return;
    if (tab !== "costing" && tab !== "rental") return;
    refreshFx();
  }, [quote.id, tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const setRate = (cur, v) => {
    const next = { ...(quote.fxRates || {}), [cur]: v === "" ? undefined : v };
    Object.keys(next).forEach((k) => next[k] === undefined && delete next[k]);
    setNow({ fxRates: next, ...(cur === "AED" ? { fxUsdAed: v } : {}) });
    schedule("q:fxRates", () => updateQuoteField(quote.id, "fxRates", next));
    if (cur === "AED") schedule("q:fxUsdAed", () => updateQuoteField(quote.id, "fxUsdAed", v));
  };
  const currencyBox = (
    <div style={{ background: "#fff", border: "1px solid #e0ddd3", borderRadius: 6, padding: 10, marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
        <div style={{ flex: "0 0 150px" }}>
          <label style={LABEL_STYLE}>Sell currency</label>
          <select style={INPUT_STYLE} value={sellCur} onChange={(e) => setNow({ sellCurrency: e.target.value })} disabled={readOnly}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={LABEL_STYLE}>Rates on this quote (per 1 USD){quote.fxRatesAt ? ` · fetched ${new Date(quote.fxRatesAt).toLocaleString()}` : " · not fetched - defaults"}</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {CURRENCIES.filter((c) => c !== "USD").map((c) => (
              <label key={c} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700 }}>{c}
                <input style={{ ...INPUT_STYLE, width: 86, fontSize: 12 }} value={c === "AED" ? (quote.fxUsdAed ?? (quote.fxRates || {})[c] ?? "") : ((quote.fxRates || {})[c] ?? "")} placeholder={String(fxRateFor(quote, c))} onChange={(e) => setRate(c, e.target.value)} inputMode="decimal" disabled={readOnly} />
              </label>
            ))}
            {!readOnly && <button type="button" onClick={refreshFx} disabled={fxBusy} style={{ padding: "7px 10px", border: "1px solid #2B6CB0", borderRadius: 4, background: "#fff", color: "#2B6CB0", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>{fxBusy ? "Fetching…" : "⟳ Refresh online rates"}</button>}
          </div>
          {fxMsg && <div style={{ fontSize: 11, color: /fetched/.test(fxMsg) ? "#2E7D5B" : "#C53030", marginTop: 4 }}>{fxMsg}</div>}
        </div>
      </div>
      <div style={{ fontSize: 11, color: "#666", marginTop: 6 }}>
        Each line below has its own currency; the sell side (base sell, lease rates, on/off-hire, demurrage) is entered in the sell currency. Totals and margin are always in USD at this quote's rates{anyAed ? "" : " (all lines are USD)"}.
        {sellCur !== "USD" && ` The customer quotation prints in ${sellCur}.`}
      </div>
    </div>
  );

  // MSDS upload: store the file as before, then (PDF only) read it in the
  // browser and offer product / UN No. / class + PG / SG for the operator to
  // tick and apply. Nothing is written until Apply - an SDS is read by
  // pattern, and a wrong UN number on a quote is worse than a blank one.
  const [msdsBusy, setMsdsBusy] = useState(false);
  const [msdsFound, setMsdsFound] = useState(null); // { rows: [{key,label,value,current,snippet}] }
  const [msdsPick, setMsdsPick] = useState({});
  const handleMsdsUpload = async (file) => {
    setMsdsBusy(true);
    try {
      await uploadMsds(quote.id, file);
      await onChanged();
      if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") { setMsdsFound({ rows: [] }); return; }
      let parsed = {};
      try { parsed = parseMsds(await extractPdfText(file)); }
      catch (err) { alert("MSDS uploaded, but it could not be read: " + (err.message || err)); return; }
      const fields = msdsToQuoteFields(parsed);
      const labels = { product: "Product", unNo: "UN No.", imoClass: "IMO Class", sg: "SG" };
      const snippets = { product: parsed.product, unNo: parsed.unNo, imoClass: parsed.imoClass, sg: parsed.sg };
      const rows = Object.entries(fields).map(([key, value]) => ({ key, label: labels[key], value, current: String(quote[key] ?? "").trim(), snippet: snippets[key]?.snippet || "" }));
      if (parsed.properShippingName) rows.push({ key: "_psn", label: "Proper shipping name (info)", value: parsed.properShippingName.value, current: "", snippet: parsed.properShippingName.snippet, infoOnly: true });
      setMsdsFound({ rows });
      // pre-tick everything the quote does not already have; a differing value is left for the operator to decide
      const pick = {};
      rows.forEach((r) => { if (!r.infoOnly) pick[r.key] = !r.current || r.current === r.value; });
      setMsdsPick(pick);
    } finally {
      setMsdsBusy(false);
    }
  };
  const applyMsds = async () => {
    if (!msdsFound) return;
    const patch = {};
    msdsFound.rows.forEach((r) => { if (!r.infoOnly && msdsPick[r.key]) patch[r.key] = r.value; });
    if (Object.keys(patch).length) await setNow(patch);
    setMsdsFound(null);
  };

  // Lease Agreement: pull the tank numbers of every linked job from
  // Inventory into the "Tank Number(s)" line.
  const [fillingTanks, setFillingTanks] = useState(false);
  const fillTankNumbers = async () => {
    setFillingTanks(true);
    try {
      const lists = await Promise.all(quoteJobNumbers(quote).map((jn) => fetchTanksForJob(jn).catch(() => [])));
      const nums = [...new Set(lists.flat().map((t) => t.tank_number).filter(Boolean))];
      if (!nums.length) { alert("No tanks found in Inventory on the linked job(s) yet."); return; }
      set("tankNumbers", nums.join(", "));
    } finally { setFillingTanks(false); }
  };

  const handleSave = async () => {
    await flush();
    if (!quote.quoteNumber) await onSaveNumber();
    await updateQuoteField(quote.id, "locked", true);
    await onChanged();
  };
  // Confirming (or marking Lost) is a Save as well: a quote cannot be
  // Confirmed without a quote number - before 29 Sep the status dropdown
  // wrote CONFIRMED straight away, so an unsaved draft became a numberless
  // Confirmed quote that could never be numbered (Confirmed = read-only).
  // Product compatibility (12 Oct): status from the product master
  const compatProduct = (quote.product || "").trim() ? products.find((p) => (p.name || "").trim().toUpperCase() === quote.product.trim().toUpperCase()) : null;
  const compatStatus = (quote.product || "").trim() ? (compatProduct?.compatStatus || "NOT_CHECKED") : null;
  const handleStatusChange = async (value) => {
    if (value === "CONFIRMED" && compatStatus && !["APPROVED", "CONDITIONAL"].includes(compatStatus)) {
      const ok = window.confirm(`${quote.product} is "${COMPAT_STATUSES[compatStatus].label}" on the product master - the compatibility check has not cleared it for our tanks.\n\nConfirm the quote anyway?`);
      if (!ok) return;
    }
    if ((value === "CONFIRMED" || value === "LOST") && !quote.quoteNumber) {
      await flush();
      await onSaveNumber();
      await updateQuoteField(quote.id, "locked", true);
    }
    if (value === "CONFIRMED") setNow({ status: value, confirmedAt: new Date().toISOString() });
    else setNow({ status: value });
    if ((value === "CONFIRMED" || value === "LOST") && !quote.quoteNumber) await onChanged();
  };
  const handleClose = async () => { await flush(); onClose(); };
  const [duplicating, setDuplicating] = useState(false);
  const [unconfirmOpen, setUnconfirmOpen] = useState(false);
  const handleDuplicate = async () => {
    setDuplicating(true);
    try { await flush(); await onDuplicate(); } finally { setDuplicating(false); }
  };
  const handleDelete = async () => { await flush(); await onDelete(); };
  const handleEdit = async () => { await updateQuoteField(quote.id, "locked", false); await onChanged(); };

  const qType = quoteTypeOf(quote);
  // The third tab holds whatever the money summary is for this type, so its
  // name changes with the type rather than always claiming "Rental / Margin".
  const TABS = [
    { key: "details", label: "Details" },
    { key: "costing", label: "Costing" },
    { key: "rental", label: isRepo(quote) ? "Cost Summary" : isLease(quote) ? "Rates / Cost" : isManaged(quote) ? "Freight Margin" : "Rental / Margin" },
    // The customer document - an export or a lease is quoted to a customer,
    // a repo is internal and has nobody to send it to.
    ...(isRepo(quote) ? [] : [{ key: "quotation", label: isLease(quote) ? "Lease Agreement" : "Quotation" }]),
  ];
  // Toggling an inclusion writes the whole object back - one small JSON
  // column, patched instantly and written immediately like the other
  // discrete controls.
  const toggleInclusion = (key) => {
    if (readOnly) return;
    const next = { ...(quote.inclusions || {}) };
    const value = !isIncluded(quote, key);
    // Back at the terms default? Drop the override rather than store it, so
    // "Reset to defaults" only appears when something really differs.
    if (value === defaultIncluded(quote, key)) delete next[key]; else next[key] = value;
    setNow({ inclusions: next });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#faf9f5", zIndex: 50, overflowY: "auto" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontFamily: "monospace", fontSize: 18, display: "flex", alignItems: "center", gap: 10 }}>
            {quote.quoteNumber || <span style={{ color: "#8a8578", fontStyle: "italic" }}>Not saved yet</span>}
            {saveState === "pending" && <span style={{ fontSize: 11, fontFamily: "Arial, sans-serif", fontWeight: 400, color: "#8a8578" }}>saving…</span>}
            {saveState === "error" && <span title={saveError || ""} style={{ fontSize: 11, fontFamily: "Arial, sans-serif", fontWeight: 700, color: "#C53030" }}>not saved — {saveError}</span>}
          </h2>
          <button onClick={handleClose} style={{ border: "1px solid #ccc", borderRadius: 4, background: "#fff", padding: "6px 10px", cursor: "pointer" }}>✕</button>
        </div>

        {isConfirmed && (
          <div style={{ background: "#F0F0F0", border: "1px solid #8a8578", borderRadius: 6, padding: "8px 10px", marginBottom: 10, fontSize: 13, fontWeight: 700, color: "#8a8578", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span>🔒 Confirmed — read-only</span>
            <button type="button" onClick={() => setUnconfirmOpen(true)} style={{ padding: "5px 10px", border: "1px solid #C53030", color: "#C53030", background: "#fff", borderRadius: 4, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
              Edit Confirmed Quote (manager)
            </button>
          </div>
        )}
        {isConfirmed && unconfirmOpen && (
          <ManagerApproval
            title="Manager approval needed to edit a Confirmed quote"
            description={`${quote.quoteNumber || "This quote"} goes back to editable (Saved state). Linked jobs, cost lines, documents and BLs stay as they are; after the change, Save and set it to Confirmed again. Recorded under the manager's name.`}
            actionLabel="Unlock for editing"
            onApprove={async (name, password) => { await flush(); await unconfirmQuote(quote.id, name, password); setUnconfirmOpen(false); await onChanged(); }}
            onCancel={() => setUnconfirmOpen(false)}
          />
        )}
        {outOfScope && (
          <div style={{ background: "#FFF3D9", border: "1px solid #C9862A", borderRadius: 6, padding: 10, marginBottom: 10, fontSize: 12.5, color: "#8a6216" }}>
            {"\uD83D\uDD12"} Read-only - this quote ({quote.pol || "?"} {"\u2192"} {quote.pod || "?"}, {quote.customer || "no customer"}) is outside your regions ({currentScopeLabel()}). The responsible coordinator or a manager can change it.
          </div>
        )}
        {!isConfirmed && quote.locked && !outOfScope && (
          <button onClick={handleEdit} style={{ width: "100%", padding: 10, marginBottom: 10, border: "1px solid #231E1E", borderRadius: 4, background: "#fff", color: "#231E1E", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            ✏️ Edit
          </button>
        )}
        {isConfirmed && jobsOn && (
          <div style={{ border: "1px solid #e0ddd3", borderRadius: 6, background: "#fff", padding: 12, marginBottom: 16 }}>
            <div style={{ fontWeight: 700, color: "#231E1E", marginBottom: 6 }}>Jobs on this quote</div>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>Tanks, Bill of Lading, invoices and cost booking are handled on the job page (Quotes {"\u203a"} Jobs).</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {quoteJobNumbers(quote).map((j) => <button key={j} type="button" onClick={() => onOpenJob && onOpenJob(j)} style={{ padding: "6px 10px", borderRadius: 4, fontSize: 12, fontWeight: 700, fontFamily: "monospace", cursor: "pointer", border: "1px solid #231E1E", background: "#231E1E", color: "#fff" }}>{j} {"\u2192"}</button>)}
              {!quoteJobNumbers(quote).length && <span style={{ fontSize: 12, color: "#8a8578" }}>No job yet - create it under Jobs {"\u203a"} + New job from quote.</span>}
            </div>
          </div>
        )}
        {isConfirmed && !jobsOn && <JobLink quote={quote} podRebates={podRebates} onChanged={onChanged} />}
        {/* A lease or a repo move is not an export shipment — no vessel, no
            Bill of Lading. The Job Link still applies: both put real tanks
            on a job number in Inventory. */}
        {/* Vessel Details panel removed 25 Sep: vessel / voyage are entered per BL (one per job) */}
        {isConfirmed && !jobsOn && isExportLike(quote) && <BillOfLading quote={quote} podRebates={podRebates} focusJob={focusJob} onOpenJob={onOpenJob} />}

        <button onClick={() => downloadQuoteExcel(quote, podRebates)} style={{ width: "100%", padding: 10, marginBottom: 8, border: "1px solid #231E1E", borderRadius: 4, background: "#fff", color: "#231E1E", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          📥 Download Excel
        </button>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button onClick={handleDuplicate} disabled={duplicating}
            title={isConfirmed ? "Copies this quote as a new Draft - job links, vessel and BL are not carried over" : "Copies this quote as a new Draft"}
            style={{ flex: 1, padding: 10, border: "1px solid #231E1E", borderRadius: 4, background: "#fff", color: "#231E1E", fontWeight: 700, fontSize: 13, cursor: duplicating ? "default" : "pointer", opacity: duplicating ? 0.6 : 1 }}>
            {duplicating ? "Duplicating…" : "📋 Duplicate Quote"}
          </button>
          {outOfScope ? null : !deleteConfirm ? (
            <button onClick={() => setDeleteConfirm(true)} style={{ flex: 1, padding: 10, border: "1px solid #C53030", borderRadius: 4, background: "#fff", color: "#C53030", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              🗑 Delete Quote
            </button>
          ) : (
            <button onClick={handleDelete} style={{ flex: 1, padding: 10, border: "none", borderRadius: 4, background: "#C53030", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              Confirm Delete?
            </button>
          )}
        </div>
        {isConfirmed && (
          <div style={{ fontSize: 11, color: "#8a8578", marginTop: -10, marginBottom: 14 }}>
            Duplicate makes a new Draft from this quote. Its linked job{quoteJobNumbers(quote).length === 1 ? "" : "s"} stay here — the copy starts with none.
          </div>
        )}
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ flex: 1, padding: "8px 10px", border: "1px solid #231E1E", borderRadius: 4, fontSize: 12, fontWeight: 700, cursor: "pointer",
                background: tab === t.key ? "#231E1E" : "#fff", color: tab === t.key ? "#fff" : "#231E1E" }}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "details" && (
          <>
            <Field label="Costing Type">
              <div style={{ display: "flex", gap: 6 }}>
                {QUOTE_TYPES.map((t) => (
                  <button key={t.key} onClick={() => setNow({ quoteType: t.key })} disabled={readOnly}
                    style={{ flex: 1, padding: "8px 6px", border: "1px solid #231E1E", borderRadius: 4, fontSize: 12, fontWeight: 700,
                      cursor: readOnly ? "not-allowed" : "pointer", opacity: readOnly && qType !== t.key ? 0.4 : 1,
                      background: qType === t.key ? "#231E1E" : "#fff", color: qType === t.key ? "#fff" : "#231E1E" }}>
                    {t.label}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "#999", marginTop: 5 }}>
                {(QUOTE_TYPES.find((t) => t.key === qType) || QUOTE_TYPES[0]).blurb}
              </div>
            </Field>
            <Field label="Status">
              <select value={quote.status} onChange={(e) => handleStatusChange(e.target.value)} disabled={readOnly} style={INPUT_STYLE}>
                <option value="DRAFT">Draft</option><option value="CONFIRMED">Confirmed</option><option value="LOST">Lost</option>
              </select>
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Quote Date"><input type="date" style={INPUT_STYLE} value={quote.quoteDate} onChange={(e) => set("quoteDate", e.target.value)} disabled={readOnly} /></Field>
              <Field label="Validity">
                <input type="date" style={{ ...INPUT_STYLE, background: quote.validity ? INPUT_STYLE.background : "#fffdf5" }} value={quote.validity} onChange={(e) => set("validity", e.target.value)} disabled={readOnly}
                  title={quote.validity ? "Quote validity" : `Default ${quoteValidity} - ${validityRuleText}`} />
                {!quote.validity && <div style={{ fontSize: 10, color: "#8a8578", marginTop: 2 }}>default {quoteValidity} - {validityRuleText}</div>}
              </Field>
            </div>
            {/* A repo move is internal — there is no customer and no shipper. */}
            {!isRepo(quote) && (
              <>
                <Field label={isLease(quote) ? "Customer (Lessee)" : "Customer"}>
                  <SearchField value={quote.customer} onChange={(v) => set("customer", String(v || "").toUpperCase())} options={customers} placeholder="Pick a customer…" strict onAddNew={(name) => onAddParty && onAddParty({ name, roles: ["CUSTOMER"], apply: (n) => set("customer", n) })} disabled={readOnly} />
                </Field>
                <Field label="Shipper">
                  <SearchField value={quote.shipper} onChange={(v) => set("shipper", String(v || "").toUpperCase())} options={customers} placeholder="Pick a shipper…" strict onAddNew={(name) => onAddParty && onAddParty({ name, roles: ["SHIPPER"], apply: (n) => set("shipper", n) })} disabled={readOnly} />
                </Field>
              </>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="POL">
                <SearchField value={quote.pol} onChange={(v) => set("pol", v)} options={Object.keys(portCodes)} placeholder="Search ports…" onAddNew={(v) => set("pol", v)} disabled={readOnly} />
              </Field>
              <Field label="POD">
                <SearchField value={quote.pod} onChange={(v) => set("pod", v)} options={Object.keys(portCodes)} placeholder="Search ports…" onAddNew={(v) => set("pod", v)} disabled={readOnly} />
              </Field>
            </div>
            {isExportLike(quote) && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="POL agent">
                  <SearchField value={quote.polAgent || ""} onChange={(v) => set("polAgent", String(v || "").toUpperCase())} options={agentNames} placeholder="Pick an agent…" strict onAddNew={(name) => onAddParty && onAddParty({ name, roles: ["AGENT"], apply: (n) => set("polAgent", n) })} disabled={readOnly} />
                </Field>
                <Field label="POD agent">
                  <SearchField value={quote.podAgent || ""} onChange={(v) => set("podAgent", String(v || "").toUpperCase())} options={agentNames} placeholder="Pick an agent…" strict onAddNew={(name) => onAddParty && onAddParty({ name, roles: ["AGENT"], apply: (n) => set("podAgent", n) })} disabled={readOnly} />
                </Field>
                <div style={{ gridColumn: "1 / -1", fontSize: 11, color: "#8a8578", marginTop: -4 }}>Agents with a portal login see this booking: the POL agent until it sails (+14 days for the B/L), the POD agent from sailing. They never see freight or invoices.</div>
              </div>
            )}
            {isExportLike(quote) && (
              <Field label="Terms">
                <select value={termsOf(quote)} disabled={readOnly} style={INPUT_STYLE}
                  onChange={(e) => setNow({ terms: e.target.value, inclusions: {} })}>
                  {TERMS_OPTIONS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
                <div style={{ fontSize: 11, color: "#999", marginTop: 3 }}>Sets what the quotation lists as included / excluded. Changing it resets any per-line overrides on the Quotation tab.</div>
              </Field>
            )}
            <Field label="Product">
              <SearchField value={quote.product} onChange={(v) => set("product", v)} options={products} getLabel={(p) => p.name} placeholder="Search products…" onPick={pickProduct} onAddNew={onAddProduct} disabled={readOnly} />
              {compatStatus && (
                <div style={{ marginTop: 6, padding: "6px 8px", borderRadius: 4, fontSize: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
                  background: compatStatus === "APPROVED" ? "#E6F4EC" : compatStatus === "CONDITIONAL" ? "#CCFBF1" : compatStatus === "REJECTED" ? "#FBEAE7" : "#FFF3D9",
                  border: `1px solid ${COMPAT_STATUSES[compatStatus].color}` }}>
                  <StatusPill status={compatStatus} />
                  <span style={{ flex: 1, color: "#444" }}>
                    {compatStatus === "NOT_CHECKED" && "New product - compatibility check required before confirming."}
                    {compatStatus === "IN_REVIEW" && "Compatibility under review - not yet cleared for our tanks."}
                    {compatStatus === "REJECTED" && "Not acceptable in our tanks."}
                    {(compatStatus === "APPROVED" || compatStatus === "CONDITIONAL") && (compatProduct?.compatTank ? `Tank ${compatProduct.compatTank}` : "Cleared")}{compatProduct?.compatGasket ? ` · gaskets ${compatProduct.compatGasket}` : ""}
                    {compatProduct?.compatConditions && <div style={{ color: "#0F766E", whiteSpace: "pre-line" }}>{compatProduct.compatConditions}</div>}
                    {compatProduct?.compatCheckedBy && <div style={{ color: "#999", fontSize: 11 }}>Checked by {compatProduct.compatCheckedBy}{compatProduct.compatCheckedOn ? ` on ${compatProduct.compatCheckedOn}` : ""}{compatProduct.compatMsdsUrl ? <> · <a href={compatProduct.compatMsdsUrl} target="_blank" rel="noreferrer" style={{ color: "#2B6CB0" }}>MSDS</a></> : null}</div>}
                  </span>
                  {onOpenCompat && <button type="button" onClick={() => onOpenCompat(quote.product)} style={{ padding: "4px 8px", border: `1px solid ${COMPAT_STATUSES[compatStatus].color}`, borderRadius: 4, background: "#fff", color: COMPAT_STATUSES[compatStatus].color, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>{["APPROVED", "CONDITIONAL"].includes(compatStatus) ? "Re-check" : "Run check"}</button>}
                </div>
              )}
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="UN No."><input style={INPUT_STYLE} value={quote.unNo} onChange={(e) => set("unNo", e.target.value)} disabled={readOnly} /></Field>
              <Field label="SG"><input style={INPUT_STYLE} value={quote.sg} onChange={(e) => set("sg", e.target.value)} disabled={readOnly} /></Field>
            </div>
            <Field label="IMO Class"><input style={INPUT_STYLE} value={quote.imoClass} onChange={(e) => set("imoClass", e.target.value)} disabled={readOnly} /></Field>
            <Field label="Tank Capacity (L)"><input style={INPUT_STYLE} value={quote.tankCapacity} onChange={(e) => set("tankCapacity", e.target.value)} disabled={readOnly} /></Field>
            <Field label="MSDS (Material Safety Data Sheet)">
              {quote.msdsUrl && <div style={{ fontSize: 12, marginBottom: 6 }}><a href={quote.msdsUrl} target="_blank" rel="noreferrer" style={{ color: "#231E1E", fontWeight: 700 }}>📎 View current MSDS</a></div>}
              <input type="file" accept=".pdf,.doc,.docx" disabled={readOnly || msdsBusy} style={INPUT_STYLE}
                onChange={async (e) => { const f = e.target.files[0]; if (!f) return; e.target.value = ""; await handleMsdsUpload(f); }} />
              <div style={{ fontSize: 11, color: "#999", marginTop: 3 }}>A PDF is read on upload: product, UN No., class / packing group and SG are offered below for you to apply.</div>
            </Field>
            {msdsBusy && <div style={{ fontSize: 12, color: "#8a8578", marginBottom: 10 }}>Uploading and reading the MSDS…</div>}
            {msdsFound && (
              <div style={{ background: "#FFF8EC", border: "1px solid #F09128", borderRadius: 6, padding: 10, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#231E1E" }}>Found in the MSDS — tick what to apply</span>
                  <button onClick={() => setMsdsFound(null)} style={{ border: "none", background: "none", color: "#8a8578", cursor: "pointer", fontSize: 12 }}>✕</button>
                </div>
                {msdsFound.rows.length === 0 && <div style={{ fontSize: 12, color: "#8a6216" }}>Nothing recognisable — the PDF may be scanned images rather than text. Fill the fields by hand.</div>}
                {msdsFound.rows.map((r) => (
                  <label key={r.key} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 8, alignItems: "start", padding: "4px 0", fontSize: 12, borderBottom: "1px solid #f3e6d1" }}>
                    <input type="checkbox" checked={!!msdsPick[r.key]} onChange={(e) => setMsdsPick((p) => ({ ...p, [r.key]: e.target.checked }))} disabled={readOnly} />
                    <span>
                      <b>{r.label}:</b> {r.value}
                      {r.current && r.current !== r.value && <span style={{ color: "#C53030" }}> (currently “{r.current}”)</span>}
                      <div style={{ fontSize: 10, color: "#8a8578", fontFamily: "monospace" }}>{r.snippet}</div>
                    </span>
                  </label>
                ))}
                {msdsFound.rows.length > 0 && !readOnly && (
                  <button onClick={applyMsds} style={{ width: "100%", marginTop: 8, padding: 8, border: "none", borderRadius: 4, background: "#F09128", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                    Apply ticked values to the quote
                  </button>
                )}
              </div>
            )}
            <div style={{ background: "#fff", border: "1px solid #e0ddd3", borderRadius: 6, padding: 10, fontSize: 12 }}>
              Min Load (80%): <b>{fmt(minLoad80(quote))}</b> · Max Load (95%): <b>{fmt(maxLoad95(quote))}</b>
            </div>
          </>
        )}

        {tab === "costing" && (
          <>
            {currencyBox}
            {!isLease(quote) && <SailingRatePicker quote={quote} readOnly={readOnly} setItem={setItem} setNow={setNow} />}
            {COST_SECTION_ORDER.map((section) => (
              <div key={section} style={{ marginBottom: 16 }}>
                <div style={{ background: "#231E1E", color: "#fff", padding: "6px 10px", borderRadius: 4, fontWeight: 700, fontSize: 12, marginBottom: 8 }}>
                  {COST_SECTIONS[section].title} — ${fmt(sectionTotal(quote, section))}{anyAed ? " USD" : ""}
                </div>
                {(quote.costs[section] || []).map((it) => (
                  <div key={it.id} style={{ background: "#fff", border: "1px solid #e0ddd3", borderRadius: 6, padding: 10, marginBottom: 6 }}>
                    <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                      <div style={{ flex: 2 }}>
                        <SearchField value={it.label} onChange={(v) => setItem(it.id, "label", v)} options={headsFor(section)} placeholder="Cost head - pick from the list or type a new one" onAddNew={(v) => { setItem(it.id, "label", v); onAddCostHead && onAddCostHead(v, section); }} disabled={readOnly} />
                      </div>
                      {!readOnly && <button onClick={() => removeItem(it.id)} style={{ border: "none", background: "none", color: "#C53030", cursor: "pointer", flex: "none" }}>✕</button>}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      <SearchField value={it.vendor} onChange={(v) => setItem(it.id, "vendor", v)} options={vendors} placeholder="Vendor" strict onAddNew={(name) => onAddParty && onAddParty({ name, roles: ["VENDOR"], apply: (n) => setItem(it.id, "vendor", n) })} disabled={readOnly} />
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <input value={it.amount} onChange={(e) => setItem(it.id, "amount", e.target.value)} placeholder="Amount" inputMode="decimal" disabled={readOnly} style={{ ...INPUT_STYLE, flex: 1, minWidth: 0 }} />
                        <CurrencyToggle value={it.currency} onChange={(c) => setItem(it.id, "currency", c)} />
                      </div>
                    </div>
                    {usdHint(it.amount, it.currency) && <div style={{ textAlign: "right", marginTop: 3 }}>{usdHint(it.amount, it.currency)}</div>}
                    <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
                      <input value={it.remarks || ""} onChange={(e) => setItem(it.id, "remarks", e.target.value)} placeholder="Remarks (basis, who quoted, conditions…)" disabled={readOnly}
                        style={{ ...INPUT_STYLE, flex: 1, fontSize: 12, background: readOnly ? "#f7f6f2" : "#fffdf5" }} />
                      <span style={{ fontSize: 10, color: "#8a8578", fontWeight: 700, whiteSpace: "nowrap" }}>VALID UNTIL</span>
                      <input type="date" value={it.validUntil || ""} onChange={(e) => setItem(it.id, "validUntil", e.target.value)} disabled={readOnly} title={it.validUntil ? "Vendor rate validity" : `No date given - treated as end of month (${validityOf(it)})`}
                        style={{ ...INPUT_STYLE, width: 150, fontSize: 12, background: validityOf(it) < todayIso ? "#FBEAE7" : readOnly ? "#f7f6f2" : "#fffdf5", borderColor: validityOf(it) < todayIso ? "#C53030" : it.validUntil ? "#ccc" : "#d9d3c4" }} />
                    </div>
                    {!it.validUntil && <div style={{ fontSize: 10, color: "#8a8578", marginTop: 2, textAlign: "right" }}>no date given - valid to {validityOf(it)} ({validityRuleText})</div>}
                    {validityOf(it) < todayIso && <div style={{ fontSize: 11, color: "#C53030", marginTop: 3, textAlign: "right" }}>Vendor rate expired on {validityOf(it)}{it.validUntil ? "" : " (default validity)"} — re-confirm before quoting.</div>}
                  </div>
                ))}
                {!readOnly && (
                  <button onClick={() => addItem(section)} style={{ width: "100%", padding: 8, border: "1px solid #231E1E", color: "#231E1E", background: "#fff", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>
                    + Add Line Item
                  </button>
                )}
              </div>
            ))}
            <div style={{ background: "#fff", border: "1px solid #e0ddd3", borderRadius: 6, padding: 10, fontWeight: 700, textAlign: "right" }}>
              Total Cost: ${fmt(totalCost(quote))}{anyAed ? <span style={{ fontWeight: 400, fontSize: 11, color: "#8a8578" }}> USD at {fmt(fx)}</span> : null}
            </div>
          </>
        )}

        {tab === "quotation" && isLease(quote) && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <button onClick={async () => { await flush(); setShowQuotation(true); }}
                style={{ flex: 1, padding: 12, border: "none", borderRadius: 4, background: "#F09128", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                📄 Preview / PDF
              </button>
              <button onClick={async () => { await flush(); try { await downloadLeaseAgreementDocx(quote); } catch (e) { alert("Word export failed: " + (e.message || e)); } }}
                style={{ flex: 1, padding: 12, border: "1px solid #2B6CB0", borderRadius: 4, background: "#fff", color: "#2B6CB0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                📝 Download Word (.docx)
              </button>
            </div>
            <div style={{ fontSize: 11, color: "#999", marginBottom: 12, marginTop: -8 }}>
              The Lease Agreement (your 11 Sep draft) built from this quote: rental rate, on/off-hire and every per-tank charge line come from the Rental tab, tank type / capacity / product from Details. Use Word for wording the form doesn't cover.
            </div>

            <div style={{ ...LABEL_STYLE, marginBottom: 6 }}>Parties</div>
            <Field label="Lessee (customer) — name comes from Details; address here, one line per row">
              <textarea style={{ ...INPUT_STYLE, minHeight: 70, fontFamily: "inherit" }} value={quote.lesseeAddress || ""} onChange={(e) => set("lesseeAddress", e.target.value)} disabled={readOnly}
                placeholder={"Unit No, Building, Plot No\nArea, City, Country\nPhone"} />
            </Field>
            <Field label="Signed for Genesis by"><input style={INPUT_STYLE} value={quote.fromName} onChange={(e) => set("fromName", e.target.value)} disabled={readOnly} placeholder="Alex Thomas" /></Field>

            <div style={{ ...LABEL_STYLE, marginBottom: 6 }}>Equipment</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Tank Type"><input style={INPUT_STYLE} value={quote.tankType} onChange={(e) => set("tankType", e.target.value)} disabled={readOnly} placeholder="T11" /></Field>
              <Field label="Steam Heating">
                <div style={{ display: "flex", gap: 4 }}>
                  {[["Yes", true], ["No", false]].map(([label, v]) => (
                    <button key={label} type="button" disabled={readOnly} onClick={() => setNow({ steamHeating: v })}
                      style={{ flex: 1, padding: "8px 4px", border: "1px solid #231E1E", borderRadius: 4, fontSize: 12, fontWeight: 700, cursor: readOnly ? "not-allowed" : "pointer",
                        background: !!quote.steamHeating === v ? "#231E1E" : "#fff", color: !!quote.steamHeating === v ? "#fff" : "#231E1E" }}>{label}</button>
                  ))}
                </div>
              </Field>
            </div>
            <Field label="Tank Number(s) — blank prints “To be added by appendix.”">
              <div style={{ display: "flex", gap: 6 }}>
                <input style={{ ...INPUT_STYLE, flex: 1 }} value={quote.tankNumbers || ""} onChange={(e) => set("tankNumbers", e.target.value)} disabled={readOnly} placeholder={LEASE_DEFAULTS.tankNumbers} />
                {!readOnly && quoteJobNumbers(quote).length > 0 && (
                  <button type="button" onClick={fillTankNumbers} disabled={fillingTanks}
                    style={{ flex: "none", padding: "0 10px", border: "1px solid #231E1E", borderRadius: 4, background: "#fff", color: "#231E1E", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    {fillingTanks ? "…" : "Fill from linked jobs"}
                  </button>
                )}
              </div>
            </Field>
            <div style={{ fontSize: 11, color: "#999", marginBottom: 12 }}>Capacity prints from Tank Capacity on Details ({quote.tankCapacity ? `${quote.tankCapacity} L` : "not set"}); cargo and UN No from Product.</div>

            <div style={{ ...LABEL_STYLE, marginBottom: 6 }}>Lease Period & Payment</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Empty Return Depot"><input style={INPUT_STYLE} value={quote.returnDepot || ""} onChange={(e) => set("returnDepot", e.target.value)} disabled={readOnly} placeholder={quote.pod || "e.g. Nhava Sheva"} /></Field>
              <Field label="On-hire Depot (pick up)"><input style={INPUT_STYLE} value={quote.emptyDepot} onChange={(e) => set("emptyDepot", e.target.value)} disabled={readOnly} /></Field>
              <Field label="Minimum Lease Period (days)"><input style={INPUT_STYLE} value={quote.minLeaseDays ?? ""} onChange={(e) => set("minLeaseDays", e.target.value)} disabled={readOnly} placeholder={String(LEASE_DEFAULTS.minLeaseDays)} inputMode="numeric" /></Field>
              <Field label="Days allowed for cleaning after return"><input style={INPUT_STYLE} value={quote.cleaningDays ?? ""} onChange={(e) => set("cleaningDays", e.target.value)} disabled={readOnly} placeholder={String(LEASE_DEFAULTS.cleaningDays)} inputMode="numeric" /></Field>
            </div>
            <Field label="Payment Terms — blank prints “<minimum days> Days rental payment in advance prior to the release of the tanks.”">
              <input style={INPUT_STYLE} value={quote.paymentTerms || ""} onChange={(e) => set("paymentTerms", e.target.value)} disabled={readOnly} placeholder={LEASE_DEFAULTS.paymentTerms} />
            </Field>
            <Field label="Purpose of the lease — “to be used for the ___ of <product>”">
              <input style={INPUT_STYLE} value={quote.leaseUse || ""} onChange={(e) => set("leaseUse", e.target.value)} disabled={readOnly} placeholder={LEASE_DEFAULTS.leaseUse} />
            </Field>
            <div style={{ fontSize: 11, color: "#999", marginBottom: 12 }}>
              Cleaning charges and any other per-tank charge: add them as “per tank” lines on the Rental tab — each prints under Rental Rate & Payments. Insurance amounts and the remaining clauses are fixed wording from the draft.
            </div>
          </>
        )}

        {tab === "quotation" && isExportLike(quote) && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <button onClick={async () => { await flush(); setShowQuotation(true); }}
                style={{ flex: 1, padding: 12, border: "none", borderRadius: 4, background: "#F09128", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                📄 Preview / PDF
              </button>
              <button onClick={async () => { await flush(); try { await downloadQuotationDocx(quote, podRebates); } catch (e) { alert("Word export failed: " + (e.message || e)); } }}
                style={{ flex: 1, padding: 12, border: "1px solid #2B6CB0", borderRadius: 4, background: "#fff", color: "#2B6CB0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                📝 Download Word (.docx)
              </button>
            </div>
            <div style={{ fontSize: 11, color: "#999", marginBottom: 12, marginTop: -8 }}>
              Both are built from this quote. Use Word when the customer needs wording the form doesn't cover — edit there and send that copy.
            </div>

            <div style={{ ...LABEL_STYLE, marginBottom: 6 }}>Header</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Attn"><input style={INPUT_STYLE} value={quote.attn} onChange={(e) => set("attn", e.target.value)} disabled={readOnly} placeholder="Customer contact" /></Field>
              <Field label="From"><input style={INPUT_STYLE} value={quote.fromName} onChange={(e) => set("fromName", e.target.value)} disabled={readOnly} placeholder="Genesis contact" /></Field>
              <Field label="Ref No"><input style={INPUT_STYLE} value={quote.refNo} onChange={(e) => set("refNo", e.target.value)} disabled={readOnly} placeholder="Customer's reference" /></Field>
              <Field label="Type of Tank Container"><input style={INPUT_STYLE} value={quote.tankType} onChange={(e) => set("tankType", e.target.value)} disabled={readOnly} placeholder="T11" /></Field>
            </div>
            <div style={{ fontSize: 11, color: "#999", marginBottom: 12 }}>
              Date, customer, quote number, rate, product, classification, SG, payload, ports, terms, routing, transit time, validity and the demurrage clauses all come from the other tabs.
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <span style={LABEL_STYLE}>Included / Excluded{isExportLike(quote) ? ` — defaults for ${termsLabel(quote)}` : ""}</span>
              {!readOnly && Object.keys(quote.inclusions || {}).length > 0 && (
                <button onClick={() => setNow({ inclusions: {} })}
                  style={{ border: "none", background: "none", color: "#2B6CB0", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0 }}>
                  Reset to defaults
                </button>
              )}
            </div>
            <div style={{ background: "#fff", border: "1px solid #e0ddd3", borderRadius: 6, padding: 6, marginBottom: 12 }}>
              {inclusionsFor(quote).map((it) => {
                const on = isIncluded(quote, it.key);
                const changed = isOverridden(quote, it.key);
                return (
                  <div key={it.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 6px", borderBottom: "1px solid #f0ede6", fontSize: 12, background: changed ? "#FFF8EC" : "transparent" }}>
                    <span>{it.label}{changed && <span style={{ marginLeft: 6, fontSize: 10, color: "#F09128", fontWeight: 700 }}>changed from {defaultIncluded(quote, it.key) ? "Included" : "Excluded"}</span>}</span>
                    <button onClick={() => toggleInclusion(it.key)} disabled={readOnly}
                      style={{ minWidth: 84, padding: "4px 10px", border: `1px solid ${on ? "#2E7D5B" : "#8a8578"}`, borderRadius: 12, fontSize: 11, fontWeight: 700,
                        cursor: readOnly ? "not-allowed" : "pointer", background: on ? "#2E7D5B" : "#fff", color: on ? "#fff" : "#8a8578" }}>
                      {on ? "Included" : "Excluded"}
                    </button>
                  </div>
                );
              })}
            </div>

            <Field label="Remarks (page 2)">
              <textarea style={{ ...INPUT_STYLE, minHeight: 110, fontFamily: "inherit" }} value={quote.remarks} onChange={(e) => set("remarks", e.target.value)} disabled={readOnly} />
            </Field>
          </>
        )}

        {showQuotation && (
          <ReportPreview
            title={isLease(quote) ? `Lease Agreement — ${quote.customer || quote.quoteNumber || "Draft"}` : `Quotation — ${quote.quoteNumber || "Draft"}`}
            fileName={quoteFileName(quote, isLease(quote) ? "Lease Agreement" : "Quotation")}
            html={isLease(quote) ? buildLeaseAgreementHTML(quote) : buildQuotationHTML(quote, podRebates)}
            onClose={() => setShowQuotation(false)}
          />
        )}

        {tab === "rental" && isRepo(quote) && (
          <>
            <div style={{ background: "#fff", border: "1px solid #e0ddd3", borderRadius: 6, padding: 12, fontSize: 13 }}>
              <div style={{ color: "#666", marginBottom: 8 }}>
                Internal repositioning — no customer and no revenue. Everything this move costs is captured on the Costing tab.
              </div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#C53030" }}>
                Total Repo Cost: ${fmt(totalCost(quote))}
              </div>
            </div>

            {!readOnly && (
              <button onClick={handleSave} style={{ width: "100%", padding: 12, marginTop: 14, border: "none", borderRadius: 4, background: "#231E1E", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                💾 {quote.quoteNumber ? "Save Quote" : "Save Quote — Assign Quote Number"}
              </button>
            )}
          </>
        )}

        {tab === "rental" && isLease(quote) && (
          <>
            {currencyBox}
            <div style={{ ...LABEL_STYLE, marginBottom: 6 }}>Lease Revenue</div>
            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              {[["flat", "Flat rate"], ["slab", "Slab-wise"]].map(([k, label]) => {
                const active = (slabMode === "slab") === (k === "slab");
                return (
                  <button key={k} disabled={readOnly}
                    onClick={() => k === "slab" ? setNow({ leaseRateSlabs: DEFAULT_SLABS.map((s) => ({ ...s })) }) : setNow({ leaseRateSlabs: null, leaseRateDaily: quote.leaseRateDaily || String(leaseRateDaily(quote) || "") })}
                    style={{ flex: 1, padding: "7px 4px", border: "1px solid #231E1E", borderRadius: 4, fontSize: 12, fontWeight: 700, cursor: readOnly ? "not-allowed" : "pointer",
                      background: active ? "#231E1E" : "#fff", color: active ? "#fff" : "#231E1E" }}>
                    {label}
                  </button>
                );
              })}
            </div>
            {slabMode === "flat" ? (
              <Field label={`Lease Rate (${sellCur} per day)`}>
                <input style={INPUT_STYLE} value={quote.leaseRateDaily} onChange={(e) => set("leaseRateDaily", e.target.value)} inputMode="decimal" disabled={readOnly} />
              </Field>
            ) : (
              <div style={{ background: "#fff", border: "1px solid #e0ddd3", borderRadius: 6, padding: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>
                  Counted per tank from its own Depot Out (pick up), which is day 1; the return day is charged too. The last slab runs on until the tank comes back.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 6, alignItems: "center", fontSize: 12 }}>
                  <div style={LABEL_STYLE}>From day</div><div style={LABEL_STYLE}>To day</div><div style={LABEL_STYLE}>{sellCur} per day</div><div />
                  {slabRows.map((s, i) => {
                    const from = i === 0 ? 1 : (parseInt(slabRows[i - 1].upTo, 10) || 0) + 1;
                    const last = i === slabRows.length - 1;
                    return (
                      <Fragment key={i}>
                        <div style={{ color: "#666", paddingLeft: 4 }}>{from}</div>
                        {last
                          ? <div style={{ color: "#666", paddingLeft: 4 }}>thereafter</div>
                          : <input style={INPUT_STYLE} value={s.upTo ?? ""} onChange={(e) => setSlab(i, "upTo", e.target.value)} inputMode="numeric" disabled={readOnly} />}
                        <input style={INPUT_STYLE} value={s.rate ?? ""} onChange={(e) => setSlab(i, "rate", e.target.value)} inputMode="decimal" disabled={readOnly} />
                        {!readOnly && slabRows.length > 2 && !last
                          ? <button onClick={() => removeSlab(i)} style={{ border: "none", background: "none", color: "#C53030", cursor: "pointer" }}>✕</button>
                          : <div />}
                      </Fragment>
                    );
                  })}
                </div>
                {!readOnly && (
                  <button onClick={addSlab} style={{ width: "100%", padding: 6, marginTop: 8, border: "1px solid #231E1E", color: "#231E1E", background: "#fff", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>
                    + Add Slab
                  </button>
                )}
                <div style={{ fontSize: 11, color: "#2E7D5B", marginTop: 8, fontWeight: 700 }}>{slabSummary(quote.leaseRateSlabs, (n) => `${sym}${fmt(n)}`)}</div>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label={`On-Hire Charge (${sellCur} per tank)`}><input style={INPUT_STYLE} value={quote.onHireCharge} onChange={(e) => set("onHireCharge", e.target.value)} inputMode="decimal" disabled={readOnly} /></Field>
              <Field label={`Off-Hire Charge (${sellCur} per tank)`}><input style={INPUT_STYLE} value={quote.offHireCharge} onChange={(e) => set("offHireCharge", e.target.value)} inputMode="decimal" disabled={readOnly} /></Field>
            </div>

            <div style={{ ...LABEL_STYLE, margin: "6px 0" }}>Additional Charges</div>
            {(quote.leaseItems || []).map((it) => (
              <div key={it.id} style={{ background: "#fff", border: "1px solid #e0ddd3", borderRadius: 6, padding: 10, marginBottom: 6 }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <input value={it.label} onChange={(e) => setItem(it.id, "label", e.target.value)} placeholder="Charge (e.g. Cleaning on return)" disabled={readOnly} style={{ ...INPUT_STYLE, flex: 2 }} />
                  {!readOnly && <button onClick={() => removeItem(it.id)} style={{ border: "none", background: "none", color: "#C53030", cursor: "pointer", flex: "none" }}>✕</button>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <input value={it.amount} onChange={(e) => setItem(it.id, "amount", e.target.value)} placeholder="Amount" inputMode="decimal" disabled={readOnly} style={{ ...INPUT_STYLE, flex: 1, minWidth: 0 }} />
                    <CurrencyToggle value={it.currency} onChange={(c) => setItem(it.id, "currency", c)} />
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {LEASE_BASES.map((b) => (
                      <button key={b.key} onClick={() => setItem(it.id, "basis", b.key)} disabled={readOnly}
                        style={{ flex: 1, padding: "6px 4px", border: "1px solid #231E1E", borderRadius: 4, fontSize: 11, fontWeight: 700,
                          cursor: readOnly ? "not-allowed" : "pointer",
                          background: (it.basis || "TANK") === b.key ? "#231E1E" : "#fff", color: (it.basis || "TANK") === b.key ? "#fff" : "#231E1E" }}>
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            {!readOnly && (
              <button onClick={addLeaseItem} style={{ width: "100%", padding: 8, marginBottom: 12, border: "1px solid #231E1E", color: "#231E1E", background: "#fff", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>
                + Add Charge
              </button>
            )}

            <div style={{ background: "#fff", border: "1px solid #e0ddd3", borderRadius: 6, padding: 12, fontSize: 13 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#2E7D5B" }}>
                Per Day: ${fmt(leasePerDayRevenue(quote))}{slabMode === "slab" && <span style={{ fontWeight: 400, fontSize: 12, color: "#666" }}> on day 1, stepping down to ${fmt(leaseRateOnDay(quote, 100000) + (leasePerDayRevenue(quote) - leaseRateDaily(quote)))} thereafter</span>}
              </div>
              <div style={{ fontSize: 11, color: "#999", marginBottom: 8 }}>{anyAed ? "USD at " + fmt(fx) + ". " : ""}Lease rate plus any per-day charges — recurring for the life of the lease.{slabMode === "slab" && <> A tank out 120 days has earned <b>${fmt(leaseAccruedRevenue(quote, 120))}</b>.</>}</div>
              <div style={{ paddingTop: 8, borderTop: "1px solid #e0ddd3" }}>
                <div>One-off Revenue per Tank: <b>${fmt(leasePerTankRevenue(quote))}</b> <span style={{ color: "#999", fontSize: 11 }}>(on-hire + off-hire + per-tank charges)</span></div>
                <div>Depot Costs per Tank: <b>${fmt(totalCost(quote))}</b></div>
                <div style={{ fontWeight: 700, fontSize: 15, marginTop: 6, color: leasePerTankMargin(quote) < 0 ? "#C53030" : "#2E7D5B" }}>
                  One-off Margin per Tank: ${fmt(leasePerTankMargin(quote))}
                </div>
              </div>
              <div style={{ fontSize: 11, color: "#999", marginTop: 6 }}>
                The per-day figure and the per-tank figures are on different clocks and are not added together.
              </div>
            </div>

            {!readOnly && (
              <button onClick={handleSave} style={{ width: "100%", padding: 12, marginTop: 14, border: "none", borderRadius: 4, background: "#231E1E", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                💾 {quote.quoteNumber ? "Save Quote" : "Save Quote — Assign Quote Number"}
              </button>
            )}
          </>
        )}

        {tab === "rental" && isExportLike(quote) && (
          <>
            {currencyBox}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Free Time POL (days)"><input style={INPUT_STYLE} value={quote.freeTimePOL} onChange={(e) => set("freeTimePOL", e.target.value)} disabled={readOnly} /></Field>
              <Field label={`Demurrage Rate POL (${sym.trim()}/day)`}><input style={INPUT_STYLE} value={quote.demurrageRatePOL} onChange={(e) => set("demurrageRatePOL", e.target.value)} disabled={readOnly} /></Field>
              <Field label="Free Time POD (days)"><input style={INPUT_STYLE} value={quote.freeTimePOD} onChange={(e) => set("freeTimePOD", e.target.value)} disabled={readOnly} /></Field>
              <Field label={`Demurrage Rate POD (${sym.trim()}/day)`}><input style={INPUT_STYLE} value={quote.demurrageRatePOD} onChange={(e) => set("demurrageRatePOD", e.target.value)} disabled={readOnly} /></Field>
              <Field label="Transit Time (days)"><input style={INPUT_STYLE} value={quote.transitTime} onChange={(e) => set("transitTime", e.target.value)} disabled={readOnly} /></Field>
              <Field label={`Base Sell (${sellCur})`}><input style={INPUT_STYLE} value={quote.baseSell} onChange={(e) => set("baseSell", e.target.value)} disabled={readOnly} /></Field>
            </div>
            <Field label="POD Rebate Override (USD, optional — overrides table lookup)">
              <input style={INPUT_STYLE} value={quote.podRebateOverride} onChange={(e) => set("podRebateOverride", e.target.value)} disabled={readOnly} />
            </Field>
            <div style={{ background: "#fff", border: "1px solid #e0ddd3", borderRadius: 6, padding: 12, fontSize: 13 }}>
              {isManaged(quote) && <div style={{ color: "#8a8578", fontSize: 12, marginBottom: 4 }}>Customer-owned tanks — freight and operations only. No tank rental is earned, so there is no rental per day; the figure that matters is the freight margin per tank.</div>}
              {isExport(quote) && <div>Total PLY Days: <b>{totalPlyDays(quote)}</b></div>}
              <div>POD Rebate: <b>${fmt(podRebateFor(quote, podRebates))}</b> <span style={{ color: "#8a8578", fontSize: 11 }}>(destination revenue - not shown to the customer; the quotation carries Base Sell only)</span></div>
              <div>Total Revenue (Base Sell + POD Rebate): <b>${fmt(totalSell(quote, podRebates))}</b>{sellCur !== "USD" && <span style={{ color: "#8a8578", fontSize: 11 }}> (base {sellCur} {fmt(num(quote.baseSell))} at {fxRateFor(quote, sellCur)})</span>}</div>
              <div>Total Cost: <b>${fmt(totalCost(quote))}</b></div>
              <div style={{ fontWeight: 700, fontSize: 15, marginTop: 6, color: marginOf(quote, podRebates) < 0 ? "#C53030" : "#2E7D5B" }}>
                Margin: ${fmt(marginOf(quote, podRebates))}
              </div>
              {isExport(quote) && <div style={{ fontWeight: 700, fontSize: 15, marginTop: 4, color: rentalPerDay(quote, podRebates) < 0 ? "#C53030" : "#2E7D5B" }}>
                Rental Per Day: ${fmt(rentalPerDay(quote, podRebates))}
              </div>}
            </div>

            {!readOnly && (
              <button onClick={handleSave} style={{ width: "100%", padding: 12, marginTop: 14, border: "none", borderRadius: 4, background: "#231E1E", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                💾 {quote.quoteNumber ? "Save Quote" : "Save Quote — Assign Quote Number"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
