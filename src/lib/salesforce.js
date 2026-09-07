export const SALESFORCE_DEFAULTS = {
  mode: "simulated",
  instanceUrl: "/salesforce",
  accessToken: "",
  apiVersion: "v60.0",
  // §14: to be validated with the organisation.
  supplierObject: "Account",
  contractStatusField: "CLM_Contract_Status__c",
  contractIdField: "CLM_Contract_Id__c",
};

export const ONBOARDING_PREREQS = [
  { key: "qualified", label: "Supplier qualification complete" },
  { key: "insuranceVerified", label: "Insurance certificates verified" },
  { key: "bankVerified", label: "Bank details verified" },
  { key: "sanctionsCleared", label: "Sanctions and adverse-media screening cleared" },
];

export const SIM_ORG = [
  {
    Id: "0018d00000QxRr1AAF",
    Name: "Meridian Cleaning & Technical Services Ltd.",
    Supplier_Onboarding_Id__c: "ONB-2026-0417",
    Supplier_Category__c: "Facilities Services",
    Service_Category__c: "Integrated FM",
    Facility_Site__c: "Riverside Corporate Campus - Building C",
    Legal_Entity__c: "Meridian FM Services (UK) Ltd",
    BillingCountry: "United Kingdom",
    Business_Unit__c: "Corporate Real Estate",
    Business_Owner__c: "R. Ashworth",
    Procurement_Owner__c: "D. Whitfield",
    Company_Number__c: "08841221",
    BillingStreet: "Unit 4, Fairfax Industrial Park, Reading RG2 0TD",
    Primary_Contact__c: "Kavita Bhatt, Account Director",
    Contract_Value__c: 486000,
    CurrencyIsoCode: "GBP",
    Payment_Terms__c: "45 days from invoice",
    Onboarding_Status__c: "Approved - Ready to Contract",
    prereqs: { qualified: true, insuranceVerified: true, bankVerified: true, sanctionsCleared: true },
  },
  {
    Id: "0018d00000QxSv4AAF",
    Name: "Ferrow Pest Control",
    Supplier_Onboarding_Id__c: "ONB-2026-0512",
    Supplier_Category__c: "Facilities Services",
    Service_Category__c: "Other",
    Facility_Site__c: "Riverside Corporate Campus - Building C",
    Legal_Entity__c: "Meridian FM Services (UK) Ltd",
    BillingCountry: "United Kingdom",
    Business_Unit__c: "Corporate Real Estate",
    Business_Owner__c: "R. Ashworth",
    Procurement_Owner__c: "D. Whitfield",
    Company_Number__c: "09102338",
    BillingStreet: "12 Bell Lane, Slough SL1 2QP",
    Primary_Contact__c: "J. Ferrow",
    Contract_Value__c: 64000,
    CurrencyIsoCode: "GBP",
    Payment_Terms__c: "30 days from invoice",
    Onboarding_Status__c: "Insurance Pending",
    prereqs: { qualified: true, insuranceVerified: false, bankVerified: true, sanctionsCleared: false },
  },
  {
    Id: "0018d00000QxTa9AAF",
    Name: "Calder Mechanical & Electrical Ltd.",
    Supplier_Onboarding_Id__c: "ONB-2026-0488",
    Supplier_Category__c: "Hard Services",
    Service_Category__c: "Technical Maintenance",
    Facility_Site__c: "Northgate Distribution Park",
    Legal_Entity__c: "Meridian FM Services (UK) Ltd",
    BillingCountry: "United Kingdom",
    Business_Unit__c: "Industrial & Logistics",
    Business_Owner__c: "P. Mensah",
    Procurement_Owner__c: "D. Whitfield",
    Company_Number__c: "07733114",
    BillingStreet: "Calder Works, Wakefield WF2 7AS",
    Primary_Contact__c: "H. Vance, Commercial Manager",
    Contract_Value__c: 1240000,
    CurrencyIsoCode: "GBP",
    Payment_Terms__c: "60 days from invoice",
    Onboarding_Status__c: "Approved - Ready to Contract",
    prereqs: { qualified: true, insuranceVerified: true, bankVerified: true, sanctionsCleared: true },
  },
];

