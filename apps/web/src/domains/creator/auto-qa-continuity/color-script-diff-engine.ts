/**
 * 컷 간 컬러 스크립트 일관성 감사 엔진 (OKLCH 기반).
 * 같은 씬 내 캐릭터 슬롯(머리·눈·의상·소품)별 기준 팔레트와 각 컷 채색 샘플을 비교해
 * 조명/연출 예외(lightingOverride) 없이 임계치를 넘긴 채색 이탈(color-drift)을 적발하고
 * 1클릭 기준색 복원을 제공한다.
 */

export type CharacterColorSlot = "hair" | "eyes" | "outfit" | "accessory";

export const CHARACTER_COLOR_SLOTS: readonly CharacterColorSlot[] = [
  "hair",
  "eyes",
  "outfit",
  "accessory",
];

export const CHARACTER_COLOR_SLOT_LABELS: Readonly<
  Record<CharacterColorSlot, { readonly ko: string; readonly en: string }>
> = {
  hair: { ko: "머리색", en: "Hair" },
  eyes: { ko: "눈동자", en: "Eyes" },
  outfit: { ko: "의상", en: "Outfit" },
  accessory: { ko: "소품·액세서리", en: "Accessory" },
};

export interface OklchColor {
  /** 지각 명도 [0, 1] */
  readonly l: number;
  /** 채도 [0, ~0.4] */
  readonly c: number;
  /** 색조 각도 [0, 360) */
  readonly h: number;
}

export interface OklchDistanceBreakdown {
  readonly deltaE: number;
  readonly deltaL: number;
  readonly deltaC: number;
  readonly deltaH: number;
  readonly hueDiffDeg: number;
}

export interface CharacterSlotSignature {
  readonly characterId: string;
  readonly characterName: string;
  readonly slot: CharacterColorSlot;
  readonly itemLabelKo: string;
  readonly itemLabelEn: string;
  readonly baselineColor: OklchColor;
  /** 슬롯별 허용 ΔE 상한 (미지정 시 씬 기본 임계치 사용) */
  readonly maxDeltaE?: number;
}

export interface SceneColorScriptBaseline {
  readonly sceneId: string;
  readonly sceneTitleKo: string;
  readonly sceneTitleEn: string;
  readonly episodeNumber: number;
  readonly lightingMoodKo: string;
  readonly lightingMoodEn: string;
  readonly defaultDriftThreshold: number;
  readonly signatures: readonly CharacterSlotSignature[];
}

export type LightingOverrideKind =
  | "sunset"
  | "night-shadow"
  | "backlight"
  | "flashback"
  | "magic-fx"
  | "costume-change"
  | "custom";

export interface LightingOverrideException {
  readonly kind: LightingOverrideKind;
  readonly reasonKo: string;
  readonly reasonEn: string;
  /** 예외 적용 시에도 상한을 두고 싶을 때 지정 (미지정 시 채색 이탈 경고 면제) */
  readonly allowedDeltaE?: number;
}

export interface CutSlotColorSample {
  readonly sampleId: string;
  readonly cutNumber: number;
  readonly cutLabelKo?: string;
  readonly cutLabelEn?: string;
  readonly characterId: string;
  readonly slot: CharacterColorSlot;
  readonly sampledColor: OklchColor;
  readonly lightingOverride?: LightingOverrideException | null;
}

export type ColorAuditFindingCode = "color-drift";
export type ColorDriftSeverity = "warning" | "critical";
export type ColorSampleAuditStatus =
  | "matched"
  | "lighting-exempt"
  | "color-drift"
  | "unregistered-slot";

export interface ColorDriftFinding {
  readonly id: string;
  readonly code: ColorAuditFindingCode;
  readonly severity: ColorDriftSeverity;
  readonly sceneId: string;
  readonly sampleId: string;
  readonly cutNumber: number;
  readonly cutLabelKo: string;
  readonly cutLabelEn: string;
  readonly characterId: string;
  readonly characterName: string;
  readonly slot: CharacterColorSlot;
  readonly itemLabelKo: string;
  readonly itemLabelEn: string;
  readonly baselineColor: OklchColor;
  readonly sampledColor: OklchColor;
  readonly deltaE: number;
  readonly deltaL: number;
  readonly deltaC: number;
  readonly deltaH: number;
  readonly hueDiffDeg: number;
  readonly threshold: number;
  readonly summaryKo: string;
  readonly summaryEn: string;
}

