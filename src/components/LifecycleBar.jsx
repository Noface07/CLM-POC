export const LIFECYCLE_STAGES = [
  { key: "draft",       label: "Draft",       hint: "Assembled from a template, not yet reviewed" },
  { key: "review",      label: "Review",      hint: "Internal approvals: owner, contract management, Legal" },
  { key: "negotiation", label: "Negotiation", hint: "Redline exchange with the counterparty" },
  { key: "approved",    label: "Approved",    hint: "All exceptions decided, ready to send for signature" },
  { key: "signature",   label: "Signature",   hint: "Out for e-signature" },
  { key: "active",      label: "Active",      hint: "Executed and in force; obligations tracked" },
  { key: "renewal",     label: "Renewal / Expiry", hint: "Amendment, renewal, expiry or termination" },
];

export function stageForStatus(status) {
  switch (status) {
    case "Draft": return "draft";
    case "Drafting": return "draft";
    case "Internal Review": return "review";
    case "Rejected": return "review";
    case "Changes Requested": return "review";
    case "In Negotiation": return "negotiation";
    case "Exception Review": return "negotiation";
    case "Approved": return "approved";
    case "Ready for Signature": return "approved";
    case "Signature Pending": return "signature";
    case "Partially Signed": return "signature";
    case "Executed": return "active";
    case "Active": return "active";
    case "Amendment in Progress": return "renewal";
    case "Renewal in Progress": return "renewal";
    case "Expiring": return "renewal";
    case "Expired": return "renewal";
    case "Termination in Progress": return "renewal";
    case "Terminated": return "renewal";
    default: return "draft";
  }
}

const NOTCH = 14;   // depth of the chevron point
const HEIGHT = 54;
const GAP = 3;

export default function LifecycleBar({ status, evergreen, onSelect, terminal }) {
  const currentKey = stageForStatus(status);
  const currentIndex = LIFECYCLE_STAGES.findIndex((s) => s.key === currentKey);

  const total = 1000;
  const width = (total - GAP * (LIFECYCLE_STAGES.length - 1)) / LIFECYCLE_STAGES.length;

  const stages = LIFECYCLE_STAGES.map((stage, i) => {
    // An evergreen contract does not expire, so the last stage is renewal review only.
    const label = evergreen && stage.key === "renewal" ? "Rolling review" : stage.label;
    const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "ahead";
    return { ...stage, label, state, index: i };
  });

  return (
    <div className="clm-lifecycle" style={{ marginBottom: "var(--space-6)" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.55 }}>
          Contract lifecycle
        </div>
        {evergreen && (
          <span className="tag" style={{ background: "var(--color-neutral-100)", color: "var(--color-neutral-800)", fontSize: 10.5 }}>
            Evergreen, no expiry stage
          </span>
        )}
        {terminal && (
          <span className="tag" style={{ background: "var(--color-accent-100)", color: "var(--color-accent-800)", fontSize: 10.5 }}>
            {terminal}
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${total} ${HEIGHT}`} width="100%" height={HEIGHT}
        role="img" aria-label={`Contract lifecycle, currently at ${stages[currentIndex]?.label || "Draft"}`}
        style={{ display: "block", overflow: "visible" }}
      >
        {stages.map((stage) => {
          const x = stage.index * (width + GAP);
          const first = stage.index === 0;
          const last = stage.index === stages.length - 1;
          const points = [
            `${x},0`,
            `${x + width - (last ? 0 : NOTCH)},0`,
            last ? `${x + width},0` : `${x + width},${HEIGHT / 2}`,
            `${x + width - (last ? 0 : NOTCH)},${HEIGHT}`,
            `${x},${HEIGHT}`,
            first ? `${x},0` : `${x + NOTCH},${HEIGHT / 2}`,
          ].join(" ");

          const fill = stage.state === "done" ? "var(--color-accent-300)"
            : stage.state === "current" ? "var(--color-accent)"
            : "var(--color-neutral-200)";
          const text = stage.state === "current" ? "var(--color-bg)" : "var(--color-text)";
          const labelX = x + width / 2 + (first ? 0 : NOTCH / 2) - (last ? 0 : NOTCH / 2);

          return (
            <g
              key={stage.key}
              onClick={onSelect ? () => onSelect(stage.key) : undefined}
              style={onSelect ? { cursor: "pointer" } : undefined}
            >
              <title>{`${stage.label}: ${stage.hint}`}</title>
              <polygon points={points} fill={fill} stroke="var(--color-bg)" strokeWidth="1" />
              <text
                x={labelX} y={HEIGHT / 2 + 1}
                textAnchor="middle" dominantBaseline="middle"
                fontFamily="var(--font-heading)" fontWeight="800" fontSize="14.5"
                fill={text} opacity={stage.state === "ahead" ? 0.5 : 1}
              >
                {stage.label}
              </text>
            </g>
          );
        })}
      </svg>

      <p style={{ fontSize: 12, opacity: 0.6, margin: "8px 0 0" }}>
        {stages[currentIndex]?.hint || ""}
      </p>
    </div>
  );
}
