import { describe, expect, it } from "vitest";

import { HUMANOID_BONE_NAMES } from "./bones";
import { CHANNEL_FAMILY } from "./color-channels";
import {
  ACCESSORY_ANCHORS,
  ACCESSORY_ANCHOR_BONES,
  ACCESSORY_ANCHOR_LABELS_KO,
  DEFAULT_ACCESSORY_OFFSET,
  DEFAULT_HAIR_COLOR,
  LAYER_CHANNEL_MAP,
  MAX_EXTRA_ACCESSORIES,
  PART_SCOPES,
  WARDROBE_LAYERS,
  WARDROBE_LAYER_ROLE,
  accessoryInstanceSchema,
  createDefaultHairColor,
  createDefaultWardrobe,
  hairColorIsActive,
  hairColorSchema,
  isAccessoryInstanceId,
  isLayerPreset,
  isPartScope,
  layerChannel,
  nextAccessoryInstanceId,
  partParamsSchema,
  styleFaceBindingSchema,
  surfaceSchema,
  wardrobeSchema,
} from "./customization";
import { PART_ROLE_CHANNELS } from "./mesh-data";

describe("contracts/customization", () => {
  it("층: inner·outer는 상의 프리셋, legwear는 하의 프리셋만 입힌다", () => {
    expect([...WARDROBE_LAYERS]).toEqual(["inner", "outer", "legwear"]);
    expect(isLayerPreset("inner", "top/shirt")).toBe(true);
    expect(isLayerPreset("outer", "top/blazer")).toBe(true);
    expect(isLayerPreset("legwear", "bottom/jeans")).toBe(true);
    expect(isLayerPreset("legwear", "top/tee")).toBe(false);
    expect(isLayerPreset("inner", "bottom/jeans")).toBe(false);
    expect(isLayerPreset("inner", "top/Bad")).toBe(false);
    expect(isLayerPreset("inner", 3)).toBe(false);
  });

  it("층 채널 바꾸기: 층 역할이 쓸 수 있는 채널로만 바뀌고 계열 기본 키는 원래 슬롯 계열이다", () => {
    expect(layerChannel("outer", "top")).toBe("outer");
    expect(layerChannel("outer", "top-trim")).toBe("outer-trim");
    expect(layerChannel("outer", "top-accent")).toBe("outer-accent");
    expect(layerChannel("inner", "top-accent")).toBe("top-accent");
    expect(layerChannel("legwear", "bottom-trim")).toBe("legwear");
    expect(layerChannel("inner", "accessory")).toBe("accessory");
    for (const layer of WARDROBE_LAYERS) {
      const role = WARDROBE_LAYER_ROLE[layer];
      for (const [from, to] of Object.entries(LAYER_CHANNEL_MAP[layer])) {
        expect(PART_ROLE_CHANNELS[role], `${layer}: ${from}`).toContain(to);
        expect(CHANNEL_FAMILY[to ?? "skin"]).toBe(CHANNEL_FAMILY[from as keyof typeof CHANNEL_FAMILY]);
      }
    }
  });

  it("앵커 14곳은 한글 라벨과 휴머노이드 본을 가진다", () => {
    expect(ACCESSORY_ANCHORS).toHaveLength(14);
    for (const anchor of ACCESSORY_ANCHORS) {
      expect(ACCESSORY_ANCHOR_LABELS_KO[anchor]).toMatch(/[가-힣]/u);
      expect(HUMANOID_BONE_NAMES).toContain(ACCESSORY_ANCHOR_BONES[anchor]);
    }
  });

  it("소품 인스턴스 id: acc-1~acc-99, 가장 작은 빈 번호를 준다", () => {
    expect(isAccessoryInstanceId("acc-1")).toBe(true);
    expect(isAccessoryInstanceId("acc-99")).toBe(true);
    for (const bad of ["acc-0", "acc-100", "acc-01", "acc-x", "accessory", 1]) expect(isAccessoryInstanceId(bad)).toBe(false);
    expect(nextAccessoryInstanceId([])).toBe("acc-1");
    expect(nextAccessoryInstanceId(["acc-1", "acc-3"])).toBe("acc-2");
    expect(nextAccessoryInstanceId(Array.from({ length: 99 }, (_, i) => `acc-${i + 1}`))).toBeNull();
    expect(MAX_EXTRA_ACCESSORIES).toBe(11);
  });

  it("소품 인스턴스 스키마: 오프셋 범위·앵커 어휘·accessory/* 프리셋", () => {
    const instance = { id: "acc-1", presetId: "accessory/ribbon", anchor: "hair", offset: DEFAULT_ACCESSORY_OFFSET };
    expect(accessoryInstanceSchema.safeParse(instance).success).toBe(true);
    expect(accessoryInstanceSchema.safeParse({ ...instance, offset: { ...instance.offset, scale: 1.6 } }).success).toBe(false);
    expect(accessoryInstanceSchema.safeParse({ ...instance, offset: { ...instance.offset, rDeg: [0, 181, 0] } }).success).toBe(false);
    expect(accessoryInstanceSchema.safeParse({ ...instance, presetId: "top/tee" }).success).toBe(false);
    expect(accessoryInstanceSchema.safeParse({ ...instance, anchor: "tail" }).success).toBe(false);
    expect(Object.isFrozen(DEFAULT_ACCESSORY_OFFSET)).toBe(true);
  });

  it("옷장 기본값은 층 없음·소품 없음이고 스키마를 통과한다", () => {
    const wardrobe = createDefaultWardrobe();
    expect(wardrobe).toEqual({ inner: null, outer: null, legwear: null, accessories: [] });
    expect(wardrobeSchema.safeParse(wardrobe).success).toBe(true);
    expect(createDefaultWardrobe()).not.toBe(wardrobe);
  });

  it("파츠 범위: 고정 8개 + 소품 인스턴스, 범위당 형태 8개·값 −1..1", () => {
    expect(PART_SCOPES).toHaveLength(8);
    for (const scope of [...PART_SCOPES, "acc-4"]) expect(isPartScope(scope)).toBe(true);
    for (const scope of ["skin", "acc-0", "eyes", 5]) expect(isPartScope(scope)).toBe(false);
    expect(partParamsSchema.safeParse({ hair: { length: 1, sideLength: -1 }, "acc-4": { fit: 0.5 } }).success).toBe(true);
    expect(partParamsSchema.safeParse({ hair: { length: 1.01 } }).success).toBe(false);
    expect(partParamsSchema.safeParse({ skin: { length: 0.1 } }).success).toBe(false);
    expect(partParamsSchema.safeParse({ hair: { "9lives": 0.1 } }).success).toBe(false);
    const nine = Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`s${index}`, 0.1]));
    expect(partParamsSchema.safeParse({ hair: nine }).success).toBe(false);
  });

  it("표면: 재질 어휘와 패턴 범위", () => {
    const pattern = { kind: "stripe", scaleCm: 1.2, angleDeg: 45, ratio: 0.3, inkChannel: "top-trim" };
    expect(surfaceSchema.safeParse({ material: "cloth-knit", pattern }).success).toBe(true);
    expect(surfaceSchema.safeParse({ material: "cloth-cotton", pattern: null }).success).toBe(true);
    expect(surfaceSchema.safeParse({ material: "cloth-cotton", pattern: { ...pattern, kind: "paisley" } }).success).toBe(false);
    expect(surfaceSchema.safeParse({ material: "cloth-cotton", pattern: { ...pattern, ratio: 0.99 } }).success).toBe(false);
    expect(surfaceSchema.safeParse({ material: "cloth-cotton", pattern: { ...pattern, inkChannel: "cape" } }).success).toBe(false);
    expect(surfaceSchema.safeParse({ material: "cloth-cotton" }).success).toBe(false);
  });

  it("헤어 색 흐름: 기본값은 v2와 같은 그림(끝 색 섞기 0·포인트 없음), 사본은 독립", () => {
    expect(DEFAULT_HAIR_COLOR).toEqual({ gradient: [0.6, 1], tipMix: 0, accent: "none" });
    expect(hairColorIsActive(DEFAULT_HAIR_COLOR)).toBe(false);
    expect(hairColorIsActive({ ...DEFAULT_HAIR_COLOR, tipMix: 0.1 })).toBe(true);
    expect(hairColorIsActive({ ...DEFAULT_HAIR_COLOR, accent: "inner" })).toBe(true);
    const copy = createDefaultHairColor();
    expect(copy).toEqual(DEFAULT_HAIR_COLOR);
    expect(copy.gradient).not.toBe(DEFAULT_HAIR_COLOR.gradient);
    expect(hairColorSchema.safeParse(copy).success).toBe(true);
    expect(hairColorSchema.safeParse({ ...copy, gradient: [0.7, 0.6] }).success).toBe(false);
  });

  it("화풍 얼굴 바인딩: 얼굴 키·눈/눈동자 슬롯 프리셋·FACS 범위", () => {
    expect(styleFaceBindingSchema.safeParse({ face: { eyeSize: 0.3, eyeTilt: 0.15 }, slots: { eyes: "eyes/almond", irises: "irises/soft-gradient" }, neutralFacs: { browDown: 0.2 } }).success).toBe(true);
    expect(styleFaceBindingSchema.safeParse({ face: { height: 0.3 }, slots: {}, neutralFacs: {} }).success).toBe(false);
    expect(styleFaceBindingSchema.safeParse({ face: {}, slots: { eyes: "irises/cat" }, neutralFacs: {} }).success).toBe(false);
    expect(styleFaceBindingSchema.safeParse({ face: {}, slots: {}, neutralFacs: { browDown: 1.2 } }).success).toBe(false);
  });
});
