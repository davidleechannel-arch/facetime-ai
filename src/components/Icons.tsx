import type { SVGProps } from "react";

const base = (p: SVGProps<SVGSVGElement>) => ({
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...p,
});

export const VideoIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="2.5" y="6" width="13" height="12" rx="3" />
    <path d="m15.5 10.5 5-3v9l-5-3" />
  </svg>
);
export const VideoOffIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M15.5 10.5 20.5 7.5v9l-3.2-1.9M2.5 9v6a3 3 0 0 0 3 3h7.5M8 6h4.5a3 3 0 0 1 3 3v3" />
    <path d="m3 3 18 18" />
  </svg>
);
export const PhoneIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 3.5h3l1.6 4.2-2 1.3a11 11 0 0 0 7.4 7.4l1.3-2 4.2 1.6v3a2 2 0 0 1-2.2 2A17.5 17.5 0 0 1 3 5.7a2 2 0 0 1 2-2.2Z" />
  </svg>
);
export const PhoneEndIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3.3 14.2 2.5 12.4c-.4-.9 0-1.9.9-2.3a20 20 0 0 1 17.2 0c.9.4 1.3 1.4.9 2.3l-.8 1.8-4.3-.6-.4-2.5a12 12 0 0 0-8 0l-.4 2.5Z" />
  </svg>
);
export const ScreenIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="2.5" y="4" width="19" height="13" rx="2.5" />
    <path d="M8 21h8M12 17v4M12 13.5V8m-2.5 2.5L12 8l2.5 2.5" />
  </svg>
);
export const ChatIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M20.5 12a8.5 8.5 0 0 1-12.4 7.5L3.5 20.5l1-4.4A8.5 8.5 0 1 1 20.5 12Z" />
  </svg>
);
export const MicIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </svg>
);
export const MicOffIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M15 10V6a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 4.5 2.6M5.5 11a6.5 6.5 0 0 0 10.3 5.3M18.5 11c0 .8-.1 1.5-.4 2.2M12 17.5V21" />
    <path d="m3 3 18 18" />
  </svg>
);
export const FlipIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 8.5A8 8 0 0 1 18.7 7M20 15.5A8 8 0 0 1 5.3 17" />
    <path d="M19 3v4h-4M5 21v-4h4" />
  </svg>
);
export const CaptionsIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="2.5" y="5" width="19" height="14" rx="3" />
    <path d="M10.5 10.2a2.3 2.3 0 1 0 0 3.6M17 10.2a2.3 2.3 0 1 0 0 3.6" />
  </svg>
);
export const PaperclipIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="m20 11.5-8.2 8.2a5.2 5.2 0 0 1-7.4-7.4l8.5-8.5a3.5 3.5 0 0 1 4.9 4.9l-8.5 8.5a1.7 1.7 0 0 1-2.5-2.5l7.9-7.8" />
  </svg>
);
export const SendIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 19V5m-6 6 6-6 6 6" />
  </svg>
);
export const MenuIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 7h16M4 12h16M4 17h10" />
  </svg>
);
export const PlusIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const HomeIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15V15h-6v5.5H5.5A1.5 1.5 0 0 1 4 19Z" />
  </svg>
);
export const GearIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </svg>
);
export const CloseIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const FileIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} width={14} height={14}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
    <path d="M14 3v5h5" />
  </svg>
);
export const TrashIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} width={16} height={16}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  </svg>
);
