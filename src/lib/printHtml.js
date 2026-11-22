// Opens a document in a new tab for printing / "Save as PDF"; download saves the same HTML.
export function openForPrint(html, title) {
  const w = window.open("", "_blank");
  if (!w) { alert("Please allow pop-ups for this site to print."); return; }
  w.document.open(); w.document.write(html); w.document.close();
  w.document.title = title || "Document";
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* user prints manually */ } }, 400);
}
export function downloadHtml(html, fileName) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([html], { type: "text/html" })); a.download = `${fileName}.html`; a.click(); URL.revokeObjectURL(a.href);
}
