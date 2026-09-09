import { CLAUSE_BY_CODE, TEMPLATE_BY_CODE, AGREEMENT_TYPE_BY_CODE } from "./catalogue.js";

export const DEMO_WORDING_NOTICE =
  "Assembled from the default clause catalogue. The clause positions are the playbook's "
  + "standard band and have not been reviewed by counsel. This document is a demonstration "
  + "of the drafting mechanism, not legal advice.";

export const TOKEN_FIELDS = {
  contract_number:                 { label: "Contract number", group: "contract", type: "text", placeholder: "CTR-2026-04821" },
  title:                           { label: "Contract title", group: "contract", type: "text", placeholder: "Integrated FM Services - Riverside Campus" },
  start_date:                      { label: "Start date", group: "contract", type: "date" },
  end_date:                        { label: "End date", group: "contract", type: "date", evergreenExempt: true },
  contract_value:                  { label: "Annual contract value", group: "contract", type: "number", placeholder: "486000" },
  currency_code:                   { label: "Currency", group: "contract", type: "select", options: ["GBP", "EUR", "USD"], default: "GBP" },
  notice_period_days:              { label: "Termination notice (days)", group: "contract", type: "number", default: "90" },
  supplier_name:                   { label: "Supplier legal name", group: "supplier", type: "text" },
  supplier_registered_number:      { label: "Supplier company number", group: "supplier", type: "text", placeholder: "08841221" },
  supplier_address:                { label: "Supplier registered address", group: "supplier", type: "text" },
  supplier_contact:                { label: "Supplier contact", group: "supplier", type: "text" },
  legal_entity_name:               { label: "Client legal entity", group: "client", type: "text", default: "Meridian FM Services (UK) Ltd" },
  legal_entity_registered_number:  { label: "Client company number", group: "client", type: "text", default: "04412907" },
  legal_entity_address:            { label: "Client registered address", group: "client", type: "text", default: "1 Riverside Way, London EC2A 4NE" },
  governing_law:                   { label: "Governing law", group: "client", type: "select", options: ["England and Wales", "Scotland", "Republic of Ireland", "Netherlands"], default: "England and Wales" },
  jurisdiction:                    { label: "Jurisdiction", group: "client", type: "select", options: ["England and Wales", "Scotland", "Republic of Ireland", "Netherlands"], default: "England and Wales" },
  service_category:                { label: "Service category", group: "service", type: "text", placeholder: "Integrated FM" },
  facility_names:                  { label: "Facilities / sites", group: "service", type: "text", placeholder: "Riverside Corporate Campus - Buildings A-C" },
  service_hours:                   { label: "Service hours", group: "service", type: "text", default: "07:00-19:00 Monday to Friday, with 24/7 emergency cover" },
  response_times:                  { label: "Response times", group: "service", type: "text", default: "P1 within 2 hours, P2 within 8 hours, P3 within 5 business days" },
  kpi_schedule:                    { label: "KPI schedule reference", group: "service", type: "text", default: "Schedule 3 (Service Levels and KPIs)" },
  payment_terms_days:              { label: "Payment terms (days)", group: "commercial", type: "number", default: "60" },
  rate_card_reference:             { label: "Rate card reference", group: "commercial", type: "text", default: "Schedule 4 (Rate Card)" },
  indexation_basis:                { label: "Indexation basis", group: "commercial", type: "text", default: "CPI, capped at 4% per annum" },
  liability_cap_amount:            { label: "Liability cap (% of annual charges)", group: "commercial", type: "number", default: "125" },
};

export function fieldsForTemplate(templateCode) {
  const template = TEMPLATE_BY_CODE[templateCode];
  if (!template) return [];
  const groups = new Set(template.requiredTokens);
  return Object.entries(TOKEN_FIELDS)
    .filter(([, field]) => groups.has(field.group))
    .map(([name, field]) => ({ name, ...field }));
}

export function defaultValuesForTemplate(templateCode) {
  const values = {};
  for (const field of fieldsForTemplate(templateCode)) {
    if (field.default != null) values[field.name] = field.default;
  }
  return values;
}

const TOKENISED = {
  payment_terms: (text) => text.replace("sixty (60) days", "{{payment_terms_days}} days"),
  liability_cap: (text) => text.replace("one hundred and twenty-five per cent (125%)", "{{liability_cap_amount}}%"),
  termination_convenience: (text) => text.replace("ninety (90) days'", "{{notice_period_days}} days'"),
  governing_law: (text) => text.replace(/England and Wales/g, "{{governing_law}}"),

  insurance: (text, values) => {
    const british = /England and Wales|Scotland/i.test(values?.governing_law || "England and Wales");
    return text
      .replace("public liability insurance of not less than GBP 5,000,000 per occurrence",
        "public liability insurance of not less than {{currency_code}} 5,000,000 per occurrence")
      .replace("professional indemnity insurance of not less than GBP 2,000,000",
        "professional indemnity insurance of not less than {{currency_code}} 2,000,000")
      .replace("employer's liability insurance of not less than GBP 5,000,000",
        british
          ? "employer's liability insurance of not less than GBP 5,000,000 (the statutory minimum in Great Britain)"
          : "employer's liability insurance of not less than the statutory minimum in each jurisdiction in which its personnel are employed");
  },
};

function wordingFor(code, values) {
  const clause = CLAUSE_BY_CODE[code];
  if (!clause) return "";
  const text = clause.standardWording || clause.standard;
  return TOKENISED[code] ? TOKENISED[code](text, values) : text;
}

const EVERGREEN_TERM_WORDING =
  "This Agreement commences on {{start_date}} and continues until terminated in accordance "
  + "with clause 9. It has no fixed expiry date. Either party may terminate for convenience "
  + "on not less than {{notice_period_days}} days' written notice. The Charges shall be "
  + "reviewed annually against {{indexation_basis}}, and no increase takes effect without "
  + "the Client's written agreement.";

const SECTION_PLAN = [
  { key: "interpretation", number: 1, heading: "Definitions and Interpretation" },
  { key: "services",       number: 2, heading: "The Services" },
  { key: "obligations",    number: 3, heading: "Supplier Obligations" },
  { key: "term",           number: 4, heading: "Term and Renewal", playbook: ["term_renewal"] },
  { key: "charges",        number: 5, heading: "Charges and Payment", playbook: ["payment_terms"] },
  { key: "performance",    number: 6, heading: "Service Levels and Service Credits", playbook: ["service_levels"] },
  { key: "liability",      number: 7, heading: "Liability", playbook: ["liability_cap", "indemnity"] },
  { key: "confidentiality",number: 8, heading: "Confidentiality", playbook: ["confidentiality"] },
  { key: "termination",    number: 9, heading: "Termination and Exit", playbook: ["termination_convenience", "exit_transition"] },
  { key: "subcontracting", number: 10, heading: "Subcontracting and Assignment", playbook: ["subcontracting"] },
  { key: "insurance",      number: 11, heading: "Insurance", playbook: ["insurance"] },
  { key: "data",           number: 12, heading: "Data Protection", playbook: ["data_protection"] },
  { key: "hs",             number: 13, heading: "Health, Safety and Statutory Compliance", playbook: ["health_safety"] },
  { key: "tupe",           number: 14, heading: "Employee Transfer (TUPE)", playbook: ["tupe"] },
  { key: "forcemajeure",   number: 15, heading: "Force Majeure", playbook: ["force_majeure"] },
  { key: "law",            number: 16, heading: "Governing Law and Jurisdiction", playbook: ["governing_law"] },
  { key: "ip",             number: 17, heading: "Intellectual Property", playbook: ["intellectual_property"] },
  { key: "change",         number: 18, heading: "Change Control", playbook: ["change_control"] },
];

