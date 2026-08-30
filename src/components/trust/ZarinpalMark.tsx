"use client";

/**
 * ZarinPal brand mark, in 3D.
 *
 * The real logo is a yellow parallelogram leaning right, with a blue circle
 * overlapping its top-left corner. Where the two overlap the blue darkens
 * (multiply), which is what makes the circle read as sitting *in front of* the
 * slab. The first version of this file invented a rounded tile with a "7"
 * glyph, which was simply the wrong logo.
 *
 * Geometry and colours were measured off the supplied artwork rather than
 * eyeballed:
 *   parallelogram  top edge y=36 x=168..275, bottom edge y=242 x=97..202
 *                  both side edges slope -0.4 (dx/dy)
 *   circle         centre (120.5, 96), r=61.5
 *   yellow #FFD40C   blue #0A33FF   overlap #0727C7
 * Drawn on the source's own 350x350 grid so those numbers stay checkable.
 *
 * Inline SVG rather than the JPEG: no network request, crisp at any size, and
 * it can carry the lighting and the specular sweep. Redrawing is fine here --
 * it is a payment partner's logo, unlike the e-Namad seal, which must stay the
 * verifiable image served from their own domain.
 */

/** Extrusion depth in source units; the body is stacked along this offset. */
const DEPTH = 9;

