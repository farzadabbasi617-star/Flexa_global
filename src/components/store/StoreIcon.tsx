import type { SVGProps } from "react";

export type StoreIconName =
  | "arrow-left"
  | "badge-check"
  | "box"
  | "briefcase"
  | "check"
  | "chevron-left"
  | "clock"
  | "gamepad"
  | "grid"
  | "headset"
  | "info"
  | "package"
  | "plus"
  | "refresh"
  | "search"
  | "shield"
  | "shopping-bag"
  | "sliders"
  | "sparkles"
  | "star"
  | "store"
  | "tag"
  | "truck"
  | "user"
  | "wallet";

interface StoreIconProps extends SVGProps<SVGSVGElement> {
  name: StoreIconName;
}

export default function StoreIcon({ name, ...props }: StoreIconProps) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...common} {...props}>
      {name === "search" && <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>}
      {name === "shield" && <><path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6l-7-3Z" /><path d="m9.2 12 1.8 1.8 3.9-4" /></>}
      {name === "wallet" && <><path d="M4 7.5h14a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11" /><path d="M16 12h4v4h-4a2 2 0 0 1 0-4Z" /></>}
      {name === "box" && <><path d="m4 7 8-4 8 4-8 4-8-4Z" /><path d="m4 7 0 10 8 4 8-4V7M12 11v10" /></>}
      {name === "package" && <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4.5 7.7 7.5 4.2 7.5-4.2M12 12v9M8 5.2l8 4.5" /></>}
      {name === "plus" && <><path d="M12 5v14M5 12h14" /></>}
      {name === "chevron-left" && <path d="m14 6-6 6 6 6" />}
      {name === "arrow-left" && <><path d="M20 12H5M10 7l-5 5 5 5" /></>}
      {name === "sliders" && <><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>}
      {name === "sparkles" && <><path d="m12 3 1.1 3.2L16 8l-2.9 1.8L12 13l-1.1-3.2L8 8l2.9-1.8L12 3Z" /><path d="m5.5 13 .8 2.2 2.2.8-2.2.8L5.5 19l-.8-2.2-2.2-.8 2.2-.8.8-2.2ZM18.5 14l.6 1.5 1.4.5-1.4.5-.6 1.5-.6-1.5-1.4-.5 1.4-.5.6-1.5Z" /></>}
      {name === "store" && <><path d="M4 10v10h16V10M3 10l2-6h14l2 6" /><path d="M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M9 20v-6h6v6" /></>}
      {name === "shopping-bag" && <><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></>}
      {name === "badge-check" && <><path d="m12 3 2 1.4 2.5-.2.8 2.4 2.2 1.3-.8 2.4.8 2.4-2.2 1.3-.8 2.4-2.5-.2L12 21l-2-1.4-2.5.2-.8-2.4-2.2-1.3.8-2.4-.8-2.4L6.7 10l.8-2.4 2.5.2L12 3Z" /><path d="m9 12 2 2 4-4" /></>}
      {name === "headset" && <><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><path d="M4 14h3v6H6a2 2 0 0 1-2-2v-4ZM20 14h-3v6h1a2 2 0 0 0 2-2v-4ZM17 20c0 1-1 1-2 1h-3" /></>}
      {name === "truck" && <><path d="M3 6h11v11H3V6ZM14 10h4l3 3v4h-7v-7Z" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>}
      {name === "tag" && <><path d="m3 12 9-9h7v7l-9 9-7-7Z" /><circle cx="15.5" cy="6.5" r="1" /></>}
      {name === "gamepad" && <><path d="M8 7h8a5 5 0 0 1 4.7 6.7l-1.1 3.1a2.2 2.2 0 0 1-3.6.9L14.2 16H9.8L8 17.7a2.2 2.2 0 0 1-3.6-.9l-1.1-3.1A5 5 0 0 1 8 7Z" /><path d="M8 10v4M6 12h4M16 11h.01M18 13h.01" /></>}
      {name === "user" && <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>}
      {name === "briefcase" && <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2" /></>}
      {name === "grid" && <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>}
      {name === "refresh" && <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 8a7 7 0 0 1 11.5-1L20 12M4 12l2.4 5a7 7 0 0 0 11.5-1" /></>}
      {name === "check" && <path d="m5 12 4 4L19 6" />}
      {name === "clock" && <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>}
      {name === "star" && <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" />}
      {name === "info" && <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>}
    </svg>
  );
}
