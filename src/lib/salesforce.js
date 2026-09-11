import { readOAuth, refreshAccessToken } from "./sfauth.js";
import { CLIENT_ENTITY } from "../data/contracts.js";

// The two values the OAuth flow needs from the environment. VITE_ variables are baked in
// at build time and are not secrets: the consumer key of a PKCE public client is in the
// page by design, and the org URL is where the browser is sent to sign in.
const ENV = (typeof import.meta !== "undefined" && import.meta.env) || {};

export const SALESFORCE_DEFAULTS = {
  // Live when an org is configured. Simulated is the fallback for a machine with no .env,
  // not the thing the page is for.
  mode: ENV.VITE_SF_CLIENT_ID || ENV.VITE_SALESFORCE_URL ? "live" : "simulated",
  instanceUrl: "/salesforce",
  // "token": a session id pasted into the panel. "oauth": signed in through the org, with
  // a refresh token, so a 401 is handled rather than seen.
  authMode: ENV.VITE_SF_CLIENT_ID ? "oauth" : "token",
  accessToken: "",
  clientId: ENV.VITE_SF_CLIENT_ID || "",
  loginUrl: ENV.VITE_SALESFORCE_URL || "https://login.salesforce.com",
  apiVersion: "v60.0",
  // §14: to be validated with the organisation. Onboarding is its own object rather
  // than fields on the customer master, so this names the journey record, not the
  // supplier. The supplier is reached through Account__r.
  supplierObject: "Supplier_Onboarding__c",
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
    AccountId: "001SIM0000MERIDIAN",
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
    AccountId: "001SIM0000FERROWPC",
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
    AccountId: "001SIM0000CALDERME",
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

// The client's own legal entities. Salesforce carries the entity's name on the onboarding
// record; the registered number and address are the CLM's to know, because they are ours.
// One entity today; a second is one more row.
const CLIENT_ENTITIES = {
  [CLIENT_ENTITY.name]: CLIENT_ENTITY,
};

// Country to governing law, as a rule rather than a lookup. Blueprint §6.4: populate
// clauses deterministically where the choice follows explicit metadata such as
// jurisdiction. "United Kingdom" resolves to England and Wales, which is the default for
// an FM contract and the one the person drafting is most likely to want; Scotland is a
// deliberate change, and the field stays editable for exactly that.
const LAW_FOR_COUNTRY = {
  "United Kingdom": "England and Wales",
  "UK": "England and Wales",
  "Great Britain": "England and Wales",
  "England": "England and Wales",
  "Wales": "England and Wales",
  "Scotland": "Scotland",
  "Ireland": "Republic of Ireland",
  "Republic of Ireland": "Republic of Ireland",
  "Netherlands": "Netherlands",
  "The Netherlands": "Netherlands",
};

/**
 * Everything the draft can take from the onboarding record, keyed by the template's own
 * field names.
 *
 * The keys matter more than they look. The studio spreads this over the demo defaults, so
 * a key the template does not recognise is a value that was fetched, shown in "what gets
 * carried across", and then silently replaced by the demo supplier's. Three fields spent
 * a while in that state: company number, client entity and site all read as Meridian's
 * whatever supplier was chosen, because the names here did not match the names there.
 *
 * Two kinds of value come back. SALESFORCE_SOURCED are read verbatim from the org.
 * SALESFORCE_DERIVED are produced from org data by a rule — the title from category and
 * site, governing law from country, the client entity's number and address from its name.
 * The studio marks them differently, because "from Salesforce" and "worked out from what
 * Salesforce said" are different claims.
 */
export function contextFor(record) {
  if (!record) return null;
  const entity = CLIENT_ENTITIES[record.Legal_Entity__c] || null;
  const law = LAW_FOR_COUNTRY[String(record.BillingCountry || "").trim()] || "";
  const category = record.Service_Category__c || "";
  const site = record.Facility_Site__c || "";
  const title = category && site ? `${category} Services - ${site}` : category ? `${category} Services` : "";

  return {
    // supplier — read verbatim
    supplier_name: record.Name,
    supplier_registered_number: record.Company_Number__c,
    supplier_address: record.BillingStreet,
    supplier_contact: record.Primary_Contact__c,
    // client — the name is theirs; the rest is ours, looked up by that name
    legal_entity_name: record.Legal_Entity__c,
    legal_entity_registered_number: entity?.registeredNumber || "",
    legal_entity_address: entity?.address || "",
    governing_law: law,
    jurisdiction: law,
    // service
    service_category: category,
    facility_names: site,
    // contract
    title,
    contract_value: record.Contract_Value__c,
    currency_code: record.CurrencyIsoCode,
    // commercial
    payment_terms_days: String(record.Payment_Terms__c || "").match(/\d+/)?.[0] || "",
    // ownership, carried for the record rather than for any clause
    business_owner: record.Business_Owner__c,
    contract_owner: record.Procurement_Owner__c,
    country: record.BillingCountry,
  };
}

/** Values read verbatim from the org. */
export const SALESFORCE_SOURCED = Object.freeze([
  "supplier_name", "supplier_registered_number", "supplier_address", "supplier_contact",
  "legal_entity_name", "service_category", "facility_names", "contract_value",
  "currency_code", "payment_terms_days", "business_owner", "contract_owner", "country",
]);

/** Values produced from org data by a rule. Prefilled, and marked as inferred. */
export const SALESFORCE_DERIVED = Object.freeze([
  "title", "governing_law", "jurisdiction", "legal_entity_registered_number", "legal_entity_address",
]);

function apiBase(config) {
  return `${config.instanceUrl.replace(/\/$/, "")}/services/data/${config.apiVersion}`;
}

// The OAuth endpoints, reached the same way as the data API so the dev proxy covers them.
export function oauthEndpoints(config) {
  const base = config.instanceUrl.replace(/\/$/, "");
  return {
    tokenUrl: `${base}/services/oauth2/token`,
    revokeUrl: `${base}/services/oauth2/revoke`,
    userInfoUrl: `${base}/services/oauth2/userinfo`,
    loginUrl: config.loginUrl,
    clientId: config.clientId,
  };
}

function bearerFor(config) {
  if (config.authMode === "oauth") return readOAuth()?.accessToken || "";
  return config.accessToken || "";
}

async function sfFetch(config, path, init = {}, retried = false) {
  const token = bearerFor(config);
  if (!token) {
    throw new Error(config.authMode === "oauth"
      ? "Not signed in. Use Connect to Salesforce in the integration settings."
      : "No access token. Paste a session token from your org in the integration settings.");
  }
  const res = await fetch(`${apiBase(config)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (res.status === 401) {
    // With a refresh token, a 401 is a bookkeeping event: get a new access token and
    // try once more. Only once: a second 401 on a fresh token is a real refusal.
    if (config.authMode === "oauth" && !retried) {
      await refreshAccessToken(oauthEndpoints(config));
      return sfFetch(config, path, init, true);
    }
    throw new Error(config.authMode === "oauth"
      ? "Salesforce rejected the sign-in (401). Disconnect and sign in again."
      : "Salesforce rejected the token (401). Session tokens expire. Take a fresh one from the org.");
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

// Onboarding fields come off the record; supplier fields come through the lookup.
// SOQL traverses a lookup with __r, so one query still gets everything.
const SOQL_FIELDS = [
  "Id", "Name", "Onboarding_Status__c",
  "Qualification_Complete__c", "Insurance_Verified__c",
  "Bank_Verified__c", "Sanctions_Cleared__c",
  "Supplier_Category__c", "Service_Category__c", "Facility_Site__c",
  "Legal_Entity__c", "Business_Unit__c", "Business_Owner__c",
  "Procurement_Owner__c", "Company_Number__c", "Primary_Contact__c",
  "Contract_Value__c", "Payment_Terms__c",
  "Account__c", "Account__r.Name", "Account__r.BillingStreet", "Account__r.BillingCountry",
];

/**
 * One onboarding record, flattened into the shape the rest of the app reads.
 *
 * The nested `Account__r` shape stops here. Everything downstream — contextFor,
 * eligibility, the draft studio's "sourced from Salesforce" markers — keeps reading the
 * flat shape SIM_ORG defines, so the object model is a decision this file holds alone. If
 * onboarding moves back onto Account, or somewhere else again, only this function changes.
 *
 * Two ids survive, because they answer different questions: `Id` is the journey we write
 * status back to, `AccountId` is the supplier a contract belongs to.
 */
export function flattenOnboarding(row) {
  const account = row.Account__r || {};
  return {
    Id: row.Id,
    AccountId: row.Account__c,
    // The auto-number Name is the onboarding reference, so no separate field is needed.
    Supplier_Onboarding_Id__c: row.Name,

    Name: account.Name,
    BillingStreet: account.BillingStreet,
    BillingCountry: account.BillingCountry,

    Supplier_Category__c: row.Supplier_Category__c,
    Service_Category__c: row.Service_Category__c,
    Facility_Site__c: row.Facility_Site__c,
    Legal_Entity__c: row.Legal_Entity__c,
    Business_Unit__c: row.Business_Unit__c,
    Business_Owner__c: row.Business_Owner__c,
    Procurement_Owner__c: row.Procurement_Owner__c,
    Company_Number__c: row.Company_Number__c,
    Primary_Contact__c: row.Primary_Contact__c,
    Contract_Value__c: row.Contract_Value__c,
    Payment_Terms__c: row.Payment_Terms__c,
    Onboarding_Status__c: row.Onboarding_Status__c,
    // Only present when the org has multi-currency enabled, which a fresh org does not.
    CurrencyIsoCode: row.CurrencyIsoCode || "GBP",

    live: true,
    // Without this the gate reads every live supplier as having no prerequisites
    // recorded, which is not the same answer as having met them.
    prereqs: {
      qualified: Boolean(row.Qualification_Complete__c),
      insuranceVerified: Boolean(row.Insurance_Verified__c),
      bankVerified: Boolean(row.Bank_Verified__c),
      sanctionsCleared: Boolean(row.Sanctions_Cleared__c),
    },
  };
}

export async function listSuppliers(config) {
  if (config.mode !== "live") {
    return { records: SIM_ORG, simulated: true };
  }
  const soql = `SELECT ${SOQL_FIELDS.join(", ")} FROM ${config.supplierObject}`
    + " ORDER BY Account__r.Name LIMIT 25";
  const data = await sfFetch(config, `/query?q=${encodeURIComponent(soql)}`);
  return {
    records: (data.records || []).map(flattenOnboarding),
    simulated: false,
    total: data.totalSize,
  };
}

/** One onboarding record by id, for the Create Contract deep link. */
export async function getOnboarding(config, onboardingId) {
  if (config.mode !== "live") {
    return SIM_ORG.find((r) => r.Id === onboardingId) || null;
  }
  const soql = `SELECT ${SOQL_FIELDS.join(", ")} FROM ${config.supplierObject}`
    + ` WHERE Id = '${String(onboardingId).replace(/'/g, "")}' LIMIT 1`;
  const data = await sfFetch(config, `/query?q=${encodeURIComponent(soql)}`);
  const row = (data.records || [])[0];
  return row ? flattenOnboarding(row) : null;
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

/**
 * The contract record, written back to Salesforce.
 *
 * Upsert by external id rather than create-then-update: PATCH to
 * /sobjects/<object>/<externalIdField>/<value> creates on the first call and updates on
 * every one after. One round trip, and idempotent — which matters because the sync effect
 * can fire twice for the same status after a reload.
 */
export async function upsertContract(config, { contract, record }) {
  const stamp = { at: new Date().toISOString(), contractId: contract?.id, status: contract?.status };
  if (config.mode !== "live") return { ...stamp, simulated: true };

  const body = {
    Supplier__c: record?.AccountId || null,
    Onboarding__c: record?.Id || null,
    Agreement_Type__c: contract.agreementType,
    Contract_Template__c: contract.templateName,
    Template_Version__c: contract.templateVersion,
    Contract_Status__c: contract.status,
    Approval_Status__c: contract.approvalStatus,
    Signature_Status__c: contract.signatureStatus,
    Current_Version__c: contract.version,
    Contract_Value__c: contract.value || 0,
    Currency_Code__c: contract.currency || "GBP",
    Start_Date__c: contract.startDate || null,
    End_Date__c: contract.evergreen ? null : (contract.endDate || null),
    Evergreen__c: Boolean(contract.evergreen),
    Effective_Date__c: contract.effectiveDate || null,
    // §6.10: a control, not a mirror of the status. Anything short of executed or
    // active leaves PO eligibility false, which is the whole point of the field.
    PO_Eligibility__c: ["Executed", "Active"].includes(contract.status),
    Last_Milestone__c: (contract.milestone || "").slice(0, 255),
    Last_Sync__c: new Date().toISOString(),
  };

  await sfFetch(
    config,
    `/sobjects/CLM_Contract__c/Contract_Reference__c/${encodeURIComponent(contract.id)}`,
    { method: "PATCH", body: JSON.stringify(body) }
  );
  return { ...stamp, simulated: false, poEligible: body.PO_Eligibility__c };
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
