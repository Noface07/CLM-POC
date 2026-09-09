import { useMemo, useState } from "react";
import { CalendarClock, AlertTriangle, CheckCircle2, Clock, Eye, Timer, FileWarning } from "lucide-react";
import { Tag, Btn, Field, GREEN, AMBER, GRAY, RED, kicker } from "../lib/ui.jsx";
import { assessObligation } from "../lib/obligations.js";
import {
  monitorState, monitorSummary, performanceRecord, daysUntil, DUE_SOON_DAYS, sweep, isDeadline,
} from "../lib/monitoring.js";

const STATE = {
  overdue: { label: "Overdue", tone: RED, icon: AlertTriangle },
  due: { label: "Due", tone: AMBER, icon: Clock },
  upcoming: { label: "On track", tone: GREEN, icon: CalendarClock },
  met: { label: "Met", tone: GREEN, icon: CheckCircle2 },
  watch: { label: "Watch-listed", tone: GRAY, icon: Eye },
  lapsed: { label: "Lapsed", tone: RED, icon: AlertTriangle },
};

function when(iso, today) {
  const left = daysUntil(iso, today);
  if (left == null) return "no date";
  if (left === 0) return "today";
  if (left < 0) return `${Math.abs(left)} day${Math.abs(left) === 1 ? "" : "s"} ago`;
  return `in ${left} day${left === 1 ? "" : "s"}`;
}

