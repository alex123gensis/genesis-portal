export const DARK = "#231E1E", ORANGE = "#F09128", GREEN = "#2E7D5B", MUTED = "#8a8578", LINE = "#e0ddd3", BLUE = "#1f6fb2", AMBER = "#B7791F", RED = "#C53030";
export const INPUT = { width: "100%", padding: "9px 10px", border: `1px solid #cfcabd`, borderRadius: 6, fontSize: 14, background: "#fff" };
export const LABEL = { fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: 4 };
export const BTN = { padding: "9px 14px", border: `1px solid ${DARK}`, background: "#fff", color: DARK, borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 700 };
export const PRIMARY = { ...BTN, border: "none", background: ORANGE, color: "#fff" };
export const DANGER = { ...BTN, border: `1px solid ${RED}`, color: RED };
export const CARD = { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 10, padding: 16 };
export const STAGES = ["ALLOCATED", "LOADING", "GATED_IN", "ON_WATER", "ARRIVED", "RETURNED"];
export const STAGE = {
  PENDING: ["Booking received", MUTED], ALLOCATED: ["Tanks allocated", BLUE], LOADING: ["Collected for loading", AMBER], GATED_IN: ["Gated in at port", AMBER],
  ON_WATER: ["On water", ORANGE], ARRIVED: ["Arrived at destination", GREEN], RETURNED: ["Completed", DARK], CANCELLED: ["Cancelled", RED],
};
export const fmtD = (d) => (d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "—");
export const fmtDT = (d) => (d ? new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
export function Field({ label, children, span, hint }) {
  return <div style={span ? { gridColumn: "1 / -1" } : undefined}><label style={LABEL}>{label}</label>{children}{hint && <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>{hint}</div>}</div>;
}
export function Pill({ stage, text, color }) {
  const s = stage ? STAGE[stage] || [stage, MUTED] : [text, color || MUTED];
  return <span style={{ display: "inline-block", fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", padding: "3px 8px", borderRadius: 10, background: s[1], color: "#fff", whiteSpace: "nowrap" }}>{String(s[0]).toUpperCase()}</span>;
}
export function Tile({ label, value, color = DARK, sub, onClick, on }) {
  return (
    <div onClick={onClick} style={{ ...CARD, padding: "12px 14px", position: "relative", overflow: "hidden", cursor: onClick ? "pointer" : "default", outline: on ? `2px solid ${color}` : "none" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: color }} />
      <div style={{ fontSize: 26, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: MUTED }}>{sub}</div>}
    </div>
  );
}
export function Msg({ text, ok, onClose }) {
  if (!text) return null;
  return <div style={{ background: ok ? "#EAF5EE" : "#FBEAE7", border: `1px solid ${ok ? GREEN : RED}`, color: ok ? GREEN : RED, borderRadius: 6, padding: "8px 10px", fontSize: 13, marginBottom: 10, display: "flex", justifyContent: "space-between", gap: 8 }}><span>{text}</span>{onClose && <button onClick={onClose} style={{ border: "none", background: "none", color: "inherit", fontWeight: 800, cursor: "pointer" }}>x</button>}</div>;
}
export function Empty({ text }) { return <div style={{ padding: 24, color: MUTED, fontSize: 14, textAlign: "center" }}>{text}</div>; }
export function downloadCsv(name, headers, rows) {
  const esc = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const text = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\r\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv" })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
