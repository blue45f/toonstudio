/**
 * 전 브러시 카탈로그 이름↔질감 1:1 정합성 감사 · 자동 물리 보정 레시피 · 시각 중복 클러스터 감사 엔진.
 */

import {
  BRUSH_CATEGORY_PHYSICAL_STRATEGIES,
  BRUSH_FEATURE_KEYS,
  BRUSH_MEDIA_CATEGORY_IDS,
  computeFeatureVectorDistance,
  evaluateStrategySeparation,
  type BrushGrainTransferMode,
  type BrushMediaCategoryId,
  type BrushPaperGrainPresetId,
  type BrushPhysicalFeatureVector,
  type StrategySeparationSummary,
} from "./brush-category-physical-strategies";
import {
  computeFingerprintRmse,
  FINGERPRINT_HEIGHT,
  FINGERPRINT_WIDTH,
  loadUnifiedBrushCatalog,
  synthesizeBrushFingerprint64x32,
  type BrushCatalogSourceId,
  type BrushFingerprintMetrics,
  type BrushStrokeFingerprint64x32,
  type UnifiedBrushAuditRecord,
} from "./brush-catalog-unified-loader";

export {
  computeFingerprintRmse,
  FINGERPRINT_HEIGHT,
  FINGERPRINT_WIDTH,
  loadUnifiedBrushCatalog,
  synthesizeBrushFingerprint64x32,
  type BrushCatalogSourceId,
  type BrushFingerprintMetrics,
  type BrushStrokeFingerprint64x32,
  type UnifiedBrushAuditRecord,
};

export const DEFAULT_DUPLICATE_RMSE_THRESHOLD = 0.025;
export const DEFAULT_DUPLICATE_FEATURE_DIST_THRESHOLD = 0.06;

export interface ExpectedMediaInference {
  readonly category: BrushMediaCategoryId;
  readonly confidence01: number;
  readonly matchedRule: string;
  readonly isSpecialtyStamp: boolean;
}

export interface BrushNamingMismatchDetail {
  readonly metric: keyof BrushPhysicalFeatureVector;
  readonly observed: number;
  readonly expectedMin: number;
  readonly expectedMax: number;
  readonly gap: number;
  readonly reasonKo: string;
}

export interface BrushPhysicsAutoPatch {
  readonly targetStrategyId: BrushMediaCategoryId;
  readonly paperGrainPreset: BrushPaperGrainPresetId;
  readonly grainMode: BrushGrainTransferMode;
  readonly featurePatch: Readonly<Partial<BrushPhysicalFeatureVector>>;
  readonly actionSummaryKo: string;
}

export interface BrushNamingParityEntry {
  readonly uid: string;
  readonly id: string;
  readonly sourceCatalog: BrushCatalogSourceId;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly inferred: ExpectedMediaInference;
  readonly aligned: boolean;
  readonly observedFeatures: BrushPhysicalFeatureVector;
  readonly fingerprintMetrics: BrushFingerprintMetrics;
  readonly mismatches: readonly BrushNamingMismatchDetail[];
  readonly recommendedPhysicsPatch: BrushPhysicsAutoPatch | null;
}

export type DuplicateResolutionKind = "merge-to-canonical" | "differentiate-parameters";

export interface BrushDuplicatePair {
  readonly uidA: string;
  readonly uidB: string;
  readonly nameA: string;
  readonly nameB: string;
  readonly sourceA: BrushCatalogSourceId;
  readonly sourceB: BrushCatalogSourceId;
  readonly categoryA: BrushMediaCategoryId;
  readonly categoryB: BrushMediaCategoryId;
  readonly pairwiseRmse: number;
  readonly featureDistance: number;
  readonly sameCatalog: boolean;
  readonly triggerReason: "visual-rmse" | "feature-vector" | "both";
  readonly recommendation: DuplicateResolutionKind;
  readonly suggestionKo: string;
}

export interface BrushDuplicateCluster {
  readonly clusterId: string;
  readonly canonicalUid: string;
  readonly canonicalName: string;
  readonly memberUids: readonly string[];
  readonly memberNames: readonly string[];
  readonly minPairwiseRmse: number;
  readonly recommendation: DuplicateResolutionKind;
  readonly summaryKo: string;
}

