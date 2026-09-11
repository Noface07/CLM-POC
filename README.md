# FM Supplier CLM demo

A working contract lifecycle demo for facilities management: draft a contract from the catalogue,
negotiate it as a Word document with tracked changes, decide each change against the clause
playbook, sign it, and track the obligations that fall out of the signed PDF.

```bash
npm install
npm run dev           # http://localhost:5173
npm run selftest      # 482 checks over the engines below
npm run export:docx   # write the catalogue out as Word documents
npm run lint
```

No backend and no account needed. Everything runs in the browser.

## The four tabs

| Tab | What it is |
| --- | --- |
| **Dashboard** | Lifecycle distribution, open exceptions by playbook band, renewal runway, value by category, all computed from the contracts the current role can see. |
| **Contracts** | The list, role-filtered, with a column saying *why* each row is visible to you. |
| **Contract workspace** | The lifecycle chevron, the document with its tracked changes and comments, internal review, and the AI panel. |
| **Obligations** | Extracted from the executed PDF by pdf.js, advisory until a human validates each row. |

## The claim that matters: the document is real

The contract is a **Word document from drafting to signature, and a PDF only once executed.** That
is not a presentation choice: a PDF cannot carry a tracked change, and a signed contract should not
be editable.

- `src/lib/docx.js` writes genuine OOXML: `<w:ins>` and `<w:del>` with author and date,
  `word/comments.xml` with anchored ranges, and a VML watermark in the page header. A file
  downloaded from the demo opens in Word with the changes and comments live and acceptable.
- `src/lib/zip.js` is the ZIP writer that makes that possible: stored entries only, about sixty
  lines, no compression dependency.
- `src/lib/pdf.js` reads PDFs with pdf.js and writes the one PDF this app produces. Obligation
  extraction parses the bytes of the PDF the demo itself generated at execution, so a term changed
  during negotiation shows up in the obligations.
- `src/lib/redline.js` is a word-level LCS diff with a semantic-cleanup pass, so a rewritten
  sentence reads as one strike-through plus one underline rather than a dozen alternating
  fragments. Accepting a change adopts the insertion and drops the deletion; rejecting does the
  reverse, and rejecting everything restores the draft byte for byte.
- `src/lib/docx-import.js` reads a Word file the **counterparty** sends: `src/lib/unzip.js` inflates
  the ZIP (`DecompressionStream`, no library), `src/lib/xml.js` parses the OOXML, and every
  `w:ins`, `w:del` and comment anchor comes out with its author and date. The supplier tab accepts a
  real upload; what it cannot read (tables, numbering, moved text) it lists rather than silently
  dropping. A file returned with no revisions is refused, because Word with track changes switched
  off produces a document that looks like agreement.

## The claim that matters: the playbook decides

AI change intelligence says *what moved*. On its own that is a summary. `src/lib/playbook.js` places
the proposed term in its clause's three-position band and names who may approve it, which is the
difference between a tool that reads contracts and one that moves them.

Findings are **derived from the tracked changes**, not listed separately: a hardcoded finding list
and a hardcoded redline drift apart the moment either is edited.

Three things it deliberately does not do:

- **Guess.** An unmatched finding returns nothing and the UI says the playbook is silent.
- **Trust arithmetic alone.** A cap at 125% that also covers personal injury is inside the band and
  still unacceptable. Red flags override a comfortable band placement.
- **Decide where the band cannot.** Where standard and fallback carry the same number, the number is
  not the variable, and the UI says so rather than inventing a verdict.

The playbook is readable from a button in the header on every tab, and from every finding.

### Cross-references: the finding a diff cannot produce

Clause 7.4 says the indemnity is not subject to the cap in clause 7.2. The supplier edits 7.2 and
leaves 7.4 alone. A review that reads the tracked changes sees a cap moving from 125% to 100%, a
fallback-band concession, and cannot see that the same edit has just repriced an uncapped
indemnity, because nothing in the diff of 7.2 contains that fact.

