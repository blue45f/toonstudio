/**
 * 구성 공간 측정기(성공 지표 Q, 설계 §11 — 2026-10-23 S-1). 순수 함수.
 *
 * 다양성의 1차 지표는 완성품 개수가 아니라 **조합·파라미터로 만들 수 있는 구성 공간의 크기**다(설계 K1, 다양성 프로그램 4.5절).
 * 이 모듈은 카탈로그(슬롯별 프리셋)·슬롯 능력 맵·소스 커스터마이즈 능력에서 Q1~Q6을 계산한다. 계약 상수에서 세므로 계약이 바뀌면
 * 값이 따라 바뀌고, `scripts/measure-3d-diversity.mts`가 원장(`docs/studio/3d-diversity-ledger.json`)에 넣어 감소를 막는다.
 *
 * 두 기준을 쓴다:
 * - 계약 상한(`CONTRACT_MAX_CONFIG_CAPABILITIES`): 레시피 v3가 표현·저장할 수 있는 공간(27채널·범위당 형태 8·층 3·앵커 14·패턴·헤어 흐름·비례·look).
 * - 소스 능력(`configCapabilitiesFromCustom`): 엔진이 보고한 `SourceCapabilities.custom`. 없으면(v2 엔진) 커스터마이즈를 그리지 않는 것으로 센다.
 *
 * 세는 규칙(문서와 시험이 이 규칙을 고정한다):
 * - Q1 독립 색 영역 = 기본 8채널 ∪ 소스가 따로 칠하는 상속 채널.
 * - Q2 파츠당 형태 슬라이더 = 그려지는 범위(슬롯·층·추가 소품)의 형태 키 수(범위당 상한 8).
 * - Q3 동시 착용 = 헤어·상의·하의·신발 + 지원하는 층(이너·아우터·레그웨어) / 소품 = 슬롯 1 + 추가 11(앵커가 있을 때).
 * - Q4 화풍 파라미터 = look 연속·이산 축(그릴 때만) + 툰 4필드 + 비례 6축(지원할 때) + 화풍 중립 표정 16(플래너가 표정 morph에 더해 어느 엔진에서도 그린다).
 * - Q5 이산 조합(log10) = 슬롯 프리셋 곱(설계 v2 실측과 같은 방식, '없음'은 세지 않는다) + 층(프리셋 + 없음) + 추가 소품(프리셋×앵커의 중복 조합 ≤ 11)
 *   + 의상 채널 표면(없음 | 재질 × (무늬 없음 | 패턴 종류)) + 헤어 포인트 위치 + look 이산 축 + 툰 4필드. 패턴 두 번째 색 채널 선택은 이미 센 색 영역을 다시 쓰는 것이라 세지 않는다.
 * - Q6 연속 축 = 체형·얼굴 24 + 색 영역×3 + 비례 6 + 중립 표정 16 + look 연속 + 패턴(크기·각도·비율)×표면 채널 + 헤어 흐름 3 + 형태 키 + 추가 소품 오프셋 7×11.
 * - 종이 결 시드(`look.paper.seed`)는 잡음 시드라 축으로 세지 않는다.
 */
import {
  ACCESSORY_ANCHORS,
  APPEARANCE_SLOT_KINDS,
  BASE_CHANNEL_KEYS,
  BODY_PARAM_KEYS,
  CHANNEL_KEYS,
  FACE_PARAM_KEYS,
  FACS_UNITS,
  HAIR_ACCENT_MODES,
  HAIR_SPECULAR_BANDS,
  LINE_METHODS,
  MATERIAL_PRESET_IDS,
  MAX_EXTRA_ACCESSORIES,
  MAX_SHAPES_PER_SCOPE,
  PAPER_KINDS,
  PART_ROLE_CHANNELS,
  PART_SCOPES,
  PATTERN_KINDS,
  PROPORTION_KEYS,
  TONE_KINDS,
  WARDROBE_LAYERS,
  WARDROBE_LAYER_SLOT,
  isAccessoryInstanceId,
} from "../contracts";

import { presetUnavailableReasonKo } from "./apply-plan";

import type {
  AccessoryAnchor,
  ChannelKey,
  CustomCapabilities,
  FixedPartScope,
  LookGroup,
  MaterialPresetId,
  PartRole,
  PresetCatalog,
  SlotCapabilityMap,
  SlotKind,
  WardrobeLayer,
} from "../contracts";

// ---------------------------------------------------------------- 축 표

