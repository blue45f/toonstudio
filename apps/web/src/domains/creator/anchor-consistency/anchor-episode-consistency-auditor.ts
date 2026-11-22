/**
 * 60컷 캐릭터 일관성 자동 검수관 (₩0 순수 로컬 결정론 엔진).
 *
 * - 정본 OKLCH 팔레트·좌우 비대칭 소품 앵커(`anchor-oklch-profile.ts`) 기반 60컷 일괄 스캐너
 * - OKLCH ΔE 이탈 + 좌우 반전(Chirality Flip) 결함 탐지
 * - 1클릭 "의도적 조명 변화 무시" 예외 처리(색상/조명 이탈만 억제, 좌우 반전 결함은 유지)
 * - 컷 장면 무드 태그(`flashback-sepia`, `monochrome`, `backlit-silhouette`) 기반 임계치 자동 완화(#130)
 */

import type { AnchorImageFeatures } from "./anchor-image-features";
import {
  CANONICAL_PALETTE_SLOTS,
  CANONICAL_PALETTE_SLOT_LABELS_KO,
  CUT_SCENE_MOOD_RELAXATIONS,
  clampUnit,
  labToOklch,
  normalizeColorSampleToOklch,
  oklchDeltaE,
  oklchHueDifferenceDeg,
  round4,
  type AsymmetricAnchorSide,
  type AsymmetricPropKind,
  type CanonicalCharacterAuditProfile,
  type CanonicalOklchSlotRange,
  type CanonicalPaletteSlot,
  type ColorSampleInput,
  type CutSceneMoodRelaxationProfile,
  type CutSceneMoodTag,
  type ObservedAsymmetricSide,
  type OklchColor,
} from "./anchor-oklch-profile";

export {
  ASYMMETRIC_PROP_KINDS,
  ASYMMETRIC_PROP_KIND_LABELS_KO,
  CANONICAL_PALETTE_SLOTS,
  CANONICAL_PALETTE_SLOT_LABELS_KO,
  CUT_SCENE_MOOD_RELAXATIONS,
  hexToOklch,
  labToOklch,
  normalizeColorSampleToOklch,
  oklchDeltaE,
  oklchHueDifferenceDeg,
  registerCanonicalCharacterProfile,
  srgbToOklch,
} from "./anchor-oklch-profile";
export type {
  AsymmetricAnchorSide,
  AsymmetricPropAnchor,
  AsymmetricPropKind,
  CanonicalCharacterAuditProfile,
  CanonicalOklchSlotInput,
  CanonicalOklchSlotRange,
  CanonicalPaletteSlot,
  ColorSampleInput,
  CutSceneMoodRelaxationProfile,
  CutSceneMoodTag,
  ObservedAsymmetricSide,
  OklchColor,
} from "./anchor-oklch-profile";

export interface ObservedAsymmetricAnchor {
  readonly anchorId: string;
  readonly observedSide: ObservedAsymmetricSide;
}

export interface EpisodeCutConsistencyInput {
  readonly cutId: string;
  /** 1부터 시작하는 컷 순번 (1..60+). */
  readonly cutIndex: number;
  readonly labelKo?: string;
  readonly moodTag?: CutSceneMoodTag;
  /** 1클릭 "의도적 조명 변화 무시" 예외 처리 플래그. */
  readonly ignoreIntentionalLighting?: boolean;
  /** 슬롯별 관측 색상(OKLCH, sRGB 튜플, 또는 #rrggbb). */
  readonly sampledSlots?: Partial<Record<CanonicalPaletteSlot, ColorSampleInput>>;
  /** `extractAnchorFeatures` 결과(선택). 슬롯 미입력 시 팔레트에서 최근접 슬롯 매칭 및 미러 여부 연동. */
  readonly features?: AnchorImageFeatures;
  /** 관측된 좌우 비대칭 소품 위치 목록. */
  readonly observedAnchors?: readonly ObservedAsymmetricAnchor[];
  /** 실루엣/이미지 전체가 좌우 반전된 것으로 감지되었는지 여부. */
  readonly mirroredHorizontally?: boolean;
}

