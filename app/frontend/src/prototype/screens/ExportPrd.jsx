import { useState } from "react";

const FORMATS = [
  { id: "pdf", label: "PDF", help: "Best for sharing and printing." },
  { id: "docx", label: "Word (.docx)", help: "Open and edit in Word or Google Docs." },
  { id: "md", label: "Markdown (.md)", help: "Plain text for repos and wikis." },
];

const slugify = (text) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const escapeHtml = (text) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function buildHtml(prd, withToc) {
  const toc = withToc
    ? `<h2>Contents</h2><ol>${prd.sections.map((s) => `<li>${s.title}</li>`).join("")}</ol>`
    : "";
  const body = prd.sections
    .map((s, i) => `<h2>${i + 1}. ${s.title}</h2>${s.html}`)
    .join("");
  return `<h1>${escapeHtml(prd.title)}</h1>${toc}${body}`;
}

function htmlToMarkdown(html) {
  const root = document.createElement("div");
  root.innerHTML = html;
  const lines = [];
  root.childNodes.forEach((node) => {
    const text = node.textContent.trim();
    switch (node.nodeName) {
      case "H1":
        lines.push(`# ${text}`, "");
        break;
      case "H2":
        lines.push(`## ${text}`, "");
        break;
      case "H3":
        lines.push(`### ${text}`, "");
        break;
      case "UL":
      case "OL":
        node.querySelectorAll("li").forEach((li, i) =>
          lines.push(`${node.nodeName === "OL" ? `${i + 1}.` : "-"} ${li.textContent.trim()}`),
        );
        lines.push("");
        break;
      default:
        if (text) lines.push(text, "");
    }
  });
  return lines.join("\n");
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function ExportPrd({ prd, onBack }) {
  const [fileName, setFileName] = useState(slugify(prd.title));
  const [format, setFormat] = useState("pdf");
  const [withToc, setWithToc] = useState(true);
  const html = buildHtml(prd, withToc);

  function handleDownload(event) {
    event.preventDefault();
    const name = fileName.trim() || slugify(prd.title);
    if (format === "md") {
      download(`${name}.md`, htmlToMarkdown(html), "text/markdown");
    } else if (format === "docx") {
      // Word opens HTML saved as .doc; a real .docx needs a library.
      download(`${name}.doc`, `<html><body>${html}</body></html>`, "application/msword");
    } else {
      const win = window.open("", "_blank");
      win.document.write(`<title>${escapeHtml(name)}</title><body style="font-family:system-ui;max-width:720px;margin:2rem auto">${html}</body>`);
      win.document.close();
      win.print();
    }
  }

  return (
    <main className="nt-main nt-export">
      <section className="nt-card">
        <p className="nt-prd-title">{prd.title} · v1</p>
        <h1>Export your PRD</h1>
        <p className="nt-muted">Choose a format to download your document.</p>
        <form onSubmit={handleDownload}>
          <div className="nt-field">
            <label htmlFor="fileName">File name</label>
            <input
              id="fileName"
              value={fileName}
              onChange={(event) => setFileName(event.target.value)}
            />
          </div>
          <fieldset className="nt-formats">
            <legend>Format</legend>
            {FORMATS.map((option) => (
              <label
                key={option.id}
                className={`nt-format${format === option.id ? " is-selected" : ""}`}
              >
                <input
                  type="radio"
                  name="format"
                  value={option.id}
                  checked={format === option.id}
                  onChange={() => setFormat(option.id)}
                />
                <span>
                  <strong>{option.label}</strong>
                  <span className="nt-muted nt-small">{option.help}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <label className="nt-check">
            <input
              type="checkbox"
              checked={withToc}
              onChange={(event) => setWithToc(event.target.checked)}
            />
            Include table of contents
          </label>
          <div className="nt-actions">
            <button type="submit" className="nt-btn nt-btn-primary">
              Download
            </button>
            <button type="button" className="nt-btn nt-btn-secondary" onClick={onBack}>
              Back to editor
            </button>
          </div>
        </form>
      </section>

      <section className="nt-card nt-preview" aria-labelledby="preview-heading">
        <h2 id="preview-heading" className="nt-eyebrow">
          Preview
        </h2>
        <div className="nt-preview-page" dangerouslySetInnerHTML={{ __html: html }} />
      </section>
    </main>
  );
}

export default ExportPrd;
