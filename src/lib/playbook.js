import { CLAUSE_BY_CODE, PLAYBOOK, roleLabel } from "../data/catalogue.js";

const UNIT_LABEL = {
  percent_annual_charges: "% of annual charges",
  percent_monthly_charges: "% of monthly charges",
  days: " days",
  hours: " hours",
  years: " years",
  months: " months",
};

export function formatBandValue(value, unit) {
  if (value == null) return "-";
  const suffix = UNIT_LABEL[unit] || "";
  return suffix.startsWith("%") ? `${value}${suffix}` : `${value}${suffix}`;
}

function normalise(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

export function matchClause(finding) {
  if (!finding) return null;
  const label = String(finding.clause || "");
  const haystack = normalise([finding.clause, finding.previous, finding.proposed].join(" "));

  const ref = label.match(/\b(\d+\.\d+)\b/);
  if (ref) {
    const hit = PLAYBOOK.find((c) => c.clauseRef === ref[1]);
    if (hit) return { clause: hit, matchedBy: `clause number ${ref[1]}` };
  }

  const name = normalise(label.replace(/^\s*\d+(\.\d+)*\s*/, ""));
  if (name) {
    for (const clause of PLAYBOOK) {
      const names = [clause.name, ...(clause.aliases || [])].map(normalise);
      if (names.some((n) => n && (n === name || name.includes(n) || n.includes(name)))) {
        return { clause, matchedBy: `clause name "${label.trim()}"` };
      }
    }
  }

  let best = null;
  for (const clause of PLAYBOOK) {
    const hits = (clause.keywords || []).filter((k) => haystack.includes(normalise(k)));
    if (hits.length >= 2 && (!best || hits.length > best.hits.length)) best = { clause, hits };
  }
  if (best) return { clause: best.clause, matchedBy: `wording (${best.hits.slice(0, 2).join(", ")})` };

  return null;
}

const WORD_NUMBERS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, "forty-five": 45, fifty: 50,
  sixty: 60, ninety: 90, "one hundred": 100,
};

export function extractValue(text, unit) {
  if (!text) return null;
  const s = String(text);

  if (unit === "percent_annual_charges" || unit === "percent_monthly_charges") {
    const pct = s.match(/(\d+(?:\.\d+)?)\s*(?:%|per cent|percent)/i);
    if (pct) return Number(pct[1]);
    return null;
  }

  const unitWord = { days: "day", hours: "hour", years: "year", months: "month" }[unit];
  if (unitWord) {
    const paren = s.match(new RegExp(`\\((\\d+)\\)\\s*${unitWord}`, "i"));
    if (paren) return Number(paren[1]);
    const digits = s.match(new RegExp(`(\\d+)\\s*${unitWord}`, "i"));
    if (digits) return Number(digits[1]);
    const words = s.match(new RegExp(`([a-z-]+)\\s+${unitWord}`, "i"));
    if (words && WORD_NUMBERS[words[1].toLowerCase()] != null) return WORD_NUMBERS[words[1].toLowerCase()];
  }
  return null;
}

export const POSITION = {
  standard: { key: "standard", label: "At or better than standard", tone: "good" },
  fallback: { key: "fallback", label: "Inside the fallback band", tone: "warn" },
  walkAway: { key: "walkAway", label: "Past the walk-away line", tone: "bad" },
  unknown: { key: "unknown", label: "Not placeable by the band", tone: "neutral" },
};

export function placeInBand(clause, value) {
  if (clause.standardValue == null || value == null) {
    return { position: "unknown", reason: "No comparable quantity in the proposed wording. Read the position text." };
  }
  if (clause.standardValue === clause.fallbackValue) {
    return {
      position: "unknown",
      reason: clause.bandNote
        || "Standard and fallback carry the same number, so the number is not what separates them. Read the position text.",
    };
  }

  const worseIsHigher = clause.valueDirection === "higher_is_worse";
  const atLeastAsGood = (a, b) => (worseIsHigher ? a <= b : a >= b);

  if (atLeastAsGood(value, clause.standardValue)) {
    return { position: "standard", reason: `${value} is at or better than the standard position of ${clause.standardValue}.` };
  }
  if (atLeastAsGood(value, clause.fallbackValue)) {
    return { position: "fallback", reason: `${value} is worse than standard (${clause.standardValue}) but no worse than the fallback of ${clause.fallbackValue}.` };
  }
  if (clause.walkAwayValue != null && atLeastAsGood(value, clause.walkAwayValue)) {
    return { position: "walkAway", reason: `${value} is past the fallback of ${clause.fallbackValue} and at the walk-away line of ${clause.walkAwayValue}.` };
  }
  return {
    position: "walkAway",
    reason: clause.walkAwayValue != null
      ? `${value} is past the walk-away line of ${clause.walkAwayValue}.`
      : `${value} is worse than the fallback of ${clause.fallbackValue}. This clause's walk-away position is qualitative, so anything past fallback needs the escalation approver.`,
  };
}