/**
 * look 연속 축(그룹별). 틴트는 곱(rgb 3)·OKLab(dL·Δh·채도 3) 어느 쪽이든 3축, 선 색은 고정(rgb 3)·어둡게(dL·채도 2) 중 큰 3축,
 * 두 번째 그림자(nullable 틴트)는 있을 때 3축이다. 종이 시드는 축이 아니다. 합계 41(설계 Q4 "look 연속 41"과 같다).
 */
export const LOOK_CONTINUOUS_AXES: Readonly<Record<LookGroup, number>> = Object.freeze({
  ramp: 4, // softness + 두 번째 그림자 틴트 3
  shade: 9, // 피부·헤어·그 외 틴트 각 3
  rim: 6, // edge0·edge1·strength + 색 3
  specular: 4, // size·strength·center·width
  line: 7, // widthMm·depthGain·curvatureGain + 선 색 3 + 내부선 각도
  tone: 6, // cellPerHead·angleDeg·strength + 밴드 3
  paper: 3, // strength·grainPx1080·bleedPx1080
  grade: 2, // saturation·lightness
});

/** look 숫자 값 중 연속 축이 아닌 경로: 정수 이산 축과 잡음 시드(시험이 look 값을 걸어 이 표와 대조한다) */
export const LOOK_INTEGER_DISCRETE_PATHS: readonly string[] = Object.freeze(["line.inner.widthPx"]);
export const LOOK_EXCLUDED_NUMERIC_PATHS: readonly string[] = Object.freeze(["paper.seed"]);
/** 있을 때만 숫자 3개를 갖는 nullable 틴트 경로(v2 항등에서는 null) */
export const LOOK_NULLABLE_TINT_PATHS: readonly string[] = Object.freeze(["ramp.secondShade"]);

/** 강조 채널 부분집합 수(최대 4개, 27채널에서) */
function accentChannelSubsets(): number {
  let total = 0;
  for (let k = 0; k <= 4; k += 1) total += binomial(CHANNEL_KEYS.length, k);
  return total;
}

/** look 이산 축과 선택지 수 */
export const LOOK_DISCRETE_AXES: ReadonlyArray<{ readonly path: string; readonly options: number }> = Object.freeze([
  { path: "ramp.secondShade", options: 3 }, // 없음·곱·OKLab
  { path: "shade.skin.kind", options: 2 },
  { path: "shade.hair.kind", options: 2 },
  { path: "shade.other.kind", options: 2 },
  { path: "specular.hairBand", options: HAIR_SPECULAR_BANDS.length },
  { path: "line.method", options: LINE_METHODS.length },
  { path: "line.color.mode", options: 2 },
  { path: "line.inner.enabled", options: 2 },
  { path: "line.inner.partBoundary", options: 2 },
  { path: "line.inner.widthPx", options: 6 }, // 1~6 px
  { path: "tone.kind", options: TONE_KINDS.length },
  { path: "tone.ink", options: 2 },
  { path: "paper.kind", options: PAPER_KINDS.length },
  { path: "grade.accentChannels", options: accentChannelSubsets() },
]);

/** 툰 4필드(`ShadingProfile.toon`)의 선택지: 램프 2·3·4단, 얼굴 SDF 그림자, 외곽선 none·hull·edge, 림 */
export const TOON_FIELD_OPTIONS: Readonly<Record<"rampSteps" | "faceSdfShadow" | "outline" | "rim", number>> = Object.freeze({ rampSteps: 3, faceSdfShadow: 2, outline: 3, rim: 2 });

/** 의상·소품 역할(표면 재질·패턴을 줄 수 있는 파츠) */
const GARMENT_ROLES: readonly PartRole[] = ["top", "bottom", "shoes", "accessory", "inner", "outer", "legwear", "hair-accessory"];

/** 의상·소품 역할이 쓰는 채널(계약 순서) — 표면을 줄 수 있는 채널 18개 */
export const GARMENT_CHANNEL_KEYS: readonly ChannelKey[] = Object.freeze(
  CHANNEL_KEYS.filter((key) => GARMENT_ROLES.some((role) => PART_ROLE_CHANNELS[role].includes(key))),
);

/** 몸·눈·머리카락 전용 재질(의상 표면에 쓰지 않는다) */
const NON_GARMENT_MATERIALS: ReadonlySet<MaterialPresetId> = new Set(["skin-sss", "eye-wet", "iris", "hair-aniso", "unlit-highlight"]);
/** 의상 표면 재질(면·데님·실크·가죽·금속·플라스틱·니트) */
export const GARMENT_MATERIAL_PRESET_IDS: readonly MaterialPresetId[] = Object.freeze(MATERIAL_PRESET_IDS.filter((id) => !NON_GARMENT_MATERIALS.has(id)));

