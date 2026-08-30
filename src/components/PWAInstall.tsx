"use client";

import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PWAInstall() {
  const { lang } = useLanguage();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const isIOS = useCallback(() => {
    if (typeof window === "undefined") return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.userAgent.includes("Mac") && "ontouchend" in document);
  }, []);

  const isStandalone = useCallback(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in window.navigator && (window.navigator as unknown as { standalone: boolean }).standalone);
  }, []);

  useEffect(() => {
    // Register service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // SW registration failed silently
      });
    }

    // Check if already dismissed
    const wasDismissed = localStorage.getItem("flexa-pwa-dismissed");
    if (wasDismissed) {
      const dismissTime = parseInt(wasDismissed);
      // Show again after 3 days
      if (Date.now() - dismissTime < 3 * 24 * 60 * 60 * 1000) {
        setDismissed(true);
      }
    }

    // Check if already installed
    if (isStandalone()) {
      setIsInstalled(true);
      return;
    }

    // Listen for beforeinstallprompt (Android/Chrome)
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      if (!dismissed) setShowBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // For iOS - show after 3 seconds
    const timer = setTimeout(() => {
      if (isIOS() && !isStandalone() && !dismissed) {
        setShowIOSGuide(true);
        setShowBanner(true);
      }
    }, 3000);

    // Listen for app installed
    window.addEventListener("appinstalled", () => {
      setIsInstalled(true);
      setShowBanner(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      clearTimeout(timer);
    };
  }, [dismissed, isIOS, isStandalone]);

  async function handleInstall() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === "accepted") {
        setShowBanner(false);
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    }
  }

  function handleDismiss() {
    setShowBanner(false);
    setDismissed(true);
    localStorage.setItem("flexa-pwa-dismissed", Date.now().toString());
  }

  // Don't show if installed or dismissed
  if (isInstalled || !showBanner) return null;

  return (
    <>
      {/* Bottom Install Banner */}
      <div className="fixed bottom-0 start-0 end-0 z-[60] animate-slide-up">
        <div className="max-w-lg mx-auto px-4 pb-4">
          <div className="bg-dark-700 border border-neon-purple/40 rounded-2xl shadow-2xl shadow-neon-purple/10 overflow-hidden">
            
            {/* Main Banner */}
            <div className="p-4 sm:p-5">
              <div className="flex items-start gap-4">
                {/* App Icon */}
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-neon-purple to-neon-blue flex items-center justify-center text-2xl flex-shrink-0 shadow-lg">
                  ⚡
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-white text-base">
                    {lang === "fa" ? "نصب اپلیکیشن Flexa" : "Install Flexa App"}
                  </h3>
                  <p className="text-gray-400 text-sm mt-0.5">
                    {lang === "fa"
                      ? "برای دسترسی سریع‌تر، Flexa رو روی گوشیت نصب کن"
                      : "Install Flexa on your phone for faster access"}
                  </p>

                  {/* Benefits */}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                    {(lang === "fa"
                      ? ["⚡ سریع‌تر", "📱 بدون مرورگر", "🔔 اعلان"]
                      : ["⚡ Faster", "📱 No browser", "🔔 Notifications"]
                    ).map((b) => (
                      <span key={b} className="text-xs text-gray-500">{b}</span>
                    ))}
                  </div>
                </div>

                {/* Close */}
                <button
                  onClick={handleDismiss}
                  className="text-gray-600 hover:text-gray-400 p-1 -mt-1 -me-1"
                >
                  ✕
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 mt-4">
                {showIOSGuide ? (
                  // iOS Guide
                  <div className="flex-1 bg-dark-800 rounded-xl p-3 text-center">
                    <p className="text-sm text-gray-300 mb-2">
                      {lang === "fa" ? "در Safari:" : "In Safari:"}
                    </p>
                    <div className="flex items-center justify-center gap-2 text-sm">
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-dark-600 rounded-lg text-xs text-white">
                        1️⃣ {lang === "fa" ? "دکمه" : "Tap"}{" "}
                        <span className="text-neon-blue text-lg leading-none">⬆</span>{" "}
                        {lang === "fa" ? "رو بزن" : "Share"}
                      </span>
                      <span className="text-gray-600">→</span>
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-dark-600 rounded-lg text-xs text-white">
                        2️⃣ {lang === "fa" ? "«افزودن به صفحه اصلی»" : "\"Add to Home Screen\""}
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={handleInstall}
                      className="flex-1 gaming-btn py-3 text-sm font-bold"
                    >
                      📲 {lang === "fa" ? "نصب رایگان" : "Install Free"}
                    </button>
                    <button
                      onClick={handleDismiss}
                      className="px-4 py-3 rounded-xl text-gray-500 text-sm hover:text-white transition-colors"
                    >
                      {lang === "fa" ? "بعداً" : "Later"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
