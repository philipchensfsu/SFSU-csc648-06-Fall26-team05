import { useId, useMemo, useState } from "react";
import { documentToSections } from "../../../prototype/data.js";
import { formatDate, formatDayTime } from "../format";
import { cleanHtml } from "../editor/html";
import { compareDocuments } from "../editor/proposalDiff";
import { sectionLabel, versionAuthor } from "./details";

// One saved version, read-only: its title, description and sections, with
// the sections that version changed marked. Section HTML goes through the
// editor's schema (cleanHtml) before it's shown, like everywhere else.
export function VersionReader({ version, currentVersionNo }) {
  const ids = useId();
  const sections = useMemo(() => documentToSections(version.content_json) ?? [], [version.content_json]);
  const changed = new Set(version.changed_sections ?? []);
  const isCurrent = currentVersionNo === version.version_no;

  return (
    <>
      <div className="nd-banner" role="status">
        <strong>You’re reading version {version.version_no}</strong>, saved by {versionAuthor(version)} (
        {formatDayTime(version.created_at)}). It’s read-only.
        {isCurrent ? " This is the current version." : currentVersionNo ? ` The current version is ${currentVersionNo}.` : ""}
      </div>
      <div className="nd-reader">
        {sections.length ? (
          <nav aria-label="Sections" className="nd-reader-nav">
            <span className="nd-label">Contents</span>
            <ol>
              {sections.map((section, index) => (
                <li key={section.id}>
                  <a href={`#${ids}-${section.id}`} className={changed.has(section.id) ? "is-changed" : undefined}>
                    <span className="nd-num" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {section.title}
                    {changed.has(section.id) ? <span className="nd-flag">Changed</span> : null}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        <article className="nd-doc">
          <span className="nd-label">Version {version.version_no} · Product requirements document</span>
          <h2 className="nd-doc-title">{version.title || "Untitled PRD"}</h2>
          {version.description ? <p className="nd-doc-desc">{version.description}</p> : null}
          {sections.length ? (
            sections.map((section) => (
              <section
                key={section.id}
                id={`${ids}-${section.id}`}
                className={`nd-doc-section${changed.has(section.id) ? " is-changed" : ""}`}
              >
                <div className="nd-doc-section-head">
                  <h3>{section.title}</h3>
                  {changed.has(section.id) ? <span className="nd-flag">Changed in this version</span> : null}
                </div>
                <div className="ne-content" dangerouslySetInnerHTML={{ __html: cleanHtml(section.html) }} />
              </section>
            ))
          ) : (
            <p className="nd-muted">This version has no sections.</p>
          )}
        </article>
      </div>
    </>
  );
}

const STATUS_NOTES = {
  changed: "Changed",
  added: "Added since",
  removed: "Removed since",
  format: "Formatting changed",
  unchanged: "Unchanged",
};

function Words({ parts, side }) {
  if (!parts.length) return <p className="nc-empty">Empty</p>;
  const Changed = side === "old" ? "del" : "ins";
  return (
    <p className="nc-text">
      {parts.map((part, index) =>
        part.changed ? (
          <Changed key={index} className={side === "old" ? "nc-del" : "nc-ins"}>
            {part.text}
          </Changed>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </p>
  );
}

// An older version beside the current PRD, section by section, with the
// words that differ marked. Read-only: nothing here changes either one.
export function VersionComparison({ version, currentDocument, currentVersionNo }) {
  const rows = useMemo(
    () => compareDocuments(version.content_json, currentDocument),
    [version.content_json, currentDocument],
  );
  const [changedOnly, setChangedOnly] = useState(true);
  const [shown, setShown] = useState("current");
  const changes = rows.filter((row) => row.status !== "unchanged").length;
  const visible = changedOnly ? rows.filter((row) => row.status !== "unchanged") : rows;
  const oldLabel = `Version ${version.version_no}`;
  const newLabel = currentVersionNo ? `Current · v${currentVersionNo}` : "Current";

  return (
    <section className="nc nd-compare" data-shown={shown === "old" ? "current" : "proposed"}>
      <header className="nd-compare-head">
        <h2 className="nd-h2">
          Version {version.version_no} compared with the current version
          {currentVersionNo ? ` (${currentVersionNo})` : ""}
        </h2>
        <p className="nd-muted">
          {changes === 0
            ? "Nothing differs: this version matches the current PRD."
            : `${changes} of ${rows.length} ${rows.length === 1 ? "section differs" : "sections differ"}. Words only in version ${version.version_no} are struck through; words added since are highlighted.`}
        </p>
        <p className="nd-muted">
          Saved by {versionAuthor(version)} on {formatDate(version.created_at)}.
        </p>
      </header>

      <div className="nc-toolbar">
        <div className="nc-toggle" role="group" aria-label="Show">
          {[
            ["old", oldLabel],
            ["current", "Current"],
          ].map(([side, label]) => (
            <button
              key={side}
              type="button"
              className={`nc-toggle-btn${shown === side ? " is-active" : ""}`}
              aria-pressed={shown === side}
              onClick={() => setShown(side)}
            >
              {label}
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
        <span>{oldLabel}</span>
        <span>{newLabel}</span>
      </div>

      {visible.length ? (
        <ol className="nc-sections">
          {visible.map((row) => (
            <li key={row.type} className={`nc-section is-${row.status}`}>
              <div className="nc-section-head">
                <h3 className="nc-section-title">{row.label ?? sectionLabel(row.type)}</h3>
                <span className="nc-status">{STATUS_NOTES[row.status]}</span>
              </div>
              <div className="nc-pair">
                <div className="nc-side nc-side-current">
                  <span className="nc-side-label">{oldLabel}</span>
                  {row.current ? <Words parts={row.current} side="old" /> : <p className="nc-empty">Not in this version</p>}
                </div>
                <div className="nc-side nc-side-proposed">
                  <span className="nc-side-label">{newLabel}</span>
                  {row.proposed ? (
                    <Words parts={row.proposed} side="new" />
                  ) : (
                    <p className="nc-empty">Removed since</p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="nc-empty">{rows.length ? "Every section is the same." : "Neither version has any sections."}</p>
      )}
    </section>
  );
}
