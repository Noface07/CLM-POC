import { useState } from "react";
import { PenLine, X, ShieldCheck, AlertTriangle } from "lucide-react";
import { Tag, Btn, Field, GRAY, kicker } from "../lib/ui.jsx";

export default function SignCeremony({
  open, onClose, onSign, party, entity, expectedName, defaultTitle, documentTitle, clauseCount,
}) {
  const [typedName, setTypedName] = useState("");
  const [title, setTitle] = useState(defaultTitle || "Authorised signatory");
  const [intent, setIntent] = useState(false);
  const [authority, setAuthority] = useState(false);

  if (!open) return null;

  const name = typedName.trim();
  const problems = [];
  if (name.length < 3) problems.push("Type your full name as it should appear on the contract.");
  if (!/\s/.test(name) && name.length >= 3) problems.push("Use your full name, not just a first name or initials.");
  if (!intent) problems.push("Confirm you intend this to be your signature.");
  if (!authority) problems.push("Confirm you are authorised to sign for this party.");
  const mismatch = name.length > 2 && expectedName
    && name.toLowerCase().replace(/[^a-z]/g, "") !== expectedName.toLowerCase().replace(/[^a-z]/g, "");

  const now = new Date();
  const stamp = now.toLocaleString("en-GB", {
    day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" style={{ width: "min(600px, 95vw)" }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
          <div>
            <div className="card-kicker">{party}</div>
            <div className="dialog-title">Sign the agreement</div>
          </div>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ background: "var(--color-neutral-100)", border: "1px solid var(--color-divider)", padding: 10 }}>
          <div style={{ ...kicker, marginBottom: 3 }}>You are signing</div>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{documentTitle}</div>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 2 }}>
            {clauseCount} clauses · signing on behalf of <strong>{entity}</strong>
          </div>
        </div>

        <Field
          label="Type your full name"
          hint="Left blank on purpose. A name the system fills in is the system's assertion; a name you type is yours."
        >
          <input
            className="input" value={typedName} autoFocus
            onChange={(e) => setTypedName(e.target.value)}
            placeholder={expectedName ? `e.g. ${expectedName}` : "Your full name"}
            style={{ fontSize: 17, minHeight: 46 }}
          />
        </Field>

        <Field label="Title / capacity">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>

        {name.length > 2 && (
          <div style={{ border: "1px solid var(--color-neutral-300)", padding: "10px 12px", background: "#fff" }}>
            <div style={{ ...kicker, marginBottom: 6 }}>How it will appear in the executed contract</div>
            <div className="clm-force-ink" style={{ color: "#201e1d" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
                Signed for and on behalf of {entity}
              </div>
              <dl className="clm-sigblock-rows">
                <dt>Signature</dt>
                <dd>
                  <div className="clm-sig-mark">{name}</div>
                  <div className="clm-sig-caption">Signed electronically</div>
                </dd>
                <dt>Name</dt><dd>{name}</dd>
                <dt>Title</dt><dd>{title || "Authorised signatory"}</dd>
                <dt>Date</dt><dd>{stamp}</dd>
                <dt>Method</dt><dd>Typed electronic signature</dd>
              </dl>
            </div>
          </div>
        )}

        {mismatch && (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "#fdf1da",
            border: "1px solid #f5dfa8", color: "#7a4a05", padding: 10, fontSize: 12, lineHeight: 1.55 }}>
            <AlertTriangle size={15} style={{ flex: "none", marginTop: 1 }} />
            <span>
              The envelope names <strong>{expectedName}</strong> as this signer. You have typed a different name.
              That is allowed (people sign under a fuller or different form of their name) and it is recorded as
              typed, alongside who the envelope was addressed to.
            </span>
          </div>
        )}

        <div style={{ display: "grid", gap: 8 }}>
          <label style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 12.5, cursor: "pointer", lineHeight: 1.55 }}>
            <input type="checkbox" checked={intent} onChange={(e) => setIntent(e.target.checked)} style={{ marginTop: 3 }} />
            <span>
              I intend the name I have typed to be my signature, and I agree that an electronic signature has the same
              legal effect as a signature in manuscript.
            </span>
          </label>
          <label style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 12.5, cursor: "pointer", lineHeight: 1.55 }}>
            <input type="checkbox" checked={authority} onChange={(e) => setAuthority(e.target.checked)} style={{ marginTop: 3 }} />
            <span>I am authorised to enter into this agreement on behalf of <strong>{entity}</strong>.</span>
          </label>
        </div>

        {problems.length > 0 && (
          <div style={{ fontSize: 11.5, opacity: 0.7, lineHeight: 1.6 }}>
            {problems.map((p, i) => <div key={i}>· {p}</div>)}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
          <Tag c={GRAY} style={{ fontSize: 10.5, marginRight: "auto", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <ShieldCheck size={11} />Recorded with a timestamp in the audit trail
          </Tag>
          <Btn onClick={onClose} variant="secondary">Cancel</Btn>
          <Btn
            icon={PenLine} variant="primary" disabled={problems.length > 0}
            onClick={() => {
              onSign({
                name, title: title.trim() || "Authorised signatory",
                date: stamp, method: "Typed electronic signature",
                addressedTo: expectedName, mismatch,
              });
              setTypedName(""); setIntent(false); setAuthority(false);
            }}
          >Sign as {name || "…"}</Btn>
        </div>
      </div>
    </div>
  );
}
