import type { SVGProps } from "react";

export type HonorsIconName =
  | "arrow"
  | "bolt"
  | "clock"
  | "crown"
  | "external"
  | "eye"
  | "grid"
  | "heart"
  | "layers"
  | "news"
  | "search"
  | "share"
  | "shield"
  | "sparkles"
  | "trophy"
  | "user";

export default function HonorsIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: HonorsIconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
      {name === "trophy" && <><path d="M8 4h8v3.5c0 3.8-1.6 6.2-4 7.2-2.4-1-4-3.4-4-7.2V4Z" /><path d="M8 6H5c.2 3.2 1.5 4.8 3.8 5.3M16 6h3c-.2 3.2-1.5 4.8-3.8 5.3M12 14.7V18M8.5 21h7M10 18h4" /></>}
      {name === "news" && <><path d="M6 4h9l3 3v13H6V4Z" /><path d="M15 4v4h4M9 11h6M9 14h6M9 17h4" /></>}
      {name === "bolt" && <path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z" />}
      {name === "layers" && <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>}
      {name === "search" && <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>}
      {name === "eye" && <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>}
      {name === "heart" && <path d="M20.8 5.7a5 5 0 0 0-7.1 0L12 7.4l-1.7-1.7a5 5 0 0 0-7.1 7.1L12 21l8.8-8.2a5 5 0 0 0 0-7.1Z" />}
      {name === "clock" && <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>}
      {name === "arrow" && <><path d="M20 12H5M10 7l-5 5 5 5" /></>}
      {name === "crown" && <><path d="m3 7 4 4 5-7 5 7 4-4-2 11H5L3 7Z" /><path d="M5 18h14" /></>}
      {name === "sparkles" && <><path d="m12 3 1.2 3.7L17 8l-3.8 1.3L12 13l-1.2-3.7L7 8l3.8-1.3L12 3Z" /><path d="m5 14 .7 2.2L8 17l-2.3.8L5 20l-.7-2.2L2 17l2.3-.8L5 14ZM19 13l.6 1.7 1.6.6-1.6.5L19 18l-.6-2.2-1.6-.5 1.6-.6L19 13Z" /></>}
      {name === "shield" && <><path d="m12 3 7 3v5c0 4.6-2.8 8-7 10-4.2-2-7-5.4-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></>}
      {name === "share" && <><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.6-4.6M8.2 13.2l7.6 4.6" /></>}
      {name === "external" && <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13v6H5V6h6" /></>}
      {name === "user" && <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>}
      {name === "grid" && <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>}
    </svg>
  );
}