`src/lib/crossref.js` builds the reference graph from the whole assembled document and pulls both
directions into the review: what a clause points at, and **what points back at it**. The second is
the half a paragraph-at-a-time review cannot have. Clauses whose meaning moved without their text
changing are called out at the top of the AI panel, named in the finding that caused them, and
included in the model's prompt context.

**A clause on its way out takes its references with it.** Striking out 7.2 leaves 7.4
saying the indemnity is not subject to a limit that will no longer exist. There is a
warning on the Delete button, but a pre-flight dialog fires once, for the person clicking
it, on the one path that goes through that button: not when the counterparty strikes the
clause out in their own copy, not when their marked-up file is imported, and not after
it has been dismissed. So `danglingReferences` checks the reference **where it is read**,
and every clause left pointing at a struck-out one says so in the document itself. It is
computed against the document as it stands, so rejecting the deletion clears the warning
without anything having to remember it was shown.

### Comments

The counterparty's comment on a clause appears inside the finding for that clause, because the band
places the change and the comment carries the reason: *"our insurers will not support a cap above
contract value"* is negotiating intelligence the band cannot see. Replies and resolution work from
either the document margin or the finding.

The panel is a list of rows and **one** detail view. A row answers the three questions triage asks:
which clause, how bad, who decides, and carries Accept, because the verdict line above the button
is what an accept is decided on. Everything else opens the exception dialog, which is the whole
record: the AI's summary and the before-and-after, the playbook's verdict with its full band, the
clauses that read with this one, the counterparty's comment thread, and the four decisions.

There used to be an inline expansion *and* a dialog showing overlapping-but-different subsets of the
same finding, so a reviewer could decide on whichever half was in front of them. There is now one.

### Countering a proposal, and what it is measured against

They struck the wording we drafted and proposed their own; we answer with a third
position. Two different things wear the same Edit button, and they are not the same move.

**Revising our own unsent markup** is one open proposal being rewritten. It is diffed from
the clause's original wording and replaces itself, because a trail through positions we
never put to anybody is not a negotiation record.

**Countering theirs** is a rejection of their number and an answer to it. Recording it as a
move from the wording we drafted states two falsehoods: that we moved off our own position
unprompted, and that they never asked for theirs. The second matters most, because their
proposal and the reason they gave for it are the record.

So a counter keeps their markup and layers ours on top, the way Word does when you edit
someone else's tracked change. We draft 12 days, they propose 6, we answer 9, and the
clause reads `within ~~12~~ ~~6~~ 9 days`: what we drafted, what they asked for, what we
answered. The strike on their 6 carries **both** attributions, so the document says
"proposed by them, struck by us" rather than crediting us with deleting wording that was
never in the contract; `src/lib/docx.js` writes that as OOXML's nested `w:ins`/`w:del`,
which is how Word keeps both names.

`previous` on our change is **their** text, because that is the position we answered, and
`base` carries the wording originally agreed. The distinction is not cosmetic: `previous`
is what the playbook band, the impact sentence and the audit line are all computed from,
and measuring a counter from the wrong end reads the negotiation backwards.

Their proposal stays on the record marked **superseded**, decided by our counter rather
than separately: one clause, one open decision. Accept our counter and their wording goes
with it; reject it and their proposal is back on the table exactly as it was, which is
only possible because it was never removed from the document.

**The redline keeps its markup.** Deciding a change restyles it: an accepted insertion goes plain, a
rejected one disappears, but the tracked changes stay on the v1.x tab as the negotiation record. The
clean copy is the executed version, and nowhere else.

### The version moves when the document changes hands

Every exchange is a version, in both directions. We draft v1.0 and send it; their markup
comes back as v1.1; our counter goes out as v1.2; their revision returns as v1.3. Five
exchanges, five versions, and the number on the page is the number in the compare picker
and the number in the version history, because they are all read from `meta.version`
rather than kept separately.

It did not use to be. The version advanced only when the **counterparty** acted, so a
counter-proposal went back to them carrying the number they had given us: two materially
different contracts under one version, one of them a `.docx` that had left the building.
A version that moves only on their turn is not a version of the document, it is a count
of their turns. Alongside it ran a second numbering keyed on array position and a third
written by hand, so the same negotiation was simultaneously v1.2, v1.4 and something
else again in the history panel.

