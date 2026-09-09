import {
  ShieldCheck, Infinity as InfinityIcon, BookOpen, ArrowRight, ChevronRight,
  AlertTriangle, CalendarClock, FileSignature, ArrowLeftRight, PencilLine, BellOff, Check, Minus,
} from "lucide-react";
import { Tag, Btn, GREEN, AMBER, RED, GRAY, statusColor } from "../lib/ui.jsx";
import {
  HBarChart, DonutChart, StatusStackBar, ColumnChart, ChartFrame, StatTile,
  ObligationHealthBars, OBLIGATION_STATES, BAND_FILL, STATUS_FILL,
} from "./charts.jsx";
import { LIFECYCLE_STAGES, stageForStatus } from "./LifecycleBar.jsx";
import { formatMoney } from "../data/contracts.js";
import { contractVisibility } from "../lib/rbac.js";

const QUARTERS_AHEAD = 6;

const ATTENTION = {
  "Exception Review":  { rank: 1, icon: AlertTriangle,  tone: RED,   act: "Exceptions open: decide, escalate, or send back." },
  Expiring:            { rank: 2, icon: CalendarClock,  tone: AMBER, act: "Inside the renewal window: decide before the notice period runs." },
  "Signature Pending": { rank: 3, icon: FileSignature,  tone: AMBER, act: "Envelope out. Waiting on a signature." },
  "In Negotiation":    { rank: 4, icon: ArrowLeftRight, tone: AMBER, act: "Redline sitting with the counterparty." },
  Draft:               { rank: 5, icon: PencilLine,     tone: GRAY,  act: "Not yet sent for internal review." },
};

function daysUntil(date, now) {
  if (!date) return null;
  return Math.round((new Date(date) - now) / 86400000);
}

function CoverRow({ icon: Icon, tone, headline, detail, part, whole }) {
  const hasBar = typeof part === "number" && typeof whole === "number" && whole > 0;
  const pct = hasBar ? (part / whole) * 100 : 0;
  return (
    <div className="clm-cover-row">
      <span className="clm-cover-icon" style={{ background: tone.bg, color: tone.color }}>
        <Icon size={14} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="clm-cover-headline">{headline}</div>
        {hasBar && (
          <div className="clm-cover-track" role="img" aria-label={`${part} of ${whole}`}>
            <span style={{ width: `${pct}%`, background: tone.color }} />
          </div>
        )}
        <p className="clm-cover-detail">{detail}</p>
      </div>
    </div>
  );
}

function quarterKey(date) {
  return `Q${Math.floor(date.getMonth() / 3) + 1} ${String(date.getFullYear()).slice(2)}`;
}

function buildRunway(contracts, now) {
  const buckets = [];
  const cursor = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  for (let i = 0; i < QUARTERS_AHEAD; i++) {
    const start = new Date(cursor.getFullYear(), cursor.getMonth() + i * 3, 1);
    const end = new Date(cursor.getFullYear(), cursor.getMonth() + (i + 1) * 3, 1);
    const inBucket = contracts.filter((c) => {
      if (c.evergreen || !c.endDate) return false;
      const d = new Date(c.endDate);
      return d >= start && d < end;
    });
    buckets.push({
      label: quarterKey(start),
      note: `${quarterKey(start)}: ${inBucket.map((c) => c.id).join(", ") || "nothing expiring"}`,
      value: inBucket.length,
      highlight: i === 0,
    });
  }
  return buckets;
}

