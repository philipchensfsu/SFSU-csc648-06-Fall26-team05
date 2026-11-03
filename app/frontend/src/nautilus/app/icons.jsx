// Line icons from the Nautilus design, all on a 24px grid. Decorative: the
// button or link around an icon carries the accessible name.

function Svg({ size = 18, strokeWidth = 1.7, children, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function IconGrid(props) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </Svg>
  );
}

export function IconDoc(props) {
  return (
    <Svg {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h6" />
    </Svg>
  );
}

export function IconFolder(props) {
  return (
    <Svg {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </Svg>
  );
}

export function IconSearch(props) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Svg>
  );
}

export function IconInbox(props) {
  return (
    <Svg {...props}>
      <path d="M3 13h5l2 3h4l2-3h5" />
      <path d="M5.5 5h13l2.5 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z" />
    </Svg>
  );
}

export function IconFlag(props) {
  return (
    <Svg {...props}>
      <path d="M5 21V4h12l-2.5 4.5L17 13H5" />
    </Svg>
  );
}

export function IconClock(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Svg>
  );
}

export function IconComment(props) {
  return (
    <Svg {...props}>
      <path d="M4 5h16v11H9.5L5 20v-4H4z" />
    </Svg>
  );
}

export function IconCheck(props) {
  return (
    <Svg {...props}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </Svg>
  );
}

export function IconUserPlus(props) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M19 8v6M16 11h6" />
    </Svg>
  );
}

export function IconRefresh(props) {
  return (
    <Svg {...props}>
      <path d="M20 12a8 8 0 1 1-2.4-5.7L20 8.5" />
      <path d="M20 3.5v5h-5" />
    </Svg>
  );
}

export function IconPeople(props) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />
    </Svg>
  );
}

export function IconPlus(props) {
  return (
    <Svg strokeWidth={2.2} {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function IconSliders(props) {
  return (
    <Svg {...props}>
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </Svg>
  );
}

export function IconArrowRight(props) {
  return (
    <Svg size={16} strokeWidth={2} {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Svg>
  );
}

export function IconChevronRight(props) {
  return (
    <Svg size={16} strokeWidth={2} {...props}>
      <path d="m9 6 6 6-6 6" />
    </Svg>
  );
}

export function IconPencil(props) {
  return (
    <Svg size={16} strokeWidth={1.8} {...props}>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="m13.5 6.5 4 4" />
    </Svg>
  );
}

export function IconTrash(props) {
  return (
    <Svg size={16} strokeWidth={1.8} {...props}>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
    </Svg>
  );
}

export function IconX(props) {
  return (
    <Svg size={14} strokeWidth={2.2} {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function IconMenu(props) {
  return (
    <Svg strokeWidth={2} {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  );
}

export function IconSignOut(props) {
  return (
    <Svg size={16} strokeWidth={1.8} {...props}>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="m10 17 5-5-5-5" />
      <path d="M15 12H4" />
    </Svg>
  );
}

export function IconOpen(props) {
  return (
    <Svg size={16} strokeWidth={1.8} {...props}>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
    </Svg>
  );
}

export function IconAlert(props) {
  return (
    <Svg size={18} strokeWidth={1.8} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5" />
      <path d="M12 16.5v.01" />
    </Svg>
  );
}

export function IconMore(props) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}
