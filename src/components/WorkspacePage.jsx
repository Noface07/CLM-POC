import {
  ArrowLeft, ClipboardCheck, RefreshCw, ThumbsDown, Send, Sparkles, Loader2, Plus,
  Download, ListChecks, FileText, BookOpen, MessageSquareWarning,
  AlertTriangle, RotateCcw,
} from "lucide-react";
import {
  Tag, Btn, statusColor, GREEN, AMBER, RED, GRAY, kicker, formatDate,
} from "../lib/ui.jsx";
import LifecycleBar from "./LifecycleBar.jsx";
import DocumentView, { ChangeSummary } from "./DocumentView.jsx";
import ClausePalette from "./ClausePalette.jsx";
import CompareVersions from "./CompareVersions.jsx";
import Fold from "./Fold.jsx";
import Finding from "./Finding.jsx";
import { downloadDocx } from "../lib/docx.js";
import { formatMoney, mustEscalate } from "../data/contracts.js";
import { pendingChangeCount } from "../lib/redline.js";
import { ALL_ACCESS_ROLE } from "../lib/rbac.js";
import { newestFirst, formatAuditTime, actorLabel, auditCsvBlob, forContract } from "../lib/audit.js";
import { downloadBlob } from "../lib/zip.js";

const REVIEW_DECISION_COLOR = { approved: GREEN, rejected: RED, changes: AMBER, delegated: GRAY, pending: GRAY };

