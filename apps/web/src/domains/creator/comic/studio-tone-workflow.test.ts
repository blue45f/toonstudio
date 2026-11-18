import { describe, expect, it } from "vitest";

import {
  alignTonePatternsToMaster,
  applyToneAreaQaTintToRgba,
  buildToneAreaQaOverlayPlan,
  computeToneCellPeriodPx,
  moveTonePatternOffset,
  normalizeTonePatternState,
} from "./studio-tone-workflow";

import type { El } from "../studio-element-model";

describe("studio-tone-workflow", () => {
  it("600dpi·60LPI 주기를 정확히 10px로 계산하고 회전 격자 위상을 [0, P)로 주기 래핑한다", () => {
    expect(computeToneCellPeriodPx(60, 600)).toBe(10);

    const initial = normalizeTonePatternState({
      lpi: 60,
      dpi: 600,
      angleDeg: 0,
      patternOffsetX: 2.5,
      patternOffsetY: 7.5,
    });
    expect(initial.periodPx).toBe(10);

    // 주기(10px)의 정수배 이동은 위상이 정확히 원래 자리로 돌아온다.
    const fullCycle = moveTonePatternOffset(initial, 100, -50);
    expect(fullCycle.patternOffsetX).toBeCloseTo(2.5, 4);
    expect(fullCycle.patternOffsetY).toBeCloseTo(7.5, 4);

    // 음수 변위도 [0, 10) 안으로 안전하게 래핑된다.
    const negMove = moveTonePatternOffset(initial, -4, -9);
    expect(negMove.patternOffsetX).toBeCloseTo(8.5, 4);
    expect(negMove.patternOffsetY).toBeCloseTo(8.5, 4);

    // 45° 회전 격자에서 대각선 (√2 * 10, 0) 투영 검증
    const rot45 = normalizeTonePatternState({ lpi: 60, dpi: 600, angleDeg: 45 });
    const shifted45 = moveTonePatternOffset(rot45, Math.SQRT2 * 3, Math.SQRT2 * 3);
    expect(shifted45.patternOffsetX).toBeCloseTo(6, 3);
    expect(shifted45.patternOffsetY).toBeCloseTo(0, 3);
  });

  it("여러 톤 레이어를 마스터 톤의 선수·각도·위상으로 정렬한다", () => {
    const master = normalizeTonePatternState({
      lpi: 65,
      dpi: 600,
      angleDeg: 45,
      patternOffsetX: 3.2,
      patternOffsetY: 1.4,
    });
    const targets = [
      normalizeTonePatternState({ lpi: 50, angleDeg: 30, patternOffsetX: 8 }),
      normalizeTonePatternState({ lpi: 70, angleDeg: 15, patternOffsetY: 5 }),
    ];
    const aligned = alignTonePatternsToMaster(master, targets);
    expect(aligned).toHaveLength(2);
    for (const item of aligned) {
      expect(item.lpi).toBe(65);
      expect(item.angleDeg).toBe(45);
      expect(item.patternOffsetX).toBeCloseTo(master.patternOffsetX, 4);
      expect(item.patternOffsetY).toBeCloseTo(master.patternOffsetY, 4);
    }
  });

  it("View > Show tone area 오버레이 기술자와 모아레 위험 경고를 생성하고 비파괴 QA 틴트를 입힌다", () => {
    const elements: El[] = [
      {
        id: "tone-img-1",
        type: "image",
        src: "data:image/png;base64,AA==",
        x: 50,
        y: 50,
        width: 300,
        height: 300,
        rotation: 0,
        halftone: { dotSize: 10, angle: 0, mode: "mono", strength: 80 },
      },
      {
        id: "tone-img-2",
        type: "image",
        src: "data:image/png;base64,AA==",
        x: 120,
        y: 120,
        width: 260,
        height: 260,
        rotation: 0,
        halftone: { dotSize: 10, angle: 7, mode: "mono", strength: 80 },
      },
      {
        id: "hidden-tone",
        type: "image",
        src: "data:image/png;base64,AA==",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        hidden: true,
        screentone: true,
      },
    ];

    const plan = buildToneAreaQaOverlayPlan(elements, {
      enabled: true,
      tintHex: "#00b4ff",
      opacity: 0.4,
    });

    expect(plan.enabled).toBe(true);
    expect(plan.regions).toHaveLength(2);
    expect(plan.regions[0]?.tintRgba).toBe("rgba(0, 180, 255, 0.4)");
    expect(plan.moireWarnings).toHaveLength(1);
    expect(plan.moireWarnings[0]?.reason).toBe("angle-too-close");

    const disabledPlan = buildToneAreaQaOverlayPlan(elements, { enabled: false });
    expect(disabledPlan.regions).toHaveLength(0);

    // 원본 버퍼를 변이하지 않고 마스크 픽셀만 틴트 합성하는지 확인
    const src = new Uint8Array([255, 255, 255, 255, 255, 255, 255, 255]);
    const mask = new Uint8Array([255, 0]);
    const tinted = applyToneAreaQaTintToRgba(src, mask, { tintHex: "#00b4ff", opacity: 0.5 });
    expect(src[0]).toBe(255);
    expect(tinted[0]).toBe(128); // 255*0.5 + 0*0.5
    expect(tinted[4]).toBe(255); // 마스크 0 픽셀은 그대로 유지
  });
});
