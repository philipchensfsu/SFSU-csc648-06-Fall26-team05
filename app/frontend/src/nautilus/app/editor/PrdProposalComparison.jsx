import { useId, useMemo, useState } from "react";
import "./comparison.css";
import { compareDocuments } from "./proposalDiff";

const STATUS_NOTES = {
  changed: "Changed",
  added: "New section",
  removed: "Removed",
  format: "Formatting changed",
  unchanged: "Unchanged",
};

// One side of a section: unchanged words as text, removed words struck
// through on the current side, added words highlighted on the proposed side.
// Everything is React text, never HTML, so nothing in a document can run.
function Words({ parts, side }) {
  if (!parts.length) return <p className="nc-empty">Empty</p>;
  const Changed = side === "current" ? "del" : "ins";
  return (
    <p className="nc-text">
      {parts.map((part, index) =>
        part.changed ? (
          <Changed key={index} className={`nc-${side === "current" ? "del" : "ins"}`}>
            {part.text}
          </Changed>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </p>
  );
}

function Side({ parts, side, missing }) {
  return (
    <div className={`nc-side nc-side-${side}`}>
      <span className="nc-side-label" aria-hidden="true">
        {side === "current" ? "Current" : "Proposed"}
      </span>
      {parts ? <Words parts={parts} side={side} /> : <p className="nc-empty">{missing}</p>}
    </div>
  );
}

// The saved PRD beside an AI proposal for it, the whole document in section
// order, with the words that differ highlighted. The person accepts or
// discards the whole proposal; nothing here edits either document.
//
// Props:
//   currentDocument   the saved v2 document the proposal was made from. Keep
//                     it fixed while the comparison is open, even if a newer
//                     save arrives: the proposal is against this one
//   proposedDocument  the proposal's complete document, as the server sent it
//   explanation       what the AI says it changed, shown as text
//   onAccept, onDiscard
//   busy              while accepting: both buttons wait
//   notice            an Alert to show above the documents (errors, conflicts)
//   acceptLabel       defaults to "Accept changes"
export default function PrdProposalComparison({
  currentDocument,
  proposedDocument,
  explanation,
  onAccept,
  onDiscard,
  busy = false,
  notice = null,
  acceptLabel = "Accept changes",
}) {
  const id = useId();
  const rows = useMemo(() => compareDocuments(currentDocument, proposedDocument), [currentDocument, proposedDocument]);
  // On narrow screens one side shows at a time; wide screens show both.
  const [shown, setShown] = useState("proposed");
  // Long PRDs bury a two-section change; this hides the sections that match.
  const [changedOnly, setChangedOnly] = useState(false);
  const changes = rows.filter((row) => row.status !== "unchanged").length;
  const visible = changedOnly ? rows.filter((row) => row.status !== "unchanged") : rows;

  return (
    <section className="nc" aria-labelledby={`${id}-title`} data-shown={shown}>
      <header className="nc-head">
        <div className="nc-head-text">
          <h2 className="nc-title" id={`${id}-title`}>
            Proposed changes
          </h2>
          <p className="nc-summary">
            {changes === 0
              ? "The proposal matches the current PRD."
              : `${changes} of ${rows.length} ${rows.length === 1 ? "section" : "sections"} would change. Nothing is saved until you accept.`}
          </p>
          {explanation ? <p className="nc-explanation">{explanation}</p> : null}
        </div>
        <div className="nc-actions">
          <button type="button" className="nw-btn nw-btn-secondary ne-btn-38" onClick={onDiscard} disabled={busy}>
            Discard
          </button>
          <button type="button" className="nw-btn nw-btn-primary ne-btn-38" onClick={onAccept} disabled={busy}>
            {busy ? "Accepting…" : acceptLabel}
          </button>
        </div>
      </header>

      {notice}

      <p className="nw-sr">
        On the current side, words the proposal removes are marked as deleted. On the proposed side, words it adds are
        marked as inserted.
      </p>
      <div className="nc-toolbar">
        <div className="nc-toggle" role="group" aria-label="Show">
          {["current", "proposed"].map((side) => (
            <button
              key={side}
              type="button"
              className={`nc-toggle-btn${shown === side ? " is-active" : ""}`}
              aria-pressed={shown === side}
              onClick={() => setShown(side)}
            >
              {side === "current" ? "Current" : "Proposed"}
            </button>
          ))}
        </div>
        {changes > 0 && changes < rows.length ? (
          <label className="nc-filter">
            <input type="checkbox" checked={changedOnly} onChange={(event) => setChangedOnly(event.target.checked)} />
            Changed sections only
          </label>
        ) : null}
      </div>

      <div className="nc-columns" aria-hidden="true">
        <span>Current PRD</span>
        <span>Proposed</span>
      </div>

      {rows.length ? (
        <ol className="nc-sections">
          {visible.map((row) => (
            <li key={row.type} className={`nc-section is-${row.status}`}>
              <div className="nc-section-head">
                <h3 className="nc-section-title">{row.label}</h3>
                <span className="nc-status">{STATUS_NOTES[row.status]}</span>
              </div>
              <div className="nc-pair">
                <Side parts={row.current} side="current" missing="Not in the current PRD" />
                <Side parts={row.proposed} side="proposed" missing="Removed in the proposal" />
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="nc-empty">Neither version has any sections yet.</p>
      )}
    </section>
  );
}