export interface FullBrushCatalogAuditOptions {
  readonly duplicateRmseThreshold?: number;
  readonly duplicateFeatureDistanceThreshold?: number;
  readonly records?: readonly UnifiedBrushAuditRecord[];
}

export interface FullBrushCatalogAuditReport {
  readonly totalBrushes: number;
  readonly catalogBreakdown: Readonly<Record<BrushCatalogSourceId, number>>;
  readonly categoryDistribution: Readonly<Record<BrushMediaCategoryId, number>>;
  readonly namingParityRate01: number;
  readonly alignedCount: number;
  readonly mismatchCount: number;
  readonly entries: readonly BrushNamingParityEntry[];
  readonly mismatchedBrushes: readonly BrushNamingParityEntry[];
  readonly duplicatePairCount: number;
  readonly sameCatalogDuplicatePairCount: number;
  readonly crossCatalogDuplicatePairCount: number;
  readonly duplicatePairs: readonly BrushDuplicatePair[];
  readonly duplicateClusters: readonly BrushDuplicateCluster[];
  readonly strategySeparation: StrategySeparationSummary;
  readonly summaryKo: string;
}

const SOURCE_PRIORITY: Readonly<Record<BrushCatalogSourceId, number>> = Object.freeze({
  "global-master": 7,
  "csp-atelier": 6,
  "procreate-silica": 5,
  "csp-executable": 4,
  "magma-studio": 3,
  "universal-p5": 2,
  "universal-ibis-medibang": 1,
});

const METRIC_LABEL_KO: Readonly<Record<keyof BrushPhysicalFeatureVector, string>> = Object.freeze({
  toothContrast: "종이 요철 대비",
  edgeRoughness: "외곽 거칠기·크럼",
  edgeSharpness: "경계 선명도",
  wetBleed: "습식 번짐·웨트 엣지",
  impastoHeight: "임파스토 부조 높이",
  opacityCoverage: "불투명 피복력",
  multiplyStacking: "승산 겹칠 누적",
  smudgePickup: "스머지·혼색 픽업",
  liftStrength: "지우개 들어올림",
  bristleSpread: "브리스틀 강모 폭",
});

const SPECIALTY_PATTERN =
  /frill|프릴|lace|레이스|brooch|브로치|pearl|진주|embroidery|자수|petal|벚꽃|꽃잎|foliage|나뭇잎|grass|잔디|풀잎|rose|장미|cloud|구름|sparkle|반짝|bokeh|flare|플레어|nebula|성운|rune|마법진|neon|네온|lightpen|라이트펜|speedline|집중선|속도선|halftone|하프톤|망점|hair|머리|braid|땋은|brick|벽돌|knit|니트|fur|털|foil|금박|metal|메탈|pawprint|발자국|heart|하트|chain|사슬|체인|spires|추상|hartz|건축|ribbon|리본|decor|장식|splatter|스패터|스플래터|비산|tone-scrape|톤 깎기|sand-noise|모래/u;

