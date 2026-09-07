import { useState } from "react";

export const STATUS_FILL = {
  good: "#1f8a4d",
  warning: "#e0a800",
  critical: "#c9260a",
  neutral: "#8a8482",
};

export const BAND_FILL = {
  standard: STATUS_FILL.good,
  fallback: STATUS_FILL.warning,
  walkAway: STATUS_FILL.critical,
  unknown: STATUS_FILL.neutral,
};

const INK = "#5b5350";
const ACCENT = "#ec3013";
const TRACK = "#ded9d8";

function Tooltip({ point }) {
  if (!point) return null;
  return (
    <div
      style={{
        position: "absolute", left: point.x, top: point.y, transform: "translate(-50%, -110%)",
        background: "#201e1d", color: "#f3f2f2", padding: "5px 9px", fontSize: 11.5,
        whiteSpace: "nowrap", pointerEvents: "none", zIndex: 5,
      }}
    >
      {point.label}
    </div>
  );
}

function TableView({ columns, rows, open, onToggle }) {
  return (
    <div style={{ marginTop: 8 }}>
      <button
        type="button" onClick={onToggle}
        style={{ background: "none", border: "none", padding: 0, font: "inherit", fontSize: 11,
          opacity: 0.6, cursor: "pointer", textDecoration: "underline" }}
      >
        {open ? "Hide" : "Show"} the numbers
      </button>
      {open && (
        <table className="table" style={{ marginTop: 6, fontSize: 12 }}>
          <thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function HBarChart({ data, format = (v) => v, labelWidth = 132, height = 30, emptyNote, chevron }) {
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <div className="clm-empty">{emptyNote || "Nothing to show yet."}</div>;

  const RUN = 76;

  return (
    <div>
      <div style={{ display: "grid", gap: 6 }}>
        {data.map((d) => {
          const pct = (d.value / max) * 100;
          return (
            <div key={d.label} className="clm-row">
              <div
                className="clm-row-label"
                style={{ width: labelWidth, opacity: d.value === 0 ? 0.4 : 0.9, fontWeight: d.highlight ? 700 : 400 }}
                title={d.sub || d.label}
              >
                {d.label}
              </div>
              <div className="clm-track is-open" style={{ height }}>
                <div
                  className={`clm-fill${chevron && d.value > 0 ? " clm-fill-chevron" : ""}`}
                  style={{
                    width: `${(Math.max(pct, d.value > 0 ? 3 : 0) / 100) * RUN}%`,
                    background: d.highlight ? ACCENT : INK,
                    borderRadius: chevron ? 0 : "0 3px 3px 0",
                  }}
                />
                <span
                  className="clm-row-value"
                  style={{
                    left: `calc(${(Math.max(pct, 3) / 100) * RUN}% + 9px)`,
                    color: "var(--color-text)",
                    opacity: d.value === 0 ? 0.4 : 1,
                  }}
                >
                  {format(d.value)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <TableView
        open={table} onToggle={() => setTable((t) => !t)}
        columns={["Category", "Value"]}
        rows={data.map((d) => [d.label, format(d.value)])}
      />
    </div>
  );
}

export function StatusStackBar({ segments, fills = BAND_FILL, emptyNote }) {
  const [point, setPoint] = useState(null);
  const [table, setTable] = useState(false);
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  if (!total) return <div className="clm-empty">{emptyNote || "Nothing to show yet."}</div>;

  return (
    <div style={{ position: "relative" }}>
      <div className="clm-bar" style={{ height: 34, gap: 2, background: "transparent" }}>
        {segments.filter((s) => s.value > 0).map((s) => (
          <span
            key={s.key}
            style={{ width: `${(s.value / total) * 100}%`, background: fills[s.key] || STATUS_FILL.neutral }}
            onMouseEnter={(e) => {
              const box = e.currentTarget.parentElement.getBoundingClientRect();
              const own = e.currentTarget.getBoundingClientRect();
              setPoint({ x: own.left - box.left + own.width / 2, y: 0, label: `${s.label}: ${s.value}` });
            }}
            onMouseLeave={() => setPoint(null)}
          />
        ))}
      </div>
      <Tooltip point={point} />

      <div className="clm-legend" style={{ marginTop: 8 }}>
        {segments.map((s) => (
          <span key={s.key}>
            <i className="clm-swatch" style={{ background: fills[s.key] || STATUS_FILL.neutral }} />
            {s.label} <strong style={{ fontWeight: 600 }}>{s.value}</strong>
          </span>
        ))}
      </div>
      <TableView
        open={table} onToggle={() => setTable((t) => !t)}
        columns={["Position", "Count", "Share"]}
        rows={segments.map((s) => [s.label, s.value, `${Math.round((s.value / total) * 100)}%`])}
      />
    </div>
  );
}

export const SEQUENTIAL = ["#f7a893", "#f5836a", "#f05a3c", "#ec3013", "#c92309", "#a01804", "#7c1405"];

const SURFACE = "#eae9e9";

function arcPath(cx, cy, rOuter, rInner, start, end) {
  const large = end - start > Math.PI ? 1 : 0;
  const at = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x1, y1] = at(rOuter, start);
  const [x2, y2] = at(rOuter, end);
  const [x3, y3] = at(rInner, end);
  const [x4, y4] = at(rInner, start);
  return `M${x1} ${y1} A${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2} `
    + `L${x3} ${y3} A${rInner} ${rInner} 0 ${large} 0 ${x4} ${y4} Z`;
}

export function DonutChart({ data, total: totalLabel, totalNote, emptyNote, colours = SEQUENTIAL, size = 190 }) {
  const [hover, setHover] = useState(null);
  const [table, setTable] = useState(false);

  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (!total) return <div className="clm-empty">{emptyNote || "Nothing to show yet."}</div>;

  const slices = data.filter((d) => d.value > 0);
  const only = slices.length === 1;
  const cx = size / 2, cy = size / 2, rOuter = size / 2 - 4, rInner = rOuter * 0.6;

  let angle = -Math.PI / 2;
  const arcs = slices.map((d) => {
    const sweep = (d.value / total) * Math.PI * 2;
    const from = angle;
    angle += sweep;
    return { ...d, from, to: angle, share: d.value / total, index: data.indexOf(d) };
  });

  return (
    <div className="clm-donut">
      <div style={{ position: "relative", flex: "none" }}>
        <svg width={size} height={size} role="img" aria-label={`${total} in total, split across ${slices.length} groups`}>
          {only ? (
            <circle
              cx={cx} cy={cy} r={(rOuter + rInner) / 2} fill="none"
              stroke={colours[arcs[0].index % colours.length]} strokeWidth={rOuter - rInner}
            />
          ) : arcs.map((a) => (
            <path
              key={a.label}
              d={arcPath(cx, cy, hover === a.label ? rOuter + 3 : rOuter, rInner, a.from, a.to)}
              fill={colours[a.index % colours.length]}
              stroke={SURFACE} strokeWidth="2"
              style={{ cursor: "default", transition: "d 140ms ease" }}
              onMouseEnter={() => setHover(a.label)}
              onMouseLeave={() => setHover(null)}
            >
              <title>{`${a.label}: ${a.value} of ${total} (${Math.round(a.share * 100)}%)`}</title>
            </path>
          ))}
          <text
            x={cx} y={cy - 3} textAnchor="middle" dominantBaseline="middle"
            fontFamily="var(--font-heading)" fontWeight="800" fontSize="30"
            fill="var(--color-text)" style={{ fontVariantNumeric: "tabular-nums" }}
          >{totalLabel ?? total}</text>
          <text
            x={cx} y={cy + 18} textAnchor="middle" dominantBaseline="middle"
            fontSize="9.5" letterSpacing="1.2" fill="var(--color-text)" opacity="0.55"
          >{(totalNote || "TOTAL").toUpperCase()}</text>
        </svg>
      </div>

      <div className="clm-donut-legend">
        {data.map((d, i) => {
          const share = total ? d.value / total : 0;
          return (
            <div
              key={d.label}
              className="clm-donut-row"
              title={d.sub || d.label}
              style={{ opacity: d.value === 0 ? 0.42 : 1, background: hover === d.label ? "rgb(32 30 29 / 6%)" : "transparent" }}
              onMouseEnter={() => setHover(d.label)}
              onMouseLeave={() => setHover(null)}
            >
              <i className="clm-swatch" style={{ background: d.value ? colours[i % colours.length] : TRACK }} />
              <span className="clm-donut-name">{d.label}</span>
              <span className="clm-donut-count">{d.value}</span>
              <span className="clm-donut-share">{d.value ? `${Math.round(share * 100)}%` : "-"}</span>
            </div>
          );
        })}
        <TableView
          open={table} onToggle={() => setTable((t) => !t)}
          columns={["Stage", "Count", "Share"]}
          rows={data.map((d) => [d.label, d.value, total ? `${Math.round((d.value / total) * 100)}%` : "-"])}
        />
      </div>
    </div>
  );
}

export function ColumnChart({ data, height = 130, emptyNote, format = (v) => v }) {
  const [point, setPoint] = useState(null);
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <div className="clm-empty">{emptyNote || "Nothing to show yet."}</div>;

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height, borderBottom: "2px solid var(--color-divider)" }}>
        {data.map((d) => {
          const h = d.value === 0 ? 3 : Math.max(10, (d.value / max) * (height - 26));
          return (
            <div key={d.label} className="clm-col">
              {d.value > 0 && <span className="clm-col-value">{format(d.value)}</span>}
              <div
                className="clm-col-bar"
                style={{
                  height: h,
                  background: d.value === 0 ? TRACK : d.highlight ? ACCENT : INK,
                }}
                onMouseEnter={(e) => {
                  const box = e.currentTarget.closest("[data-chart]")?.getBoundingClientRect();
                  const own = e.currentTarget.getBoundingClientRect();
                  if (box) setPoint({ x: own.left - box.left + own.width / 2, y: own.top - box.top, label: `${d.note || d.label}: ${format(d.value)}` });
                }}
                onMouseLeave={() => setPoint(null)}
              />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        {data.map((d) => (
          <div key={d.label} className="clm-col-label" style={{ flex: 1, textAlign: "center" }}>{d.label}</div>
        ))}
      </div>
      <Tooltip point={point} />
      <TableView
        open={table} onToggle={() => setTable((t) => !t)}
        columns={["Period", "Contracts"]}
        rows={data.map((d) => [d.note || d.label, format(d.value)])}
      />
    </div>
  );
}

// A wrapper that gives the tooltip something to position against.
export function ChartFrame({ title, note, children, action }) {
  return (
    <div className="card" data-chart style={{ position: "relative", gap: 0, padding: "var(--space-4)" }}>
      <div className="clm-chart-head">
        <span className="clm-chart-title">{title}</span>
        {action}
      </div>
      {note && <p className="clm-chart-note">{note}</p>}
      {children}
    </div>
  );
}

export function StatTile({ kicker, value, body, alert }) {
  const money = typeof value === "string" && /[GBP£$€]/.test(value);
  return (
    <div className={`card clm-stat${alert ? " clm-stat-alert" : ""}`}>
      <div className="clm-stat-kicker">{kicker}</div>
      <div className={`clm-stat-value${money ? " is-money" : ""}`}>{value}</div>
      {body && <p className="clm-stat-body">{body}</p>}
    </div>
  );
}
