import { useEffect, useMemo, useState } from "react";
import SearchField from "./SearchField.jsx";
import JobAdviceButton from "./JobAdviceButton.jsx";
import ReleaseRequestButton from "./ReleaseRequestButton.jsx";
import { updateTankFields, uploadCleaningCertificate, fetchQuoteForJob } from "../lib/tanksApi.js";
import { idlingDays } from "../lib/tankLogic.js";
import LeaseRateEditor, { leaseRateFilled } from "./LeaseRateEditor.jsx";
import { slabSummary, quoteLeaseRateUsd } from "../lib/leaseSlabs.js";
import JobNumberField from "./JobNumberField.jsx";
import { fetchOpenJobs, registerSeaknotsJob } from "../quotes/lib/jobsApi.js";

const INPUT = { width: "100%", padding: "8px 9px", border: "1px solid #ccc", borderRadius: 4, fontSize: 13, boxSizing: "border-box" };
const LABEL = { fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "#8a8578", display: "block", marginBottom: 3 };
const today = () => new Date().toISOString().slice(0, 10);
function F({ label, required, hint, children }) {
  return <div style={{ marginBottom: 10 }}><label style={LABEL}>{label}{required && <span style={{ color: "#C53030" }}> *</span>}</label>{children}{hint && <div style={{ fontSize: 11, color: "#999", marginTop: 3 }}>{hint}</div>}</div>;
}

// The same three allocation flows the per-tank modal offers, so a repo move
// or a lease covering several tanks can be done in one pass instead of one
// tank at a time. Each type lands the tanks in a different status and asks
// for a different, minimal set of fields — no demurrage terms on a repo, no
// ports on a lease.
const JOB_TYPES = [
  { key: "export", label: "Normal Export" },
  { key: "repo", label: "Tank Repo" },
  { key: "lease", label: "Local Lease" },
];

const TYPE_CONFIG = {
  export: { status: "MT ALLOCATED", existingStatuses: ["MT ALLOCATED", "DEPOT OUT"], title: "Allocate Tanks to a Job", noun: "job" },
  repo: { status: "MT REPO", existingStatuses: ["MT REPO"], title: "Allocate Tanks to a Repo Move", noun: "repo move" },
  lease: { status: "ON LEASE", existingStatuses: ["ON LEASE"], title: "Allocate Tanks to a Lease", noun: "lease" },
};

