// Documents on a booking: issued B/L, Genesis invoices (print), uploaded invoice files, tank certificates, MSDS.
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { buildSalesInvoiceHTML } from "../lib/invoiceDocument.js";
import { buildBillOfLadingHTML, blFileName } from "../lib/blDocument.js";
import { openForPrint, downloadHtml } from "../lib/printHtml.js";
import { CARD, BTN, MUTED, GREEN, RED, AMBER, Pill, Msg, Empty, fmtD, fmtDT } from "../ui.jsx";

const money = (n, c) => `${c || "USD"} ${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const Row = ({ title, sub, right }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid #eeebe4", flexWrap: "wrap" }}>
    <div style={{ flex: 1, minWidth: 200 }}><div style={{ fontWeight: 600, fontSize: 13 }}>{title}</div>{sub && <div style={{ fontSize: 12, color: MUTED }}>{sub}</div>}</div>
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{right}</div>
  </div>
);
const Link = ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" style={{ ...BTN, textDecoration: "none", display: "inline-block" }}>{children}</a>;

export default function DocumentsView({ job }) {
  const [d, setD] = useState(null); const [bl, setBl] = useState(null); const [err, setErr] = useState(null);
  useEffect(() => {
    let on = true;
    Promise.all([api(`/api/documents?job=${encodeURIComponent(job.job_number)}`), api(`/api/bl?job=${encodeURIComponent(job.job_number)}`).catch(() => null)])
      .then(([docs, b]) => { if (on) { setD(docs); setBl(b); } }).catch((e) => on && setErr(e.message));
    return () => { on = false; };
  }, [job.job_number]);
  if (err) return <Msg text={err} />;
  if (!d) return <div style={{ color: MUTED }}>Loading…</div>;

  const printBl = () => { if (!bl || !bl.bl) return; openForPrint(buildBillOfLadingHTML(bl.quote || {}, bl.bl, bl.containers, true), blFileName(bl.bl, bl.quote)); };
  const dlBl = () => { if (!bl || !bl.bl) return; downloadHtml(buildBillOfLadingHTML(bl.quote || {}, bl.bl, bl.containers, true), blFileName(bl.bl, bl.quote)); };
  const jobForInvoice = { job_number: job.job_number, tanks_required: job.tanks_required, snapshot: { customer: job.customer, quoteNumber: "", pol: job.pol, pod: job.pod, product: job.product, type: job.job_type } };
  const invHtml = (inv) => buildSalesInvoiceHTML({ invoice_number: inv.number, invoice_date: inv.date, due_date: inv.dueDate, currency: inv.currency, lines: inv.lines, vat_pct: inv.vatPct, status: inv.status,
    billing_party: inv.billingParty, billing_address: inv.billingAddress, billing_trn: inv.billingTrn, payment_terms: inv.paymentTerms, remarks: inv.remarks }, jobForInvoice, (d.tanks || []).map((t) => t.tank));
  const nothing = !d.bl && !(d.invoices || []).length && !(d.invoiceFiles || []).length && !d.tanks.some((t) => t.files.length || t.cleaningCertUrl) && !d.msdsUrl;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={CARD}>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>Bill of lading</div>
        {d.bl ? <Row title={`B/L ${d.bl.number || ""}`} sub={`Issued ${fmtD(d.bl.dateOfIssue)}${d.bl.issuedBy === "AGENT" ? " by the agent" : " by Genesis"}`}
          right={<>{bl && bl.bl && <button style={BTN} onClick={printBl}>Print</button>}{bl && bl.bl && <button style={BTN} onClick={dlBl}>Download</button>}{d.bl.agentBlUrl && <Link href={d.bl.agentBlUrl}>Carrier B/L file</Link>}</>} />
          : <div style={{ fontSize: 13, color: MUTED }}>Not issued yet - see the Bill of lading tab for the draft status.</div>}
      </div>
      {d.kind !== "AGENT" && <div style={CARD}>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>Invoices</div>
        {!d.invoices.length && !d.invoiceFiles.length && <div style={{ fontSize: 13, color: MUTED }}>No invoices issued for this booking yet.</div>}
        {d.invoices.map((inv) => {
          const paid = Number(inv.paid) || 0, total = Number(inv.total) || 0; const open = total - paid;
          const overdue = open > 0.005 && inv.dueDate && new Date(inv.dueDate) < new Date();
          return <Row key={inv.id} title={<>{inv.number} <Pill text={open <= 0.005 ? "PAID" : overdue ? "OVERDUE" : paid > 0 ? "PART PAID" : "OPEN"} color={open <= 0.005 ? GREEN : overdue ? RED : AMBER} /></>}
            sub={`${fmtD(inv.date)}${inv.dueDate ? ` · due ${fmtD(inv.dueDate)}` : ""} · ${money(total, inv.currency)}${paid ? ` · paid ${money(paid, inv.currency)}` : ""}${open > 0.005 ? ` · outstanding ${money(open, inv.currency)}` : ""}`}
            right={<><button style={BTN} onClick={() => openForPrint(invHtml(inv), inv.number)}>Print</button><button style={BTN} onClick={() => downloadHtml(invHtml(inv), inv.number)}>Download</button></>} />;
        })}
        {d.invoiceFiles.map((f) => <Row key={f.id} title={`${f.number || "Invoice"} (${f.component.toLowerCase().replace(/_/g, " ")})`} sub={`${fmtD(f.date)}${f.amount ? ` · ${money(f.amount, f.currency)}` : ""}`} right={<Link href={f.fileUrl}>Download {f.fileName ? "" : "file"}</Link>} />)}
      </div>}
      <div style={CARD}>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>Tank certificates</div>
        {!d.tanks.length && <div style={{ fontSize: 13, color: MUTED }}>No tanks on this booking yet.</div>}
        {d.tanks.map((t) => (
          <Row key={t.tank} title={<span style={{ fontFamily: "monospace" }}>{t.tank}</span>} sub={`${t.files.length} certificate file${t.files.length === 1 ? "" : "s"}${t.nextTestDate ? ` · next test ${fmtD(t.nextTestDate)}` : ""}`}
            right={<>{t.files.map((f) => <Link key={f.path} href={f.url}>{f.name}</Link>)}{t.cleaningCertUrl && <Link href={t.cleaningCertUrl}>Cleaning certificate</Link>}{!t.files.length && !t.cleaningCertUrl && <span style={{ fontSize: 12, color: MUTED }}>none uploaded</span>}</>} />))}
      </div>
      <div style={CARD}>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>Product</div>
        {d.msdsUrl ? <Row title={d.product || "MSDS"} sub="Material safety data sheet on file" right={<Link href={d.msdsUrl}>MSDS</Link>} /> : <div style={{ fontSize: 13, color: MUTED }}>{d.product || ""}{d.product ? " - " : ""}no MSDS on file.</div>}
      </div>
      {nothing && <Empty text="Documents appear here as the shipment progresses." />}
    </div>
  );
}