// What the contract requires, against what has actually been delivered.
//
// Extraction and validation stop at "this is trackable". Nothing was ever measured
// against a date, which is why the renewal panel could count validated obligations and
// still have no performance record to show for them.
export default function ObligationMonitor({
  obligations, validated, log, today, readOnly, onRecordPerformance, onSetDue, onRunSweep,
  amendmentReview, onRegisterReviewed,
}) {
  const [recordOn, setRecordOn] = useState(null);   // the obligation being recorded against
  const [draft, setDraft] = useState({ at: today, evidence: "" });

  const rows = useMemo(() => (obligations || [])
    .map((o, index) => ({ o, index, a: assessObligation(o), entry: log?.[o.id] }))
    .filter((r) => r.a.track && validated?.[r.o.id])
    .map((r) => ({ ...r, state: monitorState(r.entry, today) }))
    .sort((a, b) => {
      const order = { lapsed: 0, overdue: 1, due: 2, upcoming: 3, watch: 4, met: 5 };
      if (order[a.state] !== order[b.state]) return order[a.state] - order[b.state];
      return String(a.entry?.dueDate || "9999").localeCompare(String(b.entry?.dueDate || "9999"));
    }), [obligations, validated, log, today]);

  const deadlines = rows.filter((r) => isDeadline(r.o));
  const pending = sweep(deadlines.map((r) => ({ index: r.index, obligation: r.o, entry: r.entry })), today);
  const keyOf = (hit) => hit.obligation.id;
  const lapsed = deadlines.filter((r) => r.entry?.lapsed);

  const summary = monitorSummary(rows.map((r) => r.entry), today);
  const record = performanceRecord(rows.map((r) => r.entry), today);

  if (!rows.length) {
    return (
      <div className="card" style={{ marginBottom: "var(--space-4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <CalendarClock size={15} />
          <div className="card-title" style={{ margin: 0 }}>Monitoring</div>
        </div>
        <p className="card-body" style={{ margin: 0 }}>
          Nothing is being monitored yet. Approving a trackable obligation below puts it on a date and starts
          measuring performance against it.
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: "var(--space-4)", gap: "var(--space-3)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <CalendarClock size={15} />
        <div className="card-title" style={{ margin: 0 }}>Monitoring</div>
        <span style={{ fontSize: 11.5, opacity: 0.55 }}>
          {rows.length} obligation{rows.length === 1 ? "" : "s"} on the register · today is {today}
        </span>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {summary.lapsed > 0 && <Tag c={RED}>{summary.lapsed} lapsed</Tag>}
        {summary.overdue > 0 && <Tag c={RED}>{summary.overdue} overdue</Tag>}
        {summary.due > 0 && <Tag c={AMBER}>{summary.due} due within {DUE_SOON_DAYS} days</Tag>}
        {summary.upcoming > 0 && <Tag c={GREEN}>{summary.upcoming} on track</Tag>}
        {summary.met > 0 && <Tag c={GREEN}>{summary.met} met</Tag>}
        {summary.watch > 0 && <Tag c={GRAY}>{summary.watch} watch-listed</Tag>}
      </div>

      {amendmentReview && (
        <div style={{ border: "1px solid var(--color-accent)", background: "var(--color-accent-100)", padding: "10px 11px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 5 }}>
            <FileWarning size={14} />
            <span style={{ ...kicker, margin: 0 }}>Register predates amendment {amendmentReview.amendment.id}</span>
            {!readOnly && onRegisterReviewed && (
              <Btn small variant="primary" style={{ marginLeft: "auto" }} onClick={onRegisterReviewed}>
                Mark the register reviewed
              </Btn>
            )}
          </div>
          <p style={{ margin: "0 0 6px", fontSize: 11.5, lineHeight: 1.6, opacity: 0.85 }}>
            These obligations were read out of the contract as it stood before the amendment took effect
            {amendmentReview.amendment.effectiveDate ? ` on ${amendmentReview.amendment.effectiveDate}` : ""}.
            An amendment is a separate instrument rather than a rewrite, so there is no diff to recompute the
            register from: which duties actually moved is a reading of it. Nothing here is stale automatically,
            and nothing here is safe automatically either.
          </p>
          {amendmentReview.named.length > 0 ? (
            <div style={{ display: "grid", gap: 4 }}>
              <div style={{ fontSize: 11.5, opacity: 0.7 }}>
                The amendment names {amendmentReview.refs.join(", ")}. These monitored obligations sit on those clauses:
              </div>
              {amendmentReview.named.map((o) => (
                <div key={o.id} style={{ fontSize: 12, lineHeight: 1.5 }}>
                  <Tag c={RED} style={{ fontSize: 9.5, marginRight: 6 }}>check</Tag>
                  <strong>{o.clause}</strong> {o.name}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>
              The amendment names no clause number that a monitored obligation sits on, so there is nothing to
              point at. That is not the same as nothing having changed.
            </p>
          )}
        </div>
      )}

      {deadlines.length > 0 && (
        <div style={{ border: "1px solid var(--color-accent-300)", background: "var(--color-accent-100)", padding: "10px 11px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 5 }}>
            <Timer size={14} />
            <span style={{ ...kicker, margin: 0 }}>Scheduled sweep</span>
            <span style={{ fontSize: 11.5, opacity: 0.7 }}>
              {deadlines.length} deadline{deadlines.length === 1 ? "" : "s"} that change the contract on their own
            </span>
            {!readOnly && onRunSweep && (
              <Btn small variant="primary" style={{ marginLeft: "auto" }} onClick={() => onRunSweep()}>
                Run the daily sweep
              </Btn>
            )}
          </div>
          <p style={{ margin: "0 0 6px", fontSize: 11.5, lineHeight: 1.6, opacity: 0.8 }}>
            Everything else here is worked out when you look at it, so it is right without a job running. These are
            not: on the day, the renewal rolls, the cover lapses, the cure period runs out. The sweep records that it
            happened, because after the date there is nothing left to notice.
          </p>
          {pending.length > 0 ? (
            <div style={{ display: "grid", gap: 4 }}>
              {pending.map((hit) => (
                <div key={keyOf(hit)} style={{ fontSize: 12, lineHeight: 1.5 }}>
                  <Tag c={RED} style={{ fontSize: 9.5, marginRight: 6 }}>would fire</Tag>
                  <strong>{hit.obligation.clause}</strong> {hit.obligation.name}
                  <span style={{ opacity: 0.65 }}> · passed {hit.dueDate}. {hit.effect}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>
              Nothing has passed its date. The next sweep would do nothing, which is the normal case.
            </p>
          )}
          {lapsed.length > 0 && (
            <div style={{ marginTop: 8, paddingTop: 7, borderTop: "1px solid var(--color-accent-300)", display: "grid", gap: 4 }}>
              {lapsed.map(({ o, index, entry }) => (
                <div key={index} style={{ fontSize: 12, lineHeight: 1.5 }}>
                  <Tag c={GRAY} style={{ fontSize: 9.5, marginRight: 6 }}>recorded</Tag>
                  <strong>{o.clause}</strong> lapsed {entry.lapsed.at}
                  <span style={{ opacity: 0.65 }}> · {entry.lapsed.effect}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ background: "var(--color-neutral-100)", border: "1px solid var(--color-divider)", padding: "9px 11px" }}>
        <div style={{ ...kicker, marginBottom: 4 }}>Performance record</div>
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6 }}>
          <strong>{record.delivered} of {record.scheduled}</strong> scheduled obligations have something recorded
          against them, across {record.events} logged event{record.events === 1 ? "" : "s"}.
          {record.missed > 0
            ? ` ${record.missed} passed its date with nothing recorded, which is the number a renewal conversation turns on.`
            : " Nothing has passed its date unrecorded."}
        </p>
      </div>

      <div style={{ overflowX: "auto" }}>
        <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Obligation</th><th>Owner</th><th>Frequency</th><th>Next due</th>
              <th>State</th><th>Last recorded</th><th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ o, index, entry, state }) => {
              const Icon = STATE[state].icon;
              const last = (entry?.history || [])[(entry?.history || []).length - 1];
              return (
                <tr key={index}>
                  <td style={{ maxWidth: 280 }}>
                    <div style={{ fontWeight: 600 }}>{o.name}</div>
                    <div style={{ fontSize: 11, opacity: 0.55 }}>clause {o.clause}</div>
                  </td>
                  <td style={{ fontSize: 12.5 }}>{o.responsible}</td>
                  <td style={{ fontSize: 12.5 }}>{o.frequency}</td>
                  <td style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
                    {entry?.dueDate ? (
                      <>
                        {entry.dueDate}
                        <div style={{ fontSize: 11, opacity: 0.55 }}>{when(entry.dueDate, today)}</div>
                      </>
                    ) : <span style={{ opacity: 0.5 }}>no date</span>}
                  </td>
                  <td>
                    <Tag c={STATE[state].tone} style={{ fontSize: 10.5, whiteSpace: "nowrap" }}>
                      <Icon size={10} style={{ marginRight: 4 }} />{STATE[state].label}
                    </Tag>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {last ? (
                      <>
                        {last.at}
                        <div style={{ fontSize: 11, opacity: 0.55 }}>{last.evidence || "no evidence attached"}</div>
                      </>
                    ) : <span style={{ opacity: 0.5 }}>nothing yet</span>}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {!readOnly && (
                      <Btn
                        small variant="secondary"
                        onClick={() => { setRecordOn(o); setDraft({ at: today, evidence: "" }); }}
                      >Record</Btn>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {recordOn != null && (
        <div style={{ border: "1px solid var(--color-accent-300)", background: "var(--color-accent-100)", padding: 11 }}>
          <div style={{ ...kicker, marginBottom: 6 }}>
            Record performance · {recordOn.name}
          </div>
          <div className="clm-grid-2" style={{ gap: 10 }}>
            <Field label="Delivered on">
              <input
                className="input" type="date" value={draft.at}
                onChange={(e) => setDraft((d) => ({ ...d, at: e.target.value }))}
              />
            </Field>
            <Field label={`Evidence (${recordOn.evidence || "what proves it"})`}>
              <input
                className="input" value={draft.evidence}
                placeholder="Certificate reference, report name, ticket number…"
                onChange={(e) => setDraft((d) => ({ ...d, evidence: e.target.value }))}
              />
            </Field>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap", alignItems: "center" }}>
            <Btn
              small variant="primary"
              onClick={() => {
                onRecordPerformance(recordOn, { ...draft, by: "Contract Manager" });
                setRecordOn(null);
              }}
            >Record it</Btn>
            <Btn small variant="ghost" onClick={() => setRecordOn(null)}>Cancel</Btn>
            <input
              className="input" type="date" style={{ marginLeft: "auto", maxWidth: 160, fontSize: 11.5 }}
              value={log?.[recordOn.id]?.dueDate || ""}
              onChange={(e) => onSetDue(recordOn, e.target.value)}
              title="Correct the due date"
            />
            <span style={{ fontSize: 10.5, opacity: 0.5 }}>due date</span>
          </div>
        </div>
      )}
    </div>
  );
}
