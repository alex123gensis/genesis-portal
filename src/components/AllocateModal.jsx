import { useState, useEffect } from "react";
import { updateTankFields, uploadCleaningCertificate, fetchQuoteForJob } from "../lib/tanksApi.js";
import LeaseRateEditor, { leaseRateFilled } from "./LeaseRateEditor.jsx";
import { quoteLeaseRateUsd } from "../lib/leaseSlabs.js";
import JobAdviceButton from "./JobAdviceButton.jsx";
import ReleaseRequestButton from "./ReleaseRequestButton.jsx";
import SearchField from "./SearchField.jsx";
import { fetchOpenJobs, registerSeaknotsJob } from "../quotes/lib/jobsApi.js";
import JobNumberField from "./JobNumberField.jsx";

const INPUT_STYLE = { width: "100%", padding: "8px 9px", border: "1px solid #ccc", borderRadius: 4, fontSize: 13, boxSizing: "border-box" };
const LABEL_STYLE = { fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "#8a8578", display: "block", marginBottom: 3 };

function RequiredField({ label, value, onChange, placeholder }) {
  const filled = String(value).trim() !== "";
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={LABEL_STYLE}>{label} <span style={{ color: "#C53030" }}>*</span></label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{ ...INPUT_STYLE, borderColor: filled ? "#ccc" : "#C53030" }} />
      {!filled && <div style={{ fontSize: 11, color: "#C53030", marginTop: 4 }}>Required to allocate this tank.</div>}
    </div>
  );
}

function RequiredSearchField({ label, value, onChange, options, onAddNew, placeholder }) {
  const filled = String(value).trim() !== "";
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={LABEL_STYLE}>{label} <span style={{ color: "#C53030" }}>*</span></label>
      <SearchField value={value} onChange={onChange} options={options} onAddNew={onAddNew} placeholder={placeholder} strict={placeholder === "Search customers…" || placeholder === "Pick a customer…"} />
      {!filled && <div style={{ fontSize: 11, color: "#C53030", marginTop: 4 }}>Required to allocate this tank.</div>}
    </div>
  );
}

const JOB_TYPES = [
  { key: "export", label: "Normal Export" },
  { key: "repo", label: "Tank Repo" },
  { key: "lease", label: "Local Lease" },
];

// Three different allocation flows depending on what the tank is actually
// going to. Each sets a different status and asks for a different, minimal
// set of mandatory fields — no demurrage terms on a Repo move, no Job
// Number on a Lease, etc.

