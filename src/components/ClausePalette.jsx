import { useMemo, useState } from "react";
import { Search, GripVertical, BookOpen, ChevronDown, Check } from "lucide-react";
import { PLAYBOOK } from "../data/catalogue.js";
import { Tag, Btn, GRAY, RED, AMBER } from "../lib/ui.jsx";

export const CLAUSE_DRAG_TYPE = "application/x-clm-clause";

function riskColor(weight) {
  if (weight >= 5) return RED;
  if (weight >= 3) return AMBER;
  return GRAY;
}

// The playbook drawer is a modal, so nothing can be dragged out of it onto the document
// behind. This is the same book in a shape you can drag from, and it sits directly above
// the paper so the drag is a short one.
export default function ClausePalette({ onOpenPlaybook, onInsert, disabled, disabledNote, presentIn }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  // A clause the contract already has is not a candidate: a second liability cap is a
  // drafting defect, not a position. It stays visible so the book still reads as the
  // whole book, but it says where it already is instead of offering itself again.
  const already = useMemo(() => {
    const map = new Map();
    for (const block of presentIn?.blocks || []) {
      if (block.playbookCode && !map.has(block.playbookCode)) map.set(block.playbookCode, block.ref);
    }
    return map;
  }, [presentIn]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = PLAYBOOK.filter((c) => !q
      || [c.name, c.code, c.clauseRef, c.standard, ...(c.aliases || []), ...(c.keywords || [])]
        .join(" ").toLowerCase().includes(q));
    return [...matches].sort((a, b) => {
      const inDoc = Number(already.has(a.code)) - Number(already.has(b.code));
      return inDoc !== 0 ? inDoc : b.riskWeight - a.riskWeight;
    });
  }, [query, already]);

  const addable = results.filter((c) => !already.has(c.code)).length;

  return (
    <div className={`clm-palette${open ? " is-open" : ""}`}>
      <button type="button" className="clm-palette-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <BookOpen size={14} />
        <span className="clm-palette-title">Insert a clause</span>
        <span className="clm-palette-sub">
          {disabled
            ? (disabledNote || "read-only")
            : `${addable} not yet in this contract`}
        </span>
        <ChevronDown size={15} className={`clm-chev${open ? " is-open" : ""}`} style={{ marginLeft: "auto" }} />
      </button>

      {open && (
        <div className="clm-palette-body">
          <div className="clm-palette-tools">
            <div className="clm-palette-search">
              <Search size={13} />
              <input
                className="input" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="cap, TUPE, notice…" aria-label="Search the playbook"
              />
            </div>
            <Btn small variant="ghost" icon={BookOpen} onClick={onOpenPlaybook}>Full playbook</Btn>
          </div>

          <p className="clm-palette-hint">
            {disabled
              ? (disabledNote || "Read-only on this version.")
              : addable === 0
                ? "Every clause in the playbook is already in this contract. To change one, edit the clause itself."
                : "Drag a clause onto a paragraph to add our standard wording after it, as a tracked insertion. Greyed-out clauses are already in the contract."}
          </p>

          <div className="clm-palette-rail">
            {results.map((clause) => {
              const at = already.get(clause.code);
              const off = disabled || at !== undefined;
              return (
                <div
                  key={clause.code}
                  className={`clm-palette-chip${off ? " is-disabled" : ""}${at !== undefined ? " is-present" : ""}`}
                  draggable={!off}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "copy";
                    e.dataTransfer.setData(CLAUSE_DRAG_TYPE, clause.code);
                    e.dataTransfer.setData("text/plain", clause.standardWording || clause.standard || "");
                  }}
                  onDoubleClick={() => { if (!off) onInsert?.(clause.code); }}
                  title={at !== undefined
                    ? `Already in this contract at clause ${at}`
                    : disabled ? undefined : `Drag "${clause.name}" onto a paragraph, or double-click to add at the end`}
                >
                  {!off && <GripVertical size={12} className="clm-palette-grip" />}
                  {at !== undefined && <Check size={12} className="clm-palette-grip" />}
                  <div className="clm-palette-chip-body">
                    <div className="clm-palette-chip-name">{clause.name}</div>
                    <div className="clm-palette-chip-meta">
                      {at !== undefined ? `in this contract at ${at}` : `${clause.clauseRef} · ${clause.category}`}
                    </div>
                  </div>
                  {at === undefined && (
                    <Tag c={riskColor(clause.riskWeight)} style={{ fontSize: 9.5, flex: "none" }}>{clause.riskWeight}</Tag>
                  )}
                </div>
              );
            })}
            {!results.length && (
              <p className="clm-palette-hint">Nothing matches that. Try a broader term.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