export interface PaletteSlotAuditFinding {
  readonly slot: CanonicalPaletteSlot;
  readonly slotLabelKo: string;
  readonly sampled: OklchColor;
  readonly target: OklchColor;
  readonly deltaE: number;
  readonly effectiveMaxDeltaE: number;
  readonly deltaL: number;
  readonly deltaC: number;
  readonly deltaHueDeg: number;
  readonly rawExceeded: boolean;
  readonly relaxedByMood: boolean;
  readonly suppressedByLightingException: boolean;
  readonly exceeded: boolean;
  readonly severity: "ok" | "warning" | "critical";
  readonly messageKo: string;
}

export interface AsymmetricAnchorFinding {
  readonly anchorId: string;
  readonly kind: AsymmetricPropKind;
  readonly labelKo: string;
  readonly expectedSide: AsymmetricAnchorSide;
  readonly observedSide: ObservedAsymmetricSide;
  readonly defect: "ok" | "flipped" | "missing" | "occluded";
  readonly severity: "ok" | "warning" | "critical";
  readonly messageKo: string;
}

export type EpisodeCutAuditVerdict = "pass" | "warning" | "fail" | "ignored-lighting";

export interface EpisodeCutConsistencyResult {
  readonly cutId: string;
  readonly cutIndex: number;
  readonly labelKo: string;
  readonly moodTag: CutSceneMoodTag;
  readonly moodRelaxation: CutSceneMoodRelaxationProfile;
  readonly ignoredIntentionalLighting: boolean;
  readonly mirroredHorizontally: boolean;
  readonly paletteFindings: readonly PaletteSlotAuditFinding[];
  readonly asymmetryFindings: readonly AsymmetricAnchorFinding[];
  readonly activePaletteDefectCount: number;
  readonly activeAsymmetryDefectCount: number;
  readonly moodSuppressedCount: number;
  readonly score: number;
  readonly verdict: EpisodeCutAuditVerdict;
  readonly summaryKo: string;
}

export interface EpisodeConsistencyActionableIssue {
  readonly cutId: string;
  readonly cutIndex: number;
  readonly category: "asymmetry-flip" | "asymmetry-missing" | "palette-drift";
  readonly severity: "warning" | "critical";
  readonly messageKo: string;
}

export interface EpisodeConsistencyAuditReport {
  readonly profileId: string;
  readonly characterId: string;
  readonly characterNameKo: string;
  readonly totalCuts: number;
  readonly passedCount: number;
  readonly warningCount: number;
  readonly failedCount: number;
  readonly lightingIgnoredCount: number;
  readonly moodRelaxedCutCount: number;
  readonly paletteDriftCount: number;
  readonly asymmetryFlipCount: number;
  readonly missingAnchorCount: number;
  readonly overallConsistencyScore: number;
  readonly cuts: readonly EpisodeCutConsistencyResult[];
  readonly actionableIssues: readonly EpisodeConsistencyActionableIssue[];
  readonly summaryKo: string;
}

export interface IntentionalLightingOverrideMap {
  readonly ignoredCutIds: ReadonlySet<string>;
}

const ACHROMATIC_CHROMA_FLOOR = 0.025;

function isConsistentWithMoodColorProfile(
  sampled: OklchColor,
  target: OklchColor,
  moodTag: CutSceneMoodTag,
): boolean {
  if (moodTag === "monochrome") {
    return sampled.c <= 0.055 && Math.abs(sampled.l - target.l) <= 0.38;
  }
  if (moodTag === "flashback-sepia") {
    const inSepiaBand =
      sampled.c <= 0.05 || (sampled.h >= 30 && sampled.h <= 115 && sampled.c <= 0.19);
    return inSepiaBand && Math.abs(sampled.l - target.l) <= 0.32;
  }
  if (moodTag === "backlit-silhouette") {
    return sampled.l <= 0.44 && sampled.c <= 0.12;
  }
  return false;
}