/** 브러시 이름·ID 우선(원시 카테고리 보조)으로 기대 12대 매체 전략을 추론한다. */
export function inferExpectedMediaCategory(
  record: Pick<UnifiedBrushAuditRecord, "id" | "nameKo" | "nameEn" | "rawCategory" | "operation">,
): ExpectedMediaInference {
  const nameSig = `${record.id} ${record.nameEn} ${record.nameKo}`.toLowerCase();
  const fullSig = `${nameSig} ${record.rawCategory}`.toLowerCase();
  const isSpecialtyStamp = SPECIALTY_PATTERN.test(fullSig);

  if (record.operation === "erase" || /eraser|지우개|kneaded|반죽|putty/u.test(nameSig)) {
    return Object.freeze({ category: "kneaded-eraser", confidence01: 0.98, matchedRule: "eraser", isSpecialtyStamp: false });
  }
  if (
    record.operation === "smudge" ||
    /stump|찰필|smudge|스머지|문지르|문지름|fingertip|손끝|블렌더|blender|color-mix|색 혼합|웻 믹서|wet-mixer|물붓/u.test(nameSig)
  ) {
    return Object.freeze({ category: "blending-stump", confidence01: 0.95, matchedRule: "blending-stump", isSpecialtyStamp: false });
  }
  if (/crayon|크레용|크레파스|oil-?pastel|오일 ?파스텔|wax/u.test(nameSig)) {
    return Object.freeze({ category: "crayon", confidence01: 0.96, matchedRule: "crayon-wax", isSpecialtyStamp: false });
  }
  if (/charcoal|목탄|차콜|콘테|conte/u.test(nameSig)) {
    return Object.freeze({ category: "charcoal", confidence01: 0.96, matchedRule: "charcoal", isSpecialtyStamp: false });
  }
  if (/pencil|연필|흑연|graphite|샤프|rotring|cpencil|\b2b\b|\bhb\b|\b2h\b|\b6b\b|peppermint/u.test(nameSig)) {
    return Object.freeze({ category: "pencil", confidence01: 0.96, matchedRule: "graphite-pencil", isSpecialtyStamp: false });
  }
  if (/pastel|파스텔|chalk|초크|분필|oberon|러프 초크/u.test(nameSig)) {
    return Object.freeze({ category: "pastel", confidence01: 0.92, matchedRule: "pastel-chalk", isSpecialtyStamp: false });
  }
  if (/gouache|구아슈|과슈|acrylic|아크릴|opaque-wc|불투명 수채/u.test(nameSig)) {
    return Object.freeze({ category: "acrylic-gouache", confidence01: 0.95, matchedRule: "acrylic-gouache", isSpecialtyStamp: false });
  }
  if (/airbrush|에어브러시|에어 ?소프트|에어 ?스프레이|spray|스프레이|mist|분무|softer|tone-scrape|톤 깎기|모래|noise|노이즈|splatter|스플래터|비산/u.test(nameSig)) {
    return Object.freeze({ category: "airbrush", confidence01: 0.92, matchedRule: "airbrush-spray", isSpecialtyStamp });
  }
  if (/marker|마커|마카|코픽|copic|highlighter|형광|보드마커/u.test(nameSig)) {
    return Object.freeze({ category: "marker", confidence01: 0.95, matchedRule: "alcohol-marker", isSpecialtyStamp: false });
  }
  if (/watercolor|수채|wash|워시|backrun|백런|granulat|과립|salt-crystal|소금|wet-sponge|웨트 스펀지|bleed|번짐|splotchy|얼룩|hanji|한지|수묵|watery|물기|chroma/u.test(nameSig)) {
    return Object.freeze({ category: "watercolor", confidence01: 0.94, matchedRule: "watercolor-wet", isSpecialtyStamp });
  }
  if (/calligraph|캘리|서예|붓글씨|먹붓|sumi|붓펜|brush-pen|fude/u.test(nameSig)) {
    return Object.freeze({ category: "gpen-ink", confidence01: 0.92, matchedRule: "calligraphy-ink", isSpecialtyStamp });
  }
  if (/oil|유화|유채|impasto|임파스토|palette-knife|팔레트 ?나이프|bristle|돈모|브리슬|filbert|필버트|평붓|부채꼴|fan-brush|turpentine|테레빈|salamanca|살라망카|nikko-rull|니코 룰|thick-paint|두껍게|thick-rough/u.test(nameSig)) {
    return Object.freeze({ category: "oil-impasto", confidence01: 0.94, matchedRule: "oil-impasto", isSpecialtyStamp });
  }
  if (/g-?pen|g펜|maru|마루펜|mapping|둥근 펜|turnip|순무|dip-?pen|딥펜|ink|잉크|liner|라이너|사인펜|felt-tip|monoline|모노라인|dot-pen|도트|pixel|픽셀|syrup|시럽|studio-pen|스튜디오 펜|shale|셰일|crosshatch|해칭|펜|pen/u.test(nameSig)) {
    return Object.freeze({ category: "gpen-ink", confidence01: 0.93, matchedRule: "gpen-ink", isSpecialtyStamp });
  }
  if (/cloud|구름|neon|네온|sparkle|반짝|flare|플레어|nebula|성운|rune|마법진|lightpen|라이트펜|soft/u.test(fullSig)) {
    return Object.freeze({ category: "airbrush", confidence01: 0.72, matchedRule: "specialty-glow-soft", isSpecialtyStamp: true });
  }
  if (/rough|러프|old-beach|hartz/u.test(nameSig)) {
    return Object.freeze({ category: "charcoal", confidence01: 0.74, matchedRule: "rough-dry-media", isSpecialtyStamp });
  }
  return Object.freeze({
    category: isSpecialtyStamp ? "acrylic-gouache" : "gpen-ink",
    confidence01: 0.65,
    matchedRule: isSpecialtyStamp ? "specialty-stamp-fallback" : "default-ink-fallback",
    isSpecialtyStamp,
  });
}

