import { describe, expect, it } from "vitest";

import { STUDIO_CANVAS_WIDTH } from "./canvas/studio-canvas-constants";
import {
  EXAMPLE_EDITOR_HREF,
  EXAMPLE_JOURNEY_STEP_IDS,
  EXAMPLE_PAGE_CANVAS_H,
  buildExampleProjectPage,
  exampleJourneyProgress,
  exampleJourneySteps,
  readExampleJourney,
  setExampleJourneyDismissed,
  toggleExampleJourneyStep,
} from "./studio-example-project-content";

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("example project page content", () => {
  it("contains line art, colour fills and a speech balloon on one page", () => {
    const page = buildExampleProjectPage();
    const types = page.elements.map((element) => element.type);
    expect(types).toContain("frame");
    expect(types).toContain("bubble");
    expect(types).toContain("text");

    const draws = page.elements.filter((element) => element.type === "draw");
    // 채색: fill이 있는 도형이 있어야 하고, 선화: fill 없는 프리핸드 먹선이 있어야 한다.
    expect(draws.some((element) => element.type === "draw" && element.fill)).toBe(true);
    expect(draws.some((element) => element.type === "draw" && element.kind === "freehand" && !element.fill)).toBe(true);

    const bubble = page.elements.find((element) => element.type === "bubble");
    expect(bubble?.type === "bubble" ? bubble.text : "").toContain("첫 컷");
    expect(bubble?.type === "bubble" ? bubble.variant : null).toBe("speech");
  });

  it("keeps element ids unique and every element inside the canvas", () => {
    const page = buildExampleProjectPage();
    const ids = page.elements.map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(page.canvasH).toBe(EXAMPLE_PAGE_CANVAS_H);
    for (const element of page.elements) {
      if ("x" in element && "width" in element) {
        expect(element.x).toBeGreaterThanOrEqual(0);
        expect(element.x + element.width).toBeLessThanOrEqual(STUDIO_CANVAS_WIDTH);
      }
      if (element.type === "draw") {
        for (let index = 0; index < element.points.length; index += 2) {
          expect(element.points[index]).toBeGreaterThanOrEqual(0);
          expect(element.points[index]).toBeLessThanOrEqual(STUDIO_CANVAS_WIDTH);
          expect(element.points[index + 1]).toBeGreaterThanOrEqual(0);
          expect(element.points[index + 1]).toBeLessThanOrEqual(EXAMPLE_PAGE_CANVAS_H);
        }
      }
    }
  });
});

describe("example journey steps", () => {
  it("points every step at a real surface and keeps the canonical order", () => {
    const steps = exampleJourneySteps();
    expect(steps.map((step) => step.id)).toEqual([...EXAMPLE_JOURNEY_STEP_IDS]);
    expect(steps[0]?.href).toBe(EXAMPLE_EDITOR_HREF);
    expect(steps.find((step) => step.id === "start-own-work")?.href).toBe("/create");
    expect(steps.find((step) => step.id === "save-and-publish")?.href).toBe("/studio?view=publications");
    for (const step of steps) {
      expect(step.titleKo.length).toBeGreaterThan(0);
      expect(step.titleEn.length).toBeGreaterThan(0);
      expect(step.hintKo.length).toBeGreaterThan(0);
      expect(step.hintEn.length).toBeGreaterThan(0);
    }
  });

  it("persists toggles in canonical order and survives corrupt storage", () => {
    const storage = new MemoryStorage();
    expect(readExampleJourney(storage).doneIds).toEqual([]);

    toggleExampleJourneyStep(storage, "edit-bubble", { at: "2026-10-14T00:00:00.000Z" });
    const afterTwo = toggleExampleJourneyStep(storage, "open-example", { at: "2026-10-14T00:01:00.000Z" });
    expect(afterTwo.doneIds).toEqual(["open-example", "edit-bubble"]);
    expect(exampleJourneyProgress(afterTwo)).toEqual({ done: 2, total: 6, ratio: 2 / 6 });

    const untoggled = toggleExampleJourneyStep(storage, "edit-bubble", { at: "2026-10-14T00:02:00.000Z" });
    expect(untoggled.doneIds).toEqual(["open-example"]);

    const dismissed = setExampleJourneyDismissed(storage, true, { at: "2026-10-14T00:03:00.000Z" });
    expect(dismissed.dismissed).toBe(true);
    expect(dismissed.doneIds).toEqual(["open-example"]);

    storage.values.set("toonspectrum:studio-example-journey:v1", "{broken");
    expect(readExampleJourney(storage)).toMatchObject({ doneIds: [], dismissed: false });
  });
});
