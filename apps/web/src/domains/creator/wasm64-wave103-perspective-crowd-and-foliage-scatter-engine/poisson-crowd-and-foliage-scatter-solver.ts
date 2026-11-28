/**
 * Wave 103 — 원근 인식 가변 반경 포아송 디스크 군중·식생 배치 및 복제 방지 다양성 솔버.
 *
 * - 월드 지면 발자국 비충돌 제약(`distXZ >= (rA + rB) * spacingMultiplier`)으로 원근 압축 밀도 자연 형성
 * - 주인공 실루엣·말풍선·시선 통로 보호구역(Keep-Out Zone) 침범 0건 강제
 * - 인접 최근접 이웃 복제 방지(Anti-Clone) 그래프 컬러링 및 정규화 섀넌 다양성 엔트로피 산출
 * - 원경→근경(Painter's Order) 엄격 깊이 정렬 및 사후 무결성 검증
 */

import {
  assertValidPerspectiveGroundStage,
  boxesIntersect,
  clamp01,
  clampNumber,
  computeAtmosphericDepthStyling,
  expandBoundingBox,
  groundYToWorldDepthMeters,
  projectStandingFigure,
  resolveStageDepthRange,
  screenGroundToWorldXZ,
  type AtmosphericDepthStyle,
  type DetailTier,
  type PerspectiveGroundStage,
  type ScreenBoundingBox,
} from "./horizon-perspective-projection-and-density";
import {
  buildVariantSignature,
  mulberry32,
  SCATTER_TEMPLATE_BY_ID,
  type CrowdScatterMetrics,
  type CrowdScatterOptions,
  type CrowdScatterResult,
  type DepthDistributionMode,
  type EyeHeightLockMode,
  type KeepOutZone,
  type PlacedScatterEntity,
  type ScatterArchetypeId,
  type ScatterAssetCategory,
  type ScatterAssetTemplate,
} from "./scatter-archetype-catalog";

export {
  buildVariantSignature,
  createMulberry32,
  DEFAULT_SCATTER_ASSET_TEMPLATES,
  mulberry32,
  SCATTER_TEMPLATE_BY_ID,
  type CrowdScatterMetrics,
  type CrowdScatterOptions,
  type CrowdScatterResult,
  type DepthDistributionMode,
  type EyeHeightLockMode,
  type KeepOutRole,
  type KeepOutZone,
  type PlacedScatterEntity,
  type ScatterArchetypeId,
  type ScatterAssetCategory,
  type ScatterAssetTemplate,
} from "./scatter-archetype-catalog";

interface VariantOption {
  readonly poseVariant: string;
  readonly mirrored: boolean;
  readonly signature: string;
}

interface MutablePlacedRecord {
  id: string;
  template: ScatterAssetTemplate;
  poseVariant: string;
  mirrored: boolean;
  variantSignature: string;
  footprintRadiusM: number;
  projected: ReturnType<typeof projectStandingFigure>;
  atmosphericStyle: AtmosphericDepthStyle;
}

function getTemplateVariants(template: ScatterAssetTemplate): readonly VariantOption[] {
  const poses = template.poseVariants.length > 0 ? template.poseVariants : ["default"];
  const mirrors: readonly boolean[] = template.allowMirror ? [false, true] : [false];
  const list: VariantOption[] = [];
  for (const poseVariant of poses) {
    for (const mirrored of mirrors) {
      list.push({
        poseVariant,
        mirrored,
        signature: buildVariantSignature(template.id, poseVariant, mirrored),
      });
    }
  }
  return list;
}

function resolveActiveTemplates(options: CrowdScatterOptions): readonly ScatterAssetTemplate[] {
  if (options.templates && options.templates.length > 0) return options.templates;
  if (options.archetypeIds && options.archetypeIds.length > 0) {
    return options.archetypeIds.map((id) => SCATTER_TEMPLATE_BY_ID[id]);
  }
  return [
    SCATTER_TEMPLATE_BY_ID["bystander-walker"],
    SCATTER_TEMPLATE_BY_ID["bystander-commuter"],
    SCATTER_TEMPLATE_BY_ID["student-uniform"],
  ];
}

function sampleWeightedTemplate(
  templates: readonly ScatterAssetTemplate[],
  weights: readonly number[],
  rng: () => number,
): ScatterAssetTemplate {
  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0) return templates[0];
  let roll = rng() * total;
  for (let i = 0; i < templates.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return templates[i];
  }
  return templates[templates.length - 1];
}

