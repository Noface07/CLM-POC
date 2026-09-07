import { useMemo, useState } from "react";
import {
  Eye, Download, Sparkles, ArrowLeft, Infinity as InfinityIcon,
  AlertTriangle, CheckCircle2, BookOpen, Tags, EyeOff, Cloud,
} from "lucide-react";
import {
  AGREEMENT_TYPES, TEMPLATE_BY_CODE, templatesForAgreementType, AGREEMENT_TYPE_BY_CODE,
} from "../data/catalogue.js";
import {
  buildDraft, fieldsForTemplate, defaultValuesForTemplate, unresolvedTokens,
  templateIsDraftable, TOKEN_FIELDS, DEMO_WORDING_NOTICE,
} from "../data/templates.js";
import { downloadDocx } from "../lib/docx.js";
import { downloadPdf } from "../lib/pdf.js";
import { Tag, Btn, Field, GREEN, AMBER, RED, GRAY, kicker } from "../lib/ui.jsx";
import DocumentView from "./DocumentView.jsx";

const GROUP_LABEL = {
  contract: "Contract", supplier: "Supplier", client: "Client entity",
  service: "Service", commercial: "Commercial",
};

const RISK_TONE = { high: RED, medium: AMBER, low: GREEN };

// Grouped from the catalogue so the picker gains a family the moment one is added there.
const FAMILIES = (() => {
  const groups = new Map();
  for (const type of AGREEMENT_TYPES) {
    if (!groups.has(type.family)) groups.set(type.family, []);
    groups.get(type.family).push(type);
  }
  return [...groups.entries()];
})();

