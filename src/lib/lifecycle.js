// The lifecycle state machine.
//
// These two functions decide what the contract is and what the review is, and every
// banner, gate and status chip in the app is derived from them. They lived in App.jsx,
// where the selftest could not reach them without pulling in React, so the most important
// logic in the product was the only logic with no tests. A stale "internal review
// restarted" banner that reappeared the moment an exception was raised is what that cost.

export function computeApprovalStatus(approvals, exists, aiChange, undecided, blocked) {
  if (!exists) return "Not Started";
  const vals = Object.values(approvals).map((a) => a.status);
  if (vals.includes("rejected")) return "Rejected";
  if (vals.includes("changes")) return "Changes Requested";
  if (aiChange && (undecided > 0 || blocked > 0)) return "Exception Approval Required";
  if (vals.every((v) => v === "approved")) return "Approved";
  return "In Progress";
}

export function computeContractStatus(ctx) {
  const {
    exists, terminationState, envelopeStatus, renewalTaskCreated, amendmentCreated, amendmentExecuted,
    expiryStage, aiChange, undecided, blocked, redlineReceived, sentToSupplier, approvalStatus,
    readyForSignature, envelope, anyReviewerActed,
  } = ctx;
  if (!exists) return "Draft";
  if (terminationState === "terminated") return "Terminated";
  if (terminationState === "in_progress") return "Termination in Progress";
  if (envelopeStatus === "COMPLETED") {
    if (expiryStage === "expired") return "Expired";
    if (renewalTaskCreated) return "Renewal in Progress";
    if (amendmentCreated && !amendmentExecuted) return "Amendment in Progress";
    if (expiryStage === "reminders") return "Expiring";
    return "Active";
  }
  if (["REJECTED", "CANCELLED"].includes(envelopeStatus)) return "In Negotiation";
  if (envelopeStatus === "PENDING") return "Signature Pending";
  if (readyForSignature && !envelope) return "Ready for Signature";
  if (aiChange && (undecided > 0 || blocked > 0)) return "Exception Review";
  if (redlineReceived || sentToSupplier) return "In Negotiation";
  if (approvalStatus === "Approved") return "Approved";
  if (anyReviewerActed) return "Internal Review";
  return "Draft";
}

// Whether the reviewers still have to look at this again.
//
// Not the same question as "is the review complete". Once a redline is back, the approval
// status turns to Exception Approval Required for a reason that has nothing to do with the
// reviewers, and a banner keyed on completeness reappears telling three people who have
// already approved to approve again. This asks the question the banner is actually asking.
export function reviewNeedsReapproval(invalidated, approvals) {
  if (!invalidated) return false;
  return !Object.values(approvals || {}).every((a) => a.status === "approved");
}

// An invalidation ends when the reviewers have done what it asked for.
export function invalidationSatisfied(approvals) {
  const vals = Object.values(approvals || {});
  return vals.length > 0 && vals.every((a) => a.status === "approved");
}
