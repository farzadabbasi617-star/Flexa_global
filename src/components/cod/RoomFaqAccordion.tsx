"use client";

import { useId, useState } from "react";
import { initialAccordionState, toggleAccordionIndex } from "@/lib/accordion-state";

export interface RoomFaqEntry {
  question: string;
  answer: string;
}

/**
 * The FAQ shown on a Call of Duty room page.
 *
 * Rendered as real <button>/<section> pairs with aria-expanded and aria-controls
 * rather than a CSS-only toggle, so screen readers and keyboard users get the
 * same behaviour as pointer users. Answers stay mounted and are hidden with the
 * `hidden` attribute, which keeps in-page search (ctrl+F) working and avoids a
 * layout shift when a panel opens.
 */
export default function RoomFaqAccordion({
  entries,
  defaultOpenIndex = 0,
}: {
  entries: RoomFaqEntry[];
  defaultOpenIndex?: number | null;
}) {
  const baseId = useId();
  const [openIndexes, setOpenIndexes] = useState<Set<number>>(
    () => initialAccordionState(defaultOpenIndex, entries.length),
  );

  if (!entries.length) return null;

  function toggle(index: number) {
    setOpenIndexes((current) => toggleAccordionIndex(current, index));
  }

  return (
    <div className="space-y-2.5">
      {entries.map((entry, index) => {
        const open = openIndexes.has(index);
        const panelId = `${baseId}-panel-${index}`;
        const buttonId = `${baseId}-button-${index}`;
        return (
          <div
            key={`${entry.question}-${index}`}
            className={`overflow-hidden rounded-2xl border transition-colors ${
              open ? "border-yellow-400/30 bg-yellow-400/[.04]" : "border-white/10 bg-white/[.02]"
            }`}
          >
            <h3>
              <button
                type="button"
                id={buttonId}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => toggle(index)}
                className="flex w-full items-center gap-3 px-4 py-4 text-right"
              >
                <span
                  aria-hidden="true"
                  className={`h-2.5 w-2.5 shrink-0 rounded-full transition-colors ${
                    open ? "bg-yellow-400" : "bg-yellow-400/40"
                  }`}
                />
                <span className="flex-1 text-sm font-black leading-6">{entry.question}</span>
                <span
                  aria-hidden="true"
                  className={`shrink-0 text-xs text-gray-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                >
                  ▼
                </span>
              </button>
            </h3>
            <div id={panelId} role="region" aria-labelledby={buttonId} hidden={!open}>
              <p className="whitespace-pre-line px-4 pb-4 text-xs leading-7 text-gray-300">
                {entry.answer}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
