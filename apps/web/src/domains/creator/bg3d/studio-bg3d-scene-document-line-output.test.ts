/**
 * 선화 출력 설정 정규화와 하위 호환 시험.
 *
 * 새 필드(내부선 억제)는 선택 필드다: 키가 없는 이전 문서는 정규화 결과에도 키가 없어 엄격 저장 왕복을 그대로
 * 통과하고 "꺼짐"으로 렌더링된다. 값이 있으면 저장·불러오기·컷 덮어쓰기·사용자 프리셋을 모두 거친다.
 */
import { describe, expect, it } from "vitest";

import {
  STUDIO_BG3D_LT_BUILT_IN_PRESETS,
  STUDIO_BG3D_LT_PRESET_PAYLOAD_KIND,
  STUDIO_BG3D_LT_PRESET_PAYLOAD_VERSION,
  applyStudioBg3dLtPreset,
  parseStudioBg3dLtPresetPayload,
  serializeStudioBg3dLtPresetPayload,
  type StudioBg3dLtPreset,
} from "./studio-bg3d-lt-presets";
import {
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  applyStudioBg3dShot,
  captureStudioBg3dShot,
  normalizeStudioBg3dLineOutputSettings,
  normalizeStudioBg3dSceneDocument,
  normalizeStudioBg3dShotLineOutputOverride,
  parseStudioBg3dSceneDocument,
  serializeStudioBg3dSceneDocument,
  type StudioBg3dLineOutputSettings,
  type StudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";
import {
  STUDIO_BG3D_INTERIOR_SUPPRESSION_DEFAULT_STRENGTH,
  resolveStudioBg3dInteriorSuppression,
  studioBg3dLineNeedsDepth,
} from "./studio-bg3d-scene-document-types";

const LEGACY_LINE_KEYS = [
  "enabled",
  "layerType",
  "color",
  "widthPx",
  "strength",
  "accuracy",
  "scaleAwareAccuracy",
  "exteriorOutlineStrength",
  "depthEnabled",
  "depthStrength",
  "depthOutlineOnly",
  "smoothing",
  "textureLineEnabled",
  "textureLineStrength",
  "creaseAngleDegrees",
  "hiddenLineRemoval",
] as const;

function withLine(line: Record<string, unknown>): Record<string, unknown> {
  const base = JSON.parse(JSON.stringify(DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT)) as {
    output: { line: Record<string, unknown> };
  };
  return { ...base, output: { ...base.output, line: { ...base.output.line, ...line } } };
}

describe("normalizeStudioBg3dLineOutputSettings", () => {
  it("returns the canonical defaults without the optional suppression keys for missing input", () => {
    for (const raw of [undefined, null, 7, "x", [], {}]) {
      const line = normalizeStudioBg3dLineOutputSettings(raw);
      expect(line).toEqual(DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.line);
      expect(Object.keys(line).sort()).toEqual([...LEGACY_LINE_KEYS].sort());
    }
  });

  it("keeps the previous field bounds, rounding of enums, and color canonicalization", () => {
    const line = normalizeStudioBg3dLineOutputSettings({
      enabled: "yes",
      layerType: "mesh",
      color: "#ABCDEF",
      widthPx: 99,
      strength: -3,
      accuracy: 7,
      scaleAwareAccuracy: 1,
      exteriorOutlineStrength: 5,
      depthEnabled: "true",
      depthStrength: Number.NaN,
      depthOutlineOnly: null,
      smoothing: 0.4,
      textureLineEnabled: false,
      textureLineStrength: 2,
      creaseAngleDegrees: 400,
      hiddenLineRemoval: false,
    });
    expect(line).toMatchObject({
      enabled: true,
      layerType: "raster",
      color: "#abcdef",
      widthPx: 8,
      strength: 0,
      accuracy: 1,
      scaleAwareAccuracy: true,
      exteriorOutlineStrength: 2,
      depthEnabled: false,
      depthStrength: 0.5,
      depthOutlineOnly: true,
      smoothing: 0.4,
      textureLineEnabled: false,
      textureLineStrength: 1,
      creaseAngleDegrees: 180,
      hiddenLineRemoval: false,
    });
    expect(normalizeStudioBg3dLineOutputSettings({ widthPx: 0.01 }).widthPx).toBe(0.25);
    expect(normalizeStudioBg3dLineOutputSettings({ color: "red" }).color).toBe("#000000");
  });

  it("writes the suppression fields only when the input has them and bounds them", () => {
    expect(normalizeStudioBg3dLineOutputSettings({ interiorSuppressionEnabled: true })).toMatchObject({
      interiorSuppressionEnabled: true,
    });
    const onlySwitch = normalizeStudioBg3dLineOutputSettings({ interiorSuppressionEnabled: true });
    expect("interiorSuppressionStrength" in onlySwitch).toBe(false);
    const onlyStrength = normalizeStudioBg3dLineOutputSettings({ interiorSuppressionStrength: 0.3 });
    expect("interiorSuppressionEnabled" in onlyStrength).toBe(false);
    expect(onlyStrength.interiorSuppressionStrength).toBe(0.3);

    expect(
      normalizeStudioBg3dLineOutputSettings({
        interiorSuppressionEnabled: true,
        interiorSuppressionStrength: 3,
      }).interiorSuppressionStrength
    ).toBe(1);
    expect(
      normalizeStudioBg3dLineOutputSettings({ interiorSuppressionStrength: -1 }).interiorSuppressionStrength
    ).toBe(0);
    // 형식이 틀린 값은 기본값으로 바뀐다(엄격 저장은 이 변경을 감지해 거부한다).
    expect(
      normalizeStudioBg3dLineOutputSettings({
        interiorSuppressionEnabled: "yes",
        interiorSuppressionStrength: "high",
      })
    ).toMatchObject({
      interiorSuppressionEnabled: false,
      interiorSuppressionStrength: STUDIO_BG3D_INTERIOR_SUPPRESSION_DEFAULT_STRENGTH,
    });
  });
});

describe("resolveStudioBg3dInteriorSuppression and studioBg3dLineNeedsDepth", () => {
  const base = { depthEnabled: false } as const;

  it("treats a missing field as off", () => {
    expect(resolveStudioBg3dInteriorSuppression({})).toEqual({
      active: false,
      strength: STUDIO_BG3D_INTERIOR_SUPPRESSION_DEFAULT_STRENGTH,
    });
    expect(STUDIO_BG3D_INTERIOR_SUPPRESSION_DEFAULT_STRENGTH).toBe(0.6);
  });

  it("is active only when switched on with a positive strength", () => {
    expect(resolveStudioBg3dInteriorSuppression({ interiorSuppressionEnabled: true })).toEqual({
      active: true,
      strength: 0.6,
    });
    expect(
      resolveStudioBg3dInteriorSuppression({
        interiorSuppressionEnabled: true,
        interiorSuppressionStrength: 0.25,
      })
    ).toEqual({ active: true, strength: 0.25 });
    expect(
      resolveStudioBg3dInteriorSuppression({
        interiorSuppressionEnabled: true,
        interiorSuppressionStrength: 0,
      }).active
    ).toBe(false);
    expect(
      resolveStudioBg3dInteriorSuppression({
        interiorSuppressionEnabled: false,
        interiorSuppressionStrength: 1,
      }).active
    ).toBe(false);
    expect(resolveStudioBg3dInteriorSuppression({ interiorSuppressionStrength: 1 }).active).toBe(false);
  });

  it("asks for a depth capture for depth lines or active suppression, never for hidden-line removal alone", () => {
    expect(studioBg3dLineNeedsDepth({ ...base })).toBe(false);
    expect(studioBg3dLineNeedsDepth({ depthEnabled: true })).toBe(true);
    expect(studioBg3dLineNeedsDepth({ ...base, interiorSuppressionEnabled: true })).toBe(true);
    expect(
      studioBg3dLineNeedsDepth({ ...base, interiorSuppressionEnabled: true, interiorSuppressionStrength: 0 })
    ).toBe(false);
    expect(studioBg3dLineNeedsDepth({ ...base, interiorSuppressionEnabled: false })).toBe(false);
    // 기본 문서(가려진 선 제거 켬)도 깊이를 요구하지 않는다: 기본 캡처가 무거워지지 않는다.
    expect(studioBg3dLineNeedsDepth(DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.line)).toBe(false);
  });
});

describe("normalizeStudioBg3dShotLineOutputOverride", () => {
  it("keeps only the keys that are present and bounds the suppression fields", () => {
    expect(normalizeStudioBg3dShotLineOutputOverride({})).toEqual({});
    expect(normalizeStudioBg3dShotLineOutputOverride(null)).toEqual({});
    expect(
      normalizeStudioBg3dShotLineOutputOverride({
        widthPx: 20,
        interiorSuppressionEnabled: true,
        interiorSuppressionStrength: 2,
        apiKey: "secret",
      })
    ).toEqual({ widthPx: 8, interiorSuppressionEnabled: true, interiorSuppressionStrength: 1 });
    expect(
      normalizeStudioBg3dShotLineOutputOverride({ interiorSuppressionEnabled: 1 })
    ).toEqual({ interiorSuppressionEnabled: false });
  });
});

describe("scene document persistence", () => {
  it("round-trips an old document (no suppression keys) byte for byte", () => {
    const oldJson = JSON.stringify(withLine({}));
    expect(oldJson).not.toContain("interiorSuppression");
    const parsed = parseStudioBg3dSceneDocument(oldJson);
    expect(parsed).not.toBeNull();
    expect(parsed!.output.line).not.toHaveProperty("interiorSuppressionEnabled");
    expect(parsed!.output.line).not.toHaveProperty("interiorSuppressionStrength");
    expect(serializeStudioBg3dSceneDocument(parsed)).toBe(JSON.stringify(parsed));
    expect(serializeStudioBg3dSceneDocument(parsed)).toBe(
      serializeStudioBg3dSceneDocument(DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT)
    );
  });

  it("saves and reloads the new fields", () => {
    const document = normalizeStudioBg3dSceneDocument(
      withLine({ interiorSuppressionEnabled: true, interiorSuppressionStrength: 0.45 })
    );
    expect(document.output.line).toMatchObject({
      interiorSuppressionEnabled: true,
      interiorSuppressionStrength: 0.45,
    });
    const serialized = serializeStudioBg3dSceneDocument(document);
    expect(serialized).toContain('"interiorSuppressionEnabled":true');
    expect(serialized).toContain('"interiorSuppressionStrength":0.45');
    const reloaded = parseStudioBg3dSceneDocument(serialized!);
    expect(reloaded).toEqual(document);
    expect(serializeStudioBg3dSceneDocument(reloaded)).toBe(serialized);
  });

  it("stores a lone switch without inventing a strength", () => {
    const document = normalizeStudioBg3dSceneDocument(withLine({ interiorSuppressionEnabled: true }));
    const serialized = serializeStudioBg3dSceneDocument(document);
    expect(serialized).toContain('"interiorSuppressionEnabled":true');
    expect(serialized).not.toContain("interiorSuppressionStrength");
    expect(parseStudioBg3dSceneDocument(serialized!)).toEqual(document);
  });

  it("rejects non-canonical new values and misspelled keys in strict mode but repairs them leniently", () => {
    const tooStrong = JSON.stringify(withLine({ interiorSuppressionEnabled: true, interiorSuppressionStrength: 1.5 }));
    expect(parseStudioBg3dSceneDocument(tooStrong)).toBeNull();
    expect(serializeStudioBg3dSceneDocument(JSON.parse(tooStrong))).toBeNull();
    expect(
      parseStudioBg3dSceneDocument(JSON.stringify(withLine({ interiorSuppressionEnabled: "true" })))
    ).toBeNull();
    expect(
      parseStudioBg3dSceneDocument(JSON.stringify(withLine({ interiorSuppresionEnabled: true })))
    ).toBeNull();
    expect(
      parseStudioBg3dSceneDocument(JSON.stringify(withLine({ interiorSuppressionStrength: null })))
    ).toBeNull();

    const repaired = normalizeStudioBg3dSceneDocument(JSON.parse(tooStrong));
    expect(repaired.output.line.interiorSuppressionStrength).toBe(1);
    expect(repaired.output.line).not.toHaveProperty("interiorSuppresionEnabled");
  });

  it("keeps the fields through shot capture and lets a shot override them", () => {
    const document = normalizeStudioBg3dSceneDocument(
      withLine({ interiorSuppressionEnabled: true, interiorSuppressionStrength: 0.8 })
    );
    const captured = captureStudioBg3dShot(document, { id: "shot-a", name: "억제 컷" });
    expect(captured?.shots?.[0]?.output?.line).toMatchObject({
      interiorSuppressionEnabled: true,
      interiorSuppressionStrength: 0.8,
    });
    expect(applyStudioBg3dShot(captured, "shot-a")?.output.line).toMatchObject({
      interiorSuppressionEnabled: true,
      interiorSuppressionStrength: 0.8,
    });
    // 문서 전체가 저장·불러오기를 거쳐도 컷의 덮어쓰기가 남는다.
    const reloaded = parseStudioBg3dSceneDocument(serializeStudioBg3dSceneDocument(captured)!);
    expect(reloaded?.shots?.[0]?.output?.line).toMatchObject({ interiorSuppressionEnabled: true });

    const overridden = normalizeStudioBg3dSceneDocument({
      ...document,
      shots: [
        { id: "plain", name: "억제 끔", output: { line: { interiorSuppressionEnabled: false } } },
        { id: "stronger", name: "더 강하게", output: { line: { interiorSuppressionStrength: 1 } } },
        { id: "inherit", name: "문서 설정 그대로", output: { line: { widthPx: 2 } } },
      ],
    });
    expect(applyStudioBg3dShot(overridden, "plain")?.output.line).toMatchObject({
      interiorSuppressionEnabled: false,
      interiorSuppressionStrength: 0.8,
    });
    expect(applyStudioBg3dShot(overridden, "stronger")?.output.line).toMatchObject({
      interiorSuppressionEnabled: true,
      interiorSuppressionStrength: 1,
    });
    expect(applyStudioBg3dShot(overridden, "inherit")?.output.line).toMatchObject({
      widthPx: 2,
      interiorSuppressionEnabled: true,
      interiorSuppressionStrength: 0.8,
    });
    expect(parseStudioBg3dSceneDocument(serializeStudioBg3dSceneDocument(overridden)!)).toEqual(overridden);
  });

  it("applies a shot to an old document without introducing the new keys", () => {
    const old = normalizeStudioBg3dSceneDocument(withLine({}));
    const captured = captureStudioBg3dShot(old, { id: "shot-a", name: "옛 컷" });
    const applied = applyStudioBg3dShot(captured, "shot-a");
    expect(applied?.output.line).not.toHaveProperty("interiorSuppressionEnabled");
    expect(captured?.shots?.[0]?.output?.line).not.toHaveProperty("interiorSuppressionEnabled");
    expect(applied?.output.line).toEqual(old.output.line);
  });
});

describe("LT presets with the new fields", () => {
  function userPreset(line: Partial<StudioBg3dLineOutputSettings>): StudioBg3dLtPreset {
    const source = STUDIO_BG3D_LT_BUILT_IN_PRESETS[1];
    return {
      id: "user.suppression",
      version: 1,
      name: "내부선 억제 프리셋",
      description: "안쪽 선을 줄이고 윤곽 위주로 남기는 개인용 설정입니다.",
      line: { ...source.line, ...line },
      tone: { ...source.tone },
    };
  }

  function payloadOf(preset: StudioBg3dLtPreset): unknown {
    return {
      kind: STUDIO_BG3D_LT_PRESET_PAYLOAD_KIND,
      version: STUDIO_BG3D_LT_PRESET_PAYLOAD_VERSION,
      presets: [preset],
    };
  }

  it("still accepts every built-in preset and user presets saved before the fields existed", () => {
    for (const preset of STUDIO_BG3D_LT_BUILT_IN_PRESETS) {
      expect(preset.line).not.toHaveProperty("interiorSuppressionEnabled");
    }
    const legacy = userPreset({});
    expect(legacy.line).not.toHaveProperty("interiorSuppressionEnabled");
    const serialized = serializeStudioBg3dLtPresetPayload(payloadOf(legacy));
    expect(serialized).not.toBeNull();
    expect(parseStudioBg3dLtPresetPayload(serialized!)?.presets[0]?.line).toEqual(legacy.line);
  });

  it("saves, loads, and applies a preset that turns the suppression on", () => {
    const preset = userPreset({ interiorSuppressionEnabled: true, interiorSuppressionStrength: 0.7 });
    const serialized = serializeStudioBg3dLtPresetPayload(payloadOf(preset));
    expect(serialized).not.toBeNull();
    const parsed = parseStudioBg3dLtPresetPayload(serialized!);
    expect(parsed?.presets[0]?.line).toMatchObject({
      interiorSuppressionEnabled: true,
      interiorSuppressionStrength: 0.7,
    });
    const applied = applyStudioBg3dLtPreset(DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT, "user.suppression", parsed);
    expect(applied?.output.line).toMatchObject({
      interiorSuppressionEnabled: true,
      interiorSuppressionStrength: 0.7,
    });
  });

  it("clears the suppression when a preset without the fields is applied over a document that had it on", () => {
    const withSuppression: StudioBg3dSceneDocument = normalizeStudioBg3dSceneDocument(
      withLine({ interiorSuppressionEnabled: true, interiorSuppressionStrength: 0.9 })
    );
    const applied = applyStudioBg3dLtPreset(withSuppression, STUDIO_BG3D_LT_BUILT_IN_PRESETS[0]!.id);
    expect(applied?.output.line).not.toHaveProperty("interiorSuppressionEnabled");
    expect(applied?.output.line).toEqual(STUDIO_BG3D_LT_BUILT_IN_PRESETS[0]!.line);
  });

  it("rejects preset values outside the contract", () => {
    expect(
      serializeStudioBg3dLtPresetPayload(
        payloadOf(userPreset({ interiorSuppressionEnabled: true, interiorSuppressionStrength: 1.2 }))
      )
    ).toBeNull();
    expect(
      serializeStudioBg3dLtPresetPayload(
        payloadOf(userPreset({ interiorSuppressionEnabled: "yes" as unknown as boolean }))
      )
    ).toBeNull();
  });
});