export default function DashboardPage({
  role, contracts, allContracts, exceptions, assessFor, obligations, validatedCount, liveObligationCounts,
  onOpenPlaybook, onGoToContracts, onGoToWorkspace,
}) {
  const now = new Date();
  const hidden = allContracts.length - contracts.length;

  const stageCounts = LIFECYCLE_STAGES.map((stage) => ({
    label: stage.label,
    sub: stage.hint,
    value: contracts.filter((c) => stageForStatus(c.status) === stage.key).length,
  }));

  const assessments = (exceptions || []).map((ex) => assessFor(ex)).filter(Boolean);
  const bandSegments = [
    { key: "standard", label: "At standard", value: assessments.filter((a) => a.position === "standard").length },
    { key: "fallback", label: "In fallback band", value: assessments.filter((a) => a.position === "fallback").length },
    { key: "walkAway", label: "Past walk-away", value: assessments.filter((a) => a.position === "walkAway").length },
    { key: "unknown", label: "Band cannot place", value: assessments.filter((a) => a.position === "unknown").length },
  ];
  const unmatched = (exceptions || []).length - assessments.length;
  const walkAwayCount = bandSegments[2].value;

  const runway = buildRunway(contracts, now);
  const evergreen = contracts.filter((c) => c.evergreen);

  // Obligations exist only once a contract is executed, so a contract still in drafting
  // or negotiation has an empty register rather than a zeroed one. The live contract's
  // numbers come from the monitor itself; the rest of the estate carries its own.
  const withRegister = contracts.filter((c) => c.obligations || (c.live && liveObligationCounts));
  const notInForce = contracts.length - withRegister.length;
  const obligationRows = withRegister
    .map((c) => ({
      id: c.id,
      supplier: c.supplier,
      counts: (c.live && liveObligationCounts) ? liveObligationCounts : c.obligations,
    }))
    .filter((r) => OBLIGATION_STATES.some((s) => (r.counts?.[s.key] || 0) > 0))
    .sort((a, b) => (b.counts.overdue - a.counts.overdue)
      || (b.counts.due - a.counts.due)
      || (b.counts.onTrack + b.counts.watch) - (a.counts.onTrack + a.counts.watch));

  const byCategory = Object.entries(
    contracts.reduce((acc, c) => {
      acc[c.category] = (acc[c.category] || 0) + (c.value || 0);
      return acc;
    }, {})
  )
    .map(([label, value]) => ({ label, value }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 7);

  const active = contracts.filter((c) => ["Active", "Executed", "Expiring"].includes(c.status));
  const totalValue = contracts.reduce((sum, c) => sum + (c.value || 0), 0);
  const highRisk = contracts.filter((c) => c.riskLevel === "high").length;
  const obligationGap = Math.max(0, (obligations?.length || 0) - validatedCount);

  const attention = contracts
    .filter((c) => ATTENTION[c.status])
    .map((c) => ({ c, meta: ATTENTION[c.status], days: c.status === "Expiring" ? daysUntil(c.endDate, now) : null }))
    .sort((a, b) => (a.meta.rank - b.meta.rank) || ((a.days ?? 1e9) - (b.days ?? 1e9)) || a.c.id.localeCompare(b.c.id))
    .slice(0, 6);
  const expiring90 = contracts.filter((c) => {
    if (c.evergreen || !c.endDate) return false;
    const days = (new Date(c.endDate) - now) / 86400000;
    return days >= 0 && days <= 90;
  }).length;
  const inFlight = contracts.filter((c) =>
    ["Draft", "Internal Review", "In Negotiation", "Exception Review", "Approved", "Ready for Signature", "Signature Pending"].includes(c.status)
  ).length;

  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "var(--space-4)", marginBottom: "var(--space-4)", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Dashboard</h1>
          <p style={{ margin: 0, opacity: 0.65, fontSize: 14 }}>
            The estate as <strong>{role}</strong> can see it: {contracts.length} contract{contracts.length === 1 ? "" : "s"}
            {hidden > 0 && <>, {hidden} not routed to this role</>}.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn onClick={onOpenPlaybook} icon={BookOpen} variant="secondary">Read the clause playbook</Btn>
          <Btn onClick={onGoToContracts} icon={ArrowRight} variant="primary">Go to contracts</Btn>
        </div>
      </div>

      {hidden > 0 && (
        <div className="clm-readonly-banner" style={{ marginBottom: "var(--space-6)" }}>
          <ShieldCheck size={15} />
          Role-based access is filtering this dashboard. {hidden} contract{hidden === 1 ? " is" : "s are"} excluded
          because {hidden === 1 ? "it has" : "they have"} not been routed to {role}. Switch role in the header to see the difference.
        </div>
      )}

      <div className="clm-grid-4" style={{ marginBottom: "var(--space-6)" }}>
        <StatTile kicker="Contracts in force" value={active.length} body="Executed, active or inside their expiry window." />
        <StatTile kicker="In flight" value={inFlight} body="Drafting, review, negotiation or awaiting signature." />
        <StatTile kicker="Annual value" value={formatMoney(totalValue)} body="Total annual charges across visible contracts." />
        <StatTile kicker="Past walk-away" value={walkAwayCount} alert={walkAwayCount > 0}
          body="Open exceptions the playbook says we do not sign." />
        <StatTile kicker="Expiring in 90 days" value={expiring90} alert={expiring90 > 0}
          body="Fixed-term contracts reaching their end date." />
      </div>

      <div className="clm-grid-2" style={{ marginBottom: "var(--space-4)" }}>
        <ChartFrame
          title="Where the portfolio sits"
          note="Every visible contract sits in exactly one stage, so the ring is the whole portfolio and the slices add up to it. Stage order runs light to dark, and the stage is derived from status, so this and the chevron on a contract always agree."
        >
          <DonutChart
            data={stageCounts}
            totalNote="contracts"
            emptyNote="No contracts visible to this role."
          />
        </ChartFrame>

        <ChartFrame
          title="Open exceptions against the playbook"
          note="Every flagged change placed in its clause's three-position band. Colour is reserved for status here and every segment carries its count."
          action={<Btn small variant="ghost" icon={BookOpen} onClick={onOpenPlaybook}>Playbook</Btn>}
        >
          <StatusStackBar
            segments={bandSegments}
            fills={BAND_FILL}
            emptyNote="No exceptions raised yet. Run change intelligence on a redline in the workspace."
          />
          {unmatched > 0 && (
            <p style={{ fontSize: 11.5, opacity: 0.6, margin: "8px 0 0" }}>
              {unmatched} finding{unmatched === 1 ? "" : "s"} matched no playbook clause and {unmatched === 1 ? "is" : "are"} excluded
              rather than guessed at.
            </p>
          )}
          {walkAwayCount > 0 && (
            <p style={{ fontSize: 12, margin: "8px 0 0", color: "var(--color-accent-700)" }}>
              {walkAwayCount} past the walk-away line. These need the escalation approver, not the routine one.
            </p>
          )}
        </ChartFrame>
      </div>

      <ChartFrame
        title="Obligation health by contract"
        note={obligationRows.length
          ? `What each live contract owes, and how much of it has slipped. Ordered by what has gone wrong. ${notInForce} contract${notInForce === 1 ? " is" : "s are"} not in force yet, so ${notInForce === 1 ? "it carries" : "they carry"} no obligations: they are extracted from an executed document.`
          : "No contract in the estate is executed yet, so there is nothing to monitor."}
      >
        <ObligationHealthBars
          rows={obligationRows}
          emptyNote="No executed contracts, so no obligations to monitor."
        />
      </ChartFrame>

      <div className="clm-grid-2" style={{ marginBottom: "var(--space-4)", marginTop: "var(--space-4)" }}>
        <ChartFrame
          title="Renewal runway"
          note={`Fixed-term contracts by the quarter they expire in, next ${QUARTERS_AHEAD} quarters. Evergreen contracts are counted separately below: they have no expiry to plot.`}
        >
          <ColumnChart data={runway} emptyNote="Nothing expiring in the window." />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--color-divider)", flexWrap: "wrap" }}>
            <InfinityIcon size={16} />
            <strong style={{ fontFamily: "var(--font-heading)", fontSize: 18 }}>{evergreen.length}</strong>
            <span style={{ fontSize: 12.5, opacity: 0.75 }}>
              evergreen contract{evergreen.length === 1 ? "" : "s"} with no expiry date.
            </span>
            {evergreen.length > 0 && (
              <span style={{ fontSize: 11.5, opacity: 0.55, width: "100%" }}>
                {evergreen.map((c) => c.id).join(", ")}: these never appear in a runway chart, which is exactly why
                they are the ones that go unreviewed. Their control is the termination notice, not an end date.
              </span>
            )}
          </div>
        </ChartFrame>

        <ChartFrame
          title="Annual value by service category"
          note="Where the spend actually is. Top seven categories by annual charges, ranked, each bar a share of the largest."
        >
          <HBarChart data={byCategory} labelWidth={140} format={(v) => formatMoney(v)} emptyNote="No priced contracts visible." />
        </ChartFrame>
      </div>

      <div className="clm-grid-2">
        <ChartFrame
          title="What will tell you, and what will not"
          note="Every control on this estate that either fires on its own or quietly does not. The gaps are the ones found late."
        >
          <div style={{ display: "grid", gap: 2 }}>
            <CoverRow
              icon={!obligations?.length ? Minus : obligationGap > 0 ? BellOff : Check}
              tone={!obligations?.length ? GRAY : obligationGap > 0 ? AMBER : GREEN}
              headline={obligations?.length
                ? `${validatedCount} of ${obligations.length} obligations validated`
                : "No obligations extracted yet"}
              part={validatedCount} whole={obligations?.length || 0}
              detail={!obligations?.length
                ? "Nothing to remind against until a contract is executed and its obligations are extracted."
                : obligationGap > 0
                  ? `An extracted obligation is advisory until a human approves it, so ${obligationGap} row${obligationGap === 1 ? "" : "s"} fire${obligationGap === 1 ? "s" : ""} no reminder at all.`
                  : "Every extracted obligation has been approved by a human, so every one of them fires."}
            />
            <CoverRow
              icon={evergreen.length > 0 ? BellOff : Check}
              tone={evergreen.length > 0 ? AMBER : GREEN}
              headline={`${contracts.length - evergreen.length} of ${contracts.length} contracts have an end date`}
              part={contracts.length - evergreen.length} whole={contracts.length}
              detail={evergreen.length > 0
                ? `${evergreen.length} evergreen contract${evergreen.length === 1 ? " has" : "s have"} no expiry to remind against `
                  + `(${evergreen.map((c) => c.id).join(", ")}). Their only control is the termination notice.`
                : "Every contract has an expiry date, so every one of them reaches the renewal runway."}
            />
            <CoverRow
              icon={walkAwayCount > 0 ? AlertTriangle : Check}
              tone={walkAwayCount > 0 ? RED : GREEN}
              headline={walkAwayCount > 0
                ? `${walkAwayCount} open exception${walkAwayCount === 1 ? "" : "s"} past the walk-away line`
                : "No exception is past the walk-away line"}
              detail={walkAwayCount > 0
                ? "These block signature until the escalation approver decides, and the playbook's default answer on them is no."
                : "Nothing currently sitting where the playbook says we do not sign."}
            />
            <CoverRow
              icon={ShieldCheck} tone={GREEN}
              headline={`${highRisk} high-risk agreement type${highRisk === 1 ? "" : "s"} under standing Legal visibility`}
              detail="Legal sees these whether or not anyone remembered to route them, so this one cannot be missed by omission."
            />
          </div>
        </ChartFrame>

        <ChartFrame
          title="Attention now"
          note="Ranked by how constrained each one is, not by contract number. The symbol is what it is waiting for."
        >
          <div style={{ display: "grid", gap: 4 }}>
            {attention.map(({ c, meta, days }) => {
              const Icon = meta.icon;
              const why = contractVisibility(role, c).why;
              const showWhy = why && !/^full access$/i.test(why.trim());
              return (
                <button
                  key={c.id} type="button" className="clm-template-card clm-attn"
                  onClick={() => onGoToWorkspace(c)}
                  title={`Open ${c.id} in the workspace`}
                >
                  <span className="clm-attn-icon" style={{ background: meta.tone.bg, color: meta.tone.color }}>
                    <Icon size={15} />
                  </span>
                  <span className="clm-attn-body">
                    <span className="clm-attn-line">
                      <strong className="clm-attn-id">{c.id}</strong>
                      <span className="clm-attn-supplier">{c.supplier}</span>
                      <Tag c={statusColor(c.status)} style={{ fontSize: 10, flex: "none" }}>{c.status}</Tag>
                    </span>
                    <span className="clm-attn-act">
                      {days != null && days >= 0
                        ? `Expires in ${days} day${days === 1 ? "" : "s"}. Decide before the notice period runs.`
                        : meta.act}
                      {showWhy ? ` \u00b7 ${why}` : ""}
                    </span>
                  </span>
                  {c.value > 0 && <span className="clm-attn-value">{formatMoney(c.value)}</span>}
                  <ChevronRight size={14} className="clm-attn-chev" />
                </button>
              );
            })}
            {attention.length === 0 && (
              <p style={{ fontSize: 12.5, opacity: 0.55, margin: 0 }}>Nothing waiting on this role.</p>
            )}
          </div>
        </ChartFrame>
      </div>

      <p style={{ fontSize: 11, opacity: 0.45, margin: "var(--space-6) 0 0" }}>
        Status colours are reserved: {" "}
        <i className="clm-swatch" style={{ background: STATUS_FILL.good }} /> at standard,{" "}
        <i className="clm-swatch" style={{ background: STATUS_FILL.warning }} /> fallback,{" "}
        <i className="clm-swatch" style={{ background: STATUS_FILL.critical }} /> walk-away. They are never reused to
        distinguish one series from another.
      </p>
    </>
  );
}
