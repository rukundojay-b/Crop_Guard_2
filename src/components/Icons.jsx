// Minimal stroke-style icon set (24x24, currentColor) used in place of emoji
// glyphs, which render inconsistently across platforms and read as a
// placeholder rather than a finished UI.

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

export const LeafIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M20 4c-7 0-14 4-14 12 0 2 1 3 3 3 8 0 12-7 12-14 0-.4 0-.7-.1-1H20Z" />
    <path d="M9 19c0-5 3-9 9-11" />
  </svg>
)

export const MenuIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
)

export const CloseIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

export const PencilIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
)

export const TrashIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
  </svg>
)

export const CameraIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M4 8h3l1.5-2h7L17 8h3v11H4Z" />
    <circle cx="12" cy="13.5" r="3.2" />
  </svg>
)

export const SunIcon = (props) => (
  <svg {...base} {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
  </svg>
)

export const AlertIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M12 3 2 20h20Z" />
    <path d="M12 9.5v5M12 17.2v.1" />
  </svg>
)

export const UploadCloudIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M7 18a4.5 4.5 0 0 1-1-8.9 5.5 5.5 0 0 1 10.7-2A4.5 4.5 0 0 1 17 18Z" />
    <path d="M12 11v7M9 14l3-3 3 3" />
  </svg>
)

export const MicroscopeIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M9 19h9M7 19a5 5 0 0 1 2-9.5l4 2M10 3l6 6M13 6l3-3M11 9l4 4" />
    <path d="M9.5 12.8 5.8 16.5a1.7 1.7 0 0 0 2.4 2.4l3.7-3.7" />
  </svg>
)

export const SignalIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M12 20h.01M8.5 16.5a5 5 0 0 1 7 0M5.5 13.5a9.5 9.5 0 0 1 13 0M2.5 10.5a13.5 13.5 0 0 1 19 0" />
  </svg>
)

export const ZapIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
  </svg>
)

export const ShieldIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6Z" />
  </svg>
)

export const PillIcon = (props) => (
  <svg {...base} {...props}>
    <rect x="3.5" y="9.5" width="17" height="7" rx="3.5" transform="rotate(-45 12 13)" />
    <path d="M9.5 10.5 13.5 14.5" />
  </svg>
)

export const SearchIcon = (props) => (
  <svg {...base} {...props}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m20 20-4.3-4.3" />
  </svg>
)