const SECTION_BY_KEY = Object.fromEntries(SECTION_PLAN.map((s) => [s.key, s]));

const PARTIES_CLAUSE =
  "This Agreement is made between {{legal_entity_name}} (company number "
  + "{{legal_entity_registered_number}}) of {{legal_entity_address}} (the \"Client\") and "
  + "{{supplier_name}} (company number {{supplier_registered_number}}) of {{supplier_address}} "
  + "(the \"Supplier\").";

const INTERPRETATION_CLAUSE =
  "\"Services\" means the services described in clause 2 and the schedules. \"Annual Charges\" "
  + "means the charges payable in any twelve-month period, being {{currency_code}} "
  + "{{contract_value}} at the Start Date. \"Rate Card\" means {{rate_card_reference}}. Headings "
  + "do not affect interpretation, and a reference to a schedule is a reference to a schedule "
  + "to this Agreement.";

const FULL = ["interpretation","services","obligations","term","charges","performance","liability",
  "confidentiality","termination","subcontracting","insurance","data","hs","forcemajeure","law","ip","change"];

const TEMPLATE_CONTENT = {
  msa_global: {
    sections: ["interpretation","services","obligations","term","charges","performance","liability",
      "confidentiality","termination","subcontracting","insurance","data","hs","forcemajeure","law","ip","change"],
    services: [
      { ref: "2.1", heading: "Framework", text: "This Agreement sets out the terms on which the Supplier provides services to the Client. It creates no obligation to order and no commitment to volume. Work is ordered under statements of work or call-offs, each of which incorporates this Agreement." },
      { ref: "2.2", heading: "Precedence", text: "Where a statement of work conflicts with this Agreement, this Agreement prevails except where the statement of work expressly states the clause it varies and is signed by both parties." },
    ],
    obligations: [
      { ref: "3.1", heading: "Standard of performance", text: "The Supplier shall perform all services with the reasonable skill and care of a competent provider of services of that type, using personnel with the qualifications and training the work requires." },
    ],
  },
  tfm_global: {
    sections: FULL,
    services: [
      { ref: "2.1", heading: "Scope", text: "The Supplier shall provide total facilities management services across {{facility_names}}, covering hard services, soft services, and estate-wide governance, in the category {{service_category}}." },
      { ref: "2.2", heading: "Service hours", text: "Services shall be delivered during {{service_hours}}. Response times are {{response_times}}." },
      { ref: "2.3", heading: "Governance", text: "The parties shall hold a monthly operational review and a quarterly commercial review, each minuted, with actions tracked to closure." },
    ],
    obligations: [
      { ref: "3.1", heading: "Self-delivery", text: "The Supplier shall self-deliver not less than seventy per cent (70%) of the Services by value, and shall notify the Client before that proportion falls." },
      { ref: "3.2", heading: "Asset data", text: "The Supplier shall maintain the asset register and planned maintenance records in the Client's systems, and shall keep them current throughout the term." },
      { ref: "3.3", heading: "Reporting", text: "The Supplier shall submit a monthly performance report against {{kpi_schedule}} within ten (10) business days of month end." },
    ],
  },
  hard_fm_global: {
    sections: FULL,
    services: [
      { ref: "2.1", heading: "Scope", text: "The Supplier shall provide hard facilities management services at {{facility_names}}, covering mechanical, electrical, plumbing, fire safety and lift systems." },
      { ref: "2.2", heading: "Statutory inspections", text: "The Supplier shall carry out all statutory inspections at the intervals the applicable legislation requires, and shall not vary an interval without the Client's written agreement." },
      { ref: "2.3", heading: "Service hours", text: "Services shall be delivered during {{service_hours}}, with response times of {{response_times}}." },
    ],
    obligations: [
      { ref: "3.1", heading: "Compliance evidence", text: "The Supplier shall upload completion certificates and statutory inspection records to the Client's compliance system within five (5) business days of each visit." },
      { ref: "3.2", heading: "Competency", text: "The Supplier shall ensure every operative holds the certification the task requires, and shall produce evidence on request." },
    ],
  },
  soft_fm_uk: {
    sections: FULL,
    services: [
      { ref: "2.1", heading: "Scope", text: "The Supplier shall provide soft facilities management services at {{facility_names}}, covering cleaning, catering, security, waste management and grounds maintenance." },
      { ref: "2.2", heading: "Service hours", text: "Services shall be delivered during {{service_hours}}, with response times of {{response_times}}." },
    ],
    obligations: [
      { ref: "3.1", heading: "Staffing", text: "The Supplier shall maintain the establishment set out in the schedules and shall notify the Client of any sustained shortfall within two (2) business days." },
      { ref: "3.2", heading: "Right to work", text: "The Supplier shall verify and record the right to work of every person deployed, and shall retain those records for the term and six (6) years afterwards." },
    ],
  },
  soft_fm_global: {
    sections: FULL.filter((k) => k !== "tupe"),
    services: [
      { ref: "2.1", heading: "Scope", text: "The Supplier shall provide soft facilities management services at {{facility_names}}, covering cleaning, catering, security, waste management and grounds maintenance." },
      { ref: "2.2", heading: "Service hours", text: "Services shall be delivered during {{service_hours}}, with response times of {{response_times}}." },
    ],
    obligations: [
      { ref: "3.1", heading: "Staffing", text: "The Supplier shall maintain the establishment set out in the schedules and shall notify the Client of any sustained shortfall within two (2) business days." },
    ],
  },
  ppm_global: {
    sections: ["interpretation","services","obligations","term","charges","performance","liability",
      "confidentiality","termination","subcontracting","insurance","hs","forcemajeure","law","change"],
    services: [
      { ref: "2.1", heading: "Maintenance regime", text: "The Supplier shall carry out planned preventive maintenance at {{facility_names}} in accordance with the written maintenance regime in the schedules, which is the compliance evidence for the assets it covers." },
      { ref: "2.2", heading: "Regime changes", text: "The Supplier shall notify the Client where the regime does not match the manufacturer's recommendation or a statutory requirement, and shall not proceed against it without written instruction." },
    ],
    obligations: [
      { ref: "3.1", heading: "Records", text: "The Supplier shall record every visit against the asset register, including work not completed and the reason." },
    ],
  },
  reactive_global: {
    sections: ["interpretation","services","obligations","term","charges","performance","liability",
      "confidentiality","termination","insurance","hs","forcemajeure","law","change"],
    services: [
      { ref: "2.1", heading: "Call-off", text: "The Client may call off reactive maintenance at {{facility_names}} against the Rate Card ({{rate_card_reference}}). Nothing in this Agreement commits the Client to any volume." },
      { ref: "2.2", heading: "Response", text: "The Supplier shall attend within {{response_times}} from the time the call is logged." },
    ],
    obligations: [
      { ref: "3.1", heading: "Quotation threshold", text: "The Supplier shall not carry out work above the agreed quotation threshold without a written instruction, and shall not split a job to stay beneath it." },
    ],
  },
  framework_global: {
    sections: ["interpretation","services","obligations","term","charges","liability","confidentiality",
      "termination","subcontracting","insurance","data","hs","forcemajeure","law","ip","change"],
    services: [
      { ref: "2.1", heading: "Framework", text: "This Agreement establishes a framework under which the Client may call off services. It confers no exclusivity and guarantees no volume." },
      { ref: "2.2", heading: "Call-off procedure", text: "Call-offs shall be awarded by direct award or mini-competition among framework suppliers, and each call-off incorporates these terms." },
    ],
    obligations: [
      { ref: "3.1", heading: "Rate card", text: "The Supplier shall hold the Rate Card ({{rate_card_reference}}) for the term, subject only to indexation on the basis of {{indexation_basis}}." },
    ],
  },
  sow_global: {
    sections: ["interpretation","services","obligations","term","charges","performance","termination","law"],
    services: [
      { ref: "2.1", heading: "Parent agreement", text: "This Statement of Work is issued under, and incorporates the terms of, the master services agreement between the parties. It carries no standalone liability, indemnity or insurance terms. Those sit in the parent agreement." },
      { ref: "2.2", heading: "Scope", text: "The Supplier shall deliver the work described in the schedules at {{facility_names}}, in the category {{service_category}}." },
    ],
    obligations: [
      { ref: "3.1", heading: "Acceptance", text: "Deliverables are accepted when the Client confirms in writing that they meet the acceptance criteria in the schedules, or ten (10) business days after delivery if the Client raises nothing." },
    ],
  },
  equipment_supply_global: {
    sections: ["interpretation","services","obligations","term","charges","liability","confidentiality",
      "termination","subcontracting","insurance","hs","forcemajeure","law","ip","change"],
    services: [
      { ref: "2.1", heading: "Supply and installation", text: "The Supplier shall supply, deliver, install and commission the equipment described in the schedules at {{facility_names}}." },
      { ref: "2.2", heading: "Title and risk", text: "Title passes to the Client on payment; risk passes on completion of commissioning and the Client's written acceptance." },
      { ref: "2.3", heading: "Warranty", text: "The Supplier warrants the equipment against defects in materials and workmanship for twenty-four (24) months from acceptance, and shall pass through any longer manufacturer warranty." },
    ],
    obligations: [
      { ref: "3.1", heading: "Documentation", text: "The Supplier shall provide operation and maintenance manuals, as-built drawings and commissioning records before the Client is asked to accept the installation." },
    ],
  },
  consultancy_global: {
    sections: ["interpretation","services","obligations","term","charges","liability","confidentiality",
      "termination","subcontracting","insurance","data","forcemajeure","law","ip","change"],
    services: [
      { ref: "2.1", heading: "Scope", text: "The Supplier shall provide the professional services described in the schedules, in the category {{service_category}}." },
      { ref: "2.2", heading: "Standard of care", text: "The Supplier shall exercise the reasonable skill and care of a member of its profession experienced in work of a similar type, scope and complexity." },
    ],
    obligations: [
      { ref: "3.1", heading: "Key personnel", text: "The Supplier shall not substitute named key personnel without the Client's prior written consent." },
    ],
  },
  nda_mutual_global: {
    sections: ["interpretation","services","confidentiality","term","termination","law"],
    services: [
      { ref: "2.1", heading: "Purpose", text: "The parties wish to exchange confidential information to evaluate a potential commercial relationship. This Agreement governs that exchange and creates no obligation to proceed." },
      { ref: "2.2", heading: "Mutual application", text: "Each party may act as discloser and as recipient, and the obligations in clause 8 apply equally in both directions." },
    ],
  },
  dpa_uk_eu: {
    sections: ["interpretation","services","obligations","confidentiality","data","term","termination","liability","law"],
    services: [
      { ref: "2.1", heading: "Roles", text: "The Client is controller and the Supplier is processor in respect of the personal data processed under the principal agreement. Neither party may vary that allocation unilaterally." },
      { ref: "2.2", heading: "Scope of processing", text: "The subject matter, duration, nature, purpose, categories of data subject and types of personal data are set out in Annex 1, which the parties shall keep current." },
    ],
    obligations: [
      { ref: "3.1", heading: "Instructions", text: "The Supplier shall process personal data only on the Client's documented instructions, and shall notify the Client if it considers an instruction infringes applicable data protection law." },
      { ref: "3.2", heading: "Assistance", text: "The Supplier shall assist the Client with data subject requests, impact assessments and regulator engagement, within timescales that allow the Client to meet its own statutory deadlines." },
    ],
  },
  variation_global: {
    sections: ["interpretation","services","term","charges","law"],
    services: [
      { ref: "2.1", heading: "Variation", text: "This Variation Agreement amends the principal agreement between the parties with effect from {{start_date}}. It names each clause it changes; every other term of the principal agreement continues unchanged." },
      { ref: "2.2", heading: "Cumulative effect", text: "This is one of a series of variations to the principal agreement. The parties confirm they have reviewed the cumulative effect of all variations to date, not this variation alone." },
    ],
  },
  termination_global: {
    sections: ["interpretation","services","charges","confidentiality","termination","law"],
    services: [
      { ref: "2.1", heading: "Termination", text: "The principal agreement between {{legal_entity_name}} and {{supplier_name}} terminates on {{end_date}}. Neither party shall make any claim in respect of the terminated agreement except as this Agreement provides." },
      { ref: "2.2", heading: "Settlement", text: "The sums set out in the schedules are in full and final settlement of all claims arising from the principal agreement up to the termination date." },
      { ref: "2.3", heading: "Exit", text: "The Supplier shall complete the exit obligations in the principal agreement, including handover of asset data, maintenance history, statutory compliance records and access credentials, and shall return or delete the Client's data." },
    ],
  },
  msa_short_global: {
    sections: ["interpretation", "services", "obligations", "term", "charges", "liability",
      "confidentiality", "termination", "insurance", "data", "law"],
    services: [
      { ref: "2.1", heading: "Framework", text: "This Agreement sets out the terms on which the Supplier provides services to the Client. Work is ordered under statements of work, each of which incorporates this Agreement. It creates no obligation to order." },
      { ref: "2.2", heading: "Proportionality", text: "This is the short-form agreement. It carries the liability, indemnity, confidentiality and data protection terms in full, and omits the governance, change control and exit machinery of the full Master Services Agreement. Where the annual value of work ordered under it exceeds the low-touch threshold, the parties shall replace it with the full form." },
    ],
    obligations: [
      { ref: "3.1", heading: "Standard of performance", text: "The Supplier shall perform all services with the reasonable skill and care of a competent provider of services of that type." },
    ],
  },
  hard_fm_uk: {
    sections: FULL,
    services: [
      { ref: "2.1", heading: "Scope", text: "The Supplier shall provide hard facilities management services at {{facility_names}}, covering mechanical, electrical, plumbing, fire safety and lift systems." },
      { ref: "2.2", heading: "Statutory inspection regime", text: "The Supplier shall carry out all statutory inspections at the intervals required by the Lifting Operations and Lifting Equipment Regulations 1998, the Electricity at Work Regulations 1989, the Gas Safety (Installation and Use) Regulations 1998, the Pressure Systems Safety Regulations 2000 and the Regulatory Reform (Fire Safety) Order 2005, and shall not vary an interval without the Client's written agreement." },
      { ref: "2.3", heading: "Competent person", text: "Where legislation requires an inspection by a competent person, the Supplier shall ensure that person is independent of the party that carried out the maintenance being inspected." },
      { ref: "2.4", heading: "Service hours", text: "Services shall be delivered during {{service_hours}}, with response times of {{response_times}}." },
    ],
    obligations: [
      { ref: "3.1", heading: "Compliance evidence", text: "The Supplier shall upload statutory inspection certificates to the Client's compliance system within five (5) business days of each inspection, and shall notify the Client within twenty-four (24) hours of any failed inspection or any item classified as an immediate danger." },
      { ref: "3.2", heading: "Competency", text: "The Supplier shall ensure every operative holds the certification the task requires, and shall produce evidence on request." },
    ],
  },
  sow_tm_global: {
    sections: ["interpretation", "services", "obligations", "term", "charges", "termination", "law"],
    services: [
      { ref: "2.1", heading: "Parent agreement", text: "This Statement of Work is issued under, and incorporates the terms of, the master services agreement between the parties. It carries no standalone liability, indemnity or insurance terms. Those sit in the parent agreement." },
      { ref: "2.2", heading: "Basis of charge", text: "Work under this Statement of Work is charged on a time and materials basis against the Rate Card ({{rate_card_reference}}). The Client is buying effort against a cap, not a defined outcome, and no fixed price is implied." },
      { ref: "2.3", heading: "Spend cap", text: "The Supplier shall not incur charges exceeding {{currency_code}} {{contract_value}} without the Client's prior written authorisation. Work performed above the cap without authorisation is not chargeable." },
    ],
    obligations: [
      { ref: "3.1", heading: "Reporting", text: "The Supplier shall report hours worked, by role and against the Rate Card, monthly in arrears, and shall notify the Client when cumulative charges reach seventy-five per cent (75%) of the spend cap." },
    ],
  },
  nda_oneway_global: {
    sections: ["interpretation", "services", "confidentiality", "term", "termination", "law"],
    services: [
      { ref: "2.1", heading: "Purpose", text: "{{legal_entity_name}} (the \"Discloser\") wishes to disclose confidential information to {{supplier_name}} (the \"Recipient\") so that the Recipient may be assessed for, or perform work at, the Discloser's premises. This Agreement governs that disclosure and creates no obligation to proceed." },
      { ref: "2.2", heading: "One-way application", text: "The obligations in clause 8 bind the Recipient only. The Discloser gives no undertaking in respect of information the Recipient may provide, and the Recipient should not disclose its own confidential information under this Agreement." },
      { ref: "2.3", heading: "Site and security information", text: "The Confidential Information includes site plans, access control configuration, alarm and CCTV coverage, key-holder details and any information about the Discloser's physical security arrangements. The Recipient shall hold that category indefinitely and shall not disclose it to any subcontractor without prior written consent." },
    ],
  },
  dpa_global: {
    sections: ["interpretation", "services", "obligations", "confidentiality", "data", "term", "termination", "liability", "law"],
    services: [
      { ref: "2.1", heading: "Roles", text: "{{legal_entity_name}} is the controller and {{supplier_name}} is the processor in respect of the personal data processed under the principal agreement. Neither party may vary that allocation unilaterally." },
      { ref: "2.2", heading: "Scope of processing", text: "The subject matter, duration, nature, purpose, categories of data subject and types of personal data are set out in Annex 1, which the parties shall keep current." },
      { ref: "2.3", heading: "Applicable law", text: "This Agreement is drafted to the contract rather than to a named data protection statute, because the parties are not established in the United Kingdom or the European Union. It is a floor. Where the law of {{jurisdiction}} imposes requirements beyond it, those requirements prevail, and the parties shall take local advice rather than relying on this document alone." },
    ],
    obligations: [
      { ref: "3.1", heading: "Instructions", text: "The Supplier shall process personal data only on the Client's documented instructions, and shall notify the Client if it considers an instruction infringes applicable data protection law." },
      { ref: "3.2", heading: "Transfers", text: "The Supplier shall not transfer personal data to another country without the Client's prior written consent and without a lawful transfer mechanism in place for that country." },
      { ref: "3.3", heading: "Assistance", text: "The Supplier shall assist the Client with data subject requests, impact assessments and regulator engagement, within timescales that allow the Client to meet its own statutory deadlines." },
    ],
  },

  msa_uk: {
    sections: ["interpretation","services","obligations","term","charges","performance","liability",
      "confidentiality","termination","subcontracting","insurance","data","hs","tupe","forcemajeure","law","ip","change"],
    services: [
      { ref: "2.1", heading: "Framework", text: "This Agreement sets out the terms on which the Supplier provides services to the Client in the United Kingdom. It creates no obligation to order. Work is ordered under statements of work or call-offs, each of which incorporates this Agreement." },
      { ref: "2.2", heading: "Employee transfer", text: "The parties acknowledge that the Transfer of Undertakings (Protection of Employment) Regulations 2006 may apply on commencement of, and on exit from, any call-off under this Agreement. Clause 14 allocates that risk for every call-off, so it is not renegotiated each time." },
      { ref: "2.3", heading: "Precedence", text: "Where a statement of work conflicts with this Agreement, this Agreement prevails except where the statement of work expressly states the clause it varies and is signed by both parties." },
    ],
    obligations: [
      { ref: "3.1", heading: "Standard of performance", text: "The Supplier shall perform all services with the reasonable skill and care of a competent provider of services of that type, using personnel with the qualifications and training the work requires." },
      { ref: "3.2", heading: "Right to work", text: "The Supplier shall verify and record the right to work in the United Kingdom of every person deployed, and shall retain those records for the term and six (6) years afterwards." },
    ],
  },

  tfm_uk: {
    sections: FULL,
    services: [
      { ref: "2.1", heading: "Scope", text: "The Supplier shall provide total facilities management services across {{facility_names}}, covering hard services, soft services and estate-wide governance, in the category {{service_category}}." },
      { ref: "2.2", heading: "Statutory compliance", text: "The Supplier shall discharge the Client's statutory obligations in respect of the maintained assets under the Regulatory Reform (Fire Safety) Order 2005, the Lifting Operations and Lifting Equipment Regulations 1998, the Electricity at Work Regulations 1989 and the Control of Legionella (ACOP L8), and shall maintain the records those regimes require." },
      { ref: "2.3", heading: "Employee transfer", text: "The parties acknowledge that TUPE applies on commencement and on exit. The employee liability information, the indemnities and the pension position are dealt with in clause 14, which is a main-body allocation and not a schedule." },
      { ref: "2.4", heading: "Governance", text: "The parties shall hold a monthly operational review and a quarterly commercial review, each minuted, with actions tracked to closure." },
    ],
    obligations: [
      { ref: "3.1", heading: "Self-delivery", text: "The Supplier shall self-deliver not less than seventy per cent (70%) of the Services by value, and shall notify the Client before that proportion falls." },
      { ref: "3.2", heading: "Compliance evidence", text: "The Supplier shall maintain the statutory compliance record in the Client's system and shall notify the Client within twenty-four (24) hours of any failed inspection or item classified as an immediate danger." },
    ],
  },
  tfm_multisite_global: {
    sections: FULL,
    services: [
      { ref: "2.1", heading: "Scope and sites", text: "The Supplier shall provide total facilities management services at each site listed in the Site Schedule. The Site Schedule states, for every site, the services in scope, the service hours, the response times and the local statutory regime that applies there." },
      { ref: "2.2", heading: "Local law", text: "Where the law of a site's jurisdiction imposes an obligation beyond this Agreement, that obligation prevails at that site. The Supplier shall notify the Client of any such difference rather than absorbing it silently." },
      { ref: "2.3", heading: "Central governance", text: "Liability, indemnity, data protection and governance are managed centrally under this Agreement and are not varied site by site. A site-level agreement that purports to vary them has no effect." },
      { ref: "2.4", heading: "Adding and removing sites", text: "Sites are added or removed by amending the Site Schedule under clause 18, with the charges adjusted against {{rate_card_reference}}. No site is in scope until it appears in the Site Schedule." },
    ],
    obligations: [
      { ref: "3.1", heading: "Consolidated reporting", text: "The Supplier shall report performance per site and in consolidation against {{kpi_schedule}}, within ten (10) business days of month end." },
      { ref: "3.2", heading: "Single point of accountability", text: "The Supplier shall name one account director accountable for the whole estate, whatever the local delivery structure." },
    ],
  },

  hard_fm_critical_global: {
    sections: FULL,
    services: [
      { ref: "2.1", heading: "Scope", text: "The Supplier shall maintain the business-critical mechanical, electrical and cooling infrastructure at {{facility_names}}, including the systems on which continuity of operations depends." },
      { ref: "2.2", heading: "Attendance", text: "The Supplier shall attend a critical failure within {{response_times}}, on a twenty-four hour basis every day of the year, and shall maintain a standby rota with named engineers competent on the installed plant." },
      { ref: "2.3", heading: "No concurrent maintenance on resilient pairs", text: "The Supplier shall not take both halves of any resilient pair out of service at the same time, and shall obtain written authorisation before any work that removes resilience." },
      { ref: "2.4", heading: "Step-in", text: "Where the Supplier fails to attend within the response time, the Client may procure the works from a third party and recover the reasonable cost from the Supplier. Service credits do not limit that right." },
    ],
    obligations: [
      { ref: "3.1", heading: "Root cause", text: "The Supplier shall provide a root cause analysis within five (5) business days of any critical failure, and shall not close the incident until the Client accepts it." },
      { ref: "3.2", heading: "Spares", text: "The Supplier shall hold the critical spares listed in the schedules on site, and shall replenish within five (5) business days of use." },
    ],
  },

  soft_fm_single_global: {
    sections: ["interpretation","services","obligations","term","charges","performance","liability",
      "confidentiality","termination","insurance","data","hs","forcemajeure","law"],
    services: [
      { ref: "2.1", heading: "Scope", text: "The Supplier shall provide the single soft facilities management service described in the schedules at {{facility_names}}, in the category {{service_category}}." },
      { ref: "2.2", heading: "Service hours", text: "Services shall be delivered during {{service_hours}}. Response times are {{response_times}}." },
      { ref: "2.3", heading: "Proportionality", text: "This is the single-service form. It omits the bundled-service governance, transition planning and multi-service KPI schedule of the full soft FM agreement, and carries the liability, insurance and data protection terms unchanged." },
    ],
    obligations: [
      { ref: "3.1", heading: "Staffing", text: "The Supplier shall maintain the establishment set out in the schedules and shall notify the Client of any sustained shortfall within two (2) business days." },
    ],
  },

  ppm_statutory_global: {
    sections: ["interpretation","services","obligations","term","charges","performance","liability",
      "confidentiality","termination","subcontracting","insurance","hs","forcemajeure","law","change"],
    services: [
      { ref: "2.1", heading: "Statutory assets", text: "The Supplier shall carry out the statutory examinations and tests for the assets listed in the schedules at {{facility_names}}. This Agreement covers only assets carrying a statutory inspection duty." },
      { ref: "2.2", heading: "Intervals are not negotiable", text: "Inspection intervals are those the applicable legislation requires. Neither party may extend an interval by agreement, and a missed examination puts the asset out of service until it is completed." },
      { ref: "2.3", heading: "Independent competent person", text: "The examination shall be carried out by a competent person independent of the party that performed the maintenance on that asset. The Supplier shall not self-certify its own maintenance work." },
    ],
    obligations: [
      { ref: "3.1", heading: "Reports and defects", text: "The Supplier shall issue the statutory report within five (5) business days of each examination, and shall notify the Client immediately of any defect requiring the asset to be taken out of use." },
    ],
  },
  ppm_uk: {
    sections: ["interpretation","services","obligations","term","charges","performance","liability",
      "confidentiality","termination","subcontracting","insurance","hs","forcemajeure","law","change"],
    services: [
      { ref: "2.1", heading: "Maintenance regime", text: "The Supplier shall carry out planned preventive maintenance at {{facility_names}} in accordance with the written maintenance regime in the schedules, which is the compliance evidence for the assets it covers." },
      { ref: "2.2", heading: "UK statutory intervals", text: "Where an asset is subject to the Lifting Operations and Lifting Equipment Regulations 1998, the Pressure Systems Safety Regulations 2000, the Gas Safety (Installation and Use) Regulations 1998 or the Electricity at Work Regulations 1989, the regime shall adopt the interval that legislation requires." },
      { ref: "2.3", heading: "Regime changes", text: "The Supplier shall notify the Client where the regime does not match the manufacturer's recommendation or a statutory requirement, and shall not proceed against it without written instruction." },
    ],
    obligations: [
      { ref: "3.1", heading: "Records", text: "The Supplier shall record every visit against the asset register, including work not completed and the reason, and shall retain the records for six (6) years." },
    ],
  },

  reactive_emergency_global: {
    sections: ["interpretation","services","obligations","term","charges","liability",
      "confidentiality","termination","insurance","hs","forcemajeure","law"],
    services: [
      { ref: "2.1", heading: "Emergency attendance", text: "The Supplier shall attend emergency call-outs at {{facility_names}} outside normal service hours, on a twenty-four hour basis every day of the year." },
      { ref: "2.2", heading: "Authority to make safe", text: "The Supplier may carry out works necessary to make the situation safe without a prior instruction, up to the emergency threshold in the schedules. Work beyond that threshold requires authorisation before it proceeds." },
      { ref: "2.3", heading: "Charging", text: "Emergency attendance is charged at the call-out rates in {{rate_card_reference}}. Attendance during normal service hours is not chargeable as an emergency." },
    ],
    obligations: [
      { ref: "3.1", heading: "Report", text: "The Supplier shall report every emergency attendance to the Client by the next working day, stating what was done, what remains, and whether a permanent repair is required." },
    ],
  },
  reactive_measured_global: {
    sections: ["interpretation","services","obligations","term","charges","performance","liability",
      "confidentiality","termination","insurance","hs","forcemajeure","law","change"],
    services: [
      { ref: "2.1", heading: "Measured term", text: "The Supplier shall carry out reactive and minor works at {{facility_names}} as ordered, over the term, with no committed volume." },
      { ref: "2.2", heading: "Schedule of rates", text: "Work is valued against the published schedule of rates in {{rate_card_reference}}, adjusted by the tendered percentage. There is no per-job quotation and no separately negotiated price." },
      { ref: "2.3", heading: "Measurement and valuation", text: "Completed work shall be measured and valued monthly against the schedule of rates. The Client may remeasure any item within three (3) months, and an item measured incorrectly is corrected in the next valuation." },
    ],
    obligations: [
      { ref: "3.1", heading: "Records", text: "The Supplier shall keep measurement records for every order and produce them with each valuation. An item with no measurement record is not payable." },
    ],
  },

  framework_single_global: {
    sections: ["interpretation","services","obligations","term","charges","liability","confidentiality",
      "termination","subcontracting","insurance","data","hs","forcemajeure","law","ip","change"],
    services: [
      { ref: "2.1", heading: "Single-supplier framework", text: "This Agreement establishes a framework with one supplier. The Client may call off services under it and is not obliged to. There is no exclusivity and no committed volume." },
      { ref: "2.2", heading: "Direct award", text: "Call-offs are awarded directly. Because there is no competition at call-off, the protections in clauses 2.3 and 2.4 stand in its place." },
      { ref: "2.3", heading: "Benchmarking", text: "The Client may benchmark the Rate Card against the market once in each twelve-month period. Where the benchmark shows the rates are not competitive, the Supplier shall meet the benchmark or the Client may go to market for the affected services without penalty." },
      { ref: "2.4", heading: "Open book", text: "The Supplier shall provide the cost build-up behind the Rate Card on request, and shall not treat it as confidential to itself." },
    ],
    obligations: [
      { ref: "3.1", heading: "Rate card", text: "The Supplier shall hold the Rate Card ({{rate_card_reference}}) for the term, subject only to indexation on the basis of {{indexation_basis}}." },
    ],
  },
  framework_uk: {
    sections: ["interpretation","services","obligations","term","charges","liability","confidentiality",
      "termination","subcontracting","insurance","data","hs","forcemajeure","law","ip","change"],
    services: [
      { ref: "2.1", heading: "Framework", text: "This Agreement establishes a framework under the Procurement Act 2023 for the award of call-off contracts. It confers no exclusivity and guarantees no volume." },
      { ref: "2.2", heading: "Maximum term", text: "The framework term shall not exceed the maximum permitted for a framework of this type, and shall not be extended beyond it by agreement." },
      { ref: "2.3", heading: "Call-off procedure", text: "Call-offs shall be awarded by direct award or by competitive selection among framework suppliers, in accordance with the award criteria published in the procurement documents. The criteria may not be varied after award." },
      { ref: "2.4", heading: "Permitted variations", text: "This Agreement may be varied only where the variation is permitted by the applicable procurement regime. A variation outside that regime requires a new procurement, whatever the parties agree." },
    ],
    obligations: [
      { ref: "3.1", heading: "Transparency", text: "The Supplier acknowledges that the Client is subject to publication duties in respect of this Agreement and the call-offs under it, and shall not mark information confidential where the duty requires publication." },
    ],
  },

  sow_milestone_global: {
    sections: ["interpretation","services","obligations","term","charges","performance","termination","law"],
    services: [
      { ref: "2.1", heading: "Parent agreement", text: "This Statement of Work is issued under, and incorporates the terms of, the master services agreement between the parties. It carries no standalone liability, indemnity or insurance terms." },
      { ref: "2.2", heading: "Milestones", text: "The Supplier shall deliver the milestones set out in the schedules. Each milestone has its own deliverables, acceptance criteria and date." },
      { ref: "2.3", heading: "Payment on acceptance", text: "A milestone payment falls due only when the Client has accepted that milestone against its acceptance criteria. Partial completion of a milestone gives rise to no payment." },
      { ref: "2.4", heading: "Delay", text: "Where a milestone is late by more than the period stated in the schedules, the Client may withhold subsequent payments until the programme is recovered, or terminate the remaining milestones without charge." },
    ],
    obligations: [
      { ref: "3.1", heading: "Acceptance", text: "The Client shall accept or reject each milestone within ten (10) business days of delivery, stating its reasons for any rejection by reference to the acceptance criteria." },
    ],
  },

  equipment_supply_only_global: {
    sections: ["interpretation","services","obligations","term","charges","liability","confidentiality",
      "termination","insurance","forcemajeure","law","ip","change"],
    services: [
      { ref: "2.1", heading: "Supply only", text: "The Supplier shall supply and deliver the equipment described in the schedules to {{facility_names}}. Installation and commissioning are carried out by others and are not the Supplier's responsibility." },
      { ref: "2.2", heading: "Title and risk", text: "Title passes to the Client on payment. Risk passes on delivery to the agreed point, and the Supplier shall give the Client reasonable notice of delivery." },
      { ref: "2.3", heading: "Warranty boundary", text: "The Supplier warrants the equipment against defects in materials and workmanship for twenty-four (24) months from delivery. That warranty does not extend to any defect caused by installation, commissioning or use, and the Supplier shall not be required to establish the cause of a defect before attending to inspect it." },
      { ref: "2.4", heading: "Installation information", text: "The Supplier shall provide the installation and commissioning requirements before delivery, so that the installer can be held to them." },
    ],
    obligations: [
      { ref: "3.1", heading: "Documentation", text: "The Supplier shall provide operation and maintenance manuals, technical data and any declaration of conformity with the equipment." },
    ],
  },
  equipment_supply_lease_global: {
    sections: ["interpretation","services","obligations","term","charges","performance","liability",
      "confidentiality","termination","insurance","hs","forcemajeure","law","change"],
    services: [
      { ref: "2.1", heading: "Lease", text: "The Supplier shall provide the equipment described in the schedules to {{facility_names}} on lease for the term, together with the maintenance described in clause 3. Title does not pass to the Client at any point." },
      { ref: "2.2", heading: "Possession and use", text: "The Client has possession and quiet enjoyment of the equipment for the term and shall use it in accordance with the manufacturer's instructions. The Client shall not modify, move or dispose of it without consent." },
      { ref: "2.3", heading: "Risk and insurance", text: "The Supplier retains ownership risk and shall insure the equipment. The Client is responsible for loss or damage caused by its own misuse and for nothing else." },
      { ref: "2.4", heading: "Return condition", text: "At the end of the term the Client shall return the equipment in the condition stated in the schedules, fair wear and tear excepted. Any return-condition charge shall be assessed jointly before collection, and no charge is payable that was not raised at that assessment." },
    ],
    obligations: [
      { ref: "3.1", heading: "Maintenance and availability", text: "The Supplier shall maintain the equipment throughout the term and shall provide a replacement where it is unavailable for more than the period stated in the schedules." },
    ],
  },

  consultancy_survey_global: {
    sections: ["interpretation","services","obligations","term","charges","liability","confidentiality",
      "termination","insurance","forcemajeure","law","ip"],
    services: [
      { ref: "2.1", heading: "Survey", text: "The Supplier shall carry out the survey, condition assessment or compliance audit described in the schedules at {{facility_names}} and shall deliver a written report." },
      { ref: "2.2", heading: "Reliance", text: "The Client may rely on the report for the purpose stated in the schedules. The Supplier shall also permit reliance by the Client's funders, insurers and any purchaser of the site, on the same terms and subject to the same limits." },
      { ref: "2.3", heading: "Limits of inspection", text: "The report shall state what was inspected, what was not, and why, including anything not reasonably accessible without opening up. A limitation not stated in the report is not a limitation the Supplier may rely on afterwards." },
    ],
    obligations: [
      { ref: "3.1", heading: "Standard of care", text: "The Supplier shall exercise the reasonable skill and care of a member of its profession experienced in surveys of a similar type, scope and complexity." },
      { ref: "3.2", heading: "Immediate risks", text: "The Supplier shall notify the Client immediately on discovering anything presenting an immediate risk to health, safety or continuity, rather than holding it for the report." },
    ],
  },
  consultancy_design_global: {
    sections: ["interpretation","services","obligations","term","charges","liability","confidentiality",
      "termination","insurance","forcemajeure","law","ip","change"],
    services: [
      { ref: "2.1", heading: "Design services", text: "The Supplier shall provide the design services described in the schedules, delivering each stage for the Client's approval before proceeding to the next." },
      { ref: "2.2", heading: "Design liability", text: "The Supplier is responsible for the design it produces, and that responsibility survives completion of the works and attaches to the design as built. Approval of a stage by the Client does not relieve the Supplier of it." },
      { ref: "2.3", heading: "Collateral warranties", text: "The Supplier shall, on request, provide collateral warranties in the agreed form to the Client's funders, to any incoming owner or tenant, and to the contractor, in each case on terms no more onerous than this Agreement." },
      { ref: "2.4", heading: "Fitness for purpose", text: "Where the schedules state a performance requirement for the design, the Supplier shall meet it. Elsewhere the standard is reasonable skill and care." },
    ],
    obligations: [
      { ref: "3.1", heading: "Design licence", text: "Copyright in the design remains with the Supplier, which grants the Client an irrevocable licence to use the design to construct, complete, maintain, extend and repair the works. The licence survives termination for any reason." },
      { ref: "3.2", heading: "Key personnel", text: "The Supplier shall not substitute named key personnel without the Client's prior written consent." },
    ],
  },

  nda_multiparty_global: {
    sections: ["interpretation","services","confidentiality","term","termination","law"],
    services: [
      { ref: "2.1", heading: "Purpose", text: "The parties listed in the schedules wish to exchange confidential information to evaluate a joint proposal or trial. This Agreement governs that exchange and creates no obligation to proceed and no partnership between them." },
      { ref: "2.2", heading: "Each party to each other", text: "Each party is both discloser and recipient in respect of every other party, and the obligations in clause 8 bind each of them to each of the others directly. Nothing in this Agreement requires a party to enforce it on another party's behalf." },
      { ref: "2.3", heading: "Withdrawal", text: "A party may withdraw on written notice to all the others. Its obligations in respect of information already received, and the others' obligations in respect of information it has already disclosed, continue for the full survival period." },
    ],
  },

  dpa_joint_controller_global: {
    sections: ["interpretation","services","obligations","confidentiality","data","term","termination","liability","law"],
    services: [
      { ref: "2.1", heading: "Joint control", text: "The parties jointly determine the purposes and means of the processing described in Annex 1 and are joint controllers of it. Neither party is the other's processor in respect of that processing." },
      { ref: "2.2", heading: "Allocation of responsibility", text: "Annex 2 records which party discharges each obligation: transparency information, responding to data subjects, breach notification to the regulator, records of processing, and impact assessments. The essence of that allocation shall be made available to data subjects." },
      { ref: "2.3", heading: "Single point of contact", text: "The party named in Annex 2 is the contact point for data subjects. A data subject may nevertheless exercise their rights against either party, and the parties shall cooperate to answer them within the statutory period." },
    ],
    obligations: [
      { ref: "3.1", heading: "Cooperation", text: "Each party shall provide the other with the information it needs to meet its own obligations, without charge and within a period that allows the statutory deadline to be met." },
      { ref: "3.2", heading: "Apportionment", text: "Where either party is liable to a data subject or a regulator for the joint processing, the parties shall apportion between themselves according to their respective responsibility for the failure." },
    ],
  },

  variation_scope_global: {
    sections: ["interpretation","services","term","charges","law"],
    services: [
      { ref: "2.1", heading: "Scope variation", text: "This Variation Agreement changes the services under the principal agreement between the parties with effect from {{start_date}}. The schedules state what is added, what is removed and what is unchanged." },
      { ref: "2.2", heading: "Price adjustment", text: "The Charges are adjusted as set out in the schedules, priced against {{rate_card_reference}}. Where the variation removes services, the reduction shall be calculated on the same basis as an addition." },
      { ref: "2.3", heading: "Service levels", text: "Where a variation changes the services, the service levels and the KPI schedule are adjusted with it. A service added without a service level is unmeasured." },
      { ref: "2.4", heading: "Employee transfer", text: "The parties shall confirm whether the variation triggers a relevant transfer of employees. Where it does, the employee liability information and the indemnities in the principal agreement apply." },
    ],
  },
  variation_extension_global: {
    sections: ["interpretation","services","term","charges","law"],
    services: [
      { ref: "2.1", heading: "Extension", text: "This Agreement extends the term of the principal agreement between {{legal_entity_name}} and {{supplier_name}} to {{end_date}}. The scope of services is unchanged." },
      { ref: "2.2", heading: "Terms restated, not assumed", text: "The parties confirm the liability cap, the indexation basis and the termination notice period that apply for the extended term, as set out in the schedules. An extension is the variation most often signed without review, and restating those three is what stops stale terms surviving by default." },
      { ref: "2.3", heading: "Cumulative effect", text: "The parties confirm they have reviewed the cumulative effect of every variation to the principal agreement to date, not this extension alone." },
    ],
  },

  termination_cause_global: {
    sections: ["interpretation","services","charges","confidentiality","termination","liability","law"],
    services: [
      { ref: "2.1", heading: "Termination for cause", text: "The Client terminates the principal agreement between {{legal_entity_name}} and {{supplier_name}} for material breach with effect from {{end_date}}. The schedules record the breaches relied on and the notices given." },
      { ref: "2.2", heading: "Reservation of rights", text: "Nothing in this Agreement is a waiver, settlement or compromise of any claim. The Client expressly reserves all rights and remedies arising from the breaches relied on and from any breach later discovered." },
      { ref: "2.3", heading: "Sums withheld", text: "Sums withheld at the date of termination remain withheld pending resolution of the Client's claims. Payment of any sum under this Agreement is not an admission that nothing further is owed to the Supplier." },
      { ref: "2.4", heading: "Exit obligations continue", text: "Termination for cause does not relieve the Supplier of its exit obligations. Transition assistance, data handover and access revocation apply as if the contract had expired." },
    ],
  },
  termination_expiry_global: {
    sections: ["interpretation","services","charges","confidentiality","termination","law"],
    services: [
      { ref: "2.1", heading: "Expiry", text: "The principal agreement between {{legal_entity_name}} and {{supplier_name}} expires on {{end_date}} and will not be renewed. Neither party alleges breach and nothing in this Agreement is a settlement of any claim." },
      { ref: "2.2", heading: "Exit plan", text: "The Supplier shall deliver the exit plan in the schedules, covering the transition of services to the incoming supplier, the sequence of handover, and the date each service transfers." },
      { ref: "2.3", heading: "Data and assets", text: "The Supplier shall hand over the asset register, maintenance history, statutory compliance records and access credentials at no charge, and shall return or delete the Client's data." },
      { ref: "2.4", heading: "Employee transfer", text: "Where a relevant transfer arises on exit, the Supplier shall provide complete and accurate employee liability information to the Client and the incoming supplier within the period stated in the principal agreement." },
      { ref: "2.5", heading: "Cost of transition", text: "Transition assistance is charged at the rates in the principal agreement. Work outside the exit plan requires written authorisation before it proceeds." },
    ],
  },
};

