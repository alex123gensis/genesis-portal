// Agent dashboard: empty tanks at depots in the agent's region, with idle days. No customers, no rates.
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { CARD, MUTED, GREEN, AMBER, RED, BLUE, DARK, Tile, Msg, Empty, fmtD, downloadCsv, BTN } from "../ui.jsx";

const ST = { "MT AVAILABLE": ["Available", GREEN], "MT UC": ["Under cleaning", AMBER], "UNDER REPAIR": ["Under repair", RED], "MT ALLOCATED": ["Allocated", BLUE] };
export default function RegionView({ account }) {
  const [d, setD] = useState(null); const [err, setErr] = useState(null); const [place, setPlace] = useState("");
  useEffect(() => { let on = true; api("/api/region").then((r) => on && setD(r)).catch((e) => on && setErr(e.message)); return () => { on = false; }; }, []);
  if (err) return <Msg text={err} />;
  if (!d) return <div style={{ color: MUTED }}>Loading…</div>;
  const tanks = (d.tanks || []).filter((t) => !place || t.place === place);
  const avail = (d.tanks || []).filter((t) => t.status === "MT AVAILABLE");
  const idle = avail.filter((t) => t.idleDays != null); const avgIdle = idle.length ? Math.round(idle.reduce((a, t) => a + t.idleDays, 0) / idle.length) : null;
  const csv = () => downloadCsv(`tanks_in_region_${d.asOf}.csv`, ["Tank", "Depot / port", "Operator", "Status", "Type", "Since", "Idle days", "Last product", "Next test"], tanks.map((t) => [t.tank, t.place, t.operator, t.status, t.type, t.since, t.idleDays, t.lastProduct, t.nextTest]));
  return (
    <div>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>Empty Genesis tanks at depots in your region ({(d.ports || []).join(", ")}) as recorded in the Tank App on {fmtD(d.asOf)}. Idle days count from the empty-in date.</div>
      <div className="tiles" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
        <Tile label="Available now" value={avail.length} color={GREEN} />
        <Tile label="Under cleaning / repair" value={(d.tanks || []).filter((t) => t.status === "MT UC" || t.status === "UNDER REPAIR").length} color={AMBER} />
        <Tile label="Average idle days (available)" value={avgIdle ?? "—"} color={avgIdle > 30 ? RED : DARK} />
        <Tile label="Idle over 30 days" value={avail.filter((t) => t.idleDays > 30).length} color={RED} />
      </div>
      {(d.summary || []).length > 0 && (
        <div style={{ ...CARD, marginBottom: 12, padding: 0, overflowX: "auto" }}>
          <table>
            <thead><tr><th>Depot / port</th><th style={{ textAlign: "right" }}>Available</th><th style={{ textAlign: "right" }}>Cleaning</th><th style={{ textAlign: "right" }}>Repair</th><th style={{ textAlign: "right" }}>Allocated</th><th style={{ textAlign: "right" }}>Avg idle</th><th style={{ textAlign: "right" }}>Over 30 days</th></tr></thead>
            <tbody>{d.summary.map((s) => (
              <tr key={s.place} className="row" onClick={() => setPlace(place === s.place ? "" : s.place)} style={{ background: place === s.place ? "#FBF8F2" : undefined }}>
                <td style={{ fontWeight: 700 }}>{s.place}</td><td style={{ textAlign: "right", fontWeight: 800 }}>{s.available}</td><td style={{ textAlign: "right" }}>{s.cleaning}</td><td style={{ textAlign: "right" }}>{s.repair}</td><td style={{ textAlign: "right" }}>{s.allocated}</td>
                <td style={{ textAlign: "right" }}>{s.avgIdle ?? "—"}</td><td style={{ textAlign: "right", color: s.over30 ? RED : undefined }}>{s.over30}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div style={{ fontWeight: 800 }}>Tanks{place ? ` at ${place}` : ""} ({tanks.length})</div>
        {place && <button style={{ ...BTN, padding: "4px 8px", fontSize: 11 }} onClick={() => setPlace("")}>All ports</button>}
        <button style={{ ...BTN, marginLeft: "auto" }} onClick={csv} disabled={!tanks.length}>Download CSV</button>
      </div>
      {!tanks.length ? <div style={CARD}><Empty text="No empty tanks recorded in your region at the moment." /></div> : (
        <div style={{ ...CARD, padding: 0, overflowX: "auto" }}>
          <table style={{ minWidth: 800 }}>
            <thead><tr><th>Tank</th><th>Depot / port</th><th className="hide-sm">Operator</th><th>Status</th><th>Type</th><th>Empty since</th><th style={{ textAlign: "right" }}>Idle days</th><th className="hide-sm">Last product</th><th className="hide-sm">Next test</th></tr></thead>
            <tbody>{tanks.map((t) => { const s = ST[t.status] || [t.status, MUTED]; return (
              <tr key={t.tank}>
                <td style={{ fontFamily: "monospace", fontWeight: 700 }}>{t.tank}</td><td className="wrap">{t.place}</td><td className="hide-sm wrap">{t.operator || "—"}</td>
                <td><span style={{ background: s[1], color: "#fff", borderRadius: 10, padding: "2px 8px", fontSize: 10, fontWeight: 800 }}>{s[0].toUpperCase()}</span></td>
                <td>{t.type || "—"}</td><td>{fmtD(t.since)}</td>
                <td style={{ textAlign: "right", fontWeight: 700, color: t.idleDays > 30 ? RED : t.idleDays > 14 ? AMBER : undefined }}>{t.idleDays ?? "—"}</td>
                <td className="hide-sm wrap">{t.lastProduct || "—"}</td><td className="hide-sm">{fmtD(t.nextTest)}</td>
              </tr>); })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