function evaluateSlotColor(
  range: CanonicalOklchSlotRange,
  sampled: OklchColor,
  moodRelaxation: CutSceneMoodRelaxationProfile,
  ignoreIntentionalLighting: boolean,
): PaletteSlotAuditFinding {
  const deltaE = oklchDeltaE(range.target, sampled);
  const deltaL = round4(sampled.l - range.target.l);
  const deltaC = round4(sampled.c - range.target.c);
  const chromatic = Math.max(range.target.c, sampled.c) >= ACHROMATIC_CHROMA_FLOOR;
  const deltaHueDeg = chromatic ? round4(oklchHueDifferenceDeg(range.target.h, sampled.h)) : 0;

  const rawRangeOut =
    sampled.l < range.minL ||
    sampled.l > range.maxL ||
    sampled.c < range.minC ||
    sampled.c > range.maxC ||
    (chromatic && deltaHueDeg > range.hueToleranceDeg);
  const rawExceeded = deltaE > range.maxDeltaE || rawRangeOut;

  const effectiveMaxDeltaE = round4(range.maxDeltaE * moodRelaxation.deltaEMultiplier);
  const relaxedMinL = clampUnit(range.minL - moodRelaxation.lightnessBonus, 0, 1);
  const relaxedMaxL = clampUnit(range.maxL + moodRelaxation.lightnessBonus, 0, 1);
  const relaxedMinC = clampUnit(range.minC - moodRelaxation.chromaBonus, 0, 0.45);
  const relaxedMaxC = clampUnit(range.maxC + moodRelaxation.chromaBonus, 0, 0.45);
  const relaxedHueTol = Math.min(180, range.hueToleranceDeg + moodRelaxation.hueBonusDeg);

  const passesMoodColorSignature =
    moodRelaxation.moodTag !== "normal" &&
    isConsistentWithMoodColorProfile(sampled, range.target, moodRelaxation.moodTag);

  const relaxedRangeOut =
    !passesMoodColorSignature &&
    (sampled.l < relaxedMinL ||
      sampled.l > relaxedMaxL ||
      (!moodRelaxation.skipChromaCheck && (sampled.c < relaxedMinC || sampled.c > relaxedMaxC)) ||
      (!moodRelaxation.skipHueCheck && chromatic && deltaHueDeg > relaxedHueTol));

  const exceededAfterMood =
    !passesMoodColorSignature && (deltaE > effectiveMaxDeltaE || relaxedRangeOut);
  const relaxedByMood = rawExceeded && !exceededAfterMood && moodRelaxation.moodTag !== "normal";
  const suppressedByLightingException = exceededAfterMood && ignoreIntentionalLighting;
  const exceeded = exceededAfterMood && !ignoreIntentionalLighting;

  const slotLabelKo = CANONICAL_PALETTE_SLOT_LABELS_KO[range.slot];
  let severity: PaletteSlotAuditFinding["severity"] = "ok";
  let messageKo = `${slotLabelKo} 팔레트 정상 (ΔE ${deltaE.toFixed(3)})`;

  if (suppressedByLightingException) {
    messageKo = `${slotLabelKo} 색상 변화(ΔE ${deltaE.toFixed(3)})를 의도적 조명 변화로 무시했습니다.`;
  } else if (relaxedByMood) {
    messageKo = `${slotLabelKo} 색상 변화를 '${moodRelaxation.labelKo}' 무드 임계치 완화로 허용했습니다.`;
  } else if (exceeded) {
    severity = deltaE >= effectiveMaxDeltaE * 1.65 ? "critical" : "warning";
    messageKo = `${slotLabelKo} 정본 팔레트 이탈 (ΔE ${deltaE.toFixed(3)} > 허용 ${effectiveMaxDeltaE.toFixed(3)})`;
  }

  return Object.freeze({
    slot: range.slot,
    slotLabelKo,
    sampled,
    target: range.target,
    deltaE,
    effectiveMaxDeltaE,
    deltaL,
    deltaC,
    deltaHueDeg,
    rawExceeded,
    relaxedByMood,
    suppressedByLightingException,
    exceeded,
    severity,
    messageKo,
  });
}

