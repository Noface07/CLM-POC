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
  // Markup already on the document survives. Rebuilding the change list from scratch
  // would leave the runs of an earlier round pointing at records that no longer exist:
  // paragraphs still struck through and underlined, with nothing left to accept, reject
  // or count. Only the clauses this pass actually rewrites lose their earlier record.
  const changes = [...(doc.changes || [])];
  const comments = [...(doc.comments || [])];

  const blocks = doc.blocks.map((block) => {
    const edit = edits.find((e) => e.clauseRef && e.clauseRef === block.ref);
    if (!edit) return block;

    const previous = runsToText(block.runs);
    const changeId = `chg-${++changeCounter}`;
    const runs = diffToRuns(previous, edit.proposed, { author: who.author, date: who.date, changeId });

    const edited = runs.some((r) => r.t === "ins" || r.t === "del");

    if (edited) {
      for (let i = changes.length - 1; i >= 0; i--) {
        if (changes[i].clauseRef === block.ref) changes.splice(i, 1);
      }
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

// Editing a clause in place.
//
// The diff is taken from the clause's ORIGINAL text, not from what is on screen, so a
// second edit to the same clause reads as one revision from the agreed wording rather
// than as a revision of somebody else's markup. That is also why the previous change on
// the clause is replaced: one clause carries one open proposal, which is the thing a
// reviewer decides on.
export function applyClauseEdit(doc, clauseRef, proposed, who) {
  const changeId = `chg-${++changeCounter}`;
  let applied = false;
  let inserted = false;
  let previous = "";
  let heading;
  let playbookCode;

  const blocks = doc.blocks.map((block) => {
    if (block.ref !== clauseRef) return block;
    heading = block.heading;
    playbookCode = block.playbookCode;

    // A clause that exists only because somebody added it has no agreed wording behind
    // it, so revising it keeps it a single insertion of the new text. Diffing it against
    // its own draft would show three words changing inside a paragraph the other side
    // has never seen.
    if (block.insertedBy) {
      inserted = true;
      applied = true;
      previous = "";
      return {
        ...block,
        insertedBy: changeId,
        runs: [{ t: "ins", text: proposed, author: who.author, date: who.date, changeId }],
      };
    }

    previous = runsToOriginalText(block.runs);
    const runs = diffToRuns(previous, proposed, { author: who.author, date: who.date, changeId });
    applied = runs.some((r) => r.t === "ins" || r.t === "del");
    return applied ? { ...block, runs } : { ...block, runs: [{ t: "text", text: previous }] };
  });

  const prior = (doc.changes || []).find((c) => c.clauseRef === clauseRef);
  const changes = (doc.changes || []).filter((c) => c.clauseRef !== clauseRef);
  if (applied) {
    changes.push({
      id: changeId,
      clauseRef,
      clauseHeading: heading || prior?.clauseHeading,
      playbookCode: playbookCode || prior?.playbookCode,
      author: who.author,
      authorRole: who.role,
      date: who.date,
      previous,
      proposed,
      status: "pending",
      authored: true,
      inserted: inserted || undefined,
    });
  }

  return { ...doc, blocks, changes };
}

// Striking a clause out entirely.
//
// Deleting a clause is an ordinary negotiating move and has to be proposed like any
// other: the whole paragraph is struck through, and it survives in the document until
// somebody decides it. `deletedBy` marks the block as owing its removal to that change,
// which is what lets an accepted deletion take the paragraph with it and a rejected one
// put it back untouched.
export function deleteClauseBlock(doc, clauseRef, who) {
  const changeId = `chg-${++changeCounter}`;
  let applied = false;
  let previous = "";
  let heading;
  let playbookCode;

  const blocks = doc.blocks.map((block) => {
    if (block.ref !== clauseRef) return block;
    heading = block.heading;
    playbookCode = block.playbookCode;
    previous = runsToText(block.runs);
    if (!previous.trim()) return block;
    applied = true;
    return {
      ...block,
      deletedBy: changeId,
      insertedBy: undefined,
      runs: [{ t: "del", text: previous, author: who.author, date: who.date, changeId }],
    };
  });

  if (!applied) return doc;

  const prior = (doc.changes || []).find((c) => c.clauseRef === clauseRef);
  const changes = (doc.changes || []).filter((c) => c.clauseRef !== clauseRef);
  changes.push({
    id: changeId,
    clauseRef,
    clauseHeading: heading || prior?.clauseHeading,
    playbookCode: playbookCode || prior?.playbookCode,
    author: who.author,
    authorRole: who.role,
    date: who.date,
    previous,
    proposed: "",
    status: "pending",
    authored: true,
    deleted: true,
  });

  return { ...doc, blocks, changes };
}

// Settling your own markup into the text before the document leaves the building.
//
// You do not send your own tracked changes to the counterparty. Authoring a clause and
// negotiating one are different acts: what goes out is a clean draft that reads as the
// position you are taking, and the markup that comes back is theirs alone.
//
// This is also what makes their redline legible. A clause still carried as an insertion
// has no original text to diff against, so the next person to touch it re-inserts the
// whole paragraph instead of changing three words in it.
export function settleAuthoredChanges(doc, author) {
  const mine = (doc.changes || []).filter((c) => c.author === author);
  if (!mine.length) return doc;

  const ids = new Set(mine.map((c) => c.id));
  const blocks = doc.blocks.filter((b) => !(b.deletedBy && ids.has(b.deletedBy))).map((block) => {
    if (!(block.runs || []).some((r) => ids.has(r.changeId))) return block;
    const runs = [];
    for (const run of block.runs) {
      if (!ids.has(run.changeId)) { runs.push(run); continue; }
      if (run.t === "del") continue;
      if (run.t === "ins") { runs.push({ t: "text", text: run.text }); continue; }
      runs.push(run);
    }
    const settled = { ...block, runs: mergeAdjacentText(runs) };
    if (block.insertedBy && ids.has(block.insertedBy)) delete settled.insertedBy;
    return settled;
  });

  return { ...doc, blocks, changes: (doc.changes || []).filter((c) => !ids.has(c.id)) };
}

// Marks an author's proposals as having been put to the other side.
//
// A change you made and a change they have seen are different things. Until it has gone
// back, your markup is a private counter-proposal, and nothing that has not been put to
// the counterparty should be capable of reaching signature.
export function markChangesSent(doc, author) {
  return {
    ...doc,
    changes: (doc.changes || []).map((c) => (c.author === author && !c.sent ? { ...c, sent: true } : c)),
  };
}

export function unsentChangesBy(doc, author) {
  return (doc?.changes || []).filter((c) => c.author === author && !c.sent);
}

// Whose markup is sitting on this clause, if anybody's.
export function pendingAuthorOn(doc, clauseRef, decisions = {}) {
  const block = (doc.blocks || []).find((b) => b.ref === clauseRef);
  if (!block) return null;
  const ids = new Set((block.runs || []).map((r) => r.changeId).filter(Boolean));
  if (block.insertedBy) ids.add(block.insertedBy);
  const open = (doc.changes || []).find((c) => ids.has(c.id)
    && (!decisions[c.id] || decisions[c.id] === "pending"));
  return open ? open.author : null;
}

// Withdrawing a change you made yourself.
//
// This is not accept/reject. Rejecting is a decision ABOUT a proposal and leaves the
// proposal on the record; discarding says the proposal should never have been made, so
// the clause returns to its original wording and the change record goes with it. An
// inserted clause loses the whole paragraph, because that paragraph was the change.
export function discardChange(doc, changeId) {
  const blocks = doc.blocks
    .filter((block) => block.insertedBy !== changeId)
    .map((block) => {
      if (!(block.runs || []).some((r) => r.changeId === changeId)) return block;
      const runs = [];
      for (const run of block.runs) {
        if (run.changeId !== changeId) { runs.push(run); continue; }
        if (run.t === "ins") continue;
        if (run.t === "del") { runs.push({ t: "text", text: run.text }); continue; }
        runs.push(run);
      }
      const restored = { ...block, runs: mergeAdjacentText(runs) };
      if (block.deletedBy === changeId) delete restored.deletedBy;
      return restored;
    });

  return {
    ...doc,
    blocks,
    changes: (doc.changes || []).filter((c) => c.id !== changeId),
  };
}

// Dropping a playbook clause into the document.
//
// The whole paragraph arrives as a tracked insertion, so it is decided on the same terms
// as anything the counterparty proposed. `insertedBy` marks the block as owing its whole
// existence to that change, which is what lets a rejection remove the paragraph rather
// than leave an empty one behind.
export function insertClauseBlock(doc, { afterRef, ref, heading, text, playbookCode }, who) {
  const changeId = `chg-${++changeCounter}`;
  const taken = new Set((doc.blocks || []).map((b) => b.ref).filter(Boolean));

  let finalRef = ref || "";
  if (!finalRef || taken.has(finalRef)) {
    const base = finalRef || afterRef || "new";
    let suffix = "A";
    while (taken.has(`${base}${suffix}`)) suffix = String.fromCharCode(suffix.charCodeAt(0) + 1);
    finalRef = `${base}${suffix}`;
  }

  const block = {
    type: "clause",
    ref: finalRef,
    heading,
    playbookCode,
    insertedBy: changeId,
    runs: [{ t: "ins", text, author: who.author, date: who.date, changeId }],
  };

  const blocks = [...(doc.blocks || [])];
  const at = afterRef ? blocks.findIndex((b) => b.ref === afterRef) : -1;
  blocks.splice(at === -1 ? blocks.length : at + 1, 0, block);

  return {
    ...doc,
    blocks,
    changes: [...(doc.changes || []), {
      id: changeId,
      clauseRef: finalRef,
      clauseHeading: heading,
      playbookCode,
      author: who.author,
      authorRole: who.role,
      date: who.date,
      previous: "",
      proposed: text,
      status: "pending",
      authored: true,
      inserted: true,
    }],
  };
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
  const blocks = doc.blocks.filter((block) => {
    // A clause that exists only because it was dropped in leaves nothing behind when the
    // insertion is rejected, rather than an empty numbered paragraph.
    if (block.deletedBy && decisions[block.deletedBy] === "accepted") return false;
    if (!block.insertedBy) return true;
    return decisions[block.insertedBy] !== "rejected";
  }).map((block) => {
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
    const resolved = { ...block, runs: mergeAdjacentText(runs) };
    // Once an insertion is accepted the paragraph is simply part of the contract, so it
    // stops being "new". Leaving the mark on would make the next edit to it re-insert
    // the whole thing instead of marking up the words that changed.
    if (block.insertedBy && decisions[block.insertedBy] === "accepted") delete resolved.insertedBy;
    if (block.deletedBy && decisions[block.deletedBy] === "rejected") delete resolved.deletedBy;
    return resolved;
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
