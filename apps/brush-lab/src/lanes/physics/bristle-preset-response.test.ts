import { describe, expect, it } from "vitest";

import { PRESET_IDS, presetById } from "../../engine/presets/catalog";

import { unsupportedBristleReason } from "./bristle-dab-synthesis";
import { bristlePresetResponse, PRESET_MAX_HALF_WIDTH_PX, PRESET_MIN_HALF_WIDTH_PX, PRESET_RESPONSE_SAMPLES } from "./bristle-preset-response";

import type { BrushProgram } from "../../engine/presets/program-schema";

describe("프리셋 → 붓털 합성 응답(BL-4a)", () => {
  it("같은 프로그램은 같은 표를 내고(결정적) 같은 객체는 다시 풀지 않는다", () => {
    const a = bristlePresetResponse(presetById("charcoal"));
    const b = bristlePresetResponse(presetById("charcoal"));
    expect(Array.from(a.halfWidthPx.values)).toEqual(Array.from(b.halfWidthPx.values));
    const program = presetById("ink-g-pen");
    expect(bristlePresetResponse(program)).toBe(bristlePresetResponse(program));
    // 복사본(다른 객체)도 같은 값이다.
    const copy: BrushProgram = { ...program };
    expect(Array.from(bristlePresetResponse(copy).halfWidthPx.values)).toEqual(Array.from(bristlePresetResponse(program).halfWidthPx.values));
    expect(a.halfWidthPx.values.length).toBe(PRESET_RESPONSE_SAMPLES);
  });

  it("붓펜·목탄·G펜의 접촉 반폭은 압력 0.15 → 1.0에서 2.5배 이상 늘고 압력에 단조 증가한다", () => {
    for (const id of ["ink-brush-pen", "charcoal", "ink-g-pen"]) {
      const r = bristlePresetResponse(presetById(id));
      expect(r.halfWidthPx.eval(1) / r.halfWidthPx.eval(0.15), id).toBeGreaterThanOrEqual(2.5);
      expect(r.halfWidthPx.isMonotonic(), id).toBe(true);
    }
  });

  it("프리셋마다 접촉 반폭이 다르다: 같은 팁 지름(14 px)의 붓펜과 목탄도 압력 1에서 크게 다르다", () => {
    const brush = bristlePresetResponse(presetById("ink-brush-pen")).halfWidthPx.eval(1);
    const charcoal = bristlePresetResponse(presetById("charcoal")).halfWidthPx.eval(1);
    expect(presetById("ink-brush-pen").tip.sizePx).toBe(presetById("charcoal").tip.sizePx);
    expect(brush / charcoal).toBeGreaterThan(2);
  });

  it("그레인·흐름 동역학: 흑연·종이 프리셋만 그레인 표가 있고 압력이 높을수록 줄며, 흐름 동역학이 있는 프리셋만 흐름 표가 있다", () => {
    const charcoal = bristlePresetResponse(presetById("charcoal"));
    expect(charcoal.grain).not.toBeNull();
    expect(charcoal.grain?.eval(0.15) ?? 0).toBeGreaterThan(charcoal.grain?.eval(1) ?? 1);
    expect(charcoal.flowScale).not.toBeNull();
    expect(bristlePresetResponse(presetById("pencil-hb")).grain).not.toBeNull();
    for (const id of ["ink-brush-pen", "ink-g-pen"]) {
      const r = bristlePresetResponse(presetById(id));
      expect(r.grain, id).toBeNull();
      expect(r.flowScale, id).toBeNull();
    }
  });

  it("팁 경도와 초타원 지수를 그대로 싣는다", () => {
    const g = bristlePresetResponse(presetById("ink-g-pen"));
    expect(g.hardness).toBe(presetById("ink-g-pen").tip.hardness);
    expect(g.shapeExp).toBe(presetById("ink-g-pen").tip.shapeExp);
    expect(bristlePresetResponse(presetById("charcoal")).hardness).toBe(0.4);
  });

  it("압력 외 입력을 쓰는 동역학은 평가하지 않고 사유로 드러낸다(무음 근사 금지)", () => {
    const pen = presetById("ink-g-pen");
    const program: BrushProgram = {
      ...pen,
      strokeDynamics: {
        ...pen.strokeDynamics,
        size: [{ input: "velocity", curve: [1, 0.2], min: 0, max: 1 }],
        flow: [{ input: "tiltAltitude", curve: [0.2, 1], min: 0, max: 1 }],
      },
    };
    const r = bristlePresetResponse(program);
    expect(r.unmappedInputsKo.some((t) => t.includes("크기 동역학") && t.includes("velocity"))).toBe(true);
    expect(r.unmappedInputsKo.some((t) => t.includes("흐름 동역학") && t.includes("tiltAltitude"))).toBe(true);
    // 평가하지 않았으므로 크기 배율은 1이고 흐름 표는 없다.
    expect(r.flowScale).toBeNull();
  });

  it("접촉 반폭이 상한을 넘으면 잘리고 그 사실을 드러낸다", () => {
    const pen = presetById("ink-g-pen");
    const huge: BrushProgram = { ...pen, tip: { ...pen.tip, sizePx: 4000 }, physics: { ...pen.physics, contact: "hertz", baseRadius: 1 } };
    const r = bristlePresetResponse(huge);
    expect(r.halfWidthClamped).toBe(true);
    expect(r.halfWidthPx.max()).toBeLessThanOrEqual(PRESET_MAX_HALF_WIDTH_PX + 1e-3);
    expect(bristlePresetResponse(presetById("ink-g-pen")).halfWidthClamped).toBe(false);
  });

  it("붓털 레인이 받는 모든 카탈로그 프리셋에서 표가 유한하고 범위 안이다", () => {
    let checked = 0;
    for (const id of PRESET_IDS) {
      const program = presetById(id);
      if (unsupportedBristleReason(program) !== null) continue;
      const r = bristlePresetResponse(program);
      for (const v of r.halfWidthPx.values) {
        expect(Number.isFinite(v), id).toBe(true);
        expect(v, id).toBeGreaterThanOrEqual(PRESET_MIN_HALF_WIDTH_PX - 1e-6);
        expect(v, id).toBeLessThanOrEqual(PRESET_MAX_HALF_WIDTH_PX + 1e-3);
      }
      for (const table of [r.grain, r.flowScale]) {
        if (!table) continue;
        for (const v of table.values) {
          expect(v, id).toBeGreaterThanOrEqual(0);
          expect(v, id).toBeLessThanOrEqual(1);
        }
      }
      checked += 1;
    }
    expect(checked).toBeGreaterThan(5);
  });
});
