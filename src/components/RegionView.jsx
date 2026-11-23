// Agent dashboard: Genesis tanks in the agent's region - empty at depots, loading (outbound), in transit / arrived (inbound).
// Click a port row to see its tanks. No customers, no rates.
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { CARD, MUTED, GREEN, AMBER, RED, BLUE, DARK, ORANGE, LINE, Tile, Msg, Empty, fmtD, downloadCsv, BTN } from "../ui.jsx";

const BUCKET = { AVAILABLE: ["Available", GREEN, "idle"], CLEANING_REPAIR: ["Cleaning / repair", AMBER, "since"], ALLOCATED: ["Allocated", BLUE, "since"], LOADING: ["Loading (outbound)", "#B7791F", "since depot out"], IN_TRANSIT: ["In transit (inbound)", ORANGE, "since sailed"], FCL_ARRIVED: ["FCL arrived", RED, "since arrival"] };
const ST = { "MT AVAILABLE": "Available", "MT UC": "Under cleaning", "UNDER REPAIR": "Under repair", "MT ALLOCATED": "Allocated", "DEPOT OUT": "Out of depot", "EXPORT OUT": "Gated in", "IN TRANSIT": "In transit", FCL: "FCL at port", "FCL LONG ON DEMURRAGE": "FCL - long standing" };

