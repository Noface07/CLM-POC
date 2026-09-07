import { useState } from "react";
import {
  ArrowLeft, PenLine, Download, RefreshCw, Ban, Send, Loader2, KeyRound,
  ExternalLink, ShieldAlert, FileCheck2, Users, FileText,
} from "lucide-react";
import { Tag, Btn, Field, statusColor, validEmail, GREEN, AMBER, GRAY, RED, kicker } from "../lib/ui.jsx";
import { SIGNING_STATUS_LABEL, ENVELOPE_STATUS_LABEL } from "../lib/documenso.js";
import DocumentView from "./DocumentView.jsx";

const SIGNER_TONE = { Signed: GREEN, Sent: GRAY, Viewed: AMBER, Declined: RED };

export default function SignaturePage({
  onBack, contractId, supplierName, envelope, envelopeStatus, signatureStatus,
  config, setConfig, onSend, sending, error, onResend, onVoid,
  onDownloadExecuted, onDownloadCertificate, readOnly, canSign, ready,
  recipients, subject, setSubject, message, setMessage, previewUrl, doc,
  onSignRecipient, signatures,
}) {
  const [showSettings, setShowSettings] = useState(false);

  const signerList = (envelope?.recipients || []).filter((r) => r.role === "SIGNER");
  const signerCount = signerList.length;
  const signedCount = signerList.filter((r) => r.signingStatus === "SIGNED").length;

  const problems = [];
  if (!recipients.some((r) => r.role === "SIGNER")) problems.push("At least one recipient has to be a signer.");
  recipients.forEach((r, i) => {
    if (!r.name.trim()) problems.push(`Recipient #${i + 1} has no name.`);
    if (!validEmail(r.email)) problems.push(`Recipient #${i + 1} has no valid email address.`);
  });
  const emails = recipients.map((r) => r.email.trim().toLowerCase()).filter(Boolean);
  if (new Set(emails).size !== emails.length) problems.push("Two recipients share an email address.");
  if (!subject.trim()) problems.push("The email needs a subject.");

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      <Btn onClick={onBack} icon={ArrowLeft} variant="ghost">Back to workspace</Btn>

      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap",
        padding: "var(--space-3) 0 var(--space-4)", borderBottom: "2px solid var(--color-divider)", marginBottom: "var(--space-4)" }}>
        <h2 style={{ margin: 0 }}>{contractId}</h2>
        <span style={{ fontSize: 16, opacity: 0.7 }}>{supplierName}</span>
        <Tag outline>Documenso e-signature</Tag>
        <Tag c={config.mode === "live" ? RED : GRAY} style={{ fontSize: 10.5 }}>
          {config.mode === "live" ? "LIVE: calling a real instance" : "Simulated: no network"}
        </Tag>
        <Btn small variant="ghost" icon={KeyRound} onClick={() => setShowSettings((s) => !s)} style={{ marginLeft: "auto" }}>
          Integration settings
        </Btn>
      </div>

      {showSettings && (
        <div className="card" style={{ marginBottom: "var(--space-4)", gap: 10 }}>
          <div className="card-title" style={{ fontSize: 15 }}>Documenso connection</div>
          <div className="clm-grid-2">
            <Field label="Mode">
              <select className="input" value={config.mode} onChange={(e) => setConfig((c) => ({ ...c, mode: e.target.value }))}>
                <option value="simulated">Simulated, no account needed</option>
                <option value="live">Live, call a Documenso instance</option>
              </select>
            </Field>
            <Field label="Base URL" hint="/documenso is proxied by Vite in dev. Use an absolute URL for a self-hosted instance that permits CORS.">
              <input className="input" value={config.baseUrl} onChange={(e) => setConfig((c) => ({ ...c, baseUrl: e.target.value }))} />
            </Field>
          </div>
          <Field label="API key" hint="Documenso keys look like api_xxxxxxxx. Held in this tab's memory only, never stored.">
            <input
              className="input" type="password" value={config.apiKey} placeholder="api_…"
              onChange={(e) => setConfig((c) => ({ ...c, apiKey: e.target.value }))}
            />
          </Field>
          {config.mode === "live" && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "#fdf1da",
              border: "1px solid #f5dfa8", color: "#7a4a05", padding: 10, fontSize: 12, lineHeight: 1.55 }}>
              <ShieldAlert size={15} style={{ flex: "none", marginTop: 1 }} />
              <span>
                An API key typed into a browser is readable by anything running on the page, and Documenso's hosted API
                does not send CORS headers a browser will accept, so the dev server proxies it for you. In production
                this call belongs on a backend of your own, and so does the key. Fine for testing against your own
                sandbox; not fine for anything else.
              </span>
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{ background: "var(--color-accent-100)", border: "1px solid var(--color-accent-300)",
          color: "var(--color-accent-800)", padding: 10, fontSize: 12.5, marginBottom: "var(--space-4)", lineHeight: 1.55 }}>
          {error}
        </div>
      )}

      {!envelope ? (
        !ready ? (
          <div className="card" style={{ gap: 10 }}>
            <div className="card-title" style={{ fontSize: 15 }}>Not ready to send</div>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.75, lineHeight: 1.6 }}>
              Every tracked change has to be accepted or rejected and every exception decided before an envelope can
              be created. Sending a document with unresolved markup in it is how a counterparty ends up signing
              wording nobody agreed to.
            </p>
            <p style={{ margin: 0, fontSize: 12.5, opacity: 0.6 }}>
              You can still set the recipients below. They are kept until you send.
            </p>
          </div>
        ) : null
      ) : null}

      {!envelope && (
        <div className="clm-envelope-grid">
          <div className="card" style={{ gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Users size={15} />
              <div className="card-title" style={{ margin: 0, fontSize: 15 }}>Recipients</div>
              <Tag c={GRAY} style={{ fontSize: 10, marginLeft: "auto" }}>{recipients.length} on the envelope</Tag>
            </div>
            <p style={{ fontSize: 11.5, opacity: 0.6, margin: 0, lineHeight: 1.6 }}>
              Taken from the contract, and not editable here. The parties to an agreement and the people authorised to
              bind them are settled during negotiation. Re-picking them on the way out of the door is how a document
              ends up executed by somebody with no authority to execute it. Signing order matters: recipient 2 is not
              emailed until recipient 1 has signed.
            </p>

            {recipients.map((r, i) => (
              <div key={i} style={{ border: "1px solid var(--color-divider)", padding: 10, display: "grid", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Tag c={GRAY} style={{ fontSize: 10 }}>#{i + 1}</Tag>
                  <strong style={{ fontSize: 13.5 }}>{r.name}</strong>
                  <Tag c={r.role === "SIGNER" ? AMBER : GRAY} style={{ fontSize: 10 }}>{r.role.toLowerCase()}</Tag>
                  <span style={{ fontSize: 11.5, opacity: 0.6, marginLeft: "auto" }}>
                    {i === 0 ? "signs first" : `signs after ${recipients[i - 1].name}`}
                  </span>
                </div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  {r.email}
                  {r.onBehalfOf && <> · for {r.onBehalfOf}</>}
                </div>
              </div>
            ))}

            <Field label="Email subject">
              <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </Field>
            <Field label="Message to recipients">
              <textarea className="input" value={message} onChange={(e) => setMessage(e.target.value)} style={{ minHeight: 70 }} />
            </Field>

            {problems.length > 0 && (
              <div style={{ background: "#fdf1da", border: "1px solid #f5dfa8", color: "#7a4a05", padding: 10, fontSize: 12, lineHeight: 1.55 }}>
                {problems.map((p, i) => <div key={i}>{p}</div>)}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn
                onClick={onSend} disabled={sending || !canSign || !ready || problems.length > 0}
                icon={sending ? Loader2 : Send} spin={sending} variant="primary"
              >
                {sending ? "Creating envelope…"
                  : config.mode === "live" ? "Send via Documenso (live)"
                  : "Send for signature (simulated)"}
              </Btn>
            </div>
            {!canSign && (
              <p style={{ fontSize: 11.5, opacity: 0.6, margin: 0 }}>Your role cannot send a contract for signature.</p>
            )}
            <p style={{ fontSize: 11.5, opacity: 0.55, margin: 0, lineHeight: 1.6 }}>
              Sending converts the document to a PDF (the first point in this contract's life at which it stops being
              a Word file) and posts it to Documenso as a multipart envelope with a signature field per signer.
            </p>
          </div>

          <div className="card" style={{ gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <FileText size={15} />
              <div className="card-title" style={{ margin: 0, fontSize: 15 }}>What will be signed</div>
              <Tag c={GRAY} style={{ fontSize: 10 }}>{doc?.blocks?.filter((b) => b.type === "clause").length || 0} clauses</Tag>
              {previewUrl && (
                <Btn small variant="ghost" icon={ExternalLink} style={{ marginLeft: "auto" }}
                  onClick={() => window.open(previewUrl, "_blank", "noopener")}>Open the PDF</Btn>
              )}
            </div>
            {doc && ready ? (
              <>
                <p style={{ fontSize: 11.5, opacity: 0.6, margin: 0, lineHeight: 1.6 }}>
                  The final text, with every accepted change applied and every rejected one dropped. The PDF in the
                  envelope is generated from this and nothing else: no tracked changes, no comments, no markup.
                </p>
                <DocumentView doc={doc} canAct={false} showComments={false} height={560} />
              </>
            ) : (
              <p style={{ fontSize: 12.5, opacity: 0.6, margin: 0, lineHeight: 1.6 }}>
                The preview appears once the document is clean: every tracked change accepted or rejected. Until
                then there is no single version of the text to show, which is the reason it cannot be sent yet.
              </p>
            )}
          </div>
        </div>
      )}

      {envelope && (
        <div className="card" style={{ gap: "var(--space-4)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div className="card-title" style={{ marginBottom: 2 }}>Signature envelope</div>
              <p style={{ margin: 0, fontSize: 12, opacity: 0.55 }}>
                {envelope.simulated ? "Simulated envelope, no email was sent" : "Created in Documenso"} · id {envelope.id}
              </p>
            </div>
            <Tag c={statusColor(signatureStatus)}>{ENVELOPE_STATUS_LABEL[envelopeStatus] || signatureStatus}</Tag>
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <span style={{ ...kicker, margin: 0 }}>Signers</span>
              <Tag c={signedCount === signerCount ? GREEN : AMBER} style={{ fontSize: 10.5 }}>
                {signedCount} of {signerCount} signed
              </Tag>
              {signedCount < signerCount && (
                <span style={{ fontSize: 11.5, opacity: 0.6 }}>
                  The contract is not executed until every signer has signed.
                </span>
              )}
            </div>

            {(envelope.recipients || []).map((r, i) => {
              const label = SIGNING_STATUS_LABEL[r.signingStatus] || "Sent";
              const isSigner = r.role === "SIGNER";
              const signed = r.signingStatus === "SIGNED";
              const record = r.party ? signatures?.[r.party] : null;
              // Signing order: everyone ahead of this recipient must have signed first.
              const blockedBy = (envelope.recipients || [])
                .slice(0, i)
                .find((prev) => prev.role === "SIGNER" && prev.signingStatus !== "SIGNED");

              return (
                <div key={r.id} style={{ padding: "var(--space-3) 0", borderBottom: "1px solid var(--color-divider)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{r.name}</div>
                      <div className="text-muted" style={{ fontSize: 12 }}>
                        {r.email} · {r.role.toLowerCase()} · order {r.signingOrder}
                        {r.onBehalfOf && <> · for {r.onBehalfOf}</>}
                      </div>
                    </div>
                    <Tag c={SIGNER_TONE[label] || GRAY} style={{ flex: "none" }}>{label}</Tag>
                    {isSigner && !signed && r.party === "client" && !readOnly && canSign && onSignRecipient && (
                      <Btn
                        small variant={blockedBy ? "secondary" : "primary"} icon={PenLine}
                        disabled={Boolean(blockedBy)}
                        onClick={() => onSignRecipient(r.party)}
                      >Sign as {r.name.split(" ")[0]}</Btn>
                    )}
                    {isSigner && !signed && r.party !== "client" && (
                      <Tag c={GRAY} style={{ flex: "none", fontSize: 10.5 }}>signs in their own portal</Tag>
                    )}
                  </div>

                  {r.party !== "client" && !signed && !blockedBy && (
                    <p style={{ margin: "6px 0 0", fontSize: 11.5, opacity: 0.65, lineHeight: 1.55 }}>
                      {r.name} is at {r.onBehalfOf}. The envelope has reached them; they sign through their own
                      access link, and their signature appears here when they do.
                    </p>
                  )}

                  {blockedBy && !signed && (
                    <p style={{ margin: "6px 0 0", fontSize: 11.5, opacity: 0.65, lineHeight: 1.55 }}>
                      Waiting on <strong>{blockedBy.name}</strong>, because the envelope has a signing order, so this
                      recipient is not reached until the one before them has signed.
                    </p>
                  )}

                  {record && (
                    <div style={{ marginTop: 8, background: "var(--color-neutral-100)",
                      border: "1px solid var(--color-divider)", padding: "8px 10px" }}>
                      <div className="clm-sig-mark" style={{ fontSize: 20 }}>{record.name}</div>
                      <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>
                        {record.title} · {record.date} · {record.method}
                        {record.mismatch && <> · envelope addressed to {record.addressedTo}</>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {signatureStatus === "Executed" ? (
              <>
                <Btn onClick={onDownloadExecuted} icon={Download} variant="primary">Download executed contract (PDF)</Btn>
                <Btn onClick={onDownloadCertificate} icon={FileCheck2} variant="secondary">Signing certificate</Btn>
              </>
            ) : !readOnly && envelopeStatus === "PENDING" ? (
              <>
                <Btn onClick={onResend} icon={RefreshCw} variant="secondary">Resend envelope</Btn>
                <Btn onClick={onVoid} icon={Ban} variant="ghost">Void envelope</Btn>
              </>
            ) : null}
          </div>

          {signatureStatus !== "Executed" && envelopeStatus === "PENDING" && (
            <p style={{ fontSize: 12.5, opacity: 0.6, margin: 0, lineHeight: 1.6 }}>
              Both parties can be signed from here for the demo. In production each signer receives their own link
              and only they can sign with it. The counterparty's own view is under <em>Supplier view</em> in the
              header.
            </p>
          )}

          {signatureStatus === "Executed" && (
            <div style={{ background: "#e3f0e4", border: "1px solid #bcd9c0", color: "#285c31", padding: 10, fontSize: 12.5, lineHeight: 1.6 }}>
              Executed. From here the document is a PDF and nothing else. The Word version stays in the version
              history as the negotiation record, and obligation extraction runs against the signed PDF, not the draft.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
