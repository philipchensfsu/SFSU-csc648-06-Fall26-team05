import { useId, useState } from "react";
import { Modal } from "../ui";

// "Add a section": picks one of the missing standard sections. onAdd(type).
export function AddSectionDialog({ open, missing, onAdd, onClose }) {
  const ids = useId();
  const [picked, setPicked] = useState("");
  const type = missing.some(([id]) => id === picked) ? picked : (missing[0]?.[0] ?? "");

  return (
    <Modal open={open} title="Add a section" onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (type) onAdd(type);
        }}
      >
        <div className="nw-field">
          <label htmlFor={`${ids}-type`} className="nw-label">
            Section
          </label>
          <select
            id={`${ids}-type`}
            className="nw-select"
            value={type}
            onChange={(event) => setPicked(event.target.value)}
            data-autofocus
          >
            {missing.map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
        </div>
        <div className="nw-modal-actions">
          <button type="button" className="nw-btn nw-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="nw-btn nw-btn-primary" disabled={!type}>
            Add section
          </button>
        </div>
      </form>
    </Modal>
  );
}
