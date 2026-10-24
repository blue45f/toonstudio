import { describe, expect, it } from "vitest";

import {
  addColorToHistory,
  clearColorHistory,
  removeColorFromHistory,
} from "./studio-color-history";

describe("studio-color-history", () => {
  it("adds color to the front of history without duplicates", () => {
    const list = ["#111111", "#222222", "#333333"];
    const updated = addColorToHistory(list, "#222222");

    expect(updated[0]).toBe("#222222");
    expect(updated.length).toBe(3);
    expect(updated).toEqual(["#222222", "#111111", "#333333"]);
  });

  it("caps history at capacity limit", () => {
    let list: readonly string[] = [];
    for (let i = 0; i < 40; i++) {
      const hex = `#${i.toString(16).padStart(6, "0")}`;
      list = addColorToHistory(list, hex, 10);
    }
    expect(list.length).toBe(10);
  });

  it("ignores invalid color strings and expands 3-digit hex shorthand", () => {
    const list = ["#111111"];
    const same = addColorToHistory(list, "invalid-color");
    expect(same).toBe(list);

    const expanded = addColorToHistory(list, "#f0a");
    expect(expanded[0]).toBe("#ff00aa");
    const removed = removeColorFromHistory(expanded, "#ff00aa");
    expect(removed).toEqual(["#111111"]);
  });

  it("clears color history", () => {
    const cleared = clearColorHistory();
    expect(cleared.length).toBe(0);
  });
});
