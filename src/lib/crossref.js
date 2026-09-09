const REFERENCE = /\b(?:clause|clauses|section|sections|paragraph|paragraphs)\s+(\d+(?:\.\d+)*)/gi;
const SCHEDULE = /\bschedule\s+(\d+|[IVX]+)\b/gi;

function clauseText(block) {
  return (block.runs || [])
    .filter((r) => r.t !== "del")
    .map((r) => (r.t === "token" ? (r.value || `[${r.name}]`) : r.text))
    .join("");
}

export function buildReferenceGraph(doc) {
  const blocks = new Map();
  const outbound = new Map();
  const inbound = new Map();
  const schedules = new Map();

  for (const block of doc.blocks || []) {
    if (block.type !== "clause" || !block.ref) continue;
    blocks.set(block.ref, block);
  }

  for (const [ref, block] of blocks) {
    const text = clauseText(block);
    const outs = new Set();

    REFERENCE.lastIndex = 0;
    let m;
    while ((m = REFERENCE.exec(text)) !== null) {
      const target = m[1];
      if (target === ref) continue;                       // "this clause"
      // "clause 9" names a section, so it stands for every clause inside it.
      const expanded = blocks.has(target)
        ? [target]
        : [...blocks.keys()].filter((k) => k.startsWith(target + "."));
      for (const t of expanded) if (t !== ref) outs.add(t);
    }
    outbound.set(ref, outs);
    for (const target of outs) {
      if (!inbound.has(target)) inbound.set(target, new Set());
      inbound.get(target).add(ref);
    }

    const scheds = new Set();
    SCHEDULE.lastIndex = 0;
    while ((m = SCHEDULE.exec(text)) !== null) scheds.add(m[1]);
    if (scheds.size) schedules.set(ref, scheds);
  }

  for (const ref of blocks.keys()) {
    if (!inbound.has(ref)) inbound.set(ref, new Set());
  }
  return { outbound, inbound, schedules, blocks };
}

export function contextFor(graph, ref) {
  const describe = (target) => {
    const block = graph.blocks.get(target);
    return {
      ref: target,
      heading: block?.heading || "",
      text: block ? clauseText(block) : "",
    };
  };
  const outbound = [...(graph.outbound.get(ref) || [])].map(describe);
  const inbound = [...(graph.inbound.get(ref) || [])].map(describe);
  const schedules = [...(graph.schedules.get(ref) || [])];
  return { ref, outbound, inbound, schedules, total: outbound.length + inbound.length };
}

// Who would be left pointing at nothing.
//
// Striking a clause out does not strike out the sentences that cite it. Delete the
// liability cap and the indemnity still says it is "not subject to the limit in clause
// 7.2", which is now a pointer to a clause that is not in the contract. The reference
// graph cannot warn about it afterwards either: once the target stops being a block the
// edge disappears, so the broken pointer becomes invisible at exactly the moment it is
// created. It has to be said before the deletion, not found after it.
export function citationsOf(graph, ref) {
  if (!graph || !ref) return [];
  const sentenceFor = (text) => {
    const hit = text.split(/(?<=\.)\s+/).find((s) => new RegExp(`\\b(?:clause|section|paragraph)s?\\s+${ref.replace(".", "\\.")}\\b`, "i").test(s));
    return (hit || text).trim();
  };

  return [...(graph.inbound.get(ref) || [])].map((source) => {
    const block = graph.blocks.get(source);
    return {
      ref: source,
      heading: block?.heading || "",
      sentence: block ? sentenceFor(clauseText(block)) : "",
    };
  }).sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true }));
}

export function silentlyAffected(graph, changedRefs) {
  const changed = new Set(changedRefs);
  const affected = new Map();
  for (const ref of changed) {
    for (const source of graph.inbound.get(ref) || []) {
      if (changed.has(source)) continue;                  // it was edited too; not silent
      if (!affected.has(source)) {
        affected.set(source, { ref: source, heading: graph.blocks.get(source)?.heading || "", because: [] });
      }
      affected.get(source).because.push(ref);
    }
  }
  return [...affected.values()].sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true }));
}

export function contextBlock(graph, ref, { maxClauses = 6, maxChars = 700 } = {}) {
  const context = contextFor(graph, ref);
  const lines = [];
  const clip = (s) => (s.length > maxChars ? s.slice(0, maxChars) + "…" : s);

  for (const item of context.outbound.slice(0, maxClauses)) {
    lines.push(`  [${ref} refers to ${item.ref}] ${item.heading}: ${clip(item.text)}`);
  }
  for (const item of context.inbound.slice(0, maxClauses)) {
    lines.push(`  [${item.ref} refers back to ${ref}, unchanged, but its meaning may have moved] ${item.heading}: ${clip(item.text)}`);
  }
  if (context.schedules.length) {
    lines.push(`  [${ref} depends on Schedule ${context.schedules.join(", Schedule ")}, whose content is not in this document]`);
  }
  return lines.join("\n");
}

/**
 * Clauses left pointing at a clause that is being struck out.
 *
 * The pre-flight warning on the Delete button is a single moment: it fires once, for the
 * person doing the deleting, and only on the path that goes through that button. It is
 * not there when the counterparty strikes the clause out in their own copy, it is not
 * there when their marked-up file is imported, and it is gone the instant it is
 * dismissed. What is left is clause 7.4 reading "not subject to the limit in clause 7.2"
 * next to a 7.2 with a line through it, and nothing saying those two facts are connected.
 *
 * So the reference is checked where it is read, not only where it is broken. This is
 * computed against the document as it stands, so rejecting the deletion clears it without
 * anything having to remember it was ever shown.
 *
 * @param {object} doc
 * @param {object} decisions  changeId -> "accepted" | "rejected" | "pending"
 * @returns {Map<string, string[]>} citing clause -> the struck-out clauses it points at
 */
export function danglingReferences(doc, decisions = {}) {
  if (!doc) return new Map();
  const graph = buildReferenceGraph(doc);

  const struck = new Set();
  for (const block of doc.blocks || []) {
    if (!block.ref || !block.deletedBy) continue;
    if (decisions[block.deletedBy] === "rejected") continue;   // put back, nothing is broken
    struck.add(block.ref);
  }
  if (!struck.size) return new Map();

  const out = new Map();
  for (const [ref, targets] of graph.outbound) {
    if (struck.has(ref)) continue;            // a clause on its way out takes its pointers with it
    const broken = [...targets].filter((t) => struck.has(t));
    if (broken.length) out.set(ref, broken.sort(compareRefs));
  }
  return out;
}

function compareRefs(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}
