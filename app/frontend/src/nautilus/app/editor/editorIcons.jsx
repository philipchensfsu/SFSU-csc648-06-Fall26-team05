// Small line icons used by the editor screens.

function Svg({ size = 16, strokeWidth = 1.8, children }) {
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
    >
      {children}
    </svg>
  );
}

export function IconArrowUp() {
  return (
    <Svg size={15} strokeWidth={2}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </Svg>
  );
}

// Nautilus's AI: a four-point sparkle.
export function IconSparkle({ size = 16 }) {
  return (
    <Svg size={size}>
      <path d="M12 3l1.9 5.6 5.6 1.9-5.6 1.9L12 18l-1.9-5.6-5.6-1.9 5.6-1.9z" />
    </Svg>
  );
}

export function IconBack() {
  return (
    <Svg size={14} strokeWidth={2}>
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </Svg>
  );
}

export function IconChat() {
  return (
    <Svg size={14}>
      <path d="M4 5h16v11H9l-5 4z" />
    </Svg>
  );
}

export function IconDownload() {
  return (
    <Svg>
      <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
    </Svg>
  );
}

export function IconCheck({ size = 16 }) {
  return (
    <Svg size={size} strokeWidth={2.2}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </Svg>
  );
}

export function IconBullets() {
  return (
    <Svg>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1" />
      <circle cx="4.5" cy="12" r="1" />
      <circle cx="4.5" cy="18" r="1" />
    </Svg>
  );
}

export function IconLink() {
  return (
    <Svg>
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
    </Svg>
  );
}
