/**
 * 적응형 스크린-스페이스 3D LOD · 절두체 컬링 · 프레임 예산 거버너 (`AdaptiveLodGovernor`).
 *
 * - 카메라 거리 · 수직 FOV · 뷰포트 해상도 · GPU 티어(`mobile-low` / `tablet-mid` / `desktop-pro`)를
 *   기반으로 3D 씬 에셋(캐릭터 · 헤어 · 소품 · 배경)의 스크린 투영 픽셀 오차(`projectedErrorPx`)를 계산한다.
 * - `LOD0..LOD3` 동적 선택에 히스테리시스 데드밴드와 체류 프레임(dwell frames)을 적용해
 *   경계 거리 떨림에 의한 LOD 팝핑(popping)을 억제한다.
 * - 삼각형 수 · VRAM · 프레임 시간(`60Hz <= 16.67ms`, `120Hz <= 8.33ms`) 예산 초과 시
 *   우선순위가 낮은 배경·소품부터 단계적으로 LOD를 하향 클램핑한다.
 */

export type GpuDeviceTier = "mobile-low" | "tablet-mid" | "desktop-pro";
export type FrameRateTargetHz = 60 | 120;
export type LodLevel = 0 | 1 | 2 | 3;
export type SceneAssetCategory = "character" | "hair" | "prop" | "background";

export type Vec3Tuple = readonly [number, number, number];

export const FRAME_BUDGET_MS_BY_HZ: Readonly<Record<FrameRateTargetHz, number>> = Object.freeze({
  60: 16.67,
  120: 8.33,
});

export interface GpuTierBudgetProfile {
  readonly tier: GpuDeviceTier;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly maxTriangles60Hz: number;
  readonly maxTriangles120Hz: number;
  readonly maxVramMb: number;
  readonly maxAllowedErrorPx: number;
  readonly basePassOverheadMs: number;
  readonly gpuMsPer100kTris: number;
  readonly shaderCostMultiplier: number;
}

export const GPU_TIER_PROFILES: Readonly<Record<GpuDeviceTier, GpuTierBudgetProfile>> = Object.freeze({
  "mobile-low": {
    tier: "mobile-low",
    labelKo: "모바일 저전력 (Mobile Low)",
    labelEn: "Mobile Low",
    maxTriangles60Hz: 180_000,
    maxTriangles120Hz: 95_000,
    maxVramMb: 256,
    maxAllowedErrorPx: 3.2,
    basePassOverheadMs: 2.1,
    gpuMsPer100kTris: 4.4,
    shaderCostMultiplier: 1.35,
  },
  "tablet-mid": {
    tier: "tablet-mid",
    labelKo: "태블릿 중급 (Tablet Mid)",
    labelEn: "Tablet Mid",
    maxTriangles60Hz: 520_000,
    maxTriangles120Hz: 280_000,
    maxVramMb: 768,
    maxAllowedErrorPx: 2.0,
    basePassOverheadMs: 1.4,
    gpuMsPer100kTris: 1.75,
    shaderCostMultiplier: 1.0,
  },
  "desktop-pro": {
    tier: "desktop-pro",
    labelKo: "데스크톱 프로 (Desktop Pro)",
    labelEn: "Desktop Pro",
    maxTriangles60Hz: 1_800_000,
    maxTriangles120Hz: 1_050_000,
    maxVramMb: 3072,
    maxAllowedErrorPx: 1.25,
    basePassOverheadMs: 0.85,
    gpuMsPer100kTris: 0.52,
    shaderCostMultiplier: 0.65,
  },
});

export const CATEGORY_ERROR_WEIGHT: Readonly<Record<SceneAssetCategory, number>> = Object.freeze({
  character: 0.8,
  hair: 0.85,
  prop: 1.15,
  background: 1.4,
});

