/**
 * Decides whether a background poller should be running.
 *
 * Extracted so the rules — stop when signed out, stop when the tab is hidden,
 * refresh immediately on return — are testable without a DOM, and so the same
 * policy can be reused by any future poller rather than re-derived.
 */
export interface PollDecisionInput {
  signedIn: boolean;
  visible: boolean;
}

export function shouldPoll(input: PollDecisionInput) {
  return input.signedIn && input.visible;
}

/** True when becoming visible again should trigger an immediate refresh. */
export function shouldRefreshOnVisibilityChange(
  previous: PollDecisionInput,
  next: PollDecisionInput,
) {
  return next.signedIn && next.visible && !previous.visible;
}

/**
 * Requests a signed-in client makes per hour.
 * `pollers` is how many components own a timer for the same data.
 */
export function requestsPerHour(intervalMs: number, pollers = 1) {
  if (intervalMs <= 0) return 0;
  return Math.round((3_600_000 / intervalMs) * pollers);
}
