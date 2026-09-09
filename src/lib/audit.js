// The audit trail.
//
// An audit trail answers one question: who did what, to which contract, when. A line of
// prose with a clock time against it answers only the middle third, and answers it in
// whatever format the reader's browser happens to render — "09 Sep 14:32" has no year,
// does not sort, and is a different string in a different locale. That is a log. It
// becomes a trail when each entry carries its actor and its subject, and when the time
// on it is an instant rather than a rendering of one.
//
// So an entry stores an ISO instant and formats it at render, and every entry names the
// role that took the action and the contract it was taken against.
//
// Who the actor is, honestly.
//
// The demo knows the names of the people behind three of its roles, because they are in
// the contract data: the owner, the contract manager and legal counsel are named on the
// paper. For the rest it knows the role and nothing more, and it says the role rather
// than inventing somebody to blame. "All Access" is not a product role at all; an entry
// attributed to it should say so, because an action taken under a demo control that can
// do anything is exactly the entry an auditor needs to see flagged.

import { CONTRACT_OWNER, REVIEWERS } from "../data/contracts.js";
import { ALL_ACCESS_ROLE } from "./rbac.js";

const NAMED = {
  "Contract Owner": CONTRACT_OWNER,
  "Contract Manager": REVIEWERS.find((r) => r.key === "procurement")?.name || null,
  "Legal": REVIEWERS.find((r) => r.key === "legal")?.name || null,
  "Business Requestor": "R. Ashworth",
};

export function actorFor(role) {
  return NAMED[role] || null;
}

/**
 * One audit entry.
 *
 * @param {object} input
 * @param {string} input.event       what happened, in the past tense
 * @param {string} input.role        the role the action was taken under
 * @param {string} [input.contractId]
 * @param {string} [input.at]        ISO instant; defaults to now
 */
export function makeEntry({ event, role, contractId, at }) {
  return {
    at: at || new Date().toISOString(),
    role: role || "Unknown",
    actor: actorFor(role),
    demoControl: role === ALL_ACCESS_ROLE,
    contractId: contractId || null,
    event: String(event ?? ""),
  };
}

// What to show in the actor column: the person where one is known, the role otherwise.
export function actorLabel(entry) {
  if (!entry) return "-";
  if (entry.actor) return `${entry.actor} (${entry.role})`;
  return entry.role || "Unknown";
}

export function formatAuditTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return String(iso ?? "-");
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// Newest first, without mutating the caller's array. Sorting on the ISO instant is why
// it is stored as one: the display string sorts alphabetically and puts April first.
export function newestFirst(entries) {
  return [...(entries || [])].sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

// Some actions genuinely precede any contract: opening initiation from Salesforce, for
// one. They are part of the trail and they are not part of a contract's trail, so they
// are labelled rather than shown as a missing value. "-" reads as data we failed to
// record; this reads as what it is.
export const UNSCOPED = "Estate-level";

export function contractLabel(entry) {
  return entry?.contractId || UNSCOPED;
}

/**
 * One contract's trail.
 *
 * The workspace panel is inside a contract, so it shows that contract's events and not
 * the estate's. An estate-level event is not that contract's event either: it happened
 * before any contract existed, and including it here would attribute it to this one.
 */
export function forContract(entries, contractId) {
  return (entries || []).filter((e) => e.contractId === contractId);
}

export function filterEntries(entries, { role = "All", contractId = "All", query = "" } = {}) {
  const q = query.trim().toLowerCase();
  return (entries || []).filter((e) =>
    (role === "All" || e.role === role)
    && (contractId === "All" || contractLabel(e) === contractId)
    && (!q || `${e.event} ${e.role} ${e.actor || ""} ${contractLabel(e)}`.toLowerCase().includes(q))
  );
}

export function rolesIn(entries) {
  return [...new Set((entries || []).map((e) => e.role).filter(Boolean))].sort();
}

// Contract ids present, with the estate-level bucket last if anything is in it: it is not
// a contract, so it does not belong in the alphabetical run of contract numbers.
export function contractsIn(entries) {
  const ids = [...new Set((entries || []).map((e) => e.contractId).filter(Boolean))].sort();
  const hasUnscoped = (entries || []).some((e) => !e.contractId);
  return hasUnscoped ? [...ids, UNSCOPED] : ids;
}

// RFC 4180. A field carrying a comma, a quote or a newline is quoted and its quotes
// doubled; an event sentence contains all three often enough that not doing this
// produces a file that opens misaligned and is then trusted anyway.
function csvField(value) {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const AUDIT_CSV_HEADER = ["Timestamp (ISO)", "Actor", "Role", "Demo control", "Contract", "Event"];

export function auditToCsv(entries) {
  const rows = newestFirst(entries).map((e) => [
    e.at, e.actor || "", e.role, e.demoControl ? "yes" : "no", contractLabel(e), e.event,
  ]);
  return [AUDIT_CSV_HEADER, ...rows].map((r) => r.map(csvField).join(",")).join("\r\n");
}

export function auditCsvBlob(entries) {
  // The BOM is what makes Excel read it as UTF-8 rather than the system codepage.
  return new Blob(["\ufeff", auditToCsv(entries)], { type: "text/csv;charset=utf-8" });
}