/** 단일 브러시의 이름↔질감 정합성 감사 및 자동 물리 보정 레시피 산출. */
export function auditSingleBrushNamingParity(
  record: UnifiedBrushAuditRecord,
  fingerprint: BrushStrokeFingerprint64x32,
): BrushNamingParityEntry {
  const inferred = inferExpectedMediaCategory(record);
  const strategy = BRUSH_CATEGORY_PHYSICAL_STRATEGIES[inferred.category];
  const mismatches: BrushNamingMismatchDetail[] = [];
  const patchFeatures: Partial<Record<keyof BrushPhysicalFeatureVector, number>> = {};

  if (!inferred.isSpecialtyStamp) {
    for (const key of BRUSH_FEATURE_KEYS) {
      const bound = strategy.expectedBounds[key];
      if (!bound) continue;
      const observed = record.features[key];
      if (observed < bound.min || observed > bound.max) {
        const isBelow = observed < bound.min;
        const targetVal = Number(
          Math.max(bound.min, Math.min(bound.max, strategy.targetFeatures[key])).toFixed(3),
        );
        patchFeatures[key] = targetVal;
        mismatches.push(
          Object.freeze({
            metric: key,
            observed: Number(observed.toFixed(3)),
            expectedMin: bound.min,
            expectedMax: bound.max,
            gap: Number((isBelow ? bound.min - observed : observed - bound.max).toFixed(3)),
            reasonKo: `${strategy.labelKo} 명칭 대비 ${METRIC_LABEL_KO[key]}(${observed.toFixed(2)})가 ${
              isBelow ? `최소 기준(${bound.min.toFixed(2)}) 미만` : `상한 기준(${bound.max.toFixed(2)}) 초과`
            }`,
          }),
        );
      }
    }
  }

  const aligned = mismatches.length === 0;
  const recommendedPhysicsPatch: BrushPhysicsAutoPatch | null = aligned
    ? null
    : Object.freeze({
        targetStrategyId: strategy.id,
        paperGrainPreset: strategy.paperGrainPreset,
        grainMode: strategy.grainMode,
        featurePatch: Object.freeze(patchFeatures),
        actionSummaryKo: `${strategy.labelKo} 전략(${strategy.paperGrainPreset}/${strategy.grainMode}) 기준으로 ${mismatches
          .map((item) => METRIC_LABEL_KO[item.metric])
          .join("·")} 파라미터를 자동 보정`,
      });

  return Object.freeze({
    uid: record.uid,
    id: record.id,
    sourceCatalog: record.sourceCatalog,
    nameKo: record.nameKo,
    nameEn: record.nameEn,
    inferred,
    aligned,
    observedFeatures: record.features,
    fingerprintMetrics: fingerprint.metrics,
    mismatches: Object.freeze(mismatches),
    recommendedPhysicsPatch,
  });
}

/** 자동 보정 레시피를 적용해 교정된 브러시 레코드를 반환한다(원본 불변 유지). */
export function applyRecommendedPhysicsPatch(
  record: UnifiedBrushAuditRecord,
  patch: BrushPhysicsAutoPatch,
): UnifiedBrushAuditRecord {
  const strategy = BRUSH_CATEGORY_PHYSICAL_STRATEGIES[patch.targetStrategyId];
  return Object.freeze({
    ...record,
    operation: strategy.operation,
    features: Object.freeze({ ...record.features, ...patch.featurePatch }),
  });
}

