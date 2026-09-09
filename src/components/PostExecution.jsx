import { Tag, Btn, GREEN, AMBER, RED, GRAY, kicker, formatDate } from "../lib/ui.jsx";
import AmendmentTrack from "./AmendmentTrack.jsx";
import {
  CalendarClock, ListChecks, FileDiff, LogOut, TrendingUp, AlertTriangle, Infinity as InfinityIcon,
} from "lucide-react";

const DAY = 86400000;

function daysBetween(from, to) {
  return Math.round((new Date(to) - new Date(from)) / DAY);
}

function addDays(from, n) {
  return new Date(new Date(from).getTime() + n * DAY);
}

function humanDuration(days) {
  if (days < 45) return `${days} days`;
  if (days < 365) return `about ${Math.round(days / 30)} months`;
  const years = days / 365;
  return years < 1.75 ? "about a year" : `about ${years.toFixed(1).replace(/\.0$/, "")} years`;
}

const CLOSURE_TASKS = [
  { key: "assistance", label: "Transition assistance delivered",
    why: "Per clause 9.3: the outgoing supplier runs the handover, not the incoming one." },
  { key: "data", label: "Asset register, maintenance history and compliance records handed back",
    why: "At no charge. Without it the replacement supplier starts blind and the statutory record has a gap." },
  { key: "access", label: "Access credentials and badges revoked",
    why: "The one item that is nobody's job by default and everybody's problem afterwards." },
  { key: "invoice", label: "Final invoice agreed and settled",
    why: "Including any evidenced committed costs, if the termination clause allows them." },
  { key: "obligations", label: "Surviving obligations identified and re-homed",
    why: "Confidentiality and record retention outlive the contract. Somebody still owns them." },
];

function Milestone({ label, date, note, tone, passed }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "10px 1fr", gap: 10, alignItems: "start" }}>
      <span style={{
        width: 10, height: 10, borderRadius: "50%", marginTop: 4,
        background: passed ? "var(--color-neutral-300)" : (tone?.color || "var(--color-accent)"),
        boxShadow: passed ? "none" : `0 0 0 3px ${tone?.bg || "var(--color-accent-100)"}`,
      }} />
      <div style={{ opacity: passed ? 0.5 : 1 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
          <span style={{ fontSize: 12, opacity: 0.7 }}>{date}</span>
        </div>
        {note && <div style={{ fontSize: 11.5, opacity: 0.7, lineHeight: 1.5, marginTop: 1 }}>{note}</div>}
      </div>
    </div>
  );
}

