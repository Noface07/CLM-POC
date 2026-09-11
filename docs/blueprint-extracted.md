Facilities ManagementAI-Powered Supplier Contract Lifecycle Management POC
Detailed Product &amp; Technical Process Blueprint | POC / Demo
Version 1.0 | 27 August 2026

# 1. Purpose and Executive Context
This document is the detailed functional blueprint for a proof-of-concept (POC) demonstrating an AI-powered Contract Lifecycle Management (CLM) solution for Facilities Management supplier onboarding journey. It is intended for the Product Owner, Solution Architect, Salesforce team, CLM developers, integration team, UX team, and demo team.
The POC deliberately uses AI selectively. Deterministic workflow, Salesforce data, templates, rules, approval matrices and integrations should be handled by conventional automation. AI is reserved for high-value unstructured-data tasks: contract change intelligence during negotiation and obligation extraction after execution.

# 2. Context and strategic transformation agenda Alignment
The client is a global food services and facilities management organization. Its Facilities Management offering covers hard FM, soft FM and integrated services, with emphasis on safe, compliant, efficient and sustainable operations. The organization states that its FM model combines global scale with local execution and measurable outcomes.
The client launched strategic transformation agenda, targeting above 5% organic growth and above 5% operating margin by FY2030. This plan calls for strengthening commercial capabilities, simplifying the operating model, and investing in technology, data, digital and AI to support growth, productivity and decision-making.
Client’s priority
POC design response
Expected value
Simplify operating model
One connected supplier-to-contract-to-PO journey
Fewer handoffs and duplicate entry
Increase technology investment
Custom CLM integrated with Salesforce
Reusable digital contracting capability
Scale Digital &amp; AI
AI only at high-value cognitive points
Controlled AI footprint and governance
Productivity
Auto-populate contracts and automate routing
Less manual contract administration
Decision-making
AI change summary + exception escalation
Faster, focused human review
Competitiveness / growth
Faster supplier activation and controlled contracting
Reduced time-to-PO and better supplier readiness
Margin
Reduce manual effort and contractual leakage
Lower cost-to-serve and better control

# 3. POC Scope
In scope:
Supplier onboarding context originating in Salesforce.
Create Contract action from the supplier/onboarding record.
Custom CLM workspace and contract record.
Contract type and template selection by the user.
Automatic population of contract fields from Salesforce and onboarding data.
Document generation from approved templates.
Internal review and approval routing.
Supplier negotiation and contract versioning.
AI-powered redline/change summarization.
Human-controlled exception approvals.
E-signature and execution status.
Executed-contract activation and PO eligibility.
AI obligation extraction from the executed contract.
Obligation tracking, amendment, renewal, expiry and termination lifecycle.
Salesforce synchronization and audit trail.
Out of scope for the POC: replacing ERP/procurement, full supplier master management, autonomous legal negotiation, autonomous contract approval, and enterprise-wide policy finalization.

# 4. Target End-to-End Process
1. Salesforce Supplier / Supplier Onboarding
2. Create Contract
3. Contract Type &amp; Template Selection
4. Contract Record Creation
5. Contract Data Auto-Population
6. Draft Contract Generation
7. Internal Review
8. Supplier Negotiation
9. AI Contract Change Intelligence
10. Exception / Approval Routing
11. Final Approval
12. E-Signature
13. Contract Executed &amp; Activated
14. PO Eligibility / PO Release
15. AI Obligation Extraction
16. Obligation Monitoring
17. Amendment / Change
18. Renewal
19. Expiry
20. Termination / Closure

# 5. System Architecture and Integration Model
Logical systems:
Salesforce CRM / Supplier onboarding context – system of engagement and source for supplier/business data available to the POC.
Custom CLM application – contract workspace, metadata, documents, workflow, approvals, versioning and lifecycle management.
AI service / model gateway – controlled AI invocation for change summarization and obligation extraction only.
Document/template service – deterministic merge of approved templates with structured contract data.
E-signature platform – signature envelope creation, status callbacks and executed-document retrieval.
Procurement / ERP / PO system – downstream PO eligibility and/or PO creation; exact target system to be validated.
Notification/email service – workflow notifications and reminders.
Integration principle: Salesforce remains the source of business context; CLM becomes the system of record for the contract lifecycle in the POC. Downstream procurement remains the source of truth for PO execution. The exact production system-of-record boundaries must be validated with the organization.

# 6. Detailed Functional Process

## 6.1 Supplier Onboarding → Contract Initiation
Trigger: Supplier onboarding reaches the business state that permits contracting.
Salesforce displays Create Contract.
User clicks Create Contract. The CLM application opens in a contextual session carrying Supplier ID and onboarding record reference.
CLM validates that the supplier is eligible to initiate contracting. If mandatory onboarding prerequisites are incomplete, initiation is blocked and missing items are displayed.
Recommended POC fields: Supplier ID, Supplier Legal Name, Supplier Category, Service Category, Facility/Site, Business Unit, Country/Region, Supplier Onboarding Status, Business Owner, Procurement Owner.

