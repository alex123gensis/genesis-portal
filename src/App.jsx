import { useCallback, useEffect, useState } from "react";
import { auth, configured, configProblem } from "./portalAuth.js";
import { api } from "./api.js";
import { DARK, ORANGE, MUTED, CARD, INPUT, PRIMARY, BTN, Field, Msg } from "./ui.jsx";
import ShipmentsView from "./components/ShipmentsView.jsx";
import SailingsView from "./components/SailingsView.jsx";
import AccountView from "./components/AccountView.jsx";
import BookingRequestsView from "./components/BookingRequestsView.jsx";
import RegionView from "./components/RegionView.jsx";
import ChangePassword from "./components/ChangePassword.jsx";

export const hostFace = () => (/^agent/i.test(typeof window !== "undefined" ? window.location.hostname : "") ? "AGENT" : "CUSTOMER");
const faceLabel = (kind) => (kind === "AGENT" ? "Agent portal" : "Customer portal");
const Logo = ({ kind }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
    <div style={{ width: 34, height: 34, borderRadius: 8, background: ORANGE, display: "grid", placeItems: "center", color: "#fff", fontWeight: 900, fontSize: 18 }}>G</div>
    <div><div style={{ fontWeight: 800, fontSize: 15, color: "#fff", lineHeight: 1.1 }}>Genesis Tank Containers</div><div style={{ fontSize: 11, color: "#d8d2c6", letterSpacing: "0.08em", textTransform: "uppercase" }}>{faceLabel(kind)}</div></div>
  </div>
);

function Login() {
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const { error } = await auth.auth.signInWithPassword({ email: email.trim(), password: pw });
    if (error) { setErr(/invalid login credentials/i.test(error.message) ? "E-mail or password is not right." : `Sign-in failed: ${error.message}`); setBusy(false); }
  };
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16, background: `linear-gradient(160deg, ${DARK} 0%, #3a3230 60%, #5a4a3a 100%)` }}>
      <form onSubmit={go} style={{ ...CARD, width: "100%", maxWidth: 400, padding: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: ORANGE, display: "grid", placeItems: "center", color: "#fff", fontWeight: 900, fontSize: 22 }}>G</div>
          <div><div style={{ fontWeight: 800, fontSize: 17 }}>Genesis Tank Containers</div><div style={{ fontSize: 12, color: MUTED }}>{faceLabel(hostFace())}</div></div>
        </div>
        <Msg text={err} onClose={() => setErr(null)} />
        <div style={{ display: "grid", gap: 12 }}>
          <Field label="E-mail"><input style={INPUT} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          <Field label="Password"><input style={INPUT} type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></Field>
          <button style={{ ...PRIMARY, padding: 12, fontSize: 14 }} disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 16, lineHeight: 1.5 }}>{hostFace() === "AGENT" ? "For Genesis agents: sailing schedules and bookings." : "Your login is issued by Genesis."} Forgotten your password? Ask your Genesis contact to reset it.</div>
      </form>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined);   // portal-project auth session
  const [me, setMe] = useState(null);                   // { user, account } from /api/session
  const [meErr, setMeErr] = useState(null);
  const [tab, setTab] = useState(null);   // decided once the account kind is known

  useEffect(() => {
    if (!configured) { setSession(null); return; }
    auth.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = auth.auth.onAuthStateChange((_e, s) => setSession(s || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadMe = useCallback(async () => {
    try { const s = await api("/api/session"); setMe(s); setMeErr(null); } catch (e) { setMe(null); setMeErr(e.message); }
  }, []);
  useEffect(() => { if (session) loadMe(); else setMe(null); }, [session, loadMe]);

  const signOut = () => auth.auth.signOut();

  if (!configured || !auth) return <div style={{ padding: 40, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>Portal is not configured: {configProblem}</div>;
  if (session === undefined) return <div style={{ padding: 40, color: MUTED }}>Loading…</div>;
  if (!session) return <Login />;

  const account = me && me.account;
  const forced = me && me.user && me.user.must_change_password;
  const isAgent = !!(account && account.kind === "AGENT");
  const view = tab || (isAgent ? "region" : "shipments");

  return (
    <div style={{ minHeight: "100vh" }}>
      <header style={{ background: DARK, color: "#fff" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "12px 16px 0", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <Logo kind={account ? account.kind : hostFace()} />
          <div style={{ marginLeft: "auto", textAlign: "right", fontSize: 12, color: "#d8d2c6" }}>
            {account && <div style={{ fontWeight: 700, color: "#fff", fontSize: 13 }}>{account.name}</div>}
            <div>{session.user.email} · <button onClick={signOut} style={{ background: "none", border: "none", color: ORANGE, fontWeight: 700, cursor: "pointer", padding: 0, fontSize: 12 }}>Sign out</button></div>
          </div>
          {account && !forced && (
            <nav className="nav" style={{ width: "100%", display: "flex", gap: 2 }}>
              {isAgent && <button className={view === "region" ? "on" : ""} onClick={() => setTab("region")}>Tanks in my region</button>}
              {isAgent && <button className={view === "sailings" ? "on" : ""} onClick={() => setTab("sailings")}>Sailing schedule</button>}
              <button className={view === "shipments" ? "on" : ""} onClick={() => setTab("shipments")}>{isAgent ? "Bookings" : "My shipments"}</button>
              {!isAgent && <button className={view === "sailings" ? "on" : ""} onClick={() => setTab("sailings")}>Sailing schedule</button>}
              <button className={view === "requests" ? "on" : ""} onClick={() => setTab("requests")}>Booking requests</button>
              <button className={view === "account" ? "on" : ""} onClick={() => setTab("account")}>Account</button>
            </nav>
          )}
        </div>
      </header>
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: 16 }}>
        {meErr && <Msg text={meErr} />}
        {!me && !meErr && <div style={{ color: MUTED }}>Loading…</div>}
        {me && !account && <div style={{ ...CARD, maxWidth: 520, margin: "40px auto" }}><div style={{ fontWeight: 800, marginBottom: 6 }}>No company linked to this login</div><div style={{ fontSize: 13, color: MUTED }}>Your e-mail is not linked to a customer account yet. Please contact your Genesis representative.</div><button style={{ ...BTN, marginTop: 12 }} onClick={signOut}>Sign out</button></div>}
        {account && forced && <ChangePassword forced onDone={loadMe} />}
        {account && !forced && view === "shipments" && <ShipmentsView account={account} />}
        {account && !forced && view === "sailings" && <SailingsView account={account} />}
        {account && !forced && view === "region" && isAgent && <RegionView account={account} />}
        {account && !forced && view === "requests" && <BookingRequestsView account={account} />}
        {account && !forced && view === "account" && <AccountView me={me} onChanged={loadMe} />}
      </main>
      <footer style={{ textAlign: "center", fontSize: 11, color: MUTED, padding: 20 }}>Genesis Chemical Tank Containers LLC · Dubai · Data as recorded in the Genesis Tank App</footer>
    </div>
  );
}
