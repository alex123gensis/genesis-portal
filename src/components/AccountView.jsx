import { CARD, MUTED, LINE } from "../ui.jsx";
import ChangePassword from "./ChangePassword.jsx";

export default function AccountView({ me, onChanged }) {
  const { user, account } = me;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, alignItems: "start" }}>
      <div style={CARD}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 10 }}>Your account</div>
        {[["Company", account.name], ["Access", account.kind === "AGENT" ? "Agent - bookings and sailing schedule (can enter sailings)" : "Customer - shipment tracking and sailing schedule"], ["Name", user.name || "—"], ["E-mail", user.email]].map(([k, v]) => (
          <div key={k} style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: `1px solid ${LINE}`, fontSize: 13 }}><div style={{ width: 90, color: MUTED, fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", paddingTop: 2 }}>{k}</div><div>{v}</div></div>))}
        <div style={{ fontSize: 12, color: MUTED, marginTop: 10 }}>To add colleagues or change what you can see, contact your Genesis representative.</div>
      </div>
      <ChangePassword onDone={() => { onChanged(); window.alert("Password changed."); }} />
    </div>
  );
}
