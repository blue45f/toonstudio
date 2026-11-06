import { describe, expect, it } from "vitest";

import { BRUSH_STUDIO_V6_RECIPES, createBrushStudioV6Program } from "./brush-studio-v6-engine";
import { createBrushStudioV6MaterialStroke } from "./brush-studio-v6-material-engine";
import {
  capBrushStudioV6CoalescedEvents,
  MAX_LIVE_COALESCED_SAMPLES_PER_FRAME,
  mixPreviewPigments,
  renderBrushStudioV6Preview,
  resolveBrushStudioV6LiveTransport,
  resolveBrushStudioV6PointerIntent,
  shouldBrushStudioV6HandleMoveEvent,
} from "./brush-studio-v6-preview";

describe("Brush Studio V6 pigment preview", () => {
  it("keeps the subtractive preview deterministic", () => {
    expect(mixPreviewPigments("#1d4ed8", "#eab308", 0.5)).toBe(
      mixPreviewPigments("#1d4ed8", "#eab308", 0.5),
    );
  });

  it("does not collapse a mixed pigment to either endpoint", () => {
    const mixed = mixPreviewPigments("#1d4ed8", "#eab308", 0.5);
    expect(mixed).not.toBe("rgba(29,78,216,1)");
    expect(mixed).not.toBe("rgba(234,179,8,1)");
  });

  it("결정적 질감 시험지(renderBrushStudioV6Preview)가 스트로크 다듬기 방식과 안정화 강도 변화를 궤적에 반영한다", () => {
    const captureTranslations = (program: ReturnType<typeof createBrushStudioV6Program>): string[] => {
      const translations: string[] = [];
      const ctx = {
        setTransform: () => {},
        clearRect: () => {},
        fillRect: () => {},
        save: () => {},
        restore: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        translate: (x: number, y: number) => { translations.push(`${x.toFixed(2)},${y.toFixed(2)}`); },
        rotate: () => {},
        ellipse: () => {},
        closePath: () => {},
        fill: () => {},
        fillStyle: "#000",
        strokeStyle: "#000",
        globalAlpha: 1,
        lineWidth: 1,
      };
      const canvas = {
        width: 320,
        height: 160,
        clientWidth: 320,
        clientHeight: 160,
        getContext: () => ctx,
      } as unknown as HTMLCanvasElement;
      renderBrushStudioV6Preview(canvas, program);
      return translations;
    };

    const base = createBrushStudioV6Program("clean-ink");
    const direct = captureTranslations({
      ...base,
      slots: { ...base.slots, motion: "motion-direct" },
      tuning: { ...base.tuning, stabilization: 0 },
    });
    const smoothed = captureTranslations({
      ...base,
      slots: { ...base.slots, motion: "motion-lazy-leash" },
      tuning: { ...base.tuning, stabilization: 0.95 },
    });
    expect(direct.length).toBeGreaterThan(0);
    expect(smoothed.length).toBeGreaterThan(0);
    expect(smoothed).not.toEqual(direct);
  });
});

