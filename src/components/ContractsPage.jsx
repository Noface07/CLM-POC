import { Plus, ShieldCheck, Infinity as InfinityIcon, FileSignature } from "lucide-react";
import { Tag, Btn, statusColor, GRAY, AMBER, RED, GREEN, formatDate } from "../lib/ui.jsx";
import { contractVisibility, seesEveryContract } from "../lib/rbac.js";
import { formatMoney } from "../data/contracts.js";

const RISK_TONE = { high: RED, medium: AMBER, low: GREEN };

export default function ContractsPage({
  role, contracts, allContracts, onOpen, onDraft, onQuickAdd, canCreate,
  filters, setFilters,
}) {
  const hidden = allContracts.length - contracts.length;

  const statusOptions = ["All", ...Array.from(new Set(contracts.map((c) => c.status)))];
  const supplierOptions = ["All", ...Array.from(new Set(contracts.map((c) => c.supplier)))];
  const categoryOptions = ["All", ...Array.from(new Set(contracts.map((c) => c.category)))];

  const filtered = contracts.filter((c) =>
    (filters.status === "All" || c.status === filters.status)
    && (filters.supplier === "All" || c.supplier === filters.supplier)
    && (filters.category === "All" || c.category === filters.category)
    && (filters.term === "All"
      || (filters.term === "Evergreen" && c.evergreen)
      || (filters.term === "Fixed term" && !c.evergreen))
  );
  const active = filters.status !== "All" || filters.supplier !== "All" || filters.category !== "All" || filters.term !== "All";

  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "var(--space-4)", marginBottom: "var(--space-4)", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Contracts</h1>
          <p style={{ margin: 0, opacity: 0.65, fontSize: 14 }}>
            Supplier agreements across procurement, legal and facilities.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn onClick={onQuickAdd} icon={Plus} variant="secondary" disabled={!canCreate}>Quick add</Btn>
          <Btn onClick={onDraft} icon={FileSignature} variant="primary" disabled={!canCreate}>Draft a contract</Btn>
        </div>
      </div>

      <div className="clm-readonly-banner" style={{ marginBottom: "var(--space-4)" }}>
        <ShieldCheck size={15} />
        {seesEveryContract(role) ? (
          <span>
            <strong>{role}</strong> sees every contract in the estate
            {role === "Auditor (read-only)" && ", read-only, including the audit trail"}.
          </span>
        ) : (
          <span>
            Showing the <strong>{contracts.length}</strong> contract{contracts.length === 1 ? "" : "s"} routed to{" "}
            <strong>{role}</strong>
            {hidden > 0 && <>. {hidden} other{hidden === 1 ? "" : "s"} exist and are not shown: routing, not search, decides that</>}.
          </span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", gap: "var(--space-4)", padding: "var(--space-3) 0",
        borderBottom: "2px solid var(--color-divider)", marginBottom: "var(--space-2)", flexWrap: "wrap" }}>
        <div className="field" style={{ minWidth: 150, margin: 0 }}><label>Status</label>
          <select className="input" aria-label="Filter by status" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
            {statusOptions.map((o) => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div className="field" style={{ minWidth: 190, margin: 0 }}><label>Supplier</label>
          <select className="input" aria-label="Filter by supplier" value={filters.supplier} onChange={(e) => setFilters((f) => ({ ...f, supplier: e.target.value }))}>
            {supplierOptions.map((o) => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div className="field" style={{ minWidth: 160, margin: 0 }}><label>Service category</label>
          <select className="input" aria-label="Filter by service category" value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}>
            {categoryOptions.map((o) => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div className="field" style={{ minWidth: 140, margin: 0 }}><label>Term</label>
          <select className="input" aria-label="Filter by term" value={filters.term} onChange={(e) => setFilters((f) => ({ ...f, term: e.target.value }))}>
            {["All", "Fixed term", "Evergreen"].map((o) => <option key={o}>{o}</option>)}
          </select>
        </div>
        {active && (
          <Btn
            onClick={() => setFilters({ status: "All", supplier: "All", category: "All", term: "All" })}
            variant="ghost" style={{ marginBottom: 1 }}
          >Clear filters</Btn>
        )}
        <span style={{ marginLeft: "auto", fontSize: 12, opacity: 0.55, paddingBottom: 9 }}>
          {filtered.length} of {contracts.length} visible
        </span>
      </div>

      <div className="table-scroll">
      <table className="table">
        <thead>
          <tr>
            <th>Contract</th><th>Supplier</th><th>Agreement type</th><th>Risk</th><th>Status</th>
            <th style={{ textAlign: "right" }}>Annual value</th><th>End date</th><th>Why you can see it</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((c) => (
            // The row stays clickable because that is how a table of contracts is used
            // with a mouse. The control that opens it is the button in the first cell:
            // a row is not a control, so a keyboard never reaches one, and opening a
            // contract is the only thing this page is for.
            <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => onOpen(c)}>
              <td style={{ fontWeight: 600 }}>
                <button
                  type="button" className="clm-row-open"
                  aria-label={`Open ${c.id}, ${c.supplier}`}
                  onClick={(e) => { e.stopPropagation(); onOpen(c); }}
                >{c.id}</button>
                {c.live && <Tag c={GREEN} style={{ fontSize: 9.5, marginLeft: 6 }}>Live workspace</Tag>}
              </td>
              <td>{c.supplier}</td>
              <td>
                {c.agreementType}
                <div className="text-muted" style={{ fontSize: 11, marginTop: 1 }}>{c.family}</div>
              </td>
              <td><Tag c={RISK_TONE[c.riskLevel] || GRAY} style={{ fontSize: 10 }}>{c.riskLevel}</Tag></td>
              <td><Tag c={statusColor(c.status)}>{c.status}</Tag></td>
              <td style={{ textAlign: "right" }}>{formatMoney(c.value, c.currency)}</td>
              <td className="text-muted">
                {c.evergreen ? (
                  <span
                    style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                    title={c.evergreenNote || "No expiry date. Runs until terminated on notice."}
                  >
                    <InfinityIcon size={13} /> Evergreen
                  </span>
                ) : formatDate(c.endDate)}
              </td>
              <td className="text-muted" style={{ fontSize: 11.5 }}>{contractVisibility(role, c).why}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {filtered.length === 0 && (
        <p style={{ textAlign: "center", opacity: 0.55, padding: "var(--space-8) 0", fontSize: 14 }}>
          {contracts.length === 0
            ? `No contracts are routed to ${role}. This is an access result, not an empty estate: ${allContracts.length} contracts exist.`
            : "No contracts match these filters."}
        </p>
      )}
    </>
  );
}
