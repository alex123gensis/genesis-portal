import genesisLogo from "../assets/genesis-logo-mark.png";

const safeFileName = (s) => String(s || "").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
export function blFileName(bl, q) { return safeFileName(`BL ${bl.blNumber || "Draft"} - ${(q && q.customer) || bl.shipperText || ""}`.replace(/ - $/, "")); }

// Ported directly from the original Claude-artifact app's Documentation
// module — same layout, same fields, adapted to read from a quote + its
// BL record + container list instead of a job object.

function vesselVoyageDisplay(quote) {
  let s = `${quote.vesselName || ""} ${quote.voyageNo || ""}`.trim() || "—";
  if (quote.routing === "Transhipment" && quote.transhipmentPort) {
    s += ` → via ${quote.transhipmentPort}`;
  }
  if (quote.routing === "Transhipment" && (quote.transhipmentVesselName || quote.transhipmentVoyageNo)) {
    s += ` → T/S: ${quote.transhipmentVesselName || ""} ${quote.transhipmentVoyageNo || ""}`.trimEnd();
  }
  return s;
}

// Since 026 each BL carries its own vessel (jobs on one quote can sail
// separately); a BL with none typed falls back to the quote's Vessel Details.
function vesselSource(quote, bl) {
  const own = bl && (bl.vesselName || bl.voyageNo || bl.transhipmentVesselName);
  return own ? bl : quote;
}

