import { buildDraft, unresolvedTokens, docToPlainText, templateIsDraftable, resolvedClauseWording } from "../src/data/templates.js";
import { TEMPLATES, PLAYBOOK, CLAUSE_BY_CODE } from "../src/data/catalogue.js";
import {
  applyRedline, resolveChanges, deriveFindings, pendingChangeCount, diffToRuns,
  applyClauseEdit, insertClauseBlock, discardChange, settleAuthoredChanges,
  markChangesSent, unsentChangesBy, deleteClauseBlock,
  runsToText, runsToOriginalText, compareRefs, positionForRef, SUPPLIER_REDLINE_EDITS,
  handToCounterparty, returnToClient, bumpVersion, applySupplierRevision,
} from "../src/lib/redline.js";
import {
  counterApprovalRows, counterReady, canApproveCounter, outstandingCounters,
} from "../src/lib/counter.js";
import { assessFinding, extractValue, placeInBand, matchClause } from "../src/lib/playbook.js";
import { assessObligation } from "../src/lib/obligations.js";
import { MOCK_OBLIGATIONS } from "../src/lib/ai.js";
import { buildDocx } from "../src/lib/docx.js";
import { makeZip } from "../src/lib/zip.js";
import { contractVisibility, visibleContracts, roleCanActOnException, ROLES } from "../src/lib/rbac.js";
import { SIM_ORG, ONBOARDING_PREREQS, eligibility, contextFor as sfContext, SALESFORCE_SOURCED, listSuppliers, pushMilestone, SALESFORCE_DEFAULTS } from "../src/lib/salesforce.js";
import { DEFAULT_APPROVAL_MATRIX, APPROVER_POOL, ROUTE_DESKS, routeMapFrom, escalationFrom, mustEscalate } from "../src/data/contracts.js";
import { PORTFOLIO } from "../src/data/contracts.js";
import { importDocx } from "../src/lib/docx-import.js";
import { readZip } from "../src/lib/unzip.js";
import { parseXml, findAll, textOf, attr } from "../src/lib/xml.js";
import { buildReferenceGraph, contextFor, silentlyAffected, contextBlock, citationsOf, danglingReferences } from "../src/lib/crossref.js";
import { compareDocs, compareSummary } from "../src/lib/compare.js";
import {
  cycleOf, addCycle, suggestedFirstDue, monitorState, recordPerformance,
  monitorSummary, performanceRecord, sweep, applyLapse, isDeadline, amendmentImpact,
} from "../src/lib/monitoring.js";
import { buildPdf } from "../src/lib/pdf.js";
import { readSnapshot, writeSnapshot, clearSnapshot, SCHEMA, PERSIST_KEY } from "../src/lib/session.js";
import {
  makeEntry as makeAuditEntry, actorFor, actorLabel, formatAuditTime, newestFirst,
  filterEntries, rolesIn, contractsIn, auditToCsv, AUDIT_CSV_HEADER,
  forContract, contractLabel, UNSCOPED,
} from "../src/lib/audit.js";
import { canReadAudit } from "../src/lib/rbac.js";
import {
  computeApprovalStatus, computeContractStatus, reviewNeedsReapproval, invalidationSatisfied,
} from "../src/lib/lifecycle.js";
import { LIFECYCLE_STAGES, stageForStatus } from "../src/components/LifecycleBar.jsx";
import { SEQUENTIAL } from "../src/components/charts.jsx";

const results = [];
function check(name, condition, detail) {
  results.push({ name, ok: Boolean(condition), detail });
}

