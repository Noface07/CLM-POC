import { AGREEMENT_TYPE_BY_CODE } from "./catalogue.js";

export const CONTRACT_ID = "CTR-2026-04821";
export const CONTRACT_OWNER = "D. Whitfield";

export const SUPPLIER = {
  id: "SUP-08841",
  name: "Meridian Cleaning & Technical Services Ltd.",
  category: "Hard & Soft FM Supplier",
  serviceCategory: "Integrated FM",
  facility: "Riverside Corporate Campus - Building C",
  businessUnit: "UK Facilities Operations",
  region: "United Kingdom",
  businessOwner: "R. Ashworth",
  procurementOwner: "D. Whitfield",
  onboardingStatus: "Approved - Ready to Contract",
  registeredNumber: "08841221",
  address: "Unit 4, Fairfax Industrial Park, Reading RG2 0TD",
  contact: "Kavita Bhatt, Account Director",
  signatoryName: "Kavita Bhatt",
  signatoryTitle: "Account Director",
  signatoryEmail: "k.bhatt@meridian-cts.example",
};

export const BLOCKED_SUPPLIER = {
  id: "SUP-09102",
  name: "Ferrow Pest Control",
  onboardingStatus: "Insurance Pending",
  serviceCategory: "Other",
  facility: "Riverside Corporate Campus - Building C",
  registeredNumber: "09102338",
  address: "12 Bell Lane, Slough SL1 2QP",
  contact: "J. Ferrow",
};

export const CLIENT_ENTITY = {
  name: "Meridian FM Services (UK) Ltd",
  registeredNumber: "04412907",
  address: "1 Riverside Way, London EC2A 4NE",
  signatory: "Daniel Whitfield",
  signatoryTitle: "Contract Manager",
  signatoryEmail: "d.whitfield@meridian-fm.example",
};

function riskOf(agreementTypeCode) {
  return AGREEMENT_TYPE_BY_CODE[agreementTypeCode]?.riskLevel || "medium";
}

function contract(row) {
  return {
    ...row,
    riskLevel: riskOf(row.agreementTypeCode),
    agreementType: AGREEMENT_TYPE_BY_CODE[row.agreementTypeCode]?.name || row.agreementTypeCode,
    family: AGREEMENT_TYPE_BY_CODE[row.agreementTypeCode]?.family || "-",
    evergreen: Boolean(row.evergreen),
    endDate: row.evergreen ? null : row.endDate,
  };
}

export const PORTFOLIO = [
  contract({
    id: "CLM-2017", supplier: "Solstice Elevator Services", agreementTypeCode: "msa",
    status: "Active", value: 2100000, currency: "GBP", startDate: "2025-02-01", endDate: "2028-01-31",
    category: "Technical Maintenance", routedTo: ["legal", "contract_management"],
    owner: "D. Whitfield", requestedBy: "R. Ashworth",
  }),
  contract({
    id: "CLM-2011", supplier: "Ferrow Pest Control", agreementTypeCode: "reactive",
    status: "Active", value: 76000, currency: "GBP", startDate: "2025-10-16", endDate: "2026-10-15",
    category: "Other", routedTo: ["contract_management"],
    owner: "D. Whitfield", requestedBy: "R. Ashworth",
  }),
  contract({
    id: "CLM-2038", supplier: "Bright Path Logistics", agreementTypeCode: "equipment_supply",
    status: "Draft", value: 340000, currency: "GBP", startDate: "2026-11-01", endDate: "2027-12-01",
    category: "Waste Management", routedTo: ["procurement"],
    owner: "D. Whitfield", requestedBy: "R. Ashworth",
  }),
  contract({
    id: "CLM-2044", supplier: "Northgate Security Services", agreementTypeCode: "soft_fm",
    status: "In Negotiation", value: 612000, currency: "GBP", startDate: "2026-04-01", endDate: "2029-03-31",
    category: "Security", routedTo: ["legal", "contract_management", "finance"],
    owner: "D. Whitfield", requestedBy: "M. Duarte",
  }),
  contract({
    id: "CLM-2051", supplier: "Caldera Building Services", agreementTypeCode: "hard_fm",
    status: "Exception Review", value: 985000, currency: "GBP", startDate: "2026-01-01", endDate: "2028-12-31",
    category: "Technical Maintenance", routedTo: ["legal"],
    owner: "D. Whitfield", requestedBy: "R. Ashworth",
  }),
  contract({
    id: "CLM-2062", supplier: "Vantage Cleaning Partners", agreementTypeCode: "soft_fm",
    status: "Active", value: 289000, currency: "GBP", startDate: "2024-07-01",
    evergreen: true, category: "Cleaning", routedTo: ["contract_management"],
    owner: "D. Whitfield", requestedBy: "R. Ashworth",
    evergreenNote: "Rolling term, 90-day mutual termination for convenience. Reviewed annually against CPI.",
  }),
  contract({
    id: "CLM-2070", supplier: "Halden Data Systems", agreementTypeCode: "dpa",
    status: "Active", value: 0, currency: "GBP", startDate: "2025-05-12",
    evergreen: true, category: "Access Control", routedTo: ["legal"],
    owner: "R. Sandhu", requestedBy: "M. Duarte",
    evergreenNote: "Term matches the parent MSA. A DPA with its own expiry would lapse while processing continues.",
  }),
  contract({
    id: "CLM-2078", supplier: "Orrery Consulting LLP", agreementTypeCode: "consultancy",
    status: "Signature Pending", value: 145000, currency: "GBP", startDate: "2026-10-01", endDate: "2027-03-31",
    category: "Advisory", routedTo: ["finance", "contract_management"],
    owner: "D. Whitfield", requestedBy: "M. Duarte",
  }),
  contract({
    id: "CLM-2083", supplier: "Pinewood Grounds Maintenance", agreementTypeCode: "ppm",
    status: "Expiring", value: 94000, currency: "GBP", startDate: "2024-12-01", endDate: "2026-11-30",
    category: "Grounds", routedTo: ["contract_management"],
    owner: "D. Whitfield", requestedBy: "R. Ashworth",
  }),
  contract({
    id: "CLM-2090", supplier: "Kestrel Fire & Safety", agreementTypeCode: "hard_fm",
    status: "Active", value: 431000, currency: "GBP", startDate: "2025-01-15", endDate: "2026-12-14",
    category: "Life Safety", routedTo: ["contract_management"],
    owner: "D. Whitfield", requestedBy: "R. Ashworth",
  }),
  contract({
    id: "CLM-2096", supplier: "Ashvale Catering Group", agreementTypeCode: "nda",
    status: "Executed", value: 0, currency: "GBP", startDate: "2026-06-01", endDate: "2028-05-31",
    category: "Catering", routedTo: ["legal"],
    owner: "R. Sandhu", requestedBy: "M. Duarte",
  }),
];

