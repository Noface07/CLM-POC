import { CLAUSE_BY_CODE } from "../data/catalogue.js";
import { contextBlock, silentlyAffected } from "./crossref.js";

export const PROVIDER_DEFAULTS = {
  anthropic: { model: "claude-sonnet-5", label: "Anthropic (direct)", keyHint: "sk-ant-…" },
  openrouter: { model: "anthropic/claude-sonnet-4", label: "OpenRouter", keyHint: "sk-or-v1-…" },
  gemini: { model: "gemini-2.5-flash", label: "Google Gemini", keyHint: "AIza…" },
};

export async function callLiveAI(provider, apiKey, model, prompt) {
  let raw = "";
  if (provider === "anthropic") {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json", "x-api-key": apiKey,
        "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({ model, max_tokens: 2000, messages: [{ role: "user", content: prompt }] }),
    });
    if (!response.ok) throw new Error(`Anthropic API error ${response.status}: ${(await response.text().catch(() => "")).slice(0, 200)}`);
    const data = await response.json();
    raw = (data.content || []).find((b) => b.type === "text")?.text || "";
  } else if (provider === "openrouter") {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "X-Title": "FM Supplier CLM Demo" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
    });
    if (!response.ok) throw new Error(`OpenRouter API error ${response.status}: ${(await response.text().catch(() => "")).slice(0, 200)}`);
    const data = await response.json();
    raw = data.choices?.[0]?.message?.content || "";
  } else if (provider === "gemini") {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!response.ok) throw new Error(`Gemini API error ${response.status}: ${(await response.text().catch(() => "")).slice(0, 200)}`);
    const data = await response.json();
    raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  return JSON.parse(cleaned);
}

function playbookExtract(codes) {
  return codes
    .map((code) => CLAUSE_BY_CODE[code])
    .filter(Boolean)
    .map((c) => [
      `${c.clauseRef} ${c.name} (approving role: ${c.approvingRole}; escalation: ${c.escalateTo})`,
      `  standard:  ${c.standard}`,
      `  fallback:  ${c.fallback}`,
      `  walk away: ${c.walkAway}`,
      c.redFlags?.length ? `  red flags: ${c.redFlags.join(" | ")}` : "",
    ].filter(Boolean).join("\n"))
    .join("\n\n");
}

export function buildChangePrompt(changes, graph) {
  const codes = [...new Set(changes.map((c) => c.playbookCode).filter(Boolean))];
  const diffs = changes.map((c) => {
    const context = graph ? contextBlock(graph, c.clauseRef) : "";
    const head = `CLAUSE ${c.clauseRef} ${c.clauseHeading || ""}`;
    const body = [
      head,
      "OUR WORDING:",
      `"""${c.previous}"""`,
      "SUPPLIER PROPOSED:",
      `"""${c.proposed}"""`,
    ].join("\n");
    if (!context) return body;
    return `${body}\nCROSS-REFERENCED CLAUSES (unchanged text, but read them before judging this change):\n${context}`;
  }).join("\n\n");

  const silent = graph ? silentlyAffected(graph, changes.map((c) => c.clauseRef)) : [];
  const silentBlock = silent.length
    ? [
        "",
        "CLAUSES WHOSE MEANING MAY HAVE MOVED WITHOUT THEIR TEXT CHANGING. Each of these points at a",
        "clause that was edited. Name the consequence in the impact sentence of the change that caused it:",
        ...silent.map((s) => `  ${s.ref} ${s.heading}, depends on ${s.because.join(", ")}`),
        "",
      ].join("\n")
    : "";

  return `You are reviewing tracked changes returned by a supplier on a Facilities Management contract.

THE CLAUSE PLAYBOOK for the clauses in scope. Place each change against these bands. Do not
invent your own severity scale, and do not treat "differs from standard" as automatically serious:

${playbookExtract(codes)}
${silentBlock}
THE TRACKED CHANGES:

${diffs}

Respond with ONLY a raw JSON array (no markdown fences, no commentary). One object per change, each with exactly:
"clause" (the clause number and name as given above),
"previous" (one short sentence describing our position),
"proposed" (one short sentence describing theirs),
"materiality" (High if past the walk-away line or a red flag is present; Medium if inside the fallback band on a
  significant clause; Low or Informational if at or better than standard),
"changeType" (one of Payment, Liability/Risk, Termination, SLA/Performance, Insurance/Risk, Administrative, Other),
"confidence" (High, Medium, or Low),
"impact" (one short plain-language sentence naming where in the band it lands and who may approve it).
Keep every field concise.`;
}

