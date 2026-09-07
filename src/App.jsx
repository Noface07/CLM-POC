import { useState, useMemo, useEffect, useRef } from "react";
import {
  RotateCcw, Bell, KeyRound, UserCog, X, Plus, BookOpen, ShieldCheck,
} from "lucide-react";

import { PDF_EXECUTED_B64 } from "./data/pdfs.js";
import {
  SUPPLIER, CLIENT_ENTITY, PORTFOLIO, REVIEWERS, CONTRACT_ID, CONTRACT_OWNER,
  DEFAULT_APPROVAL_MATRIX, routeMapFrom, escalationFrom, mustEscalate, formatMoney,
} from "./data/contracts.js";
import { AGREEMENT_TYPE_BY_CODE, TEMPLATE_BY_CODE } from "./data/catalogue.js";
import { buildDraft } from "./data/templates.js";
import { SALESFORCE_DEFAULTS, pushMilestone } from "./lib/salesforce.js";

import {
  ROLES, ROLE_DESCRIPTIONS, ALL_ACCESS_ROLE, contractVisibility, visibleContracts, isReadOnly,
  roleCanActOnReviewer, roleCanActOnException, canManageLifecycle as canManageLifecycleFor,
  canCreateContract, canDraft as canDraftFor, canSign as canSignFor,
} from "./lib/rbac.js";
import {
  applyRedline, resolveChanges, deriveFindings, pendingChangeCount,
  applySupplierRevision, SUPPLIER_REDLINE_EDITS, SUPPLIER_REVISION_EDITS,
} from "./lib/redline.js";
import { buildReferenceGraph, contextFor, silentlyAffected } from "./lib/crossref.js";
import { importDocx } from "./lib/docx-import.js";
import { assessFinding } from "./lib/playbook.js";
import { partitionObligations } from "./lib/obligations.js";
import { buildPdf, downloadPdf, extractPdfTextFromBlob, extractPdfText } from "./lib/pdf.js";
import { PROVIDER_DEFAULTS, callLiveAI, buildChangePrompt, buildObligationPrompt, MOCK_OBLIGATIONS } from "./lib/ai.js";
import {
  DEFAULT_CONFIG as DOCUMENSO_DEFAULTS, sendForSignature, simulateEnvelope, getEnvelope, certificateUrl,
} from "./lib/documenso.js";
import { downloadBlob } from "./lib/zip.js";
import {
  Tag, Btn, Field, statusColor, GREEN, AMBER, RED, GRAY, kicker,
  delay, shortId, stampNow, formatDate,
} from "./lib/ui.jsx";

import DashboardPage from "./components/DashboardPage.jsx";
import ContractsPage from "./components/ContractsPage.jsx";
import DraftStudio from "./components/DraftStudio.jsx";
import WorkspacePage from "./components/WorkspacePage.jsx";
import ObligationsPage from "./components/ObligationsPage.jsx";
import SignaturePage from "./components/SignaturePage.jsx";
import SupplierPortal from "./components/SupplierPortal.jsx";
import { PlaybookDrawer } from "./components/Playbook.jsx";
import SignCeremony from "./components/SignCeremony.jsx";
import ExceptionDialog from "./components/ExceptionDialog.jsx";
import ApprovalMatrix from "./components/ApprovalMatrix.jsx";
import SalesforcePanel from "./components/SalesforcePanel.jsx";
import PostExecution from "./components/PostExecution.jsx";

const TABS = [
  ["Dashboard", "dashboard"],
  ["Contracts", "contracts"],
  ["Contract workspace", "workspace"],
  ["Obligations", "obligations"],
];

const TERMINATION_TYPES = {
  "For Convenience": {
    clauseRef: "9.1",
    // Whatever the negotiated notice period ended up being.
    days: (values) => Number(values?.notice_period_days) || 90,
    clauseLabel: "clause 9.1 (termination for convenience)",
    basis: (d) => `${d} days per clause 9.1 (termination for convenience)`,
    cure: false,
    requiresGround: false,
    note: "No reason is required and none should be given. Stating one invites an argument about whether it is "
      + "made out. The supplier is entitled to payment for work performed and unavoidable committed costs, which "
      + "must be evidenced rather than asserted.",
  },
  "For Cause": {
    clauseRef: "9.2",
    // A cure window, not a notice period: the supplier is being asked to fix the breach.
    days: () => 30,
    clauseLabel: "clause 9.2 (termination for material breach)",
    basis: (d) => `${d}-day cure period per clause 9.2 (termination for material breach)`,
    cure: true,
    requiresGround: true,
    note: "Requires an evidenced material breach, set out in the notice. The supplier has the cure period to remedy "
      + "it; termination only takes effect if they do not, and the date below assumes they do not. No exit payment "
      + "is due, and the right to claim loss caused by the breach survives.",
  },
};

const MILESTONE_NOTE = {
  Draft: "Contract drafted from the approved template",
  "Internal Review": "Out for internal approval",
  Approved: "Internally approved",
  "In Negotiation": "Redline exchange with the counterparty",
  "Exception Review": "Playbook exceptions open with approvers",
  "Ready for Signature": "Cleared for e-signature",
  "Signature Pending": "Signature envelope issued",
  Active: "Executed and active, PO eligibility enabled",
  Expiring: "Inside the renewal window",
  "Amendment in Progress": "Amendment being negotiated",
  "Renewal in Progress": "Renewal being negotiated",
  "Termination in Progress": "Termination notice served",
  Terminated: "Terminated",
};

const PERSIST_KEY = "clm-demo-session-v1";

