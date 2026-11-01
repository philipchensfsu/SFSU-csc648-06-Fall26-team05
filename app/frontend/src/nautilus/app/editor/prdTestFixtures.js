// Shared by the editor's tests (never imported by the app): the spec's valid
// fixtures, a normalizer that compares documents the way the spec means
// them, and the backend's own validator when python3 is available.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "../../../../../..");
const VALID = join(REPO, "app/shared/fixtures/prd_document/valid");
const VALIDATOR = join(REPO, "app/backend/prd_document.py");

// [file name, document] for every valid fixture.
export const validFixtures = readdirSync(VALID)
  .filter((name) => name.endsWith(".json"))
  .map((name) => [name, JSON.parse(readFileSync(join(VALID, name), "utf8")).document]);

// TipTap writes every attribute, using its defaults where the fixture left
// one out. These are the defaults the spec accepts (§9 "Exact attribute
// shapes"), so a fixture that omits them means the same document.
const LINK_DEFAULTS = { target: "_blank", rel: "noopener noreferrer nofollow", class: null };
const TABLE_CELL_DEFAULTS = { colspan: 1, rowspan: 1, colwidth: null };
const ORDERED_LIST_DEFAULTS = { start: 1 };

function withDefaults(type, attrs) {
  if (type === "link") return { ...LINK_DEFAULTS, ...attrs };
  if (type === "tableCell" || type === "tableHeader") return { ...TABLE_CELL_DEFAULTS, ...attrs };
  if (type === "orderedList") return { ...ORDERED_LIST_DEFAULTS, ...attrs };
  return attrs;
}

// The same document either way: defaults filled in, empty `attrs` dropped,
// and marks in a fixed order (ProseMirror orders them by schema rank).
// `nullLinkDefaults` also reads a link's null target/rel as the defaults:
// HTML can't say "null", so content that passes through HTML gets them.
export function normalize(node, { nullLinkDefaults = false } = {}) {
  const out = { type: node.type };
  if (node.text !== undefined) out.text = node.text;
  const attrs = withDefaults(node.type, node.attrs ?? {});
  if (Object.keys(attrs).length) out.attrs = attrs;
  if (node.marks?.length) {
    out.marks = node.marks
      .map((mark) => {
        const markAttrs = withDefaults(mark.type, mark.attrs ?? {});
        if (nullLinkDefaults && mark.type === "link") {
          for (const key of ["target", "rel"]) markAttrs[key] ??= LINK_DEFAULTS[key];
        }
        return Object.keys(markAttrs).length ? { type: mark.type, attrs: markAttrs } : { type: mark.type };
      })
      .sort((a, b) => a.type.localeCompare(b.type));
  }
  if (node.content) out.content = node.content.map((child) => normalize(child, { nullLinkDefaults }));
  return out;
}

export function hasPython() {
  try {
    execFileSync("python3", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// The first line of the backend checker's output for a saved file:
// "<file>: valid" when the document passes.
export function validateFile(file) {
  return execFileSync("python3", ["-I", VALIDATOR, file], { encoding: "utf8" }).split("\n")[0];
}
