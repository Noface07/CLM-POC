const RECURRING = /\b(annual|annually|quarter|quarterly|month|monthly|week|weekly|daily|each|every|per )/i;
const ONE_TIME = /\b(one[- ]time|once|on termination|on expiry|on exit|on commencement)\b/i;
const ON_DEMAND = /\b(as requested|as required|on request|when required|from time to time|ad hoc|continuous)\b/i;

const HAS_DEADLINE = /\d|\bbefore\b|\bwithin\b|\bby \b|\bprior to\b|anniversary|quarter end|month end/i;

const SEVERE = /\b(breach|terminat|criminal|prosecut|regulator|statutory|unenforceable|liabilit|indemnit|uninsured|invalid)/i;
const COSTLY = /\b(credit|charge|cost|fee|withhold|deduct|suspend|escalat)/i;

const VAGUE_OWNER = /^(\u2014|-|n\/a|unclear|not specified|either|both)?$/i;

function blank(value) {
  const s = String(value ?? "").trim();
  return !s || s === "\u2014" || s === "-" || /^(not specified|none|n\/a|unknown)$/i.test(s);
}

export function assessObligation(o) {
  const frequency = String(o?.frequency || "");
  const due = String(o?.due || "");
  const consequence = String(o?.consequence || "");

  const missing = [];
  if (blank(frequency) && blank(due)) missing.push("no date or recurrence");
  if (blank(o?.responsible) || VAGUE_OWNER.test(String(o?.responsible || "").trim())) missing.push("no named owner");
  if (blank(consequence)) missing.push("no stated consequence");

  const recurring = RECURRING.test(frequency);
  const dated = HAS_DEADLINE.test(due) && !blank(due);
  const onDemand = ON_DEMAND.test(frequency) || ON_DEMAND.test(due);
  const oneTime = ONE_TIME.test(frequency) || ONE_TIME.test(due);

  let importance = "Low";
  if (SEVERE.test(consequence)) importance = "High";
  else if (COSTLY.test(consequence)) importance = "Medium";

  if (missing.includes("no named owner") || missing.includes("no stated consequence")) {
    return {
      mode: "background",
      track: false,
      importance: "Low",
      missing,
      reason: `Recorded but not tracked: ${missing.join(" and ")}. A reminder needs somebody to send it to and a reason for them to act.`,
    };
  }

  if (recurring && (dated || !blank(due))) {
    return {
      mode: "calendar", track: true, importance, missing: [],
      reason: `Recurs ${frequency.toLowerCase()} with a stated deadline, so a reminder can be scheduled against it.`,
    };
  }
  if (recurring) {
    return {
      mode: "calendar", track: true, importance, missing: ["no deadline within the cycle"],
      reason: `Recurs ${frequency.toLowerCase()} but names no deadline within the cycle. Tracked, with the due date set on validation.`,
    };
  }
  if (oneTime || (dated && !onDemand)) {
    return {
      mode: "trigger", track: true, importance, missing: [],
      reason: "Fires once, on an event rather than on a date. Watch-listed against the trigger rather than put on a calendar.",
    };
  }
  if (onDemand) {
    return {
      mode: "standing", track: false, importance, missing: ["no date to fire on"],
      reason: "A continuous or on-request duty with no date. It belongs in the compliance register, not on a reminder schedule: there is no day on which it becomes due.",
    };
  }
  return {
    mode: "background", track: false, importance, missing,
    reason: "No recurrence and no trigger, so nothing can be scheduled against it. Recorded for completeness.",
  };
}

export const MODE_LABEL = {
  calendar: "Scheduled",
  trigger: "On trigger",
  standing: "Standing duty",
  background: "Recorded only",
};

export const MODE_HINT = {
  calendar: "Generates dated reminders once validated.",
  trigger: "Watch-listed: fires on an event, not a date.",
  standing: "Continuous duty. Sits in the compliance register with no reminder.",
  background: "Kept for completeness. No reminder is possible.",
};

export function partitionObligations(list) {
  const assessed = (list || []).map((o, index) => ({ o, index, a: assessObligation(o) }));
  return {
    tracked: assessed.filter((x) => x.a.track),
    untracked: assessed.filter((x) => !x.a.track),
    all: assessed,
  };
}
