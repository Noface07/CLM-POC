// Approving a counter-proposal before it leaves the building.
//
// Deciding the supplier's tracked changes is governed: each one is placed in its band and
// routed to the role that may approve that position. Authoring our own wording on their
// redline was not. It is not a decision on their proposal, it is a new position we are
// asserting, and it went back to them over a button gated on nothing but "not read-only".
//
// That is the same failure the draft rule exists to prevent, one round later. Legal
// approves clause 7.2 in v1.0; the contract manager rewrites 7.2 on the redline; it goes
// out as our position with Legal never having seen the words.
//
// Resetting the whole internal review would be the wrong answer: it clears approvals on
// eighteen clauses because one moved, on a document whose gate is already the exception
// matrix. The proportionate answer is the one the playbook already knows how to give.
// Our counter is placed in the band exactly as theirs would be, and the role that may
// approve that position has to say so before it is sent.
//
// A counter at or better than our standard position needs nobody: there is no exception
// to approve, and requiring a signature for proposing our own standard wording is how
// approval steps become things people click through without reading.

import { assessFinding } from "./playbook.js";
import { ALL_ACCESS_ROLE, isReadOnly } from "./rbac.js";

// Escalation roles are not seats anybody logs in as. The desk that owns the escalation
// records it, which is how the exception matrix already handles the same problem.
const ESCALATION_DESK = {
  "Head of Legal": "Legal",
  "Head of Finance": "Finance / Commercial Approver",
  "Director of Contract Management": "Contract Manager",
};

/**
 * What each unsent counter needs before it can be sent.
 *
 * @param {Array} changes    unsent changes authored by us
 * @param {object} approvals { [changeId]: { by, role, at } }
 * @returns rows of { change, assessment, requiredRole, recordedBy, needsApproval, approved }
 */
export function counterApprovalRows(changes, approvals = {}) {
  return (changes || []).map((change) => {
    const assessment = assessFinding({
      clause: `${change.clauseRef} ${change.clauseHeading || ""}`.trim(),
      clauseRef: change.clauseRef,
      playbookCode: change.playbookCode,
      previous: change.previous,
      proposed: change.proposed,
    });
    const requiredRole = assessment?.mayApprove || null;
    const approval = approvals[change.id] || null;
    return {
      change,
      assessment,
      requiredRole,
      recordedBy: ESCALATION_DESK[requiredRole] || requiredRole,
      escalated: Boolean(ESCALATION_DESK[requiredRole]),
      needsApproval: Boolean(requiredRole),
      approval,
      approved: !requiredRole || Boolean(approval),
    };
  });
}

export function counterReady(rows) {
  return (rows || []).every((r) => r.approved);
}

export function outstandingCounters(rows) {
  return (rows || []).filter((r) => !r.approved);
}

/** Whether the role currently being used may record this row's approval. */
export function canApproveCounter(role, row) {
  if (!row?.needsApproval || row.approved) return false;
  if (role === ALL_ACCESS_ROLE) return true;
  if (isReadOnly(role)) return false;
  return role === row.recordedBy;
}

// One line saying what is holding the counter up, for the workspace to show without
// making the reader count rows.
export function counterBlockedReason(rows) {
  const waiting = outstandingCounters(rows);
  if (!waiting.length) return null;
  const roles = [...new Set(waiting.map((r) => r.recordedBy).filter(Boolean))];
  const clauses = waiting.map((r) => r.change.clauseRef).join(", ");
  return `Clause ${clauses} ${waiting.length === 1 ? "needs" : "need"} approval from ${roles.join(" and ")} before this goes back.`;
}
