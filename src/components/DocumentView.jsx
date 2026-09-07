import { useRef, useState } from "react";
import { MessageSquare, Check, X, CornerDownRight } from "lucide-react";
import { Tag, Btn, GRAY, AMBER, GREEN, RED } from "../lib/ui.jsx";

function RunSpan({ run, decision }) {
  if (run.t === "ins") {
    const done = decision === "accepted";
    return (
      <span
        className="clm-ins"
        style={done ? { textDecoration: "none", color: "inherit", background: "transparent" } : undefined}
        title={`Inserted by ${run.author || "counterparty"}`}
      >{run.text}</span>
    );
  }
  if (run.t === "del") {
    if (decision === "accepted") return null;
    return (
      <span
        className="clm-del"
        style={decision === "rejected" ? { textDecoration: "none", color: "inherit", background: "transparent" } : undefined}
        title={`Deleted by ${run.author || "counterparty"}`}
      >{run.text}</span>
    );
  }
  if (run.t === "token") {
    const filled = run.value != null && run.value !== "";
    return (
      <span className={filled ? "clm-token-filled" : "clm-token-empty"} title={`Merge field: ${run.name}`}>
        {filled ? run.value : `[${run.name}]`}
      </span>
    );
  }
  return <span>{run.text}</span>;
}

function CommentThread({ comment, onReply, onResolve, canAct }) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);

  return (
    <div className="clm-comment" style={comment.resolved ? { opacity: 0.55 } : undefined}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <MessageSquare size={12} />
        <span style={{ fontWeight: 600, fontSize: 12 }}>{comment.author}</span>
        {comment.role && <span style={{ fontSize: 10.5, opacity: 0.55 }}>{comment.role}</span>}
        {comment.resolved && <Tag c={GREEN} style={{ fontSize: 9.5, marginLeft: "auto" }}>Resolved</Tag>}
      </div>
      <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 5 }}>
        on clause {comment.anchor} · {comment.date}
        {comment.commentOnly && " · comment only, no edit"}
      </div>
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5 }}>{comment.text}</p>

      {(comment.replies || []).map((reply, i) => (
        <div key={i} style={{ display: "flex", gap: 6, marginTop: 8, paddingLeft: 4 }}>
          <CornerDownRight size={12} style={{ flex: "none", marginTop: 3, opacity: 0.5 }} />
          <div>
            <div style={{ fontSize: 11, fontWeight: 600 }}>{reply.author}</div>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>{reply.text}</p>
          </div>
        </div>
      ))}

      {canAct && !comment.resolved && (
        open ? (
          <div style={{ marginTop: 8 }}>
            <textarea
              className="input" value={draft} onChange={(e) => setDraft(e.target.value)}
              placeholder="Reply to the counterparty…" style={{ fontSize: 12, minHeight: 54 }}
            />
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <Btn small variant="primary" onClick={() => { if (draft.trim()) { onReply(comment.id, draft.trim()); setDraft(""); setOpen(false); } }}>Reply</Btn>
              <Btn small variant="ghost" onClick={() => setOpen(false)}>Cancel</Btn>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <Btn small variant="ghost" onClick={() => setOpen(true)}>Reply</Btn>
            <Btn small variant="ghost" onClick={() => onResolve(comment.id)}>Resolve</Btn>
          </div>
        )
      )}
    </div>
  );
}