export function eligibility(record) {
  const missing = ONBOARDING_PREREQS.filter((p) => !record?.prereqs?.[p.key]);
  return { eligible: missing.length === 0, missing };
}

export function contextFor(record) {
  if (!record) return null;
  return {
    supplier_name: record.Name,
    supplier_company_number: record.Company_Number__c,
    supplier_address: record.BillingStreet,
    client_entity: record.Legal_Entity__c,
    service_category: record.Service_Category__c,
    facility_site: record.Facility_Site__c,
    contract_value: record.Contract_Value__c,
    currency_code: record.CurrencyIsoCode,
    payment_terms_days: String(record.Payment_Terms__c || "").match(/\d+/)?.[0] || "",
    business_owner: record.Business_Owner__c,
    contract_owner: record.Procurement_Owner__c,
    country: record.BillingCountry,
  };
}

export const SALESFORCE_SOURCED = Object.freeze([
  "supplier_name", "supplier_company_number", "supplier_address", "client_entity",
  "service_category", "facility_site", "contract_value", "currency_code",
  "payment_terms_days", "business_owner", "contract_owner", "country",
]);

function apiBase(config) {
  return `${config.instanceUrl.replace(/\/$/, "")}/services/data/${config.apiVersion}`;
}

async function sfFetch(config, path, init = {}) {
  if (!config.accessToken) {
    throw new Error("No access token. Paste a session token from your Developer Edition org in the integration settings.");
  }
  const res = await fetch(`${apiBase(config)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (res.status === 401) {
    throw new Error("Salesforce rejected the token (401). Session tokens expire. Take a fresh one from the org.");
  }
  if (!res.ok) {
    // Salesforce returns an array of {message, errorCode}; the message is the useful half.
    let detail = await res.text();
    try {
      const parsed = JSON.parse(detail);
      detail = Array.isArray(parsed) ? parsed.map((e) => e.message).join("; ") : detail;
    } catch { /* keep the raw body */ }
    throw new Error(`Salesforce ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res.status === 204 ? null : res.json();
}

const SOQL_FIELDS = [
  "Id", "Name", "BillingStreet", "BillingCountry",
];

export async function listSuppliers(config) {
  if (config.mode !== "live") {
    return { records: SIM_ORG, simulated: true };
  }
  const soql = `SELECT ${SOQL_FIELDS.join(", ")} FROM ${config.supplierObject} ORDER BY Name LIMIT 25`;
  const data = await sfFetch(config, `/query?q=${encodeURIComponent(soql)}`);
  return {
    records: (data.records || []).map((r) => ({ ...r, live: true, prereqs: null })),
    simulated: false,
    total: data.totalSize,
  };
}

export async function pushMilestone(config, record, { contractId, status, milestone }) {
  const stamp = {
    at: new Date().toISOString(),
    recordId: record?.Id,
    recordName: record?.Name,
    contractId,
    status,
    milestone,
  };
  if (config.mode !== "live") return { ...stamp, simulated: true };

  await sfFetch(config, `/sobjects/${config.supplierObject}/${record.Id}`, {
    method: "PATCH",
    body: JSON.stringify({
      [config.contractIdField]: contractId,
      [config.contractStatusField]: status,
    }),
  });
  return { ...stamp, simulated: false };
}

export async function testConnection(config) {
  if (config.mode !== "live") return { ok: true, detail: "Simulated org, nothing to reach." };
  const data = await sfFetch(config, "/limits");
  const api = data?.DailyApiRequests;
  return {
    ok: true,
    detail: api ? `Connected. Daily API requests: ${api.Remaining} of ${api.Max} remaining.` : "Connected.",
  };
}