export interface ColorSampleAuditEntry {
  readonly sampleId: string;
  readonly cutNumber: number;
  readonly cutLabelKo: string;
  readonly cutLabelEn: string;
  readonly characterId: string;
  readonly characterName: string;
  readonly slot: CharacterColorSlot;
  readonly itemLabelKo: string;
  readonly itemLabelEn: string;
  readonly baselineColor: OklchColor | null;
  readonly sampledColor: OklchColor;
  readonly status: ColorSampleAuditStatus;
  readonly breakdown: OklchDistanceBreakdown | null;
  readonly threshold: number;
  readonly lightingOverride: LightingOverrideException | null;
  readonly finding: ColorDriftFinding | null;
}

export interface SceneColorScriptAuditReport {
  readonly sceneId: string;
  readonly totalSamples: number;
  readonly matchedCount: number;
  readonly lightingExemptCount: number;
  readonly driftCount: number;
  readonly criticalCount: number;
  readonly consistencyScore: number;
  readonly maxDeltaE: number;
  readonly entries: readonly ColorSampleAuditEntry[];
  readonly findings: readonly ColorDriftFinding[];
}

export type CutSlotRestoreTarget =
  | string
  | {
      readonly cutNumber: number;
      readonly characterId: string;
      readonly slot: CharacterColorSlot;
    };

export interface BatchColorRestoreResult {
  readonly samples: readonly CutSlotColorSample[];
  readonly restoredSampleIds: readonly string[];
  readonly restoredCount: number;
}

export const DEFAULT_OKLCH_DRIFT_THRESHOLD = 0.085;
export const CRITICAL_DRIFT_MULTIPLIER = 2.0;

const DEG_TO_RAD = Math.PI / 180;

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** 색조 각도를 [0, 360) 범위로 정규화한다. */
export function normalizeOklchHue(hue: number): number {
  if (!Number.isFinite(hue)) return 0;
  const mod = hue % 360;
  return mod < 0 ? mod + 360 : mod;
}

/** 원형 색조 각도 최단 거리 [0, 180]을 계산한다. */
export function circularHueDiffDegrees(h1: number, h2: number): number {
  const a = normalizeOklchHue(h1);
  const b = normalizeOklchHue(h2);
  const raw = Math.abs(a - b);
  return raw > 180 ? 360 - raw : raw;
}

/**
 * OKLCH 두 색상 사이의 지각 거리 세부 성분을 계산한다.
 * OKLab 유클리드 거리와 동치인 극좌표 공식(ΔL, ΔC, ΔH = 2√(C1·C2)·sin(Δh/2))을 사용해
 * 0°/360° 경계 연속성과 무채색(C≈0) 안정성을 보장한다.
 */
export function computeOklchDistanceBreakdown(
  baseline: OklchColor,
  sample: OklchColor,
): OklchDistanceBreakdown {
  const l1 = clamp(baseline.l, 0, 1);
  const l2 = clamp(sample.l, 0, 1);
  const c1 = Math.max(0, Number.isFinite(baseline.c) ? baseline.c : 0);
  const c2 = Math.max(0, Number.isFinite(sample.c) ? sample.c : 0);

  const deltaL = l2 - l1;
  const deltaC = c2 - c1;
  const hueDiffDeg = circularHueDiffDegrees(baseline.h, sample.h);
  const deltaH = 2 * Math.sqrt(c1 * c2) * Math.sin((hueDiffDeg * DEG_TO_RAD) / 2);
  const deltaE = Math.sqrt(deltaL * deltaL + deltaC * deltaC + deltaH * deltaH);

  return {
    deltaE: roundTo(deltaE, 4),
    deltaL: roundTo(deltaL, 4),
    deltaC: roundTo(deltaC, 4),
    deltaH: roundTo(deltaH, 4),
    hueDiffDeg: roundTo(hueDiffDeg, 1),
  };
}

