import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { prdBadge } from "./format";
import { IconAlert, IconX } from "./icons";

// A PRD's status as a coloured pill: Draft, Final or Assigned, or its review
// state (In review, Changes requested, Approved) while it has one.
export function StatusChip({ status, reviewState = null }) {
  const { tone, label } = prdBadge(status, reviewState);
  return (
    <span className={`nw-chip nw-chip-${tone}`}>
      <span className="nw-chip-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

// Initials in a circle. Always shown next to the person's name, so it is
// hidden from screen readers.
export function Avatar({ initials, size = "sm" }) {
  return (
    <span className={`nw-avatar nw-avatar-${size}`} aria-hidden="true">
      {initials}
    </span>
  );
}

// "Interview · next: Goals   2/7" over seven segments. Without progress
// (answers still loading) the segments show empty and the count is hidden.
export function InterviewMeter({ progress, total }) {
  const answered = progress?.answered ?? 0;
  let label = "Interview";
  if (progress?.next) label = `Interview · next: ${progress.next.label}`;
  else if (progress) label = "Interview complete";
  return (
    <div className="nw-meter">
      <div className="nw-meter-row">
        <span className="nw-meter-label">{label}</span>
        {progress ? (
          <span className="nw-meter-count">
            {answered}/{total}
          </span>
        ) : null}
      </div>
      <div
        className="nw-meter-bar"
        role="img"
        aria-label={progress ? `${answered} of ${total} questions answered` : "Loading progress"}
      >
        {Array.from({ length: total }, (_, index) => (
          <span key={index} className={index < answered ? "is-done" : undefined} />
        ))}
      </div>
    </div>
  );
}

export function Alert({ children, onRetry, onDismiss }) {
  return (
    <div className="nw-alert" role="alert">
      <IconAlert />
      <div className="nw-alert-text">{children}</div>
      {onRetry ? (
        <button type="button" className="nw-alert-btn" onClick={onRetry}>
          Try again
        </button>
      ) : null}
      {onDismiss ? (
        <button type="button" className="nw-alert-close" aria-label="Dismiss" onClick={onDismiss}>
          <IconX />
        </button>
      ) : null}
    </div>
  );
}

// A modal on the native <dialog>, which brings focus trapping, the top
// layer and Escape for free. Escape and clicks on the backdrop call onClose,
// except while `busy` (a request is out).
export function Modal({ open, title, onClose, busy = false, className = "", children }) {
  const ref = useRef(null);
  const pressedBackdrop = useRef(false);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // showModal focuses the first control; a field marked data-autofocus wins.
      dialog.querySelector("[data-autofocus]")?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`nw-modal ${className}`.trim()}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onPointerDown={(event) => {
        pressedBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        // Only a press that started and ended on the backdrop closes it, so
        // selecting text in a field and letting go outside doesn't.
        if (event.target === event.currentTarget && pressedBackdrop.current && !busy) onClose();
        pressedBackdrop.current = false;
      }}
    >
      <div className="nw-modal-body">
        <h2 id={titleId} className="nw-modal-title">
          {title}
        </h2>
        {open ? children : null}
      </div>
    </dialog>
  );
}

// A button that opens a small menu of actions. The menu renders into
// <body> with fixed positioning so scrolling containers (like the PRD table)
// can't clip it; it closes on Escape, Tab or a click elsewhere.
// items: [{ label, onSelect, icon?, danger? }]; `heading` adds a caption.
export function MenuButton({ label, className = "nw-icon-btn", children, items, heading, align = "end" }) {
  const [anchor, setAnchor] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const open = anchor !== null;

  const close = useCallback((refocus) => {
    setAnchor(null);
    if (refocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    menuRef.current?.querySelector('[role="menuitem"]')?.focus({ preventScroll: true });
    function onPointerDown(event) {
      if (menuRef.current?.contains(event.target) || buttonRef.current?.contains(event.target)) return;
      close(false);
    }
    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      }
    }
    // Scrolling or resizing moves the menu with its button; it closes once
    // the button has left the screen.
    function onViewportChange(event) {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect || rect.bottom < 0 || rect.top > document.documentElement.clientHeight) close(false);
      else setAnchor(rect);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [open, close]);

  function onMenuKeyDown(event) {
    const entries = [...menuRef.current.querySelectorAll('[role="menuitem"]')];
    const index = entries.indexOf(document.activeElement);
    let next = null;
    if (event.key === "ArrowDown") next = entries[(index + 1) % entries.length];
    else if (event.key === "ArrowUp") next = entries[(index - 1 + entries.length) % entries.length];
    else if (event.key === "Home") next = entries[0];
    else if (event.key === "End") next = entries[entries.length - 1];
    else if (event.key === "Tab") {
      event.preventDefault();
      close(true);
      return;
    }
    if (next) {
      event.preventDefault();
      next.focus();
    }
  }

  let position = null;
  if (anchor) {
    const width = document.documentElement.clientWidth;
    const height = document.documentElement.clientHeight;
    const estimate = items.length * 38 + (heading ? 40 : 0) + 14;
    const above = anchor.bottom + estimate + 8 > height && anchor.top > estimate + 8;
    position = {
      ...(above ? { bottom: height - anchor.top + 6 } : { top: anchor.bottom + 6 }),
      ...(align === "end"
        ? { right: Math.max(8, width - anchor.right) }
        : { left: Math.max(8, anchor.left) }),
    };
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={className}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close(false) : setAnchor(buttonRef.current.getBoundingClientRect()))}
      >
        {children}
      </button>
      {open
        ? createPortal(
            <div ref={menuRef} className="nw-menu" role="menu" aria-label={label} style={position} onKeyDown={onMenuKeyDown}>
              {heading ? <div className="nw-menu-heading">{heading}</div> : null}
              {items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  className={`nw-menu-item${item.danger ? " is-danger" : ""}`}
                  onClick={() => {
                    close(true);
                    item.onSelect();
                  }}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
