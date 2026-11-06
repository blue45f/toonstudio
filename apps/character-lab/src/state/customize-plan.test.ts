import { describe, expect, it } from "vitest";

import {
  ALL_AVAILABLE_CAPABILITIES,
  CHANNEL_KEYS,
  DEFAULT_ACCESSORY_OFFSET,
  DERIVED_CHANNEL_KEYS,
  FACS_UNITS,
  NO_CUSTOM_CAPABILITIES,
  createDefaultRecipe,
  createKitDefaultRecipe,
  createPresetCatalog,
  customReasonKey,
} from "../contracts";
import { createPrng } from "../shared/prng";
import { stableStringify } from "../shared/stable-json";
import { vocabularyCatalogEntries } from "../testing/recipe-fixtures";

import { materialPresetFor, presetUnavailableReasonKo } from "./apply-plan";
import { addNeutralFacs, layerUnavailableReasonKo, planCustomization } from "./customize-plan";
import { FACS_ANTAGONISTS, relaxAntagonists } from "./facs-antagonists";

import type {
  AccessoryAnchor,
  ChannelColors,
  CharacterRecipe,
  CustomCapabilities,
  ExpressionWeights,
  FacsUnit,
  PartParams,
  PartScope,
  PartShapeValues,
  Surfaces,
  WardrobeLayer,
} from "../contracts";

const BOUNDARY_SEED = 0x5eedfac5;
const METAMORPHIC_SEED = 0x20261106;
const METAMORPHIC_TRIALS = 48;

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

function shuffleRecord<K extends string, V>(
  record: Readonly<Partial<Record<K, V>>>,
  shuffle: <T>(items: T[]) => T[],
): Partial<Record<K, V>> {
  const keys = shuffle(Object.keys(record) as K[]);
  const out: Partial<Record<K, V>> = {};
  for (const key of keys) {
    out[key] = record[key];
  }
  return out;
}