/** 전 카탈로그 브러시 시각 중복 쌍(`pairwiseRmse < 0.025` 또는 특징 벡터 중복) 및 정본 시드 클러스터 탐지. */
export function detectVisualDuplicates(
  records: readonly UnifiedBrushAuditRecord[],
  fingerprints: readonly BrushStrokeFingerprint64x32[],
  entries: readonly BrushNamingParityEntry[],
  rmseThreshold = DEFAULT_DUPLICATE_RMSE_THRESHOLD,
  featureDistanceThreshold = DEFAULT_DUPLICATE_FEATURE_DIST_THRESHOLD,
): {
  readonly duplicatePairs: readonly BrushDuplicatePair[];
  readonly duplicateClusters: readonly BrushDuplicateCluster[];
} {
  const n = records.length;
  const pairs: BrushDuplicatePair[] = [];
  const adj = Array.from({ length: n }, () => new Map<number, number>());

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const rmse = computeFingerprintRmse(fingerprints[i], fingerprints[j]);
      const featDist = computeFeatureVectorDistance(records[i].features, records[j].features);
      const isRmseDup = rmse < rmseThreshold;
      const isFeatDup = featDist < featureDistanceThreshold;
      if (!isRmseDup && !isFeatDup) continue;

      adj[i].set(j, rmse);
      adj[j].set(i, rmse);
      const catA = entries[i].inferred.category;
      const catB = entries[j].inferred.category;
      const sameCatalog = records[i].sourceCatalog === records[j].sourceCatalog;
      const recommendation: DuplicateResolutionKind =
        catA === catB && !sameCatalog ? "merge-to-canonical" : "differentiate-parameters";

      pairs.push(
        Object.freeze({
          uidA: records[i].uid,
          uidB: records[j].uid,
          nameA: records[i].nameKo,
          nameB: records[j].nameKo,
          sourceA: records[i].sourceCatalog,
          sourceB: records[j].sourceCatalog,
          categoryA: catA,
          categoryB: catB,
          pairwiseRmse: Number(rmse.toFixed(5)),
          featureDistance: Number(featDist.toFixed(5)),
          sameCatalog,
          triggerReason: isRmseDup && isFeatDup ? "both" : isRmseDup ? "visual-rmse" : "feature-vector",
          recommendation,
          suggestionKo:
            recommendation === "merge-to-canonical"
              ? `교차 카탈로그 동일 매체(${BRUSH_CATEGORY_PHYSICAL_STRATEGIES[catA].labelKo}) 중복 — 고충실 정본 1종으로 통합하고 별칭 ID만 유지`
              : `시각 수렴(RMSE=${rmse.toFixed(4)}) — 경도·종이 요철·강모 분기 차이를 0.15 이상 벌려 차별화`,
        }),
      );
    }
  }

  const order = Array.from({ length: n }, (_, idx) => idx).sort((a, b) => {
    const scoreA = SOURCE_PRIORITY[records[a].sourceCatalog] + (entries[a].aligned ? 10 : 0) + adj[a].size * 0.01;
    const scoreB = SOURCE_PRIORITY[records[b].sourceCatalog] + (entries[b].aligned ? 10 : 0) + adj[b].size * 0.01;
    return scoreB - scoreA;
  });

  const assigned = new Uint8Array(n);
  const clusters: BrushDuplicateCluster[] = [];
  let clusterIndex = 1;

  for (const seed of order) {
    if (assigned[seed] || adj[seed].size === 0) continue;
    const members = [seed];
    let minRmse = Number.POSITIVE_INFINITY;
    for (const [neighbor, rmse] of adj[seed].entries()) {
      if (assigned[neighbor]) continue;
      members.push(neighbor);
      if (rmse < minRmse) minRmse = rmse;
    }
    if (members.length < 2) continue;
    for (const idx of members) assigned[idx] = 1;

    const allSameMediaCrossCatalog = members.every(
      (idx, k) =>
        k === 0 ||
        (entries[idx].inferred.category === entries[seed].inferred.category &&
          records[idx].sourceCatalog !== records[seed].sourceCatalog),
    );
    const recommendation: DuplicateResolutionKind = allSameMediaCrossCatalog
      ? "merge-to-canonical"
      : "differentiate-parameters";

    clusters.push(
      Object.freeze({
        clusterId: `dup-cluster-${String(clusterIndex).padStart(2, "0")}`,
        canonicalUid: records[seed].uid,
        canonicalName: records[seed].nameKo,
        memberUids: Object.freeze(members.map((idx) => records[idx].uid)),
        memberNames: Object.freeze(members.map((idx) => records[idx].nameKo)),
        minPairwiseRmse: Number((Number.isFinite(minRmse) ? minRmse : 0).toFixed(5)),
        recommendation,
        summaryKo:
          recommendation === "merge-to-canonical"
            ? `${records[seed].nameKo} 정본 기준 ${members.length}종 통합 대상`
            : `${records[seed].nameKo} 외 ${members.length - 1}종 파라미터 차별화 필요`,
      }),
    );
    clusterIndex += 1;
  }

  return Object.freeze({
    duplicatePairs: Object.freeze(pairs),
    duplicateClusters: Object.freeze(clusters),
  });
}