export default function CryptoPaymentMark({ className = "" }: { className?: string }) {
  // Parallelogram geometry, measured off the artwork. Sides slope -0.4 in x
  // per +1 y, and all four corners are rounded (~14 units), which is what
  // makes the mark read as a soft slab rather than a sheared rectangle.
  const TOP_Y = 36;
  const BOT_Y = 242;
  // Sharp (un-rounded) corners, from a least-squares fit of the two slanted
  // edges: right x = -0.400y + 303.0, left x = -0.409y + 180.8. Reading the
  // corners straight off the bitmap instead gives values pulled ~10 units
  // inward by the corner radius, which made the slab too narrow.
  const TL = 166;
  const TR = 288.6;
  const BL = 81.7;
  const BR = 206.2;
  const RAD = 14;

  // Unit vectors along the top/bottom (horizontal) and along the slanted side.
  const sx = -0.4; // dx per dy down the side
  const sideLen = Math.hypot(sx, 1);
  const ux = sx / sideLen;
  const uy = 1 / sideLen;

  // Rounded parallelogram: walk the four corners, cutting RAD off each side
  // and joining with a quadratic through the true corner.
  const slab = [
    `M${TL + RAD} ${TOP_Y}`,
    `L${TR - RAD} ${TOP_Y}`,
    `Q${TR} ${TOP_Y} ${TR + ux * RAD} ${TOP_Y + uy * RAD}`,
    `L${BR - ux * RAD} ${BOT_Y - uy * RAD}`,
    `Q${BR} ${BOT_Y} ${BR - RAD} ${BOT_Y}`,
    `L${BL + RAD} ${BOT_Y}`,
    `Q${BL} ${BOT_Y} ${BL - ux * RAD} ${BOT_Y - uy * RAD}`,
    `L${TL + ux * RAD} ${TOP_Y + uy * RAD}`,
    `Q${TL} ${TOP_Y} ${TL + RAD} ${TOP_Y}`,
    "Z",
  ].join(" ");

  const CX = 120.5;
  const CY = 97;
  const R = 61.5;

  return (
    <svg viewBox="0 0 350 350" className={className} role="img" aria-label="درگاه پرداخت زرین‌پال">
      <defs>
        {/* Face lighting: brighter toward the top-left so the slab reads as lit
            from the same direction as the rest of the section. */}
        <linearGradient id="zpx-yellow" x1="0" y1="0" x2="0.75" y2="1">
          <stop offset="0%" stopColor="#FFE55C" />
          <stop offset="42%" stopColor="#FFD40C" />
          <stop offset="100%" stopColor="#E5A800" />
        </linearGradient>

        <linearGradient id="zpx-yellow-edge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#C68F00" />
          <stop offset="100%" stopColor="#8A6200" />
        </linearGradient>

        <linearGradient id="zpx-blue" x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor="#3C63FF" />
          <stop offset="45%" stopColor="#0A33FF" />
          <stop offset="100%" stopColor="#0524B8" />
        </linearGradient>

        <linearGradient id="zpx-blue-edge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0726A8" />
          <stop offset="100%" stopColor="#03165E" />
        </linearGradient>

        {/* Overlap tint: the measured #0727C7, applied only where the circle
            crosses the slab. */}
        <linearGradient id="zpx-overlap" x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor="#0A2ED6" />
          <stop offset="100%" stopColor="#04198C" />
        </linearGradient>

        <linearGradient id="zpx-shine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="50%" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>

        {/* Clip the sweep to the two shapes so highlight never spills outside. */}
        <clipPath id="zpx-clip">
          <path d={slab} />
          <circle cx={CX} cy={CY} r={R} />
        </clipPath>

        {/* The circle's own area, used to tint the region it shares with the slab. */}
        <clipPath id="zpx-circle-clip">
          <circle cx={CX} cy={CY} r={R} />
        </clipPath>

        <filter id="zpx-shadow" x="-30%" y="-30%" width="160%" height="170%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>

      {/* Ground contact shadow. */}
      <ellipse cx="168" cy="262" rx="86" ry="13" fill="#000" opacity="0.34" filter="url(#zpx-shadow)" />

      {/* --- extruded side walls, drawn before the faces --- */}
      <g>
        <path d={slab} transform={`translate(0 ${DEPTH})`} fill="url(#zpx-yellow-edge)" />
        <path d={slab} transform={`translate(0 ${DEPTH * 0.62})`} fill="url(#zpx-yellow-edge)" />
        <path d={slab} transform={`translate(0 ${DEPTH * 0.3})`} fill="#B98400" />
      </g>
      <g>
        <circle cx={CX} cy={CY + DEPTH} r={R} fill="url(#zpx-blue-edge)" />
        <circle cx={CX} cy={CY + DEPTH * 0.62} r={R} fill="url(#zpx-blue-edge)" />
        <circle cx={CX} cy={CY + DEPTH * 0.3} r={R} fill="#0722A0" />
      </g>

      {/* --- lit faces --- */}
      <path d={slab} fill="url(#zpx-yellow)" />

      {/* Slab top highlight: a thin bright lip along the upper edge. */}
      <path
        d={`M${TL + RAD} ${TOP_Y + 2.5} L${TR - RAD} ${TOP_Y + 2.5}`}
        stroke="#fff"
        strokeOpacity="0.5"
        strokeWidth="3"
        strokeLinecap="round"
      />

      <circle cx={CX} cy={CY} r={R} fill="url(#zpx-blue)" />

      {/* Overlap region: circle ∩ slab, darker, exactly as in the artwork. */}
      <g clipPath="url(#zpx-circle-clip)">
        <path d={slab} fill="url(#zpx-overlap)" />
      </g>

      {/* Specular dot on the circle — sells the sphere. */}
      <ellipse cx={CX - 21} cy={CY - 24} rx="17" ry="13" fill="#fff" opacity="0.22" transform={`rotate(-28 ${CX - 21} ${CY - 24})`} />

      {/* Slow specular sweep across both shapes. */}
      <g clipPath="url(#zpx-clip)">
        <rect x="-140" y="0" width="80" height="350" fill="url(#zpx-shine)" transform="skewX(-22)">
          <animate
            attributeName="x"
            values="-140;420"
            dur="4.8s"
            repeatCount="indefinite"
            calcMode="spline"
            keyTimes="0;1"
            keySplines="0.42 0 0.25 1"
          />
        </rect>
      </g>
    </svg>
  );
}
