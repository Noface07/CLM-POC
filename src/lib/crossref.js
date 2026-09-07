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