export function templateIsDraftable(code) {
  return Boolean(TEMPLATE_CONTENT[code]);
}

const TOKEN_RE = /\{\{(\w+)\}\}/g;

export function textToRuns(text, values) {
  const runs = [];
  let last = 0;
  let match;
  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(text)) !== null) {
    if (match.index > last) runs.push({ t: "text", text: text.slice(last, match.index) });
    const name = match[1];
    runs.push({ t: "token", name, value: formatValue(name, values?.[name]) });
    last = match.index + match[0].length;
  }
  if (last < text.length) runs.push({ t: "text", text: text.slice(last) });
  return runs;
}

function formatValue(name, raw) {
  if (raw == null || raw === "") return "";
  const field = TOKEN_FIELDS[name];
  if (field?.type === "date") {
    const d = new Date(raw);
    if (!isNaN(d)) return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  }
  if (name === "contract_value") {
    const n = Number(raw);
    if (!isNaN(n)) return n.toLocaleString("en-GB");
  }
  return String(raw);
}

export function unresolvedTokens(doc) {
  const missing = new Set();
  for (const block of doc.blocks || []) {
    for (const run of block.runs || []) {
      if (run.t === "token" && (run.value == null || run.value === "")) missing.add(run.name);
    }
  }
  return [...missing];
}

