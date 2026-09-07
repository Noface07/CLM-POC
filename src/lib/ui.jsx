export const RED = { bg: "var(--color-accent-100)", color: "var(--color-accent-800)" };
export const AMBER = { bg: "#fdf1da", color: "#7a4a05" };
export const GREEN = { bg: "#e3f0e4", color: "#285c31" };
export const GRAY = { bg: "var(--color-neutral-100)", color: "var(--color-neutral-800)" };
export const BLUE = { bg: "#e6edf5", color: "#1f4068" };

export function statusColor(status) {
  if (["Active", "Approved", "Executed", "Signed"].includes(status)) return GREEN;
  if (["In Negotiation", "Signature Pending", "Ready for Signature", "Amendment in Progress",
    "Renewal in Progress", "Expiring", "Partially Signed", "Pending", "Internal Review",
    "Drafting", "Preview"].includes(status)) return AMBER;
  if (["Exception Review", "Rejected", "Declined", "Expired", "Termination in Progress",
    "Terminated", "Cancelled"].includes(status)) return RED;
  return GRAY;
}

export function materialityColor(level) {
  if (level === "High") return RED;
  if (level === "Medium") return AMBER;
  return GRAY;
}

export function bandColor(position) {
  if (position === "standard") return GREEN;
  if (position === "fallback") return AMBER;
  if (position === "walkAway") return RED;
  return GRAY;
}

export const kicker = {
  fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.55, marginBottom: 3,
};
export const textBox = {
  background: "var(--color-neutral-100)", border: "1px solid var(--color-divider)",
  padding: "var(--space-3)", fontSize: 13, lineHeight: 1.6,
};

export function Tag({ children, c, outline, style }) {
  if (outline) return <span className="tag tag-outline" style={style}>{children}</span>;
  return <span className="tag" style={{ background: c?.bg, color: c?.color, ...style }}>{children}</span>;
}

export function Btn({ onClick, children, disabled, icon: Icon, spin, variant = "secondary", small, style, title }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} title={title}
      className={`btn btn-${variant}`}
      style={{ ...(small ? { padding: "4px 10px", fontSize: 12 } : {}), ...style }}
    >
      {Icon && <Icon size={14} className={spin ? "clm-spin" : ""} />}
      {children}
    </button>
  );
}

export function Field({ label, hint, children, style }) {
  return (
    <div className="field" style={{ margin: 0, ...style }}>
      <label>{label}</label>
      {children}
      {hint && <p style={{ fontSize: 10.5, opacity: 0.5, margin: "4px 0 0" }}>{hint}</p>}
    </div>
  );
}

export function Stat({ kicker: k, value, body, tone }) {
  return (
    <div className="card">
      <div className="card-kicker" style={tone ? { color: tone.color } : undefined}>{k}</div>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 34, lineHeight: 1 }}>{value}</div>
      {body && <p className="card-body">{body}</p>}
    </div>
  );
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
export function shortId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
export function stampNow() {
  const n = new Date();
  return `${n.toLocaleDateString([], { day: "2-digit", month: "short" })} ${n.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}
export function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  return isNaN(d) ? String(value) : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || "").trim());
}