**Marking a working copy up is not a hand-over**, so it does not move the version on its
own; returning it does. Both routes the supplier has to mark the document up therefore
reach the same version. When the bump lived in the scripted-markup path instead, a
supplier who edited clause by clause returned a document still stamped with the version
we sent them, and the version history had nothing to tell the redline apart from the
draft it came from.

**Only the newest stage of the document is editable**, and only while it is still Word.
The stage list is built in order and carries only the stages that exist, so its last entry
is the live one; keying off that rather than naming a stage means executing the contract
closes the redline for the same reason a redline closes the draft. Every stage behind the
live one stays readable and downloadable — it is the negotiation record — and says which
document to make the change on.

**The draft stops being editable once a redline exists.** It is still readable and still
downloadable, because it is the record of what went out, but it is not the document being
negotiated. It stayed open to edits, and an edit made while looking at it landed on the
redline, because that is where edits go once one exists: you were editing a document you
could not see.

Which document is on screen is now a separate vocabulary — `draft`, `redline`,
`executed`, `amended` — because view slots and version numbers sharing a namespace is how
"v1.1" came to mean "the redline tab" on a document stamped v1.3.

### Nothing we have not approved reaches them

Deciding the supplier's tracked changes is routed: each is placed in its band and sent to
the role that may approve that position. **Authoring our own wording on their redline was
governed by nothing** — it went back over a button gated on `!readOnly`, so our position
reached the counterparty having been read by exactly one person: whoever typed it. That is
the same failure the internal-review reset exists to prevent, one round later.

Resetting the whole internal review would be the wrong answer: it clears approvals on
eighteen clauses because one moved. `src/lib/counter.js` gives the proportionate one. Our
counter is placed in the band exactly as theirs would be, and the role the playbook names
has to approve that position before **Send back** is enabled. A counter at or better than
our own standard position needs nobody, because there is no exception to approve and
requiring a signature to propose our own wording is how approval steps become things
people click through without reading.

The approvals are cleared once the round is sent: they were approvals of those changes,
and the next round's counters are approved on their own merits.

**An invalidated internal review ends when the reviewers have looked again**, not when
the approval status next reads Approved. Those stop being the same thing the moment a
redline is back: the status turns to *Exception Approval Required* for a reason that has
nothing to do with the reviewers, and a banner keyed on completeness reappears telling
three people who have already approved to approve again. `src/lib/lifecycle.js` holds that
distinction, and holds it where the selftest can reach it — the lifecycle state machine
lived in `App.jsx`, so the most important logic in the product was the only logic with no
tests, and a stale banner is what that cost.

**Findings belong to the version they were derived from.** Read against any other version
they are answering a question the reader is not asking, so the panel says which version
they describe and offers to re-derive. It settles by itself on going back to that version:
a prompt that has to be dismissed is a prompt that gets dismissed while still true.

**Findings say when they are out of date.** They are derived from the tracked changes, so
editing the redline dates them, and a clause you have just written carries no band until
they are re-derived. The panel says so and offers the button rather than re-running by
itself, because with live AI on, re-deriving is a real API call and spending one per
keystroke is not the demo's decision to make.

**Requesting a revision produces a new version.** It is not a flag on a change: the counterparty
returns fresh markup, the document moves to v1.2, and the finding is re-derived against what they
actually sent. Watch clause 7.2: reinstating the personal-injury carve-out moves it from
past-walk-away to inside the fallback band without the number changing at all.

Comment threads run **both ways**. The counterparty can reply and resolve in their own view; they
cannot decide tracked changes, because that is the paper owner's call. A thread one side cannot
answer is a memo.

The demo redline is written to land in **every** band position: one better than standard, two
inside fallback, two past the walk-away line, one the band cannot place. A redline where everything
is a walk-away makes the playbook look like a rejection machine and hides the case it exists for:
the real concession that is still inside what we accept without escalation.