export default function DraftStudio({
  onBack, onCreateDraft, onOpenPlaybook, supplierDefaults, salesforceContext, salesforceRecord, canDraft, flash,
}) {
  const [agreementTypeCode, setAgreementTypeCode] = useState("tfm");
  const [templateCode, setTemplateCode] = useState("tfm_global");
  const [evergreen, setEvergreen] = useState(false);
  const [showFields, setShowFields] = useState(true);
  const [values, setValues] = useState(() => ({
    ...defaultValuesForTemplate("tfm_global"),
    ...supplierDefaults,
    ...salesforceContext,
  }));

  // Which fields arrived from the CRM rather than being typed here.
  const fromSalesforce = new Set(
    Object.entries(salesforceContext || {})
      .filter(([, v]) => v !== "" && v != null)
      .map(([key]) => key)
  );

  const template = TEMPLATE_BY_CODE[templateCode];
  const agreementType = AGREEMENT_TYPE_BY_CODE[agreementTypeCode];
  const fields = useMemo(() => fieldsForTemplate(templateCode), [templateCode]);
  const draftable = templateIsDraftable(templateCode);

  // The CRM carries more context than this template has fields for, and only the
  // fields actually on screen get the marker, so count those rather than the context.
  const markedCount = fields.filter((f) => fromSalesforce.has(f.name)).length;

  const doc = useMemo(
    () => buildDraft(templateCode, values, { evergreen, version: "v0.1", status: "Preview" }),
    [templateCode, values, evergreen]
  );
  const missing = useMemo(() => unresolvedTokens(doc), [doc]);
  const missingReal = missing.filter((name) => !(evergreen && TOKEN_FIELDS[name]?.evergreenExempt));
  const complete = missingReal.length === 0;

  function selectAgreementType(code) {
    setAgreementTypeCode(code);
    const first = templatesForAgreementType(code)[0];
    if (first) {
      setTemplateCode(first.code);
      setValues((v) => ({ ...defaultValuesForTemplate(first.code), ...v }));
    }
  }

  function selectTemplate(code) {
    setTemplateCode(code);
    setValues((v) => ({ ...defaultValuesForTemplate(code), ...v }));
  }

  const filename = `${values.contract_number || "DRAFT"}_${templateCode}`;

  return (
    <div className="clm-fill-col">
      <Btn onClick={onBack} icon={ArrowLeft} variant="ghost" style={{ alignSelf: "flex-start" }}>Back to contracts</Btn>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16,
        padding: "var(--space-3) 0 var(--space-4)", borderBottom: "2px solid var(--color-divider)",
        marginBottom: "var(--space-4)", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Draft a contract</h1>
          <p style={{ margin: 0, opacity: 0.65, fontSize: 14, maxWidth: 640 }}>
            Assembled from the catalogue's template and the playbook's standard clause positions. The preview updates
            as you type and stays watermarked until a draft is actually created.
          </p>
        </div>
        <Btn onClick={onOpenPlaybook} icon={BookOpen} variant="secondary">Read the clause playbook</Btn>
      </div>

      {salesforceRecord && (
        <div className="clm-readonly-banner" style={{ marginBottom: "var(--space-4)" }}>
          <Cloud size={15} />
          <span>
            Opened from Salesforce with <strong>{salesforceRecord.Name}</strong>&apos;s context
            {salesforceRecord.Supplier_Onboarding_Id__c && <> · onboarding record {salesforceRecord.Supplier_Onboarding_Id__c}</>}
            {" "}· {markedCount} field{markedCount === 1 ? "" : "s"} carried across and marked below.
            Agreement type, template and dates are yours to choose. The CRM does not hold them.
          </span>
        </div>
      )}

      <div className="clm-draft-grid">
        <div className="clm-draft-col" style={{ display: "grid", gap: "var(--space-4)", alignContent: "start" }}>
          <div className="card">
            <div className="card-title" style={{ fontSize: 15 }}>1 · Agreement type</div>
            <p style={{ fontSize: 11.5, opacity: 0.55, margin: "0 0 8px" }}>
              From the catalogue. Risk level drives whether the low-touch path is available and who has standing
              visibility of the contract.
            </p>
            <select className="input" value={agreementTypeCode} onChange={(e) => selectAgreementType(e.target.value)}>
              {FAMILIES.map(([family, types]) => (
                <optgroup key={family} label={family}>
                  {types.map((t) => (
                    <option key={t.code} value={t.code}>{t.name}, {t.riskLevel} risk</option>
                  ))}
                </optgroup>
              ))}
            </select>
            {agreementType && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                  <Tag c={GRAY} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Tags size={11} />{agreementType.family}
                  </Tag>
                  <Tag c={RISK_TONE[agreementType.riskLevel]}>{agreementType.riskLevel} risk</Tag>
                  <Tag c={GRAY}>Typical term: {agreementType.typicalTerm}</Tag>
                  {agreementType.requiresSchedules && <Tag c={GRAY}>Schedules required</Tag>}
                </div>
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55, opacity: 0.8 }}>{agreementType.why}</p>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title" style={{ fontSize: 15 }}>2 · Template</div>
            <p style={{ fontSize: 11.5, opacity: 0.55, margin: "0 0 8px" }}>
              Global by default. A jurisdiction-specific template exists only where a legal difference forces the
              split, and has to say which.
            </p>
            <div style={{ display: "grid", gap: 6 }}>
              {templatesForAgreementType(agreementTypeCode).map((t) => (
                <button
                  key={t.code} type="button" className="clm-template-card"
                  aria-pressed={templateCode === t.code} onClick={() => selectTemplate(t.code)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{t.name}</span>
                    <Tag c={t.jurisdiction === "global" ? GRAY : AMBER} style={{ fontSize: 9.5 }}>{t.jurisdiction}</Tag>
                    {!templateIsDraftable(t.code) && <Tag c={RED} style={{ fontSize: 9.5 }}>No published version</Tag>}
                  </div>
                  <p style={{ margin: 0, fontSize: 11.5, opacity: 0.7, lineHeight: 1.5 }}>{t.purpose}</p>
                  {t.splitReason && (
                    <p style={{ margin: "5px 0 0", fontSize: 11, opacity: 0.65, lineHeight: 1.5, fontStyle: "italic" }}>
                      Separate document because: {t.splitReason}
                    </p>
                  )}
                  {t.variantReason && (
                    <p style={{ margin: "5px 0 0", fontSize: 11, opacity: 0.65, lineHeight: 1.5, fontStyle: "italic" }}>
                      Use this one when: {t.variantReason}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-title" style={{ fontSize: 15 }}>3 · Term</div>
            <label style={{ display: "flex", gap: 9, alignItems: "flex-start", cursor: "pointer", fontSize: 13, marginBottom: 8 }}>
              <input
                type="checkbox" checked={evergreen} style={{ marginTop: 3 }}
                onChange={(e) => setEvergreen(e.target.checked)}
              />
              <span>
                <strong style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <InfinityIcon size={14} /> Evergreen, no expiry date
                </strong>
                <span style={{ display: "block", fontSize: 12, opacity: 0.7, marginTop: 3, lineHeight: 1.55 }}>
                  Swaps clause 4.1 for a rolling term with no end date. The contract runs until someone terminates it,
                  so the termination notice becomes the only control, which is why the playbook holds the notice
                  period rather than the term length on evergreen contracts.
                </span>
              </span>
            </label>
            {evergreen && (
              <div style={{ background: "var(--color-neutral-100)", border: "1px solid var(--color-divider)", padding: 10 }}>
                <div style={kicker}>What changes</div>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 12, lineHeight: 1.6 }}>
                  <li>End date is dropped from the document and from the merge data.</li>
                  <li>No expiry reminders and no renewal task: there is nothing to renew.</li>
                  <li>An annual price review against the indexation basis replaces the renewal negotiation.</li>
                  <li>Appears on the dashboard as an evergreen count, never in the runway chart.</li>
                </ul>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title" style={{ fontSize: 15 }}>4 · Merge data</div>
            <p style={{ fontSize: 11.5, opacity: 0.55, margin: "0 0 8px" }}>
              Only the token groups this template declares. An unfilled token shows in the preview as a highlighted
              placeholder rather than disappearing into the prose.
            </p>
            {Object.entries(
              fields.reduce((groups, f) => {
                (groups[f.group] ||= []).push(f);
                return groups;
              }, {})
            ).map(([group, groupFields]) => (
              <div key={group} style={{ marginBottom: 12 }}>
                <div style={{ ...kicker, marginBottom: 6 }}>{GROUP_LABEL[group] || group}</div>
                <div className="clm-token-grid">
                  {groupFields.map((field) => {
                    const disabled = evergreen && field.evergreenExempt;
                    return (
                      <Field
                        key={field.name}
                        label={
                          fromSalesforce.has(field.name)
                            ? <>{field.label} <span className="clm-src">Salesforce</span></>
                            : field.label
                        }
                        hint={disabled ? "Not used, evergreen contract" : undefined}
                      >
                        {field.type === "select" ? (
                          <select
                            className="input" disabled={disabled} value={values[field.name] || ""}
                            onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                          >
                            <option value="">Select</option>
                            {field.options.map((o) => <option key={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input
                            className="input" type={field.type === "number" ? "number" : field.type}
                            disabled={disabled} placeholder={field.placeholder}
                            value={disabled ? "" : (values[field.name] || "")}
                            onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                            style={!disabled && missingReal.includes(field.name) ? { borderColor: "#b45309" } : undefined}
                          />
                        )}
                      </Field>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="clm-draft-col clm-draft-col-preview">
          <div className="card" style={{ gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Tag outline><Eye size={11} style={{ marginRight: 4 }} />Preview</Tag>
              <div className="card-title" style={{ margin: 0, fontSize: 15 }}>{template?.name}</div>
              <Tag c={GRAY} style={{ fontSize: 10 }}>{agreementType?.family}</Tag>
              <Tag c={GRAY} style={{ fontSize: 10 }}>{doc.blocks.filter((b) => b.type === "clause").length} clauses</Tag>
              {evergreen && <Tag c={AMBER} style={{ fontSize: 10 }}>Evergreen</Tag>}
            </div>

            {complete ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#285c31" }}>
                <CheckCircle2 size={14} /> All merge fields resolved. The preview below is the complete document.
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12.5, color: "#7a4a05" }}>
                <AlertTriangle size={14} style={{ flex: "none", marginTop: 2 }} />
                <span>
                  {missingReal.length} merge field{missingReal.length === 1 ? "" : "s"} still empty:{" "}
                  {missingReal.map((m) => TOKEN_FIELDS[m]?.label || m).join(", ")}. They appear highlighted in the
                  document so a gap cannot be mistaken for finished text.
                </span>
              </div>
            )}

            <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, cursor: "pointer", opacity: 0.85 }}>
              <input type="checkbox" checked={showFields} onChange={(e) => setShowFields(e.target.checked)} />
              {showFields ? <Eye size={13} /> : <EyeOff size={13} />}
              Mark resolved merge fields
              <span style={{ opacity: 0.55 }}>
                Turn off to read it as the counterparty will. Empty fields stay highlighted either way.
              </span>
            </label>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Btn
                icon={Download} variant="secondary" small
                onClick={() => {
                  downloadDocx(doc, `${filename}_PREVIEW.docx`, { watermark: "PREVIEW", markFilledTokens: true });
                  flash?.("Preview downloaded as Word, watermarked in the page header.");
                }}
              >Preview .docx</Btn>
              <Btn
                icon={Download} variant="secondary" small
                onClick={() => {
                  downloadPdf(doc, `${filename}_PREVIEW.pdf`, {
                    watermark: "PREVIEW",
                    footer: `PREVIEW - not for execution - ${template?.name || ""}`,
                  });
                  flash?.("Preview downloaded as PDF, watermarked on every page.");
                }}
              >Preview .pdf</Btn>
              <Btn
                icon={Sparkles} variant="primary" small
                disabled={!draftable || !canDraft}
                onClick={() => {
                  if (!complete && !window.confirm(
                    `${missingReal.length} merge field(s) are still empty. Create the draft anyway?`
                  )) return;
                  onCreateDraft({ templateCode, agreementTypeCode, values, evergreen, doc });
                }}
              >Create draft</Btn>
            </div>

            {!canDraft && (
              <p style={{ fontSize: 11.5, opacity: 0.6, margin: 0 }}>
                Your role can preview a template but not create a draft from it.
              </p>
            )}
            {!draftable && (
              <p style={{ fontSize: 11.5, color: "var(--color-accent-700)", margin: 0 }}>
                This template has no published version, so nothing can be generated from it. That is the correct state
                until counsel supplies the wording. The catalogue creates template rows, not template content.
              </p>
            )}
            <p style={{ fontSize: 10.5, opacity: 0.5, margin: 0, lineHeight: 1.5 }}>{DEMO_WORDING_NOTICE}</p>
          </div>

          <div style={{ flex: 1, minHeight: 320, display: "flex", flexDirection: "column" }}>
            <DocumentView
              doc={doc} watermark="PREVIEW" canAct={false} showComments={false}
              showFields={showFields} fill
            />
          </div>
        </div>
      </div>
    </div>
  );
}
