import { makeZip, downloadBlob } from "./zip.js";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const NS_W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const NS_VML = 'xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w10="urn:schemas-microsoft-com:office:word"';

export function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function isoDate(value) {
  const d = value ? new Date(value) : new Date();
  return (isNaN(d) ? new Date() : d).toISOString().replace(/\.\d+Z$/, "Z");
}

function initialsOf(name) {
  return String(name || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 3).toUpperCase();
}

function textRun(text, props = "") {
  return `<w:r>${props}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

let revisionId = 100;

function runsToXml(runs, opts) {
  return runs.map((run) => {
    if (run.t === "ins") {
      const id = revisionId++;
      return `<w:ins w:id="${id}" w:author="${esc(run.author || "Supplier")}" w:date="${isoDate(run.date)}">`
        + `<w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t xml:space="preserve">${esc(run.text)}</w:t></w:r></w:ins>`;
    }
    // Text one party inserted and the other then struck out. OOXML nests the deletion
    // inside the insertion, which is how Word keeps both attributions: their proposal,
    // our strike. Flattening it to a plain deletion would credit us with removing
    // wording that was never in the contract.
    if (run.t === "del" && run.wasProposedBy) {
      const insId = revisionId++;
      const delId = revisionId++;
      return `<w:ins w:id="${insId}" w:author="${esc(run.wasProposedBy)}" w:date="${isoDate(run.date)}">`
        + `<w:del w:id="${delId}" w:author="${esc(run.author || "Client")}" w:date="${isoDate(run.date)}">`
        + `<w:r><w:delText xml:space="preserve">${esc(run.text)}</w:delText></w:r>`
        + `</w:del></w:ins>`;
    }
    if (run.t === "del") {
      const id = revisionId++;
      return `<w:del w:id="${id}" w:author="${esc(run.author || "Supplier")}" w:date="${isoDate(run.date)}">`
        + `<w:r><w:delText xml:space="preserve">${esc(run.text)}</w:delText></w:r></w:del>`;
    }
    if (run.t === "token") {
      const filled = run.value != null && run.value !== "";
      const shown = filled ? run.value : `[${run.name}]`;
      const highlight = filled
        ? (opts.markFilledTokens ? '<w:rPr><w:highlight w:val="lightGray"/></w:rPr>' : "")
        : '<w:rPr><w:highlight w:val="yellow"/></w:rPr>';
      return textRun(shown, highlight);
    }
    if (run.t === "bold") return textRun(run.text, "<w:rPr><w:b/></w:rPr>");
    return textRun(run.text);
  }).join("");
}

function blockToXml(block, opts, comments) {
  const runs = block.runs || (block.text != null ? [{ t: "text", text: block.text }] : []);

  if (block.type === "title") {
    return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr>`
      + `<w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t xml:space="preserve">${esc(block.text)}</w:t></w:r></w:p>`;
  }
  if (block.type === "subtitle") {
    return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="360"/></w:pPr>`
      + `<w:r><w:rPr><w:sz w:val="20"/><w:color w:val="555555"/></w:rPr><w:t xml:space="preserve">${esc(block.text)}</w:t></w:r></w:p>`;
  }
  if (block.type === "signature") {
    const line = (label, value, props = "") =>
      `<w:p><w:pPr><w:spacing w:after="40"/></w:pPr>`
      + `<w:r><w:rPr><w:sz w:val="18"/><w:color w:val="666666"/></w:rPr><w:t xml:space="preserve">${esc(label)}  </w:t></w:r>`
      + `<w:r>${props}<w:t xml:space="preserve">${esc(value)}</w:t></w:r></w:p>`;
    const script = '<w:rPr><w:rFonts w:ascii="Segoe Script" w:hAnsi="Segoe Script" w:cs="Segoe Script"/>'
      + '<w:sz w:val="30"/><w:color w:val="1B3A6B"/></w:rPr>';
    return `<w:p><w:pPr><w:spacing w:before="280" w:after="60"/></w:pPr>`
      + `<w:r><w:rPr><w:b/><w:caps/></w:rPr><w:t xml:space="preserve">Signed for and on behalf of ${esc(block.entity)}</w:t></w:r></w:p>`
      + (block.signed
        ? line("Signature:", block.byName, script)
          + `<w:p><w:pPr><w:spacing w:after="60"/><w:ind w:left="1100"/></w:pPr>`
            + `<w:r><w:rPr><w:sz w:val="14"/><w:caps/><w:color w:val="777777"/></w:rPr>`
            + `<w:t xml:space="preserve">Signed electronically</w:t></w:r></w:p>`
          + line("Name:", block.byName)
          + line("Title:", block.title || "Authorised signatory")
          + line("Date:", block.date)
          + line("Method:", block.method || "Typed electronic signature")
        : line("Signature:", "________________________________")
          + line("Name:", "________________________________")
          + line("Date:", "________________________________"));
  }
  if (block.type === "heading") {
    return `<w:p><w:pPr><w:spacing w:before="280" w:after="120"/></w:pPr>`
      + `<w:r><w:rPr><w:b/><w:caps/><w:sz w:val="24"/></w:rPr>`
      + `<w:t xml:space="preserve">${esc(block.number ? block.number + ". " + block.text : block.text)}</w:t></w:r></w:p>`;
  }

  // A clause paragraph, optionally wrapped in a comment range.
  const attached = (comments || []).filter((c) => c.anchor === block.ref);
  const start = attached.map((c) => `<w:commentRangeStart w:id="${c.wid}"/>`).join("");
  const end = attached.map((c) =>
    `<w:commentRangeEnd w:id="${c.wid}"/>`
    + `<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="${c.wid}"/></w:r>`
  ).join("");

  const label = block.ref
    ? `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${esc(block.ref)}${block.heading ? " " + block.heading : ""}. </w:t></w:r>`
    : "";

  return `<w:p><w:pPr><w:spacing w:after="160"/><w:jc w:val="both"/></w:pPr>`
    + start + label + runsToXml(runs, opts) + end + `</w:p>`;
}

function contentTypes({ hasComments, hasHeader }) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
${hasComments ? '<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>' : ""}
${hasHeader ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : ""}
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`;
}

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`;

function documentRels({ hasComments, hasHeader }) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
${hasComments ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>' : ""}
${hasHeader ? '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>' : ""}
</Relationships>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${NS_W}>
<w:docDefaults><w:rPrDefault><w:rPr>
<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/>
</w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="character" w:styleId="CommentReference"><w:name w:val="annotation reference"/><w:rPr><w:sz w:val="16"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="CommentText"><w:name w:val="annotation text"/><w:rPr><w:sz w:val="20"/></w:rPr></w:style>
</w:styles>`;

