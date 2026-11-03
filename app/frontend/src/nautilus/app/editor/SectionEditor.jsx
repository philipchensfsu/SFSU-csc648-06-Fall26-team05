import { useImperativeHandle, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { searchShortcutLabel } from "../format";
import { IconBullets, IconCheck, IconLink } from "./editorIcons";
import { cleanHtml, isEmptyHtml } from "./html";
import { isAllowedLink, sectionExtensions } from "./schema";

// The modifier key in shortcut hints: ⌘ on Apple devices, Ctrl elsewhere.
const MOD = searchShortcutLabel().startsWith("⌘") ? "⌘" : "Ctrl";

const EXTENSIONS = sectionExtensions();

// One section being edited, on TipTap. The schema (schema.js) decides what
// the section may contain, so pasted images, scripts, styles and unsafe
// links are dropped as they come in. The page reads the result through
// `ref.current.getHtml()` on Done or Save.
export function SectionEditor({ ref, html, labelledBy, onTouch, onDone, onCancel }) {
  const [touched, setTouched] = useState(false);
  const [linkError, setLinkError] = useState("");

  function touch() {
    if (touched) return;
    setTouched(true);
    onTouch();
  }

  const editor = useEditor({
    extensions: EXTENSIONS,
    content: isEmptyHtml(html) ? "<p></p>" : cleanHtml(html),
    autofocus: "end",
    onUpdate: touch,
    editorProps: {
      attributes: {
        class: "ne-content ne-editable",
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": labelledBy,
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          onDone();
          return true;
        }
        return false;
      },
    },
  });

  useImperativeHandle(ref, () => ({ getHtml: () => editor?.getHTML() ?? html }), [editor, html]);

  // Which buttons show as pressed, and whether the caret is in an assumption.
  const format = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current?.isActive("bold") ?? false,
      italic: current?.isActive("italic") ?? false,
      underline: current?.isActive("underline") ?? false,
      bullets: current?.isActive("bulletList") ?? false,
      numbers: current?.isActive("orderedList") ?? false,
      link: current?.isActive("link") ?? false,
      inMark: current?.isActive("assumption") ?? false,
    }),
  });

  function run(command) {
    editor?.chain().focus()[command]().run();
  }

  // Keeps the highlighted words and drops the highlight.
  function confirmHere() {
    editor?.chain().focus().extendMarkRange("assumption").unsetMark("assumption").run();
  }

  function toggleLink() {
    if (!editor) return;
    setLinkError("");
    if (editor.isActive("link")) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    const url = window.prompt("Link address (https://, http:// or mailto:)")?.trim();
    if (!url) return;
    if (!isAllowedLink(url)) {
      setLinkError("Links must start with https://, http:// or mailto:.");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  // Pressing a toolbar button mustn't take the caret out of the text.
  const keepCaret = (event) => event.preventDefault();

  const tool = (label, pressed, command, content, extraClass = "") => (
    <button
      type="button"
      className={`ne-tool${extraClass}`}
      aria-label={label}
      aria-pressed={pressed}
      onMouseDown={keepCaret}
      onClick={command}
    >
      {content}
    </button>
  );

  return (
    <div className="ne-editbox">
      <div className="ne-toolbar" role="toolbar" aria-label="Formatting">
        {tool("Bold", format?.bold, () => run("toggleBold"), "B", " ne-tool-b")}
        {tool("Italic", format?.italic, () => run("toggleItalic"), "I", " ne-tool-i")}
        {tool("Underline", format?.underline, () => run("toggleUnderline"), "U", " ne-tool-u")}
        <span className="ne-tool-sep" aria-hidden="true" />
        {tool("Bulleted list", format?.bullets, () => run("toggleBulletList"), <IconBullets />)}
        {tool("Numbered list", format?.numbers, () => run("toggleOrderedList"), "1.", " ne-tool-num")}
        {tool(format?.link ? "Remove link" : "Add link", format?.link, toggleLink, <IconLink />)}
        {format?.inMark ? (
          <>
            <span className="ne-tool-sep" aria-hidden="true" />
            <button type="button" className="ne-tool ne-tool-text" onMouseDown={keepCaret} onClick={confirmHere}>
              <IconCheck size={14} />
              Confirm assumption
            </button>
          </>
        ) : null}
        {touched ? <span className="ne-tool-note">Edited by you · not yet saved</span> : null}
      </div>
      <EditorContent editor={editor} />
      {linkError ? (
        <p className="nf-field-error" role="alert">
          {linkError}
        </p>
      ) : null}
      <div className="ne-edit-foot">
        <span className="ne-edit-hint">
          <span className="ne-key">{MOD}</span> + <span className="ne-key">Enter</span> when you’re done
        </span>
        <div className="ne-edit-actions">
          <button type="button" className="nw-btn nw-btn-secondary ne-btn-34" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="nw-btn ne-btn-ink ne-btn-34" onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
