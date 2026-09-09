import { useState } from "react";
import { ChevronDown } from "lucide-react";

// A card that collapses. The workspace carries a lot of panels that matter at one stage
// of the lifecycle and are noise at every other, so each one can be folded away without
// losing the fact that it is there.
export default function Fold({ title, note, right, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="clm-fold">
      <button type="button" className="clm-fold-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="clm-fold-title">{title}</span>
        {note && <span className="clm-fold-note">{note}</span>}
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }} onClick={(e) => e.stopPropagation()}>
          {right}
          <ChevronDown size={16} className={`clm-chev${open ? " is-open" : ""}`} />
        </span>
      </button>
      {open && <div className="clm-fold-body">{children}</div>}
    </section>
  );
}
