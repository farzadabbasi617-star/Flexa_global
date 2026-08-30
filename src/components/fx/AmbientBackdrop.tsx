"use client";

import ParticleField from "./ParticleField";

/**
 * A very subtle, fixed full-viewport particle layer sitting behind every
 * page in the app (z-index 0, pointer-events none). Most pages paint their
 * own opaque background over it, but it shows through on transparent
 * sections, empty states and the gaps around cards — reinforcing the
 * "living, animated" feel site-wide without touching each page's markup.
 */
export default function AmbientBackdrop() {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none">
      <ParticleField count={26} maxOpacity={0.35} />
    </div>
  );
}
