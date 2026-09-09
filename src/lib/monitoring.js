// Monitoring a validated obligation.
//
// Extraction says what the contract requires and assessObligation says whether that can
// be tracked at all. Neither of them makes anything happen. This is the part that does:
// a date the duty falls due, a state derived from that date and today, and a record of
// what was actually delivered against it.
//
// The clause's own wording is prose ("within 5 business days of request", "per the notice
// period in clause 9.1"). It is not a date and cannot honestly be parsed into one, which
// is why the first due date is set by a person on validation and the cycle carries it
// forward from there.

const CYCLES = [
  { test: /\bannual|\byear/i, label: "Annually", months: 12 },
  { test: /\bquarter/i, label: "Quarterly", months: 3 },
  { test: /\bmonth/i, label: "Monthly", months: 1 },
  { test: /\bfortnight|\bbi-?week/i, label: "Fortnightly", days: 14 },
  { test: /\bweek/i, label: "Weekly", days: 7 },
  { test: /\bdaily|\bevery day/i, label: "Daily", days: 1 },
];

export const DUE_SOON_DAYS = 30;

export function cycleOf(frequency) {
  const text = String(frequency || "");
  return CYCLES.find((c) => c.test.test(text)) || null;
}

export function addCycle(iso, cycle) {
  const date = new Date(iso);
  if (isNaN(date)) return null;
  if (cycle?.months) date.setMonth(date.getMonth() + cycle.months);
  else if (cycle?.days) date.setDate(date.getDate() + cycle.days);
  else return null;
  return toIso(date);
}

export function toIso(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d)) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// A sensible first due date to offer: one cycle after the contract starts, or after the
// day it was validated if the contract is already running.
export function suggestedFirstDue(obligation, { start, today }) {
  const cycle = cycleOf(obligation?.frequency);
  if (!cycle) return null;
  const anchor = start && new Date(start) > new Date(today) ? start : today;
  return addCycle(anchor, cycle);
}

export function daysUntil(iso, today) {
  if (!iso) return null;
  const a = new Date(`${toIso(today)}T00:00:00`);
  const b = new Date(`${iso}T00:00:00`);
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/**
 * @returns {"met"|"overdue"|"due"|"upcoming"|"watch"}
 *   met      nothing outstanding: a one-off that has been delivered
 *   overdue  the date has passed and nothing was recorded for this cycle
 *   due      falls due inside the notice window
 *   upcoming dated, but not yet near
 *   watch    no date to fall due on, so it is watch-listed rather than scheduled
 */
export function monitorState(entry, today) {
  if (!entry) return "watch";
  if (entry.lapsed) return "lapsed";
  if (entry.closed) return "met";
  if (!entry.dueDate) return "watch";
  const left = daysUntil(entry.dueDate, today);
  if (left == null) return "watch";
  if (left < 0) return "overdue";
  if (left <= DUE_SOON_DAYS) return "due";
  return "upcoming";
}

// Recording what was actually delivered.
//
// A recurring duty is never finished, so meeting it rolls the date to the next cycle
// rather than closing it. A one-off is finished, and says so.
export function recordPerformance(entry, obligation, { at, evidence, by }) {
  const cycle = cycleOf(obligation?.frequency);
  const history = [...(entry?.history || []), {
    at, evidence: evidence || "", by, forDue: entry?.dueDate || null,
  }];
  if (!cycle) return { ...entry, history, closed: true, dueDate: entry?.dueDate || null };
  return {
    ...entry,
    history,
    closed: false,
    dueDate: addCycle(entry?.dueDate || at, cycle),
  };
}

// The obligations that genuinely need a scheduler.
//
// Everything above is derived: overdue is a function of a date and today, so it is
// correct the moment anybody looks and no job is needed to keep it true. These are
// different. Here the passage of the date changes the position by itself, with nobody
// acting: a renewal window closes and the contract rolls for another year, a certificate
// expires and cover has lapsed, a cure period runs out and a termination right comes
// into existence. Nobody clicks anything, and the change is not reversible by noticing
// it late.
//
// That is why it has to be swept rather than computed on read. The state is not "this
// date has passed" but "on this date, this happened", and that fact has to be captured
// at the time to be worth anything afterwards.

export function isDeadline(obligation) {
  return Boolean(obligation?.lapse?.effect);
}

/**
 * What the daily job would do if it ran now. Pure: it decides nothing and writes
 * nothing, which is what makes it testable without a clock.
 *
 * @returns {Array<{index, obligation, entry, dueDate, effect}>}
 */
export function sweep(register, today) {
  const out = [];
  for (const { index, obligation, entry } of register) {
    if (!isDeadline(obligation) || !entry?.dueDate || entry.lapsed) continue;
    if (daysUntil(entry.dueDate, today) >= 0) continue;
    out.push({
      index,
      obligation,
      entry,
      dueDate: entry.dueDate,
      effect: obligation.lapse.effect,
    });
  }
  return out;
}

// Recording that it happened, on the day it happened rather than the day somebody looked.
export function applyLapse(entry, { at, effect }) {
  return {
    ...entry,
    lapsed: { at, effect, onDue: entry?.dueDate || null },
    history: [...(entry?.history || []), { at, evidence: `Lapsed: ${effect}`, by: "Scheduled sweep", forDue: entry?.dueDate || null }],
  };
}

// An amendment against a register extracted before it existed.
//
// An amendment is a separate instrument that varies the agreement; it does not rewrite
// the clauses in place, so there is no diff to take and nothing to recompute. Which
// duties it actually changes is a reading, not an arithmetic, and inventing an answer
// would be worse than admitting that.
//
// What can be said honestly is narrower and still useful: the register was extracted
// from the contract as it stood before, and here are the obligations sitting on clauses
// the amendment names. Somebody confirms the rest.
export function amendmentImpact(obligations, amendment) {
  if (!amendment) return { named: [], refs: [] };
  const prose = [amendment.reason, amendment.text, amendment.title].filter(Boolean).join(" ");
  const refs = [...new Set(
    [...prose.matchAll(/\b(?:clause|clauses|section|paragraph)s?\s+(\d+(?:\.\d+)*)/gi)].map((m) => m[1])
  )];
  const named = (obligations || []).filter((o) => refs.includes(String(o.clause)));
  return { named, refs };
}

export function monitorSummary(entries, today) {
  const counts = { overdue: 0, due: 0, upcoming: 0, met: 0, watch: 0, lapsed: 0 };
  for (const entry of entries) counts[monitorState(entry, today)]++;
  return { ...counts, total: entries.length, atRisk: counts.overdue + counts.due + counts.lapsed };
}

// The thing a renewal decision actually needs: did they do what they promised, and can
// we show it? A duty with a date and nothing recorded against it is not evidence of
// compliance, it is an absence of evidence.
export function performanceRecord(entries, today) {
  const scheduled = entries.filter((e) => e.dueDate || e.closed);
  const delivered = scheduled.filter((e) => (e.history || []).length > 0);
  const missed = scheduled.filter((e) => monitorState(e, today) === "overdue");
  return {
    scheduled: scheduled.length,
    delivered: delivered.length,
    missed: missed.length,
    events: entries.reduce((n, e) => n + (e.history || []).length, 0),
  };
}
