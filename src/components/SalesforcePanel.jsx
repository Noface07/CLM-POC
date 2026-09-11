import { useEffect, useState } from "react";
import {
  Cloud, ShieldAlert, Check, Loader2, RefreshCw, ArrowUpRight, X, LogIn, LogOut, Settings2,
  CircleCheck, CircleDashed, CircleAlert,
} from "lucide-react";
import { Tag, Btn, Field, GREEN, AMBER, RED, GRAY, kicker, formatDate } from "../lib/ui.jsx";
import {
  eligibility, contextFor, ONBOARDING_PREREQS, listSuppliers, testConnection,
} from "../lib/salesforce.js";
import { formatMoney } from "../data/contracts.js";

const FIELD_LABEL = {
  supplier_name: "Supplier", supplier_registered_number: "Company number",
  supplier_address: "Registered address", supplier_contact: "Supplier contact",
  legal_entity_name: "Our legal entity", legal_entity_registered_number: "Our company number (inferred)",
  legal_entity_address: "Our registered address (inferred)",
  governing_law: "Governing law (inferred from country)", jurisdiction: "Jurisdiction (inferred from country)",
  service_category: "Service category", facility_names: "Facility / site", title: "Contract title (inferred)",
  contract_value: "Contract value", currency_code: "Currency",
  payment_terms_days: "Payment terms (days)", business_owner: "Business owner",
  contract_owner: "Procurement owner", country: "Country / region",
};

function shortHost(url) {
  try { return new URL(url).host; } catch { return url || "—"; }
}

function stamp(at) {
  const d = at ? new Date(at) : null;
  return d && !isNaN(d) ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
}

