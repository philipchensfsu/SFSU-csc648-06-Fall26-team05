import { cleanHtml, escapeHtml } from "./html";

// Exports of a saved PRD (R_11): PDF through the browser's print dialog,
// Word (.doc, which Word and Google Docs open as a document) and Markdown.
// All three are built in the browser from the saved sections.

function fileName(title) {
  const slug = (title || "prd")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug || "prd";
}

function documentHtml(prd) {
  const sections = prd.sections
    .map(
      (section, index) =>
        `<section><h2>${index + 1}. ${escapeHtml(section.title)}</h2>${cleanHtml(section.html)}</section>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(prd.title)}</title>
<style>
body{font-family:Georgia,'Times New Roman',serif;color:#102C33;max-width:720px;margin:32px auto;padding:0 24px;line-height:1.55}
h1{font-size:28px;margin:0 0 6px}h2{font-size:19px;margin:28px 0 8px}
.lede{color:#3E5A60;margin:0 0 8px}.meta{color:#557479;font-size:12px;margin:0 0 24px}
table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #C3DADE;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#F1F7F8}mark{background:#FFF1D6;color:inherit}
</style></head><body>
<h1>${escapeHtml(prd.title)}</h1>
${prd.description ? `<p class="lede">${escapeHtml(prd.description)}</p>` : ""}
<p class="meta">Product requirements document</p>
${sections}
</body></html>`;
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Prints from a hidden frame, so no new tab opens; "Save as PDF" in the
// print dialog makes the PDF.
export function exportPdf(prd) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(documentHtml(prd));
  doc.close();
  const printFrame = () => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 60000);
  };
  if (doc.readyState === "complete") setTimeout(printFrame, 50);
  else frame.addEventListener("load", printFrame, { once: true });
}

export function exportWord(prd) {
  download(`${fileName(prd.title)}.doc`, documentHtml(prd), "application/msword");
}

// --- Markdown -------------------------------------------------------------

function inline(node) {
  let text = "";
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.textContent.replace(/\s+/g, " ");
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const inner = inline(child);
    switch (child.tagName) {
      case "STRONG":
        text += inner.trim() ? `**${inner.trim()}**` : "";
        break;
      case "EM":
        text += inner.trim() ? `*${inner.trim()}*` : "";
        break;
      case "A":
        text += `[${inner}](${child.getAttribute("href")})`;
        break;
      case "BR":
        text += "  \n";
        break;
      case "MARK":
        text += `${inner} _(assumption)_`;
        break;
      default:
        text += inner;
    }
  });
  return text;
}

function cell(text) {
  return text.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}

function blocks(root, lines) {
  root.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent.trim()) lines.push(node.textContent.trim(), "");
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    switch (node.tagName) {
      // Section titles are ##, so headings inside a section start at ###.
      case "H1":
      case "H2":
      case "H3":
        lines.push(`${"#".repeat(Number(node.tagName[1]) + 2)} ${inline(node).trim()}`, "");
        break;
      case "UL":
      case "OL":
        [...node.children].forEach((item, index) => {
          lines.push(`${node.tagName === "OL" ? `${index + 1}.` : "-"} ${inline(item).trim()}`);
        });
        lines.push("");
        break;
      case "BLOCKQUOTE":
        lines.push(`> ${inline(node).trim()}`, "");
        break;
      case "TABLE": {
        const rows = [...node.querySelectorAll("tr")].map((row) =>
          [...row.children].map((item) => cell(inline(item))),
        );
        if (!rows.length) break;
        const width = Math.max(...rows.map((row) => row.length));
        const pad = (row) => [...row, ...Array(width - row.length).fill("")];
        lines.push(`| ${pad(rows[0]).join(" | ")} |`, `| ${Array(width).fill("---").join(" | ")} |`);
        rows.slice(1).forEach((row) => lines.push(`| ${pad(row).join(" | ")} |`));
        lines.push("");
        break;
      }
      default: {
        const text = inline(node).trim();
        if (text) lines.push(text, "");
      }
    }
  });
}

export function toMarkdown(prd) {
  const lines = [`# ${prd.title}`, ""];
  if (prd.description) lines.push(prd.description, "");
  prd.sections.forEach((section, index) => {
    lines.push(`## ${index + 1}. ${section.title}`, "");
    const doc = new DOMParser().parseFromString(cleanHtml(section.html), "text/html");
    blocks(doc.body, lines);
  });
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

export function exportMarkdown(prd) {
  download(`${fileName(prd.title)}.md`, toMarkdown(prd), "text/markdown");
}