async function main() {
  const draftable = TEMPLATES.filter((t) => templateIsDraftable(t.code));
  check("all 15 catalogue templates are draftable", draftable.length === TEMPLATES.length,
    `${draftable.length}/${TEMPLATES.length}`);

  for (const t of TEMPLATES) {
    const doc = buildDraft(t.code, {}, {});
    const clauses = doc.blocks.filter((b) => b.type === "clause");
    check(`${t.code} assembles clauses`, clauses.length > 3, `${clauses.length} clauses`);
  }

  const values = {
    contract_number: "CTR-2026-04821", title: "Integrated FM", start_date: "2026-10-01",
    end_date: "2029-09-30", contract_value: "486000", currency_code: "GBP", notice_period_days: "90",
    supplier_name: "Meridian CTS Ltd", supplier_registered_number: "08841221",
    supplier_address: "Reading", supplier_contact: "K. Bhatt",
    legal_entity_name: "Meridian FM (UK) Ltd", legal_entity_registered_number: "04412907",
    legal_entity_address: "London", governing_law: "England and Wales", jurisdiction: "England and Wales",
    service_category: "Integrated FM", facility_names: "Riverside", service_hours: "07:00-19:00",
    response_times: "P1 2h", kpi_schedule: "Schedule 3", payment_terms_days: "60",
    rate_card_reference: "Schedule 4", indexation_basis: "CPI", liability_cap_amount: "125",
  };
  const full = buildDraft("tfm_global", values, {});
  check("no unresolved tokens when every field is filled", unresolvedTokens(full).length === 0,
    unresolvedTokens(full).join(","));
  const text = docToPlainText(full);
  check("drafted payment clause carries the chosen term", text.includes("within 60 days of receipt"));
  check("drafted liability clause carries the chosen cap", text.includes("125% of the Annual Charges"));

  const partial = buildDraft("tfm_global", { title: "x" }, {});
  check("unfilled tokens are reported", unresolvedTokens(partial).length > 5,
    `${unresolvedTokens(partial).length} missing`);

  const usd = docToPlainText(buildDraft("tfm_global", { ...values, currency_code: "USD" }, {}));
  check("currency reaches the definitions clause", usd.includes("USD 486,000"));
  check("currency reaches the insurance limits", usd.includes("USD 5,000,000") && usd.includes("USD 2,000,000"),
    (usd.match(/(GBP|USD) [\d,]+/g) || []).join(" | "));
  check("employer's liability stays in sterling under British law",
    usd.includes("employer's liability insurance of not less than GBP 5,000,000 (the statutory minimum in Great Britain)"),
    "statutory floors are not redenominated by a dropdown");
  const dutch = docToPlainText(buildDraft("tfm_global",
    { ...values, currency_code: "EUR", governing_law: "Netherlands", jurisdiction: "Netherlands" }, {}));
  check("outside Great Britain the EL clause points at the local minimum",
    dutch.includes("statutory minimum in each jurisdiction in which its personnel are employed")
    && !dutch.includes("GBP"),
    (dutch.match(/GBP[^.]*/g) || []).join(" | "));

  const ever = buildDraft("tfm_global", values, { evergreen: true });
  const everText = docToPlainText(ever);
  check("evergreen drops the fixed term", !everText.includes("initial term of three (3) years"));
  check("evergreen states there is no expiry", everText.includes("no fixed expiry date"));
  check("evergreen keeps a termination right", everText.includes("terminate for convenience"));

  const runs = diffToRuns(
    "pay within 60 days of receipt",
    "pay within 30 days of receipt",
    { author: "S", date: "now", changeId: "c1" }
  );
  check("diff produces one insertion", runs.filter((r) => r.t === "ins").length === 1,
    JSON.stringify(runs.map((r) => [r.t, r.text])));
  check("diff produces one deletion", runs.filter((r) => r.t === "del").length === 1);
  check("diff keeps unchanged text", runs.filter((r) => r.t === "text").length >= 2);

  const rewrite = diffToRuns(
    "Service credits are not the Client's sole remedy and do not limit any other right.",
    "Service credits are the Client's sole and exclusive remedy for any failure to meet a Service Level.",
    { author: "S", date: "now", changeId: "c2" }
  );
  const segments = rewrite.filter((r) => r.t !== "text").length;
  check("a rewritten sentence collapses to few segments", segments <= 2, segments + " segments");
  const beforeText = rewrite.filter((r) => r.t !== "ins").map((r) => r.text).join("");
  const afterText = rewrite.filter((r) => r.t !== "del").map((r) => r.text).join("");
  check("cleanup preserves the original text exactly",
    beforeText === "Service credits are not the Client's sole remedy and do not limit any other right.",
    JSON.stringify(beforeText));
  check("cleanup preserves the proposed text exactly",
    afterText === "Service credits are the Client's sole and exclusive remedy for any failure to meet a Service Level.",
    JSON.stringify(afterText));

  // A small edit inside a long sentence must NOT be swallowed by the cleanup.
  const small = diffToRuns(
    "The Client shall pay all undisputed invoices within 60 days of receipt of a valid invoice.",
    "The Client shall pay all undisputed invoices within 30 days of receipt of a valid invoice.",
    { author: "S", date: "now", changeId: "c3" }
  );
  check("a small edit stays a small edit", small.filter((r) => r.t !== "text").length === 2,
    JSON.stringify(small.map((r) => [r.t, r.text])));
  check("the unchanged remainder survives", small.filter((r) => r.t === "text").length === 2);

  const redlined = applyRedline(full, SUPPLIER_REDLINE_EDITS, { author: "Meridian CTS", role: "Supplier", date: "05 Sep" });
  check("redline records tracked changes", redlined.changes.length === 6,
    `${redlined.changes.length} changes: ${redlined.changes.map((c) => c.clauseRef).join(",")}`);
  check("a comment-only clause makes no change", !redlined.changes.some((c) => c.clauseRef === "16.1"));
  check("but its comment is still recorded", redlined.comments.some((c) => c.anchor === "16.1" && c.commentOnly));
  check("comments attach to clauses", redlined.comments.length === 7, `${redlined.comments.length} comments`);

  check("all changes start pending", pendingChangeCount(redlined, {}) === 6);

  const allRejected = resolveChanges(redlined, Object.fromEntries(redlined.changes.map((c) => [c.id, "rejected"])));
  check("rejecting every change restores the draft exactly",
    docToPlainText(allRejected) === docToPlainText(full),
    "lengths " + docToPlainText(allRejected).length + " vs " + docToPlainText(full).length);
  const allAccepted = resolveChanges(redlined, Object.fromEntries(redlined.changes.map((c) => [c.id, "accepted"])));
  const acceptedAll = docToPlainText(allAccepted);
  const everyProposalLanded = redlined.changes.every((c) => acceptedAll.includes(c.proposed));
  check("accepting every change yields the supplier's wording verbatim", everyProposalLanded);
  const payment = redlined.changes.find((c) => c.clauseRef === "5.1");
  const accepted = resolveChanges(redlined, { [payment.id]: "accepted" });
  const acceptedText = docToPlainText(accepted);
  check("accepting adopts the supplier wording", acceptedText.includes("within 45 days of receipt"));
  check("accepting removes our wording", !acceptedText.includes("within 60 days of receipt"));
  const rejected = resolveChanges(redlined, { [payment.id]: "rejected" });
  const rejectedText = docToPlainText(rejected);
  check("rejecting restores our wording", rejectedText.includes("within 60 days of receipt"));
  check("rejecting drops the supplier wording", !rejectedText.includes("within 45 days of receipt"));
  check("resolving decrements the pending count", pendingChangeCount(accepted, { [payment.id]: "accepted" }) === 5);

  const findings = deriveFindings(redlined);
  check("one finding per tracked change", findings.length === redlined.changes.length);
  const byClause = Object.fromEntries(findings.map((f) => [f.clauseRef, f]));

  // payment 60 -> 30: fallback is 45, walk-away is 30 => past fallback
  const pay = assessFinding(byClause["5.1"]);
  check("payment terms matched to the playbook", pay?.clause.code === "payment_terms", pay?.matchedBy);
  check("payment at 45 days lands in the fallback band", pay?.position === "fallback",
    `${pay?.position}: ${pay?.bandReason}`);
  check("a fallback names the routine approver, not the escalation",
    pay?.mayApprove === "Finance / Commercial Approver", String(pay?.mayApprove));

  const positions = findings.map((f) => assessFinding(f)?.position);
  check("the redline reaches the standard position", positions.includes("standard"), positions.join(","));
  check("the redline reaches the fallback band twice",
    positions.filter((x) => x === "fallback").length >= 2, positions.join(","));
  check("the redline reaches the walk-away line", positions.includes("walkAway"), positions.join(","));
  check("and includes one the band cannot place", positions.includes("unknown"), positions.join(","));

  const conf = assessFinding(byClause["8.1"]);
  check("a longer confidentiality period reads as at-or-better than standard",
    conf?.position === "standard", `${conf?.position}: ${conf?.bandReason}`);
  check("an at-standard change needs no approver", conf?.mayApprove === null, String(conf?.mayApprove));
  check("and is not raised as an exception",
    byClause["8.1"].materiality === "Informational", byClause["8.1"].materiality);

  const exitAssist = assessFinding(byClause["9.3"]);
  check("exit assistance at six months is the fallback", exitAssist?.position === "fallback",
    `${exitAssist?.position}: ${exitAssist?.bandReason}`);

  // liability 125 -> 100 is fallback by the numbers, but the wording caps personal injury
  const liab = assessFinding(byClause["7.2"]);
  check("liability cap matched", liab?.clause.code === "liability_cap");
  check("liability red flag detected", liab?.redFlags.length > 0, JSON.stringify(liab?.redFlags));
  check("red flag overrides a comfortable band", liab?.overriddenByRedFlag === true,
    `position=${liab?.position} band=${liab?.bandReason}`);
  check("liability is High materiality", byClause["7.2"].materiality === "High", byClause["7.2"].materiality);

  // service levels 10% -> 4%, and made the sole remedy
  const sla = assessFinding(byClause["6.3"]);
  check("service levels matched", sla?.clause.code === "service_levels");
  check("sole-remedy red flag detected", sla?.redFlags.length > 0, JSON.stringify(sla?.redFlags));

  // insurance 5m -> 2m public liability; walk-away is qualitative
  const ins = assessFinding(byClause["11.1"]);
  check("insurance matched", ins?.clause.code === "insurance", ins?.matchedBy);

  const insBand = assessFinding(byClause["11.1"]);
  check("insurance refuses a numeric verdict", insBand?.position === "unknown",
    `${insBand?.position}: ${insBand?.bandReason}`);

  check("extracts parenthesised digits", extractValue("within thirty (30) days of receipt", "days") === 30);
  check("extracts bare digits", extractValue("within 45 days", "days") === 45);
  check("extracts written numbers", extractValue("within sixty days", "days") === 60);
  check("extracts percentages", extractValue("shall not exceed 100% of the Annual Charges", "percent_annual_charges") === 100);
  check("returns null when there is no number", extractValue("as agreed between the parties", "days") === null);

  const cap = CLAUSE_BY_CODE.liability_cap;
  check("cap at 125 is standard", placeInBand(cap, 125).position === "standard");
  check("cap at 110 is fallback", placeInBand(cap, 110).position === "fallback");
  check("cap at 80 is walk-away", placeInBand(cap, 80).position === "walkAway");
  const dp = CLAUSE_BY_CODE.data_protection;  // higher_is_worse
  check("24h notification is standard", placeInBand(dp, 24).position === "standard");
  check("48h notification is fallback", placeInBand(dp, 48).position === "fallback");
  check("96h notification is walk-away", placeInBand(dp, 96).position === "walkAway");

  check("matches an alias", matchClause({ clause: "Cap on Liability" })?.clause.code === "liability_cap");
  check("matches by clause number", matchClause({ clause: "12.1 Something" })?.clause.code === "data_protection");
  check("returns null when nothing matches",
    matchClause({ clause: "Zebra Provisions", previous: "x", proposed: "y" }) === null);

  const missingWording = PLAYBOOK.filter((c) => !c.standardWording);
  check("every clause has model wording", missingWording.length === 0, missingWording.map((c) => c.code).join(","));
  const missingGuidance = PLAYBOOK.filter((c) => !c.guidance?.atWalkAway);
  check("every clause has walk-away guidance", missingGuidance.length === 0);
  const badRefs = PLAYBOOK.filter((c) => !/^\d+\.\d+$/.test(c.clauseRef || ""));
  check("every clause has a clause number", badRefs.length === 0, badRefs.map((c) => c.code).join(","));
  const dupRefs = PLAYBOOK.map((c) => c.clauseRef).filter((r, i, a) => a.indexOf(r) !== i);
  check("clause numbers are unique", dupRefs.length === 0, dupRefs.join(","));

  const legalSees = visibleContracts("Legal", PORTFOLIO);
  const routedToLegal = PORTFOLIO.filter((c) => c.routedTo.includes("legal"));
  check("Legal sees everything routed to Legal",
    routedToLegal.every((c) => legalSees.some((v) => v.id === c.id)),
    `${legalSees.length} visible, ${routedToLegal.length} routed`);
  const highRiskNotRouted = PORTFOLIO.filter((c) => c.riskLevel === "high" && !c.routedTo.includes("legal"));
  check("Legal also sees high-risk contracts not routed to it",
    highRiskNotRouted.every((c) => legalSees.some((v) => v.id === c.id)),
    highRiskNotRouted.map((c) => c.id).join(","));
  const financeSees = visibleContracts("Finance / Commercial Approver", PORTFOLIO);
  check("Finance sees only what is routed to Finance",
    financeSees.every((c) => c.routedTo.includes("finance")),
    financeSees.map((c) => c.id).join(","));
  check("Finance does not see everything", financeSees.length < PORTFOLIO.length,
    `${financeSees.length}/${PORTFOLIO.length}`);
  check("Auditor sees everything", visibleContracts("Auditor (read-only)", PORTFOLIO).length === PORTFOLIO.length);
  check("a visibility decision always states a reason",
    PORTFOLIO.every((c) => contractVisibility("Legal", c).why?.length > 5));

  const blob = buildDocx(redlined, { watermark: "PREVIEW" });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  check("docx starts with the ZIP magic number", bytes[0] === 0x50 && bytes[1] === 0x4b, `${bytes[0]},${bytes[1]}`);
  check("docx is a plausible size", bytes.length > 4000, `${bytes.length} bytes`);
  const asText = new TextDecoder("latin1").decode(bytes);
  for (const part of ["[Content_Types].xml", "word/document.xml", "word/styles.xml",
                      "word/comments.xml", "word/header1.xml", "word/_rels/document.xml.rels"]) {
    check(`docx contains ${part}`, asText.includes(part));
  }
  check("docx carries real tracked-change markup", asText.includes("<w:ins ") && asText.includes("<w:del "));
  check("deletions use w:delText", asText.includes("<w:delText"));
  check("comments are anchored", asText.includes("commentRangeStart") && asText.includes("commentReference"));
  check("watermark is in the header", asText.includes("PowerPlusWaterMarkObject") && asText.includes("PREVIEW"));
  check("xml:space is preserved on runs", asText.includes('xml:space="preserve"'));

  const pdfBlob = buildPdf(full, { watermark: "PREVIEW", footer: "CTR-2026-04821 - preview" });
  const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer());
  const pdf = new TextDecoder("latin1").decode(pdfBytes);
  check("pdf has the right header", pdf.startsWith("%PDF-1.4"));
  check("pdf ends with EOF", pdf.trimEnd().endsWith("%%EOF"));
  check("pdf has a catalog", pdf.includes("/Type /Catalog"));
  check("pdf has an xref table", pdf.includes("\nxref\n") && pdf.includes("startxref"));
  const pageCount = (pdf.match(/\/Type \/Page[^s]/g) || []).length;
  check("pdf paginated the contract", pageCount >= 3, pageCount + " pages");
  check("pdf declares its page count", pdf.includes("/Count " + pageCount), "Count vs " + pageCount);
  check("pdf carries the watermark", pdf.includes("(PREVIEW) Tj"));
  check("pdf carries the footer on a page", pdf.includes("Page 1 of " + pageCount));
  check("pdf contains contract text", pdf.includes("Annual Charges") || pdf.includes("Supplier"));
  check("pdf is byte-clean (no chars above 255)", pdfBytes.every((b) => b <= 255));

  // xref offsets must actually point at their objects, or a reader repairs or rejects it
  const startxref = Number(pdf.slice(pdf.lastIndexOf("startxref") + 9).trim().split(/\s/)[0]);
  check("startxref points at the xref table", pdf.slice(startxref, startxref + 4) === "xref", pdf.slice(startxref, startxref + 12));
  const xrefBody = pdf.slice(startxref).split("trailer")[0].split("\n").slice(2).filter((l) => l.includes(" n "));
  const badOffsets = xrefBody.filter((line, i) => {
    const off = Number(line.slice(0, 10));
    return !pdf.slice(off).startsWith(String(i + 1) + " 0 obj");
  });
  check("every xref offset lands on its object", badOffsets.length === 0, badOffsets.length + " bad of " + xrefBody.length);

  // an executed PDF must carry no redline markup at all
  const executedPdf = new TextDecoder("latin1").decode(new Uint8Array(await buildPdf(
    resolveChanges(redlined, Object.fromEntries(redlined.changes.map((c) => [c.id, "accepted"])))
  ).arrayBuffer()));
  check("executed pdf adopted the accepted wording", executedPdf.includes("45 days of receipt"));
  check("executed pdf dropped the deleted wording", !executedPdf.includes("60 days of receipt"));

  const partialDoc = buildDraft("tfm_global", { ...values, facility_names: "", supplier_contact: "" }, {});
  const markedXml = new TextDecoder("latin1").decode(
    new Uint8Array(await buildDocx(partialDoc, { markFilledTokens: true }).arrayBuffer()));
  check("docx marks unresolved fields in yellow", markedXml.includes('w:highlight w:val="yellow"'));
  check("docx marks resolved fields in grey", markedXml.includes('w:highlight w:val="lightGray"'));
  check("the two states are different colours",
    markedXml.includes('w:val="yellow"') && markedXml.includes('w:val="lightGray"'));
  check("an unresolved field shows its name", markedXml.includes("[facility_names]"));

  const cleanXml = new TextDecoder("latin1").decode(
    new Uint8Array(await buildDocx(partialDoc).arrayBuffer()));
  check("clean export leaves resolved fields unmarked", !cleanXml.includes('w:val="lightGray"'));
  check("clean export still marks the holes", cleanXml.includes('w:highlight w:val="yellow"'));

  const signedDoc = {
    ...full,
    blocks: [
      ...full.blocks,
      { type: "heading", text: "EXECUTION" },
      { type: "signature", entity: "Meridian FM Services (UK) Ltd", signed: true,
        byName: "Tobiloba Okafor", title: "Contract Manager",
        date: "05 September 2026 at 14:54", method: "Typed electronic signature" },
      { type: "signature", entity: "Meridian CTS Ltd", signed: false },
    ],
  };
  const signedDocx = new TextDecoder("latin1").decode(new Uint8Array(await buildDocx(signedDoc).arrayBuffer()));
  check("docx renders the signed party", signedDocx.includes("Tobiloba Okafor"));
  check("docx sets a script face on the signature", signedDocx.includes('w:ascii="Segoe Script"'));
  check("docx keeps the printed name as the record", signedDocx.includes("Contract Manager"));
  check("docx leaves an unsigned block blank", signedDocx.includes("________________________________"));
  check("docx no longer uses the /s/ notation", !signedDocx.includes("/s/"));

  const signedPdf = new TextDecoder("latin1").decode(new Uint8Array(await buildPdf(signedDoc).arrayBuffer()));
  check("pdf declares Times-Italic for the signature", signedPdf.includes("/BaseFont /Times-Italic"));
  check("pdf maps it as F3", signedPdf.includes("/F3 5 0 R"));
  check("pdf sets the signature in it", /\/F3 15 Tf/.test(signedPdf), "expected an F3 run at 15pt");
  check("pdf renders the signed name", signedPdf.includes("(Tobiloba Okafor) Tj"));
  check("pdf no longer uses the /s/ notation", !signedPdf.includes("/s/ "));

  const xml = parseXml('<?xml version="1.0"?><w:root xmlns:w="x"><w:p w:id="1"><w:t xml:space="preserve">a &amp; b</w:t></w:p><w:p/><w:c a="&gt;not-an-end&gt;"/></w:root>');
  check("parses elements", findAll(xml, "p").length === 2);
  check("decodes entities in text", textOf(findAll(xml, "t")[0]) === "a & b", textOf(findAll(xml, "t")[0]));
  check("reads prefixed attributes by local name", attr(findAll(xml, "p")[0], "id") === "1");
  check("a > inside an attribute does not end the tag", findAll(xml, "c").length === 1);
  check("self-closing elements have no children", findAll(xml, "p")[1].children.length === 0);

  const roundZip = await readZip(new Uint8Array(await buildDocx(full).arrayBuffer()));
  check("zip reader finds every part", roundZip.has("word/document.xml") && roundZip.has("[Content_Types].xml"),
    [...roundZip.keys()].join(","));
  check("zip reader returns usable bytes",
    new TextDecoder().decode(roundZip.get("word/document.xml")).includes("<w:document"));

  const exported = buildDocx(redlined);
  const reimported = await importDocx(exported);
  check("import recovers the clauses", reimported.blocks.filter((b) => b.type === "clause").length > 20,
    reimported.blocks.filter((b) => b.type === "clause").length + " clauses");
  check("import recovers the headings", reimported.blocks.filter((b) => b.type === "heading").length > 10,
    reimported.blocks.filter((b) => b.type === "heading").length + " headings");
  check("import recovers every tracked change", reimported.changes.length === redlined.changes.length,
    reimported.changes.length + " vs " + redlined.changes.length);
  check("import recovers the change authors",
    reimported.changes.every((c) => c.author === "Meridian CTS"), JSON.stringify(reimported.changes.map((c) => c.author)));
  check("imported changes carry their clause number",
    reimported.changes.every((c) => /^\d+\.\d+$/.test(c.clauseRef)),
    JSON.stringify(reimported.changes.map((c) => c.clauseRef)));
  check("import recovers every comment", reimported.comments.length === redlined.comments.length,
    reimported.comments.length + " vs " + redlined.comments.length);
  check("imported comments keep their anchor clause",
    reimported.comments.every((c) => /^\d+\.\d+$/.test(c.anchor)),
    JSON.stringify(reimported.comments.map((c) => c.anchor)));
  const paymentBack = reimported.changes.find((c) => c.clauseRef === "5.1");
  check("imported change keeps the original wording", paymentBack.previous.includes("60 days"), paymentBack.previous.slice(0, 60));
  check("imported change keeps the proposed wording", paymentBack.proposed.includes("45 days"), paymentBack.proposed.slice(0, 80));
  check("import reports no spurious warnings", reimported.warnings.length === 0, reimported.warnings.join(" | "));

  // a comment with a reply must survive the round trip as a thread
  const threaded = { ...redlined, comments: redlined.comments.map((c, i) =>
    i === 0 ? { ...c, replies: [{ author: "T. Okafor", text: "Noted, Finance to confirm." }] } : c) };
  const threadBack = await importDocx(buildDocx(threaded));
  check("a reply survives the round trip",
    threadBack.comments[0].replies.length === 1 && threadBack.comments[0].replies[0].text.includes("Finance to confirm"),
    JSON.stringify(threadBack.comments[0].replies));

  // a file that is not a docx must fail with a usable message, not a stack trace
  let importError = "";
  try { await importDocx(new Uint8Array([1, 2, 3, 4, 5])); } catch (e) { importError = e.message; }
  check("a non-ZIP file is refused clearly", importError.includes("Word document"), importError);
  let notDocxError = "";
  try { await importDocx(await makeZip([{ name: "hello.txt", content: "hi" }]).arrayBuffer()); }
  catch (e) { notDocxError = e.message; }
  check("a ZIP that is not a docx is refused clearly", notDocxError.includes("word/document.xml"), notDocxError);

  const graph = buildReferenceGraph(full);
  check("graph found the indemnity -> cap reference",
    graph.outbound.get("7.4")?.has("7.2"), [...(graph.outbound.get("7.4") || [])].join(","));
  check("graph found the reverse edge",
    graph.inbound.get("7.2")?.has("7.4"), [...(graph.inbound.get("7.2") || [])].join(","));
  check("insurance also points at the cap", graph.inbound.get("7.2")?.has("11.1"));
  check("a clause does not reference itself", !graph.outbound.get("7.2")?.has("7.2"));

  const ctx = contextFor(graph, "7.2");
  check("context for the cap names the clauses that depend on it", ctx.inbound.length >= 2,
    ctx.inbound.map((c) => c.ref).join(","));
  check("context carries the referenced text, not just the number",
    ctx.inbound.every((c) => c.text.length > 20));

  // The headline case: 7.2 and 11.1 are edited; 7.4 and 10.2 are not, and both change meaning.
  const editedRefs = redlined.changes.map((c) => c.clauseRef);
  const silent = silentlyAffected(graph, editedRefs);
  const silentRefs = silent.map((s) => s.ref);
  check("a clause whose meaning moved without its text is found", silentRefs.includes("7.4"),
    silentRefs.join(","));
  check("and it says which change caused it",
    silent.find((s) => s.ref === "7.4")?.because.includes("7.2"),
    JSON.stringify(silent.find((s) => s.ref === "7.4")?.because));
  check("an edited clause is not reported as silently affected",
    !silentRefs.includes("11.1"), silentRefs.join(","));
  check("prompt context names both directions",
    contextBlock(graph, "7.2").includes("refers back to 7.2"), contextBlock(graph, "7.2").slice(0, 120));
  check("prompt context is capped in length", contextBlock(graph, "7.2").length < 4000);

  const stageTally = LIFECYCLE_STAGES.map((st) => PORTFOLIO.filter((c) => stageForStatus(c.status) === st.key).length);
  check("every contract lands in exactly one lifecycle stage",
    stageTally.reduce((a, b) => a + b, 0) === PORTFOLIO.length,
    stageTally.reduce((a, b) => a + b, 0) + " of " + PORTFOLIO.length);
  check("no contract status falls outside the stage list",
    PORTFOLIO.every((c) => LIFECYCLE_STAGES.some((st) => st.key === stageForStatus(c.status))));
  check("no single stage holds the entire portfolio", Math.max(...stageTally) < PORTFOLIO.length);

  const lum = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  check("the ramp covers every lifecycle stage", SEQUENTIAL.length >= LIFECYCLE_STAGES.length,
    SEQUENTIAL.length + " steps for " + LIFECYCLE_STAGES.length + " stages");
  check("the ramp darkens at every step",
    SEQUENTIAL.every((c, i) => i === 0 || lum(c) < lum(SEQUENTIAL[i - 1])));
  // Its lightest step still has to be visible against the card it sits on.
  const surface = lum("#eae9e9"), lightest = lum(SEQUENTIAL[0]);
  check("the lightest ramp step is visible on the card surface",
    (Math.max(surface, lightest) + 0.05) / (Math.min(surface, lightest) + 0.05) >= 1.3,
    ((Math.max(surface, lightest) + 0.05) / (Math.min(surface, lightest) + 0.05)).toFixed(2) + ":1");

  const routeMap = routeMapFrom(DEFAULT_APPROVAL_MATRIX);
  check("every change type routes to a desk", DEFAULT_APPROVAL_MATRIX.every((r) => routeMap[r.changeType]));
  const actors = ROLES.filter((r) => r !== "All Access (Demo Control)");
  const unreachable = DEFAULT_APPROVAL_MATRIX
    .filter((r) => !actors.some((role) => roleCanActOnException(role, r.changeType, routeMap)))
    .map((r) => r.changeType);
  check("every routed desk can actually be acted on by some role", unreachable.length === 0, unreachable.join(","));
  // Same guarantee for anything an administrator could pick from the dropdown.
  const badDesks = ROUTE_DESKS.filter((desk) =>
    !actors.some((role) => roleCanActOnException(role, "X", { X: desk })));
  check("every selectable desk is reachable by a role", badDesks.length === 0, badDesks.join(","));

  check("every escalation target is a named approver in the pool",
    DEFAULT_APPROVAL_MATRIX.every((r) => APPROVER_POOL.some((a) => a.role === r.escalateTo.role && a.name === r.escalateTo.name)));
  check("escalation lookup falls back rather than returning undefined",
    Boolean(escalationFrom(DEFAULT_APPROVAL_MATRIX, "NoSuchType")?.role));

  // Thresholds: strictly above, and 0 means "no ceiling" rather than "escalate everything".
  const liability = DEFAULT_APPROVAL_MATRIX.find((r) => r.changeType === "Liability/Risk");
  check("value below the threshold stays delegable",
    mustEscalate(DEFAULT_APPROVAL_MATRIX, "Liability/Risk", liability.autoEscalateAbove - 1) === false);
  check("value exactly at the threshold stays delegable",
    mustEscalate(DEFAULT_APPROVAL_MATRIX, "Liability/Risk", liability.autoEscalateAbove) === false);
  check("value above the threshold forces escalation",
    mustEscalate(DEFAULT_APPROVAL_MATRIX, "Liability/Risk", liability.autoEscalateAbove + 1) === true);
  check("a zero threshold means no ceiling, not escalate-everything",
    mustEscalate(DEFAULT_APPROVAL_MATRIX, "Administrative", 99999999) === false);

  const ready = SIM_ORG.find((r) => r.Onboarding_Status__c === "Approved - Ready to Contract");
  const blocked = SIM_ORG.find((r) => r.Onboarding_Status__c === "Insurance Pending");
  check("an onboarded supplier is eligible to contract", eligibility(ready).eligible === true);
  check("an incomplete supplier is blocked", eligibility(blocked).eligible === false);
  check("the block names the missing prerequisites", eligibility(blocked).missing.length > 0
    && eligibility(blocked).missing.every((m) => m.label && m.key));
  check("every prerequisite key is a declared prerequisite",
    SIM_ORG.every((r) => Object.keys(r.prereqs || {}).every((k) => ONBOARDING_PREREQS.some((p) => p.key === k))));

  const sfCtx = sfContext(ready);
  check("Salesforce context carries the commercial and party fields",
    Boolean(sfCtx.supplier_name && sfCtx.client_entity && sfCtx.contract_value && sfCtx.currency_code));
  check("Salesforce context does not carry user-sourced fields",
    !("agreement_type" in sfCtx) && !("template_code" in sfCtx) && !("start_date" in sfCtx) && !("end_date" in sfCtx));
  check("every context key is declared as Salesforce-sourced",
    Object.keys(sfCtx).every((k) => SALESFORCE_SOURCED.includes(k)),
    Object.keys(sfCtx).filter((k) => !SALESFORCE_SOURCED.includes(k)).join(","));
  check("payment terms are parsed to a number of days", /^\d+$/.test(sfCtx.payment_terms_days));

  const sim = await listSuppliers(SALESFORCE_DEFAULTS);
  check("the simulated org answers without a network", sim.simulated === true && sim.records.length >= 2);

  const stamp = await pushMilestone(SALESFORCE_DEFAULTS, ready, {
    contractId: "CTR-2026-04821", status: "Active", milestone: "Executed and active",
  });
  check("a milestone push records contract, status and record",
    stamp.contractId === "CTR-2026-04821" && stamp.status === "Active" && stamp.recordId === ready.Id);
  check("a simulated push is marked as simulated", stamp.simulated === true);
  check("a milestone push carries no supplier master data",
    !("Name" in stamp && stamp.Name !== ready.Name) && !("Onboarding_Status__c" in stamp));

  // In-place authoring: editing a clause and dropping one in from the playbook both have
  // to arrive as ordinary tracked changes, or the rest of the workflow cannot see them.
  const authored = full;
  const who = { author: "D. Whitfield", role: "Contract Manager", date: "2026-09-08 10:00" };

  const payRef = authored.blocks.find((b) => b.type === "clause" && b.ref === "5.1")?.ref;
  check("the draft has a clause 5.1 to edit", Boolean(payRef));

  const beforeEdit = runsToOriginalText(authored.blocks.find((b) => b.ref === payRef).runs);
  const editedDoc = applyClauseEdit(authored, payRef, beforeEdit.replace("60", "45"), who);
  const editChange = editedDoc.changes.find((c) => c.clauseRef === payRef);
  check("an in-place edit produces a tracked change", Boolean(editChange));
  check("the edit records who made it", editChange?.author === who.author && editChange?.authored === true);
  check("the edit keeps the original wording as its baseline", editChange?.previous === beforeEdit);
  check("the edited clause carries ins/del runs",
    editedDoc.blocks.find((b) => b.ref === payRef).runs.some((r) => r.t === "ins" || r.t === "del"));

  const reEdited = applyClauseEdit(editedDoc, payRef, beforeEdit.replace("60", "30"), who);
  check("re-editing a clause leaves one open change on it",
    reEdited.changes.filter((c) => c.clauseRef === payRef).length === 1);
  check("re-editing still diffs from the original, not from the markup",
    reEdited.changes.find((c) => c.clauseRef === payRef)?.previous === beforeEdit);

  const tupe = CLAUSE_BY_CODE.tupe;
  const dropped = insertClauseBlock(authored, {
    afterRef: payRef, ref: tupe.clauseRef, heading: tupe.name,
    text: tupe.standardWording, playbookCode: tupe.code,
  }, who);
  const insertChange = dropped.changes.find((c) => c.inserted);
  check("a dropped playbook clause becomes a tracked insertion", Boolean(insertChange));
  // The drop point picks the clause; the clause's own number picks where it goes.
  const droppedAt = dropped.blocks.findIndex((b) => b.playbookCode === tupe.code && b.insertedBy);
  const clausesAround = dropped.blocks.filter((b) => b.type === "clause" && b.ref);
  const droppedPos = clausesAround.findIndex((b) => b.playbookCode === tupe.code && b.insertedBy);
  check("an inserted clause lands at its own number, not at the drop point",
    compareRefs(clausesAround[droppedPos - 1].ref, insertChange.clauseRef) < 0
    && (!clausesAround[droppedPos + 1] || compareRefs(insertChange.clauseRef, clausesAround[droppedPos + 1].ref) < 0),
    `${clausesAround[droppedPos - 1]?.ref} | ${insertChange.clauseRef} | ${clausesAround[droppedPos + 1]?.ref}`);
  const headingAbove = Number(dropped.blocks.slice(0, droppedAt).reverse()
    .find((b) => b.type === "heading")?.number);
  check("it never lands under a later section's heading",
    headingAbove <= Number(insertChange.clauseRef.split(".")[0]),
    `clause ${insertChange.clauseRef} sits under heading ${headingAbove}; the template has no section `
    + `${insertChange.clauseRef.split(".")[0]}, so the nearest lower one is correct`);
  check("clause references sort as numbers, not as strings",
    compareRefs("10.2", "9.1") > 0 && compareRefs("4.2", "4.10") < 0 && compareRefs("7.2A", "7.2") > 0);
  check("a clause lower than everything goes to the front",
    positionForRef(full.blocks, "0.1") === full.blocks.findIndex((b) => b.type === "clause" && b.ref));
  check("the inserted clause is entirely insertion runs",
    dropped.blocks.find((b) => b.playbookCode === tupe.code && b.insertedBy)?.runs.every((r) => r.t === "ins"));
  check("an inserted clause does not collide with an existing reference",
    dropped.blocks.filter((b) => b.ref === insertChange.clauseRef).length === 1);

  const keptIn = resolveChanges(dropped, { [insertChange.id]: "accepted" });
  const keptBlock = keptIn.blocks.find((b) => b.ref === insertChange.clauseRef);
  check("accepting a dropped clause keeps the paragraph as plain text",
    Boolean(keptBlock) && keptBlock.runs.every((r) => r.t === "text"));
  check("an accepted clause stops being marked as newly inserted",
    keptBlock && !keptBlock.insertedBy,
    "otherwise the next edit re-inserts the whole paragraph");

  const dropRejected = resolveChanges(dropped, { [insertChange.id]: "rejected" });
  check("rejecting a dropped clause removes the paragraph, not just its text",
    !dropRejected.blocks.some((b) => b.insertedBy === insertChange.id));

  // The counterparty must receive a clean draft. A clause still carried as an insertion
  // has no original text behind it, so the next person to edit it re-inserts the whole
  // paragraph instead of marking up the words that changed.
  const sentOut = settleAuthoredChanges(dropped, who.author);
  const settledBlock = sentOut.blocks.find((b) => b.ref === insertChange.clauseRef);
  check("sending settles an authored insertion into plain text",
    Boolean(settledBlock) && settledBlock.runs.every((r) => r.t === "text"));
  check("a settled clause is no longer marked as newly inserted", settledBlock && !settledBlock.insertedBy);
  check("a settled change leaves the open-change list",
    !sentOut.changes.some((c) => c.id === insertChange.id));
  check("settling leaves the other side's markup alone",
    settleAuthoredChanges(redlined, who.author).changes.length === redlined.changes.length);

  const supplierEdit = applyClauseEdit(
    sentOut, insertChange.clauseRef,
    runsToText(settledBlock.runs).replace("twenty-eight (28) days", "fourteen (14) days"),
    { author: "Meridian CTS", role: "Supplier", date: "10 Sept" }
  );
  const supplierRuns = supplierEdit.blocks.find((b) => b.ref === insertChange.clauseRef).runs;
  const insText = supplierRuns.filter((r) => r.t === "ins").map((r) => r.text).join("");
  const delText = supplierRuns.filter((r) => r.t === "del").map((r) => r.text).join("");
  check("the counterparty's edit marks the words, not the paragraph",
    insText.length < 40 && delText.length < 40,
    `ins ${insText.length} chars, del ${delText.length} chars`);
  check("the counterparty's edit shows both sides of the change",
    insText.includes("fourteen (14)") && delText.includes("twenty-eight (28)"), `${delText} -> ${insText}`);
  check("the settled wording survives around the edit",
    supplierRuns.some((r) => r.t === "text" && r.text.includes("employee liability information")));

  // Striking a clause out is a proposal like any other: it stays in the document, struck
  // through, until somebody decides it.
  const struck = deleteClauseBlock(full, "5.1", who);
  const strikeChange = struck.changes.find((c) => c.clauseRef === "5.1");
  const struckBlock = struck.blocks.find((b) => b.ref === "5.1");
  check("a deleted clause is proposed, not removed", Boolean(struckBlock) && Boolean(strikeChange));
  check("the whole clause is struck through",
    struckBlock.runs.every((r) => r.t === "del") && struckBlock.runs.length === 1);
  check("the deletion records the wording it would remove",
    strikeChange.deleted === true && strikeChange.proposed === "" && /60 days/.test(strikeChange.previous));
  check("a struck clause still counts as something to decide", pendingChangeCount(struck, {}) === 1);

  const strikeAccepted = resolveChanges(struck, { [strikeChange.id]: "accepted" });
  check("accepting a deletion takes the paragraph with it",
    !strikeAccepted.blocks.some((b) => b.ref === "5.1"));
  const strikeRejected = resolveChanges(struck, { [strikeChange.id]: "rejected" });
  const restoredBlock = strikeRejected.blocks.find((b) => b.ref === "5.1");
  check("rejecting a deletion puts the clause back untouched",
    Boolean(restoredBlock) && runsToText(restoredBlock.runs) === strikeChange.previous
    && restoredBlock.runs.every((r) => r.t === "text"));
  check("a rejected deletion stops being marked as struck", restoredBlock && !restoredBlock.deletedBy);

  const strikeWithdrawn = discardChange(struck, strikeChange.id);
  const backAgain = strikeWithdrawn.blocks.find((b) => b.ref === "5.1");
  check("withdrawing a deletion restores the clause and drops the record",
    Boolean(backAgain) && !backAgain.deletedBy
    && runsToText(backAgain.runs) === strikeChange.previous
    && !strikeWithdrawn.changes.some((c) => c.id === strikeChange.id));

  check("settling my own deletion removes the clause for good",
    !settleAuthoredChanges(struck, who.author).blocks.some((b) => b.ref === "5.1"));
  check("a deletion exports as Word deletion markup",
    new TextDecoder("latin1").decode(new Uint8Array(await buildDocx(struck).arrayBuffer())).includes("<w:del "));

  // Comparing two versions answers a different question from the markup in either of
  // them: what moved between these two points, whoever moved it.
  const vA = full;
  const vB = applyRedline(vA, SUPPLIER_REDLINE_EDITS, { author: "Meridian CTS", role: "Supplier", date: "05 Sep" });
  const vC = applyClauseEdit(vB, "5.1",
    runsToText(vB.blocks.find((b) => b.ref === "5.1").runs).replace(/within \d+ days/, "within 20 days"), who);

  const aToB = compareDocs(vA, vB);
  check("comparing the draft with their redline finds the clauses they moved",
    aToB.length === SUPPLIER_REDLINE_EDITS.filter((e) => e.proposed).length - 1,
    `${aToB.length} clauses differ`);
  check("every comparison row carries both sides",
    aToB.every((r) => r.before && r.after && r.runs.length));
  check("a comparison row marks the words, not the paragraph",
    aToB.some((r) => r.runs.some((x) => x.t === "text")));

  const bToC = compareDocs(vB, vC);
  check("comparing consecutive rounds shows only what moved in that round",
    bToC.length === 1 && bToC[0].ref === "5.1", `${bToC.length} clauses`);
  check("the round-over-round view reads from their wording, not the draft",
    /45/.test(bToC[0].before) && /20/.test(bToC[0].after), `${bToC[0].before.slice(0, 46)}`);

  const aToC = compareDocs(vA, vC);
  const payAC = aToC.find((r) => r.ref === "5.1");
  check("the cumulative view still reads from the drafted wording",
    /60/.test(payAC.before) && /20/.test(payAC.after), `${payAC.before.slice(0, 46)}`);
  check("comparing a version with itself finds nothing", compareDocs(vC, vC).length === 0);
  check("the summary counts each kind of difference",
    compareSummary(aToB).changed === aToB.length && compareSummary(aToB).added === 0);

  const withNew = insertClauseBlock(vA, {
    afterRef: "5.1", ref: "9.9", heading: "Added clause", text: "A brand new obligation.", playbookCode: "tupe",
  }, who);
  const addRows = compareDocs(vA, withNew);
  check("a clause added between versions is reported as added",
    addRows.length === 1 && addRows[0].status === "added" && addRows[0].ref === "9.9");
  check("a clause removed between versions is reported as removed",
    compareDocs(withNew, vA).some((r) => r.status === "removed" && r.ref === "9.9"));

  // A second round of markup lands on a document that already carries the first. Markup
  // whose change record has been dropped is unacceptable, unrejectable and uncounted.
  const roundOne = applyRedline(full, SUPPLIER_REDLINE_EDITS,
    { author: "Meridian CTS", role: "Supplier", date: "05 Sep" });
  const roundTwo = applyRedline(roundOne, SUPPLIER_REDLINE_EDITS,
    { author: "Meridian CTS", role: "Supplier", date: "06 Sep" });
  const liveIds = new Set(roundTwo.changes.map((c) => c.id));
  const orphans = roundTwo.blocks
    .flatMap((b) => b.runs || [])
    .filter((r) => r.changeId && !liveIds.has(r.changeId));
  check("a second pass keeps the first round's changes", roundTwo.changes.length === roundOne.changes.length,
    `${roundTwo.changes.length} vs ${roundOne.changes.length}`);
  check("a second pass orphans no markup", orphans.length === 0, `${orphans.length} orphaned runs`);
  check("every tracked run still has a change to decide",
    pendingChangeCount(roundTwo, {}) === roundOne.changes.length);

  // Countering their proposal.
  //
  // They struck the wording we drafted and proposed their own; we answer with a third
  // position. What we are answering is THEIR number, not the one we drafted, and a record
  // that says otherwise misstates the move and hides that they ever asked.
  const standing51 = runsToText(roundOne.blocks.find((b) => b.ref === "5.1").runs);
  const counterOnTheirs = applyClauseEdit(roundOne, "5.1",
    standing51.replace(/within \d+ days/, "within 30 days"), who);
  const theirs51 = roundOne.changes.find((c) => c.clauseRef === "5.1");
  const ours51 = counterOnTheirs.changes.find((c) => c.clauseRef === "5.1" && c.author === who.author);

  check("our counter is measured against their proposal, not the wording we drafted",
    ours51.previous === standing51,
    "they moved it to 45 days, so answering 30 is a move from 45 and not from what we drafted");
  check("and it still carries the wording that was originally agreed", ours51.base === theirs51.previous);
  check("our counter names the proposal it answers", ours51.counters === theirs51.id);
  check("their proposal survives as the record of what they asked for",
    counterOnTheirs.changes.some((c) => c.id === theirs51.id),
    "splicing it out loses the position and the comment thread reasoning attached to it");
  check("marked superseded rather than left open as a second proposal",
    counterOnTheirs.changes.find((c) => c.id === theirs51.id).status === "superseded");
  check("a superseded proposal is not a finding of its own",
    !deriveFindings(counterOnTheirs).some((f) => f.changeId === theirs51.id));
  check("nor an outstanding decision that blocks signature",
    pendingChangeCount(counterOnTheirs, {}) === roundOne.changes.length);

  // The document carries all three positions, which is what Word shows when you edit
  // somebody else's tracked change.
  const runs51 = counterOnTheirs.blocks.find((b) => b.ref === "5.1").runs;
  check("the wording we drafted is still struck out by them",
    runs51.some((r) => r.t === "del" && r.changeId === theirs51.id));
  check("their proposal is still in the document, struck by our counter",
    runs51.some((r) => r.t === "del" && r.wasProposedBy === "Meridian CTS" && r.changeId === ours51.id));
  check("and the strike is attributed to them proposing it, not to us writing it",
    runs51.find((r) => r.wasProposedBy)?.author === who.author);
  check("and our counter is inserted after it",
    runs51.some((r) => r.t === "ins" && !r.supersededBy && r.author === who.author));

  // Deciding the counter decides their proposal with it: one clause, one decision.
  const counterAccepted = resolveChanges(counterOnTheirs, { [ours51.id]: "accepted" });
  const counterAcceptedText = runsToText(counterAccepted.blocks.find((b) => b.ref === "5.1").runs);
  check("accepting our counter drops their superseded wording", !counterAcceptedText.includes("45 days"));
  check("and leaves ours standing", counterAcceptedText.includes("30 days"));

  const counterRejected = resolveChanges(counterOnTheirs, { [ours51.id]: "rejected" });
  const counterRejectedText = runsToText(counterRejected.blocks.find((b) => b.ref === "5.1").runs);
  check("rejecting our counter puts their proposal back on the table", counterRejectedText.includes("45 days"),
    "a proposal removed from the document rather than superseded could not come back");
  check("and our counter leaves no trace in the text", !counterRejectedText.includes("30 days"));

  // Retyping what is already there is not a negotiating move.
  const noopEdit = applyClauseEdit(roundOne, "5.1", standing51, who);
  check("retyping their wording unchanged proposes nothing",
    !noopEdit.changes.some((c) => c.author === who.author && c.clauseRef === "5.1"));

  // Revising our OWN unsent markup is the other case, and it is unchanged: one open
  // proposal, rewritten in place, still measured from the agreed wording.
  const ourFirst = applyClauseEdit(full, "5.1",
    runsToText(full.blocks.find((b) => b.ref === "5.1").runs).replace(/within \[?[^\]]*\]? days/, "within 20 days"),
    who);
  const ourSecond = applyClauseEdit(ourFirst, "5.1",
    runsToText(ourFirst.blocks.find((b) => b.ref === "5.1").runs).replace(/within \d+ days/, "within 25 days"),
    who);
  check("revising our own proposal replaces it rather than stacking on it",
    ourSecond.changes.filter((c) => c.clauseRef === "5.1").length === 1);
  check("and is still measured from the agreed wording, not from our own last position",
    ourSecond.changes.find((c) => c.clauseRef === "5.1").previous
      === runsToOriginalText(full.blocks.find((b) => b.ref === "5.1").runs),
    "a trail through positions we never put to anybody is not a negotiation record");

  // Editing their redline is a counter-proposal, so it has to go back to them before it
  // can go anywhere else.
  const theirRedline = applyRedline(full, SUPPLIER_REDLINE_EDITS,
    { author: "Meridian CTS", role: "Supplier", date: "05 Sep" });
  const countered = applyClauseEdit(theirRedline, "5.1",
    runsToText(theirRedline.blocks.find((b) => b.ref === "5.1").runs).replace(/within \d+ days/, "within 30 days"),
    who);
  check("our edit to their redline is an unsent counter-proposal",
    unsentChangesBy(countered, who.author).length === 1);
  check("their own markup is not counted as ours to send",
    unsentChangesBy(countered, "Meridian CTS").length === theirRedline.changes.length,
    "their 5.1 change is superseded by our counter, not removed from the document");

  const returned = markChangesSent(countered, who.author);
  check("sending back clears the unsent counter-proposals",
    unsentChangesBy(returned, who.author).length === 0);
  check("a sent counter-proposal stays in the document as markup",
    returned.changes.some((c) => c.author === who.author && c.sent === true));
  check("sending ours back does not touch theirs",
    returned.changes.filter((c) => c.author === "Meridian CTS").every((c) => !c.sent));

  // A genuine counter on a second clause: they capped service credits at 4%, we say 8%.
  const secondEdit = applyClauseEdit(returned, "6.3",
    runsToText(returned.blocks.find((b) => b.ref === "6.3").runs).replace("capped at 4%", "capped at 8%"),
    who);
  check("a further edit after sending is unsent again",
    unsentChangesBy(secondEdit, who.author).length === 1);

  // Discarding is not rejecting: the clause goes back to its original wording and the
  // proposal leaves the record entirely.
  const undone = discardChange(editedDoc, editChange.id);
  check("discarding an edit removes the change record",
    !undone.changes.some((c) => c.id === editChange.id));
  check("discarding an edit restores the original wording",
    runsToOriginalText(undone.blocks.find((b) => b.ref === payRef).runs) === beforeEdit
    && !undone.blocks.find((b) => b.ref === payRef).runs.some((r) => r.t === "ins" || r.t === "del"));

  const undropped = discardChange(dropped, insertChange.id);
  check("discarding an inserted clause removes the whole paragraph",
    !undropped.blocks.some((b) => b.insertedBy === insertChange.id)
    && undropped.blocks.length === authored.blocks.length);
  check("discarding leaves other changes alone",
    discardChange(dropped, insertChange.id).changes.length === dropped.changes.length - 1);

  // Model wording carries the standard position hard-coded in its prose, so a clause
  // dropped into a contract that negotiated something else has to be resolved first.
  const at30 = resolvedClauseWording("payment_terms", { ...values, payment_terms_days: "30" });
  check("a dropped clause takes this contract's negotiated value",
    at30.includes("within 30 days") && !at30.includes("sixty (60)"), at30.slice(0, 70));
  const capped = resolvedClauseWording("liability_cap", { ...values, liability_cap_amount: "110" });
  check("a dropped liability cap takes this contract's cap",
    capped.includes("110%") && !capped.includes("125%"));
  const dutchLaw = resolvedClauseWording("governing_law", { ...values, governing_law: "Netherlands" });
  check("a dropped governing-law clause follows this contract's law",
    dutchLaw.includes("Netherlands") && !dutchLaw.includes("England and Wales"));
  check("an unfilled field is still visibly unfilled after a drop",
    resolvedClauseWording("payment_terms", {}).includes("[payment_terms_days]"));

  // Authored markup has to leave the building as Word markup, or none of it is real.
  const authoredDocx = new TextDecoder("latin1").decode(
    new Uint8Array(await buildDocx(insertClauseBlock(editedDoc, {
      afterRef: payRef, ref: tupe.clauseRef, heading: tupe.name,
      text: tupe.standardWording, playbookCode: tupe.code,
    }, who)).arrayBuffer()));
  check("an in-place edit exports as Word tracked changes",
    authoredDocx.includes("<w:ins ") && authoredDocx.includes("<w:del "));
  check("a dropped clause exports as an insertion carrying its wording",
    authoredDocx.includes(tupe.standardWording.slice(0, 40)));
  check("the editor is named as the revision author in the file",
    authoredDocx.includes(`w:author="${who.author}"`));

  // Monitoring: a date, a state derived from it, and a record of what was delivered.
  const TODAY = "2027-06-15";
  const quarterly = { name: "SLA report", frequency: "Quarterly", responsible: "Supplier", consequence: "Service credits" };
  const oneOff = { name: "Give notice", frequency: "One-time (on termination)", responsible: "Either Party", consequence: "Breach" };

  check("a recurring frequency is recognised as a cycle", cycleOf("Quarterly")?.months === 3);
  check("annually and monthly are distinguished",
    cycleOf("Annually").months === 12 && cycleOf("Monthly").months === 1);
  check("an on-request duty has no cycle to schedule", cycleOf("As requested") === null);
  check("adding a cycle lands on the right date", addCycle("2027-01-31", cycleOf("Monthly")) === "2027-03-03",
    "31 Jan + 1 month rolls through a short February, as Date does");

  check("a first due date is offered one cycle out",
    suggestedFirstDue(quarterly, { start: "2026-10-01", today: TODAY }) === "2027-09-15");
  check("a duty with no cycle is offered no date",
    suggestedFirstDue(oneOff, { start: "2026-10-01", today: TODAY }) === null);
  check("a contract that has not started yet anchors on the start date",
    suggestedFirstDue(quarterly, { start: "2028-01-01", today: TODAY }) === "2028-04-01");

  check("a date in the past is overdue", monitorState({ dueDate: "2027-05-01", history: [] }, TODAY) === "overdue");
  check("a date inside the window is due", monitorState({ dueDate: "2027-07-01", history: [] }, TODAY) === "due");
  check("a date beyond the window is on track", monitorState({ dueDate: "2027-12-01", history: [] }, TODAY) === "upcoming");
  check("no date means watch-listed, not overdue", monitorState({ dueDate: null, history: [] }, TODAY) === "watch");
  check("a closed one-off is met", monitorState({ dueDate: "2027-01-01", closed: true, history: [{}] }, TODAY) === "met");

  const before = { dueDate: "2027-05-01", history: [] };
  const after = recordPerformance(before, quarterly, { at: "2027-05-04", evidence: "Q1 report", by: "CM" });
  check("recording performance rolls a recurring duty to the next cycle", after.dueDate === "2027-08-01");
  check("recording performance keeps what was delivered and when",
    after.history.length === 1 && after.history[0].evidence === "Q1 report" && after.history[0].forDue === "2027-05-01");
  check("a rolled recurring duty is not closed", after.closed === false);
  check("an overdue duty stops being overdue once recorded",
    monitorState(before, TODAY) === "overdue" && monitorState(after, TODAY) === "upcoming");

  const onceDone = recordPerformance({ dueDate: "2027-05-01", history: [] }, oneOff, { at: "2027-05-02", by: "CM" });
  check("a one-off closes rather than rolling", onceDone.closed === true && monitorState(onceDone, TODAY) === "met");

  const register = [
    { dueDate: "2027-05-01", history: [] },
    { dueDate: "2027-07-01", history: [] },
    { dueDate: "2027-12-01", history: [{ at: "2027-03-01" }] },
    { dueDate: null, history: [] },
  ];
  const sum = monitorSummary(register, TODAY);
  check("the summary counts every state",
    sum.overdue === 1 && sum.due === 1 && sum.upcoming === 1 && sum.watch === 1 && sum.total === 4);
  check("at-risk is overdue plus due", sum.atRisk === 2);

  const perf = performanceRecord(register, TODAY);
  check("the performance record counts only scheduled duties", perf.scheduled === 3,
    "a watch-listed duty has no date to have missed");
  check("the performance record counts what was actually delivered",
    perf.delivered === 1 && perf.events === 1);
  check("the performance record names what passed unrecorded", perf.missed === 1);

  // The obligations that genuinely need a scheduler: the date changes the position by
  // itself, so the fact has to be captured on the day rather than computed on read.
  const renewal = {
    name: "Serve notice of non-renewal", clause: "4.1", frequency: "One-time (before each renewal)",
    responsible: "Either Party", consequence: "It renews.",
    lapse: { effect: "The Agreement renewed for a further 12 months.", irreversible: true },
  };
  const slaDuty = { name: "SLA report", clause: "6.3", frequency: "Monthly", responsible: "Supplier", consequence: "Service credits" };

  check("a deadline obligation is recognised", isDeadline(renewal) === true);
  check("an ordinary recurring duty is not one", isDeadline(slaDuty) === false);
  check("a deadline is always tracked, whatever else it lacks",
    assessObligation(renewal).track === true && assessObligation(renewal).mode === "deadline");
  check("a deadline is treated as high importance", assessObligation(renewal).importance === "High");

  const oneRow = (entry) => [{ index: 0, obligation: renewal, entry }];
  check("the sweep does nothing before the date",
    sweep(oneRow({ dueDate: "2027-07-01", history: [] }), TODAY).length === 0);
  check("the sweep fires once the date has passed",
    sweep(oneRow({ dueDate: "2027-05-01", history: [] }), TODAY).length === 1);
  check("the sweep carries the effect, not just the date",
    sweep(oneRow({ dueDate: "2027-05-01", history: [] }), TODAY)[0].effect === renewal.lapse.effect);
  check("an ordinary overdue duty is never swept",
    sweep([{ index: 0, obligation: slaDuty, entry: { dueDate: "2027-01-01", history: [] } }], TODAY).length === 0,
    "overdue is derived on read and needs no job");

  const hit = sweep(oneRow({ dueDate: "2027-05-01", history: [] }), TODAY)[0];
  const recorded = applyLapse({ dueDate: "2027-05-01", history: [] }, { at: hit.dueDate, effect: hit.effect });
  check("the lapse is recorded against the day it happened, not the day it was noticed",
    recorded.lapsed.at === "2027-05-01" && recorded.lapsed.at !== TODAY);
  check("the lapse leaves an entry in the history", recorded.history.length === 1
    && /Lapsed:/.test(recorded.history[0].evidence));
  check("a lapsed deadline reads as lapsed, not merely overdue",
    monitorState(recorded, TODAY) === "lapsed");
  check("the sweep is idempotent: a recorded lapse does not fire twice",
    sweep(oneRow(recorded), TODAY).length === 0);
  check("a lapse counts as at-risk", monitorSummary([recorded], TODAY).lapsed === 1
    && monitorSummary([recorded], TODAY).atRisk === 1);

  const deadlineRows = MOCK_OBLIGATIONS.filter(isDeadline);
  check("the extracted register carries deadline obligations", deadlineRows.length === 4,
    deadlineRows.map((o) => o.clause).join(","));
  check("every deadline states what lapsing does",
    deadlineRows.every((o) => o.lapse.effect.length > 20));
  check("every deadline is trackable", deadlineRows.every((o) => assessObligation(o).track));

  // Striking a clause out does not strike out the sentences that cite it.
  const xrefGraph = buildReferenceGraph(full);
  const citing = citationsOf(xrefGraph, "7.2");
  check("the clauses citing a clause are found before it is deleted",
    citing.map((c) => c.ref).join(",") === "7.4,11.1", citing.map((c) => c.ref).join(","));
  check("each citation quotes the sentence that names it",
    citing.every((c) => /clause 7\.2/i.test(c.sentence)));
  const uncited = [...xrefGraph.blocks.keys()].find((r) => !(xrefGraph.inbound.get(r) || []).length);
  check("a clause nothing points at reports no citations",
    Boolean(uncited) && citationsOf(xrefGraph, uncited).length === 0, `checked ${uncited}`);
  check("citations survive being asked for a missing clause", citationsOf(xrefGraph, "99.9").length === 0);

  const cutDoc = deleteClauseBlock(full, "7.2", who);
  const cutChange = cutDoc.changes.find((c) => c.clauseRef === "7.2");
  const afterCut = resolveChanges(cutDoc, { [cutChange.id]: "accepted" });
  check("after the deletion the graph can no longer see the broken pointer",
    citationsOf(buildReferenceGraph(afterCut), "7.2").length === 0,
    "which is exactly why the warning has to come first");
  check("but the prose still names the clause that has gone",
    /clause 7\.2/i.test(runsToText(afterCut.blocks.find((b) => b.ref === "7.4").runs)));

  // An amendment against a register extracted before it existed.
  const amendedBy = { id: "AMD-001", reason: "Extend the term and revise clause 11.1 insurance limits", effectiveDate: "2027-04-01" };
  const impact = amendmentImpact(MOCK_OBLIGATIONS, amendedBy);
  check("an amendment's named clauses are picked out of its reason", impact.refs.includes("11.1"));
  check("obligations sitting on a named clause are flagged",
    impact.named.some((o) => o.clause === "11.1"), impact.named.map((o) => o.clause).join(","));
  check("obligations on clauses it does not name are left alone",
    !impact.named.some((o) => o.clause === "6.3"));
  check("an amendment naming nothing flags nothing",
    amendmentImpact(MOCK_OBLIGATIONS, { id: "A", reason: "Correct a typo in the preamble" }).named.length === 0);
  check("no amendment means no review", amendmentImpact(MOCK_OBLIGATIONS, null).named.length === 0);


  // ---- The session snapshot, and refusing one written under another schema ----
  //
  // The point of the guard is that it fires on shapes this build has never seen, so the
  // test drives it with exactly that: a snapshot from a schema that is not this one.
  function fakeStorage(initial) {
    const map = new Map(Object.entries(initial || {}));
    return {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, v),
      removeItem: (k) => map.delete(k),
      _map: map,
    };
  }

  const emptyStore = fakeStorage();
  check("no snapshot reads as nothing to restore", readSnapshot(emptyStore) === null);

  const roundTrip = fakeStorage();
  writeSnapshot(roundTrip, { docVersion: "v1.1", sentToSupplier: true });
  const readBack = readSnapshot(roundTrip);
  check("a snapshot written by this build reads back", readBack?.docVersion === "v1.1");
  check("and carries the schema it was written under", readBack?.__schema === SCHEMA);

  const staleStore = fakeStorage({ [PERSIST_KEY]: JSON.stringify({ __schema: SCHEMA + 1, docVersion: "v9" }) });
  check("a snapshot from another schema is discarded, not migrated", readSnapshot(staleStore) === null,
    "a stale shape restored into this build's renderer throws on every reload");

  const unversioned = fakeStorage({ [PERSIST_KEY]: JSON.stringify({ docVersion: "v1.0" }) });
  check("a snapshot from before schemas existed is discarded too", readSnapshot(unversioned) === null);

  const corruptStore = fakeStorage({ [PERSIST_KEY]: '{"__schema":' });
  check("a truncated snapshot is discarded rather than thrown", readSnapshot(corruptStore) === null);

  const notObject = fakeStorage({ [PERSIST_KEY]: '"a string"' });
  check("a snapshot that is not an object is discarded", readSnapshot(notObject) === null);

  const blockedStore = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  check("blocked storage reads as no snapshot", readSnapshot(blockedStore) === null);
  check("blocked storage reports the write failed", writeSnapshot(blockedStore, { a: 1 }) === false);
  check("blocked storage does not throw on clear", clearSnapshot(blockedStore) === false);

  clearSnapshot(roundTrip);
  check("clearing removes the snapshot", readSnapshot(roundTrip) === null);

  // ---- The audit trail ----
  const entryLegal = makeAuditEntry({ event: "Approved clause 7.2", role: "Legal", contractId: "CLM-2041", at: "2026-03-02T09:15:00.000Z" });
  check("an entry records the role that acted", entryLegal.role === "Legal");
  check("and the contract it was taken against", entryLegal.contractId === "CLM-2041");
  check("and an ISO instant rather than a rendered time", entryLegal.at === "2026-03-02T09:15:00.000Z");
  check("a role the data names a person for gets the person", entryLegal.actor === "R. Sandhu");
  check("the label carries both the person and the role", actorLabel(entryLegal) === "R. Sandhu (Legal)");

  const entryFinance = makeAuditEntry({ event: "Escalated", role: "Finance / Commercial Approver" });
  check("a role with nobody named stays the role", entryFinance.actor === null);
  check("and its label is the role alone", actorLabel(entryFinance) === "Finance / Commercial Approver");
  check("an entry defaults its instant to now", !isNaN(new Date(entryFinance.at)));

  const entryDemo = makeAuditEntry({ event: "Signed", role: "All Access (Demo Control)" });
  check("an action taken under demo control is flagged as such", entryDemo.demoControl === true,
    "an audit entry attributable to nobody should say so, not pick somebody");
  check("an action taken under a product role is not", entryLegal.demoControl === false);
  check("a role nobody named is not silently attributed", actorFor("Auditor (read-only)") === null);

  // Sorting is why the instant is stored rather than the rendering: "02 Apr" sorts
  // before "02 Mar" as a string and after it as a date.
  const march = makeAuditEntry({ event: "March", role: "Legal", at: "2026-03-02T09:00:00.000Z" });
  const april = makeAuditEntry({ event: "April", role: "Legal", at: "2026-04-02T09:00:00.000Z" });
  const orderedTrail = newestFirst([march, april]);
  check("the trail sorts newest first on the instant", orderedTrail[0].event === "April");
  check("and sorting does not mutate the caller's array",
    [march, april][0].event === "March");
  check("a rendered time is a rendering, not the record",
    formatAuditTime("2026-03-02T09:15:00.000Z").includes("2026")
    && formatAuditTime("2026-03-02T09:15:00.000Z").includes("Mar"));
  check("an unparseable instant renders as itself rather than Invalid Date",
    formatAuditTime("not a date") === "not a date");

  const auditTrail = [entryLegal, entryFinance, entryDemo, march, april];
  check("the trail filters by acting role", filterEntries(auditTrail, { role: "Legal" }).length === 3);
  check("the trail filters by contract", filterEntries(auditTrail, { contractId: "CLM-2041" }).length === 1);
  check("the trail searches the event text", filterEntries(auditTrail, { query: "escalat" }).length === 1);
  check("search reaches the actor's name", filterEntries(auditTrail, { query: "sandhu" }).length === 3);
  check("no filter returns everything", filterEntries(auditTrail).length === auditTrail.length);
  check("the role list is the roles present", rolesIn(auditTrail).includes("Legal") && rolesIn(auditTrail).length === 3);
  check("the contract list carries the one contract plus the estate-level bucket",
    contractsIn(auditTrail).length === 2 && contractsIn(auditTrail)[0] === "CLM-2041",
    "entries taken before any contract existed are labelled, not dropped");

  const auditCsv = auditToCsv([
    makeAuditEntry({ event: 'Rejected "cap at 100%", per clause 7.2', role: "Legal", contractId: "CLM-2041", at: "2026-03-02T09:15:00.000Z" }),
  ]);
  const auditCsvLines = auditCsv.split(/\r\n/);
  check("the export leads with a header row", auditCsvLines[0] === AUDIT_CSV_HEADER.join(","));
  check("the export quotes a field containing a comma", auditCsvLines[1].includes('"Rejected ""cap at 100%"", per clause 7.2"'),
    "an unquoted comma shifts every later column and the file is trusted anyway");
  check("the export carries the ISO instant, not the rendering", auditCsvLines[1].startsWith("2026-03-02T09:15:00.000Z"));
  check("the export names the actor and the role separately",
    auditCsvLines[1].includes("R. Sandhu,Legal"));
  check("an empty trail still exports a header", auditToCsv([]).split(/\r\n/).length === 1);

  // Reading the trail is a permission of its own, held by the role that can do nothing else.
  check("the auditor can read the trail", canReadAudit("Auditor (read-only)"));
  check("demo control can read the trail", canReadAudit("All Access (Demo Control)"));
  check("a role that can act on contracts cannot read the estate trail", !canReadAudit("Contract Manager"));
  check("nor can the administrator, who configures rather than reviews", !canReadAudit("System Administrator"));


  // ---- Which contract an entry belongs to ----
  //
  // The trail's whole job is saying what an action was taken on. An action on one
  // contract filed against another is worse than an unfiled one, so the scoping rules
  // get their own checks.
  const onA = makeAuditEntry({ event: "Approved clause 7.2", role: "Legal", contractId: "CLM-2041" });
  const onB = makeAuditEntry({ event: "Contract CLM-3300 quick-added", role: "Contract Manager", contractId: "CLM-3300" });
  const estateWide = makeAuditEntry({ event: "Initiation opened from Salesforce", role: "Contract Manager", contractId: null });
  const mixed = [onA, onB, estateWide];

  check("a contract's trail is only its own events", forContract(mixed, "CLM-2041").length === 1);
  check("another contract's events are not in it",
    !forContract(mixed, "CLM-2041").some((e) => e.contractId === "CLM-3300"),
    "an action on one contract filed against another is the one thing a trail must not do");
  check("an estate-level event belongs to no contract's trail",
    forContract(mixed, "CLM-2041").every((e) => e.contractId));
  check("a contract nothing happened on has an empty trail", forContract(mixed, "CLM-9999").length === 0);

  check("an entry with no contract is labelled rather than blanked", contractLabel(estateWide) === UNSCOPED);
  check("an entry with a contract is labelled with it", contractLabel(onA) === "CLM-2041");

  check("both contracts appear as filter options", contractsIn(mixed).includes("CLM-2041") && contractsIn(mixed).includes("CLM-3300"));
  check("and the estate-level bucket appears once anything is in it", contractsIn(mixed).includes(UNSCOPED));
  check("the estate-level bucket sorts after the contract numbers",
    contractsIn(mixed).indexOf(UNSCOPED) === contractsIn(mixed).length - 1);
  check("with nothing unscoped there is no estate-level option",
    !contractsIn([onA, onB]).includes(UNSCOPED));
  check("a single-contract trail offers exactly one option, so the filter has nothing to choose between",
    contractsIn([onA]).length === 1, "which is why the page hides the control rather than showing a one-option dropdown");

  check("the estate-level bucket is filterable", filterEntries(mixed, { contractId: UNSCOPED }).length === 1);
  check("and filtering to a contract excludes the estate-level events",
    filterEntries(mixed, { contractId: "CLM-2041" }).every((e) => e.contractId === "CLM-2041"));
  check("search reaches the estate-level label", filterEntries(mixed, { query: "estate" }).length === 1);
  check("the export writes the estate-level label, not an empty cell",
    auditToCsv([estateWide]).includes(UNSCOPED));


  // ---- The version moves when the document changes hands ----
  //
  // It used to move only when the counterparty acted, so a counter-proposal went back to
  // them carrying the number they had given us: two materially different contracts under
  // one version, one of them a .docx that had left the building.
  const vDraft = buildDraft("hard_fm_global", {
    contract_number: "CTR-V", supplier_name: "Meridian", client_name: "Client",
    start_date: "2026-10-01", end_date: "2029-09-30", contract_value: "500000",
    currency_code: "GBP", payment_terms_days: "12",
  }, { version: "v1.0", status: "Draft" });
  const vUs = { author: "D. Whitfield", role: "Contract Manager", date: "08 Sep" };
  const vThem = { author: "Meridian CTS", role: "Supplier", date: "09 Sep" };
  const vPay = (d) => runsToText(d.blocks.find((b) => b.ref === "5.1").runs);

  check("a draft starts at v1.0", vDraft.meta.version === "v1.0");

  // Marking a working copy up is not a hand-over. Both routes the supplier has to mark
  // the document up have to reach the same version, or the number records how they
  // edited rather than that they replied.
  const vMarked = applyRedline(vDraft, [{ clauseRef: "5.1", proposed: vPay(vDraft).replace("within 12 days", "within 6 days") }], vThem);
  check("scripted markup on their working copy does not move the version",
    vMarked.meta.version === "v1.0");
  const vHandMarked = applyClauseEdit(vDraft, "5.1", vPay(vDraft).replace("within 12 days", "within 6 days"), vThem);
  check("nor does marking it up clause by clause", vHandMarked.meta.version === "v1.0");
  check("so both routes to the same exchange agree",
    vMarked.meta.version === vHandMarked.meta.version,
    "one route bumping and the other not is how a redline came back stamped as the draft");

  const vR1 = returnToClient(vMarked);
  check("their redline comes back a version up", vR1.meta.version === "v1.1");
  check("and says what it now is", vR1.meta.status === "Redline received");
  check("returning a hand-marked redline reaches the same version",
    returnToClient(vHandMarked).meta.version === "v1.1");
  check("their changes are not marked as ours on the way back",
    vR1.changes.every((c) => !c.sent));

  const vEdited = applyClauseEdit(vR1, "5.1", vPay(vR1).replace("within 6 days", "within 9 days"), vUs);
  check("editing in place does not move the version on its own", vEdited.meta.version === "v1.1",
    "the document has not gone anywhere yet");

  const vSent = handToCounterparty(vEdited, vUs.author);
  check("sending our counter back moves it", vSent.meta.version === "v1.2",
    "this is the exchange that used to leave the version standing still");
  check("and marks our changes as sent", vSent.changes.filter((c) => c.author === vUs.author).every((c) => c.sent));
  check("and says what the document now is", vSent.meta.status === "Counter-proposal sent");
  check("theirs is not marked sent by our hand-over",
    vSent.changes.filter((c) => c.author === vThem.author).every((c) => !c.sent));

  const vRev = applySupplierRevision(vSent, "5.1", vPay(vSent).replace("within 9 days", "within 8 days"), vThem);
  check("their revision moves it again", vRev.meta.version === "v1.3");

  const vSent2 = handToCounterparty(applyClauseEdit(vRev, "5.1", vPay(vRev).replace("within 8 days", "within 7 days"), vUs), vUs.author);
  check("and our second counter again", vSent2.meta.version === "v1.4");

  const vSeen = [vDraft, vR1, vSent, vRev, vSent2].map((d) => d.meta.version);
  check("five exchanges produce five distinct versions", new Set(vSeen).size === 5, vSeen.join(" -> "));
  check("the version never moves backwards",
    vSeen.every((v, i) => i === 0 || Number(v.slice(3)) > Number(vSeen[i - 1].slice(3))));
  check("bumping is minor-only, so v1.9 goes to v1.10 rather than v2.0", bumpVersion("v1.9") === "v1.10");
  check("an unreadable version falls back rather than throwing", bumpVersion("draft") === "v1.1");

  // ---- Approving a counter-proposal before it is sent ----
  //
  // Deciding their changes is routed by the playbook. Authoring ours was governed by
  // nothing, so our wording went to the counterparty having been read by one person.
  const gateChanges = vEdited.changes.filter((c) => c.author === vUs.author && !c.sent);
  check("our unsent counter is what the gate is asked about", gateChanges.length === 1);

  const rows = counterApprovalRows(gateChanges, {});
  check("the gate places our counter in the playbook band exactly as it would theirs",
    Boolean(rows[0].assessment), rows[0].assessment?.verdict);
  check("an unapproved counter is not ready to send", !counterReady(rows));
  check("and the clause waiting is named", outstandingCounters(rows)[0].change.clauseRef === "5.1");

  // Asserted against literals, not against the row's own fields. Reading recordedBy back
  // out of the object it came from passes whatever that field happens to say, which is
  // how a broken routing table goes green.
  //
  // 9 days is past the walk-away line on clause 5.1 (standard 60, fallback 45, walk away
  // under 30), so this is the escalation path.
  check("a counter past the walk-away line escalates", rows[0].assessment.position === "walkAway");
  check("and the playbook names the escalation role", rows[0].requiredRole === "Head of Finance",
    rows[0].requiredRole);
  check("which is not a seat anybody logs in as, so the owning desk records it",
    rows[0].recordedBy === "Finance / Commercial Approver" && rows[0].escalated === true,
    `${rows[0].recordedBy}, escalated=${rows[0].escalated}`);
  check("demo control may always record it", canApproveCounter("All Access (Demo Control)", rows[0]));
  check("an auditor may not", !canApproveCounter("Auditor (read-only)", rows[0]),
    "a role that can act on nothing cannot approve our negotiating position either");
  check("Finance records this one", canApproveCounter("Finance / Commercial Approver", rows[0]));
  check("Legal does not", !canApproveCounter("Legal", rows[0]));
  check("nor does the Contract Manager", !canApproveCounter("Contract Manager", rows[0]));
  check("nor the escalation role itself, which nobody can select",
    !canApproveCounter("Head of Finance", rows[0]));

  // The ordinary case, and the one the shipped demo actually hits: inside the fallback
  // band the approving role is a real seat and there is no escalation.
  const fallbackRow = counterApprovalRows([{
    id: "c-fb", clauseRef: "5.1", clauseHeading: "Payment terms",
    playbookCode: gateChanges[0].playbookCode,
    previous: vPay(vR1), proposed: vPay(vR1).replace(/within \d+ days/, "within 45 days"),
    author: vUs.author,
  }], {})[0];
  check("a counter inside the fallback band needs the clause's approving role",
    fallbackRow.requiredRole === "Finance / Commercial Approver", fallbackRow.requiredRole);
  check("and is not an escalation", fallbackRow.escalated === false);
  check("so the desk approves it directly", canApproveCounter("Finance / Commercial Approver", fallbackRow));
  check("and it still has to be approved before it is sent", !counterReady([fallbackRow]));

  const approvedRows = counterApprovalRows(gateChanges, { [gateChanges[0].id]: { by: "Legal", at: "08 Sep" } });
  check("once approved it is ready to send", counterReady(approvedRows));
  check("and nothing is outstanding", outstandingCounters(approvedRows).length === 0);
  check("an approved row cannot be approved again", !canApproveCounter("All Access (Demo Control)", approvedRows[0]));

  // A counter at or better than our own standard position needs nobody: requiring a
  // signature to propose our own wording is how approvals become things people click through.
  // The playbook's standard for clause 5.1 is 60 days, so a counter at 60 is our own
  // position and there is no exception for anybody to approve.
  const atStandard = counterApprovalRows([{
    id: "c-std", clauseRef: "5.1", clauseHeading: "Payment terms",
    playbookCode: gateChanges[0].playbookCode,
    previous: vPay(vR1), proposed: vPay(vR1).replace(/within \d+ days/, "within 60 days"),
    author: vUs.author,
  }], {});
  check("a counter back to our own standard position needs no approval",
    !atStandard[0].needsApproval && atStandard[0].approved,
    atStandard[0].assessment?.verdict);
  check("so a document carrying only that is ready to send", counterReady(atStandard));
  check("no counters at all is trivially ready", counterReady(counterApprovalRows([], {})));


  // ---- A clause left pointing at one that is being struck out ----
  //
  // The pre-flight warning fires once, for the person clicking Delete, on the one path
  // that goes through that button. It is not there when the counterparty strikes the
  // clause out in their own copy, and it is gone the moment it is dismissed. What is left
  // is 7.4 reading "not subject to the limit in clause 7.2" beside a struck-out 7.2.
  const dangleBase = buildDraft("hard_fm_global", {
    contract_number: "CTR-D", supplier_name: "Meridian", client_name: "Client",
    start_date: "2026-10-01", end_date: "2029-09-30", contract_value: "500000",
    currency_code: "GBP", payment_terms_days: "60",
  }, { version: "v1.0", status: "Draft" });

  check("an untouched document has nothing dangling", danglingReferences(dangleBase, {}).size === 0);

  const struck72 = deleteClauseBlock(dangleBase, "7.2", { author: "Meridian CTS", role: "Supplier", date: "10 Sep" });
  const dangles = danglingReferences(struck72, {});
  check("striking out 7.2 leaves the clauses that cite it dangling", dangles.size > 0,
    [...dangles.keys()].join(", "));
  check("7.4 is named, because it says the indemnity is not subject to 7.2's limit",
    dangles.get("7.4")?.includes("7.2"), JSON.stringify([...dangles]));
  check("and it is found by the counterparty's deletion, not only by our own",
    struck72.blocks.find((b) => b.ref === "7.2").runs.every((r) => r.author === "Meridian CTS"));
  check("the struck clause is not listed as dangling against itself", !dangles.has("7.2"));
  check("a clause that cites nothing struck out is not listed", !dangles.has("5.1"));

  // Decision-aware, so nothing has to remember the warning was shown.
  const deleteId = struck72.blocks.find((b) => b.ref === "7.2").deletedBy;
  check("rejecting the deletion clears the warning",
    danglingReferences(struck72, { [deleteId]: "rejected" }).size === 0,
    "the clause is back, so nothing points at a hole");
  check("accepting it keeps the warning while the reference is still in the text",
    danglingReferences(struck72, { [deleteId]: "accepted" }).get("7.4")?.includes("7.2"));

  // The same fact the panel reaches by a different route, which is why both exist.
  check("the finding for the deletion also names what it moves",
    /7\.4/.test(deriveFindings(struck72, buildReferenceGraph(dangleBase)).find((f) => f.clauseRef === "7.2")?.impact || ""));


  // ---- The internal-review invalidation ----
  //
  // It was cleared in exactly one place: the Resubmit button, which only appears after a
  // rejection. Re-approving left the flag set, and the banner then lay dormant until the
  // approval status went non-Approved for an unrelated reason and put it back on screen
  // telling three people who had just approved to approve again.
  const allApproved = { owner: { status: "approved" }, procurement: { status: "approved" }, legal: { status: "approved" } };
  const allPending = { owner: { status: "pending" }, procurement: { status: "pending" }, legal: { status: "pending" } };
  const oneOut = { ...allApproved, legal: { status: "pending" } };

  check("an invalidation with reviewers still pending asks them to look again",
    reviewNeedsReapproval({ reason: "edited" }, allPending));
  check("with one still pending it still asks", reviewNeedsReapproval({ reason: "edited" }, oneOut));
  check("once they have all approved it stops asking",
    !reviewNeedsReapproval({ reason: "edited" }, allApproved),
    "the banner is a request, and it ends when the request is met");
  check("no invalidation asks nothing", !reviewNeedsReapproval(null, allPending));
  check("the invalidation is satisfied by unanimous approval", invalidationSatisfied(allApproved));
  check("and not by a partial one", !invalidationSatisfied(oneOut));
  check("nor by an empty set", !invalidationSatisfied({}));

  // The exact sequence that produced the stale banner.
  const seqApproved = computeApprovalStatus(allApproved, true, null, 0, 0);
  check("all three approved reads as Approved", seqApproved === "Approved");
  const seqEdited = computeApprovalStatus(allPending, true, null, 0, 0);
  check("after an edit resets them it reads as In Progress", seqEdited === "In Progress");
  const seqExceptions = computeApprovalStatus(allApproved, true, [{}], 3, 0);
  check("a redline with open exceptions reads as Exception Approval Required",
    seqExceptions === "Exception Approval Required",
    "which is not the reviewers' business, and is why the banner cannot key on completeness");
  check("the reviewers are nonetheless done at that point",
    !reviewNeedsReapproval({ reason: "edited" }, allApproved),
    "keyed on completeness this is where the stale banner came back");

  check("a rejection outranks the exception state", computeApprovalStatus({ ...allApproved, legal: { status: "rejected" } }, true, [{}], 3, 0) === "Rejected");
  check("a change request does too", computeApprovalStatus({ ...allApproved, legal: { status: "changes" } }, true, [{}], 3, 0) === "Changes Requested");
  check("no contract means nothing to approve", computeApprovalStatus(allApproved, false, null, 0, 0) === "Not Started");

  // ---- Only the newest stage of the document is editable ----
  //
  // `versions` is built in stage order and carries only the stages that exist, so the
  // last entry is the live one. Naming a stage instead left the previous one editable
  // every time a new stage was added: executing the contract left the redline open.
  const liveOf = (keys) => keys[keys.length - 1];
  check("with only a draft, the draft is live", liveOf(["draft"]) === "draft");
  check("once a redline exists the draft is superseded", liveOf(["draft", "redline"]) !== "draft");
  check("and the redline is the live one", liveOf(["draft", "redline"]) === "redline");
  check("once executed the redline is superseded too", liveOf(["draft", "redline", "executed"]) !== "redline",
    "a signed contract must not leave the version behind it open for editing");
  check("and an amendment supersedes the executed PDF",
    liveOf(["draft", "redline", "executed", "amended"]) === "amended");

  // ---- Findings belong to the version they were derived from ----
  const mismatched = (derivedFor, viewing) => Boolean(derivedFor && viewing && derivedFor !== viewing);
  check("findings read against the version they came from fit", !mismatched("v1.1", "v1.1"));
  check("read against another version they do not", mismatched("v1.1", "v1.2"));
  check("and going back to their own version settles it again", !mismatched("v1.1", "v1.1"),
    "the prompt to re-derive comes and goes with the version on screen, without being dismissed");
  check("nothing is claimed before a run has happened", !mismatched(null, "v1.1"));

  const contractLive = computeContractStatus({
    exists: true, envelopeStatus: "COMPLETED", aiChange: null, undecided: 0, blocked: 0,
    redlineReceived: true, sentToSupplier: true, approvalStatus: "Approved", readyForSignature: true,
    envelope: {}, anyReviewerActed: true,
  });
  check("an executed envelope makes the contract Active", contractLive === "Active");

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    if (!r.ok) console.log("FAIL  " + r.name + (r.detail ? "   [" + r.detail + "]" : ""));
  }
  console.log("" + (results.length - failed.length) + "/" + results.length + " checks passed");
  if (failed.length) process.exitCode = 1;
}
main();
