import { CLAUSE_BY_CODE } from "../data/catalogue.js";
import { assessFinding } from "./playbook.js";

function tokenize(text) {
  return String(text || "").split(/(\s+)/).filter((t) => t !== "");
}

function lcs(a, b) {
  const n = a.length, m = b.length;
  const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ op: "=", text: a[i] }); i++; j++; }
    else if (table[i + 1][j] >= table[i][j + 1]) { out.push({ op: "-", text: a[i] }); i++; }
    else { out.push({ op: "+", text: b[j] }); j++; }
  }
  while (i < n) out.push({ op: "-", text: a[i++] });
  while (j < m) out.push({ op: "+", text: b[j++] });
  return out;
}

export function diffToRuns(previous, proposed, { author, date, changeId }) {
  const ops = lcs(tokenize(previous), tokenize(proposed));
  const runs = [];
  for (const op of ops) {
    const t = op.op === "=" ? "text" : op.op === "-" ? "del" : "ins";
    const last = runs[runs.length - 1];
    if (last && last.t === t) { last.text += op.text; continue; }
    runs.push(t === "text" ? { t, text: op.text } : { t, text: op.text, author, date, changeId });
  }
  // Whitespace-only insertions and deletions are noise from the tokenizer, not edits.
  const cleaned = runs.filter((r) => !(r.t !== "text" && !r.text.trim()));
  return coalesce(cleaned, { author, date, changeId });
}

const MAX_SURVIVING_WORDS = 4;

