// Genesis sales invoice, same layout as the Tank App (jobsApi.buildSalesInvoiceHTML), fed from the portal documents API.
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = (n) => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const lineAmount = (l) => (l.amount != null && l.amount !== "" ? Number(l.amount) : (Number(l.qty) || 1) * (Number(l.rate) || 0)) || 0;
export function buildSalesInvoiceHTML(inv, job, tankNumbers = []) {
  const s = job.snapshot || {};
  const rows = (inv.lines || []).map((l, i) => `<tr><td class="c">${i + 1}</td><td>${esc(l.description)}</td><td class="c">${esc(l.qty || 1)}</td><td class="r">${fmt(Number(l.rate) || lineAmount(l))}</td><td class="r">${fmt(lineAmount(l))}</td></tr>`).join("");
  const sub = (inv.lines || []).reduce((a, l) => a + lineAmount(l), 0), vat = sub * (Number(inv.vat_pct) || 0) / 100;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(inv.invoice_number)}</title><style>
  @page { size: A4; margin: 16mm; } body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #231E1E; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #F09128; padding-bottom: 10px; margin-bottom: 14px; }
  .co { font-size: 16px; font-weight: 800; } .sm { font-size: 10px; color: #555; line-height: 1.4; }
  .title { font-size: 22px; font-weight: 800; letter-spacing: .06em; text-align: right; } .status { text-align: right; font-size: 10px; color: ${inv.status === "ISSUED" ? "#2E7D5B" : "#B7791F"}; font-weight: 700; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; } .box { border: 1px solid #ddd; border-radius: 4px; padding: 8px 10px; } .box b { display: block; font-size: 9px; color: #888; letter-spacing: .06em; margin-bottom: 3px; }
  table { border-collapse: collapse; width: 100%; } th { background: #231E1E; color: #fff; font-size: 10px; padding: 6px 8px; text-align: left; } td { border-bottom: 1px solid #e5e5e5; padding: 6px 8px; } .c { text-align: center; } .r { text-align: right; white-space: nowrap; }
  tfoot td { border: none; font-weight: 700; } .tot td { font-size: 13px; border-top: 2px solid #231E1E; }
  .foot { margin-top: 18px; font-size: 10px; color: #555; } .draft { position: fixed; top: 40%; left: 20%; font-size: 70px; color: rgba(200,0,0,.12); transform: rotate(-25deg); font-weight: 800; }
  </style></head><body>
  ${inv.status !== "ISSUED" ? '<div class="draft">DRAFT</div>' : ""}
  <div class="head"><div><div class="co">GENESIS CHEMICAL TANK CONTAINERS LLC</div><div class="sm">API World Tower 2304, Sheikh Zayed Road, Dubai, United Arab Emirates</div></div>
    <div><div class="title">${inv.status === "ISSUED" ? "TAX INVOICE" : "PROFORMA INVOICE"}</div><div class="status">${esc(inv.invoice_number)} &middot; ${esc(inv.status)}</div></div></div>
  <div class="grid">
    <div class="box"><b>BILL TO</b>${esc(inv.billing_party || s.customer)}${inv.billing_address ? "<br/>" + esc(inv.billing_address).replace(/\n/g, "<br/>") : ""}${inv.billing_trn ? "<br/>TRN " + esc(inv.billing_trn) : ""}</div>
    <div class="box"><b>INVOICE</b>No: ${esc(inv.invoice_number)}<br/>Date: ${esc(inv.invoice_date || "")}${inv.due_date ? "<br/>Due: " + esc(inv.due_date) : ""}<br/>Currency: ${esc(inv.currency || "USD")}${inv.payment_terms ? "<br/>Terms: " + esc(inv.payment_terms) : ""}</div>
    <div class="box"><b>JOB</b>${esc(job.job_number)}${s.quoteNumber ? " &middot; quote " + esc(s.quoteNumber) : ""}<br/>${esc(s.pol || "")} &rarr; ${esc(s.pod || "")}${s.product ? "<br/>" + esc(s.product) : ""}${s.type ? " &middot; " + esc(s.type) : ""}</div>
    <div class="box"><b>TANKS (${tankNumbers.length || job.tanks_required || 0})</b>${tankNumbers.length ? esc(tankNumbers.join(", ")) : "as per job"}</div>
  </div>
  <table><thead><tr><th class="c" style="width:30px">#</th><th>Description</th><th class="c" style="width:50px">Qty</th><th class="r" style="width:90px">Rate</th><th class="r" style="width:100px">Amount (${esc(inv.currency || "USD")})</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="5" class="c">No lines</td></tr>'}</tbody>
  <tfoot><tr><td colspan="4" class="r">Subtotal</td><td class="r">${fmt(sub)}</td></tr>${Number(inv.vat_pct) ? `<tr><td colspan="4" class="r">VAT ${esc(inv.vat_pct)}%</td><td class="r">${fmt(vat)}</td></tr>` : ""}<tr class="tot"><td colspan="4" class="r">TOTAL ${esc(inv.currency || "USD")}</td><td class="r">${fmt(sub + vat)}</td></tr></tfoot></table>
  ${inv.remarks ? `<div class="foot"><b>Remarks:</b> ${esc(inv.remarks).replace(/\n/g, "<br/>")}</div>` : ""}
  <div class="foot">Please quote the invoice number on your payment. Bank details as per the agreement.</div>
  </body></html>`;
}

// ---- Invoicing (Finance) page: payments + receivables (Inventory 088)
