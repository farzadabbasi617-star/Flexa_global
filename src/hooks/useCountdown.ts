"use client";

import { useEffect, useRef, useState } from "react";

interface CountdownState {
  /** Persian (fa-IR) formatted string, e.g. "۲ روز و ۳ ساعت" / "۰۵:۳۲" */
  value: string;
  /** English/latin formatted string, e.g. "2d 3h" / "05:32" */
  valueEn: string;
  expired: boolean;
}

const EMPTY: CountdownState = { value: "", valueEn: "", expired: false };

/**
 * Shared, render-efficient countdown hook used by tournament cards across
 * the app (home, tournaments list, tournament detail, lobby).
 *
 * Perf notes:
 * - Ticks every second only during the final minute; otherwise it ticks
 *   once per minute. Previously several duplicated copies of this hook
 *   re-rendered every second unconditionally, which is wasteful when a
 *   page shows many cards at once (each running its own 1s interval) and
 *   the displayed granularity is only "Xd Yh" anyway.
 * - Skips the interval entirely once expired or when there's no target.
 */
export function useCountdown(targetDate?: string | null): CountdownState {
  const [state, setState] = useState<CountdownState>(EMPTY);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    if (!targetDate) {
      setState(EMPTY);
      return;
    }

    const targetMs = new Date(targetDate).getTime();
    if (Number.isNaN(targetMs)) {
      setState(EMPTY);
      return;
    }

    function tick() {
      const diff = targetMs - Date.now();

      if (diff <= 0) {
        setState({ value: "شروع شده", valueEn: "Started", expired: true });
        return;
      }

      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      let value: string;
      let valueEn: string;
      if (days > 0) {
        value = `${days.toLocaleString("fa-IR")} روز و ${hours.toLocaleString("fa-IR")} ساعت`;
        valueEn = `${days}d ${hours}h`;
      } else if (hours > 0) {
        value = `${hours.toLocaleString("fa-IR")} ساعت و ${minutes.toLocaleString("fa-IR")} دقیقه`;
        valueEn = `${hours}h ${minutes}m`;
      } else {
        value = `${minutes.toLocaleString("fa-IR")}:${seconds.toString().padStart(2, "0")}`;
        valueEn = `${minutes}:${seconds.toString().padStart(2, "0")}`;
      }

      setState({ value, valueEn, expired: false });

      // Only tick every second once inside the final minute (where seconds
      // are actually shown); otherwise tick once a minute — the coarser
      // "Xd Yh" / "Xh Ym" display doesn't change more often than that.
      const nextDelay = diff <= 60_000 ? 1000 : 60_000;
      timeoutRef.current = setTimeout(tick, nextDelay);
    }

    tick();
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [targetDate]);

  return state;
}