export function buildObligationPrompt(sourceText) {
  return `You are extracting ongoing obligations from the FULL text of an executed Facilities Management services contract for a Contract Lifecycle Management system.

Obligations may appear anywhere in the document, not only in a schedule or appendix. Scan every clause, including the main body, for recurring duties (insurance renewal, certifications, SLA reporting, service reviews, compliance submissions, audit cooperation, preventive maintenance, reporting cadence, obligations arising on termination, etc.), owed by either party, not only the Supplier.

IMPORTANT. Avoid duplicates: where a main-body clause refers to a schedule that carries the detail, produce ONE obligation and reference both, rather than one row per location.

FULL EXECUTED CONTRACT TEXT:
"""
${sourceText}
"""

Respond with ONLY a raw JSON array (no markdown fences, no commentary). One object per obligation, each with exactly these fields:
"id" (short id like OBL-3.1 using the clause number), "clause" (clause/section reference, combine both references if merged, e.g. "6.2 / Schedule 3.2"), "name" (short description),
"responsible" (who owes it: Supplier, Client, Either Party, or Both Parties, exactly as the clause states, never default to Supplier), "notify" (recipient/role named in the clause, or empty string if none, never invent one),
"frequency" (e.g. Annually, Quarterly, Monthly, One-time), "due" (due date/trigger as stated, or "-" if not specified, never invent one),
"evidence" (what confirms compliance), "consequence" (what happens if missed, per the clause or reasonable inference, leave empty if the clause states none rather than inventing one),
"confidence" (High, Medium, or Low, calibrate genuinely: High only for obligations with an explicit, unambiguous deadline and trigger; Medium or Low where the clause is qualitative, open-ended, or requires interpretation. Do not default every row to High).
List every distinct obligation found across the whole document, with no duplicates.

DO NOT pad the list. A duty that names no owner, no date and no consequence produces a reminder
nobody can act on, and a schedule full of those is one nobody reads. Where the clause genuinely
states no deadline or no consequence, return the field empty. The receiving system sorts trackable
obligations from standing duties on exactly those fields, and an invented deadline defeats it.
Keep every field concise.`;
}

export const MOCK_OBLIGATIONS = [
  { id: "OBL-11.1", clause: "11.1", name: "Renew and evidence public, employer's and professional insurance", responsible: "Supplier", notify: "Contract Manager", frequency: "Annually", due: "On each policy anniversary", evidence: "Certificates of currency", consequence: "Lapsed cover breaches clause 11.1 and may be treated as a material breach.", confidence: "High" },
  { id: "OBL-6.3", clause: "6.3", name: "Report performance against the service levels", responsible: "Supplier", notify: "Client's Facilities Manager", frequency: "Monthly", due: "Within 10 business days of month end", evidence: "Performance report against the KPI schedule", consequence: "An unreported month is treated as unverified performance; service credits may default to the cap.", confidence: "High" },
  { id: "OBL-12.1", clause: "12.1", name: "Notify the Client of any personal data breach", responsible: "Supplier", notify: "Client (controller)", frequency: "On occurrence", due: "Within 24 hours of becoming aware", evidence: "Written breach notification", consequence: "Late notice consumes the Client's own 72-hour regulator deadline and is a statutory exposure.", confidence: "High" },
  { id: "OBL-13.1", clause: "13.1", name: "Produce statutory compliance records on request", responsible: "Supplier", notify: "", frequency: "As requested", due: "Within 5 business days of request", evidence: "Compliance records, retained 6 years", consequence: "Absent records leave the Client unable to evidence statutory compliance to an inspector, a criminal exposure for its officers.", confidence: "High" },
  { id: "OBL-9.1", clause: "9.1", name: "Give notice of termination for convenience", responsible: "Either Party", notify: "The other party", frequency: "One-time (on termination)", due: "Per the notice period in clause 9.1", evidence: "Written notice", consequence: "Short notice does not shorten the period: the other party may claim the shortfall.", confidence: "High" },
  { id: "OBL-9.3", clause: "9.3", name: "Provide transition assistance and hand back asset and compliance data", responsible: "Supplier", notify: "", frequency: "One-time (on exit)", due: "For the assistance period in clause 9.3", evidence: "Transition plan, asset register, maintenance history, access credentials", consequence: "Without the data handover the Client cannot mobilise a replacement supplier.", confidence: "Medium" },
  { id: "OBL-10.2", clause: "10.2", name: "Obtain consent before subcontracting any part of the Services", responsible: "Supplier", notify: "Client", frequency: "As required", due: "Before subcontracting", evidence: "Written consent", consequence: "Unconsented subcontracting removes the vetting that statutory work depends on.", confidence: "Medium" },

  { id: "OBL-13.2", clause: "13.1", name: "Comply with all applicable health and safety legislation", responsible: "Supplier", notify: "", frequency: "Continuous", due: "-", evidence: "-", consequence: "Statutory non-compliance.", confidence: "High" },
  { id: "OBL-1.2", clause: "1.2", name: "Interpret schedules as part of this Agreement", responsible: "Both Parties", notify: "", frequency: "Continuous", due: "-", evidence: "-", consequence: "-", confidence: "Low" },
  { id: "OBL-2.3", clause: "2.3", name: "Attend operational and commercial review meetings", responsible: "Both Parties", notify: "", frequency: "As required", due: "-", evidence: "Minutes", consequence: "-", confidence: "Medium" },
  { id: "OBL-8.1", clause: "8.1", name: "Keep the other party's confidential information confidential", responsible: "Both Parties", notify: "", frequency: "Continuous", due: "-", evidence: "-", consequence: "Breach of clause 8.1.", confidence: "High" },
];