export default function RegionView({ account }) {
  const [d, setD] = useState(null); const [err, setErr] = useState(null); const [place, setPlace] = useState(""); const [bucket, setBucket] = useState("");
  useEffect(() => { let on = true; api("/api/region").then((r) => on && setD(r)).catch((e) => on && setErr(e.message)); return () => { on = false; }; }, []);
  if (err) return <Msg text={err} />;
  if (!d) return <div style={{ color: MUTED }}>Loading…</div>;
  const all = d.tanks || [];
  const count = (b) => all.filter((t) => t.bucket === b).length;
  const avail = all.filter((t) => t.bucket === "AVAILABLE"); const idle = avail.filter((t) => t.days != null);
  const avgIdle = idle.length ? Math.round(idle.reduce((a, t) => a + t.days, 0) / idle.length) : null;
  const tanks = all.filter((t) => t.place === place && (!bucket || t.bucket === bucket));
  const csv = () => downloadCsv(`tanks_${place || "region"}_${d.asOf}.csv`, ["Tank", "Port", "Status", "Operator", "Type", "Since", "Days", "Job", "From / to", "Last product", "Next test"],
    (place ? tanks : all).map((t) => [t.tank, t.place, ST[t.status] || t.status, t.operator, t.type, t.since, t.days, t.job, t.otherPort, t.lastProduct, t.nextTest]));
  const Hd = ({ b, label }) => <th style={{ textAlign: "right", color: BUCKET[b][1] }} title={BUCKET[b][0]}>{label}</th>;
  return (
    <div>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>Genesis tanks in your region ({(d.ports || []).join(", ")}) as recorded in the Tank App on {fmtD(d.asOf)}: empty tanks at the depots, tanks loading for export, and tanks sailing to or arrived at your ports. Click a port to see its tanks.</div>
      <div className="tiles" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 14 }}>
        <Tile label="Available now" value={count("AVAILABLE")} color={GREEN} on={bucket === "AVAILABLE"} onClick={() => setBucket(bucket === "AVAILABLE" ? "" : "AVAILABLE")} />
        <Tile label="Cleaning / repair" value={count("CLEANING_REPAIR")} color={AMBER} on={bucket === "CLEANING_REPAIR"} onClick={() => setBucket(bucket === "CLEANING_REPAIR" ? "" : "CLEANING_REPAIR")} />
        <Tile label="Allocated" value={count("ALLOCATED")} color={BLUE} on={bucket === "ALLOCATED"} onClick={() => setBucket(bucket === "ALLOCATED" ? "" : "ALLOCATED")} />
        <Tile label="Loading (outbound)" value={count("LOADING")} color="#B7791F" on={bucket === "LOADING"} onClick={() => setBucket(bucket === "LOADING" ? "" : "LOADING")} />
        <Tile label="In transit (inbound)" value={count("IN_TRANSIT")} color={ORANGE} on={bucket === "IN_TRANSIT"} onClick={() => setBucket(bucket === "IN_TRANSIT" ? "" : "IN_TRANSIT")} />
        <Tile label="FCL arrived" value={count("FCL_ARRIVED")} color={RED} sub={avgIdle != null ? `avg idle of available: ${avgIdle} d` : undefined} on={bucket === "FCL_ARRIVED"} onClick={() => setBucket(bucket === "FCL_ARRIVED" ? "" : "FCL_ARRIVED")} />
      </div>
      {!(d.summary || []).length ? <div style={CARD}><Empty text="No Genesis tanks recorded in your region at the moment." /></div> : (
        <div style={{ ...CARD, marginBottom: 12, padding: 0, overflowX: "auto" }}>
          <table>
            <thead><tr><th>Port / depot</th><Hd b="AVAILABLE" label="Available" /><Hd b="CLEANING_REPAIR" label="Clean / repair" /><Hd b="ALLOCATED" label="Allocated" /><Hd b="LOADING" label="Loading" /><Hd b="IN_TRANSIT" label="In transit" /><Hd b="FCL_ARRIVED" label="FCL arrived" /><th style={{ textAlign: "right" }}>Avg idle</th><th style={{ textAlign: "right" }}>Idle &gt; 30 d</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
            <tbody>{d.summary.map((s) => (
              <tr key={s.place} className="row" onClick={() => setPlace(place === s.place ? "" : s.place)} style={{ background: place === s.place ? "#FBF8F2" : undefined }}>
                <td style={{ fontWeight: 700 }}>{place === s.place ? "▾ " : "▸ "}{s.place}</td>
                <td style={{ textAlign: "right", fontWeight: 800 }}>{s.available}</td><td style={{ textAlign: "right" }}>{s.cleaning}</td><td style={{ textAlign: "right" }}>{s.allocated}</td>
                <td style={{ textAlign: "right" }}>{s.loading}</td><td style={{ textAlign: "right" }}>{s.inTransit}</td><td style={{ textAlign: "right", color: s.arrived ? RED : undefined }}>{s.arrived}</td>
                <td style={{ textAlign: "right" }}>{s.avgIdle ?? "—"}</td><td style={{ textAlign: "right", color: s.over30 ? RED : undefined }}>{s.over30}</td><td style={{ textAlign: "right", fontWeight: 700 }}>{s.total}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
      {!place ? <div style={{ fontSize: 12, color: MUTED, display: "flex", alignItems: "center", gap: 8 }}>Click a port above to list its tanks.<button style={{ ...BTN, marginLeft: "auto" }} onClick={csv} disabled={!all.length}>Download all as CSV</button></div> : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 800 }}>{place} · {tanks.length} tank{tanks.length === 1 ? "" : "s"}{bucket ? ` · ${BUCKET[bucket][0]}` : ""}</div>
            {bucket && <button style={{ ...BTN, padding: "4px 8px", fontSize: 11 }} onClick={() => setBucket("")}>All statuses</button>}
            <button style={{ ...BTN, padding: "4px 8px", fontSize: 11 }} onClick={() => setPlace("")}>Close</button>
            <button style={{ ...BTN, marginLeft: "auto" }} onClick={csv} disabled={!tanks.length}>Download CSV</button>
          </div>
          {!tanks.length ? <div style={CARD}><Empty text="No tanks in this group." /></div> : (
            <div style={{ ...CARD, padding: 0, overflowX: "auto" }}>
              <table style={{ minWidth: 900 }}>
                <thead><tr><th>Tank</th><th>Status</th><th className="hide-sm">Operator / depot</th><th>Type</th><th>Since</th><th style={{ textAlign: "right" }}>Days</th><th>Booking</th><th>From / to</th><th className="hide-sm">Last product</th><th className="hide-sm">Next test</th></tr></thead>
                <tbody>{tanks.map((t) => { const b = BUCKET[t.bucket] || [t.bucket, MUTED, ""]; return (
                  <tr key={t.tank}>
                    <td style={{ fontFamily: "monospace", fontWeight: 700 }}>{t.tank}</td>
                    <td><span style={{ background: b[1], color: "#fff", borderRadius: 10, padding: "2px 8px", fontSize: 10, fontWeight: 800 }}>{(ST[t.status] || t.status).toUpperCase()}</span></td>
                    <td className="hide-sm wrap">{t.operator || "—"}</td><td>{t.type || "—"}</td><td>{fmtD(t.since)}</td>
                    <td style={{ textAlign: "right", fontWeight: 700, color: t.bucket === "AVAILABLE" && t.days > 30 ? RED : t.bucket === "FCL_ARRIVED" && t.days > 7 ? RED : undefined }} title={b[2]}>{t.days ?? "—"}<div style={{ fontSize: 10, color: MUTED, fontWeight: 400 }}>{b[2]}</div></td>
                    <td style={{ fontFamily: "monospace" }}>{t.job || "—"}</td><td className="wrap">{t.otherPort ? (t.bucket === "LOADING" ? `to ${t.otherPort}` : `from ${t.otherPort}`) : "—"}</td>
                    <td className="hide-sm wrap">{t.lastProduct || "—"}</td><td className="hide-sm">{fmtD(t.nextTest)}</td>
                  </tr>); })}</tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