export interface AssetLodLevelSpec {
  readonly lod: LodLevel;
  /** 월드 공간 기하 오차(m). LOD0이 가장 작고 LOD3으로 갈수록 커진다. */
  readonly geometricErrorM: number;
  readonly triangles: number;
  readonly vramMb: number;
  /** 셰이더/머티리얼 기본 GPU 비용(ms, tablet-mid 기준). */
  readonly shaderCostMs: number;
}

export interface SceneLodAsset {
  readonly id: string;
  readonly name: string;
  readonly category: SceneAssetCategory;
  /** 예산 클램핑 시 보호 우선순위 (0~100, 높을수록 고품질 유지). */
  readonly priority: number;
  readonly position: Vec3Tuple;
  readonly boundingRadiusM: number;
  readonly lodLevels: readonly [
    AssetLodLevelSpec,
    AssetLodLevelSpec,
    AssetLodLevelSpec,
    AssetLodLevelSpec,
  ];
}

export interface CameraFrustumState {
  readonly position: Vec3Tuple;
  /** 단위 벡터가 아니어도 내부에서 정규화한다. */
  readonly forward: Vec3Tuple;
  /** 수직 시야각 (도, 20~110). */
  readonly fovDeg: number;
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly nearPlaneM: number;
  readonly farPlaneM: number;
}

export interface LodGovernorConfig {
  /** 히스테리시스 데드밴드 비율 (기본 0.16 = ±16%). */
  readonly hysteresisBandRatio?: number;
  /** 전환 확정 전 요구 체류 프레임 수 (기본 2프레임). */
  readonly minDwellFrames?: number;
}

export interface AssetLodDecision {
  readonly assetId: string;
  readonly name: string;
  readonly category: SceneAssetCategory;
  readonly priority: number;
  readonly distanceM: number;
  readonly inFrustum: boolean;
  readonly culled: boolean;
  readonly budgetCulled: boolean;
  readonly selectedLod: LodLevel;
  readonly desiredLodBeforeHysteresis: LodLevel;
  readonly desiredLodBeforeClamp: LodLevel;
  readonly projectedErrorPx: number;
  readonly maxAllowedErrorPx: number;
  readonly triangles: number;
  readonly vramMb: number;
  readonly estimatedGpuMs: number;
  readonly clampedByBudget: boolean;
  readonly hysteresisHeld: boolean;
}

export interface LodGovernorFrameReport {
  readonly frameIndex: number;
  readonly gpuTier: GpuDeviceTier;
  readonly targetFps: FrameRateTargetHz;
  readonly frameBudgetMs: number;
  readonly maxTrianglesBudget: number;
  readonly maxVramBudgetMb: number;
  readonly totalVisibleAssets: number;
  readonly totalCulledAssets: number;
  readonly totalTriangles: number;
  readonly totalVramMb: number;
  readonly estimatedFrameMs: number;
  readonly withinFrameBudget: boolean;
  readonly withinTriangleBudget: boolean;
  readonly withinVramBudget: boolean;
  readonly clampedAssetIds: readonly string[];
  readonly hysteresisHeldCount: number;
  readonly lodHistogram: Readonly<Record<LodLevel, number>>;
  readonly decisions: readonly AssetLodDecision[];
}

interface LodHysteresisEntry {
  currentLod: LodLevel;
  pendingLod: LodLevel | null;
  pendingFrames: number;
  lastErrorPx: number;
}

function normalizeVec3(v: Vec3Tuple): Vec3Tuple {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len <= 1e-6) return [0, 0, -1];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function clampFovDeg(fovDeg: number): number {
  return Math.max(20, Math.min(110, Number.isFinite(fovDeg) ? fovDeg : 50));
}

/**
 * 스크린-스페이스 투영 픽셀 오차(`projectedErrorPx`) 계산.
 * `sseScale = viewportHeightPx / (2 * tan(fovRad / 2))`
 * `projectedErrorPx = (geometricErrorM * sseScale) / max(nearPlaneM, distanceM - boundingRadiusM)`
 */
