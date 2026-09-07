# The default catalogue

Three files: **agreement types**, **templates**, and the **clause playbook**. Together they are
the answer to preconditions **P2.8** (agreement types and template catalogue) and **P2.9** (global
versus jurisdiction-specific templates), which Phase 1 cannot start without.

They are a *proposal*, not a decision. No client has reviewed them and no lawyer has read them.
They exist so that the conversation with a client is **"change these"** rather than **"tell us what
you need"**, which is a far shorter conversation, and so Phase 1 has something concrete to build
generation and playbook routing against instead of waiting.

## What is here

| File | Rows | Seeds into |
| --- | --- | --- |
| `agreement-types.json` | 14 FM agreement types | `contracts.agreement_types` |
| `templates.json` | 42 templates, at least three per agreement type | `documents.templates` |
| `clause-playbook.json` | 17 clauses, each with a three-position band | `documents.clauses`, `documents.clause_variants`, `negotiation.clause_positions` |

Each entry carries a `why`. The reasoning is the part a client argues with, and arguing with it is
the point.

## Reading it on paper

`pdf/` holds the same three files typeset for people rather than for the seeder:

| | |
| --- | --- |
| `1-agreement-types.pdf` | the 14 types, sorted by risk, each with why it carries that level |
| `2-template-catalogue.pdf` | the templates by agreement type, with the merge data each needs |
| `3-clause-playbook.pdf` | the 17 clauses, each showing its standard / fallback / walk-away band |

Regenerate rather than edit:

```bash
python scripts/catalogue_to_pdf.py
```

**The JSON is the source of truth; the PDFs are a view of it.** A PDF edited by hand would drift
from what the system actually seeds, and the drift stays invisible until somebody acts on the wrong
document. Every page carries the draft disclaimer, not just the first: a page forwarded on its own
still has to say that no lawyer has read it.

## Reading it in Word

`docx/` holds the same three files as Word documents, plus one generated document per template:

```bash
npm run export:docx
```

| | |
| --- | --- |
| `docx/clause-playbook.docx` | all 17 clauses: the band, why, who approves, guidance at each position, red flags, tradeables and model wording |
| `docx/template-catalogue.docx` | every template grouped by agreement type, with the merge data each needs |
| `docx/agreement-types.docx` | the 14 types sorted by risk, each with why it carries that level |
| `docx/templates/*.docx` | 42 assembled contracts, one per template, with every merge field showing as a highlighted `[placeholder]` |

The template documents are assembled with **no merge data on purpose.** A template filled with
sample data reads like a contract and quietly hides where the holes are; one full of visible
`[placeholders]` shows a lawyer exactly what the system will fill in and where.

They are produced by the same `src/lib/docx.js` writer the application uses at draft time, from the
same JSON, so what you open here is the document the system would actually generate, not a
hand-maintained copy of it that drifts. **Regenerate rather than edit**, for the same reason the
PDFs say so.

Only the template documents carry an `UNREVIEWED` watermark. A template document looks like a
contract, so it is the one that gets forwarded and mistaken for real paper; the playbook and the
two lists do not look like contracts, and stamping a reference document people are meant to read
costs legibility for no protection gained. They carry the same warning as a bold block at the top.