describe("state/customize-plan & facs-antagonists", () => {
  it("addNeutralFacs는 길항 관계가 없는 중립 표정을 더하고 1로 클램프한다", () => {
    expect(addNeutralFacs({ browDown: 0.9, mouthSmile: 0.4 }, { browDown: 0.2, eyeSquint: 0.3 })).toEqual({
      browDown: 1,
      mouthSmile: 0.4,
      eyeSquint: 0.3,
    });
  });

  it("addNeutralFacs는 사용자의 명시 표정과 길항 관계인 화풍 중립 표정(예: mouthFrown 활성 시 mouthSmile)을 억제한다", () => {
    expect(addNeutralFacs({ mouthFrown: 0.8 }, { mouthSmile: 0.25, eyeSquint: 0.2 })).toEqual({
      mouthFrown: 0.8,
      eyeSquint: 0.2,
    });
    expect(addNeutralFacs({ browDown: 0.7 }, { browInnerUp: 0.3, browOuterUp: 0.25, mouthSmile: 0.15 })).toEqual({
      browDown: 0.7,
      mouthSmile: 0.15,
    });
    expect(addNeutralFacs({ eyeWide: 0.6 }, { eyeBlinkLeft: 0.2, eyeSquint: 0.3 })).toEqual({
      eyeWide: 0.6,
    });
    expect(addNeutralFacs({ jawOpen: 0.5 }, { mouthPress: 0.4 })).toEqual({
      jawOpen: 0.5,
    });
  });

  it("relaxAntagonists는 대칭 길항 테이블을 따르고 단일 유닛 지정도 지원한다", () => {
    expect(FACS_ANTAGONISTS.mouthSmile).toContain("mouthFrown");
    expect(FACS_ANTAGONISTS.mouthFrown).toContain("mouthSmile");
    expect(relaxAntagonists({ mouthSmile: 0.3, cheekPuff: 0.2 }, "mouthFrown")).toEqual({ cheekPuff: 0.2 });
  });

  it("layerUnavailableReasonKo와 planCustomization은 미지원 층 사유를 한글로 반환한다", () => {
    const catalog = createPresetCatalog(vocabularyCatalogEntries());
    const base = createDefaultRecipe();
    const recipe = {
      ...base,
      wardrobe: { ...base.wardrobe, outer: "top/blazer" as const },
    };
    const caps = {
      ...ALL_AVAILABLE_CAPABILITIES,
      top: { status: "unavailable" as const, reasonKo: "상의 슬롯 미지원" },
    };
    expect(layerUnavailableReasonKo("outer", caps)).toBe("상의 슬롯 미지원");
    const planned = planCustomization({
      recipe,
      capabilities: caps,
      catalog,
      unsupportedSlots: new Set(["top"]),
      presetUnavailableReason: presetUnavailableReasonKo,
      materialPresetFor,
    });
    expect(planned.unsupportedCustom).toEqual([{ kind: "layer", key: "outer", reasonKo: "상의 슬롯 미지원" }]);
  });

  describe("FACS 길항 대칭성 및 다중 조합 검증", () => {
    it("FACS_ANTAGONISTS 그래프는 자기 루프가 없고 모든 쌍에서 엄격히 대칭이다", () => {
      const validUnits = new Set<string>(FACS_UNITS);
      for (const unit of FACS_UNITS) {
        const list = FACS_ANTAGONISTS[unit] ?? [];
        expect(new Set(list).size).toBe(list.length);
        for (const antagonist of list) {
          expect(validUnits.has(antagonist)).toBe(true);
          expect(antagonist).not.toBe(unit);
          const reverse = FACS_ANTAGONISTS[antagonist] ?? [];
          expect(reverse).toContain(unit);
        }
      }

      const nonAntagonistUnits: readonly FacsUnit[] = ["cheekPuff", "noseSneer", "mouthPucker", "mouthFunnel", "tongueOut"];
      for (const unit of nonAntagonistUnits) {
        expect(FACS_ANTAGONISTS[unit]).toBeUndefined();
      }
    });

    it("다중 길항 그룹(눈썹·눈·입·턱)과 비길항 유닛이 역방향 및 복합 입력에서도 정확히 동작한다", () => {
      // browInnerUp 또는 browOuterUp 활성 시 browDown 중립 억제, 비길항 유닛은 보존·합산
      expect(
        addNeutralFacs(
          { browInnerUp: 0.4, cheekPuff: 0.3 },
          { browDown: 0.5, browOuterUp: 0.2, cheekPuff: 0.25, noseSneer: 0.15 },
        ),
      ).toEqual({
        browInnerUp: 0.4,
        browOuterUp: 0.2,
        cheekPuff: 0.55,
        noseSneer: 0.15,
      });

      // eyeBlinkLeft / eyeBlinkRight / eyeSquint 중 하나만 켜져도 eyeWide 중립을 억제한다
      for (const closer of ["eyeBlinkLeft", "eyeBlinkRight", "eyeSquint"] as const) {
        expect(addNeutralFacs({ [closer]: 0.5 }, { eyeWide: 0.4, mouthPucker: 0.2 })).toEqual({
          [closer]: 0.5,
          mouthPucker: 0.2,
        });
      }

      // eyeWide 활성 시 3개의 눈 감기/찡그림 중립을 동시에 억제한다
      expect(
        addNeutralFacs(
          { eyeWide: 0.7 },
          { eyeBlinkLeft: 0.3, eyeBlinkRight: 0.3, eyeSquint: 0.4, mouthFunnel: 0.2, tongueOut: 0.1 },
        ),
      ).toEqual({
        eyeWide: 0.7,
        mouthFunnel: 0.2,
        tongueOut: 0.1,
      });

      // mouthPress 활성 시 jawOpen 중립을 억제하고 단일 적용 시 이중 증폭하지 않는다
      expect(addNeutralFacs({ mouthPress: 0.35, mouthSmile: 0.4 }, { jawOpen: 0.6, mouthSmile: 0.25 })).toEqual({
        mouthSmile: 0.65,
        mouthPress: 0.35,
      });

      // 단일 유닛 문자열 오버로드는 가중치 1 맵과 항상 같은 결과를 낸다
      const fullNeutral: ExpressionWeights = {};
      for (const unit of FACS_UNITS) fullNeutral[unit] = 0.4;
      for (const activeUnit of FACS_UNITS) {
        expect(relaxAntagonists(fullNeutral, activeUnit)).toEqual(relaxAntagonists(fullNeutral, { [activeUnit]: 1 }));
      }
    });
  });

  describe("가중치 경계값 및 비유한·음수 방어 (재현 시드 0x5eedfac5)", () => {
    it("NaN·±Infinity·음수·0·-0·미세 양수(1e-6)·초과 가중치(>1)에서 NaN 누출이나 음수 차감이 발생하지 않는다", () => {
      // 결함 재현 1: base에 NaN이나 +Infinity가 있을 때 결과로 누출되지 않아야 한다
      expect(relaxAntagonists({ mouthSmile: Number.NaN }, {})).toEqual({});
      expect(
        relaxAntagonists(
          {
            mouthSmile: Number.POSITIVE_INFINITY,
            browDown: Number.NEGATIVE_INFINITY,
            jawOpen: -0,
            eyeWide: 0,
            cheekPuff: -0.3,
          },
          {},
        ),
      ).toEqual({});

      // 결함 재현 2: active에 NaN·±Infinity·음수·0이 있을 때 유효한 중립 가중치를 억제하지 않는다
      for (const invalidActive of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0.5, -0, 0]) {
        expect(relaxAntagonists({ mouthSmile: 0.5 }, { mouthFrown: invalidActive })).toEqual({ mouthSmile: 0.5 });
      }
      // 미세 양수(1e-6)는 활성 표정이므로 길항 중립을 억제한다
      expect(relaxAntagonists({ mouthSmile: 0.5 }, { mouthFrown: 1e-6 })).toEqual({});

      // 결함 재현 3: 명시 표정의 음수(-0.3)나 NaN이 중립 표정 가중치를 깎거나 NaN으로 오염시키지 않는다
      expect(addNeutralFacs({ mouthSmile: -0.3 }, { mouthSmile: 0.5 })).toEqual({ mouthSmile: 0.5 });
      expect(
        addNeutralFacs(
          {
            mouthSmile: Number.NaN,
            browDown: Number.POSITIVE_INFINITY,
            jawOpen: Number.NEGATIVE_INFINITY,
            eyeWide: -0,
          },
          {
            mouthSmile: 0.4,
            browInnerUp: 0.3,
            jawOpen: 0.25,
            eyeBlinkLeft: 0.2,
          },
        ),
      ).toEqual({
        browInnerUp: 0.3,
        eyeBlinkLeft: 0.2,
        jawOpen: 0.25,
        mouthSmile: 0.4,
      });

      // 경계값 1e-6, 1, >1 클램프 확인
      expect(
        addNeutralFacs(
          { cheekPuff: 1e-6, noseSneer: 1, mouthPucker: 1.4 },
          { cheekPuff: 0, noseSneer: 0.2, tongueOut: 1.8 },
        ),
      ).toEqual({
        cheekPuff: 1e-6,
        noseSneer: 1,
        mouthPucker: 1,
        tongueOut: 1,
      });
    });

    it("시드 0x5eedfac5 경계·비유한 풀 샘플링에서 모든 출력 가중치가 유한한 (0, 1] 범위를 지킨다", () => {
      const prng = createPrng(BOUNDARY_SEED);
      const pool = [
        0,
        -0,
        1e-6,
        0.25,
        0.5,
        0.999999,
        1,
        1.5,
        -1e-6,
        -0.3,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
      ] as const;

      for (let trial = 0; trial < 32; trial += 1) {
        const exp: ExpressionWeights = {};
        const neutral: ExpressionWeights = {};
        for (const unit of FACS_UNITS) {
          if (prng.next() < 0.6) exp[unit] = pool[prng.nextInt(pool.length)];
          if (prng.next() < 0.6) neutral[unit] = pool[prng.nextInt(pool.length)];
        }
        const relaxed = relaxAntagonists(neutral, exp);
        const combined = addNeutralFacs(exp, neutral);
        for (const map of [relaxed, combined]) {
          for (const [key, val] of Object.entries(map)) {
            expect(FACS_UNITS).toContain(key);
            expect(typeof val).toBe("number");
            expect(Number.isFinite(val)).toBe(true);
            expect(val).toBeGreaterThan(0);
            expect(val).toBeLessThanOrEqual(1);
          }
        }
      }
    });
  });

  describe("SourceCapabilities.custom 누락 및 부분 지원 검증", () => {
    const sampleProportion = {
      headsTall: 6.5,
      legRatio: 0.48,
      armRatio: 0.38,
      shoulderHeads: 1.6,
      headWidthRatio: 0.85,
      handScale: 1,
    } as const;

    it("custom이 생략된 경우(v2 엔진)에는 바탕 슬롯 미지원·카탈로그 누락·패키지 비례만 미지원으로 보고한다", () => {
      const catalog = createPresetCatalog(vocabularyCatalogEntries());
      const base = createKitDefaultRecipe();
      const recipe: CharacterRecipe = {
        ...base,
        slots: { ...base.slots, top: "top/tee" },
        colors: { ...base.colors, lip: "#d06070", "top-trim": "#223344" },
        style: { ...base.style, proportion: sampleProportion },
        wardrobe: {
          inner: "top/tee",
          outer: null,
          legwear: "bottom/shorts",
          accessories: [
            { id: "acc-1", presetId: "accessory/glasses", anchor: "face", offset: DEFAULT_ACCESSORY_OFFSET },
            { id: "acc-2", presetId: "accessory/missing-item" as "accessory/glasses", anchor: "head-top", offset: DEFAULT_ACCESSORY_OFFSET },
          ],
        },
        partParams: {
          top: { waistTaper: 0.5, zeroShape: 0 },
          "acc-1": { lensRound: -0.4 },
          "acc-2": { hiddenShape: 0.8 },
        },
        surfaces: {
          top: {
            material: "cloth-silk",
            pattern: { kind: "stripe", scaleCm: 4, angleDeg: 0, ratio: 0.5, inkChannel: "top-trim" },
          },
        },
        hairColor: { gradient: [0.4, 0.9], tipMix: 0.6, accent: "streak" },
      };

      const plannedKit = planCustomization({
        recipe,
        capabilities: ALL_AVAILABLE_CAPABILITIES,
        catalog,
        unsupportedSlots: new Set(),
        presetUnavailableReason: presetUnavailableReasonKo,
        materialPresetFor,
      });

      // custom이 없으면 상속 채널·패턴·헤어 흐름·형태 미지원은 보고하지 않고, 카탈로그에 없는 acc-2만 보고한다
      expect(plannedKit.unsupportedCustom).toEqual([
        { kind: "accessory", key: "acc-2", reasonKo: "카탈로그에 없는 프리셋입니다: accessory/missing-item" },
      ]);
      expect(plannedKit.proportion).toEqual(sampleProportion);
      expect(plannedKit.partMorphWeights).toEqual({
        "acc-1": { "shape:lensRound:-": 0.4 },
        top: { "shape:waistTaper:+": 0.5 },
      });

      // 제작 패키지(package) 소스는 custom이 없어도 비례 목표 미지원을 보고한다
      const packageRecipe: CharacterRecipe = {
        ...recipe,
        source: {
          kind: "package",
          characterId: "hero-01",
          sha256: "a".repeat(64),
        },
      };
      const plannedPkg = planCustomization({
        recipe: packageRecipe,
        capabilities: ALL_AVAILABLE_CAPABILITIES,
        catalog,
        unsupportedSlots: new Set(),
        presetUnavailableReason: presetUnavailableReasonKo,
        materialPresetFor,
      });
      expect(plannedPkg.proportion).toBeNull();
      expect(plannedPkg.unsupportedCustom).toContainEqual({
        kind: "proportion",
        key: "proportion",
        reasonKo: "제작 패키지 소스는 비례 목표를 지원하지 않습니다.",
      });
    });

    it("부분 CustomCapabilities에서 층·앵커·형태(0/비유한 제외)·채널·패턴·헤어 흐름·비례 미지원과 사유 폴백을 정확히 판정한다", () => {
      const catalog = createPresetCatalog(vocabularyCatalogEntries());
      const base = createKitDefaultRecipe();
      const recipe: CharacterRecipe = {
        ...base,
        slots: { ...base.slots, top: "top/tee" },
        colors: { ...base.colors, lip: "#d06070", "top-trim": "#223344", "outer-accent": "#ffaa00" },
        style: { ...base.style, proportion: sampleProportion },
        wardrobe: {
          inner: "top/tee",
          outer: "top/blazer",
          legwear: null,
          accessories: [
            { id: "acc-1", presetId: "accessory/glasses", anchor: "face", offset: DEFAULT_ACCESSORY_OFFSET },
            { id: "acc-2", presetId: "accessory/ribbon", anchor: "hair", offset: DEFAULT_ACCESSORY_OFFSET },
          ],
        },
        partParams: {
          // 0·-0·NaN·±Infinity 형태 값은 선언되지 않았더라도 unsupportedCustom을 발생시키지 않아야 한다
          top: { zShape: 0.4, aShape: -0.6, declaredShape: 0.5, neutralZero: 0, negZero: -0, nanShape: Number.NaN, infShape: Number.POSITIVE_INFINITY },
          // outer 층은 미지원 층이므로 scopeActive가 false가 되어 형태 판정에서 건너뛴다
          outer: { lapelWidth: 0.7 },
          "acc-1": { frameWidth: 0.3, unusedZero: 0 },
          // acc-2는 앵커 미지원으로 visible=false이므로 형태 판정에서 건너뛴다
          "acc-2": { bowSize: 0.5 },
        },
        surfaces: {
          top: {
            material: "cloth-cotton",
            pattern: { kind: "check", scaleCm: 5, angleDeg: 15, ratio: 0.4, inkChannel: "top-trim" },
          },
          bottom: {
            material: "cloth-denim",
            pattern: null,
          },
        },
        hairColor: { gradient: [0.5, 1], tipMix: 0.5, accent: "none" },
      };

      const partialCustom: CustomCapabilities = {
        ...NO_CUSTOM_CAPABILITIES,
        layers: ["inner"],
        anchors: ["face"],
        shapes: {
          top: ["declaredShape"],
        },
        channels: ["lip"],
        patternUv: false,
        hairFlow: false,
        proportion: "unavailable",
        reasonsKo: {
          [customReasonKey("layer", "outer")]: "   ",
          [customReasonKey("anchor", "hair")]: "헤어 앵커 커스텀 사유",
          [customReasonKey("shape", "top")]: "",
          [customReasonKey("channel", "top-trim")]: "상의 단 채널 직접 지정 불가",
          [customReasonKey("patternUv")]: "   ",
          [customReasonKey("hairFlow")]: "헤어 흐름 UV1 미제공",
          [customReasonKey("proportion")]: "",
        },
      };

      const planned = planCustomization({
        recipe,
        capabilities: ALL_AVAILABLE_CAPABILITIES,
        catalog,
        unsupportedSlots: new Set(),
        presetUnavailableReason: presetUnavailableReasonKo,
        materialPresetFor,
        custom: partialCustom,
      });

      expect(planned.partMorphWeights).toEqual({
        top: { "shape:declaredShape:+": 0.5 },
      });
      expect(planned.proportion).toBeNull();
      expect(planned.accessories.map((item) => ({ id: item.id, visible: item.visible }))).toEqual([
        { id: "acc-1", visible: true },
        { id: "acc-2", visible: false },
      ]);

      expect(planned.unsupportedCustom).toEqual([
        { kind: "layer", key: "outer", reasonKo: "이 소스는 아우터 층을 지원하지 않습니다." },
        { kind: "accessory", key: "acc-2", reasonKo: "헤어 앵커 커스텀 사유" },
        { kind: "shape", key: "acc-1/frameWidth", reasonKo: "이 파츠(acc-1)에는 형태 키 frameWidth이(가) 없습니다." },
        { kind: "shape", key: "top/aShape", reasonKo: "이 파츠(top)에는 형태 키 aShape이(가) 없습니다." },
        { kind: "shape", key: "top/zShape", reasonKo: "이 파츠(top)에는 형태 키 zShape이(가) 없습니다." },
        { kind: "channel", key: "top-trim", reasonKo: "상의 단 채널 직접 지정 불가" },
        { kind: "channel", key: "outer-accent", reasonKo: "이 소스는 아우터 포인트 채널을 따로 칠할 수 없습니다." },
        { kind: "surface", key: "top", reasonKo: "이 소스는 패턴용 UV가 없어 무늬를 그릴 수 없습니다." },
        { kind: "hair-color", key: "hairColor", reasonKo: "헤어 흐름 UV1 미제공" },
        { kind: "proportion", key: "proportion", reasonKo: "이 소스는 비례 목표를 지원하지 않습니다." },
      ]);
    });
  });

  describe("키 삽입 순서 불변성·반복 호출 멱등성·입력 불변성 (시드 0x20261106, 48회)", () => {
    it("레시피·표정 맵의 키 순서를 무작위로 섞거나 반복 호출해도 결과가 완전히 같고 입력을 변이시키지 않는다", () => {
      const prng = createPrng(METAMORPHIC_SEED);
      const catalog = createPresetCatalog(vocabularyCatalogEntries());
      const allScopes: readonly PartScope[] = ["hair", "top", "inner", "outer", "bottom", "legwear", "shoes", "accessory", "acc-1", "acc-2"];
      const shapeCandidates = ["alphaWidth", "betaLength", "gammaCurve", "deltaFlare", "epsilonTilt", "zetaPuff"] as const;
      const anchorCandidates: readonly AccessoryAnchor[] = ["head-top", "hair", "face", "ear-l", "ear-r", "neck", "wrist-l", "waist"];
      const layerCandidates: readonly WardrobeLayer[] = ["inner", "outer", "legwear"];

      for (let trial = 0; trial < METAMORPHIC_TRIALS; trial += 1) {
        const base = createKitDefaultRecipe();

        // 1. 표정 및 중립 표정 생성
        const expression: ExpressionWeights = {};
        const neutralFacs: ExpressionWeights = {};
        for (const unit of prng.shuffle([...FACS_UNITS])) {
          if (prng.next() < 0.45) expression[unit] = Math.round(prng.nextRange(-0.2, 1.2) * 100) / 100;
          if (prng.next() < 0.45) neutralFacs[unit] = Math.round(prng.nextRange(0, 1) * 100) / 100;
        }

        // 2. 상속 채널 색상 생성
        const colors: Record<string, string> = { ...base.colors };
        for (const channel of prng.shuffle([...DERIVED_CHANNEL_KEYS])) {
          if (prng.next() < 0.35) {
            const hex = prng.nextInt(0x1000000).toString(16).padStart(6, "0");
            colors[channel] = `#${hex}`;
          }
        }

        // 3. 표면 설정 생성
        const surfaces: Surfaces = {};
        for (const channel of prng.shuffle([...CHANNEL_KEYS])) {
          if (prng.next() < 0.25) {
            const hasPattern = prng.next() < 0.5;
            const inkChannel = channel === "skin" ? "lip" : "skin";
            surfaces[channel] = {
              material: "cloth-cotton",
              pattern: hasPattern
                ? { kind: "stripe", scaleCm: 4, angleDeg: 0, ratio: 0.5, inkChannel }
                : null,
            };
          }
        }

        // 4. 파츠 형태 값 생성 (0 포함)
        const partParams: PartParams = {};
        for (const scope of prng.shuffle([...allScopes])) {
          if (prng.next() < 0.6) {
            const values: PartShapeValues = {};
            for (const shapeName of prng.shuffle([...shapeCandidates])) {
              if (prng.next() < 0.5) {
                const raw = prng.next() < 0.2 ? 0 : Math.round(prng.nextRange(-1, 1) * 100) / 100;
                values[shapeName] = raw;
              }
            }
            partParams[scope] = values;
          }
        }

        const recipe: CharacterRecipe = {
          ...base,
          colors: colors as ChannelColors,
          expression,
          style: {
            ...base.style,
            proportion:
              prng.next() < 0.5
                ? {
                    headsTall: 6.5,
                    legRatio: 0.47,
                    armRatio: 0.39,
                    shoulderHeads: 1.5,
                    headWidthRatio: 0.82,
                    handScale: 1,
                  }
                : null,
            neutralFacs,
          },
          wardrobe: {
            inner: prng.next() < 0.6 ? "top/tee" : null,
            outer: prng.next() < 0.6 ? "top/blazer" : null,
            legwear: prng.next() < 0.6 ? "bottom/shorts" : null,
            accessories: [
              {
                id: "acc-1",
                presetId: "accessory/glasses",
                anchor: anchorCandidates[prng.nextInt(anchorCandidates.length)] ?? "face",
                offset: DEFAULT_ACCESSORY_OFFSET,
              },
              {
                id: "acc-2",
                presetId: "accessory/ribbon",
                anchor: anchorCandidates[prng.nextInt(anchorCandidates.length)] ?? "hair",
                offset: DEFAULT_ACCESSORY_OFFSET,
              },
            ],
          },
          partParams,
          surfaces,
          hairColor: {
            gradient: [0.4, 0.9],
            tipMix: prng.next() < 0.5 ? 0.4 : 0,
            accent: prng.next() < 0.5 ? "streak" : "none",
          },
        };

        const custom: CustomCapabilities | undefined =
          prng.next() < 0.8
            ? {
                channels: prng.shuffle([...DERIVED_CHANNEL_KEYS]).slice(0, 6),
                shapes: {
                  top: prng.shuffle([...shapeCandidates]).slice(0, 3),
                  hair: prng.shuffle([...shapeCandidates]).slice(0, 3),
                  inner: prng.shuffle([...shapeCandidates]).slice(0, 2),
                  "acc-1": prng.shuffle([...shapeCandidates]).slice(0, 2),
                },
                layers: prng.shuffle([...layerCandidates]).slice(0, 2),
                anchors: prng.shuffle([...anchorCandidates]).slice(0, 4),
                patternUv: prng.next() < 0.5,
                hairFlow: prng.next() < 0.5,
                proportion: prng.next() < 0.5 ? "available" : "unavailable",
                reasonsKo: {},
              }
            : undefined;

        // 키 순서를 뒤섞은 복제 레시피 생성
        const shuffledPartParams: PartParams = {};
        for (const scope of prng.shuffle(Object.keys(recipe.partParams) as PartScope[])) {
          const scopeValues = recipe.partParams[scope];
          if (scopeValues !== undefined) {
            shuffledPartParams[scope] = shuffleRecord(scopeValues, (items) => prng.shuffle(items)) as PartShapeValues;
          }
        }
        const shuffledExpression = shuffleRecord(recipe.expression, (items) => prng.shuffle(items));
        const shuffledNeutral = shuffleRecord(recipe.style.neutralFacs, (items) => prng.shuffle(items));
        const shuffledRecipe: CharacterRecipe = {
          ...recipe,
          colors: shuffleRecord(recipe.colors, (items) => prng.shuffle(items)) as ChannelColors,
          expression: shuffledExpression,
          style: {
            ...recipe.style,
            neutralFacs: shuffledNeutral,
          },
          partParams: shuffledPartParams,
          surfaces: shuffleRecord(recipe.surfaces, (items) => prng.shuffle(items)),
        };

        deepFreeze(recipe);
        deepFreeze(shuffledRecipe);
        if (custom) deepFreeze(custom);
        const recipeSnapshotBefore = stableStringify(recipe);
        const customSnapshotBefore = custom ? stableStringify(custom) : "";

        const unsupportedSlots: ReadonlySet<"top" | "hair"> = new Set(prng.next() < 0.25 ? ["hair"] : []);
        const inputA = {
          recipe,
          capabilities: ALL_AVAILABLE_CAPABILITIES,
          catalog,
          unsupportedSlots,
          presetUnavailableReason: presetUnavailableReasonKo,
          materialPresetFor,
          ...(custom ? { custom } : {}),
        };
        const inputB = {
          ...inputA,
          recipe: shuffledRecipe,
        };

        const planA1 = planCustomization(inputA);
        const planA2 = planCustomization(inputA);
        const planB = planCustomization(inputB);

        // 멱등성 및 키 순서 불변성(직렬화 바이트와 키 배열 순서까지 일치)
        expect(planA1).toEqual(planA2);
        expect(planA1).toEqual(planB);
        expect(JSON.stringify(planA1)).toBe(JSON.stringify(planB));

        // FACS 합성 순서 불변성 및 멱등성
        const facsA1 = addNeutralFacs(recipe.expression, recipe.style.neutralFacs);
        const facsA2 = addNeutralFacs(recipe.expression, recipe.style.neutralFacs);
        const facsB = addNeutralFacs(shuffledExpression, shuffledNeutral);
        expect(facsA1).toEqual(facsA2);
        expect(facsA1).toEqual(facsB);
        expect(Object.keys(facsA1)).toEqual(Object.keys(facsB));

        // 입력 불변성 검증
        expect(stableStringify(recipe)).toBe(recipeSnapshotBefore);
        if (custom) expect(stableStringify(custom)).toBe(customSnapshotBefore);
      }
    });
  });
});

