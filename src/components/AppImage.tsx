import Image, { type ImageProps } from "next/image";

/**
 * Site image wrapper.
 *
 * Every image in the app was a bare `<img>` with no intrinsic size, so the
 * browser could not reserve space before the bytes arrived and content jumped
 * as each one loaded. On the live home page that was 14 out of 14 images —
 * a Cumulative Layout Shift problem Google scores directly for mobile.
 *
 * Two ways to use it:
 *
 *   `fill`  — the image covers a positioned parent that already has a height
 *             (the common case here: a card banner inside `h-52 relative`).
 *             No layout shift is possible because the parent defines the box.
 *
 *   sized   — pass explicit `width`/`height` for fixed chrome such as icons
 *             and logos. The aspect ratio reserves the space up front.
 *
 * `unoptimized` defaults to true. Render's free tier gives one small shared
 * CPU, and Next's on-demand optimizer transcodes on the server on first
 * request — with ~48 icons that competes with request handling on the same
 * box. The PNGs were already recompressed by 70% (scripts/optimize-images.mjs),
 * so the remaining win is layout stability, not bytes. Pass
 * `unoptimized={false}` for large photographic sources where a resize
 * genuinely pays for itself.
 */
export type AppImageProps = Omit<ImageProps, "alt"> & {
  /** Required. Use "" for decorative images, which also sets aria-hidden. */
  alt: string;
};

export default function AppImage({
  alt,
  unoptimized = true,
  loading,
  priority,
  ...props
}: AppImageProps) {
  return (
    <Image
      {...props}
      alt={alt}
      aria-hidden={alt === "" ? true : undefined}
      unoptimized={unoptimized}
      // `priority` and `loading` are mutually exclusive in next/image.
      {...(priority ? { priority: true } : { loading: loading ?? "lazy" })}
    />
  );
}