export default function PostExecution({
  contract, canManageLifecycle, today = new Date(),
  obligations, trackedCount, validatedCount, monitor,
  amendment, onCreateAmendment, onAdvanceAmendment, parentVersion,
  expiryStage, onExpiryReminders, onExpire,
  renewalTaskCreated, onCreateRenewal,
  terminationState, terminationDraft, onInitiateTermination, onConfirmTermination,
  closureTasks = {}, onToggleClosure, onElapseNotice,
  noticeDays = 90, onGoToObligations,
}) {
  const evergreen = Boolean(contract.evergreen);
  const end = contract.endDate ? new Date(contract.endDate) : null;
  const daysToEnd = end ? daysBetween(today, end) : null;
  const noticeDeadline = end ? addDays(end, -noticeDays) : null;
  const daysToNotice = noticeDeadline ? daysBetween(today, noticeDeadline) : null;

  // If notice were served today, when does the contract actually end?
  const noticeLands = addDays(today, noticeDays);
  const noticeOvershoots = end ? noticeLands >= end : false;
  const savedDays = end ? Math.max(0, daysBetween(noticeLands, end)) : null;

  const terminationEffective = terminationDraft?.effectiveDate ? new Date(terminationDraft.effectiveDate) : null;
  const daysToTermination = terminationEffective ? daysBetween(today, terminationEffective) : null;
  const closureDone = CLOSURE_TASKS.filter((t) => closureTasks[t.key]).length;
  const closureComplete = closureDone === CLOSURE_TASKS.length;

  const validationGap = trackedCount - validatedCount;
  const health = trackedCount === 0 ? "none"
    : validatedCount === trackedCount ? "good"
    : validatedCount === 0 ? "bad" : "partial";

  return (
    <div className="card" style={{ gap: "var(--space-4)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div className="card-title" style={{ margin: 0 }}>After execution</div>
        {evergreen
          ? <Tag c={AMBER} style={{ fontSize: 10.5, display: "inline-flex", alignItems: "center", gap: 4 }}><InfinityIcon size={11} />Evergreen</Tag>
          : <Tag c={GRAY} style={{ fontSize: 10.5 }}>{humanDuration(daysToEnd)} to expiry</Tag>}
        {terminationState === "terminated" && <Tag c={RED} style={{ fontSize: 10.5 }}>Terminated</Tag>}
      </div>

      <div>
        <div style={{ ...kicker, display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
          <CalendarClock size={12} /> Key dates
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          <Milestone
            label="Effective" date={formatDate(contract.startDate)} passed
            note="Obligations began running from this date."
          />
          {evergreen ? (
            <>
              <Milestone
                label="Annual price review" date="each anniversary" tone={GRAY}
                note="Replaces the renewal negotiation. There is no expiry to force one."
              />
              <Milestone
                label="Exit" date={`${noticeDays} days' notice, at any time`} tone={AMBER}
                note="The only control on an evergreen contract. Nothing else forces a review of it."
              />
            </>
          ) : (
            <>
              <Milestone
                label="Notice deadline" date={formatDate(noticeDeadline)}
                tone={daysToNotice != null && daysToNotice < 60 ? RED : AMBER}
                passed={daysToNotice != null && daysToNotice < 0}
                note={daysToNotice == null ? null
                  : daysToNotice < 0
                    ? `Passed ${Math.abs(daysToNotice)} days ago. The contract has already auto-renewed unless notice was served.`
                    : `${humanDuration(daysToNotice)} away. Miss it and the contract renews automatically.`}
              />
              <Milestone
                label="Expiry" date={formatDate(contract.endDate)} tone={GRAY}
                passed={daysToEnd != null && daysToEnd < 0}
                note={daysToEnd != null && daysToEnd >= 0 ? `${humanDuration(daysToEnd)} away.` : "Passed."}
              />
            </>
          )}
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: "var(--space-3)" }}>
        <div style={{ ...kicker, display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
          <ListChecks size={12} /> Obligation performance
        </div>
        {!obligations ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Tag c={AMBER} style={{ fontSize: 10.5 }}>Not extracted</Tag>
            <span style={{ fontSize: 12.5, opacity: 0.75, lineHeight: 1.55 }}>
              Nothing is being tracked on this contract yet. Extraction is a step; keeping the obligations is what the
              active phase <em>is</em>.
            </span>
            <Btn small variant="secondary" onClick={onGoToObligations}>Extract obligations</Btn>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Tag c={health === "good" ? GREEN : health === "bad" ? RED : AMBER} style={{ fontSize: 10.5 }}>
              {validatedCount}/{trackedCount} validated{monitor?.overdue ? `, ${monitor.overdue} overdue` : ""}
            </Tag>
            <span style={{ fontSize: 12.5, opacity: 0.75, lineHeight: 1.55, flex: 1, minWidth: 200 }}>
              {monitor?.overdue > 0
                ? `${monitor.overdue} obligation${monitor.overdue === 1 ? " has" : "s have"} passed the date with nothing recorded against ${monitor.overdue === 1 ? "it" : "them"}. That is the performance record, and it is the thing a renewal conversation turns on.`
                : validationGap > 0
                ? `${validationGap} trackable obligation${validationGap === 1 ? "" : "s"} still unvalidated, so ${validationGap === 1 ? "it fires" : "they fire"} no reminders. On a renewal decision this is the number that matters: an unvalidated obligation has no performance record to argue from.`
                : "Every trackable obligation is validated and firing reminders."}
            </span>
            <Btn small variant="ghost" onClick={onGoToObligations}>Open</Btn>
          </div>
        )}
      </div>

      <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: "var(--space-3)" }}>
        <div style={{ ...kicker, display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
          <FileDiff size={12} /> Amendments
        </div>
        <AmendmentTrack
          amendment={amendment}
          parentId={contract.id}
          parentVersion={parentVersion}
          canManage={canManageLifecycle}
          onCreate={onCreateAmendment}
          onAdvance={onAdvanceAmendment}
        />
        {amendment && (
          <p style={{ fontSize: 11.5, opacity: 0.6, margin: "10px 0 0", lineHeight: 1.55 }}>
            One amendment is a change. A chain of them is drift: each looks small, and the contract ends up a long way
            from what was approved. The register is here so the cumulative effect is visible, not the individual one.
          </p>
        )}
      </div>

      {!evergreen && (
        <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: "var(--space-3)" }}>
          <div style={{ ...kicker, display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
            <TrendingUp size={12} /> Renewal
          </div>
          {renewalTaskCreated ? (
            <Tag c={GRAY} style={{ fontSize: 10.5 }}>
              Renewal task open · {validatedCount}/{trackedCount} obligations validated as the performance record
            </Tag>
          ) : expiryStage === "expired" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Tag c={RED} style={{ fontSize: 10.5 }}>Expired without renewal</Tag>
              <span style={{ fontSize: 12.5, opacity: 0.75 }}>
                Services may still be running with no contract behind them. That is the exposure, not the paperwork.
              </span>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {[120, 90, 60, 30].map((d) => (
                  <Tag key={d} c={expiryStage ? GREEN : GRAY} style={{ fontSize: 10 }}>
                    {d}d {expiryStage ? "sent" : "pending"}
                  </Tag>
                ))}
              </div>
              {health === "bad" && obligations && (
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "#fdf1da",
                  border: "1px solid #f5dfa8", color: "#7a4a05", padding: 9, fontSize: 12, lineHeight: 1.55 }}>
                  <AlertTriangle size={14} style={{ flex: "none", marginTop: 1 }} />
                  <span>
                    No obligations have been validated, so there is no performance record for this term. Renewing on
                    that basis renews on the supplier's account of how it went.
                  </span>
                </div>
              )}
              {canManageLifecycle && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Btn onClick={onCreateRenewal} variant="secondary" small>Open renewal decision</Btn>
                  {!expiryStage && <Btn onClick={onExpiryReminders} variant="ghost" small>Simulate approaching expiry</Btn>}
                  {expiryStage === "reminders" && <Btn onClick={onExpire} variant="ghost" small>Simulate: not renewed → Expired</Btn>}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: "var(--space-3)" }}>
        <div style={{ ...kicker, display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
          <LogOut size={12} /> Termination
        </div>
        {terminationState === "terminated" ? (
          <div style={{ display: "grid", gap: 6 }}>
            <Tag c={RED} style={{ fontSize: 10.5, justifySelf: "start" }}>Terminated</Tag>
            <p style={{ margin: 0, fontSize: 12.5, opacity: 0.75, lineHeight: 1.6 }}>
              The notice period has run and every closure activity is confirmed. The contract is over; the surviving
              clauses (confidentiality, liability for the term, and the record-retention obligations) are not.
            </p>
          </div>
        ) : terminationState === "in_progress" ? (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ background: "var(--color-neutral-100)", border: "1px solid var(--color-divider)", padding: 10 }}>
              <div style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
                <div><strong>{terminationDraft.type}</strong> · {terminationDraft.noticeBasis}</div>
                <div>Notice served {formatDate(terminationDraft.servedOn)}</div>
                <div>Takes effect <strong>{formatDate(terminationDraft.effectiveDate)}</strong>
                  {daysToTermination != null && (
                    daysToTermination > 0
                      ? <>, {humanDuration(daysToTermination)} away</>
                      : <>, reached</>
                  )}
                </div>
              </div>
              <p style={{ margin: "8px 0 0", fontSize: 12, opacity: 0.75, lineHeight: 1.6 }}>
                {daysToTermination > 0
                  ? "The contract is fully live until that date. Services continue, charges accrue, and every validated obligation still fires. A contract under notice is not a contract on hold."
                  : "The notice period has run. What remains is the closure checklist."}
              </p>
            </div>

            <div>
              <div style={{ ...kicker, marginBottom: 6 }}>Closure activities</div>
              <div style={{ display: "grid", gap: 5 }}>
                {CLOSURE_TASKS.map((task) => (
                  <label
                    key={task.key}
                    style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 12.5,
                      lineHeight: 1.55, cursor: canManageLifecycle ? "pointer" : "default" }}
                  >
                    <input
                      type="checkbox" style={{ marginTop: 3 }}
                      checked={Boolean(closureTasks[task.key])}
                      disabled={!canManageLifecycle}
                      onChange={() => onToggleClosure?.(task.key)}
                    />
                    <span>
                      {task.label}
                      <span style={{ display: "block", fontSize: 11, opacity: 0.6 }}>{task.why}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {canManageLifecycle && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <Btn
                  onClick={onConfirmTermination} variant="secondary" small
                  disabled={!closureComplete || daysToTermination > 0}
                >Mark Terminated</Btn>
                {daysToTermination > 0 && (
                  <Btn onClick={onElapseNotice} variant="ghost" small>Simulate the notice period elapsing</Btn>
                )}
                <span style={{ fontSize: 11.5, opacity: 0.65 }}>
                  {daysToTermination > 0
                    ? `Cannot complete before ${formatDate(terminationDraft.effectiveDate)}.`
                    : closureComplete
                      ? "All closure activities confirmed."
                      : `${CLOSURE_TASKS.length - closureDone} closure activit${CLOSURE_TASKS.length - closureDone === 1 ? "y" : "ies"} outstanding.`}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ background: "var(--color-neutral-100)", border: "1px solid var(--color-divider)", padding: 9 }}>
              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6 }}>
                Notice served today runs {noticeDays} days and ends the contract on{" "}
                <strong>{formatDate(noticeLands)}</strong>.
                {evergreen ? " There is no expiry date to compare that against. This is the only way the contract ends."
                  : noticeOvershoots
                    ? " That is on or after the contract's own expiry date, so terminating for convenience achieves nothing here. Let it expire, and serve notice of non-renewal instead."
                    : ` That is ${humanDuration(savedDays)} before expiry, ${savedDays < 120
                        ? "little enough that letting it run to term is usually cheaper than mobilising a replacement."
                        : "long enough to be worth doing, provided a replacement supplier can be mobilised in time."}`}
              </p>
            </div>
            <p style={{ margin: 0, fontSize: 11.5, opacity: 0.6, lineHeight: 1.6 }}>
              That is the convenience route, exercisable without a reason. Terminating for cause under clause 9.2 is a
              different instrument: it needs an evidenced material breach and runs a 30-day cure period rather than the
              full notice period, so it is faster, but only where the breach is actually made out.
            </p>
            {canManageLifecycle && (
              <div><Btn onClick={onInitiateTermination} variant="secondary" small>Initiate termination</Btn></div>
            )}
          </div>
        )}
      </div>

      {!canManageLifecycle && (
        <p style={{ fontSize: 10.5, opacity: 0.45, margin: 0 }}>
          Lifecycle actions are owned by the Contract Manager role.
        </p>
      )}
    </div>
  );
}
