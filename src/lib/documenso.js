export const DOCUMENSO_FACTS = {
  licence: "AGPL-3.0. The whole signing workflow, API and audit trail are open source.",
  selfHosted: "Free of licence cost. You run Postgres and the app; the only cost is hosting and your own time.",
  cloudFree: "Hosted free tier: 5 documents per month, up to 10 recipients each.",
  cloudPaid: "Individual around $25/mo, Teams around $40/mo for 5 users, Platform around $250/mo (annual billing).",
  verdict:
    "Yes, it can be free: self-hosted it is free to licence, and the hosted free tier covers 5 documents a month. "
    + "At real contract volume you are choosing between paying for the hosted tier and paying for the infrastructure "
    + "and maintenance of your own instance.",
  caution:
    "Check qualified/advanced electronic signature requirements before replacing DocuSign on contracts that need "
    + "eIDAS QES. Documenso supports standard electronic signatures out of the box.",
};

export const DEFAULT_CONFIG = {
  mode: "simulated",          // "simulated" | "live"
  baseUrl: "/documenso",      // dev proxy; set an absolute URL for a self-hosted instance
  apiKey: "",
};

function headers(config, extra = {}) {
  return { Authorization: config.apiKey, ...extra };
}

async function request(config, path, init = {}) {
  const url = `${config.baseUrl.replace(/\/$/, "")}${path}`;
  let response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    throw new Error(
      `Could not reach Documenso at ${url}. If this is the hosted service, the browser's CORS policy blocks it. `
      + `Run through the dev proxy or a backend of your own. (${err.message})`
    );
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Documenso ${response.status} on ${path}: ${body.slice(0, 300)}`);
  }
  return response.status === 204 ? null : response.json();
}

export async function createEnvelope(config, pdfBlob, details) {
  const form = new FormData();
  form.append("payload", JSON.stringify({
    title: details.title,
    type: "DOCUMENT",
    externalId: details.externalId,
    visibility: "EVERYONE",
    recipients: details.recipients.map((r, i) => ({
      email: r.email,
      name: r.name,
      role: r.role || "SIGNER",
      signingOrder: i + 1,
    })),
    meta: {
      subject: `Signature requested: ${details.title}`,
      message: details.message || "Please review and sign the attached agreement.",
      distributionMethod: "EMAIL",
    },
  }));
  form.append("files", pdfBlob, `${details.externalId || "contract"}.pdf`);

  // Content-Type is deliberately not set: the browser must add the multipart boundary.
  const created = await request(config, "/envelope/create", {
    method: "POST",
    headers: headers(config),
    body: form,
  });
  const envelope = await request(config, `/envelope/${created.id}`, { headers: headers(config) });
  return { envelopeId: created.id, envelope };
}

export async function addSignatureFields(config, envelopeId, recipients, page = 1) {
  const data = recipients.map((r, i) => ({
    recipientId: r.id,
    type: "SIGNATURE",
    page,
    positionX: 12,
    positionY: 72 + i * 12,
    width: 32,
    height: 8,
  }));
  return request(config, "/envelope/field/create-many", {
    method: "POST",
    headers: headers(config, { "Content-Type": "application/json" }),
    body: JSON.stringify({ envelopeId, data }),
  });
}

export async function distributeEnvelope(config, envelopeId, meta = {}) {
  return request(config, "/envelope/distribute", {
    method: "POST",
    headers: headers(config, { "Content-Type": "application/json" }),
    body: JSON.stringify({ envelopeId, meta: { distributionMethod: "EMAIL", ...meta } }),
  });
}

export async function getEnvelope(config, envelopeId) {
  return request(config, `/envelope/${envelopeId}`, { headers: headers(config) });
}

export function certificateUrl(config, envelopeId) {
  return `${config.baseUrl.replace(/\/$/, "")}/envelope/${envelopeId}/certificate/download`;
}

export async function sendForSignature(config, pdfBlob, details) {
  const { envelopeId, envelope } = await createEnvelope(config, pdfBlob, details);
  const recipients = envelope.recipients || [];
  if (recipients.length) {
    await addSignatureFields(config, envelopeId, recipients);
  }
  await distributeEnvelope(config, envelopeId);
  return getEnvelope(config, envelopeId);
}

export function simulateEnvelope(details) {
  return {
    id: `sim_${Math.random().toString(36).slice(2, 12)}`,
    title: details.title,
    externalId: details.externalId,
    status: "PENDING",
    createdAt: new Date().toISOString(),
    simulated: true,
    recipients: details.recipients.map((r, i) => ({
      id: i + 1,
      name: r.name,
      email: r.email,
      role: r.role || "SIGNER",
      signingStatus: "NOT_SIGNED",
      signingOrder: i + 1,
      party: r.party,
      onBehalfOf: r.onBehalfOf,
    })),
  };
}

export const SIGNING_STATUS_LABEL = {
  NOT_SIGNED: "Sent",
  OPENED: "Viewed",
  SIGNED: "Signed",
  REJECTED: "Declined",
};

export const ENVELOPE_STATUS_LABEL = {
  DRAFT: "Not Ready",
  PENDING: "Pending",
  COMPLETED: "Executed",
  REJECTED: "Declined",
  CANCELLED: "Cancelled",
};
