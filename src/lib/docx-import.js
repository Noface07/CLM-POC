import { readZip } from "./unzip.js";
import { parseXml, findAll, findFirst, childNamed, childrenNamed, textOf, attr, isElement } from "./xml.js";

const DOCUMENT = "word/document.xml";
const COMMENTS = "word/comments.xml";

// A clause opens with its number: "5.1 Payment terms. The Client shall…"
const CLAUSE_REF = /^\s*(\d+(?:\.\d+)+)\s*/;
// A section heading is a number, a short line, and usually no sentence: "5. CHARGES AND PAYMENT"
const HEADING_REF = /^\s*(\d+)\.?\s+(.{0,80})$/;

function runProps(node) {
  const rPr = childNamed(node, "rPr");
  return {
    bold: Boolean(rPr && childNamed(rPr, "b")),
    caps: Boolean(rPr && childNamed(rPr, "caps")),
    size: Number(attr(childNamed(rPr, "sz"), "val")) || null,
  };
}

function textOfRun(node) {
  let out = "";
  for (const child of node.children || []) {
    if (!isElement(child)) continue;
    if (child.local === "t" || child.local === "delText") out += textOf(child);
    else if (child.local === "tab") out += "\t";
    else if (child.local === "br" || child.local === "cr") out += "\n";
  }
  return out;
}

function paragraphRuns(paragraph) {
  const runs = [];
  const anchors = [];

  const push = (run) => {
    const last = runs[runs.length - 1];
    if (last && last.t === run.t && last.author === run.author && !last.bold === !run.bold) {
      last.text += run.text;
      return;
    }
    runs.push(run);
  };

  const walk = (node, revision) => {
    for (const child of node.children || []) {
      if (!isElement(child)) continue;
      switch (child.local) {
        case "ins":
          walk(child, { t: "ins", author: attr(child, "author") || "Unknown", date: attr(child, "date") || "" });
          break;
        case "del":
          walk(child, { t: "del", author: attr(child, "author") || "Unknown", date: attr(child, "date") || "" });
          break;
        case "r": {
          const text = textOfRun(child);
          if (!text) break;
          const props = runProps(child);
          push(revision ? { ...revision, text } : { t: "text", text, ...(props.bold ? { bold: true } : {}) });
          break;
        }
        case "commentRangeStart":
          anchors.push(attr(child, "id"));
          break;
        case "hyperlink":
        case "smartTag":
        case "sdt":
        case "sdtContent":
          walk(child, revision);
          break;
        default:
          break;
      }
    }
  };

  walk(paragraph, null);
  return { runs, anchors };
}

function visibleText(runs) {
  return runs.filter((r) => r.t !== "del").map((r) => r.text).join("");
}

function originalText(runs) {
  return runs.filter((r) => r.t !== "ins").map((r) => r.text).join("");
}

function classify(runs) {
  const text = visibleText(runs).trim();
  if (!text) return { type: "empty" };

  const clause = text.match(CLAUSE_REF);
  if (clause) {
    const rest = text.slice(clause[0].length);
    const boldLead = runs.find((r) => r.t === "text" && r.bold);
    let heading = "";
    if (boldLead) {
      heading = boldLead.text.replace(CLAUSE_REF, "").replace(/\.\s*$/, "").trim();
    } else {
      const stop = rest.indexOf(". ");
      if (stop > 0 && stop < 60) heading = rest.slice(0, stop).trim();
    }
    return { type: "clause", ref: clause[1], heading };
  }

  const allBold = runs.every((r) => r.t !== "text" || r.bold);
  const heading = text.match(HEADING_REF);
  if (heading && allBold && !text.endsWith(".")) {
    return { type: "heading", number: heading[1], text: heading[2].trim() };
  }
  if (allBold && text.length < 80 && text === text.toUpperCase()) {
    return { type: "heading", text };
  }
  return { type: "para" };
}

function parseComments(xml) {
  if (!xml) return new Map();
  const root = parseXml(xml);
  const out = new Map();
  for (const node of findAll(root, "comment")) {
    const paras = findAll(node, "p").map((p) => textOf(p).trim()).filter(Boolean);
    out.set(attr(node, "id"), {
      author: attr(node, "author") || "Unknown",
      date: attr(node, "date") || "",
      initials: attr(node, "initials") || "",
      text: paras[0] || "",
      replies: paras.slice(1).map((line) => {
        const split = line.indexOf(": ");
        return split > 0 && split < 40
          ? { author: line.slice(0, split), text: line.slice(split + 2) }
          : { author: "Reply", text: line };
      }),
    });
  }
  return out;
}