export function buildBillOfLadingHTML(quote, bl, containersIn, isFinal) {
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const labelVal = (label, val) => `<div style="font-size:8px;font-weight:bold;">${esc(label)}</div><div style="font-size:10px;">${esc(val) || "&nbsp;"}</div>`;

  const containers = containersIn && containersIn.length ? containersIn : [];
  // Weights print as "18,320 KGS" whatever was stored (number or typed text).
  const numW = (v) => { const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : null; };
  const fmtW = (v) => { const n = numW(v); return n === null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 3 }) + " KGS"; };

  const containerRows = containers.map((c, idx) => {
    const leftCell = `<td style="border:1px solid #000;padding:4px 7px;vertical-align:top;font-size:10px;width:40%;">
      <div><b>${esc(c.containerNo)}</b> &nbsp; Seal: ${esc(c.sealNo) || "—"}</div>
      <div>Net: ${fmtW(c.netWeight)} &nbsp; Gross: ${fmtW(c.grossWeight)}</div>
    </td>`;
    const rightCell = idx === 0
      ? `<td rowspan="${containers.length}" style="border:1px solid #000;padding:6px 7px;vertical-align:top;font-size:10px;">
          ${bl.cargoDescription ? `<div style="white-space:pre-line;">${esc(bl.cargoDescription)}</div>` : `<div>${esc(bl.productDG)}</div>`}
          <div style="margin-top:6px;">FREIGHT ${esc(bl.freightPrepaidCollect)}</div>
          <div>TOTAL: ${containers.length} ISOTANKS ONLY.</div>
        </td>`
      : "";
    return `<tr>${leftCell}${rightCell}</tr>`;
  }).join("");

  const totalNet = containers.reduce((s, c) => s + (numW(c.netWeight) || 0), 0);
  const totalGross = containers.reduce((s, c) => s + (numW(c.grossWeight) || 0), 0);

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${esc(blFileName(bl, quote))}${isFinal ? "" : " (draft)"}</title>
<style>
  @page { size: A4; margin: 1.2cm; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color:#000; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 0; }
  .title { text-align:center; font-size:18px; font-weight:bold; padding:8px 0; border:2px solid #000; border-bottom:none; }
  .logo { text-align:center; vertical-align:top; }
  .logo img { width:64px; height:64px; display:block; margin:0 auto; }
  .logo .name { font-size:9px; font-weight:bold; color:#231E1E; letter-spacing:0.03em; margin-top:2px; white-space:nowrap; }
</style></head>
<body>
  <table style="border:2px solid #000;">
    <tr>
      <td rowspan="2" style="border:1px solid #000;width:45%;padding:6px;vertical-align:top;">
        ${labelVal("Shipper:", "")}
        <div style="font-size:10px; white-space:pre-line;">${esc(bl.shipperText)}</div>
      </td>
      <td colspan="2" class="title">${isFinal ? "BILL OF LADING" : "DRAFT BILL OF LADING"}</td>
    </tr>
    <tr>
      <td colspan="2" style="border:1px solid #000;padding:6px;">
        <div class="logo"><img src="${genesisLogo}" alt="Genesis" /><div class="name">GENESIS CHEMICAL TANK CONTAINERS</div></div>
        <div style="font-size:8px;font-weight:bold;margin-top:4px;">Bill of Lading number</div>
        <div style="font-size:13px;font-weight:bold;">${esc(bl.blNumber)}</div>
      </td>
    </tr>
    <tr>
      <td style="border:1px solid #000;padding:6px;vertical-align:top;">
        ${labelVal("Consignee:", "")}
        <div style="font-size:10px; white-space:pre-line;">${esc(bl.consignee)}</div>
      </td>
      <td colspan="2" style="border:1px solid #000;padding:6px;vertical-align:top;">
        <div style="font-size:8px;font-weight:bold;">Notify Party(No claim shall attach for failure to notify)</div>
        <div style="font-size:10px; white-space:pre-line;">${esc(bl.notifyParty)}</div>
      </td>
    </tr>
    <tr>
      <td colspan="2" style="border:1px solid #000;padding:6px;">${labelVal("Forwarding agent / FMC No.", bl.forwardingAgent)}</td>
      <td style="border:1px solid #000;padding:6px;">${labelVal("Export reference (s): MBL NO.", bl.mblNo)}</td>
    </tr>
    <tr>
      <td style="border:1px solid #000;padding:6px;">${labelVal("Place of Receipt:", bl.placeOfReceipt)}</td>
      <td colspan="2" style="border:1px solid #000;padding:6px;">${labelVal("Place of Delivery:", bl.placeOfDelivery)}</td>
    </tr>
    <tr>
      <td style="border:1px solid #000;padding:6px;">${labelVal("Port of Loading:", bl.pol)}</td>
      <td colspan="2" style="border:1px solid #000;padding:6px;">${labelVal("Port of Discharge:", bl.pod)}</td>
    </tr>
    <tr>
      <td style="border:1px solid #000;padding:6px;">${labelVal("Vessel / Carrier", vesselVoyageDisplay(vesselSource(quote, bl)))}</td>
      <td style="border:1px solid #000;padding:6px;">${labelVal("Terms", bl.termsCode)}</td>
      <td style="border:1px solid #000;padding:6px;">${labelVal("Place and Date of Issue", `${bl.placeOfIssue || ""} ${bl.dateOfIssue || ""}`.trim())}<div style="margin-top:6px;">${labelVal("Number of Original B/L(s)", bl.numberOfOriginals)}</div></td>
    </tr>
  </table>

  <table style="border:1px solid #000;border-top:none;">
    <tr>
      <td style="border:1px solid #000;padding:5px 7px;font-size:9px;font-weight:bold;width:40%;">Container No. / Seal No. / Net &amp; Gross Weight</td>
      <td style="border:1px solid #000;padding:5px 7px;font-size:9px;font-weight:bold;width:60%;">Particulars of Cargo as Declared by Shipper</td>
    </tr>
    ${containerRows || `<tr><td colspan="2" style="border:1px solid #000;padding:6px 7px;">No containers listed</td></tr>`}
    <tr>
      <td colspan="2" style="border:1px solid #000;padding:5px 7px;font-size:10.5px;background:#F5EFE3;">
        <b>TOTAL NET WEIGHT:</b> ${totalNet.toLocaleString("en-US", { maximumFractionDigits: 3 })} KGS &nbsp;&nbsp;&nbsp; <b>TOTAL GROSS WEIGHT:</b> ${totalGross.toLocaleString("en-US", { maximumFractionDigits: 3 })} KGS
      </td>
    </tr>
  </table>

  <table style="border:1px solid #000;border-top:none;">
    <tr><td colspan="2" style="border:1px solid #000;padding:5px 7px;font-size:9px;font-weight:bold;">DECLARATION OF HAZARDOUS/DANGEROUS MATERIALS</td></tr>
    <tr>
      <td style="border:1px solid #000;padding:5px 7px;">${labelVal("IMO Class", quote.imoClass)}</td>
      <td style="border:1px solid #000;padding:5px 7px;">${labelVal("UN-NO", quote.unNo)}</td>
    </tr>
    <tr>
      <td style="border:1px solid #000;padding:5px 7px;">${labelVal("Pck. Grp.", "")}</td>
      <td style="border:1px solid #000;padding:5px 7px;">${labelVal("Marine Pollutant", "NO")}</td>
    </tr>
  </table>

  <table style="border:1px solid #000;border-top:none;">
    <tr>
      <td style="border:1px solid #000;padding:6px;width:60%;vertical-align:top;">
        <div style="font-size:8px;font-weight:bold;">For Delivery of Goods apply to:</div>
        <div style="font-size:10px;">${esc(bl.deliveryContactName)}</div>
        <div style="font-size:10px; white-space:pre-line;">${esc(bl.deliveryContactAddress)}</div>
      </td>
      <td style="border:1px solid #000;padding:6px;vertical-align:top;">${labelVal("SPECIAL REMARKS:", bl.specialRemarks)}</td>
    </tr>
    <tr><td colspan="2" style="border:1px solid #000;padding:6px;">${labelVal("Excess Value Declaration:", bl.excessValueDeclaration)}</td></tr>
  </table>

  <table style="border:1px solid #000;border-top:none;">
    <tr>
      <td style="border:1px solid #000;padding:5px 7px;font-size:9px;font-weight:bold;">Total Freight &amp; Charges</td>
      <td style="border:1px solid #000;padding:5px 7px;font-size:9px;font-weight:bold;">Prepaid / Collect</td>
      <td style="border:1px solid #000;padding:5px 7px;font-size:9px;font-weight:bold;">Load Free Time</td>
      <td style="border:1px solid #000;padding:5px 7px;font-size:9px;font-weight:bold;">Discharge Free Time</td>
      <td style="border:1px solid #000;padding:5px 7px;font-size:9px;font-weight:bold;">Container Demurrage (daily)</td>
    </tr>
    <tr>
      <td style="border:1px solid #000;padding:5px 7px;">&nbsp;</td>
      <td style="border:1px solid #000;padding:5px 7px;">${esc(bl.freightPrepaidCollect)}</td>
      <td style="border:1px solid #000;padding:5px 7px;">${esc(quote.freeTimePOL)}</td>
      <td style="border:1px solid #000;padding:5px 7px;">${esc(quote.freeTimePOD)}</td>
      <td style="border:1px solid #000;padding:5px 7px;">USD${esc(quote.demurrageRatePOD)}</td>
    </tr>
  </table>

  <p style="font-size:8px;margin-top:8px;">The goods and instructions are accepted and dealt with subject to the Standard Conditions printed overleaf. Received in apparent good order and condition. Genesis have no reasonable means of checking, is not responsible for any difference in weight, measure, quality, quality and content, the particulars of the cargo being declared by merchant.</p>
  <p style="font-size:9px;margin-top:16px;">In Witness Whereof</p>
  <p style="font-size:9px;">Bills of Lading of the tenor and date having signed one of which being accomplished the others to stand void</p>
  <table style="border:none;margin-top:20px;"><tr>
    <td style="border:none;width:60%;"></td>
    <td style="border:none;border-top:1px solid #000;text-align:center;padding-top:4px;font-size:9px;">As agent for the carrier</td>
  </tr></table>
</body></html>`;
}