/** 두 OKLCH 색상 간 지각 거리(ΔE_OK)를 반환한다. */
export function oklchDeltaE(a: OklchColor, b: OklchColor): number {
  return computeOklchDistanceBreakdown(a, b).deltaE;
}

/** CSS oklch() 함수 문자열로 안전하게 직렬화한다. */
export function formatOklchCss(color: OklchColor): string {
  const l = roundTo(clamp(color.l, 0, 1), 3);
  const c = roundTo(Math.max(0, Number.isFinite(color.c) ? color.c : 0), 3);
  const h = roundTo(normalizeOklchHue(color.h), 1);
  return `oklch(${l} ${c} ${h})`;
}

function makeSlotKey(characterId: string, slot: CharacterColorSlot): string {
  return `${characterId}::${slot}`;
}

function buildSignatureMap(
  baseline: SceneColorScriptBaseline,
): ReadonlyMap<string, CharacterSlotSignature> {
  const map = new Map<string, CharacterSlotSignature>();
  for (const sig of baseline.signatures) {
    map.set(makeSlotKey(sig.characterId, sig.slot), sig);
  }
  return map;
}

function describeDriftCauseKo(breakdown: OklchDistanceBreakdown): string {
  if (breakdown.hueDiffDeg >= 25 && breakdown.deltaH >= Math.abs(breakdown.deltaL)) {
    return `색조가 ${breakdown.hueDiffDeg}° 이탈`;
  }
  if (Math.abs(breakdown.deltaL) >= Math.abs(breakdown.deltaC)) {
    return breakdown.deltaL > 0 ? "명도가 기준보다 과도하게 밝아짐" : "명도가 기준보다 과도하게 어두워짐";
  }
  return breakdown.deltaC > 0 ? "채도가 기준보다 과도하게 높아짐" : "채도가 기준보다 과도하게 빠짐";
}

function describeDriftCauseEn(breakdown: OklchDistanceBreakdown): string {
  if (breakdown.hueDiffDeg >= 25 && breakdown.deltaH >= Math.abs(breakdown.deltaL)) {
    return `hue shifted by ${breakdown.hueDiffDeg}°`;
  }
  if (Math.abs(breakdown.deltaL) >= Math.abs(breakdown.deltaC)) {
    return breakdown.deltaL > 0 ? "lightness drifted too bright" : "lightness drifted too dark";
  }
  return breakdown.deltaC > 0 ? "chroma oversaturated" : "chroma washed out";
}

/**
 * 씬 기준 컬러 스크립트 팔레트와 각 컷 샘플을 대조하여 채색 이탈(color-drift)을 감사한다.
 */