**Resolving closes the conversation; accepting or rejecting decides the change.** They are separate
states on purpose: a clause can have a settled argument and a pending edit, or an accepted edit with
an argument still running underneath it.

## Role-based access

`src/lib/rbac.js` keeps two questions separate:

1. **Which contracts can this role see?** Driven by routing. A contract routed to Legal appears in
   Legal's list; one that was never routed to them does not. Legal additionally has standing
   visibility of every high-risk agreement type: `CLM-2090` is one nobody routed to them, and it is
   in the list to make the rule visible.
2. **Which actions can this role take?** A role can read a contract and approve nothing on it.

Switch role in the header and the list, the dashboard totals and the available actions all change.
The count of what was filtered out is always stated: *"you have no access"* and *"there is nothing
here"* are different answers.

## Evergreen contracts

A contract with no expiry is modelled as its own flag, not as a blank or far-future end date. A date
the system treats as an expiry produces renewal reminders for something that never renews; a blank
date with no flag is indistinguishable from missing data.

Choosing evergreen at draft time swaps clause 4.1 for a rolling term, drops the end date from the
document and the merge data, removes the expiry reminders and the renewal task, and moves the
contract out of the runway chart into its own count on the dashboard. The playbook's
`term_renewal.evergreenPosition` holds the position: what makes an evergreen contract safe is the
termination notice, so that is the term to defend.

## Salesforce: where a contract starts and where it ends

The blueprint's process begins in Salesforce (§6.1: onboarding reaches *Ready to Contract*,
the user clicks **Create Contract**, the CLM opens with the supplier's context) and ends there
(§6.10: status, version and **PO eligibility** written back). `src/lib/salesforce.js` speaks the
real REST API; `salesforce/` holds everything the org needs, as metadata, so a fresh org is
four commands rather than an afternoon in Object Manager.

```bash
cd salesforce
sf org login web --alias clmdemo --set-default
sf project deploy start --source-dir force-app --target-org clmdemo
sf org assign permset --name CLM_Integration --target-org clmdemo
sf apex run --file scripts/seed-demo-data.apex --target-org clmdemo
```

**Three objects, each with a different lifetime.** `Account` is the supplier master.
`Supplier_Onboarding__c` is one qualification journey: the four prerequisite checkboxes, service
category, site, anticipated value, and the **Create Contract** formula field, which renders a
link only when every prerequisite is met and *"Onboarding incomplete"* otherwise. `CLM_Contract__c`
is what the CLM writes back, with lookups to both. The blueprint (§14) lists the object model as
still to be validated, which is why the object name is a setting on the panel rather than code.

**The nested shape stops at the boundary.** SOQL reaches the supplier through `Account__r`, and
`flattenOnboarding()` collapses that into the flat shape `SIM_ORG` defines, so nothing downstream
learns which object onboarding lives on. Two ids survive because they answer different questions:
`Id` is the journey status is written back to, `AccountId` is the supplier a contract belongs to.

**The gate is re-run on arrival.** The formula field offered the link because the prerequisites
passed when Salesforce last drew the page. A checkbox can be unticked between that render and
the click, and a URL can be pasted from anywhere, so the CLM decides again for itself. That is the
difference between a gate and a suggestion.

**The writeback is an upsert by external id.** `PATCH /sobjects/CLM_Contract__c/Contract_Reference__c/<id>`
creates on the first call and updates on every one after, so the sync effect firing twice after a
reload duplicates nothing. `PO_Eligibility__c` is true only at Executed or Active — a control, not
a mirror of the status, and the one field procurement actually reads.

### Signing in

Two ways, chosen on the panel. **Paste a session token**: quick, expires with the session, and
the CLM reports a 401 when it does. **Sign in with Salesforce**: OAuth 2.0 authorization code
with PKCE, as a public client, through the `FM_CLM_Demo` connected app in `salesforce/`. It
returns a refresh token, so a 401 is something `sfFetch` handles — refresh once, retry once —
rather than something anyone sees. The connection survives a reload and comes back live on the
next visit; **Disconnect** revokes the refresh token at the org.

