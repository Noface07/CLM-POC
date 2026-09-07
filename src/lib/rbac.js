import { CONTRACT_OWNER } from "../data/contracts.js";

export const ROLES = [
  "All Access (Demo Control)",
  "Contract Owner",
  "Contract Manager",
  "Legal",
  "Finance / Commercial Approver",
  "Procurement / Supplier Manager",
  "Business Requestor",
  "Auditor (read-only)",
  "System Administrator",
];

export const ROLE_DESCRIPTIONS = {
  "All Access (Demo Control)": "Every contract and every action. Present so the demo can be driven end to end by one person. It is not a product role.",
  "Contract Owner": "Contracts they own. Approves at the owner step and drives the contract through its lifecycle.",
  "Contract Manager": "Contracts routed to contract management. Owns lifecycle actions, obligation validation and SLA exceptions.",
  "Legal": "Contracts routed to Legal, plus every high-risk agreement type whether routed or not. Approves liability, indemnity, data protection and governing law positions.",
  "Finance / Commercial Approver": "Contracts routed to Finance. Approves payment terms, indexation and change-control pricing.",
  "Procurement / Supplier Manager": "Contracts routed to procurement. Approves subcontracting and supplier-side changes.",
  "Business Requestor": "The contracts they requested, read-only. Can track status and can action nothing.",
  "Auditor (read-only)": "Every contract, read-only, including the audit trail. Can action nothing at all, which is what makes the trail worth anything.",
  "System Administrator": "Templates, playbook, approval matrices and catalogue. Deliberately not individual contracts.",
};

export const ALL_ACCESS_ROLE = "All Access (Demo Control)";
const ALL_ACCESS = ALL_ACCESS_ROLE;

export const QUEUES = {
  legal: "Legal",
  finance: "Finance / Commercial Approver",
  procurement: "Procurement / Supplier Manager",
  contract_management: "Contract Manager",
};

const ROLE_QUEUE = {
  Legal: "legal",
  "Finance / Commercial Approver": "finance",
  "Procurement / Supplier Manager": "procurement",
  "Contract Manager": "contract_management",
};

export function seesEveryContract(role) {
  return role === ALL_ACCESS || role === "Auditor (read-only)" || role === "System Administrator";
}

export function contractVisibility(role, contract) {
  if (seesEveryContract(role)) {
    return { visible: true, why: role === "Auditor (read-only)" ? "Auditor: sees every contract, read-only" : "Full access" };
  }

  const routedTo = contract.routedTo || [];

  if (role === "Contract Owner") {
    if (contract.owner === CONTRACT_OWNER || contract.ownedByCurrentUser) return { visible: true, why: "You are the contract owner" };
    return { visible: false, why: "Owned by another contract owner" };
  }
  if (role === "Business Requestor") {
    if (contract.requestedBy === "R. Ashworth" || contract.requestedByCurrentUser) {
      return { visible: true, why: "You raised this request, read-only" };
    }
    return { visible: false, why: "Raised by another requestor" };
  }

  if (role === "Legal" && contract.riskLevel === "high") {
    return {
      visible: true,
      why: routedTo.includes("legal") ? "Routed to Legal" : "High-risk agreement type: Legal has standing visibility",
    };
  }

  const queue = ROLE_QUEUE[role];
  if (queue && routedTo.includes(queue)) return { visible: true, why: `Routed to ${QUEUES[queue]}` };

  return { visible: false, why: `Not routed to ${role}` };
}

export function visibleContracts(role, contracts) {
  return contracts.filter((c) => contractVisibility(role, c).visible);
}

const READ_ONLY_ROLES = ["Business Requestor", "Auditor (read-only)"];

export function isReadOnly(role) {
  return READ_ONLY_ROLES.includes(role);
}

// Reviewer steps in the internal review, keyed as the workspace keys them.
export function roleCanActOnReviewer(role, key) {
  if (role === ALL_ACCESS) return true;
  if (isReadOnly(role)) return false;
  if (role === "Contract Owner") return key === "owner";
  if (role === "Contract Manager") return key === "procurement";
  if (role === "Legal") return key === "legal";
  return false;
}

export function roleCanActOnException(role, changeType, changeTypeRoute) {
  if (role === ALL_ACCESS) return true;
  if (isReadOnly(role)) return false;
  const route = changeTypeRoute[changeType] || "";
  if (role === "Legal") return route.includes("Legal");
  if (role === "Finance / Commercial Approver") return route.includes("Finance");
  if (role === "Procurement / Supplier Manager") return route.includes("Procurement");
  if (role === "Contract Manager") return route.includes("Contract Manager");
  return false;
}

export function canManageLifecycle(role) {
  return role === ALL_ACCESS || role === "Contract Manager";
}

export function canCreateContract(role) {
  return [ALL_ACCESS, "Contract Owner", "Contract Manager", "Legal",
    "Procurement / Supplier Manager", "Business Requestor"].includes(role);
}

// A Business Requestor raises the request; they do not draft the paper.
export function canDraft(role) {
  return [ALL_ACCESS, "Contract Owner", "Contract Manager", "Legal", "Procurement / Supplier Manager"].includes(role);
}

export function canSign(role) {
  return [ALL_ACCESS, "Contract Owner", "Contract Manager"].includes(role);
}

export function canConfigure(role) {
  return role === ALL_ACCESS || role === "System Administrator";
}

export function canReadPlaybook() {
  return true;
}

export function visiblePages(role) {
  if (role === "System Administrator") return ["dashboard", "admin"];
  return ["dashboard", "contracts", "workspace", "obligations"];
}