function sampleCandidateFootY(
  stage: PerspectiveGroundStage,
  mode: DepthDistributionMode,
  stratumIndex: number,
  stratumCount: number,
  rng: () => number,
): number {
  const { nearGroundYPx, farGroundYPx } = stage;
  const spanY = nearGroundYPx - farGroundYPx;
  const jitter = clamp01((stratumIndex + rng()) / Math.max(1, stratumCount));
  if (mode === "horizon-dense") return farGroundYPx + spanY * Math.pow(jitter, 1.45);
  if (mode === "log-depth") {
    const nearDepth = groundYToWorldDepthMeters(nearGroundYPx, stage);
    const farDepth = groundYToWorldDepthMeters(farGroundYPx, stage);
    const depth = nearDepth * Math.pow(farDepth / nearDepth, jitter);
    return stage.horizonYPx + (stage.cameraEyeHeightMeters * stage.focalLengthPx) / depth;
  }
  return farGroundYPx + spanY * jitter;
}

function hasWorldCollision(
  worldX: number,
  depthMeters: number,
  footprintRadiusM: number,
  placed: readonly MutablePlacedRecord[],
  spacingMultiplier: number,
): boolean {
  for (const existing of placed) {
    const minDist = (existing.footprintRadiusM + footprintRadiusM) * spacingMultiplier;
    const dx = existing.projected.worldXMeters - worldX;
    const dz = existing.projected.depthMeters - depthMeters;
    if (dx * dx + dz * dz < minDist * minDist) return true;
  }
  return false;
}

function intersectsAnyKeepOut(
  bbox: ScreenBoundingBox,
  expandedKeepOuts: readonly ScreenBoundingBox[],
): boolean {
  for (const zoneBox of expandedKeepOuts) {
    if (boxesIntersect(bbox, zoneBox)) return true;
  }
  return false;
}

function findNearestNeighbors(records: readonly MutablePlacedRecord[]): {
  readonly nearestWorld: readonly number[];
  readonly nearestScreen: readonly number[];
  readonly conflictAdj: readonly (readonly number[])[];
} {
  const n = records.length;
  const nearestWorld = new Array<number>(n).fill(-1);
  const nearestScreen = new Array<number>(n).fill(-1);
  const adjSets: Array<Set<number>> = Array.from({ length: n }, () => new Set<number>());

  for (let i = 0; i < n; i += 1) {
    let bestWIdx = -1;
    let bestWDistSq = Infinity;
    let bestSIdx = -1;
    let bestSDistSq = Infinity;
    const a = records[i].projected;
    for (let j = 0; j < n; j += 1) {
      if (i === j) continue;
      const b = records[j].projected;
      const wDistSq =
        (a.worldXMeters - b.worldXMeters) ** 2 + (a.depthMeters - b.depthMeters) ** 2;
      if (wDistSq < bestWDistSq) {
        bestWDistSq = wDistSq;
        bestWIdx = j;
      }
      const sDistSq = (a.footScreenX - b.footScreenX) ** 2 + (a.footScreenY - b.footScreenY) ** 2;
      if (sDistSq < bestSDistSq) {
        bestSDistSq = sDistSq;
        bestSIdx = j;
      }
    }
    nearestWorld[i] = bestWIdx;
    nearestScreen[i] = bestSIdx;
    if (bestWIdx >= 0) {
      adjSets[i].add(bestWIdx);
      adjSets[bestWIdx].add(i);
    }
    if (bestSIdx >= 0) {
      adjSets[i].add(bestSIdx);
      adjSets[bestSIdx].add(i);
    }
  }
  return { nearestWorld, nearestScreen, conflictAdj: adjSets.map((s) => Array.from(s)) };
}

/**
 * 배치된 개체들의 최근접 이웃 복제 충돌을 0으로 수렴시키고 전역 변형 균형을 맞춘다.
 */
