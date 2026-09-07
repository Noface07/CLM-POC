import { useState } from "react";
import {
  Cloud, ArrowRight, ShieldAlert, Check, KeyRound, Loader2, RefreshCw, ArrowUpRight, X,
} from "lucide-react";
import { Tag, Btn, Field, GREEN, AMBER, RED, GRAY, kicker, formatDate } from "../lib/ui.jsx";
import {
  eligibility, contextFor, ONBOARDING_PREREQS, listSuppliers, testConnection,
} from "../lib/salesforce.js";
import { formatMoney } from "../data/contracts.js";

const FIELD_LABEL = {
  supplier_name: "Supplier", supplier_company_number: "Company number",
  supplier_address: "Registered address", client_entity: "Legal entity",
  service_category: "Service category", facility_site: "Facility / site",
  contract_value: "Contract value", currency_code: "Currency",
  payment_terms_days: "Payment terms (days)", business_owner: "Business owner",
  contract_owner: "Procurement owner", country: "Country / region",
};

export default function SalesforcePanel({
  onBack, config, setConfig, onCreateContract, milestones, contractId, canCreate,
}) {
  const [records, setRecords] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [conn, setConn] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [openRow, setOpenRow] = useState(null);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const { records: rows } = await listSuppliers(config);
      setRecords(rows);
    } catch (err) { setError(err.message); setRecords(null); }
    setLoading(false);
  };
  if (records === null && !loading && !error) load();

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      <Btn onClick={onBack} icon={ArrowRight} variant="ghost" style={{ transform: "scaleX(-1)" }} />
      <button type="button" className="btn btn-ghost" onClick={onBack} style={{ marginBottom: 4 }}>
        ← Back to CLM
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap",
        padding: "var(--space-3) 0 var(--space-4)", borderBottom: "2px solid var(--color-divider)",
        marginBottom: "var(--space-4)" }}>
        <Cloud size={20} />
        <h2 style={{ margin: 0 }}>Supplier onboarding</h2>
        <Tag outline>Salesforce CRM</Tag>
        <Tag c={config.mode === "live" ? RED : GRAY} style={{ fontSize: 10.5 }}>
          {config.mode === "live" ? "LIVE: calling a real org" : "Simulated: no network"}
        </Tag>
        <Btn small variant="ghost" icon={KeyRound} onClick={() => setShowSettings((s) => !s)} style={{ marginLeft: "auto" }}>
          Integration settings
        </Btn>
        <Btn small variant="ghost" icon={loading ? Loader2 : RefreshCw} spin={loading} onClick={load}>Refresh</Btn>
      </div>

      <p style={{ fontSize: 12.5, opacity: 0.7, margin: "0 0 var(--space-4)", lineHeight: 1.65, maxWidth: 900 }}>
        This is the CRM, not the CLM. Salesforce holds the supplier, the onboarding record and the commercial context;
        it is where a business user starts, and <strong>Create contract</strong> hands that context to CLM rather than
        asking anyone to retype it. CLM never writes back to any of these fields. It writes contract status and
        milestones, and nothing else. A supplier whose onboarding is incomplete cannot be contracted with at all, and
        the reason is shown rather than left to be guessed at.
      </p>

      {showSettings && (
        <div className="card" style={{ marginBottom: "var(--space-4)", gap: 10 }}>
          <div className="card-title" style={{ fontSize: 15 }}>Salesforce connection</div>
          <div className="clm-grid-2">
            <Field label="Mode">
              <select className="input" value={config.mode} onChange={(e) => { setConfig((c) => ({ ...c, mode: e.target.value })); setRecords(null); }}>
                <option value="simulated">Simulated, no org needed</option>
                <option value="live">Live, call a Salesforce org</option>
              </select>
            </Field>
            <Field label="Instance URL" hint="/salesforce is proxied by Vite in dev. A Developer Edition org looks like https://yourorg-dev-ed.develop.my.salesforce.com">
              <input className="input" value={config.instanceUrl} onChange={(e) => setConfig((c) => ({ ...c, instanceUrl: e.target.value }))} />
            </Field>
          </div>
          <Field label="Access token" hint="A session token from your org. Held in this tab's memory only, never stored. In production this call belongs on a server, not in a browser.">
            <input className="input" type="password" value={config.accessToken} placeholder="00D…"
              onChange={(e) => setConfig((c) => ({ ...c, accessToken: e.target.value }))} />
          </Field>
          <div className="clm-grid-2">
            <Field label="API version"><input className="input" value={config.apiVersion} onChange={(e) => setConfig((c) => ({ ...c, apiVersion: e.target.value }))} /></Field>
            <Field label="Supplier object" hint="Blueprint §14 lists the exact object model as still to be validated, so it is settings rather than code.">
              <input className="input" value={config.supplierObject} onChange={(e) => setConfig((c) => ({ ...c, supplierObject: e.target.value }))} />
            </Field>
          </div>
          <div className="clm-grid-2">
            <Field label="Contract status field"><input className="input" value={config.contractStatusField} onChange={(e) => setConfig((c) => ({ ...c, contractStatusField: e.target.value }))} /></Field>
            <Field label="Contract ID field"><input className="input" value={config.contractIdField} onChange={(e) => setConfig((c) => ({ ...c, contractIdField: e.target.value }))} /></Field>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Btn small variant="secondary" onClick={async () => {
              try { setConn((await testConnection(config)).detail); } catch (err) { setConn(err.message); }
            }}>Test connection</Btn>
            {conn && <span style={{ fontSize: 11.5, opacity: 0.7 }}>{conn}</span>}
          </div>
          {config.mode === "live" && (
            <div style={{ background: "#fdf1da", border: "1px solid #f5dfa8", color: "#7a4a05", padding: 10, fontSize: 12, lineHeight: 1.6 }}>
              <strong>Two things a browser cannot do.</strong> Salesforce will not accept a cross-origin call from an
              unlisted origin, so add yours under Setup → CORS, and a token in a browser tab is readable by anyone with
              the tab. Both are why the production shape of this is a server-side connector holding the credential. The
              dev proxy is enough to prove the integration against your own Developer Edition org, and not enough to ship.
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="card" style={{ marginBottom: "var(--space-4)", borderColor: "var(--color-accent)" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <ShieldAlert size={16} style={{ flex: "none", marginTop: 1 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Could not read the org</div>
              <p style={{ margin: "4px 0 0", fontSize: 12, opacity: 0.75, lineHeight: 1.6 }}>{error}</p>
            </div>
          </div>
        </div>
      )}

      <div className="clm-envelope-grid">
        <div style={{ display: "grid", gap: "var(--space-3)" }}>
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
          {records && records.length === 0 && <p style={{ fontSize: 12.5, opacity: 0.6 }}>No supplier records returned.</p>}
        </div>

        <div className="card" style={{ gap: 8, alignSelf: "start" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div className="card-title" style={{ margin: 0, fontSize: 15 }}>Contract status in Salesforce</div>
            <Tag c={GRAY} style={{ fontSize: 10, marginLeft: "auto" }}>{milestones.length} pushed</Tag>
          </div>
          <p style={{ fontSize: 11.5, opacity: 0.6, margin: 0, lineHeight: 1.6 }}>
            §11: "Salesforce reflects contract status and key lifecycle milestones." Every lifecycle transition writes
            the contract id and status onto the supplier record. Two fields, and nothing else: the CRM owns the
            supplier, so CLM has no business editing anything about them.
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
          {milestones.slice().reverse().map((m, i) => (
            <div key={i} style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 7, fontSize: 12 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                <strong>{m.status}</strong>
                <Tag c={m.simulated ? GRAY : GREEN} style={{ fontSize: 9.5 }}>{m.simulated ? "simulated" : "written"}</Tag>
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
