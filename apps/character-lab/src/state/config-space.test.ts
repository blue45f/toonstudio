import { describe, expect, it } from "vitest";

import { ALL_AVAILABLE_CAPABILITIES, CHANNEL_KEYS, LOOK_GROUPS, LOOK_V2_IDENTITY, NO_CUSTOM_CAPABILITIES, createPresetCatalog, mergeLook } from "../contracts";
import { vocabularyCatalogEntries } from "../testing/recipe-fixtures";

import {
  CONTRACT_MAX_CONFIG_CAPABILITIES,
  GARMENT_CHANNEL_KEYS,
  GARMENT_MATERIAL_PRESET_IDS,
  LOOK_CONTINUOUS_AXES,
  LOOK_DISCRETE_AXES,
  LOOK_EXCLUDED_NUMERIC_PATHS,
  LOOK_INTEGER_DISCRETE_PATHS,
  availablePresetCount,
  configCapabilitiesFromCustom,
  configSpaceLedgerMetrics,
  measureConfigSpace,
} from "./config-space";

import type { ConfigSpaceReport } from "./config-space";
import type { CustomCapabilities, SlotCapabilityMap } from "../contracts";

const CATALOG = createPresetCatalog(vocabularyCatalogEntries());
const NO_CUSTOM = configCapabilitiesFromCustom(undefined, { look: false });
const contract = measureConfigSpace({ catalog: CATALOG, capabilities: ALL_AVAILABLE_CAPABILITIES, custom: CONTRACT_MAX_CONFIG_CAPABILITIES });
const v2Engine = measureConfigSpace({ catalog: CATALOG, capabilities: ALL_AVAILABLE_CAPABILITIES, custom: NO_CUSTOM });

/** 외형 12슬롯 어휘 곱(6·6·5·5·5·4·7·6·5·5·4·6 = 453,600,000 — 설계 Q5 v2 실측 ≈ 8.7) */
const SLOTS_LOG10 = Math.log10(453_600_000);

function leaves(value: unknown, path: string, out: Array<{ path: string; value: unknown }>): void {
  if (Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "number")) {
    value.forEach((item, index) => out.push({ path: `${path}.${index}`, value: item }));
  } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) leaves(child, path ? `${path}.${key}` : key, out);
  } else {
    out.push({ path, value });
  }
}

describe("state/config-space: 계약 상한(레시피 v3가 표현하는 공간)", () => {
  it("Q1~Q4: 27채널·범위당 형태 8(합 152)·동시 착용 19·의상 채널 18·재질 7·패턴 6·화풍 81", () => {
    expect(contract).toMatchObject({
      colorRegions: CHANNEL_KEYS.length,
      shapeSlidersMaxPerPart: 8,
      shapeSlidersTotal: 8 * 8 + 11 * 8,
      wornLayers: 7,
      accessorySlots: 12,
      simultaneousWear: 19,
      surfaceChannels: 18,
      surfaceMaterials: 7,
      patternKinds: 6,
      lookContinuous: 41,
      lookDiscrete: 14,
      toonFields: 4,
      proportionAxes: 6,
      neutralFacsAxes: 16,
      styleParams: 41 + 14 + 4 + 6 + 16,
    });
    expect(GARMENT_CHANNEL_KEYS).toHaveLength(18);
    expect(GARMENT_MATERIAL_PRESET_IDS).toEqual(["cloth-cotton", "cloth-denim", "cloth-silk", "leather", "metal", "plastic", "cloth-knit"]);
  });

  it("Q5 이산 조합 log10: 항목별 계산식과 합이 같다", () => {
    const b = contract.discreteLog10Breakdown;
    expect(b.slots).toBeCloseTo(SLOTS_LOG10, 10);
    expect(b.layers).toBeCloseTo(3 * Math.log10(6), 10);
    // 추가 소품 11개 = (소품 6 × 앵커 14 = 84종)의 중복 조합 C(95, 11)
    let binomial = 0;
    for (let i = 1; i <= 11; i += 1) binomial += Math.log10(84 + i) - Math.log10(i);
    expect(b.extraAccessories).toBeCloseTo(binomial, 10);
    expect(b.surfaces).toBeCloseTo(18 * Math.log10(1 + 7 * 7), 10);
    expect(b.hairAccent).toBeCloseTo(Math.log10(3), 10);
    expect(b.toon).toBeCloseTo(Math.log10(36), 10);
    expect(b.look).toBeCloseTo(LOOK_DISCRETE_AXES.reduce((sum, axis) => sum + Math.log10(axis.options), 0), 10);
    expect(contract.discreteLog10).toBeCloseTo(Object.values(b).reduce((sum, value) => sum + value, 0), 10);
    expect(contract.discreteLog10).toBeGreaterThan(60);
  });

  it("Q6 연속 축: 체형·얼굴 24 + 색 81 + 비례 6 + 중립 표정 16 + look 41 + 패턴 54 + 헤어 3 + 형태 152 + 소품 오프셋 77 = 454", () => {
    expect(contract.continuousBreakdown).toEqual({ params: 24, colors: 81, proportion: 6, neutralFacs: 16, look: 41, patterns: 54, hairColor: 3, shapes: 152, accessoryOffsets: 77 });
    expect(contract.continuousAxes).toBe(454);
  });
});

