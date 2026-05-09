/**
 * Inline SVG icons for the storefront chrome.
 *
 * All icons are 1em-based (size with font-size or width/height) and use
 * `currentColor` so they inherit the surrounding text colour. This keeps
 * the bundle small (no icon library) and avoids hydration mismatches.
 */

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { title?: string };

function base(props: IconProps) {
  const { title, ...rest } = props;
  return {
    width: "1em",
    height: "1em",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    role: title ? "img" : undefined,
    "aria-label": title,
    ...rest,
  };
}

export function HamburgerIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function ScannerIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="6" width="3" height="12" />
      <rect x="8" y="6" width="2" height="12" />
      <rect x="12" y="6" width="3" height="12" />
      <rect x="17" y="6" width="2" height="12" />
    </svg>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
    </svg>
  );
}

export function CartIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 3h2l2.4 12.5a2 2 0 0 0 2 1.5h8.6a2 2 0 0 0 2-1.5L22 7H6" />
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="18" cy="20" r="1.5" />
    </svg>
  );
}

export function PinIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 22s-7-7.5-7-13a7 7 0 0 1 14 0c0 5.5-7 13-7 13z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <polyline points="15 6 9 12 15 18" />
    </svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function StoreIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 9l1.5-5h15L21 9" />
      <path d="M5 9v11h14V9" />
      <path d="M3 9c0 1.7 1.3 3 3 3s3-1.3 3-3" />
      <path d="M9 9c0 1.7 1.3 3 3 3s3-1.3 3-3" />
      <path d="M15 9c0 1.7 1.3 3 3 3s3-1.3 3-3" />
    </svg>
  );
}

export function PhoneIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M22 16.92V21a1 1 0 0 1-1.1 1 19.86 19.86 0 0 1-8.6-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 3.07 4.1 1 1 0 0 1 4.06 3h4.09a1 1 0 0 1 1 .75l1 4a1 1 0 0 1-.27 1L8.21 10.21a16 16 0 0 0 6 6l1.41-1.66a1 1 0 0 1 1-.27l4 1a1 1 0 0 1 .75 1z" />
    </svg>
  );
}

export function MegaphoneIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 11v2a1 1 0 0 0 1 1h3l9 5V5L7 10H4a1 1 0 0 0-1 1z" />
      <path d="M19 8a4 4 0 0 1 0 8" />
    </svg>
  );
}
