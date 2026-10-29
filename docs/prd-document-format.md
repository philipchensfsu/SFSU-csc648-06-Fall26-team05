# PRD document format (doc_schema_version 2)

**Status: draft.** This describes the Tiptap/ProseMirror JSON that PRDs will be stored as in
`prd.content_json` (Backend Tasks v1.2, S03). Nothing uses it yet:

- saves still accept and store today's version 1 shape;
- no route calls the validator, and no data is converted;
- `doc_schema_version` stays 1 until the switch is coordinated (see [Before switching saves](#before-switching-saves)).

| File | What it is |
|---|---|
| [`app/shared/prd_document_schema.v2.json`](../app/shared/prd_document_schema.v2.json) | The machine-readable spec. Every rule carries a `status`. |
| [`app/backend/prd_document.py`](../app/backend/prd_document.py) | Structural validator for saved documents, `content_text` extraction, title check, command-line checker. |
| [`app/backend/ai/generation_output.py`](../app/backend/ai/generation_output.py) | Extra checks for complete initial-generation output (lives under `ai/` per the team convention). |
| [`app/shared/fixtures/prd_document/`](../app/shared/fixtures/prd_document/) | Valid and invalid example documents with their expected errors and text. |

## 1. What's agreed and what isn't

| Status | Decisions |
|---|---|
| **Agreed with frontend** (Aksh, 2026-10-29) | Tiptap JSON v2. Root `doc` holds only `section` nodes; `section.attrs.type` is one of the nine types below. The visible section label is **derived from `attrs.type`**, not stored in the content. Sections that are present keep the **standard order**; a saved draft may hold **any ordered subset, including none** (`{"type":"doc","content":[]}`), with **no duplicate types**. `ai_generated` is a visual hint carrying `generation_record_id`, **not inclusive at its edges**, and may be inherited when typing inside marked text. **Assumption highlights stay separate from `ai_generated`.** Aksh configures the editor and tests round trips against these files. The v1→v2 conversion and the API/description changes are coordinated before saves switch. |
| **Agreed** (v1.2 S03/A01, M2 §1.5, frontend guide §8) | Marks `bold`, `italic`, `underline`, `link` (http, https, mailto only) and `ai_generated`. `citation` is reserved and rejected. About 1 MB per document; 200-character title; 2,000-character description (a column, not in the document). Invalid input is rejected, never repaired. Complete initial generation needs **all nine sections**; model output may not contain `ai_generated` (the backend adds it after validation). |
| **Proposed, needs frontend confirmation** | The node list inside sections and its exact content rules (§3). Link `target`/`rel`/`class` values. Table cell attributes. Text in every generated section. Limits: nesting depth 32, link length 2,048, 100 errors per response. Non-blank titles (today's API accepts an empty title). The `content_text` format (§6). |
| **Open** | How assumption highlights are represented (§7). A candidate `assumption` mark is in the spec but **disabled**, so the validator rejects it until it's agreed. |

**Review readiness is a separate, later check.** A structurally valid document, even an empty one, isn't
necessarily ready to submit for review. That rule belongs with the review workflow, not this validator.

## 2. Sections

| Order | `attrs.type` | Derived label |
|---|---|---|
| 1 | `problem` | Problem Statement |
| 2 | `goals` | Goals |
| 3 | `non_goals` | Non-Goals |
| 4 | `target_users` | Target Users |
| 5 | `user_stories` | User Stories |
| 6 | `requirements` | Requirements |
| 7 | `success_metrics` | Success Metrics |
| 8 | `risks` | Risks |
| 9 | `open_questions` | Open Questions |

The labels match the current frontend and `seed_demo.py` (a test keeps the spec and the seed in step).

## 3. Nodes (exact names and attributes)

A node object may contain only `type`, `attrs` and `content`; a `text` node only `type`, `text` and `marks`.
Unknown keys, nodes, attributes and marks are errors. Optional attributes may be absent or `null`, because
Tiptap writes defaults such as `colwidth: null`.

| Node | Allowed children | Attributes | Status |
|---|---|---|---|
| `doc` | `section` (0 or more) | none | agreed |
| `section` | `paragraph`, `heading`, `bulletList`, `orderedList`, `blockquote`, `table` (at least 1) | `type` (required, one of the nine) | node agreed; children proposed |
| `paragraph` | `text`, `hardBreak` (may be empty) | none | proposed |
| `heading` | `text`, `hardBreak` (may be empty) | `level` (required, whole number 1-3) | proposed |
| `bulletList` | `listItem` (at least 1) | none | proposed |
| `orderedList` | `listItem` (at least 1) | `start` (optional, whole number 1-100000) | proposed |
| `listItem` | first a `paragraph`, then `paragraph`, `bulletList`, `orderedList` | none | proposed |
| `blockquote` | `paragraph`, `bulletList`, `orderedList` (at least 1) | none | proposed |
| `table` | `tableRow` (at least 1) | none | proposed |
| `tableRow` | `tableCell`, `tableHeader` (at least 1) | none | proposed |
| `tableCell`, `tableHeader` | `paragraph`, `bulletList`, `orderedList` (at least 1) | `colspan`, `rowspan` (optional, 1-100), `colwidth` (optional, `null` or a list of whole-number widths) | proposed |
| `hardBreak` | none | none (and no marks) | proposed |
| `text` | none | `text` must be a non-empty string; the only node that carries marks | agreed |

Not allowed: images, code blocks, horizontal rules, task lists, mentions, and anything else not listed.

## 4. Marks (exact names and attributes)

A mark object may contain only `type` and `attrs`, and the same mark can't appear twice on one text node.

| Mark | Attributes | Notes | Status |
|---|---|---|---|
| `bold`, `italic`, `underline` | none | | agreed |
| `link` | `href` (required): absolute `http`, `https` or `mailto`, no spaces or control characters. `target` (optional): `null` or `"_blank"`. `rel` (optional): `null` or `"noopener noreferrer nofollow"`. `class` (optional): `null`. | `target`/`rel`/`class` are accepted only because Tiptap's Link extension writes them. | href agreed; the rest proposed |
| `ai_generated` | `generation_record_id` (required): UUID in lowercase hyphenated form | Not inclusive at its edges. The backend applies it to accepted AI text. This package checks only the id's shape; whether it names a successful generation record for the same PRD is checked against the database when saves are wired up. | agreed |
| `citation` | none | Reserved, **rejected** (sources are PRD-level for now, A09). | reserved |
| `assumption` | none | **Candidate only, rejected** until agreed (§7). | proposed |

Not allowed: `strike`, `code`, `textStyle`, `highlight`, colours, fonts.

## 5. Examples

An empty saved draft (agreed):

```json
{ "type": "doc", "content": [] }
```

One section with accepted AI text and a link (Tiptap's default link attributes included):

```json
{
  "type": "doc",
  "content": [
    {
      "type": "section",
      "attrs": { "type": "problem" },
      "content": [
        {
          "type": "paragraph",
          "content": [
            {
              "type": "text",
              "text": "Writing PRDs takes hours.",
              "marks": [
                { "type": "ai_generated", "attrs": { "generation_record_id": "3f2c9a1e-8b4d-4c6a-9e2f-1a7b5c3d9e01" } }
              ]
            },
            { "type": "text", "text": " See " },
            {
              "type": "text",
              "text": "the survey",
              "marks": [
                { "type": "link", "attrs": { "href": "https://example.com/survey", "target": "_blank",
                                             "rel": "noopener noreferrer nofollow", "class": null } }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

Note there's no "Problem Statement" heading inside the section: the label comes from `attrs.type`.

The fixtures are the full set of examples. Each file has a `description`, the `document`, and an `expect` block
with the exact `document_errors` (code and JSON Pointer path), plus, for valid documents, `generation_errors`
and the expected `content_text`.

- **`valid/`** (10): `empty_draft`, `minimal_single_section`, `ordered_subset`, `full_generated_draft`,
  `every_node_type`, `marks`, `tiptap_null_defaults`, and three that are valid drafts but fail the generation
  checks.
- **`invalid/`** (36): one problem each, such as the v1 shape, a stray `description` key, sections out of order
  or repeated, images and code blocks, strike/code/textStyle, `citation`, the candidate `assumption` mark,
  `javascript:`/relative/missing links, bad `generation_record_id`s, empty text, marks on a hard break, and one
  with several errors at once.

## 6. Validation profiles and errors

| Profile | Function | Use |
|---|---|---|
| Saved document | `prd_document.validate_document(doc)` | Every save (once wired). Accepts any ordered subset of sections, including none. |
| Complete initial generation | `ai.generation_output.validate_generated_document(doc)` | Gemini's full-document output (A01/A03). Runs the saved-document rules first and returns only those errors if any fail. Then requires all nine sections (`missing_section`), no `ai_generated` marks (`provenance_mark_not_allowed`), text in every section (`empty_section`, proposed) and no leading heading repeating a section's label (`duplicate_section_heading`). |
| Review readiness | not built | Later, with the review workflow. |

Each error is `{code, path, message}`. `path` is a JSON Pointer into the document (`""` is the root). Messages
name types and attributes but never echo long submitted values. Document error codes: `invalid_type`,
`legacy_format_v1`, `too_large`, `invalid_root`, `unknown_node`, `node_not_allowed`, `too_deep`, `unknown_key`,
`missing_content`, `unknown_attr`, `missing_attr`, `invalid_attr`, `empty_text`, `marks_not_allowed`,
`unknown_mark`, `mark_disabled`, `duplicate_mark`, `duplicate_section`, `section_order`, `too_many_errors`.
Title codes (`validate_title`): `invalid_type`, `title_required`, `title_too_long`.

### content_text (proposed format)

`derive_content_text(doc)` builds the plain text used for search and AI context on the server (the browser will
stop sending it). It raises `InvalidDocument` for an invalid document.

- Sections are separated by a blank line and start with their derived label.
- Each paragraph or heading is its own line; empty ones are skipped. A hard break becomes a newline.
- Bullet items start with `- `, numbered items with `1. ` (from `start`); nested content is indented two spaces.
- Blockquote lines start with `> `. Table rows become `cell | cell`; empty rows are skipped.
- The description isn't included; it becomes its own column.

This keeps paragraph boundaries, which v1's `sectionsToText` loses ("Faster checkoutMore orders").

## 7. Assumption highlights: current state and proposed mapping

**Today (v1):** an assumption is a `<mark class="nt-assumption" data-assumption="1">…</mark>` inside a section's
HTML.
- **Where it comes from:** the browser's simulated draft (`draftSectionsFromAnswers` in `data.js`) and `seed_demo.py`.
- **Value:** `data-assumption` is always `"1"`, a flag rather than an id or a count.
- **How it's shown:** the editor counts these marks per section, offers "Review next assumption", and styles them
  with an "Assumption" badge. The dashboard and Projects page show "N assumptions to check".
- **How they go away:** there's no "confirm" action. They disappear only when the text is edited away.
- **Stored count:** each v1 section also stores an `assumptions` count, derived from the marks.
- **The other highlight:** the simulated AI-edit highlight (`mark.nt-ai-edit`) is stripped before saving, so v1
  stores no provenance at all.

**Not an option:** turning assumptions into `ai_generated`.
- The meanings differ: "needs checking" versus "came from an accepted generation".
- `ai_generated` needs a real `generation_record_id`, and v1 assumptions come from simulated drafts and seed data,
  not real generations.

**Options (needs a decision with Aksh, and the AI team for A03):**

| Option | v2 representation | Conversion of v1 | Trade-off |
|---|---|---|---|
| **A (recommended)** | A separate `assumption` mark: no attributes, not inclusive, never merged with `ai_generated`. The candidate is already in the spec, disabled. | Each `nt-assumption` span becomes the same text with the `assumption` mark, keeping its other marks. `data-assumption` and the `assumptions` count are dropped; counts are derived from the marks. | Keeps exactly what users see today. Needs a "confirm/remove" interaction, and a decision on whether model output may contain it (unlike `ai_generated`). |
| B | Not stored in the document; a separate list of assumption ranges or per-section counts | Positions computed during conversion | Positions break as text is edited. Not recommended. |
| C | Dropped | The text is kept, the highlight is lost | Loses "to check" flags users haven't reviewed. Only with an explicit team decision. |

Until this is decided, the conversion (DB07) must not run on documents that contain `nt-assumption`, and the
validator keeps rejecting `assumption`. Enabling option A later means setting `enabled: true` in the spec,
moving its fixture from `invalid/` to `valid/`, and agreeing the editor interaction.

## 8. Notes for later work (not done in this package)

### Before switching saves

1. Agree the open items here, then Aksh builds the Tiptap editor against the spec and fixtures.
2. Additive backend changes: the `description` column and the S03 save transaction, with this validator,
   `derive_content_text` and the database check of `generation_record_id`.
3. Frontend sends v2 documents and `description`, and stops sending `status` and `content_text`.
4. One-time conversion of stored v1 content and snapshots (DB07), including the assumption decision. Then
   `doc_schema_version` becomes 2.

### Proposed v1 → v2 conversion (for DB07)

| v1 | v2 |
|---|---|
| `content_json.description` | `prd.description` column |
| `sections[]` | `section` nodes in standard order (the v1 order should already be standard; verify) |
| `sections[].title` | dropped (labels are derived; verify stored titles match the standard ones) |
| `sections[].assumptions` | dropped (derived) |
| `<p>`, `<div>` | `paragraph` |
| `<h1>`-`<h3>`; `<h4>`-`<h6>` | `heading` 1-3; level 3 (proposed) |
| `<ul>`, `<ol>`, `<li>`, `<blockquote>`, table tags | the matching nodes |
| `<br>` | `hardBreak` |
| `<b>`/`<strong>`, `<i>`/`<em>`, `<u>` | `bold`, `italic`, `underline` |
| `<a href>` (http, https, mailto) | `link`; other links become plain text |
| `mark.nt-assumption` | per §7 |
| anything else (`span`, `font`, inline styles, ...) | unwrapped to its text, and counted in a report |

The current editor uses `contentEditable` with `execCommand`, so stored HTML may contain tags beyond this list.
Before converting, an inventory should be run, read-only, against the hosted database. **Not run yet;** it
needs the backend lead's go-ahead, and output should be counts only. For example:

```sql
select lower(m[1]) as tag, count(*) as uses
from prd,
     jsonb_array_elements(coalesce(content_json->'sections', '[]'::jsonb)) as s,
     regexp_matches(s->>'html', '<([a-zA-Z0-9]+)', 'g') as m
group by 1
order by 2 desc;
```

### Where the spec file must be readable

- **Vercel:** when the validator is wired into a route, the Python build needs the shared file bundled, for
  example `"config": { "includeFiles": ["app/shared/**"] }` on the `app/backend/main.py` build in `vercel.json`.
  Verify this on a preview before relying on it.
- **Docker dev setup (#49):** the containers mount only `app/backend` and `app/frontend`. Adding
  `./app/shared:/shared:ro` to both services makes `../shared` resolve inside them.
- **Vite:** importing `../../shared/...json` from the frontend may need `server.fs.allow` to include the folder
  in dev.

## 9. Editor round-trip checklist (for Aksh)

1. Configure the schema to match §3 and §4 exactly:
   - a custom `section` node with a `type` attribute;
   - `doc` content of zero or more sections;
   - `listItem` content of a paragraph followed by paragraphs and lists;
   - StarterKit extras disabled (code block, code, strike, horizontal rule);
   - Link limited to http, https and mailto;
   - `ai_generated` with `inclusive: false`;
   - nothing that writes extra attributes (TextAlign, ids, colours).
2. For each file in `valid/`:
   - load its `document` with `setContent`, read it back with `getJSON()`, and compare the two;
   - report any difference, since the fixtures should round-trip exactly;
   - make sure the empty draft round-trips and that the editor can save it.
3. Try to produce each `invalid/` case (paste HTML with images, code, strike, `javascript:` links) and confirm the
   editor drops it.
4. Check `ai_generated`: typing at its edges doesn't extend it, and typing inside may inherit it.
5. Check real editor output with the backend checker, from `app/backend`:
   `python prd_document.py path/to/output.json` prints `valid` and the derived text, or each error with its path.
6. Run the backend tests: `python -m pytest tests/test_prd_document.py tests/test_generation_output.py`
   (or `docker compose exec backend python -m pytest` once the #49 setup and the mount above are in place).

## 10. Open questions

**For Aksh (editor):**
1. Is the node list inside sections right (§3)? Given the section label is derived and shown by the editor, should
   inner headings stay levels 1-3 or shift (for example 3-4)?
2. Should list items, quotes and table cells hold only paragraphs and lists, as proposed?
3. Tables: should merged cells and column resizing be allowed? If resizing is off, `colwidth` is always `null`.
4. Which `target`/`rel` does your Link config write? The validator accepts only the values in §4.
5. Assumptions: is option A workable, and how does a user confirm or remove one?
6. Empty drafts: how does a user add the first section, and which sections does a new draft start with?
7. Will the frontend import the spec file to build its schema, or hard-code it and test against the fixtures?

**For the team:**
1. The assumption representation (§7), including whether model output may mark assumptions.
2. The proposed limits and the non-blank title rule.
3. The `content_text` format (§6), which affects search and AI context.
4. Whether generated output may contain links.
