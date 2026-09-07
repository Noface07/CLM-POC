import { useState } from "react";
import {
  X, MessageSquare, CornerDownRight, Link2, AlertTriangle, BookOpen, ArrowRight,
} from "lucide-react";
import {
  Tag, Btn, Field, materialityColor, bandColor, GREEN, AMBER, RED, GRAY, kicker,
} from "../lib/ui.jsx";
import { BandStrip } from "./Playbook.jsx";

const BAND_SHORT = {
  standard: "At standard", fallback: "Inside fallback", walkAway: "Past walk-away", unknown: "Band cannot place",
};

export default function ExceptionDialog({
  finding, decision, assessment, canAct, readOnly, route, approver,
  comments = [], crossRef, revisionSubmitted,
  contractId, supplierName,
  onClose, onDecide, onOpenPlaybook, onResolveEscalation, onReply, onResolveComment, flash,
}) {
  const [reason, setReason] = useState("");
  if (!finding) return null;

  const needsReason = (action) => {
    if (reason.trim()) return true;
    flash?.(`Add a reason before you ${action}.`);
    return false;
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-3)" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
              <Tag c={materialityColor(finding.materiality)}>{finding.materiality} materiality</Tag>
              {assessment && <Tag c={bandColor(assessment.position)}>{BAND_SHORT[assessment.position]}</Tag>}
              {!assessment && <Tag c={GRAY}>No playbook position</Tag>}
              <Tag c={GRAY} style={{ fontSize: 10.5 }}>{finding.changeType} → {route}</Tag>
            </div>
            <div className="dialog-title">{finding.clause}</div>
            <p style={{ margin: "2px 0 0", fontSize: 12, opacity: 0.55 }}>{contractId} · {supplierName}</p>
          </div>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ border: "1px dashed var(--color-accent-300)", padding: "10px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
            <Tag outline style={{ fontSize: 9.5 }}>AI</Tag>
            <span style={{ ...kicker, margin: 0 }}>What changed, and why it matters</span>
            <span style={{ fontSize: 10.5, opacity: 0.5, marginLeft: "auto" }}>{finding.confidence} confidence</span>
          </div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{finding.impact}</p>
        </div>

        {finding.previous && finding.proposed && (
          <div className="clm-grid-2">
            <div>
              <div style={{ ...kicker, marginBottom: 6 }}>Our wording</div>
              <div
                className="clm-force-ink"
                style={{ background: "var(--color-neutral-100)", border: "1px solid var(--color-divider)",
                  padding: "var(--space-3)", fontSize: 12.5, lineHeight: 1.6, color: "#201e1d", minHeight: 100 }}
              >{finding.previous}</div>
            </div>
            <div>
              <div style={{ ...kicker, marginBottom: 6 }}>{supplierName} proposed</div>
              <div
                className="clm-force-ink"
                style={{ background: "var(--color-accent-100)", border: "1px solid var(--color-accent-300)",
                  padding: "var(--space-3)", fontSize: 12.5, lineHeight: 1.6, color: "#201e1d", minHeight: 100 }}
              >{finding.proposed}</div>
            </div>
          </div>
        )}

        {assessment ? (
          <div style={{ border: `1px solid ${bandColor(assessment.position).color}`,
            background: bandColor(assessment.position).bg, padding: "10px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
              <Tag c={bandColor(assessment.position)} style={{ fontSize: 10 }}>Playbook</Tag>
              <span style={{ fontSize: 11.5, opacity: 0.7 }}>{assessment.clause.name}</span>
              <span style={{ fontSize: 10.5, opacity: 0.5, marginLeft: "auto" }}>matched on {assessment.matchedBy}</span>
            </div>
            <p style={{ margin: "0 0 4px", fontSize: 13.5, fontWeight: 600, lineHeight: 1.45 }}>{assessment.verdict}</p>
            <p style={{ margin: "0 0 10px", fontSize: 12, opacity: 0.8, lineHeight: 1.5 }}>{assessment.bandReason}</p>

            <BandStrip clause={assessment.clause} position={assessment.position} />

            {assessment.action && (
              <p style={{ margin: "10px 0 0", fontSize: 12.5, lineHeight: 1.6 }}>
                <strong>What to do: </strong>{assessment.action}
              </p>
            )}
            {assessment.redFlags.length > 0 && (
              <div style={{ marginTop: 10, borderTop: "1px solid color-mix(in srgb, var(--color-text) 15%, transparent)", paddingTop: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                  <AlertTriangle size={13} />
                  <span style={{ ...kicker, margin: 0 }}>
                    Red flag{assessment.redFlags.length > 1 ? "s" : ""} in the proposed wording
                  </span>
                </div>
                {assessment.redFlags.map((flag, i) => (
                  <p key={i} style={{ margin: "0 0 4px", fontSize: 12, lineHeight: 1.5 }}>{flag}</p>
                ))}
                {assessment.overriddenByRedFlag && (
                  <p style={{ margin: "4px 0 0", fontSize: 11.5, fontStyle: "italic", opacity: 0.8 }}>
                    The number is inside the band; the wording is not. The wording is what binds, so this escalates anyway.
                  </p>
                )}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {assessment.mayApprove && (
                <span style={{ fontSize: 11.5, opacity: 0.75 }}>
                  Approval sits with <strong>{assessment.mayApprove}</strong>.
                </span>
              )}
              <Btn small variant="ghost" icon={BookOpen} onClick={() => onOpenPlaybook(assessment.clause.code)}>
                Read this clause in the playbook
              </Btn>
            </div>
          </div>
        ) : (
          <div style={{ border: "1px dashed var(--color-divider)", background: "var(--color-neutral-100)", padding: "10px 12px" }}>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55 }}>
              No playbook clause matches this finding, so there is no band to place it in and no approval route to
              suggest. It goes to a human on its own merits rather than being routed on a guess.
            </p>
          </div>
        )}

        {crossRef && crossRef.total > 0 && (
          <div style={{ border: "1px solid var(--color-divider)", padding: "10px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
              <Link2 size={12} />
              <span style={{ ...kicker, margin: 0 }}>Clauses that read with this one</span>
            </div>
            {crossRef.outbound.map((r) => (
              <div key={`o${r.ref}`} style={{ marginBottom: 6 }}>
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>
                  <ArrowRight size={11} style={{ verticalAlign: "-1px", marginRight: 4, opacity: 0.6 }} />
                  <strong>{finding.clauseRef} relies on {r.ref}</strong> {r.heading}
                </p>
                <p style={{ margin: "2px 0 0 16px", fontSize: 11.5, opacity: 0.7, lineHeight: 1.5 }}>{r.text}</p>
              </div>
            ))}
            {crossRef.inbound.map((r) => {
              const silent = (finding.affects || []).includes(r.ref);
              return (
                <div key={`i${r.ref}`} style={{ marginBottom: 6 }}>
                  <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: silent ? "var(--color-accent-700)" : undefined }}>
                    <ArrowRight size={11} style={{ verticalAlign: "-1px", marginRight: 4, opacity: 0.6, transform: "rotate(180deg)" }} />
                    <strong>{r.ref} relies on {finding.clauseRef}</strong> {r.heading}
                    {silent ? ", not edited, so its meaning moved without its text changing." : ", edited too."}
                  </p>
                  <p style={{ margin: "2px 0 0 16px", fontSize: 11.5, opacity: 0.7, lineHeight: 1.5 }}>{r.text}</p>
                </div>
              );
            })}
          </div>
        )}

        {comments.map((comment) => (
          <div key={comment.id} style={{ borderLeft: "3px solid var(--color-accent-2)",
            background: "var(--color-neutral-100)", padding: "10px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
              <MessageSquare size={12} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>{comment.author}</span>
              <span style={{ fontSize: 10.5, opacity: 0.5 }}>on clause {comment.anchor} · {comment.date}</span>
              {comment.resolved && <Tag c={GREEN} style={{ fontSize: 9, marginLeft: "auto" }}>Resolved</Tag>}
            </div>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, fontStyle: "italic" }}>"{comment.text}"</p>
            {(comment.replies || []).map((reply, ri) => (
              <p key={ri} style={{ margin: "6px 0 0", fontSize: 12, lineHeight: 1.5, paddingLeft: 12, opacity: 0.85 }}>
                <CornerDownRight size={11} style={{ marginRight: 4, verticalAlign: "-1px", opacity: 0.6 }} />
                <strong>{reply.author}:</strong> {reply.text}
              </p>
            ))}
            {!readOnly && !comment.resolved && (
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <Btn small variant="ghost" onClick={() => onReply?.(comment)}>Reply</Btn>
                <Btn small variant="ghost" onClick={() => onResolveComment?.(comment.id)}>Resolve thread</Btn>
              </div>
            )}
          </div>
        ))}

        {revisionSubmitted && !decision && (
          <p style={{ fontSize: 12, color: "var(--color-accent-700)", margin: 0 }}>
            The supplier has submitted a revised position on this clause. Re-review before deciding.
          </p>
        )}

        {decision ? (
          decision.action === "Escalate" ? (
            <div style={{ background: "var(--color-neutral-100)", border: "1px solid var(--color-divider)", padding: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                <Tag c={RED}>Escalated</Tag>
                <span style={{ fontSize: 12 }}>
                  to <strong>{assessment?.escalation || approver.role}</strong> ({approver.name}), blocking until resolved.
                </span>
              </div>
              {decision.reason && <p style={{ fontSize: 12, opacity: 0.7, margin: "0 0 8px" }}>"{decision.reason}"</p>}
              <p style={{ ...kicker, margin: "0 0 6px" }}>Acting as {approver.role} for this demo</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Btn onClick={() => onResolveEscalation(finding.__index, "approve")} variant="secondary" small disabled={readOnly}>
                  Approve: adopt supplier wording
                </Btn>
                <Btn onClick={() => onResolveEscalation(finding.__index, "uphold")} variant="ghost" small disabled={readOnly}>
                  Uphold: keep our wording
                </Btn>
              </div>
            </div>
          ) : (
            <div style={{ background: "var(--color-neutral-100)", border: "1px solid var(--color-divider)", padding: 10 }}>
              <Tag c={decision.action === "Accept Exception" ? GREEN : decision.action === "Reject" ? GRAY : AMBER}>
                {decision.action === "Accept Exception" ? "Accepted"
                  : decision.action === "Reject" ? "Rejected" : "Revision requested"}
              </Tag>
              {decision.reason && <p style={{ fontSize: 12, opacity: 0.7, margin: "6px 0 0" }}>"{decision.reason}"</p>}
              <p style={{ fontSize: 12, opacity: 0.7, margin: "6px 0 0", lineHeight: 1.55 }}>
                {decision.note
                  || (decision.action === "Accept Exception" ? "The tracked change has been accepted in the document."
                    : decision.action === "Reject" ? "Our original wording stands. The tracked change has been rejected in the document."
                    : "Sent to the supplier for a new proposal, blocking until they resubmit.")}
              </p>
            </div>
          )
        ) : (
          <>
            <Field label="Reason (required for Reject, Request revision, or Escalate)">
              <textarea
                className="input" value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Past our walk-away line on this clause, needs Head of Legal before we can accept."
              />
            </Field>
            <p style={{ fontSize: 11, opacity: 0.55, margin: "-4px 0 0", lineHeight: 1.55 }}>
              Accept → the tracked change is accepted in the document. Reject → the change is rejected and our wording
              stands. Request revision → blocks until the supplier resubmits. Escalate → blocks until{" "}
              {approver.name} decides.
            </p>
            <div className="dialog-actions">
              <Btn onClick={() => onDecide(finding.__index, "Accept Exception")} variant="primary" disabled={!canAct}>Accept exception</Btn>
              <Btn onClick={() => needsReason("reject") && onDecide(finding.__index, "Reject", reason.trim())} variant="secondary" disabled={!canAct}>Reject</Btn>
              <Btn onClick={() => needsReason("request a revision") && onDecide(finding.__index, "Request Supplier Revision", reason.trim())} variant="secondary" disabled={!canAct}>Request supplier revision</Btn>
              <Btn onClick={() => needsReason("escalate") && onDecide(finding.__index, "Escalate", reason.trim())} variant="ghost" disabled={!canAct}>Escalate</Btn>
            </div>
            {!canAct && (
              <p style={{ fontSize: 11.5, opacity: 0.6, margin: 0 }}>
                {readOnly ? "Your role is read-only on this contract."
                  : `This change type routes to ${route}, which is not your role.`}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