export default function AllocateModal({ tank, allTanks = [], onClose, onAllocated, portNames, customers, onAddCustomer }) {
  const [jobType, setJobType] = useState("export");

  // Export fields
  const [jobNumber, setJobNumber] = useState("");
  const [customer, setCustomer] = useState("");
  const [pol, setPol] = useState(tank.pol || "");
  const [pod, setPod] = useState(tank.pod || "");
  const [freeTimeOrigin, setFreeTimeOrigin] = useState("");
  const [demurrageRateOrigin, setDemurrageRateOrigin] = useState("");
  const [freeTimeDestination, setFreeTimeDestination] = useState("");
  const [demurrageRateDestination, setDemurrageRateDestination] = useState("");

  // Repo fields
  const [repoJobNumber, setRepoJobNumber] = useState("");
  const [repoOrigin, setRepoOrigin] = useState(tank.depot || "");
  const [repoDestination, setRepoDestination] = useState("");

  // Lease fields
  const [leaseJobNumber, setLeaseJobNumber] = useState("");
  const [leaseCustomer, setLeaseCustomer] = useState("");
  const [leaseRate, setLeaseRate] = useState("");
  const [leaseSlabs, setLeaseSlabs] = useState(null);
  const [leaseNote, setLeaseNote] = useState("");

  // Rate structure from the lease quote behind this job number, once one is
  // typed - only fills what is still blank, so a rate already keyed stays.
  useEffect(() => {
    const jn = leaseJobNumber.trim();
    if (jobType !== "lease" || !jn) { setLeaseNote(""); return; }
    let live = true;
    const timer = setTimeout(() => {
      fetchQuoteForJob(jn).then((q) => {
        if (!live) return;
        if (!q) { setLeaseNote(""); return; }
        const { rate: qRate, slabs } = quoteLeaseRateUsd(q); // AED quotes converted to USD
        setLeaseCustomer((c) => c || q.customer || "");
        if (slabs) setLeaseSlabs((s) => s || slabs);
        else if (qRate) setLeaseRate((r) => r || qRate);
        setLeaseNote(slabs || qRate
          ? `${slabs ? "Slab-wise" : "Flat"} lease rate filled from quote ${q.quote_number || ""} in the Quotes app.`
          : `Quote ${q.quote_number || ""} found but it carries no lease rate.`);
      }).catch(() => {});
    }, 400);
    return () => { live = false; clearTimeout(timer); };
  }, [leaseJobNumber, jobType]);

  const [saving, setSaving] = useState(false);
  const [openJobs, setOpenJobs] = useState([]);
  useEffect(() => { let live = true; fetchOpenJobs().then((r) => { if (live) setOpenJobs(r || []); }).catch(() => {}); return () => { live = false; }; }, []);
  const pickExport = (j) => { const sn = j.snapshot || {}; setCustomer((c) => c || j.customer || sn.customer || ""); setPol((v) => v || sn.pol || ""); setPod((v) => v || sn.pod || ""); if (sn.freeTimePOL && !String(freeTimeOrigin).trim()) setFreeTimeOrigin(String(sn.freeTimePOL)); if (sn.freeTimePOD && !String(freeTimeDestination).trim()) setFreeTimeDestination(String(sn.freeTimePOD)); };
  const pickRepo = (j) => { const sn = j.snapshot || {}; setRepoOrigin((v) => v || sn.pol || ""); setRepoDestination((v) => v || sn.pod || ""); };
  const pickLease = (j) => { setLeaseCustomer((c) => c || j.customer || (j.snapshot || {}).customer || ""); };
  const [cleaningFile, setCleaningFile] = useState(null);
  const [done, setDone] = useState(null); // { tank } after a Normal Export allocation

  const exportRequiredFilled =
    jobNumber.trim() && String(freeTimeOrigin).trim() && String(demurrageRateOrigin).trim() &&
    String(freeTimeDestination).trim() && String(demurrageRateDestination).trim();
  const repoRequiredFilled = repoOrigin.trim() && repoDestination.trim();
  const leaseRequiredFilled = leaseJobNumber.trim() && leaseCustomer.trim() && leaseRateFilled({ rate: leaseRate, slabs: leaseSlabs });

  const requiredFilled =
    jobType === "export" ? exportRequiredFilled :
    jobType === "repo" ? repoRequiredFilled :
    leaseRequiredFilled;

  const confirm = async () => {
    if (!requiredFilled) return;
    // One tank -> one job at a time. Allocation starts from Available only;
    // a tank still on an open job must come back first (Empty In / Repair
    // Complete). The database trigger (migration 051) enforces the same.
    if (tank.status !== "MT AVAILABLE" && tank.manualJobNumber) {
      alert(`${tank.tankNumber} is still on job ${tank.manualJobNumber} (${tank.status}). Return it to Available before allocating it again.`);
      return;
    }
    setSaving(true);
    const today = new Date().toISOString().slice(0, 10);
    try {
      if (jobType === "export") {
        const fields = {
          status: "MT ALLOCATED", lastStatusChangeDate: today,
          manualJobNumber: jobNumber.trim(), customer: customer || tank.customer,
          pol: pol || tank.pol, pod: pod || tank.pod,
          freeTimeOrigin, demurrageRateOrigin, freeTimeDestination, demurrageRateDestination,
        };
        await updateTankFields(tank.id, fields);
        registerSeaknotsJob({ jobNumber: jobNumber, customer: fields.customer, type: "Export", pol: fields.pol, pod: fields.pod }).catch(() => {});
        let cleaningCertUrl = tank.cleaningCertUrl || "";
        if (cleaningFile) cleaningCertUrl = await uploadCleaningCertificate(tank.id, tank.tankNumber, cleaningFile);
        await onAllocated();
        setDone({ tank: { ...tank, ...fields, cleaningCertUrl } });
        return; // keep modal open to offer the job-level advice
      } else if (jobType === "repo") {
        await updateTankFields(tank.id, {
          status: "MT REPO", lastStatusChangeDate: today,
          manualJobNumber: repoJobNumber.trim(), pol: repoOrigin, pod: repoDestination,
        });
        if (repoJobNumber.trim()) registerSeaknotsJob({ jobNumber: repoJobNumber, type: "Repositioning", pol: repoOrigin, pod: repoDestination }).catch(() => {});
      } else {
        // Lease Start Date is deliberately NOT set here — the lease period
        // genuinely begins when the tank physically leaves (Lease Depot
        // Out, entered later in Tank Detail), not at allocation time.
        await updateTankFields(tank.id, {
          status: "ON LEASE", lastStatusChangeDate: today,
          manualJobNumber: leaseJobNumber.trim(), customer: leaseCustomer, localLeaseRateDaily: leaseRate, localLeaseRateSlabs: leaseSlabs,
        });
        registerSeaknotsJob({ jobNumber: leaseJobNumber, customer: leaseCustomer, type: "Lease" }).catch(() => {});
      }
      await onAllocated();
      onClose();
    } catch (err) {
      alert("Allocation failed: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16, overflowY: "auto" }}>
      <div style={{ background: "#fff", borderRadius: 8, padding: 20, width: "min(420px, 100%)", maxHeight: "90vh", overflowY: "auto" }}>
        {done ? (() => {
          const job = done.tank.manualJobNumber;
          const seen = new Set(); const jobTanks = [];
          for (const t of [done.tank, ...allTanks]) if (t.manualJobNumber === job && !seen.has(t.id) && ["MT ALLOCATED", "DEPOT OUT"].includes(t.status)) { seen.add(t.id); jobTanks.push(t); }
          return (
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#2E7D5B", marginBottom: 6 }}>✓ {done.tank.tankNumber} allocated to {job}</div>
              <div style={{ fontSize: 13, color: "#666", marginBottom: 14 }}>This job now has <b>{jobTanks.length}</b> tank{jobTanks.length === 1 ? "" : "s"} allocated. Generate the advice once all tanks for the job are allocated — it lists every tank on the job in one document.</div>
              <JobAdviceButton jobNumber={job} tanks={jobTanks} style={{ width: "100%", marginBottom: 8 }} />
              <ReleaseRequestButton jobNumber={job} tanks={jobTanks} onSaved={onAllocated} style={{ width: "100%", marginBottom: 8 }} />
              <button onClick={onClose} style={{ width: "100%", padding: 10, border: "1px solid #ccc", background: "#fff", borderRadius: 4, cursor: "pointer" }}>Close — allocate the next tank</button>
            </div>
          );
        })() : (<>
        <h3 style={{ marginTop: 0 }}>Allocate {tank.tankNumber}</h3>
        <p style={{ fontSize: 12, color: "#666" }}>Depot: <b>{tank.depot}</b>, Capacity: <b>{tank.capacity}</b>.</p>

        <label style={LABEL_STYLE}>Job Type</label>
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {JOB_TYPES.map((jt) => (
            <button key={jt.key} onClick={() => setJobType(jt.key)}
              style={{ flex: 1, padding: "8px 6px", border: "1px solid #231E1E", borderRadius: 4, fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                background: jobType === jt.key ? "#231E1E" : "#fff", color: jobType === jt.key ? "#fff" : "#231E1E" }}>
              {jt.label}
            </button>
          ))}
        </div>

        {jobType === "export" && (
          <>
            <JobNumberField label="Job Number" value={jobNumber} onChange={setJobNumber} jobs={openJobs} onPick={pickExport} />
            <div style={{ marginBottom: 10 }}>
              <label style={LABEL_STYLE}>Customer (optional)</label>
              <SearchField value={customer} onChange={setCustomer} options={customers || []} strict onAddNew={onAddCustomer} placeholder="Pick a customer…" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div><label style={LABEL_STYLE}>POL</label><SearchField value={pol} onChange={setPol} options={portNames || []} placeholder="Search ports…" onAddNew={setPol} /></div>
              <div><label style={LABEL_STYLE}>POD</label><SearchField value={pod} onChange={setPod} options={portNames || []} placeholder="Search ports…" onAddNew={setPod} /></div>
            </div>
            <label style={{ ...LABEL_STYLE, margin: "10px 0 6px", fontSize: 11 }}>Demurrage Terms for This Job</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <RequiredField label="Free Time Origin (days)" value={freeTimeOrigin} onChange={setFreeTimeOrigin} />
              <RequiredField label="Rate Origin ($/day)" value={demurrageRateOrigin} onChange={setDemurrageRateOrigin} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 6 }}>
              <RequiredField label="Free Time Destination (days)" value={freeTimeDestination} onChange={setFreeTimeDestination} />
              <RequiredField label="Rate Destination ($/day)" value={demurrageRateDestination} onChange={setDemurrageRateDestination} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={LABEL_STYLE}>Tank Cleaning Certificate (optional)</label>
              {tank.cleaningCertUrl && !cleaningFile && <div style={{ fontSize: 12, marginBottom: 4 }}><a href={tank.cleaningCertUrl} target="_blank" rel="noreferrer" style={{ color: "#231E1E", fontWeight: 700 }}>📎 Current certificate on file</a> — upload to replace</div>}
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={INPUT_STYLE} onChange={(e) => setCleaningFile(e.target.files[0] || null)} />
            </div>
          </>
        )}

        {jobType === "repo" && (
          <>
            <JobNumberField label="Job Number (optional)" value={repoJobNumber} onChange={setRepoJobNumber} jobs={openJobs} onPick={pickRepo} required={false} />
            <RequiredField label="Repo Origin" value={repoOrigin} onChange={setRepoOrigin} placeholder="Current depot" />
            <RequiredField label="Repo Destination" value={repoDestination} onChange={setRepoDestination} placeholder="Where it's going" />
            <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>No demurrage terms needed for an internal repositioning move.</div>
          </>
        )}

        {jobType === "lease" && (
          <>
            <JobNumberField label="Job Number" value={leaseJobNumber} onChange={setLeaseJobNumber} jobs={openJobs} onPick={pickLease} />
            <RequiredSearchField label="Customer (Lessee)" value={leaseCustomer} onChange={setLeaseCustomer} options={customers || []} strict onAddNew={onAddCustomer} placeholder="Pick a customer…" />
            {leaseNote && <div style={{ fontSize: 12, color: "#2E7D5B", marginBottom: 8 }}>✓ {leaseNote}</div>}
            <div style={{ marginBottom: 10 }}>
              <LeaseRateEditor value={{ rate: leaseRate, slabs: leaseSlabs }} onChange={(v) => { setLeaseRate(v.rate); setLeaseSlabs(v.slabs); }} />
            </div>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
              This tank skips the normal export/repo cycle. Once it physically leaves, enter <b>Lease Depot Out</b> in Tank Detail — that sets the real Lease Start Date and revenue starts accruing from there. When it returns, <b>Lease Depot In</b> sets the Lease End Date and starts the clean/repair cycle back to Available.
            </div>
          </>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 10, border: "1px solid #ccc", background: "#fff", borderRadius: 4, cursor: "pointer" }}>Cancel</button>
          <button onClick={confirm} disabled={!requiredFilled || saving}
            style={{ flex: 1, padding: 10, border: "none", background: requiredFilled ? "#231E1E" : "#aaa", color: "#fff", borderRadius: 4, cursor: requiredFilled ? "pointer" : "not-allowed" }}>
            {saving ? "Allocating…" : "Allocate Tank"}
          </button>
        </div>
        </>)}
      </div>
    </div>
  );
}
