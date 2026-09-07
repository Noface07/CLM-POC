import { Tag, Btn, GREEN, AMBER, formatDate } from "../lib/ui.jsx";
import { FileDiff, Check } from "lucide-react";

export const AMENDMENT_STAGES = [
  { key: "draft", label: "Drafted", hint: "Scope and effective date set. Nothing is agreed yet." },
  { key: "review", label: "Internal review", hint: "Legal has read the change, not just the reason for it." },
  { key: "with_supplier", label: "With supplier", hint: "Sent for agreement. They can accept or come back on it." },
  { key: "signed", label: "Signed", hint: "Executed by both parties as its own instrument." },
  { key: "attached", label: "Attached", hint: "Linked to the parent, which moves to a new version." },
];

const NEXT_ACTION = {
  draft: { label: "Send for internal review", to: "review" },
  review: { label: "Approve and send to supplier", to: "with_supplier" },
  with_supplier: { label: "Supplier agrees: execute", to: "signed" },
  signed: { label: "Attach to the parent contract", to: "attached" },
};

export default function AmendmentTrack({ amendment, parentId, parentVersion, canManage, onAdvance, onCreate }) {
  if (!amendment) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12.5, opacity: 0.75 }}>None. The signed text is the current text.</span>
        {canManage && <Btn onClick={onCreate} variant="secondary" small>Create amendment</Btn>}
      </div>
    );
  }

  const index = AMENDMENT_STAGES.findIndex((s) => s.key === amendment.stage);
  const next = NEXT_ACTION[amendment.stage];
  const stage = AMENDMENT_STAGES[index];

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <FileDiff size={13} />
        <strong style={{ fontSize: 13 }}>{amendment.id}</strong>
        <span style={{ fontSize: 12.5, opacity: 0.8 }}>{amendment.reason}</span>
        <span style={{ fontSize: 11.5, opacity: 0.6 }}>effective {formatDate(amendment.effectiveDate)}</span>
        <Tag c={amendment.stage === "attached" ? GREEN : AMBER} style={{ fontSize: 10, marginLeft: "auto" }}>
          {stage?.label}
        </Tag>
      </div>

      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
        {AMENDMENT_STAGES.map((s, i) => {
          const done = i < index;
          const here = i === index;
          return (
            <span
              key={s.key}
              title={s.hint}
              style={{
                flex: "1 1 92px", minWidth: 92, padding: "5px 8px", fontSize: 10.5, lineHeight: 1.3,
                textAlign: "center",
                background: here ? "var(--color-accent)" : done ? "var(--color-accent-300)" : "var(--color-neutral-200)",
                color: here ? "var(--color-bg)" : "var(--color-text)",
                opacity: i > index ? 0.55 : 1,
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
              }}
            >
              {done && <Check size={10} />}{s.label}
            </span>
          );
        })}
      </div>

      <p style={{ margin: 0, fontSize: 12, opacity: 0.7, lineHeight: 1.55 }}>{stage?.hint}</p>

      {amendment.stage === "attached" ? (
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6 }}>
          Attached to {parentId}, which is now <strong>{parentVersion}</strong>. The amendment stays a separate signed
          instrument: the parent references it rather than absorbing it, so the chain of what changed and when
          survives.
        </p>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {canManage && next && (
            <Btn onClick={() => onAdvance(next.to)} variant="secondary" small>{next.label}</Btn>
          )}
          <span style={{ fontSize: 11.5, opacity: 0.65 }}>
            {parentId} stays at <strong>{parentVersion}</strong> until the amendment is signed and attached.
          </span>
        </div>
      )}
    </div>
  );
}
