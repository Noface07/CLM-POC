import { useRef, useState } from "react";
import {
  Building2, Eye, Download, FileCheck2, Ban, PenLine, Upload, Link as LinkIcon,
  Copy, Check, Loader2, AlertTriangle, ShieldCheck, Clock, Plus, ListChecks,
} from "lucide-react";
import { Tag, Btn, GREEN, AMBER, GRAY, RED, kicker } from "../lib/ui.jsx";
import { monitorState } from "../lib/monitoring.js";
import DocumentView from "./DocumentView.jsx";
import { downloadDocx } from "../lib/docx.js";

const SUPPLIER_STATE = {
  overdue: { label: "Overdue", tone: RED },
  lapsed: { label: "Lapsed", tone: RED },
  due: { label: "Due soon", tone: AMBER },
  upcoming: { label: "On track", tone: GREEN },
  met: { label: "Met", tone: GREEN },
  watch: { label: "On an event", tone: GRAY },
};

function AccessLink({ link, expiresOn }) {
  const [copied, setCopied] = useState(false);
  if (!link) return null;
  return (
    <div className="card" style={{ gap: 8, marginBottom: "var(--space-4)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <LinkIcon size={15} />
        <div className="card-title" style={{ margin: 0, fontSize: 15 }}>Access link</div>
        <Tag c={GRAY} style={{ fontSize: 10 }}>expires {expiresOn}</Tag>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <input
          className="input" readOnly value={link} aria-label="Access link for this contract"
          onFocus={(e) => e.target.select()}
          style={{ flex: 1, minWidth: 260, fontSize: 12, fontFamily: "ui-monospace, monospace" }}
        />
        <Btn
          small variant="secondary" icon={copied ? Check : Copy}
          onClick={() => {
            navigator.clipboard?.writeText(link).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            });
          }}
        >{copied ? "Copied" : "Copy"}</Btn>
      </div>
      <p style={{ margin: 0, fontSize: 11.5, opacity: 0.65, lineHeight: 1.6 }}>
        This link opens straight into this view, scoped to one contract, and survives a reload. The token is in the
        URL and the session is kept in this browser's storage. <strong>It will not work on someone else's
        machine.</strong> Nothing is stored on a server in this demo, so there is nothing for another browser to
        fetch. In production the token would be a signed reference to a server-side session with an expiry, a revoke
        list and an audit entry for every open, which is also what makes it safe to email.
      </p>
    </div>
  );
}