/** 전 브러시 카탈로그 통합 감사 실행(시각 중복 · 이름↔질감 정합성 · 12대 전략 변별성). */
export function runFullBrushCatalogAudit(
  options: FullBrushCatalogAuditOptions = {},
): FullBrushCatalogAuditReport {
  const records = options.records ?? loadUnifiedBrushCatalog();
  const rmseThreshold = options.duplicateRmseThreshold ?? DEFAULT_DUPLICATE_RMSE_THRESHOLD;
  const featureThreshold =
    options.duplicateFeatureDistanceThreshold ?? DEFAULT_DUPLICATE_FEATURE_DIST_THRESHOLD;

  const fingerprints = records.map(synthesizeBrushFingerprint64x32);
  const entries = records.map((record, index) =>
    auditSingleBrushNamingParity(record, fingerprints[index]),
  );

  const catalogBreakdown: Record<BrushCatalogSourceId, number> = {
    "global-master": 0,
    "csp-atelier": 0,
    "csp-executable": 0,
    "procreate-silica": 0,
    "magma-studio": 0,
    "universal-p5": 0,
    "universal-ibis-medibang": 0,
  };
  const categoryDistribution = Object.fromEntries(
    BRUSH_MEDIA_CATEGORY_IDS.map((id) => [id, 0]),
  ) as Record<BrushMediaCategoryId, number>;

  let alignedCount = 0;
  for (const entry of entries) {
    catalogBreakdown[entry.sourceCatalog] += 1;
    categoryDistribution[entry.inferred.category] += 1;
    if (entry.aligned) alignedCount += 1;
  }

  const mismatchedBrushes = entries.filter((entry) => !entry.aligned);
  const namingParityRate01 = records.length > 0 ? alignedCount / records.length : 1;
  const { duplicatePairs, duplicateClusters } = detectVisualDuplicates(
    records,
    fingerprints,
    entries,
    rmseThreshold,
    featureThreshold,
  );
  const sameCatalogDuplicatePairCount = duplicatePairs.filter((pair) => pair.sameCatalog).length;
  const crossCatalogDuplicatePairCount = duplicatePairs.length - sameCatalogDuplicatePairCount;
  const strategySeparation = evaluateStrategySeparation();

  const summaryKo =
    `전 브러시 ${records.length}종 전수 감사 완료: ` +
    `이름↔질감 정합률 ${(namingParityRate01 * 100).toFixed(1)}% (${alignedCount}/${records.length}종 일치, ` +
    `보정 대상 ${mismatchedBrushes.length}종), ` +
    `시각·특징 중복 쌍 ${duplicatePairs.length}건(동일 카탈로그 ${sameCatalogDuplicatePairCount}건 · 교차 카탈로그 ${crossCatalogDuplicatePairCount}건, ` +
    `클러스터 ${duplicateClusters.length}개), 12대 매체 전략 최소 변별 거리 ${strategySeparation.minDistance.toFixed(3)}.`;

  return Object.freeze({
    totalBrushes: records.length,
    catalogBreakdown: Object.freeze(catalogBreakdown),
    categoryDistribution: Object.freeze(categoryDistribution),
    namingParityRate01: Number(namingParityRate01.toFixed(4)),
    alignedCount,
    mismatchCount: mismatchedBrushes.length,
    entries: Object.freeze(entries),
    mismatchedBrushes: Object.freeze(mismatchedBrushes),
    duplicatePairCount: duplicatePairs.length,
    sameCatalogDuplicatePairCount,
    crossCatalogDuplicatePairCount,
    duplicatePairs,
    duplicateClusters,
    strategySeparation,
    summaryKo,
  });
}
