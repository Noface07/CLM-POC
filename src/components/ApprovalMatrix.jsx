import { useState } from "react";
import { ShieldCheck, RotateCcw, Lock, X } from "lucide-react";
import { Tag, Btn, GREEN, AMBER, GRAY, kicker } from "../lib/ui.jsx";
import { DEFAULT_APPROVAL_MATRIX, APPROVER_POOL, ROUTE_DESKS, formatMoney } from "../data/contracts.js";

export default function ApprovalMatrix({ open, onClose, matrix, onChange, role, contractValue }) {
  const canEdit = role === "System Administrator";
  const [dirty, setDirty] = useState(false);
  if (!open) return null;

  const set = (changeType, field, value) => {
    onChange(matrix.map((r) => (r.changeType === changeType ? { ...r, [field]: value } : r)));
    setDirty(true);
  };

  return (
    <div className="clm-drawer-backdrop" onClick={onClose}>
      <div className="clm-drawer" style={{ overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "var(--space-2)", flexWrap: "wrap" }}>
          <ShieldCheck size={18} />
          <h2 style={{ margin: 0 }}>Approval matrix</h2>
          {canEdit
            ? <Tag c={AMBER} style={{ fontSize: 10.5 }}>editable: you are the System Administrator</Tag>
            : <Tag c={GRAY} style={{ fontSize: 10.5 }}><Lock size={9} style={{ verticalAlign: -1 }} /> read-only for {role}</Tag>}
          <Btn onClick={onClose} icon={X} variant="ghost" small style={{ marginLeft: "auto" }}>Close</Btn>
        </div>

        <p style={{ fontSize: 12.5, opacity: 0.7, margin: "0 0 var(--space-4)", lineHeight: 1.65, maxWidth: 760 }}>
          The delegation of authority, as the system applies it. Every exception raised against the clause playbook is
          routed by this table: which desk can clear it, who it escalates to when it lands past the walk-away line, and
          the contract value above which it stops being delegable at all. Changing a row changes the routing of every
          undecided exception immediately. It does not reopen decisions already taken, because an approval was valid
          under the rule in force when it was given.
        </p>

        <div style={{ overflowX: "auto" }}>
          <table className="clm-matrix">
            <thead>
              <tr>
                <th>Change type</th>
                <th>Decides</th>
                <th>Escalates to</th>
                <th>Always escalate above</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((r) => {
                const forced = r.autoEscalateAbove > 0 && contractValue > r.autoEscalateAbove;
                return (
                  <tr key={r.changeType}>
                    <td>
                      <strong>{r.changeType}</strong>
                      {forced && (
                        <div style={{ fontSize: 10.5, color: "var(--color-accent-700)", marginTop: 3 }}>
                          This contract is above the threshold: {r.escalateTo.role} only
                        </div>
                      )}
                    </td>
                    <td>
                      {canEdit ? (
                        <select className="input" value={r.decidedBy} onChange={(e) => set(r.changeType, "decidedBy", e.target.value)}>
                          {ROUTE_DESKS.map((x) => <option key={x}>{x}</option>)}
                        </select>
                      ) : r.decidedBy}
                    </td>
                    <td>
                      {canEdit ? (
                        <select
                          className="input" value={r.escalateTo.role}
                          onChange={(e) => set(r.changeType, "escalateTo",
                            APPROVER_POOL.find((a) => a.role === e.target.value) || r.escalateTo)}
                        >
                          {APPROVER_POOL.map((a) => <option key={a.role}>{a.role}</option>)}
                        </select>
                      ) : <>{r.escalateTo.role} <span style={{ opacity: 0.55 }}>· {r.escalateTo.name}</span></>}
                    </td>
                    <td>
                      {canEdit ? (
                        <input
                          className="input" type="number" min="0" step="50000" value={r.autoEscalateAbove}
                          onChange={(e) => set(r.changeType, "autoEscalateAbove", Math.max(0, Number(e.target.value) || 0))}
                        />
                      ) : (r.autoEscalateAbove > 0 ? formatMoney(r.autoEscalateAbove) : "-")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {canEdit && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: "var(--space-4)", flexWrap: "wrap" }}>
            <Btn onClick={() => { onChange(DEFAULT_APPROVAL_MATRIX); setDirty(true); }} icon={RotateCcw} variant="secondary" small>
              Reset to the shipped policy
            </Btn>
            {dirty && <Tag c={GREEN} style={{ fontSize: 10.5 }}>Saved, routing is live</Tag>}
          </div>
        )}

        {!canEdit && (
          <p style={{ fontSize: 11.5, opacity: 0.6, margin: "var(--space-4) 0 0", lineHeight: 1.6 }}>
            Switch the role selector to System Administrator to edit this. Separating who approves work from who sets
            the rule about who approves work is the point of having the table at all. An approver who can widen their
            own authority has not been given a limit, only a suggestion.
          </p>
        )}

        <div style={{ marginTop: "var(--space-5)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--color-divider)" }}>
          <div style={{ ...kicker, marginBottom: 6 }}>How this interacts with the clause playbook</div>
          <p style={{ fontSize: 12, opacity: 0.7, margin: 0, lineHeight: 1.65, maxWidth: 760 }}>
            The playbook decides <em>how bad</em> a change is (standard, fallback, or past walk-away) from the wording
            itself. This table decides <em>who acts on that</em>. They are deliberately separate: the playbook is a
            legal position and changes when the business's risk appetite changes; the matrix is an org chart and
            changes when people do. Wiring them together would mean a reorganisation quietly editing the company's
            negotiating position.
          </p>
        </div>
      </div>
    </div>
  );
}
