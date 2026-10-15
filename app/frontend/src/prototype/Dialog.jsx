import { useEffect, useRef } from "react";

// Native <dialog> gives us focus trapping and Escape-to-close for free.
function Dialog({ open, title, onClose, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="nt-dialog"
      aria-labelledby="nt-dialog-title"
      onClose={onClose}
    >
      <h2 id="nt-dialog-title">{title}</h2>
      {children}
    </dialog>
  );
}

export default Dialog;