export function computeProjectedScreenSpaceErrorPx(params: {
  readonly geometricErrorM: number;
  readonly distanceM: number;
  readonly boundingRadiusM: number;
  readonly fovDeg: number;
  readonly viewportHeightPx: number;
  readonly nearPlaneM?: number;
}): number {
  const fovRad = (clampFovDeg(params.fovDeg) * Math.PI) / 180;
  const halfTan = Math.tan(fovRad * 0.5);
  const safeViewportHeight = Math.max(120, params.viewportHeightPx);
  const sseScale = safeViewportHeight / (2 * Math.max(1e-4, halfTan));
  const nearPlane = Math.max(0.05, params.nearPlaneM ?? 0.1);
  const effectiveDistance = Math.max(nearPlane, params.distanceM - Math.max(0, params.boundingRadiusM));
  return Math.max(0, (Math.max(0, params.geometricErrorM) * sseScale) / effectiveDistance);
}

/**
 * 카메라 절두체(근평면·원평면·수직/수평 반시야각 원뿔) 기준 에셋 가시성 및 거리를 판정한다.
 */
export function evaluateAssetFrustumVisibility(
  asset: Pick<SceneLodAsset, "position" | "boundingRadiusM">,
  camera: CameraFrustumState,
): { readonly inFrustum: boolean; readonly distanceM: number; readonly depthAlongForwardM: number } {
  const forward = normalizeVec3(camera.forward);
  const dx = asset.position[0] - camera.position[0];
  const dy = asset.position[1] - camera.position[1];
  const dz = asset.position[2] - camera.position[2];
  const distanceM = Math.hypot(dx, dy, dz);
  const depth = dx * forward[0] + dy * forward[1] + dz * forward[2];

  if (depth + asset.boundingRadiusM < camera.nearPlaneM) {
    return { inFrustum: false, distanceM, depthAlongForwardM: depth };
  }
  if (depth - asset.boundingRadiusM > camera.farPlaneM) {
    return { inFrustum: false, distanceM, depthAlongForwardM: depth };
  }

  // 카메라가 바운딩 구 내부에 있으면 항상 가시 상태
  if (distanceM <= asset.boundingRadiusM + camera.nearPlaneM) {
    return { inFrustum: true, distanceM, depthAlongForwardM: depth };
  }

  const aspect = Math.max(0.4, camera.viewportWidthPx / Math.max(1, camera.viewportHeightPx));
  const halfVertFovRad = (clampFovDeg(camera.fovDeg) * Math.PI) / 360;
  const halfHorizFovRad = Math.atan(Math.tan(halfVertFovRad) * aspect);
  const coneHalfAngleRad = Math.atan(
    Math.hypot(Math.tan(halfVertFovRad), Math.tan(halfHorizFovRad)),
  );

  // 투영 각도에서 바운딩 구의 각반경(angular radius)만큼 여유 허용
  const radialSq = Math.max(0, distanceM * distanceM - depth * depth);
  const radial = Math.sqrt(radialSq);
  const maxConeRadiusAtDepth = Math.max(0, depth) * Math.tan(coneHalfAngleRad);
  const sphereMargin = asset.boundingRadiusM / Math.max(0.2, Math.cos(coneHalfAngleRad));
  const inFrustum = radial <= maxConeRadiusAtDepth + sphereMargin;

  return { inFrustum, distanceM, depthAlongForwardM: depth };
}

function estimateAssetGpuMs(spec: AssetLodLevelSpec, tier: GpuTierBudgetProfile): number {
  const geomMs = (spec.triangles / 100_000) * tier.gpuMsPer100kTris;
  const shadeMs = spec.shaderCostMs * tier.shaderCostMultiplier;
  return geomMs + shadeMs;
}

