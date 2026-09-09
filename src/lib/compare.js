import { diffToRuns, runsToText } from "./redline.js";

// Comparing two versions of the document.
//
// The tracked changes in a document say what one party proposed against one baseline.
// This says something different: how these two versions of the contract differ, whoever
// moved and however many rounds it took. That is what lets a reviewer ask "what changed
// since I last looked" without giving up the cumulative view the playbook bands need.

function clausesOf(doc) {
  const map = new Map();
  for (const block of doc?.blocks || []) {
    if (block.type !== "clause" || !block.ref) continue;
    if (!map.has(block.ref)) {
      map.set(block.ref, { ref: block.ref, heading: block.heading || "", text: runsToText(block.runs) });
    }
  }
  return map;
}

/**
 * @returns {Array<{ref, heading, status: "added"|"removed"|"changed", before, after, runs}>}
 */
export function compareDocs(from, to) {
  const before = clausesOf(from);
  const after = clausesOf(to);
  const refs = [...new Set([...before.keys(), ...after.keys()])];
  const out = [];

  for (const ref of refs) {
    const a = before.get(ref);
    const b = after.get(ref);

    if (a && !b) {
      out.push({ ref, heading: a.heading, status: "removed", before: a.text, after: "", runs: [{ t: "del", text: a.text }] });
      continue;
    }
    if (!a && b) {
      out.push({ ref, heading: b.heading, status: "added", before: "", after: b.text, runs: [{ t: "ins", text: b.text }] });
      continue;
    }
    if (a.text === b.text) continue;

    out.push({
      ref,
      heading: b.heading || a.heading,
      status: "changed",
      before: a.text,
      after: b.text,
      runs: diffToRuns(a.text, b.text, { author: "", date: "", changeId: "" }),
    });
  }

  return out.sort((x, y) => x.ref.localeCompare(y.ref, undefined, { numeric: true }));
}

export function compareSummary(rows) {
  return {
    total: rows.length,
    changed: rows.filter((r) => r.status === "changed").length,
    added: rows.filter((r) => r.status === "added").length,
    removed: rows.filter((r) => r.status === "removed").length,
  };
}