// A playbook clause as a finished sentence, for dropping into a document that already
// exists. The model wording carries the standard position hard-coded into its prose
// ("sixty (60) days", "125%", "England and Wales"), so inserting it raw would contradict
// whatever this contract actually negotiated. Tokenise it first, then resolve against
// this contract's own values, exactly as the drafting engine does.
export function resolvedClauseWording(code, values = {}, options = {}) {
  const text = options.evergreen && code === "term_renewal"
    ? EVERGREEN_TERM_WORDING
    : wordingFor(code, values);
  return textToRuns(text, values)
    .map((run) => (run.t === "token"
      ? (run.value != null && run.value !== "" ? run.value : `[${run.name}]`)
      : run.text))
    .join("");
}

export function buildDraft(templateCode, values = {}, options = {}) {
  const template = TEMPLATE_BY_CODE[templateCode];
  const content = TEMPLATE_CONTENT[templateCode];
  if (!template || !content) return { meta: {}, blocks: [], comments: [] };

  const agreementType = AGREEMENT_TYPE_BY_CODE[template.agreementType];
  const blocks = [];
  const push = (text, block) => blocks.push({ ...block, runs: textToRuns(text, values) });

  blocks.push({ type: "title", text: (values.title || template.name).toUpperCase() });
  blocks.push({
    type: "subtitle",
    text: `${agreementType?.name || template.name} · ${values.contract_number || "Contract number to be assigned"}`
      + (options.evergreen ? " · Evergreen (no fixed expiry)" : ""),
  });

  for (const key of content.sections) {
    const section = SECTION_BY_KEY[key];
    if (!section) continue;
    blocks.push({ type: "heading", number: String(section.number), text: section.heading.toUpperCase() });

    if (key === "interpretation") {
      push(PARTIES_CLAUSE, { type: "clause", ref: "1.1", heading: "Parties" });
      push(INTERPRETATION_CLAUSE, { type: "clause", ref: "1.2", heading: "Definitions" });
      continue;
    }
    for (const clause of content[key] || []) {
      push(clause.text, { type: "clause", ref: clause.ref, heading: clause.heading });
    }
    for (const code of section.playbook || []) {
      const clause = CLAUSE_BY_CODE[code];
      if (!clause) continue;
      const evergreenSwap = options.evergreen && code === "term_renewal";
      push(evergreenSwap ? EVERGREEN_TERM_WORDING : wordingFor(code, values), {
        type: "clause",
        ref: clause.clauseRef,
        heading: clause.name,
        playbookCode: code,
        evergreen: evergreenSwap || undefined,
      });
    }
  }

  blocks.push({ type: "heading", text: "EXECUTION" });
  push(
    "Signed for and on behalf of {{legal_entity_name}} by its authorised signatory, and for and on "
    + "behalf of {{supplier_name}} by its authorised signatory, each by electronic signature, which "
    + "the parties agree has the same effect as a manuscript signature.",
    { type: "clause", ref: "", heading: "" }
  );

  return {
    meta: {
      title: values.title || template.name,
      templateCode,
      templateName: template.name,
      agreementType: template.agreementType,
      agreementTypeName: agreementType?.name,
      jurisdiction: template.jurisdiction,
      version: options.version || "v0.1",
      status: options.status || "Draft",
      evergreen: Boolean(options.evergreen),
      author: values.legal_entity_name || "FM Supplier CLM",
    },
    blocks,
    comments: [],
  };
}

export function docToPlainText(doc) {
  return (doc.blocks || []).map((block) => {
    if (block.type === "title" || block.type === "subtitle") return block.text;
    if (block.type === "heading") return `\n${block.number ? block.number + ". " : ""}${block.text}`;
    const body = (block.runs || [])
      .filter((r) => r.t !== "del")
      .map((r) => (r.t === "token" ? (r.value || `[${r.name}]`) : r.text))
      .join("");
    return `${block.ref ? block.ref + " " + (block.heading || "") + ". " : ""}${body}`;
  }).join("\n");
}