function selectRawLodForAllowedError(
  asset: SceneLodAsset,
  distanceM: number,
  camera: CameraFrustumState,
  allowedErrorPx: number,
): { readonly lod: LodLevel; readonly errorsByLod: readonly [number, number, number, number] } {
  const e0 = computeProjectedScreenSpaceErrorPx({
    geometricErrorM: asset.lodLevels[0].geometricErrorM,
    distanceM,
    boundingRadiusM: asset.boundingRadiusM,
    fovDeg: camera.fovDeg,
    viewportHeightPx: camera.viewportHeightPx,
    nearPlaneM: camera.nearPlaneM,
  });
  const e1 = computeProjectedScreenSpaceErrorPx({
    geometricErrorM: asset.lodLevels[1].geometricErrorM,
    distanceM,
    boundingRadiusM: asset.boundingRadiusM,
    fovDeg: camera.fovDeg,
    viewportHeightPx: camera.viewportHeightPx,
    nearPlaneM: camera.nearPlaneM,
  });
  const e2 = computeProjectedScreenSpaceErrorPx({
    geometricErrorM: asset.lodLevels[2].geometricErrorM,
    distanceM,
    boundingRadiusM: asset.boundingRadiusM,
    fovDeg: camera.fovDeg,
    viewportHeightPx: camera.viewportHeightPx,
    nearPlaneM: camera.nearPlaneM,
  });
  const e3 = computeProjectedScreenSpaceErrorPx({
    geometricErrorM: asset.lodLevels[3].geometricErrorM,
    distanceM,
    boundingRadiusM: asset.boundingRadiusM,
    fovDeg: camera.fovDeg,
    viewportHeightPx: camera.viewportHeightPx,
    nearPlaneM: camera.nearPlaneM,
  });

  const errorsByLod: readonly [number, number, number, number] = [e0, e1, e2, e3];
  // 허용 픽셀 오차 이하를 만족하는 가장 가벼운(coarsest) LOD 선택
  if (e3 <= allowedErrorPx) return { lod: 3, errorsByLod };
  if (e2 <= allowedErrorPx) return { lod: 2, errorsByLod };
  if (e1 <= allowedErrorPx) return { lod: 1, errorsByLod };
  return { lod: 0, errorsByLod };
}

/**
 * 히스테리시스 + 삼각형/VRAM/프레임 시간 예산 클램핑을 수행하는 적응형 3D LOD 거버너.
 */
export class AdaptiveLodGovernor {
  readonly hysteresisBandRatio: number;
  readonly minDwellFrames: number;

  private readonly lodRegistry = new Map<string, LodHysteresisEntry>();
  private frameCounter = 0;

  constructor(config: LodGovernorConfig = {}) {
    this.hysteresisBandRatio = Math.max(0.05, Math.min(0.45, config.hysteresisBandRatio ?? 0.16));
    this.minDwellFrames = Math.max(1, Math.min(8, Math.floor(config.minDwellFrames ?? 2)));
  }

  /** 등록된 히스테리시스 레지스트리를 초기화한다. */
  reset(): void {
    this.lodRegistry.clear();
    this.frameCounter = 0;
  }

  /** 현재 레지스트리에 추적 중인 에셋 개수를 반환한다. */
  getTrackedAssetCount(): number {
    return this.lodRegistry.size;
  }