describe("state/config-space: 커스터마이즈 능력이 없는 소스(v2 엔진)", () => {
  it("설계 v2 실측과 같다: 색 8·동시 착용 5(헤어·상·하·신발 + 소품 1)·형태 0·외형 12슬롯 곱 ≈ 8.7", () => {
    expect(v2Engine).toMatchObject({ colorRegions: 8, shapeSlidersMaxPerPart: 0, shapeSlidersTotal: 0, wornLayers: 4, accessorySlots: 1, simultaneousWear: 5, patternKinds: 0, lookContinuous: 0, lookDiscrete: 0 });
    expect(v2Engine.discreteLog10Breakdown.slots).toBeCloseTo(SLOTS_LOG10, 10);
    expect(v2Engine.discreteLog10Breakdown.slots).toBeCloseTo(8.66, 2);
    // 재질은 기본 의상 채널(상의·하의·신발·액세서리)에서 v2 플랜 parts[].materialPreset으로 그려진다
    expect(v2Engine.surfaceChannels).toBe(4);
    expect(v2Engine.discreteLog10Breakdown.surfaces).toBeCloseTo(4 * Math.log10(1 + 7), 10);
    expect(v2Engine.continuousBreakdown).toEqual({ params: 24, colors: 24, proportion: 0, neutralFacs: 16, look: 0, patterns: 0, hairColor: 0, shapes: 0, accessoryOffsets: 0 });
    expect(v2Engine.styleParams).toBe(4 + 16);
  });

  it("계약 상한은 모든 지표에서 v2 엔진 이상이다", () => {
    const flat = (report: ConfigSpaceReport): Record<string, number> => configSpaceLedgerMetrics(report, "x");
    const upper = flat(contract);
    for (const [key, value] of Object.entries(flat(v2Engine))) expect(upper[key], key).toBeGreaterThanOrEqual(value);
  });
});

