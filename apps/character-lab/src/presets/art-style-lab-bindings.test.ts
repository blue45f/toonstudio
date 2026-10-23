import { describe, expect, it } from "vitest";

import { BODY_PARAM_KEYS, EYE_FAMILIES, createKitDefaultRecipe, createPresetCatalog, presetSlot, styleFaceBindingSchema } from "../contracts";

import { APPEARANCE_PRESETS } from "./appearance-presets";
import {
  EYE_FAMILY_BINDINGS,
  KIT_BASE_LASH,
  PACKAGE_STYLE_FACE_REASON_KO,
  PROCEDURAL_STYLE_BODY_OFFSETS,
  STYLE_BINDING_SOURCES,
  STYLE_BODY_OFFSET_KEYS,
  buildStyleApplyCommand,
  countStyleFaceBindings,
  defaultStyleFigure,
  mixerStyleBindingFor,
  styleBindingSourceOf,
  styleSourceBinding,
} from "./art-style-lab-bindings";
import { ART_STYLE_PACKS, artStylePack } from "./art-style-packs";

import type { RecipeSource, StyleApplyScope } from "../contracts";

const CATALOG = createPresetCatalog(APPEARANCE_PRESETS);
const PROCEDURAL: RecipeSource = { kind: "procedural" };
const KIT_FEMALE: RecipeSource = createKitDefaultRecipe("female").source;
const KIT_MALE: RecipeSource = createKitDefaultRecipe("male").source;
const PACKAGE: RecipeSource = { kind: "package", characterId: "orion", sha256: "a".repeat(64) };
const ALL_SCOPES: StyleApplyScope = { look: true, proportion: true, face: true, palette: true };
const LOOK_ONLY: StyleApplyScope = { look: true, proportion: false, face: false, palette: false };

/** 설계 §5.3 눈 계열 표의 절차 열 */
const PROCEDURAL_TABLE = {
  "anime-round": { eyes: "eyes/round", irises: "irises/round-large", face: { eyeSize: 0.6 }, neutral: {} },
  "webtoon-almond": { eyes: "eyes/almond", irises: "irises/soft-gradient", face: { eyeSize: 0.3, eyeTilt: 0.15 }, neutral: {} },
  "shounen-sharp": { eyes: "eyes/narrow", irises: "irises/round-small", face: { eyeTilt: 0.5, eyeSize: -0.2 }, neutral: { browDown: 0.2 } },
  "shoujo-sparkle": { eyes: "eyes/wide", irises: "irises/star-highlight", face: { eyeSize: 0.9 }, neutral: {} },
  realistic: { eyes: "eyes/almond", irises: "irises/round-small", face: { eyeSize: -0.4 }, neutral: {} },
  "ink-narrow": { eyes: "eyes/narrow", irises: "irises/round-small", face: { eyeSize: -0.3 }, neutral: {} },
  "sd-dot": { eyes: "eyes/round", irises: "irises/round-large", face: { eyeSize: 1, eyeSpacing: 0.3 }, neutral: {} },
} as const;

describe("presets/art-style-lab-bindings: 눈 계열 표(설계 §5.3)", () => {
  it("절차 열이 표와 같다(눈·눈동자 프리셋·얼굴 값·중립 표정)", () => {
    for (const family of EYE_FAMILIES) {
      const row = PROCEDURAL_TABLE[family];
      const mapping = EYE_FAMILY_BINDINGS[family].procedural;
      expect(mapping.status, family).toBe("available");
      expect(mapping.slots, family).toEqual({ eyes: row.eyes, irises: row.irises });
      expect(mapping.face, family).toEqual(row.face);
      expect(mapping.neutralFacs, family).toEqual(row.neutral);
    }
  });

  it("키트 열: 눈 프리셋은 바꾸지 않고 표의 눈동자(큰 원형·별)만 쓰며 SD 눈은 unavailable이다", () => {
    for (const family of EYE_FAMILIES) {
      const mapping = EYE_FAMILY_BINDINGS[family].kit;
      expect(mapping.slots.eyes, family).toBeUndefined();
    }
    expect(EYE_FAMILY_BINDINGS["anime-round"].kit.slots).toEqual({ irises: "irises/round-large" });
    expect(EYE_FAMILY_BINDINGS["shoujo-sparkle"].kit.slots).toEqual({ irises: "irises/star-highlight" });
    expect(EYE_FAMILY_BINDINGS["webtoon-almond"].kit).toMatchObject({ status: "available", slots: {}, face: {} });
    expect(EYE_FAMILY_BINDINGS["shounen-sharp"].kit.neutralFacs).toEqual({ browDown: 0.2 });
    expect(EYE_FAMILY_BINDINGS["sd-dot"].kit.status).toBe("unavailable");
    expect(EYE_FAMILY_BINDINGS["sd-dot"].kit.reasonKo).toMatch(/SD/u);
  });

  it("매핑이 가리키는 프리셋은 외형 카탈로그에 있고 슬롯이 맞다", () => {
    for (const family of EYE_FAMILIES) {
      for (const source of STYLE_BINDING_SOURCES) {
        const { slots } = EYE_FAMILY_BINDINGS[family][source];
        for (const [slot, presetId] of Object.entries(slots)) {
          if (presetId === undefined) continue;
          expect(CATALOG.get(presetId), `${family}/${source}/${presetId}`).toBeDefined();
          expect(presetSlot(presetId)).toBe(slot);
        }
      }
    }
  });
});

