import { ChevronRight, MessageSquare, Link2, AlertTriangle } from "lucide-react";
import { Tag, Btn, materialityColor, bandColor, GREEN, AMBER, RED, GRAY } from "../lib/ui.jsx";

const DECISION_LABEL = {
  "Accept Exception": { label: "Accepted", tone: GREEN },
  Reject: { label: "Rejected", tone: GRAY },
  "Request Supplier Revision": { label: "Revision requested", tone: AMBER },
  Escalate: { label: "Escalated", tone: RED },
};

const BAND_SHORT = {
  standard: "At standard",
  fallback: "Fallback",
  walkAway: "Walk-away",
  unknown: "Unplaced",
};

export default function Finding({
  finding, decision, assessment, canAct, readOnly, route,
  comments = [], onDecide, onOpenDialog,
}) {
  const outcome = decision ? DECISION_LABEL[decision.action] : null;
  const band = assessment ? assessment.position : null;
  const openComments = comments.filter((c) => !c.resolved).length;
  const affects = finding.affects || [];

  return (
    <div style={{ borderTop: "1px solid var(--color-divider)", paddingBottom: "var(--space-3)" }}>
      <button
        type="button" onClick={() => onOpenDialog(finding.__index)}
        title="Open the full detail"
        style={{
          display: "block", width: "100%", textAlign: "left", background: "none", border: "none",
          font: "inherit", color: "inherit", cursor: "pointer", padding: "var(--space-3) 0 8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 14, flex: 1, minWidth: 0 }}>
            {finding.clause}
          </span>
          {outcome
            ? <Tag c={outcome.tone} style={{ fontSize: 10, flex: "none" }}>{outcome.label}</Tag>
            : <Tag c={materialityColor(finding.materiality)} style={{ flex: "none" }}>{finding.materiality}</Tag>}
          <ChevronRight size={14} style={{ flex: "none", opacity: 0.45 }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", margin: "5px 0 0" }}>
          {band && <Tag c={bandColor(band)} style={{ fontSize: 10 }}>{BAND_SHORT[band]}</Tag>}
          {!assessment && <Tag c={GRAY} style={{ fontSize: 10 }}>No playbook position</Tag>}
          <span style={{ fontSize: 11, opacity: 0.55 }}>{finding.changeType} → {route}</span>
          {openComments > 0 && (
            <span style={{ fontSize: 11, opacity: 0.6, display: "inline-flex", alignItems: "center", gap: 3 }}>
              <MessageSquare size={11} />{openComments}
            </span>
          )}
          {affects.length > 0 && (
            <span
              style={{ fontSize: 11, color: "var(--color-accent-700)", display: "inline-flex", alignItems: "center", gap: 3 }}
              title={`Also moves the meaning of clause ${affects.join(", ")}`}
            >
              <Link2 size={11} />affects {affects.join(", ")}
            </span>
          )}
          {assessment?.redFlags?.length > 0 && (
            <span style={{ fontSize: 11, color: "var(--color-accent-700)", display: "inline-flex", alignItems: "center", gap: 3 }}>
              <AlertTriangle size={11} />red flag
            </span>
          )}
        </div>

        <p style={{ margin: "6px 0 0", fontSize: 12, opacity: 0.7, lineHeight: 1.5 }}>
          {decision
            ? (decision.note || decision.reason || "Decided. Open for the detail.")
            : (assessment?.verdict || finding.impact)}
        </p>

      </button>

      {!decision && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Btn onClick={() => onDecide(finding.__index, "Accept Exception")} variant="secondary" small disabled={!canAct}>
            Accept
          </Btn>
          <Btn onClick={() => onOpenDialog(finding.__index)} variant="ghost" small>
            Read the detail and decide
          </Btn>
          {!canAct && (
            <span style={{ fontSize: 10.5, opacity: 0.45 }}>
              {readOnly ? "Read-only" : "Not routed to your role"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
