import { Component } from "react";
import { clearSnapshot } from "../lib/session.js";

// The recovery this app specifically needs.
//
// The session is restored from localStorage on mount, so a render error caused by
// something in that snapshot is not a one-off: it is reproduced by the reload the user
// reaches for first, and by the one after that. Without a boundary the page is blank, and
// the reset control that would fix it is inside the tree that just died.
//
// So the fallback is not an apology. It is the reset button, on a page that still
// renders, saying what it is about to throw away.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Kept for whoever opens the console; the UI does not need the stack.
    console.error("CLM demo crashed during render", error, info?.componentStack);
  }

  reset = () => {
    clearSnapshot(window.localStorage);
    window.location.replace(window.location.pathname);
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{ minHeight: "100vh", background: "var(--color-bg)", color: "var(--color-text)",
        fontFamily: "var(--font-body)", display: "flex", alignItems: "center", justifyContent: "center",
        padding: "var(--space-6)" }}
      >
        <div className="card" style={{ maxWidth: 560 }}>
          <div className="card-kicker">Something broke</div>
          <div className="card-title">The demo stopped rendering</div>
          <p className="card-body" style={{ lineHeight: 1.6 }}>
            This session is restored from your browser's storage on load, so if the stored session is what
            caused it, reloading will land you here again. Clearing it starts a clean demo.
          </p>
          <p className="card-body" style={{ lineHeight: 1.6 }}>
            <strong>Clearing discards the saved session:</strong> any draft, redline, decisions, signatures and
            obligations from this run. Nothing outside this browser is affected.
          </p>
          <pre style={{ background: "var(--color-neutral-100)", border: "1px solid var(--color-divider)",
            padding: "var(--space-3)", fontSize: 11.5, overflowX: "auto", margin: "0 0 var(--space-4)" }}
          >{String(this.state.error?.message || this.state.error)}</pre>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-primary" onClick={this.reset}>
              Clear the session and reload
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => window.location.reload()}>
              Just reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