// The page is a connection first and a supplier list second.
//
// It used to be the other way round: the list rendered, and whether it was talking to a
// real org lived inside a collapsed settings card, along with every message about what
// happened when you tried to sign in. Clicking Connect produced no visible result, and a
// failed sign-in left nothing to read and no obvious way to try again. So the first
// thing on the page is now what the connection is, what happened last time, and the one
// button that changes it.
export default function SalesforcePanel({
  onBack, config, setConfig, onCreateContract, milestones, contractId, canCreate, arrival,
  signedIn, whoami, authStatus, onConnect, onDisconnect, activeContractId,
}) {
  // The milestone list is estate-wide now — every push for every contract — so it needs a
  // filter. It opens on the contract that is open, which is what a person on this page
  // is almost always asking about, and offers the rest.
  const [milestoneFilter, setMilestoneFilter] = useState(activeContractId || "all");
  const milestoneContracts = [...new Set(milestones.map((m) => m.contractId).filter(Boolean))].sort();
  const shownMilestones = milestoneFilter === "all"
    ? milestones
    : milestones.filter((m) => m.contractId === milestoneFilter);
  const [records, setRecords] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [conn, setConn] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [openRow, setOpenRow] = useState(null);

  const live = config.mode === "live";
  const oauth = config.authMode === "oauth";
  // "Connected" means the next API call has something to send. Simulated is always ready.
  const ready = !live || (oauth ? signedIn : Boolean(config.accessToken));
  const missingKey = live && oauth && !config.clientId;

  // Load when, and only when, there is a connection to load through. This is an effect
  // keyed on the connection, not a call made during render: switching mode, signing in or
  // pasting a token all reload by themselves, and a failure does not stick.
  useEffect(() => {
    let cancelled = false;
    if (!ready) { setRecords(null); setError(""); setLoading(false); return undefined; }
    setLoading(true); setError("");
    listSuppliers(config)
      .then(({ records: rows }) => { if (!cancelled) setRecords(rows); })
      .catch((err) => { if (!cancelled) { setError(err.message); setRecords(null); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, config.mode, config.authMode, config.accessToken, config.instanceUrl, config.supplierObject, config.apiVersion]);

  const reload = () => setConfig((c) => ({ ...c }));  // nudges the effect

  // ---- connection card ----
  let tone = GRAY, Icon = CircleDashed, headline = "Simulated", detail = "Three built-in records. No network, no org.";
  if (live && ready) {
    tone = GREEN; Icon = CircleCheck;
    headline = `Connected to ${shortHost(config.loginUrl)}`;
    detail = oauth
      ? (whoami ? `Signed in as ${whoami.name} (${whoami.username}). The connection renews itself.` : "Signed in. The connection renews itself.")
      : "Using a pasted session token. It expires with the session.";
  } else if (live && missingKey) {
    tone = RED; Icon = CircleAlert;
    headline = "No consumer key";
    detail = "VITE_SF_CLIENT_ID is not set, or the dev server has not been restarted since .env changed. Vite reads .env once, at startup.";
  } else if (live) {
    tone = AMBER; Icon = CircleDashed;
    headline = `Not connected to ${shortHost(config.loginUrl)}`;
    detail = oauth
      ? "Sign in to your org. The browser goes to Salesforce's login page and comes back here."
      : "Paste a session token below to read from the org.";
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      <button type="button" className="btn btn-ghost" onClick={onBack} style={{ marginBottom: 4 }}>
        ← Back to CLM
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        padding: "var(--space-3) 0 var(--space-4)", borderBottom: "2px solid var(--color-divider)",
        marginBottom: "var(--space-4)" }}>
        <Cloud size={20} />
        <h2 style={{ margin: 0 }}>Supplier onboarding</h2>
        <Tag outline>Salesforce CRM</Tag>
      </div>

      {arrival && arrival.state !== "ready" && (
        <div
          className="clm-readonly-banner"
          style={{ marginBottom: "var(--space-4)",
            background: arrival.state === "blocked" ? AMBER.bg : arrival.state === "loading" ? GRAY.bg : RED.bg,
            color: arrival.state === "blocked" ? AMBER.color : arrival.state === "loading" ? GRAY.color : RED.color,
            borderColor: "currentColor" }}
        >
          <ShieldAlert size={15} />
          <span>
            {arrival.state === "loading" && <>Opening from Salesforce, reading the onboarding record…</>}
            {arrival.state === "blocked" && (
              <>
                <strong>{arrival.record?.Name} cannot be contracted yet.</strong> Salesforce offered the link, but the
                gate is checked again here and these prerequisites are outstanding:{" "}
                <strong>{arrival.missing.map((m) => m.label).join("; ")}</strong>. Clear them in Salesforce and open
                the link again.
              </>
            )}
            {arrival.state === "missing" && (
              <>
                <strong>That onboarding record could not be read.</strong> The link points at{" "}
                <code>{arrival.onboardingId}</code>, which this org either does not have or has not granted you access
                to. Check the CLM_Integration permission set is assigned.
              </>
            )}
            {arrival.state === "error" && (
              <><strong>Salesforce could not be reached.</strong> {arrival.detail}</>
            )}
          </span>
        </div>
      )}

      {/* ---------- CONNECTION ---------- */}
      <div className="card" style={{ marginBottom: "var(--space-4)", gap: 10, borderLeft: `4px solid ${tone.color}` }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <Icon size={22} style={{ color: tone.color, flex: "none", marginTop: 2 }} />
          <div style={{ flex: "1 1 320px", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <div className="card-title" style={{ margin: 0, fontSize: 16 }}>{headline}</div>
              {live && <Tag c={oauth ? GREEN : GRAY} style={{ fontSize: 10 }}>{oauth ? "OAuth" : "session token"}</Tag>}
            </div>
            <p style={{ margin: "3px 0 0", fontSize: 12.5, opacity: 0.75, lineHeight: 1.55 }}>{detail}</p>

            {authStatus && (
              <div style={{ marginTop: 8, padding: "7px 10px", fontSize: 12.5, lineHeight: 1.5,
                background: authStatus.ok ? GREEN.bg : RED.bg, color: authStatus.ok ? GREEN.color : RED.color,
                display: "flex", gap: 8, alignItems: "flex-start" }}>
                {authStatus.ok ? <Check size={14} style={{ flex: "none", marginTop: 2 }} /> : <X size={14} style={{ flex: "none", marginTop: 2 }} />}
                <span>
                  <strong>{authStatus.ok ? "Sign-in succeeded" : "Sign-in failed"}</strong>
                  {authStatus.at && <span style={{ opacity: 0.7 }}> · {stamp(authStatus.at)}</span>}
                  {authStatus.message && <> — {authStatus.message}</>}
                </span>
              </div>
            )}
            {conn && (
              <div style={{ marginTop: 8, padding: "7px 10px", fontSize: 12.5, lineHeight: 1.5,
                background: conn.ok ? GREEN.bg : RED.bg, color: conn.ok ? GREEN.color : RED.color }}>
                {conn.text}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", alignSelf: "flex-start" }}>
            {live && oauth && !signedIn && (
              <Btn variant="primary" icon={LogIn} onClick={onConnect} disabled={missingKey}
                title={missingKey ? "Set VITE_SF_CLIENT_ID in .env and restart the dev server" : "Sign in through your org"}>
                {authStatus && !authStatus.ok ? "Try again" : "Connect to Salesforce"}
              </Btn>
            )}
            {live && ready && (
              <Btn small variant="secondary" onClick={async () => {
                setConn(null);
                try { const r = await testConnection(config); setConn({ ok: true, text: r.detail }); }
                catch (err) { setConn({ ok: false, text: err.message }); }
              }}>Test connection</Btn>
            )}
            {live && oauth && signedIn && (
              <Btn small variant="ghost" icon={LogOut} onClick={onDisconnect}>Disconnect</Btn>
            )}
            <Btn small variant="ghost" icon={Settings2} onClick={() => setShowSettings((s) => !s)}>
              {showSettings ? "Hide settings" : "Settings"}
            </Btn>
          </div>
        </div>

        {/* mode: live first, because that is what this is for */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", borderTop: "1px solid var(--color-divider)", paddingTop: 10 }}>
          {[
            ["live", "Live", "Your Salesforce org"],
            ["simulated", "Simulated", "Three built-in records, no network"],
          ].map(([value, label, hint]) => (
            <label key={value} style={{ display: "flex", gap: 7, alignItems: "flex-start", fontSize: 13, cursor: "pointer" }}>
              <input type="radio" name="sf-mode" value={value} checked={config.mode === value}
                onChange={() => { setConn(null); setConfig((c) => ({ ...c, mode: value })); }} style={{ marginTop: 3 }} />
              <span><strong>{label}</strong><span style={{ opacity: 0.6 }}> — {hint}</span></span>
            </label>
          ))}
        </div>

        {live && !oauth && (
          <Field label="Session token" hint="From sf org display --verbose, or Developer Console → UserInfo.getSessionId(). Held in this tab's memory only. Expires with the session.">
            <input className="input" type="password" value={config.accessToken} placeholder="00D…"
              onChange={(e) => setConfig((c) => ({ ...c, accessToken: e.target.value }))} />
          </Field>
        )}

        {showSettings && (
          <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 10, display: "grid", gap: 10 }}>
            <Field label="Authentication">
              <select className="input" value={config.authMode} onChange={(e) => { setConn(null); setConfig((c) => ({ ...c, authMode: e.target.value })); }}>
                <option value="oauth">Sign in with Salesforce (OAuth, refreshes itself)</option>
                <option value="token">Paste a session token (expires with the session)</option>
              </select>
            </Field>
            {oauth && (
              <div className="clm-grid-2">
                <Field label="Consumer key" hint="From the FM CLM Demo connected app. Not a secret: a PKCE public client carries it in the page by design.">
                  <input className="input" value={config.clientId} placeholder="3MVG9…"
                    onChange={(e) => setConfig((c) => ({ ...c, clientId: e.target.value }))} />
                </Field>
                <Field label="Login URL" hint="Your org's My Domain. The browser is sent here to sign in, so it cannot go through the proxy.">
                  <input className="input" value={config.loginUrl}
                    onChange={(e) => setConfig((c) => ({ ...c, loginUrl: e.target.value }))} />
                </Field>
              </div>
            )}
            <div className="clm-grid-2">
              <Field label="Instance URL" hint="/salesforce is the dev-server proxy path. From a deployed site, the real org address, and its origin allowlisted under Setup → CORS.">
                <input className="input" value={config.instanceUrl} onChange={(e) => setConfig((c) => ({ ...c, instanceUrl: e.target.value }))} />
              </Field>
              <Field label="API version"><input className="input" value={config.apiVersion} onChange={(e) => setConfig((c) => ({ ...c, apiVersion: e.target.value }))} /></Field>
            </div>
            <div className="clm-grid-2">
              <Field label="Supplier object" hint="Blueprint §14 lists the object model as still to be validated, so it is a setting rather than code.">
                <input className="input" value={config.supplierObject} onChange={(e) => setConfig((c) => ({ ...c, supplierObject: e.target.value }))} />
              </Field>
              <Field label="Status / ID fields written back">
                <div style={{ display: "grid", gap: 6 }}>
                  <input className="input" value={config.contractStatusField} onChange={(e) => setConfig((c) => ({ ...c, contractStatusField: e.target.value }))} />
                  <input className="input" value={config.contractIdField} onChange={(e) => setConfig((c) => ({ ...c, contractIdField: e.target.value }))} />
                </div>
              </Field>
            </div>
            <p style={{ fontSize: 11, opacity: 0.55, margin: 0, lineHeight: 1.5 }}>
              With OAuth, the refresh token is kept in this browser so the connection survives a reload. It is readable
              by anything on this page, which is why in production the call and the credential belong on a server.
              Disconnect revokes it at the org.
            </p>
          </div>
        )}
      </div>

      {/* ---------- SUPPLIERS ---------- */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <div className="card-title" style={{ margin: 0, fontSize: 15 }}>
          {live ? "Suppliers ready to contract" : "Suppliers ready to contract (simulated)"}
        </div>
        {records && <Tag c={GRAY} style={{ fontSize: 10 }}>{records.length} onboarding record{records.length === 1 ? "" : "s"}</Tag>}
        <Btn small variant="ghost" icon={loading ? Loader2 : RefreshCw} spin={loading} onClick={reload} disabled={!ready} style={{ marginLeft: "auto" }}>Refresh</Btn>
      </div>
      <p style={{ fontSize: 12.5, opacity: 0.7, margin: "0 0 var(--space-4)", lineHeight: 1.65, maxWidth: 900 }}>
        Blueprint §6.1: contracting starts here, from a supplier whose onboarding has reached the state that permits
        it. The CLM checks the four prerequisites itself and refuses when any is outstanding, whatever the link that
        opened it claimed. Clear them in Salesforce, not here.
      </p>

      {error && (
        <div style={{ background: RED.bg, color: RED.color, padding: 10, marginBottom: "var(--space-4)", fontSize: 12.5, lineHeight: 1.5 }}>
          <strong>Could not read the org.</strong> {error}
        </div>
      )}

      <div className="clm-grid-2" style={{ gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)", alignItems: "start" }}>
        <div style={{ display: "grid", gap: "var(--space-3)" }}>
          {!ready && (
            <div className="card" style={{ alignItems: "center", textAlign: "center", padding: "var(--space-6)", gap: 8 }}>
              <CircleDashed size={26} style={{ opacity: 0.4 }} />
              <div style={{ fontSize: 14, fontWeight: 600 }}>Nothing to show until you are connected</div>
              <p style={{ fontSize: 12.5, opacity: 0.65, margin: 0, maxWidth: 420, lineHeight: 1.55 }}>
                {oauth
                  ? "Sign in above. Your org's suppliers appear here the moment the connection is made."
                  : "Paste a session token above to read from the org."}
              </p>
              {oauth && !missingKey && <Btn variant="primary" icon={LogIn} onClick={onConnect}>Connect to Salesforce</Btn>}
            </div>
          )}

          {(records || []).map((r) => {
            const el = eligibility(r);
            const ctx = contextFor(r);
            const open = openRow === r.Id;
            return (
              <div key={r.Id} className="card" style={{ gap: 10 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 15 }}>{r.Name}</span>
                  <Tag c={el.eligible ? GREEN : AMBER} style={{ fontSize: 10.5 }}>
                    {r.Onboarding_Status__c || (r.live ? "onboarding state not in this org" : "unknown")}
                  </Tag>
                  {r.live && <Tag c={GREEN} style={{ fontSize: 9.5 }}>from your org</Tag>}
                  <span style={{ fontSize: 11, opacity: 0.5, marginLeft: "auto", fontFamily: "ui-monospace, monospace" }}>
                    {r.Supplier_Onboarding_Id__c || r.Id}
                  </span>
                </div>

                {!el.eligible && (
                  <div style={{ background: "#fdf1da", border: "1px solid #f5dfa8", color: "#7a4a05", padding: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 5 }}>
                      Contracting is blocked: {el.missing.length} onboarding prerequisite{el.missing.length === 1 ? "" : "s"} outstanding
                    </div>
                    <div style={{ display: "grid", gap: 3 }}>
                      {ONBOARDING_PREREQS.map((p) => {
                        const done = Boolean(r.prereqs?.[p.key]);
                        return (
                          <div key={p.key} style={{ fontSize: 11.5, display: "flex", gap: 6, alignItems: "center", opacity: done ? 0.55 : 1 }}>
                            {done ? <Check size={12} /> : <X size={12} />}{p.label}
                          </div>
                        );
                      })}
                    </div>
                    <p style={{ margin: "7px 0 0", fontSize: 11, lineHeight: 1.55 }}>
                      Cleared in Salesforce, not here. Onboarding state is the CRM's to own, and a CLM that could tick
                      these off would let a contract be raised against a supplier procurement had not finished checking.
                    </p>
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <Btn
                    onClick={() => onCreateContract(r, ctx)} icon={ArrowUpRight} variant="primary" small
                    disabled={!el.eligible || !canCreate}
                  >Create contract</Btn>
                  <Btn onClick={() => setOpenRow(open ? null : r.Id)} variant="ghost" small>
                    {open ? "Hide the field map" : "What gets carried across"}
                  </Btn>
                  {!canCreate && <span style={{ fontSize: 10.5, opacity: 0.5 }}>Your role cannot create contracts</span>}
                </div>

                {open && (
                  <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 9 }}>
                    <div style={{ ...kicker, marginBottom: 6 }}>Carried into the CLM draft</div>
                    <table className="clm-matrix" style={{ fontSize: 12 }}>
                      <tbody>
                        {Object.entries(ctx).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => (
                          <tr key={k}>
                            <td style={{ opacity: 0.65, width: "45%" }}>{FIELD_LABEL[k] || k}</td>
                            <td style={{ textAlign: "left" }}>
                              {k === "contract_value" ? formatMoney(v, ctx.currency_code) : String(v)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p style={{ margin: "8px 0 0", fontSize: 11, opacity: 0.6, lineHeight: 1.6 }}>
                      Agreement type, template and the contract dates are deliberately not on this list. The blueprint
                      sources them to the user (§7) and is explicit that the system should not spend AI or inference on
                      a value the business process states outright (§6.2).
                    </p>
                  </div>
                )}
              </div>
            );
          })}
          {loading && <p style={{ fontSize: 12.5, opacity: 0.6 }}>Reading the org…</p>}
          {ready && records && records.length === 0 && (
            <p style={{ fontSize: 12.5, opacity: 0.6 }}>
              Connected, but no onboarding records came back. Run <code>scripts/seed-demo-data.apex</code>, or check
              the CLM_Integration permission set is assigned.
            </p>
          )}
        </div>

        <div className="card" style={{ gap: 8, alignSelf: "start" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div className="card-title" style={{ margin: 0, fontSize: 15 }}>Contract status in Salesforce</div>
            <Tag c={GRAY} style={{ fontSize: 10, marginLeft: "auto" }}>
              {shownMilestones.length}{milestoneFilter !== "all" && milestones.length !== shownMilestones.length ? ` of ${milestones.length}` : ""} pushed
            </Tag>
          </div>
          {milestoneContracts.length > 0 && (
            <select
              className="input" value={milestoneFilter} aria-label="Filter milestones by contract"
              onChange={(e) => setMilestoneFilter(e.target.value)}
              style={{ fontSize: 12, minHeight: 32, padding: "4px 8px" }}
            >
              <option value="all">All contracts ({milestones.length})</option>
              {milestoneContracts.map((id) => (
                <option key={id} value={id}>
                  {id}{id === activeContractId ? " · open now" : ""} ({milestones.filter((m) => m.contractId === id).length})
                </option>
              ))}
            </select>
          )}
          <p style={{ fontSize: 11.5, opacity: 0.6, margin: 0, lineHeight: 1.6 }}>
            §11: "Salesforce reflects contract status and key lifecycle milestones." Every transition writes a
            pointer onto the onboarding record and the full lifecycle onto a CLM Contract record, including PO
            eligibility.
          </p>
          {contractId && (
            <div style={{ fontSize: 12, borderTop: "1px solid var(--color-divider)", paddingTop: 8 }}>
              <div style={{ ...kicker, marginBottom: 3 }}>{config.contractIdField}</div>
              <div style={{ fontFamily: "ui-monospace, monospace" }}>{contractId}</div>
            </div>
          )}
          {milestones.length === 0 && (
            <p style={{ fontSize: 12, opacity: 0.55, margin: 0 }}>
              Nothing yet. Create a contract and the status lands here on every transition.
            </p>
          )}
          {milestones.length > 0 && shownMilestones.length === 0 && (
            <p style={{ fontSize: 12, opacity: 0.55, margin: 0 }}>
              Nothing pushed for this contract yet.
            </p>
          )}
          {shownMilestones.slice().reverse().map((m, i) => (
            <div key={i} style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 7, fontSize: 12 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                {milestoneFilter === "all" && m.contractId && (
                  <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, opacity: 0.7 }}>{m.contractId}</span>
                )}
                <strong>{m.status}</strong>
                <Tag c={m.failed ? RED : m.simulated ? GRAY : GREEN} style={{ fontSize: 9.5 }}>
                  {m.failed ? "failed" : m.simulated ? "simulated" : "written"}
                </Tag>
                {m.poEligible != null && !m.simulated && (
                  <Tag c={m.poEligible ? GREEN : GRAY} style={{ fontSize: 9.5 }}>PO {m.poEligible ? "eligible" : "not eligible"}</Tag>
                )}
                <span style={{ opacity: 0.5, marginLeft: "auto", fontSize: 10.5 }}>{formatDate(m.at)}</span>
              </div>
              <div style={{ opacity: 0.65, fontSize: 11, marginTop: 2 }}>{m.milestone}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