describe("presets/art-style-lab-bindings: 팩 × 소스", () => {
  it("모든 팩 × 소스의 얼굴 바인딩이 계약 스키마를 통과하고 상태가 정직하다(키트 SD만 unavailable)", () => {
    for (const pack of ART_STYLE_PACKS) {
      for (const source of STYLE_BINDING_SOURCES) {
        const binding = styleSourceBinding(pack, source);
        expect(binding.packId).toBe(pack.id);
        expect(binding.eyeFamily).toBe(pack.face.eyeFamily);
        const unavailable = source === "kit" && pack.face.eyeFamily === "sd-dot";
        expect(binding.faceStatus === "unavailable", `${pack.id}/${source}`).toBe(unavailable);
        if (binding.face === null) {
          expect(binding.faceReasonKo).toMatch(/[가-힣]/u);
          continue;
        }
        const parsed = styleFaceBindingSchema.safeParse(binding.face);
        expect(parsed.success, `${pack.id}/${source}`).toBe(true);
        for (const value of Object.values(binding.face.neutralFacs)) {
          expect(value).toBeGreaterThan(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      }
    }
    expect(countStyleFaceBindings(ART_STYLE_PACKS)).toBe(ART_STYLE_PACKS.length * 2 - 1);
  });

  it("키트: 화풍 속눈썹이 베이스(라이너)와 다르면 partial과 사유, 같으면 available이다", () => {
    for (const pack of ART_STYLE_PACKS) {
      if (pack.face.eyeFamily === "sd-dot") continue;
      const binding = styleSourceBinding(pack, "kit");
      if (pack.face.lash === KIT_BASE_LASH) {
        expect(binding.faceStatus, pack.id).toBe("available");
        expect(binding.faceReasonKo).toBeUndefined();
      } else {
        expect(binding.faceStatus, pack.id).toBe("partial");
        expect(binding.faceReasonKo).toMatch(/속눈썹/u);
      }
    }
    // 절차 소스는 속눈썹과 무관하게 available
    for (const pack of ART_STYLE_PACKS) expect(styleSourceBinding(pack, "procedural").faceStatus).toBe("available");
  });

  it("화풍 중립 표정: 로맨스·소녀·SD 절차 소스만 입꼬리를 더하고 키트에는 더하지 않는다(베이스가 이미 굽는다)", () => {
    expect(styleSourceBinding(artStylePack("kr-webtoon-romance"), "procedural").face?.neutralFacs).toEqual({ mouthSmile: 0.15 });
    expect(styleSourceBinding(artStylePack("kr-webtoon-romance"), "kit").face?.neutralFacs).toEqual({});
    expect(styleSourceBinding(artStylePack("jp-shoujo-soft"), "procedural").face?.neutralFacs).toEqual({ mouthSmile: 0.1 });
    expect(styleSourceBinding(artStylePack("sd-chibi"), "procedural").face?.neutralFacs).toEqual({ mouthSmile: 0.2 });
    // 계열 표정(소년 눈 browDown)과 화풍 표정은 더한다 — 액션은 소년 눈 계열이다.
    expect(styleSourceBinding(artStylePack("kr-webtoon-action"), "kit").face?.neutralFacs).toEqual({ browDown: 0.2 });
  });

  it("체형 오프셋은 비례 6축이 맡지 않는 키만 쓰고 범위 안이며, 키트는 비워 두고 이유를 단다", () => {
    const allowed = new Set<string>(STYLE_BODY_OFFSET_KEYS);
    for (const key of STYLE_BODY_OFFSET_KEYS) expect(BODY_PARAM_KEYS as readonly string[]).toContain(key);
    for (const forbidden of ["headSize", "legLength", "armLength", "shoulderWidth", "height"]) expect(allowed.has(forbidden), forbidden).toBe(false);
    for (const pack of ART_STYLE_PACKS) {
      const offsets = PROCEDURAL_STYLE_BODY_OFFSETS[pack.id];
      for (const figure of ["feminine", "masculine"] as const) {
        for (const [key, value] of Object.entries(offsets[figure])) {
          expect(allowed.has(key), `${pack.id}/${figure}/${key}`).toBe(true);
          expect(Math.abs(value ?? 0)).toBeLessThanOrEqual(1);
        }
      }
      expect(styleSourceBinding(pack, "procedural").body).toBe(offsets);
      const kit = styleSourceBinding(pack, "kit");
      expect(kit.body).toEqual({ feminine: {}, masculine: {} });
      expect(kit.bodyNoteKo).toMatch(/키트/u);
    }
  });

  it("결과는 매번 새 얼굴 객체다(호출자가 고쳐도 표가 바뀌지 않는다)", () => {
    const pack = artStylePack("jp-anime-cel");
    const first = styleSourceBinding(pack, "procedural");
    const second = styleSourceBinding(pack, "procedural");
    expect(first.face).not.toBe(second.face);
    expect(first.face).toEqual(second.face);
  });
});

describe("presets/art-style-lab-bindings: 소스·체형 계열", () => {
  it("레시피 소스 → 매핑 소스(제작 패키지는 null), 기본 체형 계열은 키트 베이스를 따른다", () => {
    expect(styleBindingSourceOf(PROCEDURAL)).toBe("procedural");
    expect(styleBindingSourceOf(KIT_FEMALE)).toBe("kit");
    expect(styleBindingSourceOf(PACKAGE)).toBeNull();
    expect(defaultStyleFigure(KIT_FEMALE)).toBe("feminine");
    expect(defaultStyleFigure(KIT_MALE)).toBe("masculine");
    expect(defaultStyleFigure(PROCEDURAL)).toBe("feminine");
  });

  it("섞기 주입 함수: 소스에 맞는 얼굴·체형 계열 오프셋을 주고 제작 패키지는 null이다", () => {
    const pack = artStylePack("jp-shoujo-soft");
    const procedural = mixerStyleBindingFor(PROCEDURAL)(pack, "masculine");
    expect(procedural?.face?.slots).toEqual({ eyes: "eyes/wide", irises: "irises/star-highlight" });
    expect(procedural?.body).toEqual(PROCEDURAL_STYLE_BODY_OFFSETS["jp-shoujo-soft"].masculine);
    expect(mixerStyleBindingFor(KIT_FEMALE)(artStylePack("sd-chibi"), "feminine")).toEqual({ face: null, body: {} });
    expect(mixerStyleBindingFor(PACKAGE)(pack, "feminine")).toBeNull();
  });
});

describe("presets/art-style-lab-bindings: style/apply 명령 조립", () => {
  it("모든 범위: 팩·범위·체형 계열·소스 얼굴 바인딩을 싣는다", () => {
    const pack = artStylePack("kr-webtoon-romance");
    const result = buildStyleApplyCommand({ pack, source: PROCEDURAL, scope: ALL_SCOPES, paletteIndex: { skin: 1, hair: 2 } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.command).toMatchObject({ type: "style/apply", pack, scope: ALL_SCOPES, figure: "feminine", paletteIndex: { skin: 1, hair: 2 } });
    expect(result.command.face).toEqual(styleSourceBinding(pack, "procedural").face);
    expect(result.noticesKo).toEqual([]);
  });

  it("얼굴 범위가 없으면 바인딩을 싣지 않고, 팔레트 범위가 없으면 팔레트 번호도 싣지 않는다", () => {
    const result = buildStyleApplyCommand({ pack: artStylePack("sd-chibi"), source: KIT_MALE, scope: LOOK_ONLY, paletteIndex: { skin: 9 } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.command.face).toBeUndefined();
    expect(result.command.paletteIndex).toBeUndefined();
    expect(result.command.figure).toBe("masculine");
  });

  it("거부: 빈 범위·제작 패키지 얼굴·키트 SD 얼굴·없는 팔레트 번호 — 다른 값으로 바꿔 넣지 않는다", () => {
    const empty = buildStyleApplyCommand({ pack: artStylePack("jp-anime-cel"), source: PROCEDURAL, scope: { look: false, proportion: false, face: false, palette: false } });
    expect(empty).toMatchObject({ ok: false, code: "style-scope-empty" });
    expect(buildStyleApplyCommand({ pack: artStylePack("jp-anime-cel"), source: PACKAGE, scope: ALL_SCOPES })).toEqual({ ok: false, code: "style-face-unavailable", reasonKo: PACKAGE_STYLE_FACE_REASON_KO });
    const sdKit = buildStyleApplyCommand({ pack: artStylePack("sd-chibi"), source: KIT_FEMALE, scope: ALL_SCOPES });
    expect(sdKit).toMatchObject({ ok: false, code: "style-face-unavailable" });
    const badSkin = buildStyleApplyCommand({ pack: artStylePack("ink-wash"), source: PROCEDURAL, scope: { ...LOOK_ONLY, palette: true }, paletteIndex: { skin: 4 } });
    expect(badSkin).toMatchObject({ ok: false, code: "style-palette-index" });
    const badHair = buildStyleApplyCommand({ pack: artStylePack("ink-wash"), source: PROCEDURAL, scope: { ...LOOK_ONLY, palette: true }, paletteIndex: { hair: 1.5 } });
    expect(badHair).toMatchObject({ ok: false, code: "style-palette-index" });
  });

  it("키트 partial(속눈썹)은 명령을 만들고 사유를 알림으로 준다", () => {
    const result = buildStyleApplyCommand({ pack: artStylePack("jp-shoujo-soft"), source: KIT_FEMALE, scope: ALL_SCOPES });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.binding?.faceStatus).toBe("partial");
    expect(result.noticesKo).toHaveLength(1);
    expect(result.noticesKo[0]).toMatch(/속눈썹/u);
    expect(result.command.face?.slots).toEqual({ irises: "irises/star-highlight" });
  });
});
