"use client";

import { useState } from "react";
import { describeAutoNewsResult, type AutoNewsOutcome } from "@/lib/auto-news-result";

/**
 * Runs the trusted-source news sweep on demand.
 *
 * The sweep already existed but was reachable only from /admin/honors. Admins
 * who live in settings had no way to trigger it, so this is shared between both
 * places rather than duplicated — the honors page had its own copy of the
 * result-message logic, which is now the tested helper.
 */
export default function AutoNewsButton({
  onCreated,
  onOutcome,
  className,
  label = "📰 بررسی و ساخت خبر معتبر",
  showResult = true,
}: {
  /** Called only when at least one honor was actually published. */
  onCreated?: () => void | Promise<void>;
  /** Called with every outcome, so a host page can render feedback its own way. */
  onOutcome?: (outcome: AutoNewsOutcome) => void;
  className?: string;
  label?: string;
  showResult?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AutoNewsOutcome | null>(null);

  async function run() {
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/admin/honors/auto-news", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        // Never force a duplicate. A manual run uses the same source, image and
        // Persian-quality policy as the scheduled one.
        body: JSON.stringify({ force: false }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.details || data.error || "ساخت خبر خودکار انجام نشد");
      }
      const outcome = describeAutoNewsResult(data);
      setResult(outcome);
      onOutcome?.(outcome);
      if (outcome.created) await onCreated?.();
    } catch (error) {
      const outcome: AutoNewsOutcome = {
        ok: false,
        created: false,
        text: error instanceof Error ? error.message : "ساخت خبر خودکار انجام نشد",
        details: "",
        titles: [],
      };
      setResult(outcome);
      onOutcome?.(outcome);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={run}
        disabled={loading}
        className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black transition-all hover:bg-emerald-700 disabled:opacity-50"
      >
        {loading ? "در حال بررسی منابع رسمی..." : label}
      </button>

      {showResult && result && (
        <div
          role="status"
          className={`mt-3 rounded-xl border p-3 text-xs leading-6 ${
            result.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-amber-500/30 bg-amber-500/10 text-amber-200"
          }`}
        >
          <div className="font-black">{result.text}</div>
          {result.details && <div className="mt-1 text-[10px] opacity-80">{result.details}</div>}
        </div>
      )}
    </div>
  );
}