function inferSlotsFromAnchorFeatures(
  profile: CanonicalCharacterAuditProfile,
  features: AnchorImageFeatures,
): Partial<Record<CanonicalPaletteSlot, OklchColor>> {
  if (features.palette.length === 0) return {};
  const oklchEntries = features.palette.map((entry) => labToOklch(entry.lab));
  const inferred: Partial<Record<CanonicalPaletteSlot, OklchColor>> = {};
  for (const slot of CANONICAL_PALETTE_SLOTS) {
    const target = profile.paletteRanges[slot].target;
    let best = oklchEntries[0]!;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const candidate of oklchEntries) {
      const dist = oklchDeltaE(target, candidate);
      if (dist < bestDist) {
        bestDist = dist;
        best = candidate;
      }
    }
    inferred[slot] = best;
  }
  return inferred;
}

/**
 * 단일 컷의 OKLCH 팔레트 일관성 + 좌우 비대칭 소품 반전 + 무드 완화 + 조명 예외를 판정한다.
 */
export function auditSingleCutCharacterConsistency(
  profile: CanonicalCharacterAuditProfile,
  cut: EpisodeCutConsistencyInput,
): EpisodeCutConsistencyResult {
  const moodTag: CutSceneMoodTag = cut.moodTag ?? "normal";
  const moodRelaxation = CUT_SCENE_MOOD_RELAXATIONS[moodTag];
  const ignoredIntentionalLighting = cut.ignoreIntentionalLighting === true;
  const mirroredHorizontally = cut.mirroredHorizontally === true;

  const inferredSlots = cut.features ? inferSlotsFromAnchorFeatures(profile, cut.features) : {};
  const paletteFindings: PaletteSlotAuditFinding[] = [];

  for (const slot of CANONICAL_PALETTE_SLOTS) {
    const explicit = cut.sampledSlots?.[slot];
    const sampled =
      explicit !== undefined ? normalizeColorSampleToOklch(explicit) : inferredSlots[slot];
    if (!sampled) continue;
    paletteFindings.push(
      evaluateSlotColor(
        profile.paletteRanges[slot],
        sampled,
        moodRelaxation,
        ignoredIntentionalLighting,
      ),
    );
  }

  const observedByAnchorId = new Map<string, ObservedAsymmetricSide>();
  for (const obs of cut.observedAnchors ?? []) {
    observedByAnchorId.set(obs.anchorId, obs.observedSide);
  }

  const asymmetryFindings: AsymmetricAnchorFinding[] = [];
  for (const anchor of profile.asymmetricAnchors) {
    const explicitObserved = observedByAnchorId.get(anchor.id);
    const observedSide: ObservedAsymmetricSide =
      explicitObserved ??
      (mirroredHorizontally
        ? anchor.expectedSide === "left"
          ? "right"
          : "left"
        : anchor.expectedSide);

    let defect: AsymmetricAnchorFinding["defect"] = "ok";
    let severity: AsymmetricAnchorFinding["severity"] = "ok";
    let messageKo = `${anchor.labelKo} 위치 일치 (${anchor.expectedSide === "left" ? "왼쪽" : "오른쪽"})`;

    if (observedSide === "occluded") {
      defect = "occluded";
      messageKo = `${anchor.labelKo}은(는) 구도·역광 가림으로 검수 제외`;
    } else if (observedSide === "missing") {
      defect = moodTag === "backlit-silhouette" ? "occluded" : "missing";
      severity = moodTag === "backlit-silhouette" ? "ok" : "warning";
      messageKo =
        moodTag === "backlit-silhouette"
          ? `${anchor.labelKo}은(는) 역광 실루엣에서 생략 허용`
          : `${anchor.labelKo} 소품 앵커가 누락되었습니다`;
    } else if (observedSide !== anchor.expectedSide) {
      defect = "flipped";
      severity = "critical";
      const expectedKo = anchor.expectedSide === "left" ? "왼쪽" : "오른쪽";
      const observedKo = observedSide === "left" ? "왼쪽" : "오른쪽";
      messageKo = `${anchor.labelKo} 좌우 반전 결함 감지 (정본: ${expectedKo}, 컷 관측: ${observedKo})`;
    }

    asymmetryFindings.push(
      Object.freeze({
        anchorId: anchor.id,
        kind: anchor.kind,
        labelKo: anchor.labelKo,
        expectedSide: anchor.expectedSide,
        observedSide,
        defect,
        severity,
        messageKo,
      }),
    );
  }

  const activePaletteDefectCount = paletteFindings.filter((f) => f.exceeded).length;
  const activeAsymmetryDefectCount = asymmetryFindings.filter(
    (f) => f.defect === "flipped" || f.defect === "missing",
  ).length;
  const hasCriticalAsymmetry = asymmetryFindings.some((f) => f.defect === "flipped");
  const hasCriticalPalette = paletteFindings.some((f) => f.severity === "critical");
  const moodSuppressedCount = paletteFindings.filter((f) => f.relaxedByMood).length;
  const lightingSuppressedCount = paletteFindings.filter((f) => f.suppressedByLightingException).length;

  let penalty = 0;
  for (const f of paletteFindings) {
    if (f.severity === "critical") penalty += 24;
    else if (f.severity === "warning") penalty += 12;
  }
  for (const f of asymmetryFindings) {
    if (f.defect === "flipped") penalty += 35;
    else if (f.defect === "missing") penalty += 14;
  }
  const score = Math.round(clampUnit(100 - penalty, 0, 100));

  let verdict: EpisodeCutAuditVerdict = "pass";
  if (hasCriticalAsymmetry || hasCriticalPalette) {
    verdict = "fail";
  } else if (activePaletteDefectCount > 0 || activeAsymmetryDefectCount > 0) {
    verdict = "warning";
  } else if (ignoredIntentionalLighting && lightingSuppressedCount > 0) {
    verdict = "ignored-lighting";
  }

  const labelKo = cut.labelKo?.trim() || `${cut.cutIndex}컷`;
  let summaryKo: string;
  if (verdict === "pass") {
    summaryKo =
      moodSuppressedCount > 0
        ? `${labelKo} 통과 (${moodRelaxation.labelKo} 임계치 완화 ${moodSuppressedCount}건 적용)`
        : `${labelKo} 캐릭터 팔레트·좌우 앵커 일치`;
  } else if (verdict === "ignored-lighting") {
    summaryKo = `${labelKo} 의도적 조명 변화 무시 적용 (좌우 앵커 정상)`;
  } else {
    const parts: string[] = [];
    if (activeAsymmetryDefectCount > 0) parts.push(`비대칭 결함 ${activeAsymmetryDefectCount}건`);
    if (activePaletteDefectCount > 0) parts.push(`팔레트 이탈 ${activePaletteDefectCount}건`);
    summaryKo = `${labelKo} 수정 필요: ${parts.join(", ")}`;
  }

  return Object.freeze({
    cutId: cut.cutId,
    cutIndex: cut.cutIndex,
    labelKo,
    moodTag,
    moodRelaxation,
    ignoredIntentionalLighting,
    mirroredHorizontally,
    paletteFindings: Object.freeze(paletteFindings),
    asymmetryFindings: Object.freeze(asymmetryFindings),
    activePaletteDefectCount,
    activeAsymmetryDefectCount,
    moodSuppressedCount,
    score,
    verdict,
    summaryKo,
  });
}