  /**
   * 단일 프레임을 평가해 모든 씬 에셋의 가시성 · 투영 픽셀 오차 · 히스테리시스 LOD · 예산 클램핑 결과를 산출한다.
   */
  evaluateFrame(params: {
    readonly assets: readonly SceneLodAsset[];
    readonly camera: CameraFrustumState;
    readonly gpuTier: GpuDeviceTier;
    readonly targetFps: FrameRateTargetHz;
  }): LodGovernorFrameReport {
    this.frameCounter += 1;
    const tierProfile = GPU_TIER_PROFILES[params.gpuTier];
    const frameBudgetMs = FRAME_BUDGET_MS_BY_HZ[params.targetFps];
    const maxTrianglesBudget =
      params.targetFps === 120 ? tierProfile.maxTriangles120Hz : tierProfile.maxTriangles60Hz;
    const maxVramBudgetMb = tierProfile.maxVramMb;

    interface MutableDraft {
      readonly asset: SceneLodAsset;
      readonly distanceM: number;
      readonly inFrustum: boolean;
      readonly errorsByLod: readonly [number, number, number, number];
      readonly maxAllowedErrorPx: number;
      readonly desiredLodBeforeHysteresis: LodLevel;
      readonly desiredLodBeforeClamp: LodLevel;
      selectedLod: LodLevel;
      culled: boolean;
      budgetCulled: boolean;
      clampedByBudget: boolean;
      hysteresisHeld: boolean;
    }

    const drafts: MutableDraft[] = [];
    let hysteresisHeldCount = 0;

    for (const asset of params.assets) {
      const visibility = evaluateAssetFrustumVisibility(asset, params.camera);
      const allowedErrorPx =
        tierProfile.maxAllowedErrorPx * CATEGORY_ERROR_WEIGHT[asset.category];
      const raw = selectRawLodForAllowedError(
        asset,
        visibility.distanceM,
        params.camera,
        allowedErrorPx,
      );

      if (!visibility.inFrustum) {
        drafts.push({
          asset,
          distanceM: visibility.distanceM,
          inFrustum: false,
          errorsByLod: raw.errorsByLod,
          maxAllowedErrorPx: allowedErrorPx,
          desiredLodBeforeHysteresis: raw.lod,
          desiredLodBeforeClamp: raw.lod,
          selectedLod: 3,
          culled: true,
          budgetCulled: false,
          clampedByBudget: false,
          hysteresisHeld: false,
        });
        continue;
      }

      const existing = this.lodRegistry.get(asset.id);
      let chosenLod: LodLevel = raw.lod;
      let hysteresisHeld = false;

      if (!existing) {
        this.lodRegistry.set(asset.id, {
          currentLod: raw.lod,
          pendingLod: null,
          pendingFrames: 0,
          lastErrorPx: raw.errorsByLod[raw.lod],
        });
      } else if (raw.lod !== existing.currentLod) {
        const currentLod = existing.currentLod;
        const isUpgrading = raw.lod < currentLod;
        const upgradeThreshold = allowedErrorPx * (1 + this.hysteresisBandRatio);
        const downgradeThreshold = allowedErrorPx * (1 - this.hysteresisBandRatio);

        // 현재 LOD 오차가 히스테리시스 밴드 안에 머물러 있으면 전환을 보류해 팝핑 차단
        const crossedBand = isUpgrading
          ? raw.errorsByLod[currentLod] > upgradeThreshold
          : raw.errorsByLod[raw.lod] < downgradeThreshold;

        if (!crossedBand) {
          chosenLod = currentLod;
          existing.pendingLod = null;
          existing.pendingFrames = 0;
          hysteresisHeld = true;
        } else if (existing.pendingLod === raw.lod) {
          existing.pendingFrames += 1;
          if (existing.pendingFrames >= this.minDwellFrames) {
            existing.currentLod = raw.lod;
            existing.pendingLod = null;
            existing.pendingFrames = 0;
            chosenLod = raw.lod;
          } else {
            chosenLod = currentLod;
            hysteresisHeld = true;
          }
        } else {
          if (this.minDwellFrames <= 1) {
            existing.currentLod = raw.lod;
            existing.pendingLod = null;
            existing.pendingFrames = 0;
            chosenLod = raw.lod;
          } else {
            existing.pendingLod = raw.lod;
            existing.pendingFrames = 1;
            chosenLod = currentLod;
            hysteresisHeld = true;
          }
        }
        existing.lastErrorPx = raw.errorsByLod[chosenLod];
      } else {
        existing.pendingLod = null;
        existing.pendingFrames = 0;
        existing.lastErrorPx = raw.errorsByLod[chosenLod];
      }

      if (hysteresisHeld) {
        hysteresisHeldCount += 1;
      }

      drafts.push({
        asset,
        distanceM: visibility.distanceM,
        inFrustum: true,
        errorsByLod: raw.errorsByLod,
        maxAllowedErrorPx: allowedErrorPx,
        desiredLodBeforeHysteresis: raw.lod,
        desiredLodBeforeClamp: chosenLod,
        selectedLod: chosenLod,
        culled: false,
        budgetCulled: false,
        clampedByBudget: false,
        hysteresisHeld,
      });
    }

    const computeTotals = () => {
      let tris = 0;
      let vram = 0;
      let gpuMs = tierProfile.basePassOverheadMs;
      for (const d of drafts) {
        if (d.culled) continue;
        const spec = d.asset.lodLevels[d.selectedLod];
        tris += spec.triangles;
        vram += spec.vramMb;
        gpuMs += estimateAssetGpuMs(spec, tierProfile);
      }
      return { tris, vram, gpuMs };
    };

    // Pass 2: 삼각형 · VRAM · 프레임 시간 예산 클램핑 (낮은 우선순위부터 LOD 하향)
    let totals = computeTotals();
    let safetySteps = drafts.length * 4 + 8;
    while (
      safetySteps > 0 &&
      (totals.tris > maxTrianglesBudget ||
        totals.vram > maxVramBudgetMb ||
        totals.gpuMs > frameBudgetMs)
    ) {
      safetySteps -= 1;
      const candidates = drafts.filter((d) => !d.culled && d.selectedLod < 3);
      if (candidates.length === 0) {
        // 모든 에셋이 이미 LOD3인데도 예산 초과면 저우선순위 원거리 에셋을 예산 컬링
        const cullable = drafts
          .filter((d) => !d.culled && d.asset.priority < 75)
          .sort((a, b) => a.asset.priority - b.asset.priority || b.distanceM - a.distanceM);
        const dropTarget = cullable[0];
        if (!dropTarget) break;
        dropTarget.culled = true;
        dropTarget.budgetCulled = true;
        dropTarget.clampedByBudget = true;
        totals = computeTotals();
        continue;
      }

      candidates.sort((a, b) => {
        if (a.asset.priority !== b.asset.priority) {
          return a.asset.priority - b.asset.priority;
        }
        const currA = a.asset.lodLevels[a.selectedLod];
        const nextA = a.asset.lodLevels[(a.selectedLod + 1) as LodLevel];
        const currB = b.asset.lodLevels[b.selectedLod];
        const nextB = b.asset.lodLevels[(b.selectedLod + 1) as LodLevel];
        const saveA = currA.triangles - nextA.triangles + (currA.vramMb - nextA.vramMb) * 1500;
        const saveB = currB.triangles - nextB.triangles + (currB.vramMb - nextB.vramMb) * 1500;
        return saveB - saveA;
      });

      const victim = candidates[0];
      if (!victim) break;
      victim.selectedLod = (victim.selectedLod + 1) as LodLevel;
      victim.clampedByBudget = true;
      const entry = this.lodRegistry.get(victim.asset.id);
      if (entry) {
        entry.currentLod = victim.selectedLod;
      }
      totals = computeTotals();
    }

    const lodHistogram: Record<LodLevel, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    const clampedAssetIds: string[] = [];
    let totalVisibleAssets = 0;
    let totalCulledAssets = 0;

    const decisions: AssetLodDecision[] = drafts.map((d) => {
      if (d.clampedByBudget) {
        clampedAssetIds.push(d.asset.id);
      }
      if (d.culled) {
        totalCulledAssets += 1;
        return {
          assetId: d.asset.id,
          name: d.asset.name,
          category: d.asset.category,
          priority: d.asset.priority,
          distanceM: d.distanceM,
          inFrustum: d.inFrustum,
          culled: true,
          budgetCulled: d.budgetCulled,
          selectedLod: d.selectedLod,
          desiredLodBeforeHysteresis: d.desiredLodBeforeHysteresis,
          desiredLodBeforeClamp: d.desiredLodBeforeClamp,
          projectedErrorPx: d.errorsByLod[d.selectedLod],
          maxAllowedErrorPx: d.maxAllowedErrorPx,
          triangles: 0,
          vramMb: 0,
          estimatedGpuMs: 0,
          clampedByBudget: d.clampedByBudget,
          hysteresisHeld: d.hysteresisHeld,
        };
      }

      totalVisibleAssets += 1;
      lodHistogram[d.selectedLod] += 1;
      const spec = d.asset.lodLevels[d.selectedLod];
      return {
        assetId: d.asset.id,
        name: d.asset.name,
        category: d.asset.category,
        priority: d.asset.priority,
        distanceM: d.distanceM,
        inFrustum: d.inFrustum,
        culled: false,
        budgetCulled: false,
        selectedLod: d.selectedLod,
        desiredLodBeforeHysteresis: d.desiredLodBeforeHysteresis,
        desiredLodBeforeClamp: d.desiredLodBeforeClamp,
        projectedErrorPx: d.errorsByLod[d.selectedLod],
        maxAllowedErrorPx: d.maxAllowedErrorPx,
        triangles: spec.triangles,
        vramMb: spec.vramMb,
        estimatedGpuMs: estimateAssetGpuMs(spec, tierProfile),
        clampedByBudget: d.clampedByBudget,
        hysteresisHeld: d.hysteresisHeld,
      };
    });

    return {
      frameIndex: this.frameCounter,
      gpuTier: params.gpuTier,
      targetFps: params.targetFps,
      frameBudgetMs,
      maxTrianglesBudget,
      maxVramBudgetMb,
      totalVisibleAssets,
      totalCulledAssets,
      totalTriangles: totals.tris,
      totalVramMb: Number(totals.vram.toFixed(1)),
      estimatedFrameMs: Number(totals.gpuMs.toFixed(2)),
      withinFrameBudget: totals.gpuMs <= frameBudgetMs,
      withinTriangleBudget: totals.tris <= maxTrianglesBudget,
      withinVramBudget: totals.vram <= maxVramBudgetMb,
      clampedAssetIds,
      hysteresisHeldCount,
      lodHistogram,
      decisions,
    };
  }
}