export function auditSceneColorScriptConsistency(
  baseline: SceneColorScriptBaseline,
  cutSamples: readonly CutSlotColorSample[],
): SceneColorScriptAuditReport {
  const signatureMap = buildSignatureMap(baseline);
  const fallbackThreshold =
    Number.isFinite(baseline.defaultDriftThreshold) && baseline.defaultDriftThreshold > 0
      ? baseline.defaultDriftThreshold
      : DEFAULT_OKLCH_DRIFT_THRESHOLD;

  const entries: ColorSampleAuditEntry[] = [];
  const findings: ColorDriftFinding[] = [];

  let matchedCount = 0;
  let lightingExemptCount = 0;
  let criticalCount = 0;
  let maxDeltaE = 0;

  for (const sample of cutSamples) {
    const cutLabelKo = sample.cutLabelKo?.trim() || `${sample.cutNumber}컷`;
    const cutLabelEn = sample.cutLabelEn?.trim() || `Cut ${sample.cutNumber}`;
    const signature = signatureMap.get(makeSlotKey(sample.characterId, sample.slot));

    if (!signature) {
      entries.push({
        sampleId: sample.sampleId,
        cutNumber: sample.cutNumber,
        cutLabelKo,
        cutLabelEn,
        characterId: sample.characterId,
        characterName: sample.characterId,
        slot: sample.slot,
        itemLabelKo: CHARACTER_COLOR_SLOT_LABELS[sample.slot].ko,
        itemLabelEn: CHARACTER_COLOR_SLOT_LABELS[sample.slot].en,
        baselineColor: null,
        sampledColor: sample.sampledColor,
        status: "unregistered-slot",
        breakdown: null,
        threshold: fallbackThreshold,
        lightingOverride: sample.lightingOverride ?? null,
        finding: null,
      });
      continue;
    }

    const threshold =
      signature.maxDeltaE !== undefined &&
      Number.isFinite(signature.maxDeltaE) &&
      signature.maxDeltaE > 0
        ? signature.maxDeltaE
        : fallbackThreshold;

    const breakdown = computeOklchDistanceBreakdown(signature.baselineColor, sample.sampledColor);
    if (breakdown.deltaE > maxDeltaE) {
      maxDeltaE = breakdown.deltaE;
    }

    const override = sample.lightingOverride ?? null;
    const isExemptByOverride =
      override !== null &&
      (override.allowedDeltaE === undefined || breakdown.deltaE <= override.allowedDeltaE);

    if (breakdown.deltaE <= threshold) {
      matchedCount += 1;
      entries.push({
        sampleId: sample.sampleId,
        cutNumber: sample.cutNumber,
        cutLabelKo,
        cutLabelEn,
        characterId: signature.characterId,
        characterName: signature.characterName,
        slot: signature.slot,
        itemLabelKo: signature.itemLabelKo,
        itemLabelEn: signature.itemLabelEn,
        baselineColor: signature.baselineColor,
        sampledColor: sample.sampledColor,
        status: "matched",
        breakdown,
        threshold,
        lightingOverride: override,
        finding: null,
      });
      continue;
    }

    if (isExemptByOverride) {
      lightingExemptCount += 1;
      entries.push({
        sampleId: sample.sampleId,
        cutNumber: sample.cutNumber,
        cutLabelKo,
        cutLabelEn,
        characterId: signature.characterId,
        characterName: signature.characterName,
        slot: signature.slot,
        itemLabelKo: signature.itemLabelKo,
        itemLabelEn: signature.itemLabelEn,
        baselineColor: signature.baselineColor,
        sampledColor: sample.sampledColor,
        status: "lighting-exempt",
        breakdown,
        threshold,
        lightingOverride: override,
        finding: null,
      });
      continue;
    }

    const severity: ColorDriftSeverity =
      breakdown.deltaE >= threshold * CRITICAL_DRIFT_MULTIPLIER ? "critical" : "warning";
    if (severity === "critical") {
      criticalCount += 1;
    }

    const finding: ColorDriftFinding = {
      id: `drift:${baseline.sceneId}:${sample.sampleId}`,
      code: "color-drift",
      severity,
      sceneId: baseline.sceneId,
      sampleId: sample.sampleId,
      cutNumber: sample.cutNumber,
      cutLabelKo,
      cutLabelEn,
      characterId: signature.characterId,
      characterName: signature.characterName,
      slot: signature.slot,
      itemLabelKo: signature.itemLabelKo,
      itemLabelEn: signature.itemLabelEn,
      baselineColor: signature.baselineColor,
      sampledColor: sample.sampledColor,
      deltaE: breakdown.deltaE,
      deltaL: breakdown.deltaL,
      deltaC: breakdown.deltaC,
      deltaH: breakdown.deltaH,
      hueDiffDeg: breakdown.hueDiffDeg,
      threshold,
      summaryKo: `${cutLabelKo} · ${signature.characterName} ${signature.itemLabelKo}: ${describeDriftCauseKo(breakdown)} (ΔE ${breakdown.deltaE.toFixed(3)} > ${threshold.toFixed(3)})`,
      summaryEn: `${cutLabelEn} · ${signature.characterName} ${signature.itemLabelEn}: ${describeDriftCauseEn(breakdown)} (ΔE ${breakdown.deltaE.toFixed(3)} > ${threshold.toFixed(3)})`,
    };

    findings.push(finding);
    entries.push({
      sampleId: sample.sampleId,
      cutNumber: sample.cutNumber,
      cutLabelKo,
      cutLabelEn,
      characterId: signature.characterId,
      characterName: signature.characterName,
      slot: signature.slot,
      itemLabelKo: signature.itemLabelKo,
      itemLabelEn: signature.itemLabelEn,
      baselineColor: signature.baselineColor,
      sampledColor: sample.sampledColor,
      status: "color-drift",
      breakdown,
      threshold,
      lightingOverride: override,
      finding,
    });
  }

  const auditableCount = matchedCount + lightingExemptCount + findings.length;
  const consistencyScore =
    auditableCount === 0
      ? 100
      : Math.round(((matchedCount + lightingExemptCount) / auditableCount) * 100);

  return {
    sceneId: baseline.sceneId,
    totalSamples: cutSamples.length,
    matchedCount,
    lightingExemptCount,
    driftCount: findings.length,
    criticalCount,
    consistencyScore,
    maxDeltaE: roundTo(maxDeltaE, 4),
    entries,
    findings,
  };
}

