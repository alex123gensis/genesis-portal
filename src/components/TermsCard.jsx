// Free time and detention tariff for one booking, filtered by the caller's role on the server.
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { CARD, MUTED, LINE, Msg } from "../ui.jsx";

const ROLE = { CUSTOMER: "Customer", POL_AGENT: "Agent at port of loading", POD_AGENT: "Agent at port of discharge" };
function End({ title, t, currency }) {
  if (!t) return null;
  return (
    <div style={{ flex: "1 1 240px", border: `1px solid ${LINE}`, borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.05em" }}>{title}</div>
      <div style={{ fontWeight: 700, fontSize: 15, margin: "2px 0 8px" }}>{t.port || "—"}{t.agent ? <span style={{ fontWeight: 400, color: MUTED, fontSize: 12 }}> · agent {t.agent}</span> : null}</div>
      <div style={{ display: "flex", gap: 18 }}>
        <div><div style={{ fontSize: 22, fontWeight: 800 }}>{t.freeDays ?? "—"}</div><div style={{ fontSize: 11, color: MUTED }}>free days</div></div>
        <div><div style={{ fontSize: 22, fontWeight: 800 }}>{t.ratePerDay != null ? `${currency} ${Number(t.ratePerDay).toLocaleString()}` : "—"}</div><div style={{ fontSize: 11, color: MUTED }}>detention per tank per day after free time</div></div>
      </div>
    </div>
  );
}
export default function TermsCard({ job }) {
  const [d, setD] = useState(null); const [err, setErr] = useState(null);
  useEffect(() => { let on = true; api(`/api/terms?job=${encodeURIComponent(job.job_number)}`).then((r) => on && setD(r)).catch((e) => on && setErr(e.message)); return () => { on = false; }; }, [job.job_number]);
  if (err) return <Msg text={err} />;
  if (!d) return null;
  return (
    <div style={CARD}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 800 }}>Free time & detention</div>
        <div style={{ fontSize: 12, color: MUTED }}>Your role on this booking: {(d.roles || []).map((r) => ROLE[r] || r).join(", ") || "—"}</div>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <End title="Port of loading" t={d.pol} currency={d.currency} />
        <End title="Port of discharge" t={d.pod} currency={d.currency} />
      </div>
      <div style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>{d.note}</div>
    </div>
  );
}