## 6.2 Contract Type &amp; Template Selection – No AI
The user selects Agreement Type; the POC should not spend AI tokens determining a value that the business process can determine explicitly.
Suggested Agreement Type picklist: Supplier Services Agreement; Master Services Agreement; Facilities Management Services Agreement; Statement of Work; Service Order / Work Order Agreement; Amendment; Renewal / Extension; NDA / Confidentiality Agreement; Other – requires Contract Manager review.
Suggested Contract Template picklist: Standard Supplier Services Template; FM Hard Services Template; FM Soft Services Template; Integrated FM Template; SOW Template; Amendment Template; Renewal / Extension Template; NDA Template.
Template availability should be filtered by Agreement Type, Service Category, Country/Legal Entity and Contracting Policy where applicable.
Store Template ID and Template Version on the contract record so the exact approved template used is auditable.

## 6.3 Contract Record Creation
Create a Contract record with a unique Contract ID and link it to Supplier, Salesforce onboarding record and, where applicable, facility/site and business owner.
Mandatory POC fields: Contract ID (system generated), Supplier, Legal Entity, Agreement Type, Contract Template, Contract Owner, Business Owner, Service Category, Facility/Site, Contract Start Date, Contract End Date, Contract Currency, Contract Value, Contract Status, Effective Date, Approval Status, Signature Status.
Conditional mandatory fields: Renewal Type and Notice Period for renewable contracts; SLA/Service Level fields for FM service contracts; Parent Contract for amendments; PO requirement flag; Insurance requirement; country-specific legal entity; data/privacy/security fields where applicable.
System fields: Created By, Created Date, Last Modified By, Last Modified Date, Current Version, Previous Version, Audit Status.

## 6.4 Deterministic Contract Preparation – No AI
Retrieve structured values from Salesforce/CLM.
Validate required fields and data types.
Merge data into the selected approved template.
Populate clauses using deterministic rules where clause selection is based on explicit metadata, such as service category, jurisdiction, legal entity or contract type.
Generate Draft Version 1.0.
Store the generated document and template version against the contract record.
Do not use generative AI to merge structured fields or create standard language that already exists in approved templates.

## 6.5 Internal Review and Approval
Route the draft through configurable workflow.
Baseline approval path for POC: Contract Owner → Procurement/Contract Manager → Legal → Final Business Approver, with only applicable steps activated.
Use deterministic approval rules: contract value threshold, non-standard template, jurisdiction, supplier category, duration, commercial deviations and risk flags.
Approvers see contract metadata, document, approval history and outstanding exceptions.
Approval decisions: Approve; Reject; Request Changes; Delegate (if permitted).
Every decision records user, timestamp, decision, comments and contract version.

## 6.6 Supplier Negotiation and Versioning
Send approved draft to supplier through the selected collaboration/e-signature or document exchange mechanism.
Supplier returns a redlined version.
Create a new immutable contract version. Never overwrite the prior version.
Capture version number, source, uploaded by, upload timestamp and status.
Trigger AI only when a negotiation/redline version is received and comparison is required.

## 6.7 AI Contract Change Intelligence – Primary AI Use Case
Input: previous approved/issued contract version and supplier-returned redline version.
AI task: identify material textual changes and summarize them in business language.
Output fields: Clause/Section, Previous Position, Proposed Position, Change Type, Materiality, Business Impact Summary, Suggested Review Owner, AI Confidence/Quality Indicator.
Suggested change types: Commercial; Liability/Risk; Payment; Termination; Renewal; SLA/Performance; Insurance; Confidentiality; Data/Privacy; IP; Compliance; Other.
Materiality levels: High; Medium; Low; Informational.
AI should not approve, reject, or alter the contract.
AI should not be invoked for unchanged documents or purely administrative metadata changes.
Persist the AI result with model/version, invocation timestamp, source document versions and prompt/configuration identifier where technically supported, to support auditability.

## 6.8 Exception Approval / Human-in-the-Loop
Material AI findings become structured exceptions.
Example POC thresholds: High materiality → Legal + Contract Manager; high-value commercial deviation → Procurement/Finance; liability deviation → Legal/Risk; payment-term deviation → Finance/Procurement.
Approver can Accept Exception, Reject Exception, Request Supplier Revision, or Escalate.
The AI recommendation is advisory; the human decision is authoritative.
Exception status must be visible on the contract record and included in the approval audit trail.

