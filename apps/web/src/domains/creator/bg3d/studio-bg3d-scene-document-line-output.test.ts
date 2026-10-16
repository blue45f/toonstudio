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
  migrateStudioBg3dSceneDocument,
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

  it("writes the suppression fields only while the switch is on, and drops a default strength", () => {
    const onlySwitch = normalizeStudioBg3dLineOutputSettings({ interiorSuppressionEnabled: true });
    expect(onlySwitch.interiorSuppressionEnabled).toBe(true);
    expect("interiorSuppressionStrength" in onlySwitch).toBe(false);

    // 켜져 있지 않으면 강도는 의미가 없어 쓰지 않는다. 꺼짐도 쓰지 않는다(없음 = 꺼짐).
    for (const off of [
      { interiorSuppressionStrength: 0.3 },
      { interiorSuppressionEnabled: false },
      { interiorSuppressionEnabled: false, interiorSuppressionStrength: 0.9 },
      { interiorSuppressionEnabled: "yes", interiorSuppressionStrength: "high" },
    ]) {
      const line = normalizeStudioBg3dLineOutputSettings(off);
      expect(line, JSON.stringify(off)).not.toHaveProperty("interiorSuppressionEnabled");
      expect(line, JSON.stringify(off)).not.toHaveProperty("interiorSuppressionStrength");
      expect(line).toEqual(DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.line);
    }

    // 기본 강도(0.6)는 없는 것과 같으므로 쓰지 않는다. 기본이 아니면 쓴다.
    expect(
      normalizeStudioBg3dLineOutputSettings({ interiorSuppressionEnabled: true, interiorSuppressionStrength: 0.6 })
    ).not.toHaveProperty("interiorSuppressionStrength");
    expect(
      normalizeStudioBg3dLineOutputSettings({ interiorSuppressionEnabled: true, interiorSuppressionStrength: 0.3 })
        .interiorSuppressionStrength
    ).toBe(0.3);
    expect(
      normalizeStudioBg3dLineOutputSettings({ interiorSuppressionEnabled: true, interiorSuppressionStrength: 3 })
        .interiorSuppressionStrength
    ).toBe(1);
    expect(
      normalizeStudioBg3dLineOutputSettings({ interiorSuppressionEnabled: true, interiorSuppressionStrength: -1 })
        .interiorSuppressionStrength
    ).toBe(0);
    // 켜 두고 강도 형식만 틀리면 기본 강도로 돌아가 키가 없어진다(엄격 저장은 이 변경을 감지해 거부한다).
    expect(
      normalizeStudioBg3dLineOutputSettings({ interiorSuppressionEnabled: true, interiorSuppressionStrength: "high" })
    ).toEqual({ ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.line, interiorSuppressionEnabled: true });
  });

  it("emits keys in the stored order regardless of the order of the input keys (golden JSON)", () => {
    // 저장 문서의 키 순서가 바뀌면 이전 코드가 쓴 문서와 바이트가 달라진다. jsonStructuresEqual 은 순서를 무시하므로
    // 순서는 이 골든 문자열이 지킨다.
    const golden =
      '{"enabled":true,"layerType":"raster","color":"#000000","widthPx":1.75,"strength":0.8,"accuracy":0.75,' +
      '"scaleAwareAccuracy":true,"exteriorOutlineStrength":1,"depthEnabled":false,"depthStrength":0.5,' +
      '"depthOutlineOnly":true,"smoothing":0.5,"textureLineEnabled":true,"textureLineStrength":0.5,' +
      '"creaseAngleDegrees":20,"hiddenLineRemoval":true}';
    expect(JSON.stringify(DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.line)).toBe(golden);
    expect(JSON.stringify(normalizeStudioBg3dLineOutputSettings({}))).toBe(golden);

    const reversed = Object.fromEntries(
      Object.entries(DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.line).reverse()
    );
    expect(JSON.stringify(normalizeStudioBg3dLineOutputSettings(reversed))).toBe(golden);
    expect(
      JSON.stringify(
        normalizeStudioBg3dLineOutputSettings({
          interiorSuppressionStrength: 0.45,
          interiorSuppressionEnabled: true,
          ...reversed,
        })
      )
    ).toBe(`${golden.slice(0, -1)},"interiorSuppressionEnabled":true,"interiorSuppressionStrength":0.45}`);

    // 컷 덮어쓰기도 같은 표 순서를 따른다.
    expect(
      JSON.stringify(
        normalizeStudioBg3dShotLineOutputOverride({
          interiorSuppressionStrength: 0.5,
          hiddenLineRemoval: false,
          widthPx: 2,
          enabled: true,
          interiorSuppressionEnabled: false,
        })
      )
    ).toBe('{"enabled":true,"widthPx":2,"hiddenLineRemoval":false,"interiorSuppressionEnabled":false,"interiorSuppressionStrength":0.5}');
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

  // 롤백 호환: 억제를 켠 적 없는(또는 켰다가 끈) 문서는 이전 코드가 읽을 수 있어야 한다. 이전 코드는 모르는 키가 있는
  // 문서를 엄격 경계에서 거부하므로, 꺼짐·기본 상태에서는 새 키를 저장하지 않는다.
  describe("rollback compatibility: the new keys are written only while the suppression is on", () => {
    const baseline = serializeStudioBg3dSceneDocument(DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT)!;

    it("serializes an off or default setting byte-identically to a document that never had the keys", () => {
      for (const line of [
        {},
        { interiorSuppressionEnabled: false },
        { interiorSuppressionEnabled: false, interiorSuppressionStrength: 0.9 },
        { interiorSuppressionStrength: 0.9 },
      ]) {
        const serialized = serializeStudioBg3dSceneDocument(withLine(line));
        expect(serialized, JSON.stringify(line)).toBe(baseline);
        expect(serialized).not.toContain("interiorSuppression");
      }
      // 켜 두고 강도가 기본(0.6)이면 스위치만 쓴다.
      const defaultStrength = serializeStudioBg3dSceneDocument(
        withLine({ interiorSuppressionEnabled: true, interiorSuppressionStrength: 0.6 })
      )!;
      expect(defaultStrength).toContain('"interiorSuppressionEnabled":true');
      expect(defaultStrength).not.toContain("interiorSuppressionStrength");
    });

    it("writes the keys when the suppression is on (and only then), and a strict reload keeps them", () => {
      const lone = serializeStudioBg3dSceneDocument(withLine({ interiorSuppressionEnabled: true }))!;
      expect(lone).toContain('"interiorSuppressionEnabled":true');
      expect(lone).not.toContain("interiorSuppressionStrength");
      const strong = serializeStudioBg3dSceneDocument(
        withLine({ interiorSuppressionEnabled: true, interiorSuppressionStrength: 0.45 })
      )!;
      expect(strong).toContain('"interiorSuppressionEnabled":true,"interiorSuppressionStrength":0.45');
      expect(serializeStudioBg3dSceneDocument(parseStudioBg3dSceneDocument(strong))).toBe(strong);
    });

    it("accepts the explicit off/default spelling from another writer but never a malformed value", () => {
      const explicitOff = parseStudioBg3dSceneDocument(JSON.stringify(withLine({ interiorSuppressionEnabled: false })));
      expect(explicitOff).toEqual(DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT);
      expect(serializeStudioBg3dSceneDocument(explicitOff)).toBe(baseline);
      const explicitDefault = parseStudioBg3dSceneDocument(
        JSON.stringify(withLine({ interiorSuppressionEnabled: true, interiorSuppressionStrength: 0.6 }))
      );
      expect(explicitDefault?.output.line).toMatchObject({ interiorSuppressionEnabled: true });
      expect(explicitDefault?.output.line).not.toHaveProperty("interiorSuppressionStrength");

      for (const line of [
        { interiorSuppressionEnabled: false, interiorSuppressionStrength: 1.5 },
        { interiorSuppressionEnabled: false, interiorSuppressionStrength: "0.5" },
        { interiorSuppressionEnabled: 0 },
        { interiorSuppressionEnabled: null },
        { interiorSuppressionEnabled: true, interiorSuppressionStrength: Number.NaN },
      ]) {
        expect(parseStudioBg3dSceneDocument(JSON.stringify(withLine(line))), JSON.stringify(line)).toBeNull();
      }
    });

    it("turning the suppression on and back off leaves exactly the bytes of a document that never had it", () => {
      // 편집기의 canonicalSceneDocument 와 같은 경로(migrate → serialize → parse)로 패치를 적용한다.
      const canonical = (document: unknown) => {
        const serialized = serializeStudioBg3dSceneDocument(migrateStudioBg3dSceneDocument(document));
        return serialized ? parseStudioBg3dSceneDocument(serialized) : null;
      };
      const patchLine = (document: StudioBg3dSceneDocument, patch: Record<string, unknown>) => ({
        ...document,
        output: { ...document.output, line: { ...document.output.line, ...patch } },
      });
      const turnedOn = canonical(
        patchLine(DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT, {
          interiorSuppressionEnabled: true,
          interiorSuppressionStrength: 0.45,
        })
      );
      expect(turnedOn?.output.line).toMatchObject({ interiorSuppressionEnabled: true, interiorSuppressionStrength: 0.45 });
      const turnedOff = canonical(patchLine(turnedOn!, { interiorSuppressionEnabled: false }));
      expect(turnedOff).not.toBeNull();
      expect(turnedOff!.output.line).not.toHaveProperty("interiorSuppressionEnabled");
      expect(turnedOff!.output.line).not.toHaveProperty("interiorSuppressionStrength");
      expect(serializeStudioBg3dSceneDocument(turnedOff)).toBe(baseline);
    });

    it("keeps an explicit off in a shot override, because it overrides a document that has the suppression on", () => {
      const onDocument = normalizeStudioBg3dSceneDocument(
        withLine({ interiorSuppressionEnabled: true, interiorSuppressionStrength: 0.8 })
      );
      const withShot = normalizeStudioBg3dSceneDocument({
        ...onDocument,
        shots: [{ id: "plain", name: "억제 끔", output: { line: { interiorSuppressionEnabled: false } } }],
      });
      const reloaded = parseStudioBg3dSceneDocument(serializeStudioBg3dSceneDocument(withShot)!);
      expect(reloaded?.shots?.[0]?.output?.line).toEqual({ interiorSuppressionEnabled: false });
      expect(applyStudioBg3dShot(reloaded, "plain")?.output.line).not.toHaveProperty("interiorSuppressionEnabled");
    });
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
    // 컷이 억제를 끄면 적용된 문서는 억제가 꺼진 정규 형태(두 키 없음)다.
    expect(applyStudioBg3dShot(overridden, "plain")?.output.line).toEqual(
      DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.line
    );
    expect(overridden.shots?.[0]?.output?.line).toEqual({ interiorSuppressionEnabled: false });
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

describe("calibrated default and preset stroke widths", () => {
  // 선 폭이 픽셀 두께가 되면서(변경 전에는 설정값의 약 2배로 그려졌다) 이전 출력의 인상을 유지하도록 기본·프리셋 폭을
  // 다시 맞췄다. 측정 방법과 표는 docs/features/bg3d-lineart-quality.md 7장. 이 값을 바꾸려면 그 측정부터 다시 한다.
  it("pins the calibrated widths", () => {
    expect(Object.fromEntries(STUDIO_BG3D_LT_BUILT_IN_PRESETS.map((preset) => [preset.id, preset.line.widthPx]))).toEqual({
      "storyboard-background": 3.1,
      "clean-architecture-lineart": 2.1,
      "monochrome-manga": 3.25,
      "rough-pen": 3.05,
      "color-webtoon-underdrawing": 1.75,
    });
    expect(DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.line.widthPx).toBe(1.75);
    // 폭이 없는(아주 오래된) 입력도 같은 기본값으로 정규화되고, 저장된 폭은 그대로 둔다.
    expect(normalizeStudioBg3dLineOutputSettings({}).widthPx).toBe(1.75);
    expect(normalizeStudioBg3dLineOutputSettings({ widthPx: 1 }).widthPx).toBe(1);
    expect(normalizeStudioBg3dShotLineOutputOverride({})).not.toHaveProperty("widthPx");
  });

  it("keeps every calibrated width inside the slider range and on its 0.05 step", () => {
    const widths = [
      DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.line.widthPx,
      ...STUDIO_BG3D_LT_BUILT_IN_PRESETS.map((preset) => preset.line.widthPx),
    ];
    for (const width of widths) {
      expect(width).toBeGreaterThanOrEqual(0.25);
      expect(width).toBeLessThanOrEqual(8);
      expect(Math.abs(width / 0.05 - Math.round(width / 0.05))).toBeLessThan(1e-9);
    }
  });

  it("does not rewrite the width of a document that already stores one (no width-model marker)", () => {
    const stored = normalizeStudioBg3dSceneDocument(withLine({ widthPx: 1 }));
    expect(stored.output.line.widthPx).toBe(1);
    expect(parseStudioBg3dSceneDocument(serializeStudioBg3dSceneDocument(stored)!)?.output.line.widthPx).toBe(1);
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