/** 추가 소품 하나의 오프셋 축(평행이동 3·회전 3·배율 1) */
export const ACCESSORY_OFFSET_AXES = 7;
/** 패턴 하나의 연속 축(크기·각도·비율) */
export const PATTERN_CONTINUOUS_AXES = 3;
/** 헤어 색 흐름 연속 축(그라데이션 시작·끝, 끝 색 섞기) */
export const HAIR_COLOR_CONTINUOUS_AXES = 3;

// ---------------------------------------------------------------- 능력

/** 측정용 소스 능력(형태 키는 이름 대신 개수) */
export interface ConfigSpaceCapabilities {
  /** 따로 칠할 수 있는 상속 채널(기본 8채널은 언제나 칠한다) */
  readonly channels: readonly ChannelKey[];
  /** 고정 범위별 형태 키 수 */
  readonly shapes: Readonly<Partial<Record<FixedPartScope, number>>>;
  /** 추가 소품 인스턴스 하나의 형태 키 수 */
  readonly accessoryInstanceShapes: number;
  readonly layers: readonly WardrobeLayer[];
  readonly anchors: readonly AccessoryAnchor[];
  readonly patternUv: boolean;
  readonly hairFlow: boolean;
  /** 비례 목표(available·partial이면 true) */
  readonly proportion: boolean;
  /** 엔진이 look(화풍 값)을 그리는지(R-3a 이후). false면 툰 4필드만 센다. */
  readonly look: boolean;
}

function capShapes(count: number): number {
  return Math.max(0, Math.min(MAX_SHAPES_PER_SCOPE, Math.floor(count)));
}

/** 계약 상한: 레시피 v3가 저장할 수 있는 모든 축 */
export const CONTRACT_MAX_CONFIG_CAPABILITIES: ConfigSpaceCapabilities = Object.freeze({
  channels: CHANNEL_KEYS,
  shapes: Object.freeze(Object.fromEntries(PART_SCOPES.map((scope) => [scope, MAX_SHAPES_PER_SCOPE]))) as Readonly<Record<FixedPartScope, number>>,
  accessoryInstanceShapes: MAX_SHAPES_PER_SCOPE,
  layers: WARDROBE_LAYERS,
  anchors: ACCESSORY_ANCHORS,
  patternUv: true,
  hairFlow: true,
  proportion: true,
  look: true,
});

/** 엔진이 보고한 커스터마이즈 능력 → 측정용 능력. `custom`이 없으면(v2 엔진) 커스터마이즈를 하나도 그리지 않는 것으로 본다. */
export function configCapabilitiesFromCustom(custom: CustomCapabilities | undefined, options: { readonly look: boolean }): ConfigSpaceCapabilities {
  const shapes: Partial<Record<FixedPartScope, number>> = {};
  let accessoryInstanceShapes = 0;
  for (const [scope, names] of Object.entries(custom?.shapes ?? {})) {
    const count = capShapes(names?.length ?? 0);
    if (isAccessoryInstanceId(scope)) accessoryInstanceShapes = Math.max(accessoryInstanceShapes, count);
    else if ((PART_SCOPES as readonly string[]).includes(scope)) shapes[scope as FixedPartScope] = count;
  }
  return {
    channels: custom?.channels ?? [],
    shapes,
    accessoryInstanceShapes,
    layers: custom?.layers ?? [],
    anchors: custom?.anchors ?? [],
    patternUv: custom?.patternUv ?? false,
    hairFlow: custom?.hairFlow ?? false,
    proportion: custom !== undefined && custom.proportion !== "unavailable",
    look: options.look,
  };
}

// ---------------------------------------------------------------- 보고

export interface ConfigSpaceReport {
  /** Q1 */
  readonly colorRegions: number;
  /** Q2: 그려지는 범위 하나의 최대 형태 키 수, 동시에 쓸 수 있는 형태 키 합 */
  readonly shapeSlidersMaxPerPart: number;
  readonly shapeSlidersTotal: number;
  /** Q3 */
  readonly wornLayers: number;
  readonly accessorySlots: number;
  readonly simultaneousWear: number;
  /** 표면 */
  readonly surfaceChannels: number;
  readonly surfaceMaterials: number;
  readonly patternKinds: number;
  /** Q4 */
  readonly lookContinuous: number;
  readonly lookDiscrete: number;
  readonly toonFields: number;
  readonly proportionAxes: number;
  readonly neutralFacsAxes: number;
  readonly styleParams: number;
  /** Q5 */
  readonly discreteLog10: number;
  readonly discreteLog10Breakdown: Readonly<Record<"slots" | "layers" | "extraAccessories" | "surfaces" | "hairAccent" | "look" | "toon", number>>;
  /** Q6 */
  readonly continuousAxes: number;
  readonly continuousBreakdown: Readonly<Record<"params" | "colors" | "proportion" | "neutralFacs" | "look" | "patterns" | "hairColor" | "shapes" | "accessoryOffsets", number>>;
}

