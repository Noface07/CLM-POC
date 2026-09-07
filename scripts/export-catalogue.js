import { writeFileSync, mkdirSync } from "node:fs";
import { AGREEMENT_TYPES, TEMPLATES, PLAYBOOK, roleLabel } from "../src/data/catalogue.js";
import { buildDraft, templateIsDraftable, fieldsForTemplate } from "../src/data/templates.js";
import { buildDocx } from "../src/lib/docx.js";
import { formatBandValue } from "../src/lib/playbook.js";

const OUT = "catalogue/docx";
const TEMPLATE_DIR = `${OUT}/templates`;

const WARNING =
  "NOT REVIEWED BY COUNSEL. The clause positions in this document are the default catalogue's "
  + "proposal. They are conventional for UK facilities management and exist so that routing and "
  + "generation can be built and tested against something shaped like the real thing. Every one is "
  + "tenant configuration, per legal entity, and is expected to change. Treat this as a first draft "
  + "to argue with, not as advice.";

const text = (s) => [{ t: "text", text: s }];
const para = (s) => ({ type: "clause", ref: "", heading: "", runs: text(s) });
const labelled = (label, s) => ({ type: "clause", ref: label, heading: "", runs: text(s) });

function warningBlocks() {
  return [
    { type: "clause", ref: "", heading: "", runs: [{ t: "bold", text: WARNING }] },
  ];
}

async function write(name, doc, opts) {
  const blob = buildDocx(doc, opts);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  writeFileSync(name, bytes);
  return bytes.length;
}

function playbookDoc() {
  const blocks = [
    { type: "title", text: "CLAUSE PLAYBOOK" },
    { type: "subtitle", text: `${PLAYBOOK.length} clauses · default catalogue for facilities management · generated ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}` },
    ...warningBlocks(),
    para(
      "Each clause carries three positions. Standard is our opening position. Fallback is what we "
      + "accept without escalation. Walk away is the point past which we do not sign. The third "
      + "position is what makes the other two mean anything: a playbook with only a standard "
      + "position produces one answer, \"this differs from standard\", which is true of every "
      + "negotiated contract and tells nobody anything."
    ),
    para(
      "Where a position is a single comparable quantity it also carries a value and a unit, so a "
      + "proposed term can be placed in the band by arithmetic rather than by reading. Red flags are "
      + "the exception to that: wording that is unacceptable regardless of the number."
    ),
  ];

  PLAYBOOK.forEach((clause, i) => {
    blocks.push({ type: "heading", number: String(i + 1), text: clause.name.toUpperCase() });

    const facts = [
      `Clause reference ${clause.clauseRef}`,
      `category ${clause.category}`,
      `risk weight ${clause.riskWeight}/5`,
      `change type ${clause.changeType}`,
      clause.jurisdiction ? `jurisdiction ${clause.jurisdiction} only` : null,
    ].filter(Boolean).join(" · ");
    blocks.push(para(facts));

    const band = (label, position, value) =>
      labelled(label, value != null ? `[${formatBandValue(value, clause.valueUnit)}] ${position}` : position);

    blocks.push(band("Standard", clause.standard, clause.standardValue));
    blocks.push(band("Fallback", clause.fallback, clause.fallbackValue));
    blocks.push(band("Walk away", clause.walkAway, clause.walkAwayValue));

    if (clause.standardValue != null) {
      blocks.push(labelled(
        "Band",
        `Measured in ${clause.valueUnit.replace(/_/g, " ")}; ${clause.valueDirection.replace(/_/g, " ")}.`
        + (clause.bandNote ? ` ${clause.bandNote}` : "")
      ));
    }

    blocks.push(labelled("Why", clause.why));
    blocks.push(labelled(
      "Who approves",
      `Inside the fallback band, ${roleLabel(clause.approvingRole)} may approve without escalation. `
      + `Past the walk-away line the decision belongs to ${roleLabel(clause.escalateTo)}.`
    ));

    if (clause.guidance) {
      blocks.push(labelled("At standard", clause.guidance.atStandard));
      blocks.push(labelled("In fallback", clause.guidance.atFallback));
      blocks.push(labelled("Past walk-away", clause.guidance.atWalkAway));
    }
    if (clause.redFlags?.length) {
      blocks.push(labelled("Red flags", "wording that is wrong at any number"));
      clause.redFlags.forEach((f) => blocks.push(para(`-  ${f}`)));
    }
    if (clause.tradeables?.length) {
      blocks.push(labelled("Tradeables", "what may be conceded to hold this position, and what may not"));
      clause.tradeables.forEach((t) => blocks.push(para(`-  ${t}`)));
    }
    if (clause.evergreenPosition) {
      blocks.push(labelled("Evergreen", "where the contract has no expiry date"));
      blocks.push(para(`Standard:  ${clause.evergreenPosition.standard}`));
      blocks.push(para(`Fallback:  ${clause.evergreenPosition.fallback}`));
      blocks.push(para(`Walk away: ${clause.evergreenPosition.walkAway}`));
      blocks.push(para(clause.evergreenPosition.why));
    }
    if (clause.standardWording) {
      blocks.push(labelled("Model wording", "what a draft is generated from"));
      blocks.push(para(clause.standardWording));
    }
    if (clause.aliases?.length) {
      blocks.push(labelled("Also called", clause.aliases.join("; ")));
    }
  });

  return { meta: { title: "Clause Playbook", author: "Default catalogue", version: "1" }, blocks, comments: [] };
}