## 6.9 Final Approval and Signature
After all exceptions are resolved and required approvals are complete, contract status moves to Ready for Signature.
Generate the final execution version from the approved contract version.
Send execution package to e-signature platform.
Capture envelope ID, signatories, signature status and timestamps.
On successful signature callback, store executed document and mark Contract Status = Executed/Active according to effective-date rules.
On failed/declined/expired signature, route back to appropriate owner.

## 6.10 Contract Activation and PO Eligibility
After successful execution, CLM validates required activation conditions.
Set Contract Status = Active when execution and effective-date conditions are satisfied.
Expose PO Eligibility = Yes only when required contract conditions are satisfied.
Recommended POC control: if Contract Status is not Executed/Active, PO Eligibility remains No.
Send the contract ID, supplier ID, service/facility reference, effective dates and relevant commercial metadata to the downstream procurement/PO system.
PO issuance remains a downstream procurement responsibility; CLM provides eligibility/control information unless the production design explicitly delegates PO creation.

## 6.11 AI Obligation Extraction – Secondary AI Use Case
Trigger after contract execution or when an executed/amended version becomes active.
AI extracts obligations from the executed contract.
Suggested output: Obligation ID, Clause Reference, Obligation Description, Obligor, Beneficiary, Frequency, Due Date/Trigger, Notice Period, Evidence Required, Consequence/Remedy, Source Text Reference, Confidence.
Examples for FM suppliers: insurance renewal, certifications, SLA reporting, service reviews, compliance submissions, audit requirements, preventive maintenance commitments, reporting cadence.
AI-created obligations should enter a Pending Validation state for human confirmation before becoming authoritative.
Once validated, create structured obligation records and reminders.

## 6.12 Post-Contract Lifecycle
Amendment: user selects Create Amendment; system links amendment to parent contract, captures reason/effective date and generates amendment template. On execution, update contract version and relevant metadata.
Change: distinguish contractual amendment from administrative metadata change. Material contractual changes require approval and new versioning.
Renewal: trigger based on renewal date and notice period. System creates renewal task/workflow and presents contract performance/obligation information.
Expiry: automated reminders at configurable intervals (example POC: 120/90/60/30 days) and expiry status transition if not renewed.
Termination: capture termination type, effective date, notice basis, approvals and obligations remaining after termination. Mark contract Terminated/Closed only after required closure activities.
All lifecycle events maintain a complete version and audit history.

# 7. Contract Data Model – POC
Field
Type
Source
Required
Contract ID
Auto-number
System
Mandatory
Supplier
Lookup
Salesforce/CLM
Mandatory
Salesforce Supplier/Onboarding ID
External ID
Salesforce
Mandatory
Legal Entity
Picklist/Lookup
CLM/Salesforce
Mandatory
Facility/Site
Lookup
Salesforce/CLM
Conditional
Service Category
Picklist
Salesforce/CLM
Mandatory
Agreement Type
Picklist
User
Mandatory
Contract Template
Picklist
User
Mandatory
Template Version
Text
System
Mandatory
Contract Owner
Lookup
User
Mandatory
Business Owner
Lookup
User
Mandatory
Contract Manager
Lookup
User
Conditional
Contract Value
Currency
Salesforce/CLM
Mandatory
Currency
Picklist
Salesforce/CLM
Mandatory
Start Date
Date
User/System
Mandatory
End Date
Date
User/System
Mandatory
Renewal Type
Picklist
User
Conditional
Renewal Notice Period
Number
User/Template
Conditional
Payment Terms
Picklist/Text
Salesforce/CLM
Conditional
SLA Required
Boolean
User/Rule
Conditional
PO Required
Boolean
Rule
Mandatory
PO Eligibility
Boolean
System
Mandatory
Contract Status
Picklist
System
Mandatory
Approval Status
Picklist
System
Mandatory
Signature Status
Picklist
System
Mandatory
Current Version
Text
System
Mandatory
Parent Contract
Lookup
CLM
Conditional
Risk/Exception Status
Picklist
System
Conditional
Effective Date
Date
Signature/Rule
Conditional

# 8. Suggested POC Picklist Values

## Contract Status
Draft, Internal Review, In Negotiation, Exception Review, Approved, Ready for Signature, Signature Pending, Executed, Active, Amendment in Progress, Renewal in Progress, Expiring, Expired, Termination in Progress, Terminated, Cancelled

## Approval Status
Not Started, In Progress, Approved, Rejected, Changes Requested, Exception Approval Required

## Signature Status
Not Ready, Pending, Partially Signed, Executed, Declined, Expired, Cancelled

## Renewal Type
None, Auto-Renewal, Manual Renewal, Extension Option

## Exception Status
None, Open, Under Review, Approved, Rejected, Resolved

## Service Category
Hard FM, Soft FM, Integrated FM, Cleaning, Technical Maintenance, Engineering, Grounds/Landscaping, Waste Management, Energy Management, Other

## AI Materiality
High, Medium, Low, Informational