export default function SupplierPortal({
  supplier, contractId, contractExists, sentToSupplier, draftDoc, redlineDoc,
  redlineReceived, supplierDraft, supplierBaseDoc, onAddScriptedChanges, onSendRedline,
  onSupplierEditClause, onSupplierDeleteClause, onSupplierDiscardChange, onAcceptAsSent, supplierAccepted,
  onImportRedline, supplierActionItems, onSubmitRevision,
  envelope, envelopeStatus, supplierViewed, supplierSigned, onSupplierView,
  onSupplierSign, onSupplierDecline, onDownloadExecuted, flash,
  accessLink, accessExpiry, viaLink, waitingOnSigner, redlineReopened,
  onReplyToComment, onResolveComment, onAddComment,
  obligations = [], obligationLog = {}, validated = {}, today, onSupplierRecord,
}) {
  const canMarkUp = !redlineReceived || redlineReopened;
  // While marking up, the counterparty works on their own copy. The client sees nothing
  // until it is sent, which is what makes editing before sending safe.
  const working = canMarkUp ? (supplierDraft || supplierBaseDoc || draftDoc) : redlineDoc;
  const shown = working || (redlineReceived ? redlineDoc : draftDoc);
  const pendingCount = supplierDraft?.changes?.length || 0;
  const [declineWhy, setDeclineWhy] = useState("");
  const [declining, setDeclining] = useState(false);
  const fileInput = useRef(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importReport, setImportReport] = useState(null);
  const [recordOn, setRecordOn] = useState(null);
  const [recordDraft, setRecordDraft] = useState({ at: today, evidence: "" });

  // Only what this counterparty actually owes. The client's own duties are theirs to
  // track, and showing them here would be showing the supplier the other side's homework.
  const myObligations = obligations
    .filter((o) => validated[o.id] && /supplier|both parties|either party/i.test(String(o.responsible || "")))
    .map((o) => ({ o, entry: obligationLog[o.id], state: monitorState(obligationLog[o.id], today) }))
    .sort((a, b) => {
      const order = { lapsed: 0, overdue: 1, due: 2, upcoming: 3, watch: 4, met: 5 };
      return order[a.state] - order[b.state];
    });

  async function handleFile(file) {
    if (!file) return;
    setImporting(true); setImportError(""); setImportReport(null);
    try {
      const report = await onImportRedline(file);
      setImportReport(report);
    } catch (err) {
      setImportError(err.message || "Could not read that file.");
    }
    setImporting(false);
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
        <Building2 size={18} />
        <h1 style={{ margin: 0 }}>{supplier.name}</h1>
        {viaLink && <Tag c={GREEN} style={{ fontSize: 10.5 }}><ShieldCheck size={11} style={{ marginRight: 4 }} />Opened via access link</Tag>}
      </div>
      <p style={{ margin: "0 0 var(--space-6)", opacity: 0.6, fontSize: 13, maxWidth: 700, lineHeight: 1.6 }}>
        The counterparty's view. Scoped to one contract: no contract list, no other suppliers, no internal review,
        no playbook. That scoping is the product, not a simplification of it.
      </p>

      <AccessLink link={accessLink} expiresOn={accessExpiry} />

      {!contractExists && <p className="text-muted">No contracts shared with you yet.</p>}
      {contractExists && !sentToSupplier && (
        <p className="text-muted">A draft is under internal review. Nothing to action yet.</p>
      )}

      {sentToSupplier && (
        <div className="card" style={{ gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div className="card-title" style={{ marginBottom: 0 }}>{contractId}: draft received</div>
            <Tag c={GRAY} style={{ fontSize: 10 }}>Word (.docx)</Tag>
            {redlineReceived && <Tag c={AMBER}>Your redline is with the client</Tag>}
          </div>
          <p className="card-body" style={{ margin: 0, lineHeight: 1.6 }}>
            {redlineReceived
              ? "Your tracked changes and comments are shown below as the client sees them."
              : "Download it, mark it up in Word with track changes on, and upload it back. The client's system reads your markup directly. You do not need to summarise it."}
          </p>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {shown && (
              <Btn
                icon={Download} variant="secondary"
                onClick={() => {
                  downloadDocx(shown, `${contractId}_${redlineReceived ? "redline" : "draft"}.docx`);
                  flash?.("Downloaded as Word.");
                }}
              >Download .docx</Btn>
            )}
            {canMarkUp && (
              <>
                <input
                  ref={fileInput} type="file" style={{ display: "none" }} accept=".docx"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                <Btn
                  icon={importing ? Loader2 : Upload} spin={importing} variant="primary"
                  disabled={importing} onClick={() => fileInput.current?.click()}
                >
                  {importing ? "Reading the document…" : "Upload your marked-up .docx"}
                </Btn>
                <Btn onClick={onAddScriptedChanges} icon={Plus} variant="secondary">
                  Add the scripted changes
                </Btn>
                <Btn onClick={onAcceptAsSent} icon={Check} variant="secondary" disabled={Boolean(pendingCount)}>
                  Accept as sent, no changes
                </Btn>
              </>
            )}
          </div>

          {supplierAccepted && (
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap",
              background: "var(--color-neutral-100)", border: "1px solid var(--color-divider)", padding: "9px 11px" }}>
              <Tag c={GREEN} style={{ fontSize: 10.5 }}>Accepted as sent</Tag>
              <span style={{ fontSize: 12.5 }}>
                You accepted this document without changes on {supplierAccepted.at}
                {supplierAccepted.agreed > 0
                  ? `, agreeing ${supplierAccepted.agreed} proposal${supplierAccepted.agreed === 1 ? "" : "s"} the client had put to you.`
                  : "."}
              </span>
            </div>
          )}

          {canMarkUp && supplierDraft && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
              background: "var(--color-accent-100)", border: "1px solid var(--color-accent-300)", padding: "9px 11px" }}>
              <Tag c={AMBER} style={{ fontSize: 10.5 }}>Your copy · not sent</Tag>
              <span style={{ fontSize: 12.5 }}>
                {pendingCount} tracked change{pendingCount === 1 ? "" : "s"}. Edit any clause below, then send it back.
              </span>
              <Btn
                onClick={onSendRedline} icon={FileCheck2} variant="primary" small
                style={{ marginLeft: "auto" }} disabled={!pendingCount}
              >Send the redline to the client</Btn>
            </div>
          )}

          {canMarkUp && (
            <p style={{ fontSize: 11.5, opacity: 0.6, margin: 0, lineHeight: 1.6 }}>
              The upload is parsed for real: the ZIP is inflated, <code>word/document.xml</code> is read, and every
              <code> w:ins</code>, <code>w:del</code> and comment anchor is pulled out with its author and date. Try it
              with the file you just downloaded, or with any Word document of your own.
            </p>
          )}

          {importError && (
            <div style={{ background: "var(--color-accent-100)", border: "1px solid var(--color-accent-300)",
              color: "var(--color-accent-800)", padding: 10, fontSize: 12.5, lineHeight: 1.55 }}>
              {importError}
            </div>
          )}

          {importReport && (
            <div style={{ background: "var(--color-neutral-100)", border: "1px solid var(--color-divider)", padding: 10 }}>
              <div style={{ ...kicker, marginBottom: 5 }}>Read from your file</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                <Tag c={GRAY} style={{ fontSize: 10.5 }}>{importReport.clauses} clauses</Tag>
                <Tag c={importReport.changes ? AMBER : GRAY} style={{ fontSize: 10.5 }}>{importReport.changes} tracked changes</Tag>
                <Tag c={importReport.comments ? AMBER : GRAY} style={{ fontSize: 10.5 }}>{importReport.comments} comments</Tag>
                {importReport.authors.map((a) => <Tag key={a} c={GRAY} style={{ fontSize: 10.5 }}>{a}</Tag>)}
              </div>
              {importReport.warnings.length > 0 && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                    <AlertTriangle size={12} />
                    <span style={{ ...kicker, margin: 0 }}>What could not be read</span>
                  </div>
                  {importReport.warnings.map((w, i) => (
                    <p key={i} style={{ margin: "0 0 3px", fontSize: 11.5, lineHeight: 1.5 }}>{w}</p>
                  ))}
                </>
              )}
              {importReport.changes === 0 && (
                <p style={{ margin: "4px 0 0", fontSize: 11.5, lineHeight: 1.55, color: "var(--color-accent-700)" }}>
                  No tracked changes were found. If you edited the document with track changes off, Word recorded no
                  revisions and there is nothing for the client to review. Turn it on and mark it up again.
                </p>
              )}
            </div>
          )}

          {shown && (
            <div style={{ marginTop: "var(--space-2)" }}>
              <DocumentView
                doc={shown} canAct={false} canComment height={460}
                canEdit={canMarkUp}
                currentAuthor={supplier.name}
                onEditClause={canMarkUp ? onSupplierEditClause : undefined}
                onDeleteClause={canMarkUp ? onSupplierDeleteClause : undefined}
                onDiscardChange={canMarkUp ? onSupplierDiscardChange : undefined}
                onReply={onReplyToComment}
                onResolveComment={onResolveComment}
                onAddComment={onAddComment}
              />
            </div>
          )}
        </div>
      )}

      {supplierActionItems.length > 0 && (
        <div className="card" style={{ border: "1px dashed var(--color-accent-300)", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Clauses needing your response</div>
          <p style={{ margin: 0, fontSize: 12, opacity: 0.6 }}>The client has not accepted these as proposed.</p>
          <div style={{ display: "grid", gap: "var(--space-3)" }}>
            {supplierActionItems.map(({ ex, i, decision }) => (
              <div key={i} style={{ borderTop: "1px solid var(--color-divider)", paddingTop: "var(--space-3)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 14 }}>{ex.clause}</span>
                  <Tag c={AMBER}>{decision.action}</Tag>
                </div>
                {decision.reason && <p style={{ fontSize: 12.5, opacity: 0.75, margin: "0 0 8px" }}>"{decision.reason}"</p>}
                <Btn onClick={() => onSubmitRevision(i)} variant="secondary" small icon={FileCheck2}>Submit revised clause</Btn>
              </div>
            ))}
          </div>
        </div>
      )}

      {envelope && envelopeStatus === "PENDING" && (
        <div className="card" style={{ gap: "var(--space-3)" }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Signature request</div>
          <p style={{ margin: 0, fontSize: 12.5, opacity: 0.7, lineHeight: 1.6 }}>
            The final agreement, as a PDF. Word markup ends at signature: what you sign is fixed.
          </p>
          {waitingOnSigner && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "#fdf1da",
              border: "1px solid #f5dfa8", color: "#7a4a05", padding: 10, fontSize: 12.5, lineHeight: 1.6 }}>
              <Clock size={15} style={{ flex: "none", marginTop: 1 }} />
              <span>
                <strong>{waitingOnSigner.name}</strong> signs first. The envelope has a signing order, so this
                document does not reach you for signature until they have signed. You can read it now and will be
                emailed when it is your turn.
              </span>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {!supplierViewed && <Btn onClick={onSupplierView} icon={Eye} variant="secondary">View document</Btn>}
            {declining && (
              <div style={{ display: "grid", gap: 6, border: "1px solid var(--color-divider)", padding: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Why are you declining?</label>
                <textarea
                  className="input" value={declineWhy} onChange={(e) => setDeclineWhy(e.target.value)}
                  placeholder="e.g. Clause 7.2 as accepted still caps liability below our insurance excess."
                  style={{ minHeight: 64 }}
                />
                <p style={{ margin: 0, fontSize: 11, opacity: 0.6, lineHeight: 1.55 }}>
                  This goes to the client with the decline. A refusal with no reason tells them only that you have a
                  problem, which is the one thing they already know.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn onClick={() => { onSupplierDecline(declineWhy); setDeclining(false); }} variant="primary" small
                    disabled={!declineWhy.trim()}>Send the decline</Btn>
                  <Btn onClick={() => setDeclining(false)} variant="ghost" small>Cancel</Btn>
                </div>
              </div>
            )}
            {supplierViewed && !supplierSigned && !declining && (
              <>
                <Btn onClick={onSupplierSign} icon={PenLine} variant="primary" disabled={Boolean(waitingOnSigner)}>Sign</Btn>
                <Btn onClick={() => setDeclining(true)} icon={Ban} variant="ghost">Decline to sign</Btn>
              </>
            )}
          </div>
        </div>
      )}

      {envelopeStatus === "REJECTED" && (
        <div className="card" style={{ gap: 8 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Declined</div>
          <Tag c={RED} style={{ alignSelf: "flex-start" }}>You declined to sign</Tag>
          <p style={{ margin: 0, fontSize: 12.5, opacity: 0.7 }}>The client has been notified and the envelope is closed.</p>
        </div>
      )}

      {envelopeStatus === "COMPLETED" && (
        <div className="card" style={{ gap: "var(--space-3)" }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Executed</div>
          <Tag c={GREEN} style={{ alignSelf: "flex-start" }}>Fully signed</Tag>
          <div><Btn onClick={onDownloadExecuted} icon={Download} variant="secondary">Download signed copy (PDF)</Btn></div>
        </div>
      )}

      {envelopeStatus === "COMPLETED" && myObligations.length > 0 && (
        <div className="card" style={{ gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <ListChecks size={15} />
            <div className="card-title" style={{ margin: 0 }}>What you owe under this contract</div>
            <span style={{ fontSize: 11.5, opacity: 0.55 }}>{myObligations.length} on you · today is {today}</span>
          </div>
          <p className="card-body" style={{ margin: 0, lineHeight: 1.6 }}>
            The duties the client is monitoring against you, with the dates they are measured on. Recording what you
            delivered here is the same record they see: a duty with a date and nothing against it is not evidence of
            compliance, whichever side is looking at it.
          </p>
          <div style={{ overflowX: "auto" }}>
            <div className="table-scroll">
            <table className="table">
              <thead>
                <tr><th>Obligation</th><th>Clause</th><th>Frequency</th><th>Next due</th><th>State</th><th>Last recorded</th><th /></tr>
              </thead>
              <tbody>
                {myObligations.map(({ o, entry, state }) => {
                  const last = (entry?.history || [])[(entry?.history || []).length - 1];
                  return (
                    <tr key={o.id}>
                      <td style={{ maxWidth: 300 }}>
                        <div style={{ fontWeight: 600 }}>{o.name}</div>
                        <div style={{ fontSize: 11, opacity: 0.55 }}>{o.evidence && `evidence: ${o.evidence}`}</div>
                      </td>
                      <td style={{ fontSize: 12.5 }}>{o.clause}</td>
                      <td style={{ fontSize: 12.5 }}>{o.frequency}</td>
                      <td style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>{entry?.dueDate || <span style={{ opacity: 0.5 }}>no date</span>}</td>
                      <td>
                        <Tag c={SUPPLIER_STATE[state].tone} style={{ fontSize: 10.5, whiteSpace: "nowrap" }}>
                          {SUPPLIER_STATE[state].label}
                        </Tag>
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {last ? <>{last.at}<div style={{ fontSize: 11, opacity: 0.55 }}>{last.evidence || "no evidence"}</div></>
                          : <span style={{ opacity: 0.5 }}>nothing yet</span>}
                      </td>
                      <td>
                        {onSupplierRecord && (
                          <Btn small variant="secondary" onClick={() => setRecordOn(o)}>Record</Btn>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>

          {recordOn && (
            <div style={{ border: "1px solid var(--color-accent-300)", background: "var(--color-accent-100)", padding: 11 }}>
              <div style={{ ...kicker, marginBottom: 6 }}>Record what you delivered · {recordOn.name}</div>
              <div className="clm-grid-2" style={{ gap: 10 }}>
                <label style={{ fontSize: 12 }}>Delivered on
                  <input className="input" type="date" value={recordDraft.at}
                    onChange={(e) => setRecordDraft((d) => ({ ...d, at: e.target.value }))} />
                </label>
                <label style={{ fontSize: 12 }}>Evidence
                  <input className="input" value={recordDraft.evidence}
                    placeholder={recordOn.evidence || "Certificate, report, reference…"}
                    onChange={(e) => setRecordDraft((d) => ({ ...d, evidence: e.target.value }))} />
                </label>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
                <Btn small variant="primary" onClick={() => {
                  onSupplierRecord(recordOn, { ...recordDraft, by: supplier.signatoryName || supplier.name });
                  setRecordOn(null);
                }}>Record it</Btn>
                <Btn small variant="ghost" onClick={() => setRecordOn(null)}>Cancel</Btn>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