function matchesRestoreTarget(
  sample: CutSlotColorSample,
  target: CutSlotRestoreTarget,
): boolean {
  if (typeof target === "string") {
    return sample.sampleId === target;
  }
  return (
    sample.cutNumber === target.cutNumber &&
    sample.characterId === target.characterId &&
    sample.slot === target.slot
  );
}

/**
 * 지정한 컷·슬롯의 채색 샘플을 씬 기준 팔레트 색상으로 1클릭 복원한다(불변 배열 반환).
 */
export function restoreCutSlotToBaseline(
  baseline: SceneColorScriptBaseline,
  cutSamples: readonly CutSlotColorSample[],
  target: CutSlotRestoreTarget,
): readonly CutSlotColorSample[] {
  const signatureMap = buildSignatureMap(baseline);

  return cutSamples.map((sample) => {
    if (!matchesRestoreTarget(sample, target)) {
      return sample;
    }
    const signature = signatureMap.get(makeSlotKey(sample.characterId, sample.slot));
    if (!signature) {
      return sample;
    }
    return {
      ...sample,
      sampledColor: { ...signature.baselineColor },
    };
  });
}

/**
 * 조명 예외(lightingOverride) 컷은 보존하고, 채색 이탈(color-drift) 컷만 기준색으로 일괄 복원한다.
 */
export function restoreAllDriftedSlotsToBaseline(
  baseline: SceneColorScriptBaseline,
  cutSamples: readonly CutSlotColorSample[],
): BatchColorRestoreResult {
  const report = auditSceneColorScriptConsistency(baseline, cutSamples);
  if (report.findings.length === 0) {
    return {
      samples: cutSamples,
      restoredSampleIds: [],
      restoredCount: 0,
    };
  }

  const driftedIds = new Set(report.findings.map((finding) => finding.sampleId));
  const signatureMap = buildSignatureMap(baseline);
  const restoredSampleIds: string[] = [];

  const nextSamples = cutSamples.map((sample) => {
    if (!driftedIds.has(sample.sampleId)) {
      return sample;
    }
    const signature = signatureMap.get(makeSlotKey(sample.characterId, sample.slot));
    if (!signature) {
      return sample;
    }
    restoredSampleIds.push(sample.sampleId);
    return {
      ...sample,
      sampledColor: { ...signature.baselineColor },
    };
  });

  return {
    samples: nextSamples,
    restoredSampleIds,
    restoredCount: restoredSampleIds.length,
  };
}