/** 웹툰 3D 스튜디오 대표 씬 프리셋 (캐릭터 · 헤어 · 소품 · 실내/원경 배경 · 후방 절두체 밖 에셋 포함). */
export function createDefaultWebtoonSceneAssets(): readonly SceneLodAsset[] {
  return [
    {
      id: "hero-character",
      name: "주인공 VRM 캐릭터",
      category: "character",
      priority: 98,
      position: [0, 0, -4.2],
      boundingRadiusM: 1.0,
      lodLevels: [
        { lod: 0, geometricErrorM: 0.0012, triangles: 96_000, vramMb: 84, shaderCostMs: 1.35 },
        { lod: 1, geometricErrorM: 0.0065, triangles: 46_000, vramMb: 48, shaderCostMs: 0.92 },
        { lod: 2, geometricErrorM: 0.019, triangles: 18_000, vramMb: 24, shaderCostMs: 0.56 },
        { lod: 3, geometricErrorM: 0.052, triangles: 6_200, vramMb: 12, shaderCostMs: 0.31 },
      ],
    },
    {
      id: "hero-hair-rig",
      name: "주인공 물리 헤어 스트랜드",
      category: "hair",
      priority: 92,
      position: [0.05, 0.65, -4.15],
      boundingRadiusM: 0.45,
      lodLevels: [
        { lod: 0, geometricErrorM: 0.001, triangles: 72_000, vramMb: 62, shaderCostMs: 1.45 },
        { lod: 1, geometricErrorM: 0.0055, triangles: 32_000, vramMb: 34, shaderCostMs: 0.88 },
        { lod: 2, geometricErrorM: 0.017, triangles: 12_500, vramMb: 18, shaderCostMs: 0.48 },
        { lod: 3, geometricErrorM: 0.044, triangles: 4_100, vramMb: 9, shaderCostMs: 0.25 },
      ],
    },
    {
      id: "sub-character",
      name: "조연 VRM 캐릭터",
      category: "character",
      priority: 82,
      position: [2.1, 0, -8.5],
      boundingRadiusM: 1.0,
      lodLevels: [
        { lod: 0, geometricErrorM: 0.0014, triangles: 84_000, vramMb: 72, shaderCostMs: 1.15 },
        { lod: 1, geometricErrorM: 0.0075, triangles: 38_000, vramMb: 40, shaderCostMs: 0.78 },
        { lod: 2, geometricErrorM: 0.022, triangles: 14_500, vramMb: 20, shaderCostMs: 0.44 },
        { lod: 3, geometricErrorM: 0.058, triangles: 5_000, vramMb: 10, shaderCostMs: 0.24 },
      ],
    },
    {
      id: "hero-desk-prop",
      name: "아틀리에 제도 책상·소품",
      category: "prop",
      priority: 64,
      position: [-1.4, -0.4, -5.6],
      boundingRadiusM: 1.2,
      lodLevels: [
        { lod: 0, geometricErrorM: 0.0018, triangles: 64_000, vramMb: 54, shaderCostMs: 0.82 },
        { lod: 1, geometricErrorM: 0.009, triangles: 28_000, vramMb: 30, shaderCostMs: 0.54 },
        { lod: 2, geometricErrorM: 0.026, triangles: 10_200, vramMb: 16, shaderCostMs: 0.34 },
        { lod: 3, geometricErrorM: 0.068, triangles: 3_400, vramMb: 8, shaderCostMs: 0.18 },
      ],
    },
    {
      id: "interior-atelier-bg",
      name: "실내 아틀리에 건축 배경",
      category: "background",
      priority: 48,
      position: [0, 0.5, -14.0],
      boundingRadiusM: 5.5,
      lodLevels: [
        { lod: 0, geometricErrorM: 0.003, triangles: 220_000, vramMb: 168, shaderCostMs: 1.75 },
        { lod: 1, geometricErrorM: 0.014, triangles: 105_000, vramMb: 96, shaderCostMs: 1.05 },
        { lod: 2, geometricErrorM: 0.042, triangles: 42_000, vramMb: 48, shaderCostMs: 0.62 },
        { lod: 3, geometricErrorM: 0.11, triangles: 14_000, vramMb: 22, shaderCostMs: 0.32 },
      ],
    },
    {
      id: "distant-city-skyline",
      name: "창밖 원경 도시 스카이라인",
      category: "background",
      priority: 26,
      position: [3.2, 1.8, -42.0],
      boundingRadiusM: 12.0,
      lodLevels: [
        { lod: 0, geometricErrorM: 0.006, triangles: 310_000, vramMb: 196, shaderCostMs: 1.9 },
        { lod: 1, geometricErrorM: 0.024, triangles: 135_000, vramMb: 102, shaderCostMs: 1.1 },
        { lod: 2, geometricErrorM: 0.075, triangles: 46_000, vramMb: 46, shaderCostMs: 0.58 },
        { lod: 3, geometricErrorM: 0.19, triangles: 12_000, vramMb: 18, shaderCostMs: 0.28 },
      ],
    },
    {
      id: "rear-corridor-prop",
      name: "카메라 후방 복도 소품 (절두체 외부)",
      category: "prop",
      priority: 30,
      position: [0, 0, 8.5],
      boundingRadiusM: 1.1,
      lodLevels: [
        { lod: 0, geometricErrorM: 0.002, triangles: 52_000, vramMb: 44, shaderCostMs: 0.7 },
        { lod: 1, geometricErrorM: 0.01, triangles: 22_000, vramMb: 24, shaderCostMs: 0.45 },
        { lod: 2, geometricErrorM: 0.03, triangles: 8_400, vramMb: 12, shaderCostMs: 0.25 },
        { lod: 3, geometricErrorM: 0.08, triangles: 2_600, vramMb: 6, shaderCostMs: 0.14 },
      ],
    },
  ];
}