function templateCatalogueDoc() {
  const blocks = [
    { type: "title", text: "TEMPLATE CATALOGUE" },
    { type: "subtitle", text: `${TEMPLATES.length} templates across ${AGREEMENT_TYPES.length} agreement types` },
    ...warningBlocks(),
    para(
      "Global by default. A jurisdiction-specific template exists only where a specific legal "
      + "difference forces the split, and has to state which. Every split doubles the work of every "
      + "future amendment to that document, so a split with no stated reason is pure cost."
    ),
  ];

  AGREEMENT_TYPES.forEach((type, i) => {
    const forType = TEMPLATES.filter((t) => t.agreementType === type.code);
    if (!forType.length) return;
    blocks.push({ type: "heading", number: String(i + 1), text: type.name.toUpperCase() });
    blocks.push(para(`${type.riskLevel} risk · typical term ${type.typicalTerm}${type.requiresSchedules ? " · schedules required" : ""}`));
    forType.forEach((t) => {
      blocks.push(labelled(t.name, t.purpose));
      blocks.push(para(
        `Jurisdiction: ${t.jurisdiction}. Merge data required: ${t.requiredTokens.join(", ")}. `
        + `Generated document: ${templateIsDraftable(t.code) ? `templates/${t.code}.docx` : "no published version, cannot be generated from"}.`
      ));
      if (t.splitReason) blocks.push(labelled("Split because", t.splitReason));
    });
  });

  return { meta: { title: "Template Catalogue", author: "Default catalogue", version: "1" }, blocks, comments: [] };
}

function agreementTypesDoc() {
  const order = { high: 0, medium: 1, low: 2 };
  const sorted = [...AGREEMENT_TYPES].sort((a, b) => order[a.riskLevel] - order[b.riskLevel]);
  const blocks = [
    { type: "title", text: "AGREEMENT TYPES" },
    { type: "subtitle", text: `${AGREEMENT_TYPES.length} types, sorted by risk level` },
    ...warningBlocks(),
    para(
      "Risk level drives the low-touch path. It is deliberately conservative: the cost of routing a "
      + "simple NDA through review is an hour of somebody's time, and the cost of auto-approving a "
      + "total facilities management contract is a multi-year commitment nobody read."
    ),
  ];
  let level = null;
  sorted.forEach((type) => {
    if (type.riskLevel !== level) {
      level = type.riskLevel;
      blocks.push({ type: "heading", text: `${level.toUpperCase()} RISK` });
    }
    blocks.push(labelled(type.name, type.why));
    blocks.push(para(`Typical term ${type.typicalTerm}${type.requiresSchedules ? " · schedules required" : " · no schedules"}. Code: ${type.code}.`));
  });
  return { meta: { title: "Agreement Types", author: "Default catalogue", version: "1" }, blocks, comments: [] };
}

function templateDoc(template) {
  const doc = buildDraft(template.code, {}, { version: "template", status: "Template" });
  const fields = fieldsForTemplate(template.code);
  return {
    ...doc,
    meta: { ...doc.meta, title: template.name, author: "Default catalogue" },
    blocks: [
      { type: "title", text: template.name.toUpperCase() },
      { type: "subtitle", text: `Template ${template.code} · jurisdiction ${template.jurisdiction} · ${fields.length} merge fields` },
      ...warningBlocks(),
      para(
        `Every highlighted [placeholder] below is a merge field resolved at generation time. `
        + `This template needs: ${fields.map((f) => `${f.label} [${f.name}]`).join("; ")}.`
      ),
      ...(template.splitReason ? [labelled("Jurisdiction split", template.splitReason)] : []),
      ...doc.blocks.filter((b) => b.type !== "title" && b.type !== "subtitle"),
    ],
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(TEMPLATE_DIR, { recursive: true });

  const written = [];
  written.push([`${OUT}/clause-playbook.docx`, await write(`${OUT}/clause-playbook.docx`, playbookDoc())]);
  written.push([`${OUT}/template-catalogue.docx`, await write(`${OUT}/template-catalogue.docx`, templateCatalogueDoc())]);
  written.push([`${OUT}/agreement-types.docx`, await write(`${OUT}/agreement-types.docx`, agreementTypesDoc())]);

  for (const template of TEMPLATES) {
    if (!templateIsDraftable(template.code)) {
      console.log(`  skipped ${template.code}: no published version to generate from`);
      continue;
    }
    const path = `${TEMPLATE_DIR}/${template.code}.docx`;
    written.push([path, await write(path, templateDoc(template), { watermark: "UNREVIEWED" })]);
  }

  for (const [path, size] of written) {
    console.log(`  ${String(size).padStart(7)} bytes  ${path}`);
  }
  console.log(`\n${written.length} Word documents written to ${OUT}/`);
}

main();