Both values the flow needs come from `.env` (see `.env.example`): the org's My Domain, which is
where the browser is sent to sign in and therefore cannot go through the proxy, and the
connected app's consumer key. Neither is a secret. PKCE is the design for a client that cannot
keep one, and a browser cannot.

**What OAuth does not change**, stated on the panel and worth saying out loud in a demo: the
access token still lives in the browser, readable by anything on the page. This is enough to
prove the integration against an org you own. In production the call and the credential belong
on a server (§10), and moving the secret out of the picture is not the same as moving the token.

In dev, `vite.config.js` proxies `/salesforce` to the org, so the token endpoint and the data
API share one route and the browser's cross-origin rules never apply. From a deployed origin
there is no proxy: allowlist the origin under *Setup → CORS*, set the panel's Instance URL to
the real org, and add the deployed address to the connected app's callback list.

`docs/salesforce-round-trip.html` is the command-line setup guide; `docs/salesforce-by-hand.html`
is the same org built by clicking, for an org where the CLI is not an option.

## E-signature: Documenso

`src/lib/documenso.js` talks to the real Documenso v2 API: `/envelope/create` (multipart),
`/envelope/field/create-many`, `/envelope/distribute`, `/envelope/{id}`.

**Is it free?** Self-hosted, yes: it is AGPL-3.0 and there is no licence cost. The hosted service
has a free tier of 5 documents a month, then roughly $25/mo individual, $40/mo for a team of five.
At real contract volume the choice is between paying for the hosted tier and paying for the
infrastructure and maintenance of your own instance.

Before sending, the signature page is a full envelope preparation step: recipients with names,
emails, roles (signer, approver, viewer, CC) and signing order, the email subject and message, and a
rendering of the exact final text that will be flattened into the PDF. Validation runs before the
upload rather than after Documenso rejects it.

Default mode is **simulated**: no key, no network, no account, and the demo runs end to end.
Point it at a real instance in *Integration settings* on the signature page.

Two caveats the UI states rather than hides: Documenso's hosted API sends no CORS headers a browser
will accept, so `vite.config.js` proxies `/documenso` in dev (`VITE_DOCUMENSO_URL=https://…` for a
self-hosted instance); and an API key typed into a browser is readable by anything on the page, so
in production the call and the key belong on a backend.

## The supplier portal, and what a link can do without a backend

The supplier tab is a scoped external view: one contract, no contract list, no internal review, no
playbook. It shows the tokenised access link a real portal would email
(`#supplier?t=…&c=…`), and the link genuinely works: it opens straight into that view and the
session survives a reload or a second tab, because the state is kept in `localStorage`.

**It will not work on someone else's machine, and the panel says so.** With no backend there is
nothing for another browser to fetch. In production the token would be a signed reference to a
server-side session with an expiry, a revoke list and an audit entry for every open, which is also
what makes it safe to email.

## Signing

Signing is a ceremony, not a boolean. **Both parties go through it**: there is no path that marks a
party signed without them signing, and the envelope does not complete until every signer on it has.
The **signing order is enforced** as well: a recipient's Sign button is disabled with an explanation
until everyone ahead of them has signed, which is what Documenso enforces server-side.

Every signer can be signed **from the signature page itself**, with a running `n of m signed` count.
In production each signer gets their own link and only they can use it; the counterparty's own view
is still there under *Supplier view*.

Recipients are **people, not companies**: a company cannot sign, an authorised officer signs on its
behalf, which is what the authority affirmation in the ceremony is about. The recipient list you
edit before sending is the one that goes on the envelope.

