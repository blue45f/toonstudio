import { describe, expect, it } from "vitest";

import {
  STUDIO_NATURAL_MEDIA_PRESETS,
  getNaturalMediaPreset,
  getNaturalMediaPresetsByCraft,
  planNaturalMediaCrossHatch,
  resolveNaturalMediaPhysicsProfile,
  validateHatchSettings,
  validateNaturalMediaSessionConfig,
  validateNaturalMediaStrokeStyle,
} from "./studio-natural-media-brushes";

describe("STUDIO_NATURAL_MEDIA_PRESETS", () => {
  it("11종의 내추럴 미디어 프리셋이 있다 (p5.brush 표준 전수)", () => {
    expect(STUDIO_NATURAL_MEDIA_PRESETS).toHaveLength(11);
  });

  it("모든 프리셋 id가 고유하다", () => {
    const ids = STUDIO_NATURAL_MEDIA_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("모든 프리셋에 한/영 라벨과 설명이 있다", () => {
    for (const preset of STUDIO_NATURAL_MEDIA_PRESETS) {
      expect(preset.labelKo.length).toBeGreaterThan(0);
      expect(preset.labelEn.length).toBeGreaterThan(0);
      expect(preset.descriptionKo.length).toBeGreaterThan(0);
      expect(preset.brushName.length).toBeGreaterThan(0);
      expect(preset.defaultWeight).toBeGreaterThan(0);
      expect(preset.crafts.length).toBeGreaterThan(0);
    }
  });

  it("p5.brush 내장 브러시 이름과 매핑된다", () => {
    const brushNames = new Set([
      "2B",
      "HB",
      "2H",
      "cpencil",
      "crayon",
      "pastel",
      "pen",
      "rotring",
      "spray",
      "marker",
      "charcoal",
    ]);
    for (const preset of STUDIO_NATURAL_MEDIA_PRESETS) {
      expect(brushNames.has(preset.brushName)).toBe(true);
    }
  });
});

describe("getNaturalMediaPreset", () => {
  it("id로 프리셋을 찾는다", () => {
    const preset = getNaturalMediaPreset("charcoal");
    expect(preset?.labelKo).toBe("목탄");
    expect(preset?.brushName).toBe("charcoal");
  });

  it("없는 id는 undefined를 반환한다", () => {
    // @ts-expect-error 존재하지 않는 id 테스트
    expect(getNaturalMediaPreset("nonexistent")).toBeUndefined();
  });
});

describe("getNaturalMediaPresetsByCraft", () => {
  it("선화용 프리셋을 찾는다", () => {
    const presets = getNaturalMediaPresetsByCraft("lineart");
    expect(presets.length).toBeGreaterThan(0);
    expect(presets.every((p) => p.crafts.includes("lineart"))).toBe(true);
  });

  it("채색용 프리셋에는 마커가 포함된다", () => {
    const presets = getNaturalMediaPresetsByCraft("coloring");
    const ids = presets.map((p) => p.id);
    expect(ids).toContain("marker");
  });
});

describe("validateNaturalMediaSessionConfig", () => {
  it("유효한 설정은 null을 반환한다", () => {
    expect(
      validateNaturalMediaSessionConfig({ canvasWidth: 1024, canvasHeight: 768 }),
    ).toBeNull();
  });

  it("0 이하 크기는 invalid-config", () => {
    expect(
      validateNaturalMediaSessionConfig({ canvasWidth: 0, canvasHeight: 768 }),
    ).toBe("invalid-config");
  });

  it("8192 초과 크기는 invalid-config", () => {
    expect(
      validateNaturalMediaSessionConfig({ canvasWidth: 9000, canvasHeight: 768 }),
    ).toBe("invalid-config");
  });

  it("NaN 크기는 invalid-config", () => {
    expect(
      validateNaturalMediaSessionConfig({
        canvasWidth: Number.NaN,
        canvasHeight: 768,
      }),
    ).toBe("invalid-config");
  });
});

describe("validateNaturalMediaStrokeStyle", () => {
  it("유효한 스타일은 true", () => {
    expect(
      validateNaturalMediaStrokeStyle({ color: [0.2, 0.4, 0.8], weight: 5 }),
    ).toBe(true);
  });

  it("범위 밖 색상은 false", () => {
    expect(
      validateNaturalMediaStrokeStyle({ color: [1.5, 0, 0], weight: 5 }),
    ).toBe(false);
  });

  it("범위 밖 굵기는 false", () => {
    expect(
      validateNaturalMediaStrokeStyle({ color: [0, 0, 0], weight: 0.1 }),
    ).toBe(false);
    expect(
      validateNaturalMediaStrokeStyle({ color: [0, 0, 0], weight: 200 }),
    ).toBe(false);
  });
});

describe("validateHatchSettings", () => {
  it("유효한 해칭 설정은 true", () => {
    expect(validateHatchSettings(10, 45)).toBe(true);
  });

  it("범위 밖 간격은 false", () => {
    expect(validateHatchSettings(1, 45)).toBe(false);
    expect(validateHatchSettings(101, 45)).toBe(false);
  });

  it("범위 밖 각도는 false", () => {
    expect(validateHatchSettings(10, -1)).toBe(false);
    expect(validateHatchSettings(10, 181)).toBe(false);
  });
});

describe("resolveNaturalMediaPhysicsProfile & planNaturalMediaCrossHatch (Wave 12)", () => {
  it("11종 내추럴 미디어 프리셋별 물리 마찰·번짐·필압 감마가 매체 특성을 반영한다", () => {
    const charcoal = resolveNaturalMediaPhysicsProfile("charcoal");
    const rotring = resolveNaturalMediaPhysicsProfile("rotring");
    const marker = resolveNaturalMediaPhysicsProfile("marker");

    expect(charcoal.grainBite01).toBeGreaterThan(rotring.grainBite01 + 0.7);
    expect(charcoal.smudgeSusceptibility01).toBeGreaterThan(rotring.smudgeSusceptibility01 + 0.7);
    expect(marker.inkBleed01).toBeGreaterThan(charcoal.inkBleed01 + 0.5);
    expect(rotring.pressureGamma).toBeGreaterThan(charcoal.pressureGamma);
  });

  it("planNaturalMediaCrossHatch가 명암 농도(toneValue01)에 따라 1~3중 교차 해칭 패스와 입·발필 필압 테이퍼를 생성한다", () => {
    const bounds = { x: 20, y: 30, width: 120, height: 80 };
    const light = planNaturalMediaCrossHatch(bounds, {
      spacingPx: 12,
      angleDeg: 35,
      toneValue01: 0.25,
      handJitter01: 0,
    });
    const deepShadow = planNaturalMediaCrossHatch(bounds, {
      spacingPx: 10,
      angleDeg: 35,
      toneValue01: 0.82,
      handJitter01: 0.1,
    });

    expect(light).toHaveLength(1);
    expect(deepShadow).toHaveLength(3);
    expect(deepShadow[0]!.lines.length).toBeGreaterThan(5);
    for (const line of light[0]!.lines) {
      expect(line.x0).toBeGreaterThanOrEqual(bounds.x - 0.1);
      expect(line.x0).toBeLessThanOrEqual(bounds.x + bounds.width + 0.1);
      expect(line.y0).toBeGreaterThanOrEqual(bounds.y - 0.1);
      expect(line.y0).toBeLessThanOrEqual(bounds.y + bounds.height + 0.1);
      expect(line.midPressure).toBeGreaterThan(line.entryPressure);
      expect(line.midPressure).toBeGreaterThan(line.exitPressure);
    }
  });
});
