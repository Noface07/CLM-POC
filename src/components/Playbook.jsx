import { useEffect, useMemo, useRef, useState } from "react";
import { useModalFocus } from "../lib/useModalFocus.js";
import { X, Search, AlertTriangle, ArrowLeftRight, ShieldQuestion, BookOpen, Infinity as InfinityIcon } from "lucide-react";
import { PLAYBOOK, roleLabel } from "../data/catalogue.js";
import { formatBandValue } from "../lib/playbook.js";
import { Tag, Btn, GREEN, AMBER, RED, GRAY, bandColor, kicker } from "../lib/ui.jsx";

const CATEGORY_LABEL = {
  liability: "Liability", commercial: "Commercial", term: "Term", performance: "Performance",
  compliance: "Compliance", operational: "Operational", employment: "Employment", legal: "Legal",
};

const CATEGORY_ORDER = ["liability", "commercial", "term", "performance", "compliance", "operational", "employment", "legal"];

function RiskMeter({ weight }) {
  return (
    <span className="clm-pb-risk" title={`Risk weight ${weight} of 5, used to order a review queue`}>
      {[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= weight ? "on" : ""} />)}
    </span>
  );
}

export function BandStrip({ clause, position, compact }) {
  const cells = [
    { key: "standard", cls: "clm-scale-standard", title: "Standard", text: clause.standard, value: clause.standardValue },
    { key: "fallback", cls: "clm-scale-fallback", title: "Fallback", text: clause.fallback, value: clause.fallbackValue },
    { key: "walkAway", cls: "clm-scale-walk", title: "Walk away", text: clause.walkAway, value: clause.walkAwayValue },
  ];
  return (
    <div className="clm-scale">
      {cells.map((cell) => {
        const here = position === cell.key;
        return (
          <div
            key={cell.key}
            className={`clm-scale-cell ${cell.cls}`}
            style={here ? { boxShadow: `inset 0 0 0 2px ${bandColor(cell.key).color}` } : undefined}
          >
            <div className="clm-scale-head">
              <span className="clm-scale-name">{cell.title}</span>
              {cell.value != null && (
                <span className="clm-scale-value">{formatBandValue(cell.value, clause.valueUnit)}</span>
              )}
            </div>
            {here && <Tag c={bandColor(cell.key)} style={{ fontSize: 9.5, marginBottom: 5 }}>Proposal sits here</Tag>}
            {!compact && <p className="clm-scale-text">{cell.text}</p>}
          </div>
        );
      })}
    </div>
  );
}