function watermarkTile(text) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="430" height="300">`
    + `<text x="215" y="150" text-anchor="middle" transform="rotate(-30 215 150)" `
    + `font-family="Archivo, Helvetica, sans-serif" font-size="52" font-weight="800" `
    + `letter-spacing="3" fill="#ec3013" fill-opacity="0.11">${text}</text></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export default function DocumentView({
  doc,
  watermark,
  decisions = {},
  onAccept,
  onReject,
  onReply,
  onResolveComment,
  onAddComment,
  canAct = true,          // may accept or reject tracked changes
  canComment = null,      // may reply to and resolve threads (defaults to canAct)
  height = 620,
  showComments = true,
  showFields = true,
  fill = false,        // stretch to the parent instead of taking a fixed height
}) {
  const mayComment = canComment == null ? canAct : canComment;
  const [commentOn, setCommentOn] = useState(null);
  const [commentDraft, setCommentDraft] = useState("");
  const paperRef = useRef(null);
  const comments = doc.comments || [];
  const changeById = Object.fromEntries((doc.changes || []).map((c) => [c.id, c]));

  const changedRefs = [...new Set(
    (doc.blocks || [])
      .filter((b) => (b.runs || []).some((r) => r.t === "ins" || r.t === "del"))
      .map((b) => b.ref)
      .filter(Boolean)
  )];
  function jumpTo(ref) {
    const target = paperRef.current?.querySelector(`#clause-${CSS.escape(ref)}`);
    if (target) target.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  const shellStyle = fill ? { display: "flex", flexDirection: "column", flex: 1, minHeight: 0 } : undefined;
  const columnStyle = fill ? { display: "flex", flexDirection: "column", flex: 1, minHeight: 0 } : undefined;
  const wrapStyle = fill ? { flex: 1, minHeight: 0 } : { maxHeight: height };

  return (
    <div className="clm-doc-shell" style={shellStyle}>
      <div style={columnStyle}>
      {changedRefs.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
          <span style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.5 }}>
            Jump to change
          </span>
          {changedRefs.map((ref) => {
            const settled = (doc.changes || [])
              .filter((c) => c.clauseRef === ref)
              .every((c) => decisions[c.id] && decisions[c.id] !== "pending");
            return (
              <button
                key={ref} type="button" onClick={() => jumpTo(ref)}
                className="tag" style={{
                  cursor: "pointer", border: "1px solid var(--color-divider)",
                  background: settled ? "transparent" : "#fdf1da",
                  color: settled ? "inherit" : "#7a4a05", fontSize: 11,
                }}
              >
                {ref}{settled ? " ✓" : ""}
              </button>
            );
          })}
        </div>
      )}
      <div className="clm-paper-wrap" ref={paperRef} style={wrapStyle}>
        <div
          className={`clm-paper${watermark ? " clm-paper-watermarked" : ""}${showFields ? " clm-show-fields" : ""}`}
          data-watermark={watermark || ""}
          style={watermark ? { backgroundImage: watermarkTile(watermark) } : undefined}
        >
          {(doc.blocks || []).map((block, i) => {
            if (block.type === "title") return <h1 key={i} className="clm-doc-title">{block.text}</h1>;
            if (block.type === "subtitle") return <p key={i} className="clm-doc-subtitle">{block.text}</p>;
            if (block.type === "signature") {
              return (
                <div key={i} className={`clm-sigblock${block.signed ? " signed" : ""}`}>
                  <div className="clm-sigblock-head">Signed for and on behalf of {block.entity}</div>
                  {block.signed ? (
                    <dl className="clm-sigblock-rows">
                      <dt>Signature</dt>
                      <dd>
                        <div className="clm-sig-mark">{block.byName}</div>
                        <div className="clm-sig-caption">Signed electronically</div>
                      </dd>
                      <dt>Name</dt><dd>{block.byName}</dd>
                      <dt>Title</dt><dd>{block.title || "Authorised signatory"}</dd>
                      <dt>Date</dt><dd>{block.date}</dd>
                      <dt>Method</dt><dd>{block.method || "Typed electronic signature"}</dd>
                    </dl>
                  ) : (
                    <dl className="clm-sigblock-rows">
                      <dt>Signature</dt><dd className="clm-sig-blank" />
                      <dt>Name</dt><dd className="clm-sig-blank" />
                      <dt>Date</dt><dd className="clm-sig-blank" />
                    </dl>
                  )}
                </div>
              );
            }
            if (block.type === "heading") {
              return (
                <h2 key={i} className="clm-doc-heading">
                  {block.number ? `${block.number}. ` : ""}{block.text}
                </h2>
              );
            }

            const runs = block.runs || [];
            const changeIds = [...new Set(runs.map((r) => r.changeId).filter(Boolean))];
            const anchored = comments.filter((c) => c.anchor === block.ref);
            const pending = changeIds.filter((id) => !decisions[id] || decisions[id] === "pending");

            return (
              <div key={i} className="clm-doc-clause" id={block.ref ? `clause-${block.ref}` : undefined}>
                <p className="clm-doc-para">
                  {block.ref && <strong className="clm-doc-ref">{block.ref}{block.heading ? ` ${block.heading}` : ""}. </strong>}
                  {runs.map((run, j) => (
                    <RunSpan key={j} run={run} decision={run.changeId ? decisions[run.changeId] : undefined} />
                  ))}
                  {anchored.length > 0 && (
                    <span className="clm-comment-marker" title={`${anchored.length} comment${anchored.length > 1 ? "s" : ""}`}>
                      <MessageSquare size={11} />
                    </span>
                  )}
                </p>

                {changeIds.map((id) => {
                  const change = changeById[id];
                  const decision = decisions[id] || "pending";
                  return (
                    <div key={id} className="clm-change-bar">
                      <Tag
                        c={decision === "accepted" ? GREEN : decision === "rejected" ? GRAY : AMBER}
                        style={{ fontSize: 10 }}
                      >
                        {decision === "accepted" ? "Change accepted" : decision === "rejected" ? "Change rejected" : "Tracked change"}
                      </Tag>
                      <span style={{ fontSize: 11, opacity: 0.6 }}>
                        {change?.author || "Counterparty"} · {change?.date || ""}
                      </span>
                      {canAct && decision === "pending" && (
                        <span style={{ display: "inline-flex", gap: 4, marginLeft: "auto" }}>
                          <Btn small variant="secondary" icon={Check} onClick={() => onAccept?.(id)}>Accept</Btn>
                          <Btn small variant="ghost" icon={X} onClick={() => onReject?.(id)}>Reject</Btn>
                        </span>
                      )}
                      {decision !== "pending" && canAct && (
                        <Btn small variant="ghost" style={{ marginLeft: "auto" }} onClick={() => onAccept?.(id, "pending")}>Undo</Btn>
                      )}
                    </div>
                  );
                })}

                {mayComment && onAddComment && block.ref && (
                  commentOn === block.ref ? (
                    <div className="clm-change-bar" style={{ display: "block" }}>
                      <textarea
                        className="input" value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)}
                        placeholder={`Comment on clause ${block.ref}…`} style={{ fontSize: 12, minHeight: 54 }}
                      />
                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <Btn small variant="primary" onClick={() => {
                          if (commentDraft.trim()) { onAddComment(block.ref, commentDraft.trim()); setCommentDraft(""); setCommentOn(null); }
                        }}>Add comment</Btn>
                        <Btn small variant="ghost" onClick={() => { setCommentOn(null); setCommentDraft(""); }}>Cancel</Btn>
                      </div>
                    </div>
                  ) : (
                    pending.length > 0 || anchored.length > 0 ? (
                      <div className="clm-change-bar" style={{ borderTop: "none", paddingTop: 0 }}>
                        <Btn small variant="ghost" icon={MessageSquare} onClick={() => setCommentOn(block.ref)}>Comment</Btn>
                      </div>
                    ) : null
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>
      </div>

      {showComments && comments.length > 0 && (
        <aside className="clm-margin" style={{ maxHeight: height }}>
          <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.55, marginBottom: 4 }}>
            Comments ({comments.filter((c) => !c.resolved).length} open)
          </div>
          <p style={{ fontSize: 11, opacity: 0.6, margin: "0 0 6px", lineHeight: 1.55 }}>
            Resolving closes the <em>conversation</em>. Accepting or rejecting decides the <em>change</em>. They are
            separate on purpose: a clause can have a settled argument and a pending edit, or an accepted edit and an
            argument still running underneath it.
          </p>
          {comments.map((comment) => (
            <CommentThread
              key={comment.id} comment={comment} canAct={mayComment}
              onReply={onReply} onResolve={onResolveComment}
            />
          ))}
        </aside>
      )}
    </div>
  );
}

export function ChangeSummary({ doc, decisions }) {
  const changes = doc.changes || [];
  if (!changes.length) return null;
  const counted = { accepted: 0, rejected: 0, pending: 0 };
  for (const c of changes) counted[decisions[c.id] || "pending"]++;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      <Tag c={GRAY} style={{ fontSize: 10.5 }}>{changes.length} tracked change{changes.length === 1 ? "" : "s"}</Tag>
      {counted.pending > 0 && <Tag c={AMBER} style={{ fontSize: 10.5 }}>{counted.pending} pending</Tag>}
      {counted.accepted > 0 && <Tag c={GREEN} style={{ fontSize: 10.5 }}>{counted.accepted} accepted</Tag>}
      {counted.rejected > 0 && <Tag c={RED} style={{ fontSize: 10.5 }}>{counted.rejected} rejected</Tag>}
    </div>
  );
}
