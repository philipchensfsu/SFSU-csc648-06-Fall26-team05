// The TipTap schema for PRD documents, configured to the shared spec
// (docs/prd-document-format.md, doc_schema_version 2). Anything the spec
// doesn't list (images, code, strike, colours, merged cells...) isn't in the
// schema, so TipTap drops it when content is pasted or loaded.
//
// Two documents share these extensions:
// - prdDocumentExtensions: the whole v2 document (doc > section*), used to
//   check the shared fixtures round-trip.
// - sectionExtensions: one section's content, which is what the editor page
//   edits at a time.
import { Mark, Node, mergeAttributes } from "@tiptap/core";
import Blockquote from "@tiptap/extension-blockquote";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import Link from "@tiptap/extension-link";
import { ListItem, OrderedList } from "@tiptap/extension-list";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";

// The nine section types, in the standard order, with their derived labels.
export const SECTION_TYPES = [
  ["problem", "Problem Statement"],
  ["goals", "Goals"],
  ["non_goals", "Non-Goals"],
  ["target_users", "Target Users"],
  ["user_stories", "User Stories"],
  ["requirements", "Requirements"],
  ["success_metrics", "Success Metrics"],
  ["risks", "Risks"],
  ["open_questions", "Open Questions"],
];

// What a section may hold (spec §3), and what list items, quotes and table
// cells may hold.
const SECTION_CONTENT = "(paragraph | heading | bulletList | orderedList | blockquote | table)+";
const NESTED_CONTENT = "(paragraph | bulletList | orderedList)+";

const MAX_LINK_LENGTH = 2048;

// Absolute http, https or mailto, no spaces or control characters (spec §4).
export function isAllowedLink(url) {
  if (typeof url !== "string" || !url || url.length > MAX_LINK_LENGTH) return false;
  // oxlint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f]/.test(url)) return false;
  return /^(https?:\/\/[^/]|mailto:.)/i.test(url);
}

// A passage a person should check. Users or the v1 conversion add it; AI
// output never does. Rendered as <mark class="nt-assumption"> so v1 content
// and today's styling carry over.
const Assumption = Mark.create({
  name: "assumption",
  inclusive: false,
  excludes: "",
  parseHTML() {
    return [{ tag: "mark.nt-assumption" }];
  },
  renderHTML() {
    return ["mark", { class: "nt-assumption" }, 0];
  },
});

// Accepted AI text. The backend adds it after a generation is accepted; the
// editor only keeps and shows it.
const AiGenerated = Mark.create({
  name: "ai_generated",
  inclusive: false,
  excludes: "",
  addAttributes() {
    return {
      generation_record_id: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-generation-record-id"),
        renderHTML: (attributes) => ({ "data-generation-record-id": attributes.generation_record_id }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span.nt-ai-generated" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes({ class: "nt-ai-generated" }, HTMLAttributes), 0];
  },
});

// A PRD section. Its label comes from `type`, never from the content.
const Section = Node.create({
  name: "section",
  content: SECTION_CONTENT,
  defining: true,
  isolating: true,
  addAttributes() {
    return {
      type: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-section-type"),
        renderHTML: (attributes) => ({ "data-section-type": attributes.type }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "section[data-section-type]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["section", HTMLAttributes, 0];
  },
});

// TipTap 3 adds `title` to links, `type` to ordered lists and `align` to
// table cells. The spec allows none of them, so they're left out of the
// schema instead of being stripped on save.
function without(attributes, name) {
  const rest = { ...attributes };
  delete rest[name];
  return rest;
}

const PrdLink = Link.extend({
  addAttributes() {
    return without(this.parent?.() ?? {}, "title");
  },
}).configure({
  openOnClick: false,
  autolink: false,
  protocols: [],
  isAllowedUri: (url) => isAllowedLink(url),
});

const PrdOrderedList = OrderedList.extend({
  addAttributes() {
    return without(this.parent?.() ?? {}, "type");
  },
});

// List items start with a paragraph, then paragraphs and lists. Quotes and
// table cells hold paragraphs and lists. Hard breaks carry no marks.
const PrdListItem = ListItem.extend({ content: "paragraph (paragraph | bulletList | orderedList)*" });
const PrdBlockquote = Blockquote.extend({ content: NESTED_CONTENT });
const PrdHardBreak = HardBreak.extend({ marks: "" });
// Simple tables only: no merged cells. Column widths may still be set.
const PrdTableCell = TableCell.extend({
  content: NESTED_CONTENT,
  addAttributes() {
    return without(this.parent?.() ?? {}, "align");
  },
});
const PrdTableHeader = TableHeader.extend({
  content: NESTED_CONTENT,
  addAttributes() {
    return without(this.parent?.() ?? {}, "align");
  },
});

function blockExtensions() {
  return [
    StarterKit.configure({
      document: false,
      code: false,
      codeBlock: false,
      strike: false,
      horizontalRule: false,
      trailingNode: false,
      heading: { levels: [1, 2, 3] },
      // Replaced by the stricter versions below.
      blockquote: false,
      hardBreak: false,
      link: false,
      listItem: false,
      orderedList: false,
    }),
    PrdBlockquote,
    PrdHardBreak,
    PrdLink,
    PrdListItem,
    PrdOrderedList,
    Table.configure({ resizable: false }),
    TableRow,
    PrdTableHeader,
    PrdTableCell,
    Assumption,
    AiGenerated,
  ];
}

const PrdDocument = Document.extend({ content: "section*" });
const SectionDocument = Document.extend({ content: SECTION_CONTENT });

// editor.getJSON() leaves `content` out of an empty document. The spec's
// empty draft is {"type":"doc","content":[]}, so saves go through this.
export function toSavedDocument(json) {
  return { ...json, content: json.content ?? [] };
}

export function prdDocumentExtensions() {
  return [PrdDocument, Section, ...blockExtensions()];
}

export function sectionExtensions() {
  return [SectionDocument, ...blockExtensions()];
}
