/**
 * Iranian e-commerce trust seal (اینماد / e-Namad).
 *
 * The snippet e-Namad hands out is raw HTML with two React-hostile details:
 *  - `referrerpolicy` must be `referrerPolicy` in JSX
 *  - the `code` attribute on <img> is non-standard; React only forwards it if
 *    it is lowercase, which it is, so it passes through as-is. e-Namad's
 *    verification script reads it, so it must not be dropped.
 *
 * `referrerPolicy="origin"` is required by e-Namad: their server checks the
 * Referer header to confirm the seal is displayed on the registered domain.
 * Next's <Image> would proxy/optimise the logo and break that check, so a
 * plain <img> is deliberate here.
 *
 * The link must open in a new tab and point at trustseal.enamad.ir so a user
 * can verify the licence independently.
 */

const ENAMAD_ID = "773764";
const ENAMAD_CODE = "GuOcBfFxZPTtEOWSwjAX40mZqBG2kxqx";

export default function EnamadSeal({ className = "" }: { className?: string }) {
  return (
    <a
      referrerPolicy="origin"
      target="_blank"
      rel="noopener"
      href={`https://trustseal.enamad.ir/?id=${ENAMAD_ID}&Code=${ENAMAD_CODE}`}
      className={`inline-block rounded-xl bg-white/95 p-1.5 transition-transform hover:scale-[1.03] ${className}`}
      aria-label="نماد اعتماد الکترونیکی Flexa — برای مشاهده اطلاعات مجوز کلیک کنید"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        referrerPolicy="origin"
        src={`https://trustseal.enamad.ir/logo.aspx?id=${ENAMAD_ID}&Code=${ENAMAD_CODE}`}
        alt="نماد اعتماد الکترونیکی"
        // Non-standard attribute required by e-Namad's verification script.
        // React forwards unknown lowercase attributes to the DOM, but TS has no
        // type for it, so it is spread rather than written inline.
        {...{ code: ENAMAD_CODE }}
        style={{ cursor: "pointer" }}
        className="h-[90px] w-auto"
        loading="lazy"
        decoding="async"
      />
    </a>
  );
}