Each party sees what they are signing, **types their own full name into an empty field** (a name the
system fills in is the system's assertion, a name the signer types is theirs), sets their title, and
affirms both intent and authority.

The typed name is rendered as a signature: a script face on screen and in Word, Times-Italic in the
PDF, with a small `SIGNED ELECTRONICALLY` caption and the printed name, title, timestamp and method
beneath it. The PDF uses a standard-14 face rather than an embedded script font on purpose: an
unembedded script font substitutes to something arbitrary on the reader's machine, and the execution
page is the last place you want a surprise.

A name that differs from the one the envelope was addressed to is allowed and recorded as a
difference, because people do sign under a fuller form of their name, and because that is also what
the wrong person signing looks like.

## Obligations: extraction over-produces, on purpose

A model told to find every duty in a contract returns "comply with all applicable laws" next to
"renew the insurance before the policy anniversary". Both are obligations; only one can generate a
useful reminder. `src/lib/obligations.js` sorts them on whether a reminder is *possible*, which needs
three things the model cannot invent: **a date or recurrence**, **a named owner**, and **a
consequence for missing it**.

Rows without all three are recorded and left off the schedule: a reminder nobody can act on trains
people to ignore reminders, and the ones they then ignore are the insurance renewals. The demo
extraction returns 11 obligations and schedules 5; the other 6 are one click away with the reason
each was set aside.

## After execution

Extraction is a step. **Keeping the obligations is what the active phase of the lifecycle *is***,
which is why the post-execution panel leads with obligation performance rather than treating it as a
side task, and why validation progress is measured against what can be tracked rather than against
everything extracted.

The panel answers the four questions people actually have once a contract is signed: what is coming
and when (key dates, with the notice deadline before the expiry date, because missing the first is
what causes an unwanted renewal), are we performing, what has changed since signing, and can we get
out. The last one does the arithmetic: notice served today runs its period and lands on a date, and
the panel says whether that date is early enough to be worth the mobilisation, or past expiry, in
which case terminating for convenience achieves nothing and the answer is to let it expire.

### Amending

An amendment has **its own lifecycle** before it touches the parent: drafted, internally reviewed,
sent to the supplier, signed as its own instrument, and only then attached, at which point the
parent version moves. A variation agreed by email and never executed leaves two parties operating on
different terms and both believing they agreed; one that bumps the parent version before it is
signed leaves the system asserting a contract that does not exist.

### Terminating

The effective date is **calculated from the notice period**, not typed: that arithmetic is the
thing people get wrong, and getting it wrong means a contract that ends before the notice has run or
one that runs a month longer than anyone budgeted for.

"Termination in progress" is not a holding state: it is the notice period running, and the contract
stays fully live throughout it: services continue, charges accrue, validated obligations keep
firing. It completes when **both** the effective date has arrived **and** the closure checklist is
done: transition assistance delivered, asset and compliance data handed back, access revoked, final
invoice settled, surviving obligations re-homed. Marking a contract terminated the day notice is
served is how a client ends up with no asset data and a supplier whose badges still work.


## The audit trail

`src/lib/audit.js`. Every approval, tracked-change decision, exception decision, signature and
lifecycle event is appended as an entry carrying **who acted, what they acted on, and the instant
they did it**: an ISO timestamp, the acting role, the person behind that role where the contract
data names one, and the contract id. The instant is stored and the display string is rendered from
it, because a rendered time does not sort and reads differently in a different locale.

Where no person is named for a role, the entry says the role rather than inventing somebody. An
action taken under **All Access (Demo Control)** is flagged as such on its own row and counted at
the top of the page: that role is not a product role, and an action attributable to nobody should
say so rather than be presented as someone's.

**Which contract an entry belongs to is the point, not a column.** A contract's workspace shows that
contract's events and says how many estate-level ones it is therefore not showing. Almost every
action is taken on the contract open in the workspace, so that is the default id, but it is a
default and not a rule: quick-adding a contract files against the contract it creates, not against
whatever happened to be open. A handful of actions genuinely precede any contract, opening
initiation from Salesforce among them, and those are labelled **Estate-level** rather than shown
with a blank cell, because "belongs to no contract" and "we failed to record it" are different
facts.

The **Auditor (read-only)** role gets the estate-wide trail as its own page, filterable by acting
role and by contract, searchable, and exportable as RFC 4180 CSV. The filters appear only when
there is something to choose between: in a single-contract session a one-option dropdown is not a
filter, it is a label that looks like a control. Reading the trail is a permission of its own
(`canReadAudit`), held by the role that can do nothing else, because an auditor who can also act is
not auditing.

## Sessions, and what happens when something breaks

The session is written to `localStorage` so a reload does not lose a negotiation halfway through,
and that carries a hazard worth naming: a snapshot is a serialised copy of one build's state
shapes. Restore a stale one into a renderer that has moved on and it throws during render, on a
page whose state came out of storage, so the reload the user reaches for first reproduces it.

`src/lib/session.js` stamps every snapshot with the schema it was written under and **discards any
snapshot written under a different one**, rather than guessing what an old shape meant. The cost is
a demo session that can be replayed in a minute. One exception, made deliberately: a v3 snapshot held
exactly one contract mixed in with the estate, and that contract may have been halfway through a
negotiation, so its shape is known well enough to carry across rather than drop.

### More than one contract at once

Two kinds of snapshot, because two lifetimes. The **estate** — which contract is open, the role, the
approval matrix, the audit trail, the Salesforce milestones — is one snapshot, read back on every
mount. **Each contract** — draft, redline, decisions, signatures, obligations — is its own, with a
summary row so the contract list can show twenty of them without deserialising twenty redlines.

`ContractSession` holds the ninety-odd pieces of per-contract state and is keyed on the contract's
id, so opening another contract is a remount that reads a different snapshot; nothing in that state
has to know another contract exists. The estate is read *fresh* on each mount, not captured at page
load, because a captured copy would hand the new mount the audit trail as it stood then and the next
save would write that stale copy over everything logged since.

**Create Contract from Salesforce opens a new contract**, unless one already exists for that
onboarding record, in which case it opens that one rather than a duplicate. *Draft a contract* on the
Contracts page does the same. The nav carries a switcher once there is more than one.

`src/components/ErrorBoundary.jsx` is the other half: if a render throws anyway, the fallback is not
an apology, it is the reset control, on a page that still renders, saying what it is about to throw
away. Reset itself now clears the snapshot and reloads instead of calling a setter for each of the
sixty-odd pieces of state, because that setter list was a hand-maintained second copy of the initial
state and it drifted the way second copies do.

## Layout

```
catalogue/            agreement types, templates, clause playbook: the source of truth, as JSON
catalogue/docx/       the same, as Word documents (generated, see npm run export:docx)
src/data/             imports the catalogue; template assembly; the contract portfolio
src/lib/              zip, unzip, xml, docx, docx-import, pdf, redline, crossref,
                      playbook, rbac, documenso, ai, audit, session, counter, lifecycle,
                      salesforce, sfauth
src/components/       the four tabs, the draft studio, the document viewer, the charts
scripts/selftest.js   482 checks over all of the above
scripts/export-catalogue.js   writes catalogue/docx/
```

## Where the templates and the playbook actually live

The catalogue is JSON because JSON is what seeds a tenant: that is the right source of truth and
the wrong thing to hand a lawyer. `npm run export:docx` produces the readable view: the playbook as
a Word document, the two reference lists, and one assembled contract per template with every merge
field showing as a highlighted `[placeholder]`.

Every agreement type carries a **family** (framework and master, service delivery, projects and
supply, legal and compliance, contract lifecycle) shown on the contract list, the workspace header
and the draft picker. The type name says what a contract is about; the family says what kind of
document it is, which is the question you answer first when triaging a queue.

There are no hand-maintained `.docx` template files, and that is deliberate. The wording is
assembled from the playbook's `standardWording` at generation time, so the document you send and the
position you defend are the same sentence and cannot drift apart. Editing a Word file in
`catalogue/docx/` changes nothing the system generates: change the JSON and re-export.

## What is demo data and says so

The clause wording is assembled from the playbook's standard positions, which **no lawyer has
read**: the document says so on its face, and the catalogue README says so at length. The mock AI
findings are derived from the real diff. The obligations produced without an API key are written
against the clause numbers the templates assemble to. Live AI (any of Anthropic, OpenRouter or
Gemini) is available behind the key icon for your own testing and is off by default.