describe("Brush Studio V6 live input authority", () => {
  const touch = Object.freeze({ pointerType: "touch", width: 10, height: 10 });

  it("routes touch contacts according to the selected pen policy", () => {
    expect(resolveBrushStudioV6PointerIntent(touch, "pen-only", true)).toBe("ignore");
    expect(resolveBrushStudioV6PointerIntent(touch, "pen-draw-finger-pan", true)).toBe("gesture");
    expect(resolveBrushStudioV6PointerIntent(touch, "pen-draw-two-finger-gesture", true)).toBe("gesture");
    expect(resolveBrushStudioV6PointerIntent(touch, "pen-ink-finger-water", true)).toBe("water");
    expect(resolveBrushStudioV6PointerIntent(touch, "touch-draw", true)).toBe("draw");
  });

  it("rejects palm-sized contacts before touch drawing or water routing", () => {
    const palm = Object.freeze({ pointerType: "touch", width: 50, height: 30 });
    expect(resolveBrushStudioV6PointerIntent(palm, "touch-draw", true)).toBe("reject-palm");
    expect(resolveBrushStudioV6PointerIntent(palm, "pen-ink-finger-water", true)).toBe("reject-palm");
    expect(resolveBrushStudioV6PointerIntent(palm, "touch-draw", false)).toBe("draw");
  });

  it("never classifies a pen contact as a palm", () => {
    expect(resolveBrushStudioV6PointerIntent(
      { pointerType: "pen", width: 64, height: 64 },
      "pen-only",
      true,
    )).toBe("draw");
  });

  it("falls back from unavailable raw or coalesced transports", () => {
    expect(resolveBrushStudioV6LiveTransport("auto", {
      pointerRawUpdate: true,
      coalescedEvents: true,
    })).toBe("raw-coalesced");
    expect(resolveBrushStudioV6LiveTransport("raw-coalesced", {
      pointerRawUpdate: false,
      coalescedEvents: true,
    })).toBe("move-coalesced");
    expect(resolveBrushStudioV6LiveTransport("move-coalesced", {
      pointerRawUpdate: false,
      coalescedEvents: false,
    })).toBe("move-basic");
  });

  it("accepts exactly one authoritative movement event stream", () => {
    expect(shouldBrushStudioV6HandleMoveEvent("pointerrawupdate", "raw-coalesced")).toBe(true);
    expect(shouldBrushStudioV6HandleMoveEvent("pointermove", "raw-coalesced")).toBe(false);
    expect(shouldBrushStudioV6HandleMoveEvent("pointermove", "move-coalesced")).toBe(true);
    expect(shouldBrushStudioV6HandleMoveEvent("pointerrawupdate", "move-coalesced")).toBe(false);
    expect(shouldBrushStudioV6HandleMoveEvent("pointermove", "move-basic")).toBe(true);
  });

  it("bounds coalesced event bursts while preserving first and last samples", () => {
    const burst = Array.from({ length: 400 }, (_, i) => i);
    const capped = capBrushStudioV6CoalescedEvents(burst);
    expect(capped).toHaveLength(MAX_LIVE_COALESCED_SAMPLES_PER_FRAME);
    expect(capped[0]).toBe(0);
    expect(capped[capped.length - 1]).toBe(399);
    const small = [1, 2, 3];
    expect(capBrushStudioV6CoalescedEvents(small)).toBe(small);
  });
});

describe("Brush Studio V6 all-recipe long-session soak stability", () => {
  it("renders all 139 V6 recipes across multi-stroke soak paths with finite geometry and deterministic output", () => {
    expect(BRUSH_STUDIO_V6_RECIPES.length).toBeGreaterThanOrEqual(139);
    for (const recipe of BRUSH_STUDIO_V6_RECIPES) {
      const program = createBrushStudioV6Program(recipe.id);
      const strokeA = createBrushStudioV6MaterialStroke(program);
      const strokeB = createBrushStudioV6MaterialStroke(program);
      let totalMarksA = 0;
      let totalMarksB = 0;
      for (let step = 0; step <= 24; step += 1) {
        const t = step / 24;
        const pt = {
          x: 24 + t * 240,
          y: 90 + Math.sin(t * Math.PI * 2) * 36,
          pressure: 0.1 + Math.sin(t * Math.PI) * 0.85,
          tilt: 0.25 + Math.cos(t * Math.PI) * 0.15,
          twist: step * 7,
        };
        const marksA = strokeA.push(pt);
        const marksB = strokeB.push(pt);
        expect(marksB.length, `${recipe.id} deterministic mark count`).toBe(marksA.length);
        totalMarksA += marksA.length;
        totalMarksB += marksB.length;
        for (const m of marksA) {
          expect(Number.isFinite(m.x) && Number.isFinite(m.y), `${recipe.id} finite xy`).toBe(true);
          expect(m.radiusX > 0 && m.radiusY > 0 && Number.isFinite(m.radiusX) && Number.isFinite(m.radiusY), `${recipe.id} positive radii`).toBe(true);
          expect(Number.isFinite(m.angle) && m.opacity >= 0 && m.opacity <= 1, `${recipe.id} angle/opacity`).toBe(true);
        }
      }
      // Non-finite glitch sample is safely ignored without corrupting stroke state
      expect(strokeA.push({ x: Number.NaN, y: 50, pressure: 0.5 })).toHaveLength(0);
      expect(totalMarksA, `${recipe.id} emitted marks`).toBeGreaterThan(0);
      expect(totalMarksB).toBe(totalMarksA);
    }
  }, 30_000);
});

