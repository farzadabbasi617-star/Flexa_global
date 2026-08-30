"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { shouldPoll, shouldRefreshOnVisibilityChange } from "@/lib/poll-scheduler";

/**
 * One notification-badge poller for the whole app.
 *
 * Navbar and BottomNav both render on every page and each ran its own 60s
 * timer against /api/notifications, so every signed-in tab issued two identical
 * requests a minute. With a 100-player room that is 200 requests and, because
 * the list endpoint also returned a page of rows and a total count, 800 queries
 * a minute for a number on a bell icon.
 *
 * Consumers now share this single poller, which additionally:
 *   - hits a count-only endpoint instead of fetching a page of notifications,
 *   - pauses while the tab is hidden and refreshes immediately on return, so a
 *     backgrounded phone stops polling entirely,
 *   - exposes refresh() so a page that marks something read can update the
 *     badge without waiting out the interval.
 */
const POLL_INTERVAL_MS = 60_000;

interface UnreadNotificationsValue {
  unreadCount: number;
  refresh: () => void;
}

const UnreadNotificationsContext = createContext<UnreadNotificationsValue>({
  unreadCount: 0,
  refresh: () => {},
});

export function UnreadNotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (!user) { setUnreadCount(0); return; }
    // A slow response must not let timers stack up requests.
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const response = await fetch("/api/notifications/unread-count", {
        cache: "no-store",
        credentials: "include",
      });
      if (!response.ok) return;
      const data = await response.json().catch(() => ({}));
      setUnreadCount(Number(data.unreadCount || 0));
    } catch {
      // Leave the previous badge value alone: a transient network blip should
      // not flash the badge to zero.
    } finally {
      inFlight.current = false;
    }
  }, [user]);

  useEffect(() => {
    if (!user) { setUnreadCount(0); return; }
    let timer: ReturnType<typeof setInterval> | null = null;

    function start() {
      if (timer) return;
      timer = setInterval(load, POLL_INTERVAL_MS);
    }
    function stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    }
    let previous = { signedIn: true, visible: document.visibilityState === "visible" };
    function onVisibility() {
      const next = { signedIn: true, visible: document.visibilityState === "visible" };
      if (shouldRefreshOnVisibilityChange(previous, next)) load();
      if (shouldPoll(next)) start(); else stop();
      previous = next;
    }

    load();
    if (shouldPoll(previous)) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [user, load]);

  return (
    <UnreadNotificationsContext.Provider value={{ unreadCount, refresh: load }}>
      {children}
    </UnreadNotificationsContext.Provider>
  );
}

export function useUnreadNotifications() {
  return useContext(UnreadNotificationsContext);
}
