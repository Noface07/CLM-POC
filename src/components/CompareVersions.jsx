import { useMemo, useState } from "react";
import { GitCompare, ArrowRight, ChevronDown } from "lucide-react";
import { compareDocs, compareSummary } from "../lib/compare.js";
import { Tag, GRAY, GREEN, RED, AMBER } from "../lib/ui.jsx";

const STATUS = {
  changed: { label: "reworded", tone: AMBER },
  added: { label: "new clause", tone: GREEN },
  removed: { label: "removed", tone: RED },
};

// Which two versions to read against each other is the reviewer's question, not ours.
// Against the draft is total drift from the position we took; against the previous
// exchange is what moved since they last looked. Both are legitimate, so both are here.
export default function CompareVersions({ history = [] }) {
  const [open, setOpen] = useState(false);
  const [fromKey, setFrom] = useState(null);
  const [toKey, setTo] = useState(null);

  const from = history.find((v) => v.key === fromKey) || history[history.length - 2] || history[0];
  const to = history.find((v) => v.key === toKey) || history[history.length - 1];

  const rows = useMemo(
    () => (from && to && from.key !== to.key ? compareDocs(from.doc, to.doc) : []),
    [from, to]
  );
  const summary = compareSummary(rows);

  if (history.length < 2) {
    return (
      <div className="clm-compare">
        <div className="clm-compare-head">
          <GitCompare size={14} />
          <span className="clm-compare-title">Compare versions</span>
          <span className="clm-compare-sub">
            {history.length ? "one version so far, nothing to compare yet" : "no versions yet"}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`clm-compare${open ? " is-open" : ""}`}>
      <button type="button" className="clm-compare-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <GitCompare size={14} />
        <span className="clm-compare-title">Compare versions</span>
        <span className="clm-compare-sub">
          {summary.total
            ? (summary.total === 1 ? "1 clause differs" : `${summary.total} clauses differ`)
            : "identical"}
        </span>
        <ChevronDown size={15} className={`clm-chev${open ? " is-open" : ""}`} style={{ marginLeft: "auto" }} />
      </button>

      {/* The picker stays out of the fold: choosing what to compare is the control, and
          the summary above it answers the question without opening anything. */}
      <div className="clm-compare-pick">
        <select
          className="input" aria-label="Compare from"
          value={from?.key || ""} onChange={(e) => setFrom(e.target.value)}
        >
          {history.map((v) => <option key={v.key} value={v.key}>{v.key} · {v.label}</option>)}
        </select>
        <ArrowRight size={14} style={{ flex: "none", opacity: 0.5 }} />
        <select
          className="input" aria-label="Compare to"
          value={to?.key || ""} onChange={(e) => setTo(e.target.value)}
        >
          {history.map((v) => <option key={v.key} value={v.key}>{v.key} · {v.label}</option>)}
        </select>
      </div>

      {open && (
        <div className="clm-compare-body">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {summary.changed > 0 && <Tag c={AMBER} style={{ fontSize: 10.5 }}>{summary.changed} reworded</Tag>}
            {summary.added > 0 && <Tag c={GREEN} style={{ fontSize: 10.5 }}>{summary.added} added</Tag>}
            {summary.removed > 0 && <Tag c={RED} style={{ fontSize: 10.5 }}>{summary.removed} removed</Tag>}
            {!summary.total && <Tag c={GRAY} style={{ fontSize: 10.5 }}>No difference between these two</Tag>}
          </div>

          {from?.key === to?.key && (
            <p className="clm-compare-note">Pick two different versions to see what moved between them.</p>
          )}

          <div className="clm-compare-list">
            {rows.map((row) => (
              <div key={row.ref} className="clm-compare-row">
                <div className="clm-compare-row-head">
                  <strong>{row.ref}</strong> {row.heading}
                  <Tag c={STATUS[row.status].tone} style={{ fontSize: 9.5, marginLeft: "auto", flex: "none" }}>
                    {STATUS[row.status].label}
                  </Tag>
                </div>
                <p className="clm-compare-text clm-force-ink">
                  {row.runs.map((run, i) => (
                    run.t === "ins" ? <span key={i} className="clm-ins">{run.text}</span>
                      : run.t === "del" ? <span key={i} className="clm-del">{run.text}</span>
                        : <span key={i}>{run.text}</span>
                  ))}
                </p>
              </div>
            ))}
          </div>

          {rows.length > 0 && (
            <p className="clm-compare-note">
              This is the difference between two versions, not the markup in the document. It answers what moved
              between these two points, whoever moved it.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
