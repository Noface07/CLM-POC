import agreementTypesFile from "../../catalogue/agreement-types.json";
import templatesFile from "../../catalogue/templates.json";
import playbookFile from "../../catalogue/clause-playbook.json";

export const AGREEMENT_TYPES = agreementTypesFile.agreementTypes;
export const TEMPLATES = templatesFile.templates;
export const TOKEN_GROUPS = Object.fromEntries(
  Object.entries(templatesFile.tokens).filter(([key]) => key !== "$comment")
);
export const PLAYBOOK = playbookFile.clauses;
export const PLAYBOOK_NOTES = playbookFile.$comment;

export const AGREEMENT_TYPE_BY_CODE = Object.fromEntries(AGREEMENT_TYPES.map((t) => [t.code, t]));
export const TEMPLATE_BY_CODE = Object.fromEntries(TEMPLATES.map((t) => [t.code, t]));
export const CLAUSE_BY_CODE = Object.fromEntries(PLAYBOOK.map((c) => [c.code, c]));

export function templatesForAgreementType(code) {
  return TEMPLATES.filter((t) => t.agreementType === code);
}

// Product roles, as the playbook's approvingRole / escalateTo name them.
export const ROLE_LABELS = {
  legal: "Legal",
  contract_manager: "Contract Manager",
  finance_commercial_approver: "Finance / Commercial Approver",
  procurement_supplier_manager: "Procurement / Supplier Manager",
  contract_owner: "Contract Owner",
  business_requestor: "Business Requestor",
  system_administrator: "System Administrator",
  auditor: "Auditor",
  head_of_legal: "Head of Legal",
  head_of_finance: "Head of Finance",
  director_contract_management: "Director of Contract Management",
};

export function roleLabel(code) {
  return ROLE_LABELS[code] || code;
}

export const RISK_LEVEL_ORDER = { high: 0, medium: 1, low: 2 };