export interface ConfigSpaceInput {
  readonly catalog: PresetCatalog;
  readonly capabilities: SlotCapabilityMap;
  readonly custom: ConfigSpaceCapabilities;
}

/** log10 C(n, k) — 큰 n에서도 넘치지 않게 로그 합으로 */
function log10Binomial(n: number, k: number): number {
  if (k < 0 || k > n) return Number.NEGATIVE_INFINITY;
  let sum = 0;
  for (let i = 1; i <= k; i += 1) sum += Math.log10(n - k + i) - Math.log10(i);
  return sum;
}

/** 작은 n의 C(n, k)(정수 곱셈 — 중간값이 늘 정수다) */
function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i += 1) result = (result * (n - k + i)) / i;
  return Math.round(result);
}

/** 슬롯에서 이 소스가 고를 수 있는 프리셋 수(슬롯 unavailable·프리셋 단위 미제공 제외) */
export function availablePresetCount(catalog: PresetCatalog, capabilities: SlotCapabilityMap, slot: SlotKind): number {
  const capability = capabilities[slot];
  if (capability.status === "unavailable") return 0;
  return catalog.bySlot(slot).filter((entry) => presetUnavailableReasonKo(capability, entry.id) === null).length;
}

/** 형태 범위가 이 소스에서 그려지는 파츠인지(슬롯 프리셋이 있거나 지원하는 층) */
function scopeDrawable(scope: FixedPartScope, counts: Readonly<Record<SlotKind, number>>, layers: ReadonlySet<WardrobeLayer>): boolean {
  if ((WARDROBE_LAYERS as readonly string[]).includes(scope)) {
    const layer = scope as WardrobeLayer;
    return layers.has(layer) && counts[WARDROBE_LAYER_SLOT[layer]] > 0;
  }
  return counts[scope as SlotKind] > 0;
}