# 9. User Roles and Responsibilities
Facilities / Business Requestor – Initiates contracting; provides business context; selects agreement type/template; tracks status.
Procurement / Supplier Manager – Validates supplier/commercial information; manages supplier-side negotiation and exceptions.
Contract Manager – Owns contract workflow, metadata, versioning, approvals and lifecycle.
Legal – Reviews legal deviations and high-impact clauses; approves/rejects legal exceptions.
Finance / Commercial Approver – Reviews financial/commercial deviations where thresholds are exceeded.
System Administrator – Maintains templates, rules, approval matrices and configuration.
AI Service – Provides change summaries and obligation extraction only; never acts as final approver.

# 10. Audit, Security and AI Governance Requirements
Every contract version must be immutable and traceable.
Every approval, rejection, exception and signature event must be timestamped and associated with a user/system identity.
AI calls should be event-driven and limited to defined triggers.
Store source document/version references for each AI result.
Store AI model/configuration metadata where supported.
AI output must be marked advisory until human validation.
No autonomous contract approval or autonomous legal decision-making in the POC.
Access must be role-based; users should only see contracts within their authorized scope.
Sensitive contractual documents must be encrypted at rest and in transit.
Define retention and deletion rules for documents, AI inputs/outputs and audit logs before production.
Prompt/model changes should be version controlled for reproducibility.
AI failure must not block the business process unnecessarily; provide manual review fallback.

# 11. Integration Requirements
Integration
Direction
Key data
Trigger
Salesforce ↔ CLM
Bi-directional
Supplier, onboarding status, facility, owner, commercial metadata, contract status/link
Create Contract; status updates
CLM ↔ E-signature
Bi-directional
Final document, signers, envelope ID, signature status, executed document
Ready for Signature
CLM → Procurement/PO
Outbound
Supplier ID, Contract ID, effective dates, PO eligibility, relevant commercial data
Contract Active
CLM ↔ AI Service
Controlled
Document versions / extracted contract text; AI findings
Redline received; contract activated
CLM → Notification
Outbound
Tasks, approvals, renewals, obligations
Workflow/event

# 12. POC Demonstration Scenario
Recommended scenario: the organization Facilities Management needs to onboard a supplier for a defined facility service. The supplier has completed the relevant onboarding/qualification activities. The business user creates a contract from Salesforce, selects the appropriate FM agreement type and template, and the CLM system automatically creates the contract from structured supplier and commercial data. The supplier returns a redlined version. AI summarizes the material changes and highlights three exceptions. Human approvers resolve the exceptions. The final contract is approved and sent for e-signature. Once executed, the contract becomes active and PO eligibility is enabled. The executed contract is then processed by AI to extract obligations, which are validated and tracked. Finally, the demo fast-forwards to an amendment and renewal scenario.

# 13. POC Acceptance Criteria
Create Contract from Salesforce opens the CLM workspace with supplier context.
User can select Agreement Type and Template from configured picklists.
Mandatory field validation prevents incomplete contract creation.
Approved template is populated deterministically from structured data.
Contract versions are created without overwriting prior versions.
Supplier redline can be uploaded and compared with the prior version.
AI produces a concise, structured change summary with clause references and materiality.
AI findings can create exception approvals; humans retain final decision authority.
Approval history and exception decisions are auditable.
Executed contract is received and stored after e-signature.
Contract Active status controls PO Eligibility.
Executed contract can trigger AI obligation extraction.
Obligations require human validation before becoming authoritative.
Amendment, renewal, expiry and termination can be initiated and tracked.
Salesforce reflects contract status and key lifecycle milestones.
AI is not invoked for deterministic tasks such as template selection, field merging, routing based on explicit rules, or standard status transitions.

# 14. POC Configuration Assumptions to Validate with the organization
Exact Salesforce object/data model for supplier onboarding.
Exact downstream procurement/ERP/PO platform and integration method.
Whether executed contract is a mandatory hard gate for PO issuance globally or for this FM process only.
Global vs local legal entity and jurisdiction-specific templates.
Approved agreement types and template catalogue.
Approval thresholds and delegation-of-authority matrix.
Definition of high/medium/low contractual deviations.
Legal and procurement ownership of exception approvals.
Required e-signature platform.
Required contract retention and document storage policy.
Obligation categories and responsible owners.
Renewal/expiry reminder windows.
Termination and post-termination obligation rules.
Approved AI model/provider, data residency, privacy, audit and retention requirements.

# 15. Design Principle
Use AI where interpretation is difficult; use automation where rules are sufficient; keep humans accountable for decisions.
This principle is central to the POC. The objective is not to maximize AI usage or token consumption. The objective is to create a simpler, faster, more controlled contracting process that supports the organization’s strategic transformation agenda agenda through productivity, decision quality, operational simplification and scalable technology.