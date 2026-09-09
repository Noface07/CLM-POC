import { useMemo, useState } from "react";
import { Sparkles, Loader2, FileCheck2, Plus, Filter, CalendarClock, Zap, Infinity as InfinityIcon, Archive } from "lucide-react";
import { Tag, Btn, GREEN, AMBER, GRAY, RED } from "../lib/ui.jsx";
import { assessObligation, MODE_LABEL, MODE_HINT } from "../lib/obligations.js";
import ObligationMonitor from "./ObligationMonitor.jsx";

const MODE_ICON = { calendar: CalendarClock, trigger: Zap, standing: InfinityIcon, background: Archive };
const MODE_TONE = { calendar: GREEN, trigger: AMBER, standing: GRAY, background: GRAY };
const IMPORTANCE_TONE = { High: RED, Medium: AMBER, Low: GRAY };

export default function ObligationsPage({
  contractId, supplierName, contractIsLive, canManageLifecycle, readOnly,
  extractedText, extractingPdf, extractPdfError, runPdfExtraction,
  obligations, obligationsLoading, runObligationExtraction, obligationRunMeta,
  validated, onValidate, onDelete, onAdd,
  obligationLog, today, onRecordPerformance, onSetDue, onRunSweep, amendmentReview, onRegisterReviewed,
  editingIndex, setEditingIndex, editDraft, setEditDraft, onSaveEdit,
}) {
  const [showAll, setShowAll] = useState(false);

  const assessed = useMemo(
    () => (obligations || []).map((o, index) => ({ o, index, a: assessObligation(o) })),
    [obligations]
  );
  const trackedRows = assessed.filter((x) => x.a.track);
  const untrackedRows = assessed.filter((x) => !x.a.track);
  const rows = showAll ? assessed : trackedRows;
  return (
    <>
      <div style={{ marginBottom: "var(--space-6)" }}>
        <h1 style={{ marginBottom: 4 }}>Obligations</h1>
        <p style={{ margin: 0, opacity: 0.65, fontSize: 14 }}>
          {contractId} · {supplierName}. Extracted from the executed contract after signature.
        </p>
      </div>

      {!contractIsLive ? (
        <p className="text-muted">
          Obligations appear once this contract is executed. Extracting them from a draft would produce a tracked duty
          against wording that has not been agreed.
        </p>
      ) : !obligations ? (
        <div className="card" style={{ border: "1px dashed var(--color-accent-300)", gap: "var(--space-3)", maxWidth: 680 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Tag outline>AI</Tag>
            <div className="card-title" style={{ margin: 0 }}>Extract obligations</div>
          </div>

          {!extractedText ? (
            <>
              <p style={{ fontSize: 12.5, margin: 0, lineHeight: 1.6 }}>
                Step 1: pull the real text out of the executed PDF. This genuinely opens and parses the signed
                document in your browser with pdf.js; it is not a hardcoded string, which is why it reflects whatever
                the negotiation actually settled on.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <Btn
                  onClick={runPdfExtraction} disabled={extractingPdf}
                  icon={extractingPdf ? Loader2 : FileCheck2} spin={extractingPdf} variant="secondary"
                >
                  {extractingPdf ? "Reading PDF…" : "Extract text from the executed PDF"}
                </Btn>
              </div>
              {extractPdfError && (
                <p style={{ fontSize: 12, color: "var(--color-accent-700)", margin: 0 }}>{extractPdfError}</p>
              )}
            </>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, textTransform: "uppercase",
                letterSpacing: "0.08em", opacity: 0.5, margin: "4px 0 -4px" }}>
                <Tag c={GREEN} style={{ fontSize: 9 }}>✓ Extracted</Tag>
                {extractedText.length.toLocaleString()} characters, read from the PDF just now, client-side
              </div>
              <div
                className="clm-force-ink"
                style={{ background: "var(--color-neutral-100)", border: "1px solid var(--color-divider)", padding: 12,
                  color: "#201e1d", whiteSpace: "pre-line", fontSize: 12, maxHeight: 200, overflowY: "auto", lineHeight: 1.6 }}
              >
                {extractedText}
              </div>
              <p style={{ fontSize: 12.5, margin: 0 }}>Step 2: send this extracted text to AI to identify obligations.</p>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                {!readOnly && (
                  <Btn
                    onClick={runObligationExtraction} disabled={obligationsLoading}
                    icon={obligationsLoading ? Loader2 : Sparkles} spin={obligationsLoading} variant="primary"
                  >
                    {obligationsLoading ? "Extracting…" : "Extract obligations with AI"}
                  </Btn>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          <ObligationMonitor
            obligations={obligations}
            validated={validated}
            log={obligationLog}
            today={today}
            readOnly={readOnly}
            onRecordPerformance={onRecordPerformance}
            onSetDue={onSetDue}
            onRunSweep={onRunSweep}
            amendmentReview={amendmentReview}
            onRegisterReviewed={onRegisterReviewed}
          />

          <div className="card" style={{ marginBottom: "var(--space-4)", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Filter size={15} />
              <div className="card-title" style={{ margin: 0, fontSize: 15 }}>
                {trackedRows.length} of {assessed.length} extracted obligations are trackable
              </div>
              <Btn small variant="ghost" onClick={() => setShowAll((v) => !v)} style={{ marginLeft: "auto" }}>
                {showAll ? `Hide the ${untrackedRows.length} not tracked` : `Show the ${untrackedRows.length} not tracked`}
              </Btn>
            </div>
            <p style={{ margin: 0, fontSize: 12.5, opacity: 0.75, lineHeight: 1.6, maxWidth: 820 }}>
              Extraction over-produces on purpose: it is looking for every duty in the document. A reminder needs
              three things the model cannot invent: <strong>a date or a recurrence</strong>, <strong>a named
              owner</strong>, and <strong>a consequence for missing it</strong>. Rows without all three are recorded
              and left off the schedule, because a reminder nobody can act on trains people to ignore reminders, and
              the ones they then ignore are the insurance renewals.
            </p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["calendar", "trigger", "standing", "background"].map((mode) => {
                const n = assessed.filter((x) => x.a.mode === mode).length;
                if (!n) return null;
                const Icon = MODE_ICON[mode];
                return (
                  <Tag key={mode} c={MODE_TONE[mode]} style={{ fontSize: 10.5, display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Icon size={11} />{n} {MODE_LABEL[mode].toLowerCase()}
                  </Tag>
                );
              })}
            </div>
            <p style={{ fontSize: 11.5, opacity: 0.55, margin: 0, lineHeight: 1.6 }}>
              AI extraction is advisory. An obligation becomes authoritative, with reminders, only once approved.
              Every row starts <strong>Pending Validation</strong>.
            </p>
          </div>
          <div style={{ overflowX: "auto" }}>
            <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Obligation</th><th>Clause</th><th>Responsible</th><th>Deadline / trigger</th>
                  <th>Frequency</th><th>Tracking</th><th>Status</th><th />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ o, index: i, a }) => {
                  const pending = !validated[o.id];
                  if (editingIndex === i) {
                    return (
                      <tr key={i} style={{ background: "color-mix(in srgb, #fdf1da 55%, transparent)" }}>
                        <td colSpan={8}>
                          <div className="clm-grid-2" style={{ gap: 8, alignItems: "end" }}>
                            {[
                              ["name", "Obligation", "1 / -1"], ["id", "Obligation ID"], ["clause", "Clause"],
                              ["responsible", "Responsible party"], ["notify", "Notify (recipient)"],
                              ["frequency", "Frequency"], ["due", "Deadline / trigger"], ["evidence", "Evidence required"],
                            ].map(([key, label, span]) => (
                              <div key={key} className="field" style={{ margin: 0, gridColumn: span }}>
                                <label>{label}</label>
                                <input
                                  className="input" value={editDraft[key] || ""}
                                  onChange={(e) => setEditDraft((d) => ({ ...d, [key]: e.target.value }))}
                                />
                              </div>
                            ))}
                            <div className="field" style={{ margin: 0 }}>
                              <label>Confidence</label>
                              <select
                                className="input" value={editDraft.confidence || "Medium"}
                                onChange={(e) => setEditDraft((d) => ({ ...d, confidence: e.target.value }))}
                              >
                                <option>High</option><option>Medium</option><option>Low</option>
                              </select>
                            </div>
                            <div className="field" style={{ margin: 0, gridColumn: "1 / -1" }}>
                              <label>Consequence / remedy</label>
                              <input
                                className="input" value={editDraft.consequence || ""}
                                onChange={(e) => setEditDraft((d) => ({ ...d, consequence: e.target.value }))}
                              />
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                            <Btn onClick={() => onSaveEdit(i)} variant="primary" small>Save</Btn>
                            <Btn onClick={() => setEditingIndex(null)} variant="secondary" small>Cancel</Btn>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr
                      key={i}
                      style={{
                        background: !a.track ? "transparent"
                          : pending ? "color-mix(in srgb, #fdf1da 55%, transparent)" : "transparent",
                        opacity: a.track ? 1 : 0.62,
                      }}
                    >
                      <td>
                        <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                          {o.name}{o.manual && <Tag c={GRAY} style={{ fontSize: 10 }}>Manual</Tag>}
                        </div>
                        <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>
                          {o.id}{o.notify ? ` · Notify: ${o.notify}` : ""} · Evidence: {o.evidence}
                        </div>
                        <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>If missed: {o.consequence}</div>
                      </td>
                      <td className="text-muted">{o.clause}</td>
                      <td>{o.responsible}</td>
                      <td>{o.due}</td>
                      <td>{o.frequency}</td>
                      <td>
                        <Tag c={MODE_TONE[a.mode]} style={{ fontSize: 10 }} title={MODE_HINT[a.mode]}>
                          {MODE_LABEL[a.mode]}
                        </Tag>
                        <div className="text-muted" style={{ fontSize: 10.5, marginTop: 3, maxWidth: 210, lineHeight: 1.45 }}>
                          {a.reason}
                        </div>
                      </td>
                      <td>
                        {a.track
                          ? <Tag c={pending ? AMBER : GREEN}>{pending ? "Pending Validation" : "Validated · Tracked"}</Tag>
                          : <Tag c={GRAY}>Not scheduled</Tag>}
                        {a.track && (
                          <div style={{ marginTop: 4 }}>
                            <Tag c={IMPORTANCE_TONE[a.importance]} style={{ fontSize: 9.5 }}>{a.importance} impact</Tag>
                          </div>
                        )}
                      </td>
                      <td>
                        {canManageLifecycle && (
                          <div style={{ display: "flex", gap: 6 }}>
                            {pending && a.track && (
                              <Btn onClick={() => onValidate(i, o)} variant="secondary" small>Approve</Btn>
                            )}
                            {pending && (
                              <Btn onClick={() => { setEditingIndex(i); setEditDraft(o); }} variant="secondary" small>Edit</Btn>
                            )}
                            <Btn onClick={() => onDelete(i, o)} variant="ghost" small>Delete</Btn>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>

          {canManageLifecycle ? (
            <div style={{ marginTop: 8 }}>
              <Btn onClick={onAdd} icon={Plus} variant="secondary" small>Add obligation manually</Btn>
            </div>
          ) : (
            <p style={{ fontSize: 10.5, opacity: 0.45, margin: "8px 0 0" }}>
              Obligation validation is owned by the Contract Manager role.
            </p>
          )}
          <p style={{ fontSize: 11.5, opacity: 0.5, margin: "8px 0 0", maxWidth: 820, lineHeight: 1.6 }}>
            Rows still "Pending Validation" are not yet tracked: no reminder fires until a human approves them. Rows
            marked <em>Not scheduled</em> cannot be approved into a schedule at all; edit one to add the owner,
            deadline or consequence it is missing and it becomes trackable.
          </p>
          {obligationRunMeta && (
            <p style={{ fontSize: 10.5, opacity: 0.4, margin: "8px 0 0", borderTop: "1px solid var(--color-divider)", paddingTop: 8 }}>
              {obligationRunMeta.description}
            </p>
          )}
        </>
      )}
    </>
  );
}
