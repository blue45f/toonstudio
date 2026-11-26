import { describe, expect, it } from "vitest";


import { normalizeStudioBrushDynamicsSettings } from "../apps/web/src/domains/creator/brush/studio-brush-dynamics";
import { materializeStudioBrushPackSelection } from "../apps/web/src/domains/creator/brush/studio-brush-pack-runtime";
import { STUDIO_DYNAMIC_BRUSH_CAUSAL_STAMP_GRID } from "../apps/web/src/domains/creator/brush/studio-brush-render-budget";
import { sampleStudioBrushTipAlphaMap } from "../apps/web/src/domains/creator/brush/studio-brush-tip-stamp";
import { resolveStudioDynamicBrushMaterialIdentity } from "../apps/web/src/domains/creator/brush/studio-dry-media-dynamic-bridge";
import { planStudioCausalDynamicBrushDepositSegmentsV3 } from "../apps/web/src/domains/creator/studio-causal-dynamic-brush-deposit-v2";
import {
  planStudioDynamicBrushCoverageMarks,
  type StudioDynamicBrushCoverageMark,
} from "../apps/web/src/domains/creator/studio-dynamic-brush-coverage-renderer";

import { analyzeStudioLongBrushQuality } from "./studio-brush-long-matrix-quality";

/** 공유 플래너가 반환한 실제 팁 알파를 source-over로 합성한다. */
function rasterizeMarks(
  marks: readonly StudioDynamicBrushCoverageMark[],
  scale: number,
  opacity: number,
) {
  const width = 360 * scale;
  const height = 140 * scale;
  const alpha = new Float32Array(width * height);
  for (const mark of marks) {
    if (mark.ribbon) throw new Error("나무결 fixture에 예상하지 않은 리본이 있습니다.");
    const cosine = Math.cos(mark.angleRadians);
    const sine = Math.sin(mark.angleRadians);
    const extent = Math.max(mark.radiusX, mark.radiusY) * 1.5;
    const minX = Math.max(0, Math.floor((mark.x - extent) * scale));
    const maxX = Math.min(width - 1, Math.ceil((mark.x + extent) * scale));
    const minY = Math.max(0, Math.floor((mark.y - extent) * scale));
    const maxY = Math.min(height - 1, Math.ceil((mark.y + extent) * scale));
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dx = (x + 0.5) / scale - mark.x;
        const dy = (y + 0.5) / scale - mark.y;
        const localX = (dx * cosine + dy * sine) / mark.radiusX;
        const localY = (-dx * sine + dy * cosine) / mark.radiusY;
        let coverage = 0;
        if (mark.texture) {
          if (Math.abs(localX) <= 1 && Math.abs(localY) <= 1) {
            const map = mark.texture.alphaMap;
            coverage = sampleStudioBrushTipAlphaMap(
              map,
              (localX + 1) / 2 * (map.size - 1),
              (localY + 1) / 2 * (map.size - 1),
            );
          }
        } else {
          const radial = Math.hypot(localX, localY);
          if (radial < 1) coverage = mark.falloff ? (1 - radial) ** mark.falloff.exponent : 1;
        }
        const deposit = Math.min(1, coverage * mark.alpha);
        if (deposit <= 0) continue;
        const index = y * width + x;
        const previous = alpha[index] ?? 0;
        alpha[index] = previous + (1 - previous) * deposit;
      }
    }
  }
  const data = new Uint8Array(width * height * 3);
  for (let index = 0; index < alpha.length; index += 1) {
    data.fill(Math.round(255 * (1 - (alpha[index] ?? 0) * opacity)), index * 3, index * 3 + 3);
  }
  return { width, height, channels: 3, data };
}

describe.each([1, 2])("나무결 연속 캐리어 품질 (%s배)", (scale) => {
  it.each([null, 1, 42])("세 점의 빠른 획에서 반복 외곽 요철을 만들지 않는다 (seed=%s)", (seed) => {
    const selection = materializeStudioBrushPackSelection("wood-grain-flow");
    if (!selection) throw new Error("나무결 프리셋이 없습니다.");
    const settings = selection.brushDynamics;
    const dynamics = normalizeStudioBrushDynamicsSettings({ ...settings, seed: seed ?? settings.seed });
    const causal = planStudioCausalDynamicBrushDepositSegmentsV3({
      points: [30, 70, 330, 74, 330, 74],
      pressures: [0.5, 0.5, 0.5],
      speeds: [0, 1.2, 1.2],
      settings: dynamics,
    });
    if (!causal.ok) throw new Error(causal.reason);
    const identity = resolveStudioDynamicBrushMaterialIdentity(selection.runtimeBrushId, selection.catalogId);
    if (!identity) throw new Error("나무결 재료 identity가 없습니다.");
    const plan = planStudioDynamicBrushCoverageMarks({
      dabVariations: [causal.segments.flatMap(({ dabs }) => dabs)],
      materialIdentity: identity,
      strokeOrigins: [{ x: 30, y: 70 }],
      dynamics,
      dynamicSeed: dynamics.seed,
      stroke: "#000000",
      stampGrid: STUDIO_DYNAMIC_BRUSH_CAUSAL_STAMP_GRID,
      markBudget: 262_144,
    });
    if (!plan.ok) throw new Error(plan.reason);
    expect(causal.continuationCapped).toBe(false);
    expect(plan.marks.some((mark) => mark.texture)).toBe(true);
    const frame = rasterizeMarks(plan.marks, scale, selection.defaultOpacity);
    const quality = analyzeStudioLongBrushQuality({
      policy: { kind: "strict-continuous", reason: "나무결의 실제 공유 플래너 픽셀 검증" },
      baseline: { ...frame, data: new Uint8Array(frame.data.length).fill(255) },
      live: frame,
      released: frame,
      settled: frame,
      route: {
        points: Array.from({ length: 300 * scale + 1 }, (_, index) => ({
          x: 30 * scale + index,
          y: 70 * scale + 4 * index / 300,
        })),
        crossSectionRadius: 42,
        cursorIgnoreRadius: 0,
        nominalWidth: selection.defaultWidth,
      },
    });
    expect(quality.frames.settled.centerlineCoverage).toBe(1);
    expect(quality.findings.filter((finding) => finding.level === "error")).toEqual([]);
    expect(quality.ok).toBe(true);
  });
});