> **`pdf/3-clause-playbook.pdf` is currently stale.** `clause-playbook.json` gained the
> decision-support fields listed under [Acting on a position](#acting-on-a-position-the-fields-added-in-this-revision),
> and four positions were corrected where the guidance disagreed with the band. The PDF predates
> all of it and shows only the three-position bands. `scripts/catalogue_to_pdf.py` is not in this
> repository, so it could not be regenerated here. Do that before circulating the PDF, and do not
> read the current one as current.

## Family: what kind of paper is this?

Every agreement type carries a `family`, grouping the fourteen types into the five kinds of document
an FM team actually handles:

| Family | Types |
| --- | --- |
| Framework and master | MSA, framework agreement |
| Service delivery | TFM, hard FM, soft FM, PPM, reactive call-off |
| Projects and supply | statement of work, equipment supply, consultancy |
| Legal and compliance | NDA, DPA |
| Contract lifecycle | variation, termination and settlement |

The type name answers *what is this contract about*. The family answers *what kind of document am I
holding*, and someone triaging a queue needs the second question answered first: an NDA and a
five-year TFM agreement are both "contracts" and nothing else about them is alike.

## Variants: more than one template per type

A catalogue with exactly one template per agreement type is a list, and a picker offering one option
reads as a picker that is broken. Every type now carries **at least three**, and every variant states
why it exists: a `variantReason` (a different document under the same law) or a `splitReason` (a
different document because the law differs), held to the same standard.

Three axes do almost all the work in facilities management: **jurisdiction** (the law differs),
**scale** (a full document costs more to negotiate than a small contract is worth), and **commercial
model** (fixed price, rate card, measured term and framework call-off need different mechanics).
Among the first five:

| Template | Why it is separate |
| --- | --- |
| `msa_short_global` | Risk-proportionate. Below the low-touch threshold a full MSA costs more to negotiate than the contract is worth, and the usual result is nobody papers the relationship at all. |
| `hard_fm_uk` | The compliance schedule names the regime by statute: LOLER, the Electricity at Work Regulations, Gas Safety, the Fire Safety Order. A global template cannot name a national regime. |
| `sow_tm_global` | Pricing model changes the mechanics, not just a number: fixed-price acceptance criteria are meaningless on time and materials. |
| `nda_oneway_global` | Mutual stays the default. This is for the case where the traffic genuinely runs one way: a supplier receiving site security information and disclosing nothing. |
| `dpa_global` | **A repair, not an option.** `dpa_uk_eu` is scoped to GB and EU, so a legal entity anywhere else had no data processing agreement to generate at all. |

A `variantReason` (a different document for the same law) and a `splitReason` (a different document
because the law differs) are held to the same standard: a split with no stated reason is pure cost.

## What is deliberately *not* here

**Contract wording.** A template's content is an OOXML file written by counsel and published as an
immutable version (`documents.template_versions`). Nothing in this repository invents it. A drafted
clause that has never been read by a lawyer, presented as a product default, is worse than an empty
template, and it looks authoritative. `P3.4` in the precondition plan tracks getting the real ones.

The seeder therefore creates template *rows* and no template *versions*. A template with no
published version cannot be generated from, which is the correct state until wording arrives.

**Approval thresholds.** `contracts.approval_rules` is `P2.5`, and unlike the catalogue it cannot
be guessed: a threshold is a delegation of authority, and inventing one either sends trivial
contracts to a director or lets a large one through unreviewed. The playbook says *who* approves a
deviation; it says nothing about *at what value*.

## The playbook is the valuable half

An agreement-type list is a dropdown. The playbook is what turns AI output from a summary into a
decision:

> *Without it:* "the liability cap changed from 125% to 100% of annual charges."
> *With it:* the same sentence, plus "that is inside the fallback band, Contract Manager may
> approve."

The first tells a reviewer something happened. The second tells them what to do.

Three positions per clause, and **the third is what makes the other two mean anything**:

- `standard`: our opening position
- `fallback`: what we accept without escalation
- `walkAway`: past this we do not sign

A playbook with only a standard position produces one answer, *"this differs from standard"*,
which is true of every negotiated contract and tells nobody anything.

### Numeric bands

Where a position is a single comparable quantity it also carries `standardValue`, `fallbackValue`,
`walkAwayValue`, `valueUnit` and `valueDirection`, so a proposed term can be placed in the band by
arithmetic rather than by reading.

Two things about that were wrong in the schema and are now fixed (migration
`P2_8_ClausePositionValueUnits`):

- **`value_unit`.** Most FM positions are not money. A liability cap is a percentage of annual
  charges, payment terms are days, a breach-notification window is hours. Without a unit, `125`,
  `10` and `60` are the same column and any comparison across clauses is arithmetic on unrelated
  quantities.
- **`value_direction`.** 45-day payment terms are *worse* than 60; 48-hour breach notification is
  *worse* than 24. The same arithmetic calls one of those a concession and the other a win, and
  without a direction it cannot tell which.

Insurance deliberately has no band: it is three limits (public, employer's, professional), and one
band would hold one of them and silently hide the other two.

### Acting on a position: the fields added in this revision

The band says **where a term sits**. On its own that still leaves a reviewer to work out what to do
about it, who is allowed to say yes, and whether the number being fine means the clause is fine.
These fields answer those three questions, and nothing already in the file was rewritten to add
them.

| Field | What it is for |
| --- | --- |
| `clauseRef` | Where the clause sits in our templates, so a finding can be anchored to a section number instead of to a name that varies by supplier. The drafting engine assembles to these same numbers. |
| `aliases`, `keywords` | What the same clause is called on other people's paper. Matching on "Limitation of Liability" alone misses "Cap on Liability" and returns nothing. |
| `changeType` | The routing category, so the band verdict and the approval route are decided in one place rather than two. |
| `riskWeight` | 1-5, for ordering a review queue. Two High findings are not equal: an uninsured statutory duty outranks a payment-terms move. |
| `escalateTo` | Who decides once the walk-away line is crossed. `approvingRole` covers the fallback band; without this the walk-away band names nobody. |
| `guidance` | One sentence per position: what happens next at standard, at fallback, and past walk-away. |
| `redFlags` | Wording that is wrong **regardless of the number**. A cap at 125% that also purports to cover death or personal injury is inside the band and still unacceptable: arithmetic on the band cannot catch that, and a reviewer who trusts the band alone will sign it. |
| `tradeables` | What may be conceded to hold this position and what may not. A negotiator without this trades the wrong half. |
| `standardWording` | The model clause. It is what a draft is generated from and the left-hand side of a redline comparison, so the wording we send out and the position we defend are the same sentence and cannot drift apart. Still unreviewed by counsel. |

`term_renewal` additionally carries `evergreenPosition`, because **a contract with no end date is a
different question from a long one.** What makes an evergreen contract safe is the rolling
termination right, not the term length, and a band expressed in years cannot say that. The
walk-away is an auto-renewing commitment the client cannot unilaterally stop.

`termination_convenience` carries a `bandNote`. Its standard and fallback values are both 90 days,
so the number is not what separates the two positions. The exit charge is. Anything reading this
file arithmetically has to notice that and fall back to the position text, rather than reporting a
confident verdict the band cannot support.

**Four corrections came with the additions**, where guidance or model wording written against the
new fields disagreed with band values already in the file. In every case the band won, being the
older and more considered half: `service_levels` model wording capped credits at 15% against a
standard of 10%; `exit_transition` offered six months against a standard of twelve; `tupe` guidance
named 14 days against a fallback of 21; and `termination_convenience` guidance named a day count
its band cannot actually test.

## P2.9: global or jurisdiction-specific?

**Global by default. Split only where a specific legal difference forces it, and say which.**

Every split doubles the work of every future amendment to that document, so a split with no stated
reason is pure cost. `DefaultCatalogue` refuses to load a jurisdiction-specific template that names
no `splitReason`, and a test asserts it.

Two splits earn themselves:

- **Soft FM (UK)**: TUPE. On a UK service-provider change the incumbent's staff transfer by
  operation of law, and the contract must allocate employee liability information, indemnities and
  pension obligations. There is no equivalent in most jurisdictions.
- **DPA (UK/EU)**: UK and EU GDPR set the required article 28 wording by law rather than by
  preference, so a single global template would be non-compliant in both.

The same rule applies inside the playbook: the TUPE clause names `"jurisdiction": "GB"`, and the
seeder skips it for legal entities elsewhere. A UK statute's negotiating band in front of a French
entity reads as deliberate configuration, and would be a seeding accident.

## Seeding a tenant

```bash
dotnet run --project src/Clm.Api --no-launch-profile -- --seed-catalogue <tenant-slug>
```

An operator action, not a startup step: onboarding is a decision made once per tenant.

It runs as the **runtime** role, not the migration role: seeding is an ordinary tenant write, and
running it as an owner would insert rows without RLS ever being consulted.

### Insert-only, always

Running it twice changes nothing the second time. Running it after a tenant has edited their
catalogue changes nothing they edited.

This is the property to protect. These rows decide what skips review and what escalates to Legal,
so a seeder that reconciled toward the shipped defaults would quietly undo a client's risk
decisions on a deploy nobody connected to the change, and it would do it in the direction of
*less* review. `A_tenants_own_edits_survive_a_reseed` is the test, and
`catalogue-seed-overwrites-tenant-edits` in `scripts/guard-mutations.json` proves that test can
fail.

The one asymmetry: a row the tenant **deleted** comes back, because the seeder cannot tell "deleted
on purpose" from "not seeded yet". Deactivate (`active = false`) rather than delete.

### Legal entities first

The playbook is per clause type **per legal entity** (v0.3 §5.4), so a tenant with no legal entity
gets the clause library and no positions. That is not an error and the command says so, but it is
half a catalogue, so create the entities first.

## Changing it

Edit the JSON. `DefaultCatalogue` validates on load and refuses:

- duplicate codes (the unique index on `(tenant_id, code)` would reject the second row anyway,
  later and less clearly)
- a template naming an agreement type that does not exist
- an agreement type with no template: selectable, and then not generatable
- a jurisdiction-specific template with no `splitReason`
- a numeric band missing its unit or direction
- an approving role that is not one of the eight product roles, or that is `auditor` (read-only) or
  `supplier` (the counterparty)
- a clause whose standard, fallback and walk-away are not distinct

Tests live in `tests/Clm.Tests.Unit/CatalogueTests.cs` and
`tests/Clm.Tests.Integration/CatalogueSeedTests.cs`.