function wordCount(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function coalesce(runs, meta) {
  const out = [];
  let i = 0;
  while (i < runs.length) {
    if (runs[i].t === "text") { out.push(runs[i]); i++; continue; }

    // Extend the span while the next edit is close enough to be part of the same rewrite.
    let j = i;
    for (;;) {
      let k = j + 1;
      let bridged = 0;
      while (k < runs.length && runs[k].t === "text" && bridged + wordCount(runs[k].text) <= MAX_SURVIVING_WORDS) {
        bridged += wordCount(runs[k].text);
        k++;
      }
      if (k < runs.length && runs[k].t !== "text") { j = k; continue; }
      break;
    }

    if (j === i) { out.push(runs[i]); i++; continue; }

    const span = runs.slice(i, j + 1);
    const before = span.filter((r) => r.t !== "ins").map((r) => r.text).join("");
    const after = span.filter((r) => r.t !== "del").map((r) => r.text).join("");
    if (before.trim()) out.push({ t: "del", text: before, ...meta });
    if (after.trim()) out.push({ t: "ins", text: after, ...meta });
    i = j + 1;
  }
  return out;
}

let changeCounter = 0;

export function applyRedline(doc, edits, who) {
  const changes = [];
  const comments = [...(doc.comments || [])];

  const blocks = doc.blocks.map((block) => {
    const edit = edits.find((e) => e.clauseRef && e.clauseRef === block.ref);
    if (!edit) return block;

    const previous = runsToText(block.runs);
    const changeId = `chg-${++changeCounter}`;
    const runs = diffToRuns(previous, edit.proposed, { author: who.author, date: who.date, changeId });

    const edited = runs.some((r) => r.t === "ins" || r.t === "del");

    if (edited) {
      changes.push({
        id: changeId,
        clauseRef: block.ref,
        clauseHeading: block.heading,
        playbookCode: block.playbookCode,
        author: who.author,
        authorRole: who.role,
        date: who.date,
        previous,
        proposed: edit.proposed,
        status: "pending",
      });
    }

    if (edit.comment) {
      comments.push({
        id: `cmt-${block.ref}`,
        anchor: block.ref,
        author: who.author,
        role: who.role,
        date: who.date,
        text: edit.comment,
        replies: [],
        resolved: false,
        commentOnly: !edited,
      });
    }
    return edited ? { ...block, runs } : block;
  });

  return {
    ...doc,
    meta: { ...doc.meta, version: bumpVersion(doc.meta?.version), status: "Redline received" },
    blocks,
    changes,
    comments,
  };
}

function bumpVersion(version) {
  const match = String(version || "v1.0").match(/v(\d+)\.(\d+)/);
  if (!match) return "v1.1";
  return `v${match[1]}.${Number(match[2]) + 1}`;
}

export function runsToText(runs) {
  return (runs || [])
    .filter((r) => r.t !== "del")
    .map((r) => (r.t === "token" ? (r.value != null && r.value !== "" ? r.value : `[${r.name}]`) : r.text))
    .join("");
}

export function runsToOriginalText(runs) {
  return (runs || [])
    .filter((r) => r.t !== "ins")
    .map((r) => (r.t === "token" ? (r.value != null && r.value !== "" ? r.value : `[${r.name}]`) : r.text))
    .join("");
}

export function resolveChanges(doc, decisions) {
  const blocks = doc.blocks.map((block) => {
    if (!(block.runs || []).some((r) => r.changeId)) return block;
    const runs = [];
    for (const run of block.runs) {
      const decision = run.changeId ? decisions[run.changeId] : null;
      if (!decision || decision === "pending") { runs.push(run); continue; }
      if (decision === "accepted") {
        if (run.t === "del") continue;                        // deletion takes effect
        if (run.t === "ins") { runs.push({ t: "text", text: run.text }); continue; }
      }
      if (decision === "rejected") {
        if (run.t === "ins") continue;                        // insertion discarded
        if (run.t === "del") { runs.push({ t: "text", text: run.text }); continue; }
      }
      runs.push(run);
    }
    return { ...block, runs: mergeAdjacentText(runs) };
  });

  const changes = (doc.changes || []).map((c) => ({ ...c, status: decisions[c.id] || c.status }));
  return { ...doc, blocks, changes };
}

function mergeAdjacentText(runs) {
  const out = [];
  for (const run of runs) {
    const last = out[out.length - 1];
    if (last && last.t === "text" && run.t === "text") { out[out.length - 1] = { t: "text", text: last.text + run.text }; continue; }
    out.push(run);
  }
  return out;
}

export function pendingChangeCount(doc, decisions) {
  return (doc.changes || []).filter((c) => !decisions[c.id] || decisions[c.id] === "pending").length;
}

function materialityFor(assessment) {
  if (!assessment) return "Low";
  if (assessment.position === "walkAway") return "High";
  if (assessment.position === "fallback") return assessment.riskWeight >= 4 ? "High" : "Medium";
  if (assessment.position === "unknown") return assessment.riskWeight >= 4 ? "Medium" : "Low";
  return "Informational";
}

export function deriveFindings(doc, graph) {
  const knockOn = new Map();
  if (graph) {
    for (const change of doc.changes || []) {
      const affected = (graph.inbound.get(change.clauseRef) || new Set());
      const edited = new Set((doc.changes || []).map((c) => c.clauseRef));
      const silent = [...affected].filter((ref) => !edited.has(ref));
      if (silent.length) knockOn.set(change.clauseRef, silent);
    }
  }

  return (doc.changes || []).map((change) => {
    const clause = change.playbookCode ? CLAUSE_BY_CODE[change.playbookCode] : null;
    const label = `${change.clauseRef} ${change.clauseHeading || clause?.name || ""}`.trim();

    const base = {
      clause: label,
      clauseRef: change.clauseRef,
      changeId: change.id,
      previous: change.previous,
      proposed: change.proposed,
      changeType: clause?.changeType || "Other",
      confidence: clause ? "High" : "Medium",
    };

    const assessment = assessFinding(base);
    const silent = knockOn.get(change.clauseRef) || [];
    const impact = impactSentence(change, assessment);

    return {
      ...base,
      materiality: materialityFor(assessment),
      affects: silent,
      impact: silent.length
        ? `${impact} It also moves the meaning of clause${silent.length > 1 ? "s" : ""} ${silent.join(", ")}, `
          + `which point${silent.length > 1 ? "" : "s"} at this one and ${silent.length > 1 ? "were" : "was"} not edited.`
        : impact,
    };
  });
}

function impactSentence(change, assessment) {
  if (!assessment) {
    return "The playbook has no position on this clause, so this change is flagged for a human to read rather than placed in a band.";
  }
  const { clause, position, proposedValue, previousValue } = assessment;
  const movement = previousValue != null && proposedValue != null
    ? `${previousValue} → ${proposedValue}`
    : "wording change";
  if (position === "walkAway") {
    return `${clause.name}: ${movement}. ${assessment.bandReason} ${assessment.action || ""}`.trim();
  }
  if (position === "fallback") {
    return `${clause.name}: ${movement}. ${assessment.bandReason}`;
  }
  if (position === "standard") {
    return `${clause.name}: ${movement}. Inside our standard position, no commercial concession.`;
  }
  return `${clause.name}: ${assessment.bandReason}`;
}

export const SUPPLIER_REDLINE_EDITS = [
  {
    clauseRef: "5.1",
    proposed: "The Client shall pay all undisputed invoices within 45 days of receipt. Invoices shall be submitted monthly in arrears and shall reference the Contract Number and the relevant purchase order. The Charges may be varied only in accordance with clause 18.1.",
    comment: "Our facilities business runs on subcontracted labour paid weekly. 60 days leaves us funding the payroll for two months. 45 is the market norm and we can hold it.",
  },

  {
    clauseRef: "7.2",
    proposed: "The Supplier's aggregate liability arising out of or in connection with this Agreement, whether in contract, tort (including negligence), breach of statutory duty or otherwise, shall not exceed 100% of the Annual Charges, including any liability for death or personal injury. Nothing in this Agreement limits either party's liability for fraud.",
    comment: "Our insurers will not support a cap above the contract value. We have aligned the cap to 100% and simplified the carve-outs.",
  },

  {
    clauseRef: "8.1",
    proposed: "Each party shall keep the other's Confidential Information confidential and shall not disclose it except to those who need it to perform this Agreement. These obligations survive termination for seven (7) years, and indefinitely in respect of security, access control and personal data information.",
    comment: "We hold client site data on our systems for seven years under our own retention policy, so we have extended the survival period to match. It applies both ways.",
  },

  {
    clauseRef: "6.3",
    proposed: "The Supplier shall meet the Service Levels in Schedule 3. For each Service Level failure the Supplier shall issue a service credit against the monthly Charges, capped at 4% of the monthly Charges. Service credits are the Client's sole and exclusive remedy for any failure to meet a Service Level.",
    comment: "Service credits at 10% are out of line with the margin on this contract.",
  },

  {
    clauseRef: "9.3",
    proposed: "On expiry or termination the Supplier shall provide transition assistance for up to six (6) months at the Rate Card rates referred to in clause 18.1, and shall hand over all asset data, maintenance history, statutory compliance records and access credentials at no charge.",
    comment: "Six months is what we can resource without holding the mobilisation team open. The data handover obligation is unchanged and remains at no charge.",
  },

  {
    clauseRef: "11.1",
    proposed: "The Supplier shall maintain, with a reputable insurer, public liability insurance of not less than GBP 2,000,000 per occurrence, employer's liability insurance of not less than GBP 5,000,000 (the statutory minimum in Great Britain), and professional indemnity insurance of not less than GBP 2,000,000, and shall provide certificates of currency on each policy anniversary. Maintaining the cover required by this clause does not limit the Supplier's liability under clause 7.2.",
    comment: "Our public liability cover is GBP 2m per occurrence, which is standard for a single-site contract of this size. Employer's liability is unchanged.",
  },

  {
    clauseRef: "16.1",
    proposed: "This Agreement and any dispute arising out of it are governed by the laws of England and Wales, and the parties submit to the exclusive jurisdiction of the courts of England and Wales.",
    comment: "Confirming we are content with the governing law as drafted, no change requested.",
  },
];

export function applySupplierRevision(doc, clauseRef, proposed, who) {
  const changeId = `chg-${++changeCounter}`;
  let applied = false;

  const blocks = doc.blocks.map((block) => {
    if (block.ref !== clauseRef) return block;
    const original = runsToOriginalText(block.runs);
    const runs = diffToRuns(original, proposed, { author: who.author, date: who.date, changeId });
    applied = runs.some((r) => r.t === "ins" || r.t === "del");
    return applied ? { ...block, runs } : { ...block, runs: [{ t: "text", text: original }] };
  });

  const previousChange = (doc.changes || []).find((c) => c.clauseRef === clauseRef);
  const changes = (doc.changes || []).filter((c) => c.clauseRef !== clauseRef);
  if (applied) {
    changes.push({
      id: changeId,
      clauseRef,
      clauseHeading: previousChange?.clauseHeading,
      playbookCode: previousChange?.playbookCode,
      author: who.author,
      authorRole: who.role,
      date: who.date,
      previous: runsToOriginalText(doc.blocks.find((b) => b.ref === clauseRef)?.runs || []),
      proposed,
      status: "pending",
      revised: true,
    });
  }

  return {
    ...doc,
    meta: { ...doc.meta, version: bumpVersion(doc.meta?.version) },
    blocks,
    changes,
    comments: [
      ...(doc.comments || []),
      {
        id: `cmt-rev-${clauseRef}-${changeId}`,
        anchor: clauseRef,
        author: who.author,
        role: who.role,
        date: who.date,
        text: applied
          ? "Revised position submitted in response to your request."
          : "We have withdrawn our proposed change to this clause and accept your wording as drafted.",
        replies: [],
        resolved: false,
        commentOnly: !applied,
      },
    ],
    revisedClause: clauseRef,
  };
}

export const SUPPLIER_REVISION_EDITS = {
  "5.1": "The Client shall pay all undisputed invoices within 55 days of receipt. Invoices shall be submitted monthly in arrears and shall reference the Contract Number and the relevant purchase order. The Charges may be varied only in accordance with clause 18.1.",
  "7.2": "The Supplier's aggregate liability arising out of or in connection with this Agreement, whether in contract, tort (including negligence), breach of statutory duty or otherwise, shall not exceed 100% of the Annual Charges. Nothing in this Agreement limits or excludes either party's liability for death or personal injury caused by its negligence, for fraud or fraudulent misrepresentation, or for breach of clause 8 (Confidentiality).",
  "6.3": "The Supplier shall meet the Service Levels in Schedule 3. For each Service Level failure the Supplier shall issue a service credit against the monthly Charges, capped at 6% of the monthly Charges. Service credits are not the Client's sole remedy and do not limit any other right, including the right to terminate under clause 9.1.",
  "9.3": "On expiry or termination the Supplier shall provide transition assistance for up to nine (9) months at the Rate Card rates referred to in clause 18.1, and shall hand over all asset data, maintenance history, statutory compliance records and access credentials at no charge.",
  "11.1": "The Supplier shall maintain, with a reputable insurer, public liability insurance of not less than GBP 5,000,000 per occurrence, employer's liability insurance of not less than GBP 5,000,000 (the statutory minimum in Great Britain), and professional indemnity insurance of not less than GBP 2,000,000, and shall provide certificates of currency on each policy anniversary. Maintaining the cover required by this clause does not limit the Supplier's liability under clause 7.2.",
  "8.1": "Each party shall keep the other's Confidential Information confidential and shall not disclose it except to those who need it to perform this Agreement. These obligations survive termination for five (5) years, and indefinitely in respect of security, access control and personal data information.",
};