export const REVIEWERS = [
  { key: "owner", role: "Contract Owner", name: CONTRACT_OWNER },
  { key: "procurement", role: "Procurement / Contract Manager", name: "D. Whitfield" },
  { key: "legal", role: "Legal Counsel", name: "R. Sandhu" },
];

export const ROUTE_DESKS = [
  "Contract Manager",
  "Legal",
  "Legal / Risk",
  "Finance / Procurement",
  "Finance / Commercial Approver",
  "Procurement / Supplier Manager",
];

export const APPROVER_POOL = [
  { role: "Head of Legal", name: "S. Adeyemi" },
  { role: "Head of Finance", name: "M. Osei" },
  { role: "Director of Contract Management", name: "L. Chen" },
  { role: "Chief Procurement Officer", name: "R. Nakamura" },
];

const P = (r) => APPROVER_POOL.find((a) => a.role === r);

export const DEFAULT_APPROVAL_MATRIX = [
  { changeType: "Payment",          decidedBy: "Finance / Procurement", escalateTo: P("Head of Finance"),                 autoEscalateAbove: 1000000 },
  { changeType: "Liability/Risk",   decidedBy: "Legal",                 escalateTo: P("Head of Legal"),                   autoEscalateAbove: 500000 },
  { changeType: "Termination",      decidedBy: "Legal",                 escalateTo: P("Head of Legal"),                   autoEscalateAbove: 1000000 },
  { changeType: "SLA/Performance",  decidedBy: "Contract Manager",      escalateTo: P("Director of Contract Management"), autoEscalateAbove: 2000000 },
  { changeType: "Insurance/Risk",   decidedBy: "Legal / Risk",          escalateTo: P("Head of Legal"),                   autoEscalateAbove: 500000 },
  { changeType: "Administrative",   decidedBy: "Contract Manager",      escalateTo: P("Director of Contract Management"), autoEscalateAbove: 0 },
  { changeType: "Other",            decidedBy: "Contract Manager",      escalateTo: P("Director of Contract Management"), autoEscalateAbove: 0 },
];

export function routeMapFrom(matrix) {
  return Object.fromEntries((matrix || DEFAULT_APPROVAL_MATRIX).map((r) => [r.changeType, r.decidedBy]));
}

export function escalationFrom(matrix, changeType) {
  const row = (matrix || DEFAULT_APPROVAL_MATRIX).find((r) => r.changeType === changeType);
  return row ? row.escalateTo : P("Head of Legal");
}

export function mustEscalate(matrix, changeType, contractValue) {
  const row = (matrix || DEFAULT_APPROVAL_MATRIX).find((r) => r.changeType === changeType);
  if (!row || !row.autoEscalateAbove) return false;
  return (contractValue || 0) > row.autoEscalateAbove;
}

// Kept as the shipped default for anything reading the map statically.
export const CHANGE_TYPE_ROUTE = routeMapFrom(DEFAULT_APPROVAL_MATRIX);

export function getEscalationApprover(changeType) {
  return escalationFrom(DEFAULT_APPROVAL_MATRIX, changeType);
}

export function formatMoney(value, currency = "GBP") {
  if (!value) return "-";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}