function coreProps(meta) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${esc(meta.title || "Contract")}</dc:title>
<dc:creator>${esc(meta.author || "FM Supplier CLM")}</dc:creator>
<cp:lastModifiedBy>${esc(meta.author || "FM Supplier CLM")}</cp:lastModifiedBy>
<cp:revision>${esc(meta.version || "1")}</cp:revision>
<dcterms:created xsi:type="dcterms:W3CDTF">${isoDate()}</dcterms:created>
</cp:coreProperties>`;
}

function commentsPart(comments) {
  const body = comments.map((c) => {
    const paras = [c.text, ...(c.replies || []).map((r) => `${r.author}: ${r.text}`)]
      .map((t) => `<w:p><w:pPr><w:pStyle w:val="CommentText"/></w:pPr>${textRun(t)}</w:p>`)
      .join("");
    return `<w:comment w:id="${c.wid}" w:author="${esc(c.author)}" w:initials="${esc(initialsOf(c.author))}" w:date="${isoDate(c.date)}">${paras}</w:comment>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:comments ${NS_W}>${body}</w:comments>`;
}

function watermarkHeader(text) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr ${NS_W} ${NS_VML}>
<w:p><w:r><w:pict>
<v:shapetype id="_x0000_t136" coordsize="21600,21600" o:spt="136" adj="10800" path="m@7,l@8,m@5,21600l@6,21600e">
<v:formulas><v:f eqn="sum #0 0 10800"/><v:f eqn="prod #0 2 1"/><v:f eqn="sum 21600 0 @1"/><v:f eqn="sum 0 0 @2"/><v:f eqn="sum 21600 0 @3"/><v:f eqn="if @0 @3 0"/><v:f eqn="if @0 21600 @1"/><v:f eqn="if @0 0 @2"/><v:f eqn="if @0 @4 21600"/><v:f eqn="mid @5 @6"/><v:f eqn="mid @8 @5"/><v:f eqn="mid @7 @8"/><v:f eqn="mid @6 @7"/><v:f eqn="sum @6 0 @5"/></v:formulas>
<v:path textpathok="t" o:connecttype="custom" o:connectlocs="@9,0;@10,10800;@11,21600;@12,10800" o:connectangles="270,180,90,0"/>
<v:textpath on="t" fitshape="t"/>
</v:shapetype>
<v:shape id="PowerPlusWaterMarkObject" o:spid="_x0000_s2049" type="#_x0000_t136"
 style="position:absolute;margin-left:0;margin-top:0;width:468pt;height:117pt;rotation:315;z-index:-251656192;mso-position-horizontal:center;mso-position-horizontal-relative:margin;mso-position-vertical:center;mso-position-vertical-relative:margin"
 fillcolor="#d9d0cd" stroked="f">
<v:fill opacity=".5"/>
<v:textpath style="font-family:&quot;Calibri&quot;;font-size:1pt" string="${esc(text)}"/>
</v:shape>
</w:pict></w:r></w:p>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:color w:val="9A3412"/><w:sz w:val="16"/><w:b/></w:rPr><w:t xml:space="preserve">${esc(text)} - NOT FOR EXECUTION</w:t></w:r></w:p>
</w:hdr>`;
}

export function buildDocx(doc, opts = {}) {
  revisionId = 100;
  const comments = (doc.comments || []).map((c, i) => ({ ...c, wid: i }));
  const hasComments = comments.length > 0;
  const hasHeader = Boolean(opts.watermark);

  const body = (doc.blocks || []).map((b) => blockToXml(b, opts, comments)).join("\n");

  const sectPr = `<w:sectPr>`
    + (hasHeader ? `<w:headerReference w:type="default" r:id="rId3"/>` : "")
    + `<w:pgSz w:w="11906" w:h="16838"/>`
    + `<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>`
    + `</w:sectPr>`;

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS_W} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>
${body}
${sectPr}
</w:body>
</w:document>`;

  const parts = [
    { name: "[Content_Types].xml", content: contentTypes({ hasComments, hasHeader }) },
    { name: "_rels/.rels", content: ROOT_RELS },
    { name: "docProps/core.xml", content: coreProps(doc.meta || {}) },
    { name: "word/document.xml", content: documentXml },
    { name: "word/_rels/document.xml.rels", content: documentRels({ hasComments, hasHeader }) },
    { name: "word/styles.xml", content: STYLES },
  ];
  if (hasComments) parts.push({ name: "word/comments.xml", content: commentsPart(comments) });
  if (hasHeader) parts.push({ name: "word/header1.xml", content: watermarkHeader(opts.watermark) });

  return makeZip(parts, DOCX_MIME);
}

export function downloadDocx(doc, filename, opts) {
  downloadBlob(buildDocx(doc, opts), filename);
}
