import { useState } from "react";
import { Download, ShieldCheck, AlertTriangle } from "lucide-react";
import { Tag, Btn, Field, AMBER } from "../lib/ui.jsx";
import { downloadBlob } from "../lib/zip.js";
import {
  newestFirst, filterEntries, rolesIn, contractsIn, actorLabel,
  formatAuditTime, auditCsvBlob, UNSCOPED,
} from "../lib/audit.js";

// The audit trail as its own page, because the role that exists to read it needs
// somewhere to read it.
//
// It was a collapsed panel inside one contract's workspace, which is the wrong shape
// twice over: an auditor asking "what has anyone done today" cannot get there by opening
// a contract, and the trail spans the estate rather than a contract. Filters are on
// actor and contract because those are the two questions asked of a trail, and the export
// is there because the answer normally has to leave the system to be any use.
export default function AuditPage({ auditLog, role }) {
  const [filters, setFilters] = useState({ role: "All", contractId: "All", query: "" });

  const rows = newestFirst(filterEntries(auditLog, filters));
  const roles = rolesIn(auditLog);
  const contracts = contractsIn(auditLog);
  const demoControlCount = auditLog.filter((e) => e.demoControl).length;
  const active = filters.role !== "All" || filters.contractId !== "All" || filters.query.trim() !== "";

  // A dropdown with one option is not a filter, it is a label that looks like a control.
  // In a single-contract session there is nothing to choose between, so it is not shown.
  const showRoleFilter = roles.length > 1;
  const showContractFilter = contracts.length > 1;

  function exportCsv() {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(auditCsvBlob(newestFirst(auditLog)), `audit-trail-${stamp}.csv`);
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "var(--space-4)", marginBottom: "var(--space-4)", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Audit trail</h1>
          <p style={{ margin: 0, opacity: 0.65, fontSize: 14 }}>
            Every approval, tracked-change decision, exception decision, signature and lifecycle event, with the
            role that took it and the contract it was taken against.
          </p>
        </div>
        <Btn onClick={exportCsv} icon={Download} variant="secondary" disabled={auditLog.length === 0}>
          Export CSV
        </Btn>
      </div>

      <div className="clm-readonly-banner" style={{ marginBottom: "var(--space-4)" }}>
        <ShieldCheck size={15} />
        <span>
          <strong>{role}</strong> reads the trail and writes nothing to it. Entries are appended by the actions
          themselves and there is no control anywhere that edits or deletes one.
        </span>
      </div>

      {demoControlCount > 0 && (
        <div className="clm-readonly-banner" style={{ marginBottom: "var(--space-4)", background: AMBER.bg, color: AMBER.color, borderColor: "#f5dfa8" }}>
          <AlertTriangle size={15} />
          <span>
            <strong>{demoControlCount}</strong> of {auditLog.length} entries were taken under{" "}
            <strong>All Access (Demo Control)</strong>, which is not a product role. A real trail attributes
            every action to a person; these are attributable only to whoever was driving the demo, and the trail
            says so rather than presenting them as someone's.
          </span>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "flex-end", gap: "var(--space-4)", padding: "var(--space-3) 0",
        borderBottom: "2px solid var(--color-divider)", marginBottom: "var(--space-2)", flexWrap: "wrap" }}>
        <Field label="Search" style={{ minWidth: 220 }}>
          <input
            className="input" type="search" value={filters.query} aria-label="Search the audit trail"
            placeholder="Clause, supplier, action…"
            onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
          />
        </Field>
        {showRoleFilter && (
          <Field label="Acting role" style={{ minWidth: 200 }}>
            <select
              className="input" value={filters.role} aria-label="Filter by acting role"
              onChange={(e) => setFilters((f) => ({ ...f, role: e.target.value }))}
            >
              {["All", ...roles].map((o) => <option key={o}>{o}</option>)}
            </select>
          </Field>
        )}
        {showContractFilter && (
          <Field label="Contract" style={{ minWidth: 170 }}>
            <select
              className="input" value={filters.contractId} aria-label="Filter by contract"
              onChange={(e) => setFilters((f) => ({ ...f, contractId: e.target.value }))}
            >
              {["All", ...contracts].map((o) => <option key={o}>{o}</option>)}
            </select>
          </Field>
        )}
        {active && (
          <Btn onClick={() => setFilters({ role: "All", contractId: "All", query: "" })} variant="ghost" style={{ marginBottom: 1 }}>
            Clear filters
          </Btn>
        )}
        <span style={{ marginLeft: "auto", fontSize: 12, opacity: 0.55, paddingBottom: 9 }}>
          {rows.length} of {auditLog.length} events
        </span>
      </div>

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th style={{ whiteSpace: "nowrap" }}>When</th>
              <th>Actor</th>
              <th>Contract</th>
              <th>Event</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e, i) => (
              <tr key={`${e.at}-${i}`}>
                <td className="text-muted" style={{ fontSize: 11.5, whiteSpace: "nowrap", verticalAlign: "top" }}>
                  <time dateTime={e.at}>{formatAuditTime(e.at)}</time>
                </td>
                <td style={{ fontSize: 12.5, verticalAlign: "top" }}>
                  {actorLabel(e)}
                  {e.demoControl && <Tag c={AMBER} style={{ fontSize: 9.5, marginLeft: 6 }}>demo control</Tag>}
                </td>
                <td className="text-muted" style={{ fontSize: 12, verticalAlign: "top", whiteSpace: "nowrap" }}>
                  {e.contractId || <span style={{ fontStyle: "italic", opacity: 0.7 }} title="Taken before any contract existed, so it belongs to no contract's trail">{UNSCOPED}</span>}
                </td>
                <td style={{ fontSize: 12.5, verticalAlign: "top" }}>{e.event}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <p style={{ textAlign: "center", opacity: 0.55, padding: "var(--space-8) 0", fontSize: 14 }}>
          {auditLog.length === 0
            ? "Nothing has happened yet. Draft a contract and every action from there appears here."
            : "No events match these filters."}
        </p>
      )}
    </>
  );
}