// Job-first allocation: enter the job's details once, then tick the tanks
// to allocate from a location / depot, and allocate them all in one go.
// Adding tanks to a job that already has some pre-fills the job's details.
// `preset` = a job opened in the app (Pending Allocation tab): { jobNumber, jobType, customer, pol, pod, freeTimeOrigin,
// freeTimeDestination, demurrageRateOrigin, demurrageRateDestination } - the number is fixed and shown, not typed, and the
// quote behind the job fills the rest; the operator only checks the terms and picks the tanks.
export default function JobAllocateModal({ tanks, onClose, onAllocated, portNames, customers, onAddCustomer, preset = null }) {
  const [step, setStep] = useState("job"); // job | pick | done
  const [jobType, setJobType] = useState((preset && preset.jobType) || "export");
  const [job, setJob] = useState({
    jobNumber: "", customer: "", pol: "", pod: "",
    freeTimeOrigin: "", demurrageRateOrigin: "", freeTimeDestination: "", demurrageRateDestination: "",
    repoOrigin: "", repoDestination: "", leaseRate: "", leaseSlabs: null,
    ...(preset ? { jobNumber: preset.jobNumber || "", customer: preset.customer || "", pol: preset.pol || "", pod: preset.pod || "", repoOrigin: preset.pol || "", repoDestination: preset.pod || "",
      freeTimeOrigin: preset.freeTimeOrigin || "", freeTimeDestination: preset.freeTimeDestination || "", demurrageRateOrigin: preset.demurrageRateOrigin || "", demurrageRateDestination: preset.demurrageRateDestination || "" } : {}),
  });
  const locked = !!(preset && preset.jobNumber);
  const [prefillNote, setPrefillNote] = useState("");
  // open jobs from the Jobs module for the picker (app-created and SeaKnots); picking one fills lane / customer from its snapshot
  const [openJobs, setOpenJobs] = useState([]);
  useEffect(() => { let live = true; fetchOpenJobs().then((r) => { if (live) setOpenJobs(r || []); }).catch(() => {}); return () => { live = false; }; }, []);
  const pickJob = (jb) => { const sn = jb.snapshot || {}; setJob((j) => ({ ...j, customer: j.customer || jb.customer || sn.customer || "", pol: j.pol || sn.pol || "", pod: j.pod || sn.pod || "", repoOrigin: j.repoOrigin || sn.pol || "", repoDestination: j.repoDestination || sn.pod || "", freeTimeOrigin: j.freeTimeOrigin || (sn.freeTimePOL ? String(sn.freeTimePOL) : ""), freeTimeDestination: j.freeTimeDestination || (sn.freeTimePOD ? String(sn.freeTimePOD) : "") })); };
  // Managed quote (customer-owned tanks): only that owner's tanks may be picked (9 Oct)
  const [managedOwner, setManagedOwner] = useState(null);
  const [location, setLocation] = useState("");
  const [operator, setOperator] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [certs, setCerts] = useState({}); // tankId -> File
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState(null);
  const [doneTanks, setDoneTanks] = useState([]);
  const [doneType, setDoneType] = useState("export");

  const cfg = TYPE_CONFIG[jobType];
  const jn = job.jobNumber.trim();
  // Repo moves may carry no job number, and an empty one must not match every
  // other tank that also has none — with no job number there is nothing to
  // group by, so treat it as no siblings.
  const existing = useMemo(
    () => (jn ? tanks.filter((t) => t.manualJobNumber === jn && cfg.existingStatuses.includes(t.status)) : []),
    [tanks, jn, cfg]
  );

  // Pre-fill from tanks already on this job, else from the quote in the
  // Quotes app. Only Normal Export has a quote behind it — a repo move is
  // internal and a lease is priced separately — so the other two types
  // pre-fill from sibling tanks only.
  useEffect(() => {
    if (!jn) { setPrefillNote(""); setManagedOwner(null); return; }
    if (existing.length) {
      if (existing[0].ownership === "CUSTOMER_OWNED") setManagedOwner(existing[0].tankOwner || existing[0].customer || "");
      const e = existing[0];
      if (jobType === "export") {
        setJob((j) => ({ ...j, customer: j.customer || e.customer || "", pol: j.pol || e.pol || "", pod: j.pod || e.pod || "", freeTimeOrigin: j.freeTimeOrigin || e.freeTimeOrigin || "", demurrageRateOrigin: j.demurrageRateOrigin || e.demurrageRateOrigin || "", freeTimeDestination: j.freeTimeDestination || e.freeTimeDestination || "", demurrageRateDestination: j.demurrageRateDestination || e.demurrageRateDestination || "" }));
      } else if (jobType === "repo") {
        setJob((j) => ({ ...j, repoOrigin: j.repoOrigin || e.pol || "", repoDestination: j.repoDestination || e.pod || "" }));
      } else {
        setJob((j) => ({ ...j, customer: j.customer || e.customer || "", leaseRate: j.leaseRate || e.localLeaseRateDaily || "",
          leaseSlabs: j.leaseSlabs || (Array.isArray(e.localLeaseRateSlabs) && e.localLeaseRateSlabs.length ? e.localLeaseRateSlabs : null) }));
      }
      setPrefillNote(`${existing.length} tank${existing.length === 1 ? " is" : "s are"} already on this ${cfg.noun} — details filled from them; you're adding more.`);
      // sibling tanks with no demurrage terms (SeaKnots-era allocations): still ask the quote for them
      if (!(jobType === "export" && !(e.freeTimeOrigin && e.demurrageRateOrigin && e.freeTimeDestination && e.demurrageRateDestination))) return;
    }
    if (jobType === "repo") { setPrefillNote(""); setManagedOwner(null); return; }
    let live = true;
    fetchQuoteForJob(jn).then((q) => {
      if (!live || !q) { if (live) { setPrefillNote(""); setManagedOwner(null); } return; }
      setManagedOwner(q.quote_type === "MANAGED" ? (q.customer || "") : null);
      if (jobType === "lease") {
        // A lease quote carries the rate structure (flat or slab-wise) -
        // copy it onto the job so Inventory bills exactly what was quoted.
        // The quote may be priced in AED; Inventory bills in USD, so convert
        // at the quote's own rate before prefilling.
        const { rate: qRate, slabs } = quoteLeaseRateUsd(q);
        const hasRate = slabs || qRate;
        setJob((j) => ({ ...j, customer: j.customer || q.customer || "",
          leaseRate: j.leaseRate || qRate || "",
          leaseSlabs: j.leaseSlabs || slabs }));
        setPrefillNote(hasRate
          ? `Customer and ${slabs ? "slab-wise" : "flat"} lease rate filled from quote ${q.quote_number || ""} in the Quotes app.`
          : `Customer filled from quote ${q.quote_number || ""} (no lease rate on the quote${q.quote_type && q.quote_type !== "LEASE" ? " - it is a " + q.quote_type.toLowerCase() + " quote" : ""}).`);
        return;
      }
      const terms = q.free_time_pol || q.demurrage_rate_pol || q.free_time_pod || q.demurrage_rate_pod;
      setJob((j) => ({ ...j, customer: j.customer || q.customer || "", pol: j.pol || q.pol || "", pod: j.pod || q.pod || "",
        freeTimeOrigin: j.freeTimeOrigin || q.free_time_pol || "", demurrageRateOrigin: j.demurrageRateOrigin || q.demurrage_rate_pol || "",
        freeTimeDestination: j.freeTimeDestination || q.free_time_pod || "", demurrageRateDestination: j.demurrageRateDestination || q.demurrage_rate_pod || "" }));
      setPrefillNote(`Customer / POL / POD${terms ? " / demurrage terms" : ""} filled from quote ${q.quote_number || ""} in the Quotes app${terms ? "" : " (no demurrage terms on the quote)"}.`);
    }).catch(() => {});
    return () => { live = false; };
  }, [jn, existing.length, jobType]);

  const jobReady =
    jobType === "export" ? Boolean(jn && job.freeTimeOrigin && job.demurrageRateOrigin && job.freeTimeDestination && job.demurrageRateDestination) :
    jobType === "repo" ? Boolean(job.repoDestination.trim()) :
    Boolean(jn && job.customer.trim() && leaseRateFilled({ rate: job.leaseRate, slabs: job.leaseSlabs }));

  // A Managed job gets the owner's own tanks only (name match on the quote's
  // customer; every customer-owned tank if the names do not line up, with a
  // warning); any other job never gets a customer-owned tank.
  const norm = (s) => String(s || "").trim().toUpperCase();
  const available = useMemo(() => {
    const empty = tanks.filter((t) => t.status === "MT AVAILABLE");
    if (managedOwner === null) return empty.filter((t) => t.ownership !== "CUSTOMER_OWNED");
    const own = empty.filter((t) => t.ownership === "CUSTOMER_OWNED");
    const match = own.filter((t) => norm(t.tankOwner) === norm(managedOwner));
    return match.length ? match : own;
  }, [tanks, managedOwner]);
  const ownerMismatch = managedOwner !== null && available.length > 0 && !available.every((t) => norm(t.tankOwner) === norm(managedOwner));
  const locations = useMemo(() => [...new Set(available.map((t) => t.depot || "Unspecified"))].sort(), [available]);
  const atLocation = useMemo(() => available.filter((t) => (t.depot || "Unspecified") === location), [available, location]);
  const operators = useMemo(() => [...new Set(atLocation.map((t) => t.depotOperator || "Unspecified operator"))].sort(), [atLocation]);
  const candidates = useMemo(() => (operator ? atLocation.filter((t) => (t.depotOperator || "Unspecified operator") === operator) : atLocation).sort((a, b) => (idlingDays(b) ?? -1) - (idlingDays(a) ?? -1)), [atLocation, operator]);
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectedTanks = tanks.filter((t) => selected.has(t.id));

  // What gets written to each tank. Repo origin falls back to the tank's own
  // depot so a move can be picked across depots and each tank still records
  // where it actually left from. Lease Start Date is deliberately NOT set —
  // the lease begins when the tank physically leaves (Lease Depot Out in
  // Tank Detail), not at allocation time.
  const fieldsForTank = (t) => {
    const base = { status: cfg.status, lastStatusChangeDate: today(), manualJobNumber: jn };
    if (jobType === "export") {
      return { ...base, customer: job.customer, pol: job.pol, pod: job.pod,
        freeTimeOrigin: job.freeTimeOrigin, demurrageRateOrigin: job.demurrageRateOrigin,
        freeTimeDestination: job.freeTimeDestination, demurrageRateDestination: job.demurrageRateDestination };
    }
    if (jobType === "repo") {
      return { ...base, pol: job.repoOrigin.trim() || t.depot || "", pod: job.repoDestination.trim() };
    }
    return { ...base, customer: job.customer, localLeaseRateDaily: job.leaseRate, localLeaseRateSlabs: job.leaseSlabs };
  };

  const allocate = async () => {
    setError(null);
    // One tank -> one job at a time: only Available tanks may be allocated.
    // The list only offers those, but the fleet can change under an open
    // modal (someone else allocates the same tank), so re-check on Save.
    const busyTank = selectedTanks.find((t) => t.status !== "MT AVAILABLE");
    if (busyTank) {
      setError(`${busyTank.tankNumber} is no longer Available (${busyTank.status}${busyTank.manualJobNumber ? `, job ${busyTank.manualJobNumber}` : ""}). Untick it and try again.`);
      return;
    }
    const type = jobType;
    const done = [];
    try {
      for (const t of selectedTanks) {
        setSaving(`Allocating ${t.tankNumber}…`);
        const fields = fieldsForTank(t);
        await updateTankFields(t.id, fields);
        let cleaningCertUrl = t.cleaningCertUrl || "";
        if (type === "export" && certs[t.id]) { setSaving(`Uploading certificate for ${t.tankNumber}…`); cleaningCertUrl = await uploadCleaningCertificate(t.id, t.tankNumber, certs[t.id]); }
        done.push({ ...t, ...fields, cleaningCertUrl });
      }
      if (jn) registerSeaknotsJob({ jobNumber: jn, customer: job.customer, type: type === "export" ? "Export" : type === "repo" ? "Repositioning" : "Lease", pol: type === "repo" ? job.repoOrigin : job.pol, pod: type === "repo" ? job.repoDestination : job.pod, tanksRequired: selectedTanks.length }).catch(() => {});
      await onAllocated();
      setDoneTanks(done);
      setDoneType(type);
      setStep("done");
    } catch (e) {
      setError(`Stopped after ${done.length} tank${done.length === 1 ? "" : "s"}: ${e.message || e}`);
      await onAllocated();
    } finally { setSaving(null); }
  };

  const jobTanksNow = [...existing, ...doneTanks.filter((d) => !existing.some((e) => e.id === d.id))];
  const destinationLabel = jobType === "repo" ? (job.repoDestination.trim() || "Repo") : (jn || "Job");

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 8, width: "min(560px, 100%)", maxHeight: "94vh", overflowY: "auto", padding: 18 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#231E1E" }}>{cfg.title}</div>
          <button onClick={onClose} style={{ border: "1px solid #ccc", borderRadius: 4, background: "#fff", padding: "4px 9px", cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 14, fontSize: 11, fontWeight: 700 }}>
          {[["job", "1. Job details"], ["pick", "2. Pick tanks"], ["done", "3. Done"]].map(([k, l]) => <span key={k} style={{ flex: 1, textAlign: "center", padding: 6, borderRadius: 4, background: step === k ? "#231E1E" : "#f0f0f0", color: step === k ? "#fff" : "#888" }}>{l}</span>)}
        </div>
        {error && <div style={{ background: "#FBEAE7", border: "1px solid #C53030", borderRadius: 4, padding: 8, color: "#C53030", fontSize: 12, marginBottom: 10 }}>{error}</div>}

        {step === "job" && (
          <>
            {locked && (
              <div style={{ background: "#F3F1EB", border: "1px solid #e0ddd3", borderRadius: 6, padding: "8px 10px", marginBottom: 12, fontSize: 12 }}>
                <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 14 }}>{job.jobNumber}</span>
                <span style={{ color: "#666" }}> {"\u00b7"} {preset.customer || ""}{preset.pol || preset.pod ? ` \u00b7 ${preset.pol || "?"} \u2192 ${preset.pod || "?"}` : ""}{preset.tanksRequired ? ` \u00b7 ${preset.tanksRequired} tank${preset.tanksRequired === 1 ? "" : "s"} required` : ""}</span>
                <div style={{ color: "#8a8578", marginTop: 2 }}>Job opened in the app - details come from its quote. Check the terms, then pick the tanks.</div>
              </div>
            )}
            {!locked && <label style={LABEL}>Job Type</label>}
            <div style={{ display: locked ? "none" : "flex", gap: 6, marginBottom: 14 }}>
              {JOB_TYPES.map((jt) => (
                <button key={jt.key} onClick={() => { setJobType(jt.key); setPrefillNote(""); }}
                  style={{ flex: 1, padding: "8px 6px", border: "1px solid #231E1E", borderRadius: 4, fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                    background: jobType === jt.key ? "#231E1E" : "#fff", color: jobType === jt.key ? "#fff" : "#231E1E" }}>
                  {jt.label}
                </button>
              ))}
            </div>

            {jobType === "export" && (
              <>
                {!locked && <JobNumberField label="Job Number" value={job.jobNumber} onChange={(v) => setJob({ ...job, jobNumber: v })} jobs={openJobs} onPick={pickJob} />}
                {prefillNote && <div style={{ fontSize: 12, color: "#2E7D5B", marginBottom: 10 }}>✓ {prefillNote}</div>}
                <F label="Customer"><SearchField value={job.customer} onChange={(v) => setJob({ ...job, customer: v })} options={customers || []} strict onAddNew={onAddCustomer} placeholder="Pick a customer…" /></F>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <F label="POL"><SearchField value={job.pol} onChange={(v) => setJob({ ...job, pol: v })} options={portNames || []} placeholder="Search ports…" onAddNew={(v) => setJob({ ...job, pol: v })} /></F>
                  <F label="POD"><SearchField value={job.pod} onChange={(v) => setJob({ ...job, pod: v })} options={portNames || []} placeholder="Search ports…" onAddNew={(v) => setJob({ ...job, pod: v })} /></F>
                </div>
                <div style={LABEL}>Demurrage Terms (apply to every tank on this job)</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <F label="Free Time Origin (days)" required><input style={INPUT} value={job.freeTimeOrigin} onChange={(e) => setJob({ ...job, freeTimeOrigin: e.target.value })} inputMode="numeric" /></F>
                  <F label="Rate Origin ($/day)" required><input style={INPUT} value={job.demurrageRateOrigin} onChange={(e) => setJob({ ...job, demurrageRateOrigin: e.target.value })} inputMode="decimal" /></F>
                  <F label="Free Time Destination (days)" required><input style={INPUT} value={job.freeTimeDestination} onChange={(e) => setJob({ ...job, freeTimeDestination: e.target.value })} inputMode="numeric" /></F>
                  <F label="Rate Destination ($/day)" required><input style={INPUT} value={job.demurrageRateDestination} onChange={(e) => setJob({ ...job, demurrageRateDestination: e.target.value })} inputMode="decimal" /></F>
                </div>
              </>
            )}

            {jobType === "repo" && (
              <>
                {!locked && <JobNumberField label="Job Number (optional)" value={job.jobNumber} onChange={(v) => setJob({ ...job, jobNumber: v })} jobs={openJobs} onPick={pickJob} required={false} />}
                {prefillNote && <div style={{ fontSize: 12, color: "#2E7D5B", marginBottom: 10 }}>✓ {prefillNote}</div>}
                <F label="Repo Origin" hint="Leave blank to record each tank's own depot as its origin."><input style={INPUT} value={job.repoOrigin} onChange={(e) => setJob({ ...job, repoOrigin: e.target.value })} placeholder="Blank = each tank's depot" /></F>
                <F label="Repo Destination" required><input style={INPUT} value={job.repoDestination} onChange={(e) => setJob({ ...job, repoDestination: e.target.value })} placeholder="Where they're going" /></F>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>No demurrage terms needed for an internal repositioning move. Tanks land in <b>MT Repo</b>.</div>
              </>
            )}

            {jobType === "lease" && (
              <>
                {!locked && <JobNumberField label="Job Number" value={job.jobNumber} onChange={(v) => setJob({ ...job, jobNumber: v })} jobs={openJobs} onPick={pickJob} />}
                {prefillNote && <div style={{ fontSize: 12, color: "#2E7D5B", marginBottom: 10 }}>✓ {prefillNote}</div>}
                <F label="Customer (Lessee)" required><SearchField value={job.customer} onChange={(v) => setJob({ ...job, customer: v })} options={customers || []} strict onAddNew={onAddCustomer} placeholder="Pick a customer…" /></F>
                <F label="Lease Rate" required hint="Applies to every tank on this lease. Slab-wise steps the rate down by how long each tank has been out, counted from its own Depot Out (day 1), both ends inclusive.">
                  <LeaseRateEditor value={{ rate: job.leaseRate, slabs: job.leaseSlabs }} onChange={(v) => setJob({ ...job, leaseRate: v.rate, leaseSlabs: v.slabs })} />
                </F>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>
                  These tanks skip the normal export/repo cycle. Once each one physically leaves, enter <b>Lease Depot Out</b> in Tank Detail — that sets its real Lease Start Date and revenue accrues from there. <b>Lease Depot In</b> on return sets the Lease End Date and starts the clean/repair cycle back to Available.
                </div>
              </>
            )}

            <button onClick={() => setStep("pick")} disabled={!jobReady} style={{ width: "100%", padding: 11, border: "none", borderRadius: 4, background: jobReady ? "#231E1E" : "#e0ddd3", color: jobReady ? "#fff" : "#999", fontWeight: 700, fontSize: 14, cursor: jobReady ? "pointer" : "default" }}>Next — Pick Tanks →</button>
          </>
        )}

        {step === "pick" && (
          <>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>
              {jobType === "repo"
                ? <>Repo <b>{job.repoOrigin.trim() || "each tank's depot"}</b> → <b>{job.repoDestination.trim()}</b>{jn ? ` · ${jn}` : ""}</>
                : jobType === "lease"
                  ? <>Lease <b>{jn}</b>{job.customer ? ` · ${job.customer}` : ""} · {job.leaseSlabs ? slabSummary(job.leaseSlabs, (n) => `$${n}`) : `$${job.leaseRate}/day`}</>
                  : <>Job <b>{jn}</b>{job.pol || job.pod ? ` · ${job.pol || "?"} → ${job.pod || "?"}` : ""}</>}
              {existing.length ? ` · ${existing.length} already allocated` : ""}
            </div>
            {managedOwner !== null && (
              <div style={{ background: "#CCFBF1", border: "1px solid #99f6e4", borderRadius: 4, padding: 8, fontSize: 12, color: "#0F766E", marginBottom: 10 }}>
                <b>Managed job — customer-owned tanks.</b> Only {managedOwner || "the customer"}'s own tanks are offered here (freight and operations only, no rental).
                {ownerMismatch && <span style={{ color: "#C53030" }}> No tank carries the owner name "{managedOwner}" exactly, so every customer-owned tank is shown — check the owner before you pick.</span>}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <F label="Location"><select style={INPUT} value={location} onChange={(e) => { setLocation(e.target.value); setOperator(""); }}><option value="">Select location…</option>{locations.map((l) => <option key={l} value={l}>{l} ({available.filter((t) => (t.depot || "Unspecified") === l).length})</option>)}</select></F>
              <F label="Depot Operator"><select style={INPUT} value={operator} onChange={(e) => setOperator(e.target.value)} disabled={!location}><option value="">All at this location</option>{operators.map((o) => <option key={o} value={o}>{o} ({atLocation.filter((t) => (t.depotOperator || "Unspecified operator") === o).length})</option>)}</select></F>
            </div>
            {location && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={LABEL}>{managedOwner !== null ? `Customer-owned tanks of ${managedOwner || "the quote's customer"}` : "Empty Available"} — {candidates.length} tank{candidates.length === 1 ? "" : "s"}, oldest idling first</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#F09128" }}>{selected.size} selected</span>
                </div>
                <div style={{ maxHeight: 300, overflowY: "auto", border: "1px solid #e0ddd3", borderRadius: 6, marginBottom: 10 }}>
                  {candidates.length === 0 && <div style={{ padding: 14, color: "#999", textAlign: "center" }}>{managedOwner !== null ? `No customer-owned tanks of ${managedOwner || "this customer"} here - receive them first under Customer Tanks.` : "No empty available tanks here."}</div>}
                  {candidates.map((t) => { const on = selected.has(t.id); const idle = idlingDays(t); return (
                    <div key={t.id} style={{ borderBottom: "1px solid #eee", padding: "8px 10px", background: on ? "#FFF3D9" : "#fff" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                        <input type="checkbox" checked={on} onChange={() => toggle(t.id)} />
                        <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{t.tankNumber}</span>
                        <span style={{ fontSize: 12, color: "#666" }}>{t.depotOperator || ""} · Cap {t.capacity || "—"}{t.nextTestDate ? ` · Cert ${t.nextTestDate}` : ""}</span>
                        {idle !== null && <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: "#fff", background: idle > 30 ? "#C53030" : idle > 14 ? "#C9862A" : "#8a8578", padding: "2px 6px", borderRadius: 4 }}>{idle}d</span>}
                      </label>
                      {on && jobType === "export" && <div style={{ marginTop: 6, paddingLeft: 26 }}><input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ fontSize: 11 }} onChange={(e) => setCerts({ ...certs, [t.id]: e.target.files[0] || null })} /><span style={{ fontSize: 10, color: "#999", marginLeft: 6 }}>cleaning certificate (optional)</span></div>}
                    </div>); })}
                </div>
              </>
            )}
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setStep("job")} style={{ flex: 1, padding: 10, border: "1px solid #ccc", background: "#fff", borderRadius: 4, cursor: "pointer" }}>← Back</button>
              <button onClick={allocate} disabled={selected.size === 0 || !!saving} style={{ flex: 2, padding: 10, border: "none", borderRadius: 4, background: selected.size ? "#F09128" : "#e0ddd3", color: selected.size ? "#fff" : "#999", fontWeight: 700, fontSize: 14, cursor: selected.size ? "pointer" : "default" }}>
                {saving || `Allocate ${selected.size} Tank${selected.size === 1 ? "" : "s"} to ${destinationLabel}`}
              </button>
            </div>
          </>
        )}

        {step === "done" && (
          <>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#2E7D5B", marginBottom: 6 }}>
              ✓ {doneTanks.length} tank{doneTanks.length === 1 ? "" : "s"} {doneType === "repo" ? "moved to MT Repo" : doneType === "lease" ? "placed on lease" : "allocated"}{jn ? ` — ${jn}` : ""}
            </div>
            <div style={{ fontSize: 12, fontFamily: "monospace", color: "#666", marginBottom: 12 }}>{doneTanks.map((t) => t.tankNumber).join(" · ")}</div>
            <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>This {TYPE_CONFIG[doneType].noun} now has <b>{jobTanksNow.length}</b> tank{jobTanksNow.length === 1 ? "" : "s"} in total.</div>
            {/* Allocation Advice is built against the export quote for the job, so it
                only applies to a Normal Export. The Release Request is just the
                depot pick-up letter, which any tank leaving a depot needs. */}
            {doneType === "export" && <JobAdviceButton jobNumber={jn} tanks={jobTanksNow} style={{ width: "100%", marginBottom: 8 }} />}
            <ReleaseRequestButton jobNumber={jn || destinationLabel} tanks={jobTanksNow} onSaved={onAllocated} style={{ width: "100%", marginBottom: 8 }} />
            <button onClick={onClose} style={{ width: "100%", padding: 10, border: "1px solid #ccc", background: "#fff", borderRadius: 4, cursor: "pointer" }}>Close</button>
          </>
        )}
      </div>
    </div>
  );
}