/**
 * 최대 60컷(이상 포함) 에피소드 전체의 캐릭터 팔레트 OKLCH ΔE 이탈과 좌우 반전 결함을 일괄 스캔한다.
 */
export function scanEpisodeCharacterConsistency(
  profile: CanonicalCharacterAuditProfile,
  cuts: readonly EpisodeCutConsistencyInput[],
  overrides?: IntentionalLightingOverrideMap,
): EpisodeConsistencyAuditReport {
  const ignoredSet = overrides?.ignoredCutIds;
  const results = cuts.map((cut) =>
    auditSingleCutCharacterConsistency(
      profile,
      ignoredSet?.has(cut.cutId) ? { ...cut, ignoreIntentionalLighting: true } : cut,
    ),
  );

  let passedCount = 0;
  let warningCount = 0;
  let failedCount = 0;
  let lightingIgnoredCount = 0;
  let moodRelaxedCutCount = 0;
  let paletteDriftCount = 0;
  let asymmetryFlipCount = 0;
  let missingAnchorCount = 0;
  let scoreSum = 0;
  const actionableIssues: EpisodeConsistencyActionableIssue[] = [];

  for (const res of results) {
    scoreSum += res.score;
    if (res.verdict === "pass") passedCount += 1;
    else if (res.verdict === "ignored-lighting") lightingIgnoredCount += 1;
    else if (res.verdict === "warning") warningCount += 1;
    else failedCount += 1;

    if (res.moodSuppressedCount > 0) moodRelaxedCutCount += 1;

    for (const asym of res.asymmetryFindings) {
      if (asym.defect === "flipped") {
        asymmetryFlipCount += 1;
        actionableIssues.push({
          cutId: res.cutId,
          cutIndex: res.cutIndex,
          category: "asymmetry-flip",
          severity: "critical",
          messageKo: `${res.labelKo}: ${asym.messageKo}`,
        });
      } else if (asym.defect === "missing") {
        missingAnchorCount += 1;
        actionableIssues.push({
          cutId: res.cutId,
          cutIndex: res.cutIndex,
          category: "asymmetry-missing",
          severity: "warning",
          messageKo: `${res.labelKo}: ${asym.messageKo}`,
        });
      }
    }

    for (const pal of res.paletteFindings) {
      if (!pal.exceeded) continue;
      paletteDriftCount += 1;
      actionableIssues.push({
        cutId: res.cutId,
        cutIndex: res.cutIndex,
        category: "palette-drift",
        severity: pal.severity === "critical" ? "critical" : "warning",
        messageKo: `${res.labelKo}: ${pal.messageKo}`,
      });
    }
  }

  actionableIssues.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    if (a.category !== b.category) {
      if (a.category === "asymmetry-flip") return -1;
      if (b.category === "asymmetry-flip") return 1;
    }
    return a.cutIndex - b.cutIndex;
  });

  const overallConsistencyScore =
    results.length > 0 ? Math.round(scoreSum / results.length) : 100;
  const summaryKo =
    actionableIssues.length === 0
      ? `${profile.characterNameKo} ${results.length}컷 검수 통과 (점수 ${overallConsistencyScore}점 · 무드 완화 ${moodRelaxedCutCount}컷 · 조명 예외 ${lightingIgnoredCount}컷)`
      : `${profile.characterNameKo} ${results.length}컷 중 좌우 반전 ${asymmetryFlipCount}건 · 팔레트 이탈 ${paletteDriftCount}건 · 소품 누락 ${missingAnchorCount}건 감지`;

  return Object.freeze({
    profileId: profile.profileId,
    characterId: profile.characterId,
    characterNameKo: profile.characterNameKo,
    totalCuts: results.length,
    passedCount,
    warningCount,
    failedCount,
    lightingIgnoredCount,
    moodRelaxedCutCount,
    paletteDriftCount,
    asymmetryFlipCount,
    missingAnchorCount,
    overallConsistencyScore,
    cuts: Object.freeze(results),
    actionableIssues: Object.freeze(actionableIssues),
    summaryKo,
  });
}

/**
 * 1클릭 "의도적 조명 변화 무시" 예외 토글 유틸리티.
 * 팔레트·조명 이탈만 억제하며, 좌우 비대칭 소품 반전 결함은 절대 무시하지 않는다.
 */
export function toggleIntentionalLightingException(
  profile: CanonicalCharacterAuditProfile,
  cuts: readonly EpisodeCutConsistencyInput[],
  cutId: string,
  ignore = true,
): {
  readonly cuts: readonly EpisodeCutConsistencyInput[];
  readonly report: EpisodeConsistencyAuditReport;
} {
  const nextCuts = Object.freeze(
    cuts.map((cut) =>
      cut.cutId === cutId ? Object.freeze({ ...cut, ignoreIntentionalLighting: ignore }) : cut,
    ),
  );
  return {
    cuts: nextCuts,
    report: scanEpisodeCharacterConsistency(profile, nextCuts),
  };
}
