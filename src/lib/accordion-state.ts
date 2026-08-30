/**
 * Open/closed bookkeeping for a disclosure list, kept out of the component so
 * the behaviour can be tested without mounting React.
 */
export function toggleAccordionIndex(open: ReadonlySet<number>, index: number): Set<number> {
  const next = new Set(open);
  if (next.has(index)) next.delete(index);
  else next.add(index);
  return next;
}

export function initialAccordionState(defaultOpenIndex: number | null | undefined, count: number): Set<number> {
  if (defaultOpenIndex == null) return new Set();
  if (!Number.isInteger(defaultOpenIndex) || defaultOpenIndex < 0 || defaultOpenIndex >= count) return new Set();
  return new Set([defaultOpenIndex]);
}