export async function importDocx(file) {
  const buffer = typeof file.arrayBuffer === "function" ? await file.arrayBuffer() : file;
  let entries;
  try {
    entries = await readZip(buffer);
  } catch (err) {
    throw new Error(`Could not read that file as a Word document. ${err.message}`);
  }

  const documentXml = entries.get(DOCUMENT);
  if (!documentXml) {
    throw new Error(
      "That file is a ZIP but not a Word document: it has no word/document.xml. "
      + "A .doc (the pre-2007 binary format) has to be saved as .docx first."
    );
  }

  const decoder = new TextDecoder();
  const root = parseXml(decoder.decode(documentXml));
  const commentsById = parseComments(entries.get(COMMENTS) ? decoder.decode(entries.get(COMMENTS)) : null);

  const body = findFirst(root, "body");
  const blocks = [];
  const changes = [];
  const comments = [];
  const warnings = [];
  const seenAnchors = new Set();

  let changeCounter = 0;
  let lastClauseRef = "";

  for (const paragraph of childrenNamed(body, "p")) {
    const { runs, anchors } = paragraphRuns(paragraph);
    const kind = classify(runs);
    if (kind.type === "empty") continue;

    if (kind.type === "heading") {
      blocks.push({ type: "heading", number: kind.number, text: kind.text || visibleText(runs).trim() });
      continue;
    }

    const ref = kind.type === "clause" ? kind.ref : "";
    if (ref) lastClauseRef = ref;

    const bodyRuns = stripLeadIn(runs, kind);

    blocks.push({
      type: "clause",
      ref,
      heading: kind.heading || "",
      runs: bodyRuns.length ? bodyRuns : runs,
    });

    const revised = runs.filter((r) => r.t === "ins" || r.t === "del");
    if (revised.length) {
      const author = revised[0].author;
      if (revised.some((r) => r.author !== author)) {
        warnings.push(`Clause ${ref || "(unnumbered)"} carries revisions from more than one author; they are grouped as one change.`);
      }
      const id = `imported-${++changeCounter}`;
      for (const run of runs) if (run.t === "ins" || run.t === "del") run.changeId = id;
      changes.push({
        id,
        clauseRef: ref || lastClauseRef,
        clauseHeading: kind.heading || "",
        author,
        authorRole: "Counterparty",
        date: revised[0].date,
        previous: originalText(runs).replace(CLAUSE_REF, "").trim(),
        proposed: visibleText(runs).replace(CLAUSE_REF, "").trim(),
        status: "pending",
      });
    }

    for (const id of anchors) {
      const comment = commentsById.get(id);
      if (!comment || seenAnchors.has(id)) continue;
      seenAnchors.add(id);
      comments.push({
        id: `imported-cmt-${id}`,
        anchor: ref || lastClauseRef,
        author: comment.author,
        role: "Counterparty",
        date: comment.date ? new Date(comment.date).toLocaleString("en-GB") : "",
        text: comment.text,
        replies: comment.replies,
        resolved: false,
        commentOnly: !revised.length,
      });
    }
  }

  const orphaned = [...commentsById.keys()].filter((id) => !seenAnchors.has(id));
  if (orphaned.length) {
    warnings.push(`${orphaned.length} comment(s) had no anchor in the document body and were dropped.`);
  }
  if (findAll(root, "moveFrom").length || findAll(root, "moveTo").length) {
    warnings.push("The document contains moved text. It is read here as a deletion plus an insertion, which is correct in substance but noisier than Word shows it.");
  }
  if (findAll(root, "tbl").length) {
    warnings.push(`${findAll(root, "tbl").length} table(s) were found. Tables are not imported, so anything stated only in a table is not in the review.`);
  }

  return {
    meta: { title: "Imported document", version: "imported", status: "Redline received", imported: true },
    blocks,
    changes,
    comments,
    warnings,
  };
}

function stripLeadIn(runs, kind) {
  if (kind.type !== "clause") return runs;
  const lead = `${kind.ref}${kind.heading ? " " + kind.heading : ""}`;
  const out = runs.map((r) => ({ ...r }));
  let remaining = lead.length + 2;    // allow for the ". " after the heading
  for (const run of out) {
    if (remaining <= 0) break;
    if (run.t !== "text") break;      // never eat into a tracked change
    const take = Math.min(remaining, run.text.length);
    const candidate = run.text.slice(0, take);
    if (!lead.startsWith(candidate.trim().slice(0, Math.min(candidate.trim().length, lead.length)))) break;
    run.text = run.text.slice(take).replace(/^[.\s]+/, "");
    remaining -= take;
  }
  return out.filter((r) => r.text !== "");
}
