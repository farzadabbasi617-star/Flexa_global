"use client";

import { ReactNode, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useLanguage } from "@/contexts/LanguageContext";
import PageTransition from "./fx/PageTransition";

/**
 * Decorative, browser-only layers.
 *
 * These previously used `dynamic(..., { ssr: false })`. In the App Router that
 * marks the surrounding subtree with BAILOUT_TO_CLIENT_SIDE_RENDERING: the
 * server still streams the HTML, but wrapped in `<div hidden>`, so the browser
 * paints nothing until hydration finishes.
 *
 * The live homepage shipped 48KB of correct markup that was invisible for
 * ~2.4s on a throttled mobile profile. The document was footer-only (559px)
 * until the bailout resolved, then jumped to 2839px — a single 0.66 layout
 * shift, i.e. the entire CLS of the page, against Google's 0.1 "good" bar.
 * Crawlers that do not execute JavaScript saw an empty page.
 *
 * Plain `dynamic()` without the `ssr: false` flag keeps the code-splitting
 * (these are heavy: canvas particle fields, framer-motion, a QR scanner) while
 * leaving the server render intact. They are additionally gated behind
 * `mounted` below so none of them run during hydration.
 */
const PWAInstall = dynamic(() => import("./PWAInstall"), { loading: () => null });
const ThemeRuntime = dynamic(() => import("./ThemeRuntime"), { loading: () => null });
const AIAssistant = dynamic(() => import("./AIAssistant"), { loading: () => null });
const SplashScreen = dynamic(() => import("./SplashScreen"), { loading: () => null });
const GlobalCardFX = dynamic(() => import("./fx/GlobalCardFX"), { loading: () => null });
const AmbientBackdrop = dynamic(() => import("./fx/AmbientBackdrop"), { loading: () => null });

export function LayoutWrapper({ children }: { children: ReactNode }) {
  const { dir, lang } = useLanguage();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    document.documentElement.setAttribute("dir", dir);
    document.documentElement.setAttribute("lang", lang);
  }, [dir, lang]);

  return (
    <>
      {/* Page content first, and never behind a client-only boundary. */}
      <PageTransition>{children}</PageTransition>

      {/* Everything below is atmosphere: it must never delay or hide content. */}
      {mounted && (
        <>
          <SplashScreen />
          <ThemeRuntime />
          <AmbientBackdrop />
          <GlobalCardFX />
          <AIAssistant />
          <PWAInstall />
        </>
      )}
    </>
  );
}
