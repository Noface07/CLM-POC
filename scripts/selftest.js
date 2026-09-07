import { buildDraft, unresolvedTokens, docToPlainText, templateIsDraftable } from "../src/data/templates.js";
import { TEMPLATES, PLAYBOOK, CLAUSE_BY_CODE } from "../src/data/catalogue.js";
import { applyRedline, resolveChanges, deriveFindings, pendingChangeCount, diffToRuns, SUPPLIER_REDLINE_EDITS } from "../src/lib/redline.js";
import { assessFinding, extractValue, placeInBand, matchClause } from "../src/lib/playbook.js";
import { buildDocx } from "../src/lib/docx.js";
import { makeZip } from "../src/lib/zip.js";
import { contractVisibility, visibleContracts, roleCanActOnException, ROLES } from "../src/lib/rbac.js";
import { SIM_ORG, ONBOARDING_PREREQS, eligibility, contextFor as sfContext, SALESFORCE_SOURCED, listSuppliers, pushMilestone, SALESFORCE_DEFAULTS } from "../src/lib/salesforce.js";
import { DEFAULT_APPROVAL_MATRIX, APPROVER_POOL, ROUTE_DESKS, routeMapFrom, escalationFrom, mustEscalate } from "../src/data/contracts.js";
import { PORTFOLIO } from "../src/data/contracts.js";
import { importDocx } from "../src/lib/docx-import.js";
import { readZip } from "../src/lib/unzip.js";
import { parseXml, findAll, textOf, attr } from "../src/lib/xml.js";
import { buildReferenceGraph, contextFor, silentlyAffected, contextBlock } from "../src/lib/crossref.js";
import { buildPdf } from "../src/lib/pdf.js";
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

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    if (!r.ok) console.log("FAIL  " + r.name + (r.detail ? "   [" + r.detail + "]" : ""));
  }
  console.log("" + (results.length - failed.length) + "/" + results.length + " checks passed");
  if (failed.length) process.exitCode = 1;
}
main();
