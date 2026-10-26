import { useId, useState } from "react";
import { Modal } from "./ui";

// Both dialogs take an onSubmit / onConfirm that returns a promise: they
// stay open with a busy button while it runs, close when it resolves, and
// show the error message when it rejects.

function errorText(error) {
  return error?.message || "Something went wrong. Try again.";
}

// One text field: naming a new project, renaming a project or a PRD.
export function NameDialog({
  open,
  title,
  label,
  initialValue = "",
  hint,
  submitLabel,
  busyLabel = "Saving…",
  maxLength = 200,
  onSubmit,
  onClose,
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} title={title} busy={busy} onClose={onClose}>
      <NameForm
        label={label}
        initialValue={initialValue}
        hint={hint}
        submitLabel={submitLabel}
        busyLabel={busyLabel}
        maxLength={maxLength}
        busy={busy}
        onBusy={setBusy}
        onSubmit={onSubmit}
        onClose={onClose}
      />
    </Modal>
  );
}

function NameForm({ label, initialValue, hint, submitLabel, busyLabel, maxLength, busy, onBusy, onSubmit, onClose }) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState("");
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();

  function handleSubmit(event) {
    event.preventDefault();
    const name = value.trim();
    if (!name) {
      setError(`${label} is required.`);
      return;
    }
    if (initialValue && name === initialValue.trim()) {
      onClose();
      return;
    }
    onBusy(true);
    setError("");
    Promise.resolve(onSubmit(name))
      .then(() => {
        onBusy(false);
        onClose();
      })
      .catch((reason) => {
        onBusy(false);
        setError(errorText(reason));
      });
  }

  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="nw-field">
        <label htmlFor={inputId} className="nw-label">
          {label}
        </label>
        <input
          id={inputId}
          className="nw-input"
          value={value}
          maxLength={maxLength}
          autoComplete="off"
          data-autofocus
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError("");
          }}
        />
        {hint ? (
          <p id={hintId} className="nw-hint">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p id={errorId} className="nw-error">
            {error}
          </p>
        ) : null}
      </div>
      <div className="nw-modal-actions">
        <button type="button" className="nw-btn nw-btn-secondary" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="nw-btn nw-btn-primary" disabled={busy}>
          {busy ? busyLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}

// "Delete …?" with Cancel focused first. `ready` keeps the confirm button
// disabled until the dialog knows what it will delete.
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "Delete",
  busyLabel = "Deleting…",
  ready = true,
  onConfirm,
  onClose,
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} title={title} busy={busy} onClose={onClose}>
      <ConfirmBody
        confirmLabel={confirmLabel}
        busyLabel={busyLabel}
        ready={ready}
        busy={busy}
        onBusy={setBusy}
        onConfirm={onConfirm}
        onClose={onClose}
      >
        {children}
      </ConfirmBody>
    </Modal>
  );
}

function ConfirmBody({ children, confirmLabel, busyLabel, ready, busy, onBusy, onConfirm, onClose }) {
  const [error, setError] = useState("");

  function confirm() {
    onBusy(true);
    setError("");
    Promise.resolve(onConfirm())
      .then(() => {
        onBusy(false);
        onClose();
      })
      .catch((reason) => {
        onBusy(false);
        setError(errorText(reason));
      });
  }

  return (
    <>
      <div className="nw-modal-text">{children}</div>
      {error ? (
        <p className="nw-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="nw-modal-actions">
        <button type="button" className="nw-btn nw-btn-secondary" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="nw-btn nw-btn-danger" disabled={busy || !ready} onClick={confirm}>
          {busy ? busyLabel : confirmLabel}
        </button>
      </div>
    </>
  );
}