/** 기본 시연용 씬 컬러 스크립트 기준 팔레트 */
export const DEFAULT_SCENE_COLOR_BASELINE: SceneColorScriptBaseline = {
  sceneId: "ep42-auditorium-standoff",
  sceneTitleKo: "42화 · 제국 아카데미 강당 대치",
  sceneTitleEn: "Ep. 42 · Academy Auditorium Standoff",
  episodeNumber: 42,
  lightingMoodKo: "주간 실내 창가 자연광",
  lightingMoodEn: "Daytime Window Natural Light",
  defaultDriftThreshold: DEFAULT_OKLCH_DRIFT_THRESHOLD,
  signatures: [
    {
      characterId: "jinwoo",
      characterName: "서진우",
      slot: "accessory",
      itemLabelKo: "진홍색 실크 넥타이",
      itemLabelEn: "Crimson Silk Tie",
      baselineColor: { l: 0.54, c: 0.21, h: 26 },
      maxDeltaE: 0.08,
    },
    {
      characterId: "jinwoo",
      characterName: "서진우",
      slot: "hair",
      itemLabelKo: "칠흑 단발",
      itemLabelEn: "Jet Black Hair",
      baselineColor: { l: 0.23, c: 0.025, h: 255 },
      maxDeltaE: 0.09,
    },
    {
      characterId: "jinwoo",
      characterName: "서진우",
      slot: "outfit",
      itemLabelKo: "네이비 제복 자켓",
      itemLabelEn: "Navy Uniform Jacket",
      baselineColor: { l: 0.31, c: 0.08, h: 258 },
      maxDeltaE: 0.085,
    },
    {
      characterId: "chaerin",
      characterName: "유채린",
      slot: "eyes",
      itemLabelKo: "에메랄드 눈동자",
      itemLabelEn: "Emerald Eyes",
      baselineColor: { l: 0.64, c: 0.155, h: 162 },
      maxDeltaE: 0.08,
    },
    {
      characterId: "chaerin",
      characterName: "유채린",
      slot: "hair",
      itemLabelKo: "애쉬 은발",
      itemLabelEn: "Ash Silver Hair",
      baselineColor: { l: 0.79, c: 0.022, h: 245 },
      maxDeltaE: 0.085,
    },
  ],
};

/** 기본 시연용 컷별 채색 샘플 (정상 컷 + 조명 예외 컷 + 채색 실수 컷 포함) */
export const DEFAULT_SCENE_CUT_SAMPLES: readonly CutSlotColorSample[] = [
  {
    sampleId: "cut-01-jinwoo-tie",
    cutNumber: 1,
    characterId: "jinwoo",
    slot: "accessory",
    sampledColor: { l: 0.542, c: 0.208, h: 27 },
    lightingOverride: null,
  },
  {
    sampleId: "cut-02-chaerin-hair",
    cutNumber: 2,
    characterId: "chaerin",
    slot: "hair",
    sampledColor: { l: 0.785, c: 0.024, h: 248 },
    lightingOverride: null,
  },
  {
    sampleId: "cut-03-jinwoo-tie",
    cutNumber: 3,
    characterId: "jinwoo",
    slot: "accessory",
    sampledColor: { l: 0.538, c: 0.212, h: 25.5 },
    lightingOverride: null,
  },
  {
    sampleId: "cut-03-chaerin-eyes-magic",
    cutNumber: 3,
    characterId: "chaerin",
    slot: "eyes",
    sampledColor: { l: 0.84, c: 0.19, h: 98 },
    lightingOverride: {
      kind: "magic-fx",
      reasonKo: "마력 각성 황금빛 발광 연출",
      reasonEn: "Mana awakening golden eye glow",
    },
  },
  {
    sampleId: "cut-04-jinwoo-tie-drift",
    cutNumber: 4,
    characterId: "jinwoo",
    slot: "accessory",
    sampledColor: { l: 0.51, c: 0.185, h: 256 },
    lightingOverride: null,
  },
  {
    sampleId: "cut-04-chaerin-eyes-drift",
    cutNumber: 4,
    characterId: "chaerin",
    slot: "eyes",
    sampledColor: { l: 0.57, c: 0.18, h: 332 },
    lightingOverride: null,
  },
  {
    sampleId: "cut-05-jinwoo-outfit-drift",
    cutNumber: 5,
    characterId: "jinwoo",
    slot: "outfit",
    sampledColor: { l: 0.54, c: 0.105, h: 96 },
    lightingOverride: null,
  },
];