export function measureConfigSpace(input: ConfigSpaceInput): ConfigSpaceReport {
  const { catalog, capabilities, custom } = input;
  const counts = Object.fromEntries(APPEARANCE_SLOT_KINDS.map((slot) => [slot, availablePresetCount(catalog, capabilities, slot)])) as Record<SlotKind, number>;
  const layers = new Set(custom.layers.filter((layer) => counts[WARDROBE_LAYER_SLOT[layer]] > 0));

  // Q1 색 영역·표면 채널
  const painted = new Set<ChannelKey>([...BASE_CHANNEL_KEYS, ...custom.channels.filter((key) => (CHANNEL_KEYS as readonly string[]).includes(key))]);
  const colorRegions = painted.size;
  const surfaceChannels = GARMENT_CHANNEL_KEYS.filter((key) => painted.has(key)).length;
  const surfaceMaterials = GARMENT_MATERIAL_PRESET_IDS.length;
  const patternKinds = custom.patternUv ? PATTERN_KINDS.length : 0;

  // Q3 동시 착용
  const baseWear = (["hair", "top", "bottom", "shoes"] as const).filter((slot) => counts[slot] > 0).length;
  const wornLayers = baseWear + layers.size;
  const accessoryPresets = counts.accessory;
  const extraAccessories = accessoryPresets > 0 && custom.anchors.length > 0 ? MAX_EXTRA_ACCESSORIES : 0;
  const accessorySlots = (accessoryPresets > 0 ? 1 : 0) + extraAccessories;

  // Q2 형태 키
  let shapeSlidersMaxPerPart = 0;
  let shapeSlidersTotal = 0;
  for (const scope of PART_SCOPES) {
    if (!scopeDrawable(scope, counts, layers)) continue;
    const count = capShapes(custom.shapes[scope] ?? 0);
    shapeSlidersMaxPerPart = Math.max(shapeSlidersMaxPerPart, count);
    shapeSlidersTotal += count;
  }
  if (extraAccessories > 0) {
    const perInstance = capShapes(custom.accessoryInstanceShapes);
    shapeSlidersMaxPerPart = Math.max(shapeSlidersMaxPerPart, perInstance);
    shapeSlidersTotal += perInstance * extraAccessories;
  }

  // Q4 화풍 파라미터
  const lookContinuous = custom.look ? Object.values(LOOK_CONTINUOUS_AXES).reduce((sum, value) => sum + value, 0) : 0;
  const lookDiscrete = custom.look ? LOOK_DISCRETE_AXES.length : 0;
  const toonFields = Object.keys(TOON_FIELD_OPTIONS).length;
  const proportionAxes = custom.proportion ? PROPORTION_KEYS.length : 0;
  const neutralFacsAxes = FACS_UNITS.length;
  const styleParams = lookContinuous + lookDiscrete + toonFields + proportionAxes + neutralFacsAxes;

  // Q5 이산 조합(log10)
  const slotsLog = APPEARANCE_SLOT_KINDS.reduce((sum, slot) => sum + Math.log10(Math.max(1, counts[slot])), 0);
  const layersLog = [...layers].reduce((sum, layer) => sum + Math.log10(counts[WARDROBE_LAYER_SLOT[layer]] + 1), 0);
  const accessoryTypes = accessoryPresets * custom.anchors.length;
  const extraAccessoriesLog = extraAccessories > 0 && accessoryTypes > 0 ? log10Binomial(accessoryTypes + extraAccessories, extraAccessories) : 0;
  const surfaceOptions = 1 + surfaceMaterials * (custom.patternUv ? PATTERN_KINDS.length + 1 : 1);
  const surfacesLog = surfaceChannels * Math.log10(surfaceOptions);
  const hairAccentLog = custom.hairFlow ? Math.log10(HAIR_ACCENT_MODES.length) : 0;
  const lookLog = custom.look ? LOOK_DISCRETE_AXES.reduce((sum, axis) => sum + Math.log10(axis.options), 0) : 0;
  const toonLog = Object.values(TOON_FIELD_OPTIONS).reduce((sum, options) => sum + Math.log10(options), 0);
  const discreteLog10Breakdown = { slots: slotsLog, layers: layersLog, extraAccessories: extraAccessoriesLog, surfaces: surfacesLog, hairAccent: hairAccentLog, look: lookLog, toon: toonLog };
  const discreteLog10 = Object.values(discreteLog10Breakdown).reduce((sum, value) => sum + value, 0);

  // Q6 연속 축
  const continuousBreakdown = {
    params: BODY_PARAM_KEYS.length + FACE_PARAM_KEYS.length,
    colors: colorRegions * 3,
    proportion: proportionAxes,
    neutralFacs: neutralFacsAxes,
    look: lookContinuous,
    patterns: custom.patternUv ? surfaceChannels * PATTERN_CONTINUOUS_AXES : 0,
    hairColor: custom.hairFlow ? HAIR_COLOR_CONTINUOUS_AXES : 0,
    shapes: shapeSlidersTotal,
    accessoryOffsets: extraAccessories * ACCESSORY_OFFSET_AXES,
  };
  const continuousAxes = Object.values(continuousBreakdown).reduce((sum, value) => sum + value, 0);

  return {
    colorRegions,
    shapeSlidersMaxPerPart,
    shapeSlidersTotal,
    wornLayers,
    accessorySlots,
    simultaneousWear: wornLayers + accessorySlots,
    surfaceChannels,
    surfaceMaterials,
    patternKinds,
    lookContinuous,
    lookDiscrete,
    toonFields,
    proportionAxes,
    neutralFacsAxes,
    styleParams,
    discreteLog10,
    discreteLog10Breakdown,
    continuousAxes,
    continuousBreakdown,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 원장 섹션용 평평한 지표(`<prefix>.<지표>`). log10은 소수 둘째 자리로 반올림한다(결정적 출력). */
export function configSpaceLedgerMetrics(report: ConfigSpaceReport, prefix: string): Record<string, number> {
  const metrics: Record<string, number> = {
    colorRegions: report.colorRegions,
    shapeSlidersMaxPerPart: report.shapeSlidersMaxPerPart,
    shapeSlidersTotal: report.shapeSlidersTotal,
    wornLayers: report.wornLayers,
    accessorySlots: report.accessorySlots,
    simultaneousWear: report.simultaneousWear,
    surfaceChannels: report.surfaceChannels,
    surfaceMaterials: report.surfaceMaterials,
    patternKinds: report.patternKinds,
    lookContinuous: report.lookContinuous,
    lookDiscrete: report.lookDiscrete,
    styleParams: report.styleParams,
    discreteLog10: round2(report.discreteLog10),
    continuousAxes: report.continuousAxes,
  };
  return Object.fromEntries(Object.entries(metrics).map(([key, value]) => [`${prefix}.${key}`, value]));
}