export function PlaybookVerdict({ assessment, onOpenPlaybook, compact }) {
  if (!assessment) {
    return (
      <div style={{ border: "1px dashed var(--color-divider)", background: "var(--color-neutral-100)", padding: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <ShieldQuestion size={13} />
          <span style={{ ...kicker, margin: 0 }}>Playbook</span>
        </div>
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55 }}>
          No playbook clause matches this finding, so there is no band to place it in and no approval route to
          suggest. It goes to a human on its own merits rather than being routed on a guess.
        </p>
        {onOpenPlaybook && (
          <Btn small variant="ghost" icon={BookOpen} onClick={() => onOpenPlaybook()} style={{ marginTop: 6 }}>
            Open the playbook
          </Btn>
        )}
      </div>
    );
  }

  const { clause, position, verdict, action, mayApprove, redFlags, bandReason, matchedBy, overriddenByRedFlag } = assessment;
  const tone = bandColor(position);

  return (
    <div style={{ border: `1px solid ${tone.color}`, background: tone.bg, padding: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
        <Tag c={tone} style={{ fontSize: 10 }}>Playbook · {assessment.positionLabel}</Tag>
        <span style={{ fontSize: 11, opacity: 0.65 }}>{clause.name}</span>
        <span style={{ fontSize: 10.5, opacity: 0.5, marginLeft: "auto" }}>matched on {matchedBy}</span>
      </div>

      <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600, lineHeight: 1.45 }}>{verdict}</p>
      <p style={{ margin: "0 0 8px", fontSize: 12, opacity: 0.8, lineHeight: 1.5 }}>{bandReason}</p>

      {!compact && <BandStrip clause={clause} position={position} compact />}

      {action && (
        <p style={{ margin: "8px 0 0", fontSize: 12.5, lineHeight: 1.55 }}>
          <strong>What to do: </strong>{action}
        </p>
      )}

      {redFlags.length > 0 && (
        <div style={{ marginTop: 8, borderTop: "1px solid color-mix(in srgb, var(--color-text) 15%, transparent)", paddingTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
            <AlertTriangle size={13} />
            <span style={{ ...kicker, margin: 0 }}>
              Red flag{redFlags.length > 1 ? "s" : ""} in the proposed wording
            </span>
          </div>
          {redFlags.map((flag, i) => (
            <p key={i} style={{ margin: "0 0 4px", fontSize: 12, lineHeight: 1.5 }}>{flag}</p>
          ))}
          {overriddenByRedFlag && (
            <p style={{ margin: "4px 0 0", fontSize: 11.5, fontStyle: "italic", opacity: 0.8 }}>
              The number is inside the band; the wording is not. The wording is what binds, so this escalates anyway.
            </p>
          )}
        </div>
      )}

      {mayApprove && (
        <p style={{ margin: "8px 0 0", fontSize: 11.5, opacity: 0.75 }}>
          Approval sits with <strong>{mayApprove}</strong>.
        </p>
      )}
      {onOpenPlaybook && (
        <Btn small variant="ghost" icon={BookOpen} onClick={() => onOpenPlaybook(clause.code)} style={{ marginTop: 6 }}>
          Read this clause in the playbook
        </Btn>
      )}
    </div>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <div className="clm-pb-section">
      <h4>{Icon && <Icon size={11} style={{ marginRight: 4, verticalAlign: "-1px" }} />}{title}</h4>
      {children}
    </div>
  );
}

function ClauseEntry({ clause, highlight }) {
  return (
    <div className="clm-pb-clause" id={`pb-${clause.code}`}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <h3 style={{ margin: 0, fontSize: 18 }}>{clause.name}</h3>
        <Tag c={GRAY} style={{ fontSize: 10 }}>clause {clause.clauseRef}</Tag>
        {clause.jurisdiction && <Tag c={AMBER} style={{ fontSize: 10 }}>{clause.jurisdiction} only</Tag>}
        {highlight && <Tag c={RED} style={{ fontSize: 10 }}>the clause you came from</Tag>}
      </div>

      <div className="clm-pb-facts">
        <span style={{ fontSize: 11.5, opacity: 0.6 }}>{CATEGORY_LABEL[clause.category] || clause.category}</span>
        <span style={{ opacity: 0.3 }}>·</span>
        <RiskMeter weight={clause.riskWeight} />
        <span style={{ fontSize: 11.5, opacity: 0.6 }}>risk {clause.riskWeight}/5</span>
        <span style={{ opacity: 0.3 }}>·</span>
        <span style={{ fontSize: 11.5, opacity: 0.6 }}>routes as {clause.changeType}</span>
      </div>

      <BandStrip clause={clause} />

      <Section title="Why this position">
        <p>{clause.why}</p>
      </Section>

      <Section title="What to do">
        <div className="clm-pb-do">
          {[
            ["At standard", clause.guidance?.atStandard, GREEN],
            ["In fallback", clause.guidance?.atFallback, AMBER],
            ["Past walk-away", clause.guidance?.atWalkAway, RED],
          ].filter(([, text]) => text).map(([label, text, tone]) => (
            <div key={label}>
              <Tag c={tone} style={{ fontSize: 9.5, justifySelf: "start" }}>{label}</Tag>
              <span style={{ fontSize: 12.5, lineHeight: 1.6 }}>{text}</span>
            </div>
          ))}
        </div>
        <p style={{ marginTop: 6, opacity: 0.7 }}>
          Fallback is approved by <strong>{roleLabel(clause.approvingRole)}</strong>; past walk-away it is{" "}
          <strong>{roleLabel(clause.escalateTo)}</strong>.
        </p>
      </Section>

      {clause.redFlags?.length > 0 && (
        <Section title="Red flags: wrong at any number" icon={AlertTriangle}>
          <ul>{clause.redFlags.map((f, i) => <li key={i}>{f}</li>)}</ul>
        </Section>
      )}

      {clause.tradeables?.length > 0 && (
        <Section title="What may be traded" icon={ArrowLeftRight}>
          <ul>{clause.tradeables.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </Section>
      )}

      {clause.evergreenPosition && (
        <Section title="Evergreen: where there is no expiry date" icon={InfinityIcon}>
          <p><strong>Standard:</strong> {clause.evergreenPosition.standard}</p>
          <p><strong>Fallback:</strong> {clause.evergreenPosition.fallback}</p>
          <p><strong>Walk away:</strong> {clause.evergreenPosition.walkAway}</p>
          <p style={{ fontStyle: "italic", opacity: 0.8 }}>{clause.evergreenPosition.why}</p>
        </Section>
      )}

      {clause.standardWording && (
        <Section title="Model wording">
          <p style={{ opacity: 0.7, margin: "0 0 6px" }}>
            The actual sentence the drafting engine puts into a contract for this clause. Draft from any template that
            includes it and this is the text that appears, which is why the wording you send out and the position you
            defend here cannot drift apart. Edit it and the next draft changes with it.
          </p>
          <div className="clm-pb-wording clm-force-ink">{clause.standardWording}</div>
        </Section>
      )}

      {clause.aliases?.length > 0 && (
        <Section title="Also called">
          <p style={{ opacity: 0.7 }}>{clause.aliases.join(" · ")}</p>
        </Section>
      )}
    </div>
  );
}

export function PlaybookDrawer({ open, onClose, focusCode }) {
  const focusRef = useModalFocus(open, onClose);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [activeChoice, setActive] = useState(focusCode || null);
  const bodyRef = useRef(null);

  const categories = useMemo(() => {
    const present = new Set(PLAYBOOK.map((c) => c.category));
    return ["All", ...CATEGORY_ORDER.filter((c) => present.has(c))];
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = PLAYBOOK.filter((c) => {
      if (category !== "All" && c.category !== category) return false;
      if (!q) return true;
      return [c.name, c.code, c.clauseRef, c.standard, c.fallback, c.walkAway, c.why,
        c.standardWording, ...(c.aliases || []), ...(c.keywords || [])]
        .join(" ").toLowerCase().includes(q);
    });
    return filtered.sort((a, b) => {
      const byCat = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
      return byCat !== 0 ? byCat : b.riskWeight - a.riskWeight;
    });
  }, [query, category]);

  const active = results.some((c) => c.code === activeChoice) ? activeChoice : (results[0]?.code ?? null);

  // Land on the clause the reader came from, rather than at the top of a 17-clause book.
  useEffect(() => {
    if (!open || !focusCode) return;
    const timer = setTimeout(() => {
      bodyRef.current?.querySelector(`#pb-${focusCode}`)?.scrollIntoView({ block: "start" });
      setActive(focusCode);
    }, 40);
    return () => clearTimeout(timer);
  }, [open, focusCode]);

  // Highlight whichever clause is actually on screen as the reader scrolls.
  useEffect(() => {
    if (!open) return;
    const container = bodyRef.current;
    if (!container) return;
    const onScroll = () => {
      const marks = [...container.querySelectorAll("[id^='pb-']")];
      const top = container.getBoundingClientRect().top;
      const current = marks.filter((el) => el.getBoundingClientRect().top - top <= 80).pop();
      if (current) setActive(current.id.replace("pb-", ""));
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [open, results]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function jump(code) {
    bodyRef.current?.querySelector(`#pb-${code}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(code);
  }

  const grouped = results.map((clause, i) => ({
    clause,
    startsCategory: i === 0 || results[i - 1].category !== clause.category,
  }));

  return (
    <div className="clm-drawer-backdrop" onClick={onClose}>
      <div
        ref={focusRef} tabIndex={-1}
        className="clm-drawer" onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="Clause playbook"
        style={{ display: "flex", flexDirection: "column", padding: 0 }}
      >
        <div style={{ padding: "var(--space-6) var(--space-6) var(--space-4)", borderBottom: "2px solid var(--color-divider)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div>
              <h2 style={{ margin: 0 }}>Clause playbook</h2>
              <p style={{ margin: "4px 0 0", fontSize: 13, opacity: 0.7, maxWidth: 560, lineHeight: 1.6 }}>
                {PLAYBOOK.length} clauses, each with three positions. The third is what makes the other two mean
                anything. A playbook with only a standard position produces one answer, "this differs from standard",
                which is true of every negotiated contract.
              </p>
            </div>
            <button type="button" className="btn btn-ghost btn-icon" aria-label="Close" onClick={onClose}><X size={18} /></button>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: "var(--space-4)" }}>
            <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
              <Search size={13} style={{ position: "absolute", left: 9, top: 11, opacity: 0.5 }} />
              <input
                className="input" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="cap, TUPE, breach notification, sole remedy…" style={{ paddingLeft: 28 }}
              />
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {categories.map((c) => (
                <button
                  key={c} type="button" onClick={() => setCategory(c)}
                  className="tag" aria-pressed={category === c}
                  style={{
                    cursor: "pointer", fontSize: 11,
                    border: `1px solid ${category === c ? "var(--color-accent)" : "var(--color-divider)"}`,
                    background: category === c ? "var(--color-accent-100)" : "transparent",
                    color: category === c ? "var(--color-accent-800)" : "inherit",
                  }}
                >{c === "All" ? "All" : CATEGORY_LABEL[c] || c}</button>
              ))}
            </div>
            <span style={{ fontSize: 12, opacity: 0.55 }}>
              {results.length} of {PLAYBOOK.length}
            </span>
          </div>

        </div>

        <div className="clm-pb" style={{ flex: 1, minHeight: 0, padding: "var(--space-4) var(--space-6) var(--space-6)" }}>
          <nav className="clm-pb-index" aria-label="Clauses">
            {grouped.map(({ clause, startsCategory }) => (
              <div key={clause.code}>
                {startsCategory && (
                  <div className="clm-pb-cat">{CATEGORY_LABEL[clause.category] || clause.category}</div>
                )}
                <button type="button" aria-current={active === clause.code} onClick={() => jump(clause.code)}>
                  <span style={{ opacity: 0.45, fontVariantNumeric: "tabular-nums", flex: "none" }}>{clause.clauseRef}</span>
                  <span>{clause.name}</span>
                </button>
              </div>
            ))}
            {results.length === 0 && <p style={{ fontSize: 12, opacity: 0.5, padding: 6 }}>Nothing matches.</p>}
          </nav>

          <div className="clm-pb-body" ref={bodyRef}>
            {results.map((clause) => (
              <ClauseEntry key={clause.code} clause={clause} highlight={focusCode === clause.code} />
            ))}
            {results.length === 0 && (
              <p style={{ opacity: 0.55, fontSize: 13 }}>
                Nothing matches that. The playbook covers {PLAYBOOK.length} clause types. Try a broader term, or clear
                the category filter.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