function enforceAntiCloneDiversity(
  records: MutablePlacedRecord[],
  variantsByTemplate: ReadonlyMap<ScatterArchetypeId, readonly VariantOption[]>,
  rng: () => number,
): void {
  if (records.length <= 1) return;
  const { nearestWorld, nearestScreen, conflictAdj } = findNearestNeighbors(records);
  const globalCounts = new Map<string, number>();
  for (const rec of records) {
    globalCounts.set(rec.variantSignature, (globalCounts.get(rec.variantSignature) ?? 0) + 1);
  }

  for (let sweep = 0; sweep < 6; sweep += 1) {
    let changed = false;
    for (let i = 0; i < records.length; i += 1) {
      const rec = records[i];
      const options = variantsByTemplate.get(rec.template.id) ?? getTemplateVariants(rec.template);
      if (options.length <= 1) continue;

      const directW = nearestWorld[i];
      const directS = nearestScreen[i];
      const directConflict =
        (directW >= 0 && records[directW].variantSignature === rec.variantSignature) ||
        (directS >= 0 && records[directS].variantSignature === rec.variantSignature);
      const adjConflictCount = conflictAdj[i].reduce(
        (acc, nb) => acc + (records[nb].variantSignature === rec.variantSignature ? 1 : 0),
        0,
      );
      if (!directConflict && adjConflictCount === 0 && sweep > 0) continue;

      let bestOption: VariantOption = {
        poseVariant: rec.poseVariant,
        mirrored: rec.mirrored,
        signature: rec.variantSignature,
      };
      let bestScore = Infinity;
      const offset = Math.floor(rng() * options.length);

      for (let k = 0; k < options.length; k += 1) {
        const cand = options[(offset + k) % options.length];
        const directHit =
          (directW >= 0 && records[directW].variantSignature === cand.signature ? 1 : 0) +
          (directS >= 0 && records[directS].variantSignature === cand.signature ? 1 : 0);
        let adjHits = 0;
        for (const nb of conflictAdj[i]) {
          if (records[nb].variantSignature === cand.signature) adjHits += 1;
        }
        const usage =
          (globalCounts.get(cand.signature) ?? 0) -
          (cand.signature === rec.variantSignature ? 1 : 0);
        const score = directHit * 10000 + adjHits * 100 + usage;
        if (score < bestScore) {
          bestScore = score;
          bestOption = cand;
        }
      }

      if (bestOption.signature !== rec.variantSignature) {
        globalCounts.set(rec.variantSignature, (globalCounts.get(rec.variantSignature) ?? 1) - 1);
        rec.poseVariant = bestOption.poseVariant;
        rec.mirrored = bestOption.mirrored;
        rec.variantSignature = bestOption.signature;
        globalCounts.set(bestOption.signature, (globalCounts.get(bestOption.signature) ?? 0) + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }
}

/**
 * 정규화된 섀넌 다양성 엔트로피(`0..1`)를 계산한다.
 */
export function computeDiversityEntropy01(
  variantSignatures: readonly string[],
  availableVariantCount: number,
): number {
  const n = variantSignatures.length;
  const maxCategories = Math.min(n, Math.max(1, availableVariantCount));
  if (n <= 1 || maxCategories <= 1) return 0;

  const counts = new Map<string, number>();
  for (const sig of variantSignatures) counts.set(sig, (counts.get(sig) ?? 0) + 1);

  let shannon = 0;
  for (const count of counts.values()) {
    const p = count / n;
    if (p > 0) shannon -= p * Math.log(p);
  }
  const maxEntropy = Math.log(maxCategories);
  return maxEntropy <= 0 ? 0 : clamp01(shannon / maxEntropy);
}

function auditFinalPlacement(params: {
  readonly placed: readonly MutablePlacedRecord[];
  readonly finalEntities: readonly PlacedScatterEntity[];
  readonly expandedKeepOuts: readonly ScreenBoundingBox[];
  readonly spacingMultiplier: number;
  readonly requestedCount: number;
  readonly attemptsUsed: number;
  readonly rejectedCollisionCount: number;
  readonly rejectedKeepOutCount: number;
  readonly rejectedBoundsCount: number;
  readonly availableVariantCount: number;
  readonly horizonCompressionFactor: number;
}): CrowdScatterMetrics {
  const { placed, finalEntities, expandedKeepOuts, spacingMultiplier } = params;
  let worldCollisionCount = 0;
  for (let i = 0; i < finalEntities.length; i += 1) {
    for (let j = i + 1; j < finalEntities.length; j += 1) {
      const a = finalEntities[i];
      const b = finalEntities[j];
      const minDist = (a.footprintRadiusM + b.footprintRadiusM) * spacingMultiplier;
      const dx = a.worldXMeters - b.worldXMeters;
      const dz = a.depthMeters - b.depthMeters;
      if (dx * dx + dz * dz < minDist * minDist - 1e-9) worldCollisionCount += 1;
    }
  }

  let keepOutViolationCount = 0;
  for (const ent of finalEntities) {
    if (intersectsAnyKeepOut(ent.bbox, expandedKeepOuts)) keepOutViolationCount += 1;
  }

  const finalNeighbors = findNearestNeighbors(placed);
  let adjacentCloneConflictCount = 0;
  for (let i = 0; i < placed.length; i += 1) {
    const wIdx = finalNeighbors.nearestWorld[i];
    const sIdx = finalNeighbors.nearestScreen[i];
    if (
      (wIdx >= 0 && placed[wIdx].variantSignature === placed[i].variantSignature) ||
      (sIdx >= 0 && placed[sIdx].variantSignature === placed[i].variantSignature)
    ) {
      adjacentCloneConflictCount += 1;
    }
  }

  let isDepthSortedBackToFront = true;
  for (let i = 0; i < finalEntities.length - 1; i += 1) {
    if (finalEntities[i].depthMeters < finalEntities[i + 1].depthMeters) {
      isDepthSortedBackToFront = false;
      break;
    }
  }

  const tierCounts: Record<DetailTier, number> = {
    "detailed-foreground": 0,
    "midground-contour": 0,
    "soft-background-wash": 0,
  };
  const categoryCounts: Record<ScatterAssetCategory, number> = { human: 0, foliage: 0, prop: 0 };
  let maxHorizonEyeErrorPx = 0;
  let maxCanonicalHorizonEyeErrorPx = 0;
  let nearSum = 0;
  let nearCount = 0;
  let farSum = 0;
  let farCount = 0;
  const uniqueSignatures = new Set<string>();

  for (const ent of finalEntities) {
    tierCounts[ent.atmosphericStyle.detailTier] += 1;
    categoryCounts[ent.category] += 1;
    uniqueSignatures.add(ent.variantSignature);
    if (ent.category === "human") {
      maxHorizonEyeErrorPx = Math.max(maxHorizonEyeErrorPx, ent.horizonEyeErrorPx);
      maxCanonicalHorizonEyeErrorPx = Math.max(
        maxCanonicalHorizonEyeErrorPx,
        ent.canonicalHorizonEyeErrorPx,
      );
    }
    if (ent.atmosphericStyle.detailTier === "detailed-foreground") {
      nearSum += ent.screenHeightPx;
      nearCount += 1;
    } else if (ent.atmosphericStyle.detailTier === "soft-background-wash") {
      farSum += ent.screenHeightPx;
      farCount += 1;
    }
  }

  return {
    requestedCount: params.requestedCount,
    placedCount: finalEntities.length,
    attemptsUsed: params.attemptsUsed,
    rejectedCollisionCount: params.rejectedCollisionCount,
    rejectedKeepOutCount: params.rejectedKeepOutCount,
    rejectedBoundsCount: params.rejectedBoundsCount,
    worldCollisionCount,
    keepOutViolationCount,
    adjacentCloneConflictCount,
    diversityEntropy01: computeDiversityEntropy01(
      finalEntities.map((ent) => ent.variantSignature),
      params.availableVariantCount,
    ),
    uniqueVariantCount: uniqueSignatures.size,
    availableVariantCount: params.availableVariantCount,
    maxHorizonEyeErrorPx,
    maxCanonicalHorizonEyeErrorPx,
    isDepthSortedBackToFront,
    tierCounts,
    categoryCounts,
    meanScreenHeightNearPx: nearCount > 0 ? nearSum / nearCount : 0,
    meanScreenHeightFarPx: farCount > 0 ? farSum / farCount : 0,
    horizonCompressionFactor: params.horizonCompressionFactor,
  };
}

/**
 * 원근 지평선 잠금 가변 반경 포아송 디스크 군중·식생 배치 솔버.
 */
export function scatterPerspectiveCrowdAndFoliage(
  options: CrowdScatterOptions,
): CrowdScatterResult {
  const { stage } = options;
  assertValidPerspectiveGroundStage(stage);

  const requestedCount = Math.max(0, Math.floor(options.targetCount));
  const spacingMultiplier = Math.max(0.5, options.spacingMultiplier ?? 1.05);
  const edgeMarginPx = clampNumber(options.edgeMarginPx ?? 18, 0, stage.viewportWidthPx * 0.4);
  const depthDistribution: DepthDistributionMode = options.depthDistribution ?? "screen-balanced";
  const eyeHeightLockMode: EyeHeightLockMode =
    options.eyeHeightLockMode ?? "natural-height-band";
  const keepOutZones: readonly KeepOutZone[] = options.keepOutZones ?? [];
  const expandedKeepOuts = keepOutZones.map((zone) =>
    expandBoundingBox(zone.bbox, zone.paddingPx ?? 0),
  );

  const activeTemplates = resolveActiveTemplates(options);
  const templateWeights = activeTemplates.map((tpl) => {
    const custom = options.archetypeWeights?.[tpl.id];
    return custom !== undefined && Number.isFinite(custom) && custom >= 0
      ? custom
      : tpl.defaultWeight;
  });

  const variantsByTemplate = new Map<ScatterArchetypeId, readonly VariantOption[]>();
  let availableVariantCount = 0;
  for (const tpl of activeTemplates) {
    const variants = getTemplateVariants(tpl);
    variantsByTemplate.set(tpl.id, variants);
    availableVariantCount += variants.length;
  }

  const { nearDepthMeters, farDepthMeters, horizonCompressionFactor } =
    resolveStageDepthRange(stage);

  const rng = mulberry32(options.seed);
  const placed: MutablePlacedRecord[] = [];
  const activeIndices: number[] = [];
  const variantUsage = new Map<string, number>();

  const maxAttemptsMultiplier = Math.max(8, Math.floor(options.maxAttemptsMultiplier ?? 38));
  const maxAttempts =
    requestedCount === 0 ? 0 : Math.max(180, requestedCount * maxAttemptsMultiplier);
  const activeExpansionCandidates = Math.max(4, Math.floor(options.activeExpansionCandidates ?? 16));

  let attemptsUsed = 0;
  let rejectedCollisionCount = 0;
  let rejectedKeepOutCount = 0;
  let rejectedBoundsCount = 0;
  const stratumCount = Math.max(3, Math.min(12, Math.ceil(requestedCount / 4)));
  let nextStratum = 0;

  const tryPlaceAtWorld = (
    worldXMeters: number,
    depthMeters: number,
    template: ScatterAssetTemplate,
  ): boolean => {
    attemptsUsed += 1;
    if (depthMeters < nearDepthMeters - 1e-6 || depthMeters > farDepthMeters + 1e-6) {
      rejectedBoundsCount += 1;
      return false;
    }

    const clampedDepth = clampNumber(depthMeters, nearDepthMeters, farDepthMeters);
    const rawHeight =
      template.minHeightMeters + rng() * (template.maxHeightMeters - template.minHeightMeters);
    const lockExact = template.category === "human" && eyeHeightLockMode === "exact-camera-eye-level";
    const physicalHeightMeters = lockExact
      ? stage.cameraEyeHeightMeters / template.eyeHeightRatio
      : rawHeight;
    const physicalWidthMeters =
      template.minWidthMeters + rng() * (template.maxWidthMeters - template.minWidthMeters);
    const eyeHeightMeters = lockExact
      ? stage.cameraEyeHeightMeters
      : physicalHeightMeters * template.eyeHeightRatio;

    const projected = projectStandingFigure({
      worldXMeters,
      depthMeters: clampedDepth,
      physicalHeightMeters,
      physicalWidthMeters,
      stage,
      eyeHeightMeters,
    });

    if (
      projected.footScreenX < edgeMarginPx ||
      projected.footScreenX > stage.viewportWidthPx - edgeMarginPx ||
      projected.footScreenY < stage.farGroundYPx - 0.5 ||
      projected.footScreenY > stage.nearGroundYPx + 0.5
    ) {
      rejectedBoundsCount += 1;
      return false;
    }
    if (hasWorldCollision(worldXMeters, clampedDepth, template.footprintRadiusM, placed, spacingMultiplier)) {
      rejectedCollisionCount += 1;
      return false;
    }
    if (intersectsAnyKeepOut(projected.bbox, expandedKeepOuts)) {
      rejectedKeepOutCount += 1;
      return false;
    }

    const variants = variantsByTemplate.get(template.id) ?? getTemplateVariants(template);
    let chosenVariant = variants[0];
    let lowestCount = Infinity;
    const startIdx = Math.floor(rng() * variants.length);
    for (let k = 0; k < variants.length; k += 1) {
      const candidate = variants[(startIdx + k) % variants.length];
      const count = variantUsage.get(candidate.signature) ?? 0;
      if (count < lowestCount) {
        lowestCount = count;
        chosenVariant = candidate;
      }
    }

    variantUsage.set(chosenVariant.signature, (variantUsage.get(chosenVariant.signature) ?? 0) + 1);
    const nextIndex = placed.length;
    placed.push({
      id: `entity-${String(nextIndex + 1).padStart(3, "0")}`,
      template,
      poseVariant: chosenVariant.poseVariant,
      mirrored: chosenVariant.mirrored,
      variantSignature: chosenVariant.signature,
      footprintRadiusM: template.footprintRadiusM,
      projected,
      atmosphericStyle: computeAtmosphericDepthStyling(
        clampedDepth,
        nearDepthMeters,
        farDepthMeters,
      ),
    });
    activeIndices.push(nextIndex);
    return true;
  };

  while (placed.length < requestedCount && attemptsUsed < maxAttempts) {
    if (activeIndices.length > 0 && rng() < 0.62) {
      const activeSlot = Math.floor(rng() * activeIndices.length);
      const anchor = placed[activeIndices[activeSlot]];
      let expanded = false;
      for (let k = 0; k < activeExpansionCandidates && attemptsUsed < maxAttempts; k += 1) {
        const template = sampleWeightedTemplate(activeTemplates, templateWeights, rng);
        const minDist = (anchor.footprintRadiusM + template.footprintRadiusM) * spacingMultiplier;
        const radius = minDist * (1.03 + rng() * 1.45);
        const angle = rng() * Math.PI * 2;
        if (
          tryPlaceAtWorld(
            anchor.projected.worldXMeters + Math.cos(angle) * radius,
            anchor.projected.depthMeters + Math.sin(angle) * radius,
            template,
          )
        ) {
          expanded = true;
          break;
        }
      }
      if (!expanded) activeIndices.splice(activeSlot, 1);
      continue;
    }

    const template = sampleWeightedTemplate(activeTemplates, templateWeights, rng);
    const footY = sampleCandidateFootY(
      stage,
      depthDistribution,
      nextStratum % stratumCount,
      stratumCount,
      rng,
    );
    nextStratum += 1;
    const screenX =
      edgeMarginPx + rng() * Math.max(1, stage.viewportWidthPx - edgeMarginPx * 2);
    const worldPt = screenGroundToWorldXZ(screenX, footY, stage);
    tryPlaceAtWorld(worldPt.xMeters, worldPt.zMeters, template);
  }

  enforceAntiCloneDiversity(placed, variantsByTemplate, rng);

  // 원경 → 근경(Painter's Order) 엄격 내림차순 정렬
  placed.sort((a, b) => {
    if (b.projected.depthMeters !== a.projected.depthMeters) {
      return b.projected.depthMeters - a.projected.depthMeters;
    }
    if (a.projected.worldXMeters !== b.projected.worldXMeters) {
      return a.projected.worldXMeters - b.projected.worldXMeters;
    }
    return a.id.localeCompare(b.id);
  });

  const finalEntities: PlacedScatterEntity[] = placed.map((rec, index) => ({
    ...rec.projected,
    id: `ent-${String(index + 1).padStart(3, "0")}`,
    painterOrderIndex: index,
    templateId: rec.template.id,
    labelKo: rec.template.labelKo,
    category: rec.template.category,
    poseVariant: rec.poseVariant,
    mirrored: rec.mirrored,
    variantSignature: rec.variantSignature,
    footprintRadiusM: rec.footprintRadiusM,
    atmosphericStyle: rec.atmosphericStyle,
  }));

  return {
    stage,
    seed: options.seed,
    spacingMultiplier,
    depthDistribution,
    eyeHeightLockMode,
    nearDepthMeters,
    farDepthMeters,
    keepOutZones,
    entities: finalEntities,
    metrics: auditFinalPlacement({
      placed,
      finalEntities,
      expandedKeepOuts,
      spacingMultiplier,
      requestedCount,
      attemptsUsed,
      rejectedCollisionCount,
      rejectedKeepOutCount,
      rejectedBoundsCount,
      availableVariantCount,
      horizonCompressionFactor,
    }),
  };
}