export default function WorkspacePage({
  // identity
  contract, supplier, clientEntity, agreementTypeName, templateName, role, readOnly,
  // status
  contractStatus, approvalStatus, signatureStatus, contractIsLive, terminationState,
  // document
  activeDoc, docVersion, setDocVersion, versions, watermark, changeDecisions,
  onAcceptChange, onRejectChange, onAddComment, onReplyToComment, onResolveComment,
  onEditClause, onInsertClause, onDeleteClause, citationsFor, onDiscardChange, currentAuthor, versionHistory, docHistory,
  supplierAccepted,
  // review
  reviewers, approvals, reviewInvalidated, reviewActionKey, setReviewActionKey, reviewCommentDraft,
  setReviewCommentDraft, submitReviewDecision, resolveDelegation, roleCanActOnReviewer,
  resubmitForReview, reviewComplete,
  // negotiation
  sentToSupplier, redlineReceived, onSendToSupplier, counterChanges = [], onSendCounter,
  counterRows = [], counterCleared = true, counterBlocked, onApproveCounter, canApproveCounter,
  findingsStale,
  aiChange, aiChangeLoading, runChangeIntelligence, changeRunMeta,
  exceptions, exceptionDecisions, assessFor, onOpenException, decide,
  changeTypeRoute, approvalMatrix, contractValue,
  roleCanActOnException, onAddManualException,
  onOpenPlaybook, silentClauses, commentsFor,
  // signature
  readyForSignature, envelope, envelopeStatus, declineReason, redlineReopened,
  onGoToSignature, onReopenNegotiation, onRaiseNewEnvelope,
  // lifecycle
  canManageLifecycle, lifecycle,
  // misc
  auditLog, onBack, onGoToObligations, undecidedCount, blockedCount, flash,
}) {
  const pendingChanges = activeDoc ? pendingChangeCount(activeDoc, changeDecisions) : 0;
  const frozen = docVersion === "executed" || docVersion === "amended";
  // The draft stops being the live document the moment a redline comes back. It stayed
  // editable, and worse, an edit made while looking at it landed on the redline instead,
  // because that is the document edits target. You were editing something you could not
  // see. It is now readable, downloadable and closed to edits, and says which document
  // to make the change on.
  const superseded = docVersion === "draft" && redlineReceived;
  const locked = frozen || superseded;
  const lockNote = frozen ? "signed, no longer editable"
    : superseded ? "superseded by the redline: make changes there"
    : "read-only for your role";
  const allReviewersApproved = Object.values(approvals).every((a) => a.status === "approved");

  // This panel is inside a contract, so it is that contract's trail. The estate-wide view
  // is the Audit trail tab, and the difference is stated rather than left to be noticed.
  const contractAudit = forContract(auditLog, contract.id);
  const estateCount = auditLog.length - contractAudit.length;

  return (
    <>
      <Btn onClick={onBack} icon={ArrowLeft} variant="ghost">Back to contracts</Btn>

      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap",
        padding: "var(--space-3) 0 var(--space-4)", borderBottom: "2px solid var(--color-divider)", marginBottom: "var(--space-4)" }}>
        <h2 style={{ margin: 0 }}>{contract.id}</h2>
        <span style={{ fontSize: 16, opacity: 0.7 }}>{supplier.name}</span>
        <Tag outline style={{ whiteSpace: "nowrap", flex: "none" }}>{agreementTypeName}</Tag>
        {contract.family && <Tag c={GRAY} style={{ fontSize: 10.5 }}>{contract.family}</Tag>}
        <Tag c={statusColor(contractStatus)}>{contractStatus}</Tag>
        {contract.evergreen && <Tag c={AMBER}>Evergreen</Tag>}
        <Btn onClick={onOpenPlaybook} icon={BookOpen} variant="secondary" small style={{ marginLeft: "auto" }}>
          Clause playbook
        </Btn>
        {envelope && <Btn onClick={onGoToSignature} variant="secondary" small>Signature status</Btn>}
      </div>

      <LifecycleBar
        status={contractStatus}
        evergreen={contract.evergreen}
        terminal={terminationState === "terminated" ? "Terminated" : undefined}
      />

      {readOnly && (
        <div className="clm-readonly-banner">
          <MessageSquareWarning size={15} />
          Read-only as {role}. You can track status, read the document and read the playbook. You cannot approve,
          decide exceptions, edit the document or sign.
        </div>
      )}

      {reviewInvalidated && !reviewComplete && (
        <div className="clm-readonly-banner" style={{ borderColor: "var(--color-accent-300)", background: "var(--color-accent-100)" }}>
          <RefreshCw size={15} />
          <span>
            <strong>Internal review restarted.</strong> The draft was edited after it was approved, so every approval
            was given against wording that no longer exists. Reviewers need to see it again before it goes out.
            <span style={{ opacity: 0.6 }}> Last change: {reviewInvalidated.at}.</span>
          </span>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: "var(--space-6)" }}>
        {!allReviewersApproved && !["Rejected", "Changes Requested"].includes(approvalStatus) && (
          <p style={{ margin: 0, fontSize: 13.5, opacity: 0.75 }}>Internal review pending. Approve or decide below.</p>
        )}
        {["Rejected", "Changes Requested"].includes(approvalStatus) && (
          <>
            <p style={{ margin: 0, fontSize: 13.5, opacity: 0.75 }}>
              Internal review returned {approvalStatus === "Rejected" ? "a rejection" : "a change request"}. Address it and resubmit.
            </p>
            {!readOnly && <Btn onClick={resubmitForReview} icon={RefreshCw} variant="secondary">Resubmit for review</Btn>}
          </>
        )}
        {reviewComplete && !sentToSupplier && (
          <>
            <p style={{ margin: 0, fontSize: 13.5, opacity: 0.75 }}>Internally approved. Send the Word draft to the supplier.</p>
            {!readOnly && <Btn onClick={onSendToSupplier} icon={Send} variant="primary">Send to supplier</Btn>}
          </>
        )}
        {sentToSupplier && !redlineReceived && (
          <p style={{ margin: 0, fontSize: 13.5, opacity: 0.75 }}>
            Sent to {supplier.name}, awaiting their redline. Switch to Supplier view to return one.
          </p>
        )}
        {redlineReceived && !aiChange && (
          <p style={{ margin: 0, fontSize: 13.5, opacity: 0.75 }}>
            Redline received with {activeDoc?.changes?.length || 0} tracked changes. Run change intelligence in the panel →
          </p>
        )}
        {aiChange && undecidedCount > 0 && (
          <p style={{ margin: 0, fontSize: 13.5, opacity: 0.75 }}>
            {undecidedCount} change{undecidedCount > 1 ? "s" : ""} still need a decision in the panel →
          </p>
        )}
        {aiChange && undecidedCount <= 0 && blockedCount > 0 && (
          <p style={{ margin: 0, fontSize: 13.5, opacity: 0.75 }}>
            {blockedCount} exception{blockedCount > 1 ? "s" : ""} still open, awaiting a supplier revision or an escalation decision.
          </p>
        )}
        {supplierAccepted && (
          <p style={{ margin: 0, fontSize: 13.5, opacity: 0.75 }}>
            {supplier.name} accepted the document as sent on {supplierAccepted.at}, without changes
            {supplierAccepted.agreed > 0
              ? `, which agrees the ${supplierAccepted.agreed} proposal${supplierAccepted.agreed === 1 ? "" : "s"} you put to them.`
              : "."}
          </p>
        )}
        {counterChanges.length > 0 && (
          <div style={{ width: "100%" }}>
            <p style={{ margin: "0 0 var(--space-3)", fontSize: 13.5, color: "var(--color-accent-700)" }}>
              You have changed {counterChanges.length === 1 ? "a clause" : `${counterChanges.length} clauses`} on
              their redline. That is a counter-proposal, not a decision, so it goes back to {supplier.name} for
              another round. Nothing they have not seen can reach signature, and nothing we have not approved
              reaches them.
            </p>

            <div className="clm-counter-gate">
              {counterRows.map((row) => {
                const mine = canApproveCounter?.(row);
                return (
                  <div key={row.change.id} className="clm-counter-row">
                    <span className="clm-counter-clause">
                      <strong>{row.change.clauseRef}</strong> {row.change.clauseHeading}
                    </span>
                    {!row.needsApproval ? (
                      <>
                        <Tag c={GREEN} style={{ fontSize: 10 }}>at standard</Tag>
                        <span className="clm-counter-note">
                          Our own standard position, so there is no exception for anyone to approve.
                        </span>
                      </>
                    ) : row.approved ? (
                      <>
                        <Tag c={GREEN} style={{ fontSize: 10 }}>approved</Tag>
                        <span className="clm-counter-note">
                          {row.requiredRole} · recorded by {row.approval.by} at {row.approval.at}
                        </span>
                      </>
                    ) : (
                      <>
                        <Tag c={row.assessment?.position === "walkAway" ? RED : AMBER} style={{ fontSize: 10 }}>
                          needs {row.requiredRole}
                        </Tag>
                        <span className="clm-counter-note">{row.assessment?.verdict}</span>
                        {!readOnly && (
                          <Btn
                            small variant={mine ? "primary" : "secondary"} disabled={!mine}
                            onClick={() => onApproveCounter?.(row.change.id)}
                            title={mine
                              ? `Approve as ${row.recordedBy}`
                              : `Only ${row.recordedBy} can approve this position. Switch role to record it.`}
                          >Approve</Btn>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {!readOnly && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: "var(--space-3)" }}>
                <Btn onClick={onSendCounter} icon={Send} variant="primary" disabled={!counterCleared}>
                  Send back to {supplier.name}
                </Btn>
                {!counterCleared && (
                  <span style={{ fontSize: 12.5, color: "var(--color-accent-700)" }}>{counterBlocked}</span>
                )}
              </div>
            )}
          </div>
        )}
        {aiChange && readyForSignature && pendingChanges > 0 && (
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--color-accent-700)" }}>
            Every change is decided, but {pendingChanges} tracked change{pendingChanges > 1 ? "s are" : " is"} still
            marked up in the document. Accept or reject {pendingChanges > 1 ? "them" : "it"} before sending for signature.
          </p>
        )}
        {readyForSignature && pendingChanges === 0 && !envelope && (
          <>
            <p style={{ margin: 0, fontSize: 13.5, opacity: 0.75 }}>
              {aiChange
                ? "Document is clean and every change is decided."
                : `${supplier.name} accepted the draft as sent: no redline came back, and internal approval stands.`}
            </p>
            {!readOnly && <Btn onClick={onGoToSignature} icon={Send} variant="primary">Send for e-signature</Btn>}
          </>
        )}
        {envelopeStatus === "REJECTED" && (
          <>
            <p style={{ margin: 0, fontSize: 13.5, color: "var(--color-accent-700)" }}>
              {supplier.name} declined to sign{declineReason ? `: "${declineReason}"` : "."}
            </p>
            <p style={{ margin: 0, fontSize: 12.5, opacity: 0.7, lineHeight: 1.6 }}>
              Two ways back. If they object to the terms, reopen it and let them mark the document up again. If the
              envelope itself was wrong (wrong signatory, wrong address), the terms still stand and a fresh envelope
              is all it needs. Either way the previous envelope is voided and any signature already on it is
              discarded, because it was given against text that is about to change.
            </p>
            {!readOnly && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Btn onClick={onReopenNegotiation} icon={RotateCcw} variant="primary">Reopen for a further redline</Btn>
                <Btn onClick={onRaiseNewEnvelope} icon={Send} variant="secondary">Raise a new envelope</Btn>
              </div>
            )}
          </>
        )}

        {redlineReopened && (
          <p style={{ margin: 0, fontSize: 13.5, opacity: 0.75 }}>
            Reopened, waiting on a further marked-up document from {supplier.name}. Switch to Supplier view to
            return one.
          </p>
        )}

        {contractIsLive && (
          <>
            <p style={{ margin: 0, fontSize: 13.5, opacity: 0.75 }}>Contract executed and active.</p>
            <Btn onClick={onGoToObligations} icon={ListChecks} variant="secondary">Extract obligations</Btn>
          </>
        )}
      </div>

      <div className="clm-workspace-grid">
        <div style={{ display: "grid", gap: "var(--space-4)" }}>
          <Fold
            title="Contract details"
            note={`${formatMoney(contract.value, contract.currency)} · ${contract.category}`}
            right={<Tag c={contract.riskLevel === "high" ? RED : contract.riskLevel === "medium" ? AMBER : GREEN}>{contract.riskLevel} risk</Tag>}
          >
            <div className="clm-grid-2" style={{ gap: "var(--space-4) var(--space-6)" }}>
              <div><div style={kicker}>Legal entity</div><div style={{ fontSize: 14 }}>{clientEntity.name}</div></div>
              <div><div style={kicker}>Contract owner</div><div style={{ fontSize: 14 }}>{contract.owner}</div></div>
              <div><div style={kicker}>Business owner</div><div style={{ fontSize: 14 }}>{supplier.businessOwner}</div></div>
              <div><div style={kicker}>Service category</div><div style={{ fontSize: 14 }}>{contract.category}</div></div>
              <div><div style={kicker}>Facility / site</div><div style={{ fontSize: 14 }}>{supplier.facility}</div></div>
              <div><div style={kicker}>Annual value</div><div style={{ fontSize: 14 }}>{formatMoney(contract.value, contract.currency)}</div></div>
              <div>
                <div style={kicker}>Term</div>
                <div style={{ fontSize: 14 }}>
                  {formatDate(contract.startDate)} - {contract.evergreen ? "no expiry (evergreen)" : formatDate(contract.endDate)}
                </div>
              </div>
              <div>
                <div style={kicker}>Renewal</div>
                <div style={{ fontSize: 14 }}>
                  {contract.evergreen ? "Rolling, terminate on notice" : "Auto-renewal · 90-day notice"}
                </div>
              </div>
              <div><div style={kicker}>Template</div><div style={{ fontSize: 14 }}>{templateName}</div></div>
              <div><div style={kicker}>Risk level</div><Tag c={contract.riskLevel === "high" ? RED : contract.riskLevel === "medium" ? AMBER : GREEN}>{contract.riskLevel}</Tag></div>
              <div><div style={kicker}>Approval status</div><Tag c={statusColor(approvalStatus === "Approved" ? "Approved" : approvalStatus === "Rejected" ? "Rejected" : "Draft")}>{approvalStatus}</Tag></div>
              <div><div style={kicker}>Signature status</div><Tag c={statusColor(signatureStatus)}>{signatureStatus}</Tag></div>
              <div><div style={kicker}>Routed to</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 2 }}>
                  {(contract.routedTo || []).map((q) => <Tag key={q} c={GRAY} style={{ fontSize: 10 }}>{q.replace("_", " ")}</Tag>)}
                </div>
              </div>
              <div><div style={kicker}>PO eligibility</div><Tag c={contractIsLive ? GREEN : GRAY}>{contractIsLive ? "Yes" : "No"}</Tag></div>
            </div>
            {contract.evergreen && (
              <p style={{ fontSize: 11.5, opacity: 0.6, margin: "8px 0 0", lineHeight: 1.55 }}>
                Evergreen: no expiry date, so no expiry reminders and no renewal task. The only control is the
                termination notice, which is why the playbook holds the notice period rather than the term length here.
              </p>
            )}
          </Fold>

          <div className="card">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
              <FileText size={15} />
              <div className="card-title" style={{ margin: 0 }}>Document</div>
              <Tag c={GRAY} style={{ fontSize: 10 }}>
                {frozen ? "PDF · signed" : superseded ? "Word (.docx) · superseded" : "Word (.docx) · editable"}
              </Tag>
            </div>

            <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
              {versions.map((v) => (
                <button
                  key={v.key} type="button" onClick={() => setDocVersion(v.key)}
                  className={`btn btn-${docVersion === v.key ? "primary" : "secondary"}`}
                  style={{ padding: "4px 10px", fontSize: 12 }}
                >
                  {v.label}
                </button>
              ))}
              {activeDoc && !frozen && (
                <Btn
                  icon={Download} variant="secondary" small style={{ marginLeft: "auto" }}
                  onClick={() => {
                    downloadDocx(activeDoc, `${contract.id}_${activeDoc?.meta?.version || docVersion}.docx`, { watermark });
                    flash?.("Downloaded as Word. Tracked changes and comments are live in the file.");
                  }}
                >Download .docx</Btn>
              )}
            </div>

            {superseded && (
              <div className="clm-readonly-banner" style={{ marginTop: 0 }}>
                <FileText size={15} />
                <span>
                  This is the draft as it was sent. {supplier.name} has since returned a redline, so this version is
                  the record of what went out, not the document being negotiated. Switch to the redline to make a
                  change.
                </span>
              </div>
            )}

            {activeDoc?.changes?.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <ChangeSummary doc={activeDoc} decisions={changeDecisions} />
                <p style={{ fontSize: 11.5, opacity: 0.6, margin: "6px 0 0", lineHeight: 1.55 }}>
                  Insertions are underlined, deletions struck through, both in the author's colour, the same
                  conventions Word uses, and the same markup in the downloaded file. The markup <strong>stays</strong>
                  once a change is decided: an accepted insertion goes plain, a rejected one disappears, and the
                  negotiation record survives. The clean copy is the executed version.
                </p>
              </div>
            )}

            {activeDoc && (
              <ClausePalette
                onOpenPlaybook={onOpenPlaybook}
                onInsert={(code) => onInsertClause?.(code)}
                presentIn={activeDoc}
                disabled={readOnly || locked}
                disabledNote={lockNote}
              />
            )}

            {activeDoc ? (
              <DocumentView
                doc={activeDoc}
                watermark={watermark}
                decisions={changeDecisions}
                canAct={!readOnly && !locked}
                canEdit={!readOnly && !locked}
                onAccept={onAcceptChange}
                onReject={onRejectChange}
                onAddComment={onAddComment}
                onReply={onReplyToComment}
                onResolveComment={onResolveComment}
                onEditClause={onEditClause}
                onDeleteClause={onDeleteClause}
                citationsFor={citationsFor}
                onDropClause={onInsertClause}
                onDiscardChange={onDiscardChange}
                currentAuthor={currentAuthor}
                height={560}
              />
            ) : (
              <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>No document on this version yet.</p>
            )}
          </div>

          <Fold title="Version history" note={`${versionHistory.length} entries`} defaultOpen={false}>
            <div style={{ display: "grid" }}>
              {versionHistory.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: "var(--space-3)", padding: "var(--space-2) 0",
                  borderBottom: "1px solid var(--color-divider)", alignItems: "baseline" }}>
                  <Tag c={GRAY} style={{ flex: "none" }}>{r.v}</Tag>
                  <span style={{ fontSize: 13, flex: 1 }}>{r.label}</span>
                  <span style={{ fontSize: 11, opacity: 0.5, flex: "none" }}>{r.format}</span>
                </div>
              ))}
            </div>
          </Fold>

          {!reviewComplete && !["Rejected", "Changes Requested"].includes(approvalStatus) && (
            <Fold
              title="Internal review"
              note={`${Object.values(approvals).filter((a) => a.status === "approved").length} of ${reviewers.length} approved`}
            >
              <p style={{ fontSize: 11.5, opacity: 0.5, margin: "0 0 8px" }}>
                Each reviewer can Approve, Reject, Request Changes, or Delegate, with a comment.
              </p>
              {reviewers.map((r) => {
                const a = approvals[r.key];
                const canAct = roleCanActOnReviewer(role, r.key) && !readOnly;
                return (
                  <div key={r.key} style={{ borderBottom: "1px solid var(--color-divider)", padding: "8px 0" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{r.role}</div>
                        <div className="text-muted" style={{ fontSize: 12 }}>{r.name}</div>
                      </div>
                      {a.status !== "pending" && a.status !== "delegated" ? (
                        <Tag c={REVIEW_DECISION_COLOR[a.status]}>
                          {a.status === "approved" ? "Approved" : a.status === "rejected" ? "Rejected" : "Changes Requested"}
                        </Tag>
                      ) : a.status === "delegated" ? (
                        <Tag c={GRAY}>Delegated to {a.delegateTo}</Tag>
                      ) : reviewActionKey === r.key ? null : (
                        <Btn onClick={() => setReviewActionKey(r.key)} variant="secondary" small icon={ClipboardCheck} disabled={!canAct}>Decide</Btn>
                      )}
                    </div>
                    {a.status !== "pending" && a.status !== "delegated" && a.comment && (
                      <p style={{ fontSize: 11.5, opacity: 0.55, margin: "4px 0 0" }}>"{a.comment}"</p>
                    )}
                    {reviewActionKey === r.key && (
                      <div style={{ marginTop: 8 }}>
                        <textarea
                          className="input" value={reviewCommentDraft} onChange={(e) => setReviewCommentDraft(e.target.value)}
                          placeholder="Comment (required for reject / request changes)" style={{ marginBottom: 8 }}
                        />
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <Btn onClick={() => submitReviewDecision(r.key, "approved")} variant="primary" small>Approve</Btn>
                          <Btn onClick={() => submitReviewDecision(r.key, "rejected")} variant="secondary" small icon={ThumbsDown}>Reject</Btn>
                          <Btn onClick={() => submitReviewDecision(r.key, "changes")} variant="secondary" small>Request changes</Btn>
                          <Btn onClick={() => {
                            const name = window.prompt("Delegate this review to (name):");
                            if (name && name.trim()) submitReviewDecision(r.key, "delegated", name.trim());
                          }} variant="ghost" small>Delegate</Btn>
                          <Btn onClick={() => { setReviewActionKey(null); setReviewCommentDraft(""); }} variant="ghost" small>Cancel</Btn>
                        </div>
                      </div>
                    )}
                    {a.status === "delegated" && canAct && (
                      <div style={{ background: "var(--color-neutral-100)", border: "1px solid var(--color-divider)", padding: 8, marginTop: 8 }}>
                        <p style={{ ...kicker, margin: "0 0 6px" }}>Acting as {a.delegateTo} for this demo</p>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <Btn onClick={() => resolveDelegation(r.key, "approved")} variant="primary" small>Approve</Btn>
                          <Btn onClick={() => resolveDelegation(r.key, "rejected")} variant="secondary" small icon={ThumbsDown}>Reject</Btn>
                          <Btn onClick={() => resolveDelegation(r.key, "changes")} variant="secondary" small>Request changes</Btn>
                        </div>
                      </div>
                    )}
                    {!canAct && a.status === "pending" && reviewActionKey !== r.key && (
                      <p style={{ fontSize: 10.5, opacity: 0.45, margin: "4px 0 0" }}>
                        {readOnly ? "Read-only for your role." : "Not actionable by your current role."}
                      </p>
                    )}
                  </div>
                );
              })}
            </Fold>
          )}

          {lifecycle}

          {contractAudit.length > 0 && (
            <Fold title="Audit trail" note={`${contractAudit.length} events`} defaultOpen={false}>
              <p style={{ fontSize: 11.5, opacity: 0.5, margin: "0 0 8px" }}>
                Every approval, tracked-change decision, exception decision and signature event <strong>on
                {" "}{contract.id}</strong>, with the role that took it and the instant it was taken.
                {estateCount > 0 && (
                  <> {estateCount} further estate-level event{estateCount === 1 ? " is" : "s are"} not shown here
                  because {estateCount === 1 ? "it was" : "they were"} not taken on this contract; the Audit trail
                  tab has the whole estate.</>
                )}
              </p>
              <div style={{ maxHeight: 260, overflowY: "auto" }}>
                {newestFirst(contractAudit).map((entry, i) => (
                  <div key={`${entry.at}-${i}`} style={{ display: "flex", gap: "var(--space-3)", padding: "6px 0", borderBottom: "1px solid var(--color-divider)" }}>
                    <span className="text-muted" style={{ fontSize: 11, flex: "none", width: 116 }}>
                      <time dateTime={entry.at}>{formatAuditTime(entry.at)}</time>
                    </span>
                    <span style={{ fontSize: 12.5 }}>
                      {entry.event}
                      <span className="text-muted" style={{ display: "block", fontSize: 11, marginTop: 1 }}>
                        {actorLabel(entry)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10 }}>
                <Btn
                  small variant="secondary" icon={Download}
                  onClick={() => downloadBlob(
                    auditCsvBlob(contractAudit),
                    `audit-trail-${contract.id}-${new Date().toISOString().slice(0, 10)}.csv`
                  )}
                >Export CSV</Btn>
              </div>
            </Fold>
          )}
        </div>

        <div style={{ display: "grid", gap: "var(--space-4)", alignContent: "start" }}>
        <CompareVersions history={docHistory} />

        <div className="card clm-ai-panel" style={{ border: "1px dashed var(--color-accent-300)", gap: "var(--space-3)" }}>
          <div className="clm-ai-head">
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Tag outline>AI</Tag>
              <div className="card-title" style={{ margin: 0 }}>Change intelligence</div>
              <Btn small variant="ghost" icon={BookOpen} onClick={() => onOpenPlaybook()} style={{ marginLeft: "auto" }}>
                Playbook
              </Btn>
            </div>
            {aiChange ? (
              <div className="clm-ai-counts">
                <Tag c={GRAY} style={{ fontSize: 10.5 }}>{exceptions.length} to decide</Tag>
                {undecidedCount > 0 && <Tag c={AMBER} style={{ fontSize: 10.5 }}>{undecidedCount} open</Tag>}
                {blockedCount > 0 && <Tag c={RED} style={{ fontSize: 10.5 }}>{blockedCount} blocked</Tag>}
                {undecidedCount === 0 && blockedCount === 0 && (
                  <Tag c={GREEN} style={{ fontSize: 10.5 }}>All decided</Tag>
                )}

              </div>
            ) : (
              <p style={{ margin: "6px 0 0", fontSize: 11.5, opacity: 0.6, lineHeight: 1.55 }}>
                Each tracked change placed in its clause's playbook band. The AI says what changed; the playbook says
                what it means and who may approve it.
              </p>
            )}
          </div>

          {findingsStale && (
            <div className="clm-readonly-banner" style={{ margin: 0, borderColor: "var(--color-accent-300)", background: "var(--color-accent-100)" }}>
              <RefreshCw size={15} />
              <span style={{ fontSize: 12.5 }}>
                <strong>These findings are out of date.</strong> The document changed after they were derived, so
                what is below was measured against wording that is no longer in it, and any clause you have just
                written carries no band at all.
                <span style={{ opacity: 0.65 }}> {findingsStale.reason} ({findingsStale.at}).</span>
                {!readOnly && (
                  <Btn
                    small variant="secondary" icon={RefreshCw} spin={aiChangeLoading}
                    onClick={runChangeIntelligence} disabled={aiChangeLoading}
                    style={{ marginLeft: 8, verticalAlign: "middle" }}
                  >Re-run</Btn>
                )}
              </span>
            </div>
          )}

          {aiChange && silentClauses?.length > 0 && (
            <div style={{ border: "1px solid var(--color-accent-300)", background: "var(--color-accent-100)", padding: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                <AlertTriangle size={13} />
                <span style={{ ...kicker, margin: 0 }}>Changed meaning, unchanged text</span>
              </div>
              <p style={{ margin: "0 0 6px", fontSize: 12.5, lineHeight: 1.55 }}>
                {silentClauses.length} clause{silentClauses.length > 1 ? "s were" : " was"} not edited but
                point{silentClauses.length > 1 ? "" : "s"} at {silentClauses.length > 1 ? "clauses" : "a clause"} that
                {silentClauses.length > 1 ? " were" : " was"}. A review that reads only the tracked changes will miss
                {silentClauses.length > 1 ? " these" : " this"}.
              </p>
              {silentClauses.map((s) => (
                <p key={s.ref} style={{ margin: "0 0 3px", fontSize: 12, lineHeight: 1.5 }}>
                  <strong>{s.ref} {s.heading}</strong>, depends on {s.because.join(", ")}, which the supplier changed.
                </p>
              ))}
            </div>
          )}

          {!redlineReceived && <p style={{ fontSize: 13, opacity: 0.5, margin: 0 }}>Awaiting supplier redline.</p>}

          {redlineReceived && !aiChange && !readOnly && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Btn
                onClick={runChangeIntelligence} disabled={aiChangeLoading}
                icon={aiChangeLoading ? Loader2 : Sparkles} spin={aiChangeLoading} variant="secondary"
              >
                {aiChangeLoading ? "Analysing…" : "Analyse changes with AI"}
              </Btn>
            </div>
          )}

          {aiChange && (
            <div style={{ display: "grid", gap: "var(--space-3)" }}>
              {exceptions.map((ex) => (
                <Finding
                  key={ex.__index}
                  finding={ex}
                  decision={exceptionDecisions[ex.__index]}
                  assessment={assessFor(ex)}
                  canAct={roleCanActOnException(role, ex.changeType, changeTypeRoute) && !readOnly
                    && !(mustEscalate(approvalMatrix, ex.changeType, contractValue) && role !== ALL_ACCESS_ROLE)}
                  readOnly={readOnly}
                  route={changeTypeRoute[ex.changeType] || "Contract Manager"}
                  comments={commentsFor?.(ex.clauseRef) || []}
                  onDecide={decide}
                  onOpenDialog={onOpenException}
                />
              ))}

              {canManageLifecycle && (
                <Btn onClick={onAddManualException} icon={Plus} variant="secondary" small style={{ marginTop: 4 }}>
                  Add exception manually
                </Btn>
              )}

              {changeRunMeta && (
                <p style={{ fontSize: 10.5, opacity: 0.4, margin: "4px 0 0", borderTop: "1px solid var(--color-divider)", paddingTop: 8, lineHeight: 1.55 }}>
                  {changeRunMeta.description}
                </p>
              )}
            </div>
          )}
        </div>
        </div>
      </div>
    </>
  );
}
