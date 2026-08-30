import { describe, expect, it } from "vitest";
import { initialAccordionState, toggleAccordionIndex } from "./accordion-state";

describe("accordion open state", () => {
  it("opens a closed panel and closes an open one", () => {
    let open = new Set<number>();
    open = toggleAccordionIndex(open, 2);
    expect([...open]).toEqual([2]);
    open = toggleAccordionIndex(open, 2);
    expect([...open]).toEqual([]);
  });

  it("allows several panels open at once", () => {
    // A player comparing the prize rules against the game rules should not have
    // one collapse when they open the other.
    let open = new Set<number>();
    open = toggleAccordionIndex(open, 0);
    open = toggleAccordionIndex(open, 3);
    expect([...open].sort()).toEqual([0, 3]);
  });

  it("never mutates the set it was given", () => {
    const original = new Set([1]);
    const next = toggleAccordionIndex(original, 2);
    expect([...original]).toEqual([1]);
    expect([...next].sort()).toEqual([1, 2]);
  });

  it("opens the requested panel on first render", () => {
    expect([...initialAccordionState(0, 7)]).toEqual([0]);
    expect([...initialAccordionState(3, 7)]).toEqual([3]);
  });

  it("starts fully collapsed when asked to", () => {
    expect([...initialAccordionState(null, 7)]).toEqual([]);
  });

  it("ignores an index that does not exist rather than opening nothing visible", () => {
    // A room with fewer FAQ entries than the default index must not crash or
    // leave an invisible panel flagged open.
    expect([...initialAccordionState(4, 2)]).toEqual([]);
    expect([...initialAccordionState(-1, 5)]).toEqual([]);
    expect([...initialAccordionState(0, 0)]).toEqual([]);
  });
});
