import type { NextConfig } from "next";

// Next's dev server needs eval for hot reload and the React refresh runtime.
// Production has no such requirement, so allowing it there would keep the main
// class of XSS that CSP is meant to stop.
const isDev = process.env.NODE_ENV === "development";

const scriptSrc = [
  "'self'",
  // Next inlines a bootstrap script and passes hydration data inline, so this
  // cannot be dropped without moving to nonces across every rendered page.
  "'unsafe-inline'",
  ...(isDev ? ["'unsafe-eval'"] : []),
  "https://telegram.org",
].join(" ");

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), clipboard-write=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  {
    // Enforcing, not Report-Only. Report-Only ships the whole policy but tells
    // the browser to allow every violation, so it blocked nothing.
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "upgrade-insecure-requests",
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://api.telegram.org https://openrouter.ai https://api.groq.com https://router.huggingface.co https://api.resend.com https://script.google.com https://script.googleusercontent.com",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,

  // Emits .next/standalone: a self-contained server bundle with only the
  // node_modules it actually imports, so the VPS can run `node server.js`
  // without installing the full dependency tree (~1GB -> ~150MB) and without
  // Render's build pipeline.
  //
  // Opt-in rather than always-on. Render currently starts the app with
  // `next start`, which reads .next/ directly; flipping output globally is a
  // change to how the live service boots, and this is not the deploy to find
  // that out on. Set NEXT_OUTPUT_STANDALONE=true on the VPS build only.
  ...(process.env.NEXT_OUTPUT_STANDALONE === "true" ? { output: "standalone" as const } : {}),

  // Heavy, Node-only image/QR libraries used exclusively by the Telegram
  // webhook (server-side). Marking them external keeps webpack from pulling
  // their large module graphs into the server bundle during `next build`,
  // which was pushing Render Free's build over its memory limit (OOM/SIGKILL).
  serverExternalPackages: ["jimp", "jsqr", "sharp"],
  // Playwright's local server is reached through 127.0.0.1 during development.
  allowedDevOrigins: ["127.0.0.1"],

  // فشرده‌سازی
  compress: true,

  // Keep production builds inside Render Free's memory budget. Running the
  // webpack compiler in-process avoids duplicating the full module graph in a
  // worker, while the memory-optimized graph trades a little speed for a much
  // lower peak RSS.
  experimental: {
    cpus: 1,
    webpackBuildWorker: false,
    webpackMemoryOptimizations: true,
  },
  // Type checking already runs as a mandatory CI job (`npm run typecheck`).
  // Skipping Next's duplicate checker prevents two large TypeScript processes
  // from exceeding the memory limit during the Render production build.
  typescript: {
    ignoreBuildErrors: true,
  },
  // Webpack otherwise schedules a very large number of module builds at once.
  // A small queue is slower but keeps both Arena and Render Free below their
  // memory limit, avoiding an abrupt SIGKILL during production deploys.
  webpack(config) {
    config.parallelism = 1;
    return config;
  },
  // Development and Playwright use Next 16's default Turbopack server. An
  // explicit empty config confirms that the webpack override above is only
  // intended for `next build --webpack` and prevents the dev server exiting.
  turbopack: {},

  // بهینه‌سازی تصاویر
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 86400,
    deviceSizes: [390, 768, 1024, 1280, 1920],
    // Hosts that actually appear in the database today: first-party artwork
    // attached to auto-generated news, and the image host used by the admin
    // media panel. next/image refuses unknown remote hosts by default, so a
    // missing entry here renders a broken image rather than a warning.
    remotePatterns: [
      { protocol: "https", hostname: "**.supercell.com" },
      { protocol: "https", hostname: "cms-assets.unrealengine.com" },
      { protocol: "https", hostname: "**.callofduty.com" },
      { protocol: "https", hostname: "**.fortnite.com" },
      { protocol: "https", hostname: "i.postimg.cc" },
      { protocol: "https", hostname: "res.cloudinary.com" },
    ],
  },

  async headers() {
    return [
      // هدرهای امنیتی برای همه مسیرها
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      // Next.js automatically serves hashed /_next/static assets as immutable;
      // overriding that Cache-Control header causes framework warnings and can
      // break development caching, so only the global security headers apply.
      // آیکون‌ها — کش یه روزه (نه بلندمدت تا لوگو گیر نکنه)
      {
        source: "/icons/:path*",
        headers: [
          ...securityHeaders,
          { key: "Cache-Control", value: "public, max-age=86400, must-revalidate" },
        ],
      },
      // manifest
      {
        source: "/manifest.json",
        headers: [
          ...securityHeaders,
          { key: "Cache-Control", value: "public, max-age=3600, must-revalidate" },
        ],
      },
      // service worker — هرگز کش نشه
      {
        source: "/sw.js",
        headers: [
          ...securityHeaders,
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      // تصاویر عمومی
      {
        source: "/avatars/:path*",
        headers: [
          ...securityHeaders,
          { key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" },
        ],
      },
      // صفحات HTML — کش کوتاه با revalidate
      {
        source: "/((?!_next|api|icons|avatars|manifest|sw).*)",
        headers: [
          ...securityHeaders,
        ],
      },
    ];
  },
};

export default nextConfig;