const RED_FLAG_PROBES = {
  liability_cap: [
    { probe: /(death|personal injury|fraud)/i, needs: /(cap|limit|exceed|subject to)/i, index: 0 },
  ],
  payment_terms: [
    { probe: /invoice/i, absent: /undisputed/i, index: 0 },
  ],
  indemnity: [
    { probe: /(responsible for|liable for)/i, absent: /indemnif/i, index: 2 },
  ],
  service_levels: [
    { probe: /sole (and exclusive )?remedy/i, index: 0 },
  ],
  data_protection: [
    { probe: /(\d+)\s*(business\s+)?days?\b/i, index: 0 },
  ],
  health_safety: [
    { probe: /reasonable endeavours/i, index: 0 },
  ],
  intellectual_property: [
    { probe: /licen[cs]e/i, absent: /(perpetual|irrevocable|survive)/i, index: 0 },
  ],
  change_control: [
    { probe: /(prevailing|market) rates/i, index: 0 },
  ],
  exit_transition: [
    { probe: /(then[- ]current|prevailing) rates/i, index: 0 },
  ],
};

export function detectRedFlags(clause, proposedText) {
  const text = String(proposedText || "");
  if (!text.trim()) return [];
  const probes = RED_FLAG_PROBES[clause.code] || [];
  const found = [];
  for (const rule of probes) {
    if (!rule.probe.test(text)) continue;
    if (rule.needs && !rule.needs.test(text)) continue;
    if (rule.absent && rule.absent.test(text)) continue;
    const message = (clause.redFlags || [])[rule.index];
    if (message && !found.includes(message)) found.push(message);
  }
  return found;
}

export function assessFinding(finding) {
  const match = matchClause(finding);
  if (!match) return null;
  const clause = match.clause;

  const proposedValue = extractValue(finding.proposed, clause.valueUnit);
  const previousValue = extractValue(finding.previous, clause.valueUnit);
  const band = placeInBand(clause, proposedValue);
  const redFlags = detectRedFlags(clause, finding.proposed);

  const effective = redFlags.length > 0 && band.position !== "walkAway" ? "walkAway" : band.position;

  const approver = roleLabel(clause.approvingRole);
  const escalation = roleLabel(clause.escalateTo);

  let verdict, mayApprove, action;
  if (effective === "standard") {
    verdict = "Inside our standard position, no approval needed.";
    mayApprove = null;
    action = clause.guidance?.atStandard;
  } else if (effective === "fallback") {
    verdict = `Inside the fallback band: ${approver} may approve without escalation.`;
    mayApprove = approver;
    action = clause.guidance?.atFallback;
  } else if (effective === "walkAway") {
    verdict = redFlags.length > 0 && band.position !== "walkAway"
      ? `Band placement is acceptable but the wording carries a red flag: ${escalation} must decide.`
      : `Past the walk-away line: ${escalation} must decide, and the default answer is no.`;
    mayApprove = escalation;
    action = clause.guidance?.atWalkAway;
  } else {
    verdict = `The band cannot place this automatically: ${approver} to read the position text and decide.`;
    mayApprove = approver;
    action = clause.guidance?.atFallback;
  }

  return {
    clause,
    matchedBy: match.matchedBy,
    position: effective,
    positionLabel: POSITION[effective].label,
    tone: POSITION[effective].tone,
    bandReason: band.reason,
    previousValue,
    proposedValue,
    verdict,
    action,
    mayApprove,
    approver,
    escalation,
    redFlags,
    riskWeight: clause.riskWeight,
    overriddenByRedFlag: redFlags.length > 0 && band.position !== "walkAway",
  };
}

export function sortByPlaybookRisk(items, getAssessment) {
  const rank = { walkAway: 0, unknown: 1, fallback: 2, standard: 3 };
  return [...items].sort((a, b) => {
    const aa = getAssessment(a), bb = getAssessment(b);
    const ar = aa ? rank[aa.position] : 1.5;
    const br = bb ? rank[bb.position] : 1.5;
    if (ar !== br) return ar - br;
    return (bb?.riskWeight || 0) - (aa?.riskWeight || 0);
  });
}

export function clauseByCode(code) {
  return CLAUSE_BY_CODE[code];
}