describe("state/config-space: 능력에 따라 달라진다", () => {
  it("슬롯 unavailable·프리셋 단위 미제공은 고를 수 있는 프리셋에서 빠진다", () => {
    const capabilities: SlotCapabilityMap = {
      ...ALL_AVAILABLE_CAPABILITIES,
      top: { status: "unavailable", reasonKo: "상의 없음" },
      hair: { status: "available", unavailablePresets: { "hair/twin-tail": "키트에 없음", "hair/hime-cut": "" } },
    };
    expect(availablePresetCount(CATALOG, capabilities, "top")).toBe(0);
    expect(availablePresetCount(CATALOG, capabilities, "hair")).toBe(5);
    const report = measureConfigSpace({ catalog: CATALOG, capabilities, custom: CONTRACT_MAX_CONFIG_CAPABILITIES });
    // 상의가 없으면 상의 기반 층(이너·아우터)도 못 입는다: 헤어·하의·신발 + 레그웨어
    expect(report.wornLayers).toBe(4);
    expect(report.discreteLog10Breakdown.slots).toBeCloseTo(SLOTS_LOG10 - Math.log10(5) - Math.log10(7 / 5), 10);
    expect(report.discreteLog10Breakdown.layers).toBeCloseTo(Math.log10(6), 10);
  });

  it("엔진 커스터마이즈 능력 → 측정 능력: 채널·형태 수(범위·소품 인스턴스, 8로 자름)·층·앵커·UV·비례", () => {
    const custom: CustomCapabilities = {
      channels: ["lip", "outer", "outer-trim", "top-trim"],
      shapes: { hair: ["length", "volume", "bangs"], top: ["hem"], "acc-1": ["size", "tilt"], outer: ["a", "b", "c", "d", "e", "f", "g", "h", "i"] },
      layers: ["outer"],
      anchors: ["neck", "ear-l"],
      patternUv: true,
      hairFlow: false,
      proportion: "partial",
      reasonsKo: {},
    };
    const caps = configCapabilitiesFromCustom(custom, { look: true });
    expect(caps).toMatchObject({ channels: custom.channels, shapes: { hair: 3, top: 1, outer: 8 }, accessoryInstanceShapes: 2, layers: ["outer"], anchors: ["neck", "ear-l"], patternUv: true, hairFlow: false, proportion: true, look: true });
    const report = measureConfigSpace({ catalog: CATALOG, capabilities: ALL_AVAILABLE_CAPABILITIES, custom: caps });
    expect(report.colorRegions).toBe(12);
    // 의상 채널: 기본 4 + 아우터·아우터 단·상의 단
    expect(report.surfaceChannels).toBe(7);
    expect(report.wornLayers).toBe(5);
    expect(report.accessorySlots).toBe(12);
    expect(report.shapeSlidersMaxPerPart).toBe(8);
    expect(report.shapeSlidersTotal).toBe(3 + 1 + 8 + 11 * 2);
    expect(configCapabilitiesFromCustom(NO_CUSTOM_CAPABILITIES, { look: false })).toEqual({ ...NO_CUSTOM, channels: [] });
  });
});

describe("state/config-space: look 축 표는 look 값의 실제 모양과 맞는다", () => {
  it("연속 축 표 = look 숫자 값(두 번째 그림자 포함) − 정수 이산 축 − 잡음 시드", () => {
    const maximal = mergeLook(LOOK_V2_IDENTITY, { ramp: { secondShade: { kind: "oklab", dL: -0.3, dHueDeg: 0, chroma: 1 } } });
    const all: Array<{ path: string; value: unknown }> = [];
    leaves(maximal, "", all);
    const excluded = new Set([...LOOK_INTEGER_DISCRETE_PATHS, ...LOOK_EXCLUDED_NUMERIC_PATHS]);
    const counts = Object.fromEntries(LOOK_GROUPS.map((group) => [group, 0])) as Record<string, number>;
    for (const leaf of all) {
      if (typeof leaf.value !== "number" || excluded.has(leaf.path)) continue;
      const group = leaf.path.split(".")[0] ?? "";
      counts[group] = (counts[group] ?? 0) + 1;
    }
    expect(counts).toEqual(LOOK_CONTINUOUS_AXES);
  });

  it("이산 축 표 = v2 항등 look의 숫자 아닌 값(문자열·참거짓·null·배열) + 정수 이산 축", () => {
    const all: Array<{ path: string; value: unknown }> = [];
    leaves(LOOK_V2_IDENTITY, "", all);
    const discrete = all.filter((leaf) => typeof leaf.value !== "number").map((leaf) => leaf.path);
    expect([...discrete, ...LOOK_INTEGER_DISCRETE_PATHS].sort()).toEqual(LOOK_DISCRETE_AXES.map((axis) => axis.path).sort());
    // 강조 채널 부분집합: 27채널에서 4개 이하
    expect(LOOK_DISCRETE_AXES.find((axis) => axis.path === "grade.accentChannels")?.options).toBe(1 + 27 + 351 + 2925 + 17550);
  });
});

describe("state/config-space: 원장 지표", () => {
  it("접두가 붙은 평평한 유한 수이고 log10은 소수 둘째 자리로 반올림한다", () => {
    const metrics = configSpaceLedgerMetrics(contract, "contract");
    expect(Object.keys(metrics).every((key) => key.startsWith("contract."))).toBe(true);
    for (const value of Object.values(metrics)) expect(Number.isFinite(value)).toBe(true);
    expect(metrics["contract.discreteLog10"]).toBe(Math.round(contract.discreteLog10 * 100) / 100);
    expect(metrics["contract.colorRegions"]).toBe(27);
    expect(metrics["contract.simultaneousWear"]).toBe(19);
  });
});