const SNAPSHOT = (() => {
  try {
    const raw = window.localStorage.getItem(PERSIST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
})();

function restored(key, fallback) {
  return SNAPSHOT && key in SNAPSHOT ? SNAPSHOT[key] : fallback;
}

function findingKey(finding, index) {
  return finding.changeId || finding.manualId || `f-${index}`;
}

const EMPTY_APPROVALS = {
  owner: { status: "pending", comment: "" },
  procurement: { status: "pending", comment: "" },
  legal: { status: "pending", comment: "" },
};

function computeApprovalStatus(approvals, exists, aiChange, undecided, blocked) {
  if (!exists) return "Not Started";
  const vals = Object.values(approvals).map((a) => a.status);
  if (vals.includes("rejected")) return "Rejected";
  if (vals.includes("changes")) return "Changes Requested";
  if (aiChange && (undecided > 0 || blocked > 0)) return "Exception Approval Required";
  if (vals.every((v) => v === "approved")) return "Approved";
  return "In Progress";
}

function computeContractStatus(ctx) {
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

export default function CLMApp() {
  const [page, setPage] = useState(() =>
    window.location.hash.startsWith("#supplier") ? "supplier" : "dashboard");
  const [currentRole, setCurrentRole] = useState("All Access (Demo Control)");
  const [playbook, setPlaybook] = useState({ open: false, focus: null });

  const [draftRecord, setDraftRecord] = useState(() => restored("draftRecord", null));
  const [draftDoc, setDraftDoc] = useState(() => restored("draftDoc", null));
  const [redlineDoc, setRedlineDoc] = useState(() => restored("redlineDoc", null));
  const [changeDecisions, setChangeDecisions] = useState(() => restored("changeDecisions", {}));
  const [docVersion, setDocVersion] = useState(() => restored("docVersion", "v1.0"));

  const [approvals, setApprovals] = useState(() => restored("approvals", EMPTY_APPROVALS));
  const [reviewActionKey, setReviewActionKey] = useState(null);
  const [reviewCommentDraft, setReviewCommentDraft] = useState("");

  const [sentToSupplier, setSentToSupplier] = useState(() => restored("sentToSupplier", false));
  const [aiChange, setAiChange] = useState(() => restored("aiChange", null));
  const [aiChangeLoading, setAiChangeLoading] = useState(false);
  const [changeRunMeta, setChangeRunMeta] = useState(null);
  const [exceptionDecisions, setExceptionDecisions] = useState(() => restored("exceptionDecisions", {}));
  const [exceptionModalKey, setExceptionModalKey] = useState(null);
  const [revisionSubmitted, setRevisionSubmitted] = useState({});
  const [approvalMatrix, setApprovalMatrix] = useState(() => restored("approvalMatrix", DEFAULT_APPROVAL_MATRIX));

  const [salesforceConfig, setSalesforceConfig] = useState(SALESFORCE_DEFAULTS);
  const [sfRecord, setSfRecord] = useState(() => restored("sfRecord", null));
  const [sfMilestones, setSfMilestones] = useState(() => restored("sfMilestones", []));
  const [sfContext, setSfContext] = useState(() => restored("sfContext", null));
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [redlineReopened, setRedlineReopened] = useState(() => restored("redlineReopened", false));
  const [declineReason, setDeclineReason] = useState(() => restored("declineReason", ""));
  const [showManualException, setShowManualException] = useState(false);
  const [manualExceptionDraft, setManualExceptionDraft] = useState({ clause: "", materiality: "Medium", changeType: "Other", impact: "" });
  const [extraHistory, setExtraHistory] = useState([]);

  const [documensoConfig, setDocumensoConfig] = useState(DOCUMENSO_DEFAULTS);
  const [envelope, setEnvelope] = useState(() => restored("envelope", null));
  const [envelopeSending, setEnvelopeSending] = useState(false);
  const [envelopeError, setEnvelopeError] = useState("");
  const [clientSigned, setClientSigned] = useState(() => restored("clientSigned", false));
  const [supplierViewed, setSupplierViewed] = useState(() => restored("supplierViewed", false));
  const [supplierSigned, setSupplierSigned] = useState(() => restored("supplierSigned", false));
  const [executedPdfBlob, setExecutedPdfBlob] = useState(null);
  const [signatures, setSignatures] = useState(() => restored("signatures", { client: null, supplier: null }));
  const [ceremony, setCeremony] = useState(null);   // "client" | "supplier" | null
  const [envelopeRecipients, setEnvelopeRecipients] = useState([
    { name: CLIENT_ENTITY.signatory, email: CLIENT_ENTITY.signatoryEmail, role: "SIGNER", party: "client", onBehalfOf: CLIENT_ENTITY.name },
    { name: SUPPLIER.signatoryName, email: SUPPLIER.signatoryEmail, role: "SIGNER", party: "supplier", onBehalfOf: SUPPLIER.name },
  ]);
  const [envelopeSubject, setEnvelopeSubject] = useState("");
  const [envelopeMessage, setEnvelopeMessage] = useState(
    "Please review and sign the attached agreement. The terms are as agreed in our negotiation; no further changes have been made."
  );

  const [accessToken] = useState(() => {
    const existing = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("t");
    return existing || `sup_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  });
  const [openedViaLink] = useState(() => window.location.hash.startsWith("#supplier"));
  const [linkExpiry] = useState(() =>
    new Date(Date.now() + 14 * 86400000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }));

  const [extractedText, setExtractedText] = useState(null);
  const [extractingPdf, setExtractingPdf] = useState(false);
  const [extractPdfError, setExtractPdfError] = useState("");
  const [aiObligations, setAiObligations] = useState(() => restored("aiObligations", null));
  const [obligationsLoading, setObligationsLoading] = useState(false);
  const [obligationRunMeta, setObligationRunMeta] = useState(null);
  const [validated, setValidated] = useState(() => restored("validated", {}));
  const [editingIndex, setEditingIndex] = useState(null);
  const [editDraft, setEditDraft] = useState({});

  const [amendment, setAmendment] = useState(() => restored("amendment", null));
  const [showAmendmentForm, setShowAmendmentForm] = useState(false);
  const [amendmentDraft, setAmendmentDraft] = useState({ reason: "", effectiveDate: "" });
  const [expiryStage, setExpiryStage] = useState(null);
  const [renewalTaskCreated, setRenewalTaskCreated] = useState(false);
  const [terminationState, setTerminationState] = useState(null);
  const [showTerminationForm, setShowTerminationForm] = useState(false);
  const [terminationDraft, setTerminationDraft] = useState({
    type: "For Convenience", effectiveDate: "", noticeBasis: "90 days per clause 9.1 (termination for convenience)",
    servedOn: "", ground: "",
  });
  const [closureTasks, setClosureTasks] = useState(() => restored("closureTasks", {}));

  const [notice, setNotice] = useState("");
  const [auditLog, setAuditLog] = useState(() => restored("auditLog", []));
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [extraContracts, setExtraContracts] = useState(() => restored("extraContracts", []));
  const [viewingContract, setViewingContract] = useState(null);
  const [showAddContract, setShowAddContract] = useState(false);
  const [newContract, setNewContract] = useState({ supplier: "", agreementTypeCode: "sow", category: "", evergreen: false });
  const [filters, setFilters] = useState({ status: "All", supplier: "All", category: "All", term: "All" });

  const [liveMode, setLiveMode] = useState(false);
  const [provider, setProvider] = useState("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(PROVIDER_DEFAULTS.anthropic.model);
  const [showApiPanel, setShowApiPanel] = useState(false);
  const [apiError, setApiError] = useState("");

  const contractExists = Boolean(draftRecord);
  const readOnly = isReadOnly(currentRole);
  const canManageLifecycle = canManageLifecycleFor(currentRole);

  const resolvedRedline = useMemo(
    () => (redlineDoc ? resolveChanges(redlineDoc, changeDecisions) : null),
    [redlineDoc, changeDecisions]
  );

  const MATERIALITY_RANK = { High: 0, Medium: 1, Low: 2 };
  const findings = (aiChange || [])
    .map((f, i) => ({ ...f, __index: findingKey(f, i) }))
    .sort((a, b) => (MATERIALITY_RANK[a.materiality] ?? 3) - (MATERIALITY_RANK[b.materiality] ?? 3));
  const exceptions = findings;

  const decidedCount = exceptions.filter((ex) => exceptionDecisions[ex.__index]).length;
  const terminalCount = exceptions.filter((ex) => {
    const d = exceptionDecisions[ex.__index];
    return d && (d.action === "Accept Exception" || d.action === "Reject");
  }).length;
  const blockedCount = decidedCount - terminalCount;
  const undecidedCount = exceptions.length - decidedCount;
  const pendingChanges = redlineDoc ? pendingChangeCount(redlineDoc, changeDecisions) : 0;
  const changeTypeRoute = routeMapFrom(approvalMatrix);
  const getEscalationApprover = (t) => escalationFrom(approvalMatrix, t);
  const contractValue = Number(draftRecord?.values?.contract_value) || 0;

  const anyReviewerActed = Object.values(approvals).some((a) => a.status !== "pending");
  const approvalStatus = computeApprovalStatus(approvals, contractExists, aiChange, undecidedCount, blockedCount);
  const reviewComplete = approvalStatus === "Approved";

  const negotiated = Boolean(redlineDoc);
  const readyForSignature = contractExists && sentToSupplier && (
    negotiated
      ? Boolean(aiChange) && terminalCount === exceptions.length && pendingChanges === 0
      : reviewComplete
  );
  const envelopeStatus = envelope
    ? (clientSigned && supplierSigned ? "COMPLETED" : envelope.status)
    : null;
  const signatureStatus = !envelope ? "Not Ready"
    : envelopeStatus === "COMPLETED" ? "Executed"
    : envelopeStatus === "REJECTED" ? "Declined"
    : envelopeStatus === "CANCELLED" ? "Cancelled"
    : (clientSigned || supplierSigned) ? "Partially Signed"
    : "Pending";

  const contractStatus = computeContractStatus({
    exists: contractExists, terminationState, envelopeStatus, renewalTaskCreated,
    amendmentCreated: Boolean(amendment),
    amendmentExecuted: amendment?.stage === "attached",
    expiryStage, aiChange, undecided: undecidedCount, blocked: blockedCount,
    redlineReceived: Boolean(redlineDoc), sentToSupplier, approvalStatus, readyForSignature,
    envelope, anyReviewerActed,
  });
  const contractIsLive = [
    "Executed", "Active", "Amendment in Progress", "Renewal in Progress", "Expiring",
    "Termination in Progress",
  ].includes(contractStatus);

  const liveContract = useMemo(() => {
    if (!draftRecord) return null;
    const type = AGREEMENT_TYPE_BY_CODE[draftRecord.agreementTypeCode];
    const routedTo = ["contract_management"];
    if (type?.riskLevel === "high") routedTo.push("legal");
    if ((aiChange || []).some((f) => f.changeType === "Payment")) routedTo.push("finance");
    return {
      id: draftRecord.id,
      supplier: draftRecord.values.supplier_name || SUPPLIER.name,
      agreementTypeCode: draftRecord.agreementTypeCode,
      agreementType: type?.name || draftRecord.agreementTypeCode,
      family: type?.family || "-",
      riskLevel: type?.riskLevel || "medium",
      status: contractStatus,
      value: Number(draftRecord.values.contract_value) || 0,
      currency: draftRecord.values.currency_code || "GBP",
      startDate: draftRecord.values.start_date,
      endDate: draftRecord.evergreen ? null : draftRecord.values.end_date,
      evergreen: draftRecord.evergreen,
      evergreenNote: draftRecord.evergreen ? "Drafted as evergreen: rolling term, terminate on notice." : undefined,
      category: draftRecord.values.service_category || SUPPLIER.serviceCategory,
      routedTo: [...new Set(routedTo)],
      owner: CONTRACT_OWNER,
      requestedBy: SUPPLIER.businessOwner,
      live: true,
      templateCode: draftRecord.templateCode,
    };
  }, [draftRecord, contractStatus, aiChange]);

  const allContracts = useMemo(
    () => [...(liveContract ? [liveContract] : []), ...extraContracts, ...PORTFOLIO],
    [liveContract, extraContracts]
  );
  const myContracts = useMemo(() => visibleContracts(currentRole, allContracts), [currentRole, allContracts]);
  const canSeeLive = Boolean(liveContract) && myContracts.some((c) => c.id === liveContract.id);

  const assessments = useMemo(() => {
    const out = {};
    (aiChange || []).forEach((f, i) => { out[findingKey(f, i)] = assessFinding(f); });
    return out;
  }, [aiChange]);
  const assessFor = (finding) => (finding ? assessments[finding.__index] ?? null : null);

  const referenceGraph = useMemo(() => (draftDoc ? buildReferenceGraph(draftDoc) : null), [draftDoc]);

  const silentClauses = useMemo(() => {
    if (!referenceGraph || !redlineDoc) return [];
    return silentlyAffected(referenceGraph, redlineDoc.changes.map((c) => c.clauseRef));
  }, [referenceGraph, redlineDoc]);

  const crossRefFor = (ref) => (referenceGraph && ref ? contextFor(referenceGraph, ref) : null);

  const trackedObligationCount = useMemo(
    () => partitionObligations(aiObligations).tracked.length,
    [aiObligations]
  );
  const commentsFor = (ref) => ((redlineDoc?.comments || []).filter((c) => c.anchor === ref));

  const makeExecutedDoc = (sigs) => {
    const base = resolvedRedline || draftDoc;
    if (!base) return { meta: {}, blocks: [] };
    const party = (side, entity) => {
      const sig = sigs[side];
      return {
        type: "signature",
        party: side === "client" ? "Client" : "Supplier",
        entity,
        signed: Boolean(sig),
        byName: sig?.name,
        title: sig?.title,
        date: sig?.date,
        method: sig?.method,
      };
    };
    return {
      ...base,
      meta: { ...base.meta, version: "v2.0", status: "Executed" },
      blocks: [
        ...base.blocks,
        { type: "heading", text: "EXECUTION" },
        { type: "clause", ref: "", heading: "", runs: [{ t: "text", text:
          "This Agreement is executed by electronic signature. Each party confirms that the name typed below is "
          + "intended as that party's signature and has the same effect as a signature in manuscript."
          + (envelope ? ` Signature envelope ${envelope.id}.` : "") }] },
        party("client", CLIENT_ENTITY.name),
        party("supplier", SUPPLIER.name),
      ],
    };
  };

  const executedDoc = useMemo(
    () => makeExecutedDoc(signatures),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolvedRedline, draftDoc, envelope, signatures]
  );

  const amendedDoc = useMemo(() => {
    if (amendment?.stage !== "attached") return null;
    return {
      ...executedDoc,
      meta: { ...executedDoc.meta, version: "v2.1", status: "Amended" },
      blocks: [
        ...executedDoc.blocks,
        { type: "heading", text: `AMENDMENT ${amendment.id}` },
        { type: "clause", ref: "", heading: "", runs: [{ t: "text", text:
          `This Amendment ${amendment.id} is made under clause 21.1 (Variation) of the Agreement and takes effect on `
          + `${formatDate(amendment.effectiveDate)}. Reason for amendment: ${amendment.reason}. `
          + "Except as varied by this Amendment, all terms of the Agreement remain in full force and effect. "
          + "In the event of conflict between this Amendment and the Agreement, this Amendment prevails." }] },
        { type: "clause", ref: "", heading: "", runs: [{ t: "text", text:
          `Executed as a separate instrument by both parties and attached to ${draftRecord?.id || CONTRACT_ID}. `
          + "The parent agreement version is now v2.1." }] },
      ],
    };
  }, [executedDoc, amendment, draftRecord]);

  const activeDoc = docVersion === "v1.1" ? redlineDoc
    : docVersion === "executed" ? executedDoc
    : docVersion === "v2.1" ? (amendedDoc || executedDoc)
    : draftDoc;

  const envelopePdfUrl = useMemo(() => {
    if (!draftRecord || !readyForSignature || envelope) return null;
    return URL.createObjectURL(buildPdf(executedDoc, { footer: `${draftRecord.id} - for signature` }));
  }, [draftRecord, readyForSignature, envelope, executedDoc]);

  useEffect(() => () => { if (envelopePdfUrl) URL.revokeObjectURL(envelopePdfUrl); }, [envelopePdfUrl]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PERSIST_KEY, JSON.stringify({
        draftRecord, draftDoc, redlineDoc, changeDecisions, approvals, aiChange,
        exceptionDecisions, envelope, aiObligations, validated, sentToSupplier,
        redlineReopened, declineReason, approvalMatrix, sfRecord, sfContext, sfMilestones, amendment,
        clientSigned, supplierViewed, supplierSigned, docVersion, auditLog, extraContracts, signatures,
        closureTasks,
      }));
    } catch {
      // Storage blocked or full. The session will not survive a reload, which is acceptable.
    }
  }, [draftRecord, draftDoc, redlineDoc, changeDecisions, approvals, aiChange,
      exceptionDecisions, envelope, aiObligations, validated, sentToSupplier,
      clientSigned, supplierViewed, supplierSigned, docVersion, auditLog, extraContracts, signatures,
      closureTasks, amendment]);

  const versions = [
    { key: "v1.0", label: "v1.0 Draft (Word)" },
    ...(redlineDoc ? [{ key: "v1.1", label: `${redlineDoc.meta?.version || "v1.1"} Redline (Word)` }] : []),
    ...(envelopeStatus === "COMPLETED" ? [{ key: "executed", label: "Executed (PDF)" }] : []),
    ...(amendedDoc ? [{ key: "v2.1", label: "v2.1 As amended (PDF)" }] : []),
  ];

  // The parent only moves when a signed amendment attaches to it.
  const parentVersion = amendment?.stage === "attached" ? "v2.1" : "v2.0";

  const versionHistory = [
    { v: "v0.1", label: `Preview generated from ${TEMPLATE_BY_CODE[draftRecord?.templateCode]?.name || "template"}`, format: "watermarked", show: contractExists },
    { v: "v1.0", label: `Draft created by ${CONTRACT_OWNER}`, format: ".docx", show: contractExists },
    { v: "v1.0", label: `Sent to ${SUPPLIER.name}`, format: ".docx", show: sentToSupplier },
    { v: "v1.1", label: `Redline received from ${SUPPLIER.name}`, format: ".docx, tracked changes", show: Boolean(redlineDoc) },
    ...extraHistory.map((h) => ({ ...h, show: true })),
    { v: "v2.0", label: "Executed by both parties", format: ".pdf", show: envelopeStatus === "COMPLETED" },
  ].filter((r) => r.show);

  const lastPushed = useRef(null);
  useEffect(() => {
    if (!sfRecord || !draftRecord || !contractStatus) return;
    if (lastPushed.current === contractStatus) return;
    lastPushed.current = contractStatus;
    syncToSalesforce(contractStatus, MILESTONE_NOTE[contractStatus] || "Lifecycle status changed");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractStatus, sfRecord, draftRecord]);

  function flash(msg) { setNotice(msg); setTimeout(() => setNotice(""), 3600); }
  function logAudit(label) { setAuditLog((log) => [...log, { time: stampNow(), label }]); }
  async function syncToSalesforce(status, milestone) {
    if (!sfRecord || !draftRecord) return;
    try {
      const stamp = await pushMilestone(salesforceConfig, sfRecord, {
        contractId: draftRecord.id, status, milestone,
      });
      setSfMilestones((m) => [...m, stamp]);
      logAudit(`Salesforce updated for ${sfRecord.Name}: ${status} (${milestone})`);
    } catch (err) {
      setSfMilestones((m) => [...m, {
        at: new Date().toISOString(), recordId: sfRecord.Id, recordName: sfRecord.Name,
        contractId: draftRecord.id, status, milestone: `${milestone}, PUSH FAILED: ${err.message}`,
        failed: true,
      }]);
      logAudit(`Salesforce update FAILED for ${status}: ${err.message}`);
    }
  }

  function notify(recipient, message) {
    setNotifications((n) => [...n, { id: shortId(), recipient, message, time: stampNow(), read: false }]);
  }
  function openPlaybook(focus) { setPlaybook({ open: true, focus: typeof focus === "string" ? focus : null }); }

  function resetDemo() {
    setPage("dashboard"); setCurrentRole("All Access (Demo Control)"); setPlaybook({ open: false, focus: null });
    setDraftRecord(null); setDraftDoc(null); setRedlineDoc(null); setChangeDecisions({}); setDocVersion("v1.0");
    setApprovals(EMPTY_APPROVALS); setReviewActionKey(null); setReviewCommentDraft("");
    setSentToSupplier(false); setAiChange(null); setAiChangeLoading(false); setChangeRunMeta(null);
    setExceptionDecisions({}); setExceptionModalKey(null); setRevisionSubmitted({});
    setShowManualException(false); setManualExceptionDraft({ clause: "", materiality: "Medium", changeType: "Other", impact: "" });
    setExtraHistory([]);
    setDocumensoConfig(DOCUMENSO_DEFAULTS); setEnvelope(null); setEnvelopeError(""); setEnvelopeSending(false);
    setClientSigned(false); setSupplierViewed(false); setSupplierSigned(false); setExecutedPdfBlob(null);
    setSignatures({ client: null, supplier: null }); setCeremony(null);
    setExtractedText(null); setExtractingPdf(false); setExtractPdfError("");
    setAiObligations(null); setObligationRunMeta(null); setValidated({}); setEditingIndex(null); setEditDraft({});
    setAmendment(null); setShowAmendmentForm(false); setRedlineReopened(false); setDeclineReason("");
    setSfRecord(null); setSfContext(null); setSfMilestones([]); lastPushed.current = null;
    setAmendmentDraft({ reason: "", effectiveDate: "" }); setExpiryStage(null); setRenewalTaskCreated(false);
    setTerminationState(null); setShowTerminationForm(false); setClosureTasks({});
    setTerminationDraft({ type: "For Convenience", effectiveDate: "", noticeBasis: "90 days per clause 9.1", servedOn: "" });
    setNotice(""); setAuditLog([]); setNotifications([]); setShowNotifications(false);
    setExtraContracts([]); setViewingContract(null); setShowAddContract(false);
    setFilters({ status: "All", supplier: "All", category: "All", term: "All" });
    setLiveMode(false); setApiKey(""); setApiError("");
    setEnvelopeRecipients([
      { name: CLIENT_ENTITY.signatory, email: CLIENT_ENTITY.signatoryEmail, role: "SIGNER", party: "client", onBehalfOf: CLIENT_ENTITY.name },
      { name: SUPPLIER.signatoryName, email: SUPPLIER.signatoryEmail, role: "SIGNER", party: "supplier", onBehalfOf: SUPPLIER.name },
    ]);
    setEnvelopeSubject("");
    try { window.localStorage.removeItem(PERSIST_KEY); } catch { /* nothing to clear */ }
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
  }

  function createContractFromSalesforce(record, context) {
    setSfRecord(record);
    setSfContext(context);
    setPage("draft");
    logAudit(
      `Contract initiation opened from Salesforce for supplier ${record.Name} `
      + `(${record.Supplier_Onboarding_Id__c || record.Id}), ${Object.keys(context).length} fields carried across`
    );
    flash(`Opened with ${record.Name}'s context from Salesforce.`);
  }

  function createDraft({ templateCode, agreementTypeCode, values, evergreen }) {
    const id = values.contract_number?.trim() || CONTRACT_ID;
    const merged = { ...values, contract_number: id };
    // Rebuilt at v1.0 so the stored document is the draft, not the watermarked preview.
    const doc = buildDraft(templateCode, merged, { evergreen, version: "v1.0", status: "Draft" });
    setDraftRecord({ id, templateCode, agreementTypeCode, values: merged, evergreen });
    setDraftDoc(doc);
    setDocVersion("v1.0");
    setPage("workspace");
    const template = TEMPLATE_BY_CODE[templateCode];
    logAudit(`Draft ${id} created from ${template?.name} (${evergreen ? "evergreen" : "fixed term"}) with ${doc.blocks.filter((b) => b.type === "clause").length} clauses assembled`);
    notify("Legal", `${id} drafted and routed for internal review`);
    flash(`Draft ${id} created. It is a Word document until it is signed.`);
  }

  function sendToSupplier() {
    setSentToSupplier(true);
    logAudit(`v1.0 sent to ${SUPPLIER.name} as a Word document for markup`);
    notify(SUPPLIER.name, `${draftRecord.id} draft shared for review`);
    flash("Sent to supplier.");
  }

  function receiveRedline() {
    if (!draftDoc) return;
    const doc = applyRedline(draftDoc, SUPPLIER_REDLINE_EDITS, {
      author: SUPPLIER.name, role: "Supplier", date: stampNow(),
    });
    supersedeEnvelope("the counterparty returned a further redline, so the signed text was superseded");
    setRedlineDoc(doc);
    setDocVersion("v1.1");
    if (redlineReopened) { setAiChange(null); setChangeDecisions({}); setExceptionDecisions({}); setRedlineReopened(false); }
    logAudit(`Redline received from ${SUPPLIER.name}: ${doc.changes.length} tracked changes, ${doc.comments.length} comments`);
    notify(CONTRACT_OWNER, `${draftRecord.id}: supplier returned ${doc.changes.length} tracked changes`);
    flash("Redline returned with tracked changes and comments.");
  }

  async function importRedline(file) {
    const imported = await importDocx(file);
    if (!imported.blocks.length) {
      throw new Error("That document has no readable paragraphs. If it was saved as .doc, save it as .docx and try again.");
    }
    if (!imported.changes.length && !imported.comments.length) {
      throw new Error(
        "That document came back with no tracked changes and no comments, so there is nothing to review. "
        + "If you edited it, Word had track changes switched off and recorded no revisions. Turn it on "
        + "(Review ▸ Track Changes), mark the document up again, and re-upload."
      );
    }
    const dated = {
      ...imported,
      meta: { ...imported.meta, version: "v1.1" },
      changes: imported.changes.map((c) => ({ ...c, date: c.date ? new Date(c.date).toLocaleString("en-GB") : stampNow() })),
    };
    supersedeEnvelope("the counterparty returned a further redline, so the signed text was superseded");
    setRedlineDoc(dated);
    setDocVersion("v1.1");
    setAiChange(null);
    setChangeDecisions({});
    setExceptionDecisions({});
    setRedlineReopened(false);

    const authors = [...new Set(dated.changes.map((c) => c.author))];
    logAudit(
      `Supplier document imported (${file.name}) with ${dated.changes.length} tracked changes, `
      + `${dated.comments.length} comments, parsed from OOXML`
    );
    notify(CONTRACT_OWNER, `${draftRecord?.id}: counterparty returned a marked-up document`);
    flash(`Imported ${dated.changes.length} tracked changes from ${file.name}.`);
    return {
      clauses: dated.blocks.filter((b) => b.type === "clause").length,
      changes: dated.changes.length,
      comments: dated.comments.length,
      authors,
      warnings: dated.warnings,
    };
  }

  async function runChangeIntelligence() {
    if (!redlineDoc) return;
    setAiChangeLoading(true); setApiError("");
    if (liveMode && apiKey) {
      try {
        const result = await callLiveAI(provider, apiKey, model, buildChangePrompt(redlineDoc.changes, referenceGraph));
        // Keep the changeId so a decision here still moves the tracked change in the doc.
        const withIds = result.map((f, i) => ({ ...f, changeId: redlineDoc.changes[i]?.id, clauseRef: redlineDoc.changes[i]?.clauseRef }));
        setAiChange(withIds);
        setChangeRunMeta({ description: `Analysed ${redlineDoc.changes.length} tracked changes against the clause playbook · ${model} via ${PROVIDER_DEFAULTS[provider].label} (live) · ${new Date().toLocaleString()} · Run ${shortId()}` });
        logAudit(`Change intelligence run (LIVE via ${PROVIDER_DEFAULTS[provider].label}) with ${withIds.length} findings`);
      } catch (err) {
        setApiError(err.message || "Live API call failed.");
        flash("Live API call failed. See the error banner.");
      }
    } else {
      await delay(1200);
      const derived = deriveFindings(redlineDoc, referenceGraph);
      setAiChange(derived);
      setChangeRunMeta({
        description: `Derived from ${redlineDoc.changes.length} tracked changes in v1.1, placed against the clause playbook, `
          + `with ${silentClauses.length} cross-referenced clause${silentClauses.length === 1 ? "" : "s"} pulled into review · `
          + `${new Date().toLocaleString()} · Run ${shortId()} · Findings come from the diff, not from a fixed list, so they always match the document.`,
      });
      logAudit(`Change intelligence run: ${derived.length} findings from ${redlineDoc.changes.length} tracked changes`);
      derived
        .filter((f) => f.materiality === "High" || f.materiality === "Medium")
        .forEach((f) => notify(changeTypeRoute[f.changeType] || "Contract Manager", `${f.clause} needs review (${f.materiality})`));
    }
    setAiChangeLoading(false);
  }

  function decide(key, action, reason) {
    const ex = exceptions.find((e) => e.__index === key);
    setExceptionDecisions((d) => ({ ...d, [key]: { action, reason: reason || "" } }));
    if (ex?.changeId) {
      if (action === "Accept Exception") setChangeDecisions((d) => ({ ...d, [ex.changeId]: "accepted" }));
      if (action === "Reject") setChangeDecisions((d) => ({ ...d, [ex.changeId]: "rejected" }));
    }
    setExceptionModalKey(null);
    logAudit(`${ex?.clause || "Exception"}: ${action}${reason ? `, "${reason}"` : ""}`);
  }

  function resolveEscalation(key, outcome) {
    const ex = exceptions.find((e) => e.__index === key);
    const approver = getEscalationApprover(ex?.changeType);
    const accepted = outcome === "approve";
    setExceptionDecisions((d) => ({
      ...d,
      [key]: {
        action: accepted ? "Accept Exception" : "Reject",
        reason: "",
        note: accepted
          ? `Approved on escalation by ${approver.name} (${approver.role}). Supplier's wording adopted.`
          : `${approver.name} (${approver.role}) upheld our original wording on escalation.`,
      },
    }));
    if (ex?.changeId) setChangeDecisions((d) => ({ ...d, [ex.changeId]: accepted ? "accepted" : "rejected" }));
    flash(accepted ? "Escalation approved. Supplier's wording adopted." : "Escalation resolved. Original wording kept.");
    logAudit(`${approver.name} (${approver.role}) resolved escalation on ${ex?.clause}: ${accepted ? "adopted supplier wording" : "upheld original wording"}`);
  }

  function supplierSubmitRevision(key) {
    const ex = exceptions.find((e) => e.__index === key);
    const ref = ex?.clauseRef;
    const proposed = ref ? SUPPLIER_REVISION_EDITS[ref] : null;
    if (!redlineDoc || !ref || !proposed) {
      flash("No revised position is scripted for that clause in this demo.");
      return;
    }
    const revised = applySupplierRevision(redlineDoc, ref, proposed, {
      author: SUPPLIER.signatoryName, role: "Supplier", date: stampNow(),
    });
    setRedlineDoc(revised);
    setDocVersion("v1.1");

    // The old change is gone, so its decision and its markup decision go with it.
    const oldChangeId = redlineDoc.changes.find((c) => c.clauseRef === ref)?.id;
    setChangeDecisions((d) => { const n = { ...d }; if (oldChangeId) delete n[oldChangeId]; return n; });
    setExceptionDecisions((d) => { const n = { ...d }; delete n[key]; return n; });
    setRevisionSubmitted((r) => ({ ...r, [ref]: true }));

    // Re-derive so the panel reflects the new proposal rather than the withdrawn one.
    if (aiChange) setAiChange(deriveFindings(revised, referenceGraph));

    setExtraHistory((h) => [...h, {
      v: revised.meta.version,
      label: `Revised clause ${ref} submitted by ${SUPPLIER.name}`,
      format: ".docx, tracked changes",
    }]);
    flash(`Revised clause ${ref} submitted as ${revised.meta.version}.`);
    logAudit(`Supplier submitted a revised position on clause ${ref}: document now ${revised.meta.version}`);
    notify(CONTRACT_OWNER, `${draftRecord?.id}: revised clause ${ref} received`);
  }

  function setChange(id, status) {
    setChangeDecisions((d) => ({ ...d, [id]: status }));
    const change = redlineDoc?.changes.find((c) => c.id === id);
    logAudit(`Tracked change on clause ${change?.clauseRef} ${status}`);
  }

  function addComment(anchor, text, author = CLIENT_ENTITY.signatory, role = currentRole) {
    const target = redlineDoc ? setRedlineDoc : setDraftDoc;
    target((doc) => doc && ({
      ...doc,
      comments: [...(doc.comments || []), {
        id: `cmt-local-${shortId()}`, anchor, author, role,
        date: stampNow(), text, replies: [], resolved: false,
      }],
    }));
    logAudit(`${author} commented on clause ${anchor}`);
  }

  function updateComment(id, change) {
    const applies = (doc) => (doc?.comments || []).some((c) => c.id === id);
    const patch = (doc) => (doc && applies(doc)
      ? { ...doc, comments: doc.comments.map((c) => (c.id === id ? change(c) : c)) }
      : doc);
    setRedlineDoc(patch);
    setDraftDoc(patch);
  }

  function replyToComment(id, text, author = CLIENT_ENTITY.signatory) {
    updateComment(id, (c) => ({ ...c, replies: [...(c.replies || []), { author, text, date: stampNow() }] }));
    logAudit(`${author} replied to a comment thread on the redline`);
  }

  function replyFromPanel(comment) {
    const text = window.prompt(`Reply to ${comment.author} on clause ${comment.anchor}:`);
    if (text && text.trim()) replyToComment(comment.id, text.trim());
  }

  function resolveComment(id, by = CLIENT_ENTITY.signatory) {
    updateComment(id, (c) => ({ ...c, resolved: true, resolvedBy: by }));
    logAudit(`Comment thread resolved by ${by}: the conversation, not the clause`);
  }

  function submitReviewDecision(key, status, delegateTo) {
    const reviewer = REVIEWERS.find((r) => r.key === key);
    if (status === "delegated") {
      setApprovals((a) => ({ ...a, [key]: { status, comment: reviewCommentDraft.trim(), delegateTo } }));
      logAudit(`${reviewer.role} (${reviewer.name}) delegated internal review to ${delegateTo}`);
      notify(delegateTo, `Internal review for ${draftRecord?.id} delegated to you by ${reviewer.name}`);
      setReviewActionKey(null); setReviewCommentDraft("");
      return;
    }
    if (status !== "approved" && !reviewCommentDraft.trim()) {
      flash("Add a comment before rejecting or requesting changes."); return;
    }
    setApprovals((a) => ({ ...a, [key]: { status, comment: reviewCommentDraft.trim() } }));
    logAudit(`${reviewer.role} (${reviewer.name}) ${status === "approved" ? "approved" : status === "rejected" ? "rejected" : "requested changes on"} internal review${reviewCommentDraft.trim() ? `, "${reviewCommentDraft.trim()}"` : ""}`);
    setReviewActionKey(null); setReviewCommentDraft("");
  }

  function resolveDelegation(key, outcome) {
    const reviewer = REVIEWERS.find((r) => r.key === key);
    const delegateTo = approvals[key]?.delegateTo || "delegate";
    setApprovals((a) => ({ ...a, [key]: { status: outcome, comment: `Decided by delegate ${delegateTo}` } }));
    logAudit(`${delegateTo} (delegate for ${reviewer.role}) ${outcome === "approved" ? "approved" : outcome === "rejected" ? "rejected" : "requested changes on"} internal review`);
  }

  function advanceAmendment(stage) {
    setAmendment((a) => (a ? { ...a, stage } : a));
    const notes = {
      review: `Amendment ${amendment?.id} sent for internal review`,
      with_supplier: `Amendment ${amendment?.id} approved internally and sent to ${SUPPLIER.name}`,
      signed: `Amendment ${amendment?.id} executed by both parties as a separate instrument`,
      attached: `Amendment ${amendment?.id} attached to ${draftRecord?.id}: parent version now v2.1`,
    };
    logAudit(notes[stage] || `Amendment moved to ${stage}`);
    if (stage === "attached") {
      setExtraHistory((h) => [...h, {
        v: "v2.1", label: `Amendment ${amendment?.id} attached: ${amendment?.reason}`, format: ".pdf",
      }]);
      notify(CONTRACT_OWNER, `${draftRecord?.id} amended, now v2.1`);
      flash("Amendment attached. The parent contract is now v2.1.");
    } else {
      flash(notes[stage]);
    }
  }

  function resubmitForReview() {
    setApprovals(EMPTY_APPROVALS);
    logAudit("Draft resubmitted for internal review after changes");
    flash("Resubmitted for internal review.");
  }

  async function sendEnvelope() {
    setEnvelopeSending(true); setEnvelopeError("");
    const details = {
      title: `${draftRecord.id}: ${TEMPLATE_BY_CODE[draftRecord.templateCode]?.name}`,
      externalId: draftRecord.id,
      recipients: envelopeRecipients.map((r) => ({
        name: r.name.trim(), email: r.email.trim(), role: r.role,
        party: r.party, onBehalfOf: r.onBehalfOf,
      })),
      message: envelopeMessage,
    };
    try {
      if (documensoConfig.mode === "live") {
        if (!documensoConfig.apiKey) throw new Error("Add a Documenso API key in Integration settings, or switch back to simulated mode.");
        const pdf = buildPdf(executedDoc, { footer: `${draftRecord.id} - for signature` });
        const result = await sendForSignature(documensoConfig, pdf, details);
        setEnvelope(result);
        logAudit(`Documenso envelope ${result.id} created and distributed (live)`);
        flash("Envelope created in Documenso and sent to both signers.");
      } else {
        await delay(900);
        const result = simulateEnvelope(details);
        setEnvelope(result);
        logAudit(`Signature envelope ${result.id} created (simulated): document converted to PDF`);
        flash("Envelope sent (simulated). Switch to Supplier view to sign as the counterparty.");
      }
      notify(SUPPLIER.name, `${draftRecord.id} sent for e-signature`);
      setPage("signature");
    } catch (err) {
      setEnvelopeError(err.message || "Could not create the envelope.");
    }
    setEnvelopeSending(false);
  }

  function markSigned(who) {
    setEnvelope((e) => e && ({
      ...e,
      recipients: e.recipients.map((r, i) =>
        (who === "client" ? i === 0 : i === 1) ? { ...r, signingStatus: "SIGNED" } : r
      ),
    }));
  }

  function completeSignature(side, record) {
    const next = { ...signatures, [side]: record };
    setSignatures(next);
    markSigned(side);
    setCeremony(null);
    const who = side === "client" ? CLIENT_ENTITY.name : SUPPLIER.name;
    logAudit(
      `Signed for ${who} by ${record.name} (${record.title}): typed electronic signature, ${record.date}`
      + (record.mismatch ? ` · envelope was addressed to ${record.addressedTo}` : "")
    );
    if (side === "client") setClientSigned(true);
    else setSupplierSigned(true);

    if (side === "client" && !supplierSigned) {
      notify(SUPPLIER.name, `${draftRecord?.id || CONTRACT_ID}: ${CLIENT_ENTITY.name} has signed. The envelope is now with you for signature`);
      logAudit(`Signing order advanced to ${SUPPLIER.name}, access link active`);
    }

    if (next.client && next.supplier && draftRecord) {
      setExecutedPdfBlob(buildPdf(makeExecutedDoc(next), { footer: `${draftRecord.id} - executed` }));
      setDocVersion("executed");
      logAudit("Envelope complete: contract executed and frozen as PDF");
      notify(CONTRACT_OWNER, `${draftRecord.id} fully executed`);
    }
    flash(`Signed as ${record.name}.`);
  }

  function supplierDecline(reason) {
    const why = (reason || "").trim();
    if (!why) { flash("Say why you are declining. The client cannot act on a blank refusal."); return; }
    setEnvelope((e) => e && ({ ...e, status: "REJECTED" }));
    setDeclineReason(why);
    logAudit(`Envelope declined by ${SUPPLIER.name}: ${why}`);
    notify(CONTRACT_OWNER, `${draftRecord?.id}: ${SUPPLIER.name} declined to sign: ${why}`);
    flash("Declined. The client has been told why.");
  }

  async function refreshEnvelope() {
    if (documensoConfig.mode !== "live" || !envelope) { flash("Reminder sent."); logAudit("Reminder resent to supplier"); return; }
    try {
      const fresh = await getEnvelope(documensoConfig, envelope.id);
      setEnvelope(fresh);
      flash(`Envelope status: ${fresh.status}`);
    } catch (err) { setEnvelopeError(err.message); }
  }

  function supersedeEnvelope(reason) {
    if (!envelope) return;
    setExtraHistory((h) => [...h, {
      v: envelope.id, label: `Envelope voided: ${reason}`, format: "signature record",
    }]);
    setEnvelope(null);
    setSignatures({ client: null, supplier: null });
    setClientSigned(false); setSupplierSigned(false); setSupplierViewed(false);
    setExecutedPdfBlob(null);
    logAudit(
      `Envelope ${envelope.id} voided: ${reason}. `
      + "Any signature already collected is discarded: it was given against the superseded text."
    );
    notify(CONTRACT_OWNER, `${draftRecord?.id}: envelope voided: ${reason}`);
  }

  function reopenNegotiation() {
    supersedeEnvelope("reopened for a further redline after the counterparty declined");
    setRedlineReopened(true);
    setPage("workspace");
    flash(`Reopened. ${SUPPLIER.name} can return a further marked-up document.`);
    notify(SUPPLIER.name, `${draftRecord?.id}: reopened for a further redline`);
  }

  function raiseNewEnvelope() {
    supersedeEnvelope("a fresh envelope was raised after the counterparty declined");
    setDeclineReason("");
    setPage("signature");
    flash("Previous envelope voided. Raise the new one below.");
  }

  function voidEnvelope() {
    if (!window.confirm("Void this signature envelope? The contract returns to negotiation.")) return;
    setEnvelope(null); setClientSigned(false); setSupplierSigned(false); setSupplierViewed(false);
    logAudit("Envelope voided: contract returned to negotiation");
    flash("Envelope voided.");
    setPage("workspace");
  }

  function downloadExecuted() {
    if (executedPdfBlob) { downloadBlob(executedPdfBlob, `${draftRecord.id}_Executed.pdf`); return; }
    downloadPdf(executedDoc, `${draftRecord.id}_Executed.pdf`, { footer: `${draftRecord.id} - executed` });
  }

  function downloadCertificate() {
    if (documensoConfig.mode === "live" && envelope && !envelope.simulated) {
      window.open(certificateUrl(documensoConfig, envelope.id), "_blank", "noopener");
      return;
    }
    const doc = {
      meta: { title: "Signing certificate" },
      blocks: [
        { type: "title", text: "SIGNING CERTIFICATE" },
        { type: "subtitle", text: `${draftRecord.id} · envelope ${envelope?.id}` },
        { type: "clause", ref: "", heading: "", runs: [{ t: "text", text:
          `This envelope was completed on ${new Date().toLocaleString("en-GB")}. Signers: `
          + `${CLIENT_ENTITY.signatory} (${CLIENT_ENTITY.signatoryEmail}) and ${SUPPLIER.name} (${SUPPLIER.signatoryEmail}). `
          + `Simulated envelope. A live Documenso envelope returns its own certificate with IP addresses, timestamps and `
          + `document hashes from the signing audit log.` }] },
      ],
    };
    downloadPdf(doc, `${draftRecord.id}_SigningCertificate.pdf`, { footer: "Simulated certificate" });
  }

  async function runPdfExtraction() {
    setExtractingPdf(true); setExtractPdfError("");
    try {
      const text = executedPdfBlob
        ? await extractPdfTextFromBlob(executedPdfBlob)
        : await extractPdfText(PDF_EXECUTED_B64);
      if (!text || text.trim().length < 50) throw new Error("PDF text extraction returned no usable text.");
      setExtractedText(text.trim());
      logAudit(`Extracted executed contract text from the signed PDF (client-side, pdf.js): ${text.trim().length} characters`);
    } catch (err) {
      setExtractPdfError(err.message || "PDF text extraction failed.");
    }
    setExtractingPdf(false);
  }

  async function runObligationExtraction() {
    if (!extractedText) { flash("Extract text from the PDF first."); return; }
    setObligationsLoading(true); setApiError("");
    if (liveMode && apiKey) {
      try {
        const result = await callLiveAI(provider, apiKey, model, buildObligationPrompt(extractedText));
        setAiObligations(result);
        setObligationRunMeta({ description: `Extracted from the executed PDF · ${model} via ${PROVIDER_DEFAULTS[provider].label} (live) · ${new Date().toLocaleString()} · Run ${shortId()}` });
        logAudit(`Obligation extraction run (LIVE): ${result.length} obligations identified`);
      } catch (err) {
        setApiError(err.message || "Live API call failed.");
        flash("Live API call failed. See the error banner.");
      }
    } else {
      await delay(1200);
      setAiObligations(MOCK_OBLIGATIONS);
      setObligationRunMeta({ description: `Extracted from the executed PDF · demo model · ${new Date().toLocaleString()} · Run ${shortId()}` });
      logAudit(`Obligation extraction run: ${MOCK_OBLIGATIONS.length} obligations identified`);
      notify(CONTRACT_OWNER, `${MOCK_OBLIGATIONS.length} obligations extracted from ${draftRecord.id}, pending validation`);
    }
    setObligationsLoading(false);
  }

  const supplierAccessLink = `${window.location.origin}${window.location.pathname}#supplier?t=${accessToken}&c=${draftRecord?.id || CONTRACT_ID}`;
  const supplierLinkExpiry = linkExpiry;

  const SUPPLIER_RECIPIENT_INDEX = 1;
  const waitingOnSigner = (envelope?.recipients || [])
    .slice(0, SUPPLIER_RECIPIENT_INDEX)
    .find((r) => r.role === "SIGNER" && r.signingStatus !== "SIGNED");

  const supplierActionItems = exceptions
    .map((ex) => ({ ex, i: ex.__index, decision: exceptionDecisions[ex.__index] }))
    .filter(({ decision }) => decision && decision.action === "Request Supplier Revision");

  const nav = (label, key) => (
    <a
      href="#" key={key} aria-current={page === key ? "page" : undefined}
      onClick={(e) => { e.preventDefault(); setPage(key); }}
    >{label}</a>
  );

  const modalException = exceptionModalKey != null ? findings.find((e) => e.__index === exceptionModalKey) : null;

  return (
    <div
      className={page === "draft" ? "clm-app-fixed" : undefined}
      style={{ minHeight: "100vh", background: "var(--color-bg)", color: "var(--color-text)",
        fontFamily: "var(--font-body)", display: "flex", flexDirection: "column", forcedColorAdjust: "none" }}
    >

      <nav className="nav" style={{ position: "relative" }}>
        <span className="nav-brand">FM Supplier CLM</span>
        {TABS.map(([label, key]) => nav(label, key))}

        <div className="field" style={{ margin: 0, minWidth: 210 }}>
          <select
            className="input" value={currentRole} onChange={(e) => setCurrentRole(e.target.value)}
            title={ROLE_DESCRIPTIONS[currentRole]} style={{ fontSize: 12, minHeight: 32, padding: "4px 8px" }}
          >
            {ROLES.map((r) => <option key={r} value={r}>Viewing as: {r}</option>)}
          </select>
        </div>

        <Btn onClick={() => openPlaybook()} icon={BookOpen} variant="secondary" small>Clause playbook</Btn>
        <Btn onClick={() => setMatrixOpen(true)} icon={ShieldCheck} variant="secondary" small>
          Approval matrix
        </Btn>

        <button
          type="button" className="btn btn-ghost" onClick={() => setPage("salesforce")}
          style={{ fontSize: 12 }}
        >Salesforce ↗</button>
        <button
          type="button" onClick={() => setPage("supplier")} className="tag tag-outline"
          style={{ cursor: "pointer", border: "1px solid var(--color-accent)" }}
        >Supplier view ↗</button>

        <span className="clm-nav-icons">
        <button type="button" onClick={() => setShowNotifications((s) => !s)} title="Notifications" className="btn btn-ghost btn-icon" style={{ position: "relative" }}>
          <Bell size={14} />
          {notifications.some((n) => !n.read) && (
            <span style={{ position: "absolute", top: 4, right: 4, width: 6, height: 6, borderRadius: "50%", background: "var(--color-accent)" }} />
          )}
        </button>
        <button type="button" onClick={() => setShowApiPanel((s) => !s)} title="Live AI settings (developer)" className="btn btn-ghost btn-icon" style={{ position: "relative" }}>
          <KeyRound size={14} />
          {liveMode && <span style={{ position: "absolute", top: 4, right: 4, width: 6, height: 6, borderRadius: "50%", background: "var(--color-accent)" }} />}
        </button>
        <button type="button" onClick={resetDemo} title="Reset demo" className="btn btn-ghost btn-icon"><RotateCcw size={14} /></button>
        </span>

        {showNotifications && (
          <div className="card" style={{ position: "absolute", top: "100%", right: 60, marginTop: 6, width: 330, zIndex: 40, boxShadow: "var(--shadow-lg)", maxHeight: 380, overflowY: "auto" }}>
            <div className="card-title" style={{ fontSize: 14, marginBottom: 2 }}>Notifications</div>
            {notifications.length === 0 && (
              <p style={{ fontSize: 12, opacity: 0.55, margin: 0 }}>Nothing yet. These appear as the workflow generates outbound alerts.</p>
            )}
            {notifications.slice().reverse().map((n) => (
              <div key={n.id} style={{ borderTop: "1px solid var(--color-divider)", padding: "8px 0" }}>
                <div style={{ fontSize: 11, opacity: 0.5 }}>{n.time} · to {n.recipient}</div>
                <div style={{ fontSize: 12.5 }}>{n.message}</div>
              </div>
            ))}
          </div>
        )}

        {showApiPanel && (
          <div className="card" style={{ position: "absolute", top: "100%", right: 16, marginTop: 6, width: 350, zIndex: 40, boxShadow: "var(--shadow-lg)" }}>
            <div className="card-title" style={{ fontSize: 14, marginBottom: 2 }}>Live AI (developer)</div>
            <p style={{ fontSize: 11.5, opacity: 0.6, margin: "0 0 8px" }}>
              For your own testing only. Off by default: the demo derives findings from the redline itself and needs
              no key. Your key stays in this tab's memory.
            </p>
            <Field label="Provider" style={{ marginBottom: 8 }}>
              <select className="input" value={provider} onChange={(e) => { setProvider(e.target.value); setModel(PROVIDER_DEFAULTS[e.target.value].model); }}>
                {Object.entries(PROVIDER_DEFAULTS).map(([key, p]) => <option key={key} value={key}>{p.label}</option>)}
              </select>
            </Field>
            <Field label="API key" style={{ marginBottom: 8 }}>
              <input className="input" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={PROVIDER_DEFAULTS[provider].keyHint} />
            </Field>
            <Field label="Model" style={{ marginBottom: 8 }}>
              <input className="input" value={model} onChange={(e) => setModel(e.target.value)} />
            </Field>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={liveMode} onChange={(e) => setLiveMode(e.target.checked)} disabled={!apiKey} />
              Use live API for change intelligence / obligations
            </label>
            {liveMode && <p style={{ fontSize: 11, color: "var(--color-accent-700)", margin: "6px 0 0" }}>⚠ Live mode is ON. Turn this off before presenting.</p>}
          </div>
        )}
      </nav>

      {apiError && (
        <div className="clm-wrap" style={{ paddingTop: "var(--space-3)" }}>
          <div style={{ background: "#fdf1da", border: "1px solid #f5dfa8", color: "#7a4a05", padding: 10, fontSize: 12.5 }}>
            Live API error: {apiError}
          </div>
        </div>
      )}

      <div
        className={`clm-wrap${page === "draft" ? " clm-wrap-fill" : ""}`}
        style={{ padding: "var(--space-8) var(--space-6)", flex: 1, width: "100%" }}
      >
        {currentRole === "System Administrator" && !["dashboard", "supplier"].includes(page) ? (
          <AdminPage onOpenPlaybook={openPlaybook} />
        ) : (
          <>
            {page === "dashboard" && (
              <DashboardPage
                role={currentRole}
                contracts={myContracts}
                allContracts={allContracts}
                exceptions={exceptions}
                assessFor={assessFor}
                obligations={aiObligations}
                validatedCount={Object.keys(validated).length}
                onOpenPlaybook={openPlaybook}
                onGoToContracts={() => setPage("contracts")}
                onGoToWorkspace={(c) => (c.live ? setPage("workspace") : setViewingContract(c))}
              />
            )}

            {page === "contracts" && (
              <ContractsPage
                role={currentRole}
                contracts={myContracts}
                allContracts={allContracts}
                filters={filters}
                setFilters={setFilters}
                canCreate={canCreateContract(currentRole)}
                onOpen={(c) => (c.live ? setPage("workspace") : setViewingContract(c))}
                onDraft={() => setPage("draft")}
                onQuickAdd={() => setShowAddContract(true)}
              />
            )}

            {page === "draft" && (
              <DraftStudio
                onBack={() => setPage("contracts")}
                onCreateDraft={createDraft}
                salesforceRecord={sfRecord}
                salesforceContext={sfContext}
                onOpenPlaybook={openPlaybook}
                canDraft={canDraftFor(currentRole)}
                flash={flash}
                supplierDefaults={{
                  contract_number: CONTRACT_ID,
                  title: "Integrated FM Services - Riverside Campus",
                  supplier_name: SUPPLIER.name,
                  supplier_registered_number: SUPPLIER.registeredNumber,
                  supplier_address: SUPPLIER.address,
                  supplier_contact: SUPPLIER.contact,
                  legal_entity_name: CLIENT_ENTITY.name,
                  legal_entity_registered_number: CLIENT_ENTITY.registeredNumber,
                  legal_entity_address: CLIENT_ENTITY.address,
                  service_category: SUPPLIER.serviceCategory,
                  facility_names: SUPPLIER.facility,
                  contract_value: "486000",
                  start_date: "2026-10-01",
                  end_date: "2029-09-30",
                }}
              />
            )}

            {page === "workspace" && !contractExists && (
              <div style={{ textAlign: "center", padding: "var(--space-8) 0", opacity: 0.7 }}>
                <p style={{ fontSize: 14 }}>No contract drafted yet in this session.</p>
                <Btn onClick={() => setPage("draft")} icon={Plus} variant="primary">Draft a contract</Btn>
              </div>
            )}

            {page === "workspace" && contractExists && !canSeeLive && (
              <div style={{ textAlign: "center", padding: "var(--space-8) 0", maxWidth: 560, margin: "0 auto" }}>
                <ShieldCheck size={22} style={{ opacity: 0.5 }} />
                <p style={{ fontSize: 14, marginTop: 10 }}>
                  {draftRecord.id} is not routed to <strong>{currentRole}</strong>, so this role cannot open it.
                </p>
                <p style={{ fontSize: 12.5, opacity: 0.6 }}>
                  {contractVisibility(currentRole, liveContract).why}. Switch role in the header to open it.
                </p>
              </div>
            )}

            {page === "workspace" && contractExists && canSeeLive && (
              <WorkspacePage
                contract={liveContract}
                supplier={SUPPLIER}
                clientEntity={CLIENT_ENTITY}
                agreementTypeName={liveContract.agreementType}
                templateName={TEMPLATE_BY_CODE[draftRecord.templateCode]?.name}
                role={currentRole}
                readOnly={readOnly}
                contractStatus={contractStatus}
                approvalStatus={approvalStatus}
                signatureStatus={signatureStatus}
                contractIsLive={contractIsLive}
                terminationState={terminationState}
                activeDoc={activeDoc}
                docVersion={docVersion}
                setDocVersion={setDocVersion}
                versions={versions}
                watermark={docVersion === "v1.0" && !reviewComplete ? "DRAFT" : null}
                changeDecisions={changeDecisions}
                onAcceptChange={(id, status) => setChange(id, status || "accepted")}
                onRejectChange={(id) => setChange(id, "rejected")}
                onAddComment={addComment}
                onReplyToComment={replyToComment}
                onResolveComment={resolveComment}
                versionHistory={versionHistory}
                reviewers={REVIEWERS}
                approvals={approvals}
                reviewActionKey={reviewActionKey}
                setReviewActionKey={setReviewActionKey}
                reviewCommentDraft={reviewCommentDraft}
                setReviewCommentDraft={setReviewCommentDraft}
                submitReviewDecision={submitReviewDecision}
                resolveDelegation={resolveDelegation}
                roleCanActOnReviewer={roleCanActOnReviewer}
                resubmitForReview={resubmitForReview}
                reviewComplete={reviewComplete}
                sentToSupplier={sentToSupplier}
                redlineReceived={Boolean(redlineDoc)}
                onSendToSupplier={sendToSupplier}
                aiChange={aiChange}
                aiChangeLoading={aiChangeLoading}
                runChangeIntelligence={runChangeIntelligence}
                changeRunMeta={changeRunMeta}
                exceptions={exceptions}
                changeTypeRoute={changeTypeRoute}
                approvalMatrix={approvalMatrix}
                contractValue={contractValue}
                exceptionDecisions={exceptionDecisions}
                assessFor={assessFor}
                onOpenException={(key) => setExceptionModalKey(key)}
                decide={decide}
                resolveEscalation={resolveEscalation}
                revisionSubmitted={revisionSubmitted}
                roleCanActOnException={roleCanActOnException}
                onAddManualException={() => setShowManualException(true)}
                onOpenPlaybook={openPlaybook}
                silentClauses={silentClauses}
                commentsFor={commentsFor}
                readyForSignature={readyForSignature}
                envelope={envelope}
                envelopeStatus={envelopeStatus}
                declineReason={declineReason}
                redlineReopened={redlineReopened}
                onReopenNegotiation={reopenNegotiation}
                onRaiseNewEnvelope={raiseNewEnvelope}
                onGoToSignature={() => setPage("signature")}
                canManageLifecycle={canManageLifecycle}
                undecidedCount={undecidedCount}
                blockedCount={blockedCount}
                auditLog={auditLog}
                onBack={() => setPage("contracts")}
                onGoToObligations={() => setPage("obligations")}
                flash={flash}
                lifecycle={(contractIsLive || terminationState) ? (
                  <PostExecution
                    contract={liveContract}
                    canManageLifecycle={canManageLifecycle}
                    obligations={aiObligations}
                    trackedCount={trackedObligationCount}
                    validatedCount={Object.keys(validated).length}
                    noticeDays={Number(draftRecord.values.notice_period_days) || 90}
                    onGoToObligations={() => setPage("obligations")}
                    amendment={amendment}
                    parentVersion={parentVersion}
                    onCreateAmendment={() => setShowAmendmentForm(true)}
                    onAdvanceAmendment={advanceAmendment}
                    expiryStage={expiryStage}
                    onExpiryReminders={() => { setExpiryStage("reminders"); logAudit("Expiry reminder window opened (120/90/60/30 days)"); flash("Expiry reminders simulated."); }}
                    onExpire={() => { setExpiryStage("expired"); logAudit("Contract not renewed in time, status Expired"); flash("Contract marked Expired."); }}
                    renewalTaskCreated={renewalTaskCreated}
                    onCreateRenewal={() => {
                      setRenewalTaskCreated(true); setExpiryStage(null);
                      logAudit(`Renewal decision opened, obligation record: ${Object.keys(validated).length}/${trackedObligationCount} validated`);
                      flash("Renewal decision opened.");
                    }}
                    terminationState={terminationState}
                    terminationDraft={terminationDraft}
                    closureTasks={closureTasks}
                    onToggleClosure={(key) => {
                      setClosureTasks((t) => ({ ...t, [key]: !t[key] }));
                      logAudit(`Closure activity ${closureTasks[key] ? "reopened" : "confirmed"}: ${key}`);
                    }}
                    onElapseNotice={() => {
                      // Demo affordance only. In production the date arrives on its own.
                      setTerminationDraft((d) => ({ ...d, effectiveDate: new Date().toISOString().slice(0, 10) }));
                      logAudit("Simulated: the termination notice period has elapsed");
                      flash("Notice period elapsed. The effective date is today.");
                    }}
                    onInitiateTermination={() => setShowTerminationForm(true)}
                    onConfirmTermination={() => {
                      setTerminationState("terminated");
                      logAudit("Contract terminated: notice period run and all closure activities confirmed");
                      notify(CONTRACT_OWNER, `${draftRecord.id} terminated`);
                      flash("Contract marked Terminated.");
                    }}
                  />
                ) : null}
              />
            )}

            {page === "obligations" && (
              <ObligationsPage
                contractId={draftRecord?.id || CONTRACT_ID}
                supplierName={SUPPLIER.name}
                contractIsLive={contractIsLive}
                canManageLifecycle={canManageLifecycle}
                readOnly={readOnly}
                extractedText={extractedText}
                extractingPdf={extractingPdf}
                extractPdfError={extractPdfError}
                runPdfExtraction={runPdfExtraction}
                obligations={aiObligations}
                obligationsLoading={obligationsLoading}
                runObligationExtraction={runObligationExtraction}
                obligationRunMeta={obligationRunMeta}
                validated={validated}
                editingIndex={editingIndex}
                setEditingIndex={setEditingIndex}
                editDraft={editDraft}
                setEditDraft={setEditDraft}
                onValidate={(i, o) => {
                  setValidated((v) => ({ ...v, [i]: true }));
                  logAudit(`Obligation validated: ${o.name} (${o.clause})`);
                  flash("Obligation validated. Reminders active.");
                }}
                onSaveEdit={(i) => {
                  setAiObligations((list) => list.map((row, idx) => (idx === i ? { ...row, ...editDraft } : row)));
                  setEditingIndex(null); flash("Obligation updated.");
                }}
                onDelete={(i, o) => {
                  if (!window.confirm(`Remove "${o.name}"?`)) return;
                  setAiObligations((list) => list.filter((_, idx) => idx !== i));
                  setValidated((v) => { const n = { ...v }; delete n[i]; return n; });
                  logAudit(`Obligation removed: ${o.name}`); flash("Obligation removed.");
                }}
                onAdd={() => {
                  const name = window.prompt("Obligation description:");
                  if (!name?.trim()) return;
                  setAiObligations((list) => [...(list || []), {
                    id: `OBL-M${(list?.length || 0) + 1}`, clause: "-", name: name.trim(), responsible: "Supplier",
                    notify: "", frequency: "As required", due: "-", evidence: "-",
                    consequence: "-", confidence: "N/A", manual: true,
                  }]);
                  logAudit(`Obligation added manually: ${name.trim()}`);
                }}
              />
            )}

            {page === "signature" && (
              <SignaturePage
                onBack={() => setPage("workspace")}
                contractId={draftRecord?.id || CONTRACT_ID}
                supplierName={SUPPLIER.name}
                envelope={envelope}
                envelopeStatus={envelopeStatus}
                signatureStatus={signatureStatus}
                config={documensoConfig}
                setConfig={setDocumensoConfig}
                onSend={sendEnvelope}
                sending={envelopeSending}
                error={envelopeError}
                onSignRecipient={(party) => setCeremony(party)}
                signatures={signatures}
                onResend={refreshEnvelope}
                onVoid={voidEnvelope}
                onDownloadExecuted={downloadExecuted}
                onDownloadCertificate={downloadCertificate}
                readOnly={readOnly}
                canSign={canSignFor(currentRole)}
                ready={readyForSignature}
                recipients={envelopeRecipients}
                subject={envelopeSubject || `Signature requested: ${draftRecord?.id || CONTRACT_ID}`}
                setSubject={setEnvelopeSubject}
                message={envelopeMessage}
                setMessage={setEnvelopeMessage}
                previewUrl={envelopePdfUrl}
                doc={executedDoc}
              />
            )}

            {page === "salesforce" && (
              <SalesforcePanel
                onBack={() => setPage("contracts")}
                config={salesforceConfig}
                setConfig={setSalesforceConfig}
                onCreateContract={createContractFromSalesforce}
                milestones={sfMilestones}
                contractId={draftRecord?.id}
                canCreate={canCreateContract(currentRole)}
              />
            )}

            {page === "supplier" && (
              <SupplierPortal
                supplier={SUPPLIER}
                contractId={draftRecord?.id || CONTRACT_ID}
                contractExists={contractExists}
                sentToSupplier={sentToSupplier}
                draftDoc={draftDoc}
                redlineDoc={resolvedRedline}
                redlineReceived={Boolean(redlineDoc)}
                onSubmitRedline={receiveRedline}
                onImportRedline={importRedline}
                accessLink={supplierAccessLink}
                accessExpiry={supplierLinkExpiry}
                viaLink={openedViaLink}
                supplierActionItems={supplierActionItems}
                onSubmitRevision={supplierSubmitRevision}
                envelope={envelope}
                envelopeStatus={envelopeStatus}
                supplierViewed={supplierViewed}
                supplierSigned={supplierSigned}
                onReplyToComment={(id, text) => replyToComment(id, text, SUPPLIER.signatoryName)}
                onResolveComment={(id) => resolveComment(id, SUPPLIER.signatoryName)}
                onAddComment={(anchor, text) => addComment(anchor, text, SUPPLIER.signatoryName, "Supplier")}
                onSupplierView={() => { setSupplierViewed(true); logAudit("Envelope viewed by supplier"); }}
                onSupplierSign={() => setCeremony("supplier")}
                waitingOnSigner={waitingOnSigner}
                onSupplierDecline={supplierDecline}
                redlineReopened={redlineReopened}
                onDownloadExecuted={downloadExecuted}
                flash={flash}
              />
            )}
          </>
        )}
      </div>

      <SignCeremony
        key={ceremony || "none"}
        open={Boolean(ceremony)}
        onClose={() => setCeremony(null)}
        onSign={(record) => completeSignature(ceremony, record)}
        party={ceremony === "client" ? "Client signature" : "Supplier signature"}
        entity={ceremony === "client" ? CLIENT_ENTITY.name : SUPPLIER.name}
        expectedName={envelope?.recipients?.[ceremony === "client" ? 0 : 1]?.name}
        defaultTitle={ceremony === "client" ? CLIENT_ENTITY.signatoryTitle : SUPPLIER.signatoryTitle}
        documentTitle={`${draftRecord?.id || CONTRACT_ID}: ${TEMPLATE_BY_CODE[draftRecord?.templateCode]?.name || "Agreement"}`}
        clauseCount={(executedDoc.blocks || []).filter((b) => b.type === "clause").length}
      />

      <ApprovalMatrix
        open={matrixOpen}
        onClose={() => setMatrixOpen(false)}
        matrix={approvalMatrix}
        onChange={setApprovalMatrix}
        role={currentRole}
        contractValue={contractValue}
      />

      <PlaybookDrawer
        key={playbook.focus || "all"}
        open={playbook.open}
        focusCode={playbook.focus}
        onClose={() => setPlaybook({ open: false, focus: null })}
      />

      {modalException && (
        <ExceptionDialog
          finding={modalException}
          decision={exceptionDecisions[modalException.__index]}
          assessment={assessFor(modalException)}
          canAct={roleCanActOnException(currentRole, modalException.changeType, changeTypeRoute) && !readOnly
            && !(mustEscalate(approvalMatrix, modalException.changeType, contractValue) && currentRole !== ALL_ACCESS_ROLE)}
          readOnly={readOnly}
          route={changeTypeRoute[modalException.changeType] || "Contract Manager"}
          approver={getEscalationApprover(modalException.changeType)}
          comments={commentsFor(modalException.clauseRef)}
          crossRef={crossRefFor(modalException.clauseRef)}
          revisionSubmitted={revisionSubmitted[modalException.clauseRef]}
          contractId={draftRecord?.id || CONTRACT_ID}
          supplierName={SUPPLIER.name}
          onClose={() => setExceptionModalKey(null)}
          onDecide={decide}
          onOpenPlaybook={openPlaybook}
          onResolveEscalation={resolveEscalation}
          onReply={replyFromPanel}
          onResolveComment={resolveComment}
          flash={flash}
        />
      )}

      {showManualException && (
        <SmallDialog title="Add exception manually" onClose={() => setShowManualException(false)}>
          <p style={{ fontSize: 11.5, opacity: 0.5, margin: "0 0 8px" }}>
            For when AI is unavailable or a reviewer spots something it missed. Enters the same decision flow.
          </p>
          <Field label="Clause" style={{ marginBottom: 10 }}>
            <input className="input" value={manualExceptionDraft.clause} placeholder="e.g. 8.1 Confidentiality"
              onChange={(e) => setManualExceptionDraft((d) => ({ ...d, clause: e.target.value }))} />
          </Field>
          <div className="clm-grid-2" style={{ marginBottom: 10 }}>
            <Field label="Materiality">
              <select className="input" value={manualExceptionDraft.materiality} onChange={(e) => setManualExceptionDraft((d) => ({ ...d, materiality: e.target.value }))}>
                <option>High</option><option>Medium</option><option>Low</option><option>Informational</option>
              </select>
            </Field>
            <Field label="Change type">
              <select className="input" value={manualExceptionDraft.changeType} onChange={(e) => setManualExceptionDraft((d) => ({ ...d, changeType: e.target.value }))}>
                {approvalMatrix.map((r) => <option key={r.changeType}>{r.changeType}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Impact / notes" style={{ marginBottom: 10 }}>
            <textarea className="input" value={manualExceptionDraft.impact} placeholder="Why this matters"
              onChange={(e) => setManualExceptionDraft((d) => ({ ...d, impact: e.target.value }))} />
          </Field>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn onClick={() => setShowManualException(false)} variant="secondary">Cancel</Btn>
            <Btn variant="primary" onClick={() => {
              if (!manualExceptionDraft.clause.trim()) { flash("Enter a clause first."); return; }
              setAiChange((list) => [...(list || []), {
                ...manualExceptionDraft, clause: manualExceptionDraft.clause.trim(),
                previous: "", proposed: "", confidence: "N/A", manual: true, manualId: `manual-${shortId()}`,
              }]);
              logAudit(`Exception added manually: ${manualExceptionDraft.clause.trim()} (${manualExceptionDraft.materiality})`);
              setManualExceptionDraft({ clause: "", materiality: "Medium", changeType: "Other", impact: "" });
              setShowManualException(false);
            }}>Add exception</Btn>
          </div>
        </SmallDialog>
      )}

      {showAmendmentForm && (
        <SmallDialog title="Create amendment" onClose={() => setShowAmendmentForm(false)}>
          <p style={{ fontSize: 11.5, opacity: 0.5, margin: "0 0 10px" }}>
            Links to {draftRecord?.id} as the parent contract. Executing later updates the contract version.
          </p>
          <Field label="Reason for amendment" style={{ marginBottom: 10 }}>
            <input className="input" value={amendmentDraft.reason} placeholder="e.g. Add Building D to scope of services"
              onChange={(e) => setAmendmentDraft((d) => ({ ...d, reason: e.target.value }))} />
          </Field>
          <Field label="Effective date" style={{ marginBottom: 10 }}>
            <input className="input" type="date" value={amendmentDraft.effectiveDate}
              onChange={(e) => setAmendmentDraft((d) => ({ ...d, effectiveDate: e.target.value }))} />
          </Field>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn onClick={() => setShowAmendmentForm(false)} variant="secondary">Cancel</Btn>
            <Btn variant="primary" onClick={() => {
              if (!amendmentDraft.reason.trim() || !amendmentDraft.effectiveDate) { flash("Enter a reason and effective date first."); return; }
              setAmendment({
                id: `${draftRecord?.id || CONTRACT_ID}-A1`,
                reason: amendmentDraft.reason.trim(),
                effectiveDate: amendmentDraft.effectiveDate,
                stage: "draft",
              });
              setShowAmendmentForm(false);
              logAudit(`Amendment drafted: ${amendmentDraft.reason.trim()}, effective ${amendmentDraft.effectiveDate}`);
              flash("Amendment drafted. It has its own lifecycle before it touches the parent.");
            }}>Create amendment</Btn>
          </div>
        </SmallDialog>
      )}

      {showTerminationForm && (() => {
        const kind = TERMINATION_TYPES[terminationDraft.type] || TERMINATION_TYPES["For Convenience"];
        const noticeDays = kind.days(draftRecord?.values);
        const servedOn = new Date();
        const effective = new Date(servedOn.getTime() + noticeDays * 86400000);
        const iso = (d) => d.toISOString().slice(0, 10);
        const pretty = (d) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
        const contractEnd = liveContract?.endDate ? new Date(liveContract.endDate) : null;
        const overshoots = contractEnd ? effective >= contractEnd : false;

        return (
          <SmallDialog title="Initiate termination" onClose={() => setShowTerminationForm(false)}>
            <Field label="Termination type" style={{ marginBottom: 10 }}>
              <select className="input" value={terminationDraft.type}
                onChange={(e) => {
                  const k = TERMINATION_TYPES[e.target.value];
                  setTerminationDraft((d) => ({
                    ...d, type: e.target.value,
                    noticeBasis: k.basis(k.days(draftRecord?.values)),
                  }));
                }}>
                {Object.keys(TERMINATION_TYPES).map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>

            <p style={{ fontSize: 11.5, opacity: 0.7, margin: "-4px 0 10px", lineHeight: 1.6 }}>{kind.note}</p>

            {kind.requiresGround && (
              <Field label="Material breach relied on" style={{ marginBottom: 10 }}>
                <textarea
                  className="input" value={terminationDraft.ground}
                  placeholder="e.g. Failure to meet the statutory PPM schedule on 3 sites for 4 consecutive months, after two formal warnings."
                  onChange={(e) => setTerminationDraft((d) => ({ ...d, ground: e.target.value }))}
                />
              </Field>
            )}

            <div style={{ background: "var(--color-neutral-100)", border: "1px solid var(--color-divider)",
              padding: 10, marginBottom: 10 }}>
              <div style={{ ...kicker, marginBottom: 5 }}>When this takes effect</div>
              <div style={{ display: "grid", gap: 3, fontSize: 12.5 }}>
                <div>Notice served <strong>{pretty(servedOn)}</strong></div>
                <div>
                  {kind.cure ? "Cure period" : "Notice period"} <strong>{noticeDays} days</strong>
                  {" "}per {kind.clauseLabel}
                </div>
                <div>
                  {kind.cure ? "Terminates if unremedied by " : "Contract ends "}
                  <strong>{pretty(effective)}</strong>
                </div>
              </div>
              <p style={{ margin: "8px 0 0", fontSize: 11.5, opacity: 0.75, lineHeight: 1.6 }}>
                {kind.cure
                  ? "The contract stays fully live throughout the cure period: services continue, charges accrue, and validated "
                    + "obligations keep firing. If the breach is remedied inside the window the notice falls away and the contract runs on."
                  : overshoots
                    ? "That is on or after the contract's own expiry date, so terminating for convenience achieves nothing. Let it expire and serve notice of non-renewal instead."
                    : "The contract stays fully live until then: services continue, charges accrue, and validated obligations keep firing."}
              </p>
            </div>

            <Field label="Notice basis" style={{ marginBottom: 10 }}>
              <input className="input" value={terminationDraft.noticeBasis}
                onChange={(e) => setTerminationDraft((d) => ({ ...d, noticeBasis: e.target.value }))} />
            </Field>

            <p style={{ fontSize: 11.5, opacity: 0.6, margin: "0 0 10px", lineHeight: 1.6 }}>
              Obligations at initiation: {Object.keys(validated).length} validated,{" "}
              {Math.max(0, trackedObligationCount - Object.keys(validated).length)} trackable but not yet validated.
              They run until the effective date, not until today.
            </p>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn onClick={() => setShowTerminationForm(false)} variant="secondary">Cancel</Btn>
              <Btn variant="primary" onClick={() => {
                if (kind.requiresGround && !terminationDraft.ground.trim()) {
                  flash("Termination for cause has to state the material breach relied on.");
                  return;
                }
                setTerminationDraft((d) => ({ ...d, servedOn: iso(servedOn), effectiveDate: iso(effective) }));
                setTerminationState("in_progress");
                setClosureTasks({});
                setShowTerminationForm(false);
                logAudit(
                  `Termination initiated: ${terminationDraft.type}, notice served ${iso(servedOn)}, `
                  + `${terminationDraft.noticeBasis}, effective ${iso(effective)}`
                  + (kind.requiresGround ? ` · breach relied on: ${terminationDraft.ground.trim()}` : "")
                );
                notify("Legal", `Termination initiated for ${draftRecord?.id}, review required`);
                flash(kind.cure
                  ? `Notice served. ${SUPPLIER.name} has until ${pretty(effective)} to remedy the breach.`
                  : `Notice served. The contract ends on ${pretty(effective)}.`);
              }}>Serve notice</Btn>
            </div>
          </SmallDialog>
        );
      })()}

      {viewingContract && (
        <SmallDialog title={viewingContract.supplier} kicker={viewingContract.id} onClose={() => setViewingContract(null)}>
          <div style={{ display: "grid", gap: 10, marginTop: 4 }}>
            <div><div style={kicker}>Agreement type</div><div style={{ fontSize: 14 }}>{viewingContract.agreementType}</div></div>
            <div><div style={kicker}>Status</div><Tag c={statusColor(viewingContract.status)}>{viewingContract.status}</Tag></div>
            <div><div style={kicker}>Risk level</div><Tag c={viewingContract.riskLevel === "high" ? RED : viewingContract.riskLevel === "medium" ? AMBER : GREEN}>{viewingContract.riskLevel}</Tag></div>
            <div><div style={kicker}>Service category</div><div style={{ fontSize: 14 }}>{viewingContract.category}</div></div>
            <div><div style={kicker}>Annual value</div><div style={{ fontSize: 14 }}>{formatMoney(viewingContract.value, viewingContract.currency)}</div></div>
            <div>
              <div style={kicker}>Term</div>
              <div style={{ fontSize: 14 }}>
                {viewingContract.evergreen ? "Evergreen, no expiry date" : `Ends ${viewingContract.endDate}`}
              </div>
              {viewingContract.evergreenNote && (
                <p style={{ fontSize: 12, opacity: 0.7, margin: "4px 0 0", lineHeight: 1.55 }}>{viewingContract.evergreenNote}</p>
              )}
            </div>
            <div><div style={kicker}>Routed to</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3 }}>
                {(viewingContract.routedTo || []).map((q) => <Tag key={q} c={GRAY} style={{ fontSize: 10 }}>{q.replace("_", " ")}</Tag>)}
              </div>
            </div>
            <div><div style={kicker}>Why you can see it</div><div style={{ fontSize: 13 }}>{contractVisibility(currentRole, viewingContract).why}</div></div>
          </div>
          <p style={{ fontSize: 11.5, opacity: 0.5, margin: "12px 0 0", lineHeight: 1.55 }}>
            Summary-only record. The full workspace (drafting, redlining, signature) runs on the contract you draft
            in this session.
          </p>
        </SmallDialog>
      )}

      {showAddContract && (
        <SmallDialog title="Quick add contract" onClose={() => setShowAddContract(false)}>
          <Field label="Supplier name" style={{ marginBottom: 10 }}>
            <input className="input" value={newContract.supplier} placeholder="e.g. Northgate Security Services"
              onChange={(e) => setNewContract((c) => ({ ...c, supplier: e.target.value }))} />
          </Field>
          <Field label="Agreement type" style={{ marginBottom: 10 }}>
            <select className="input" value={newContract.agreementTypeCode}
              onChange={(e) => setNewContract((c) => ({ ...c, agreementTypeCode: e.target.value }))}>
              {Object.values(AGREEMENT_TYPE_BY_CODE).map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Service category" style={{ marginBottom: 10 }}>
            <input className="input" value={newContract.category} placeholder="e.g. Hard FM"
              onChange={(e) => setNewContract((c) => ({ ...c, category: e.target.value }))} />
          </Field>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 12, cursor: "pointer" }}>
            <input type="checkbox" checked={newContract.evergreen}
              onChange={(e) => setNewContract((c) => ({ ...c, evergreen: e.target.checked }))} />
            Evergreen, no expiry date
          </label>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn onClick={() => setShowAddContract(false)} variant="secondary">Cancel</Btn>
            <Btn variant="primary" onClick={() => {
              if (!newContract.supplier.trim()) { flash("Enter a supplier name first."); return; }
              const id = `CLM-${1000 + Math.floor(Math.random() * 9000)}`;
              const type = AGREEMENT_TYPE_BY_CODE[newContract.agreementTypeCode];
              setExtraContracts((list) => [...list, {
                id, supplier: newContract.supplier.trim(),
                agreementTypeCode: newContract.agreementTypeCode,
                agreementType: type?.name, family: type?.family || "-",
                riskLevel: type?.riskLevel || "medium",
                status: "Draft", value: 0, currency: "GBP",
                startDate: new Date().toISOString().slice(0, 10),
                endDate: newContract.evergreen ? null : null,
                evergreen: newContract.evergreen,
                category: newContract.category.trim() || "Other",
                routedTo: type?.riskLevel === "high" ? ["legal", "contract_management"] : ["contract_management"],
                owner: CONTRACT_OWNER, requestedBy: SUPPLIER.businessOwner,
              }]);
              logAudit(`Contract ${id} quick-added (${newContract.supplier.trim()})`);
              flash(`${id} added and routed.`);
              setNewContract({ supplier: "", agreementTypeCode: "sow", category: "", evergreen: false });
              setShowAddContract(false);
            }}>Add contract</Btn>
          </div>
        </SmallDialog>
      )}

      {notice && <div className="clm-notice">{notice}</div>}
    </div>
  );
}

function SmallDialog({ title, kicker: k, children, onClose }) {
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" style={{ width: "min(520px, 95vw)" }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-3)", marginBottom: 8 }}>
          <div>
            {k && <div className="card-kicker">{k}</div>}
            <div className="dialog-title">{title}</div>
          </div>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AdminPage({ onOpenPlaybook }) {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <UserCog size={20} /><h1 style={{ margin: 0 }}>Admin</h1>
      </div>
      <p className="text-muted" style={{ marginBottom: 20, lineHeight: 1.6 }}>
        System Administrators configure the catalogue, templates, playbook and approval matrix, not individual
        contracts. That separation is the point: the person who sets the thresholds should not also be the person who
        applies them. Switch role to open a contract.
      </p>
      <div className="card">
        <div className="card-title">Template catalogue</div>
        <p className="card-body">15 templates across 14 agreement types. Global by default; jurisdiction splits only where a legal difference forces one, and each split states its reason.</p>
      </div>
      <div className="card">
        <div className="card-title">Clause playbook</div>
        <p className="card-body">17 clauses, each with standard, fallback and walk-away positions, an approving role and an escalation role.</p>
        <div><Btn onClick={onOpenPlaybook} icon={BookOpen} variant="secondary" small>Open the playbook</Btn></div>
      </div>
      <div className="card">
        <div className="card-title">Approval matrix</div>
        <p className="card-body">Contract Owner → Contract Manager → Legal. Fallback-band deviations are approved by the clause's approving role; walk-away breaches escalate to Head of Legal, Head of Finance or Director of Contract Management as the playbook names.</p>
      </div>
      <div className="card">
        <div className="card-title">Role visibility</div>
        <p className="card-body">Contracts are visible to a role when routed to that role's queue. Legal additionally has standing visibility of every high-risk agreement type, routed or not. A high-risk contract reaching signature without Legal being able to open it is the failure that rule exists to prevent.</p>
      </div>
    </div>
  );
}
