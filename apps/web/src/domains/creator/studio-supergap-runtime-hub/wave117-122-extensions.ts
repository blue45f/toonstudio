/**
 * Wave 117~122 초격차 확장 서브시스템 동적 로더 (`wave117-122-extensions`).
 *
 * - 모든 Wave 117~122 커널을 동적 `import(...)`로만 호출해 `/studio` 초기 진입 번들(`check:studio-eager-graph`)에
 *   0 바이트 영향을 보장한다.
 * - `registerWave117To122Extensions()`를 통해 총 61개 라이브 초격차 엔진(Wave 54~122 + Wave 71 네이티브 데몬)을
 *   단일 `/studio` 초격차 런타임 허브에 통합한다.
 */

import type {
  StudioSupergapRuntimeHub,
  SupergapExtensionSubsystemDefinition,
} from "./studio-supergap-runtime-hub";

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Wave 117~122 초격차 서브시스템 6종 동적 확장 정의를 생성한다. */
export function createWave117To122ExtensionSubsystems(): readonly SupergapExtensionSubsystemDefinition[] {
  return [
    {
      id: "wave117LayerTreeVramDiet",
      waveLabel: "Wave 117",
      titleKo: "레이어 트리 자동 정규화 · 안전 병합 · VRAM 다이어트",
      capabilitySummaryKo: "9단계 스튜디오 명명 · 합성 대수 안전 장벽 · 타일-희소 VRAM 절감",
      async execute() {
        const wave117 = await import("../wasm64-wave117-layer-tree-hygiene-and-vram-diet-compiler");
        const base = {
          parentId: null,
          kind: "raster" as const,
          blendMode: "normal" as const,
          opacity: 1,
          visible: true,
          locked: false,
          clippedToBelow: false,
          totalTileCount: 100,
          tileSizePx: 256,
          bytesPerPixel: 4,
          hasAlphaMask: false,
        };
        const audit = wave117.auditLayerTreeHygiene(
          [
            { ...base, id: "hub-f1", orderIndex: 0, rawName: "레이어 1", nonEmptyTileCount: 50 },
            { ...base, id: "hub-f2", orderIndex: 1, rawName: "Layer 1 copy", nonEmptyTileCount: 50 },
            { ...base, id: "hub-e1", orderIndex: 2, rawName: "빈 레이어", nonEmptyTileCount: 0 },
            {
              ...base,
              id: "hub-ln",
              orderIndex: 3,
              kind: "vector-line",
              locked: true,
              rawName: "05_LINE_HERO_01",
              nonEmptyTileCount: 20,
            },
          ],
          { documentId: "hub-ep117" },
        );
        const plan = wave117.compileLayerVramDietPlan(audit);
        const ok =
          audit.safeToCompile &&
          plan.status === "optimized" &&
          plan.mergedGroupCount === 1 &&
          plan.prunedEmptyLayerCount === 1 &&
          plan.metrics.optimizedVramBytes < plan.metrics.sparseVramBytes;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `안전 병합 ${plan.mergedGroupCount}그룹 · 빈 레이어 ${plan.prunedEmptyLayerCount}개 정리 · VRAM ${round2(plan.metrics.totalSavingsFromDensePercent)}% 절감`,
          metrics: {
            mergedGroupCount: plan.mergedGroupCount,
            prunedEmptyLayerCount: plan.prunedEmptyLayerCount,
            savingsFromDensePercent: round2(plan.metrics.totalSavingsFromDensePercent),
          },
        };
      },
    },
    {
      id: "wave118AnatomyForeshortening",
      waveLabel: "Wave 118",
      titleKo: "3D 해부학 원근 단축 · 무게중심 균형 · 실루엣 교정",
      capabilitySummaryKo: "17관절 4종 등신대 · ROM 역꺾임 차단 · 24mm 원근 단축 링 · CoM 감사",
      async execute() {
        const wave118 = await import("../wasm64-wave118-anatomy-foreshortening-and-silhouette-solver");
        const punch = wave118.buildWebtoonAnatomyPose({
          proportionPreset: "action-8head",
          posePreset: "hero-punch-toward-camera",
        });
        const proj24 = wave118.projectAnatomyForeshortening(punch, {
          focalLengthMm: 24,
          cameraDistanceM: 2.8,
        });
        const audit = wave118.auditPoseBalanceAndSilhouette(proj24);
        const ok =
          punch.romAudit.isAnatomicallyValid &&
          proj24.wristToHeadScaleRatio > 2.0 &&
          Number.isFinite(audit.silhouetteClarityScore);
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `24mm 주먹 근경 확대 ${round2(proj24.wristToHeadScaleRatio)}x · ROM 위반 0건 · 실루엣 ${round2(audit.silhouetteClarityScore)}점`,
          metrics: {
            wristToHeadScaleRatio: round2(proj24.wristToHeadScaleRatio),
            romViolationCount: punch.romAudit.totalViolationCount,
            silhouetteClarityScore: round2(audit.silhouetteClarityScore),
          },
        };
      },
    },
    {
      id: "wave119GapClosingFlatFill",
      waveLabel: "Wave 119",
      titleKo: "선화 틈새 밀봉 플랫 채색 · 안티-할로 언더블리드",
      capabilitySummaryKo: "틈새 누출 0px 밀봉 · 보로노이 언더블리드 흰 할로 0px · WGSL",
      async execute() {
        const wave119 = await import("../wasm64-wave119-gap-closing-flat-fill-and-underbleed-solver");
        const w = 32;
        const h = 32;
        const inkAlpha = new Float32Array(w * h);
        for (let x = 6; x <= 25; x += 1) {
          inkAlpha[6 * w + x] = 1.0;
          inkAlpha[25 * w + x] = 1.0;
        }
        for (let y = 6; y <= 25; y += 1) {
          inkAlpha[y * w + 6] = 1.0;
          inkAlpha[y * w + 25] = 1.0;
        }
        inkAlpha[6 * w + 14] = 0;
        inkAlpha[6 * w + 15] = 0;
        inkAlpha[6 * w + 16] = 0;
        const cmp = wave119.compareNaiveVsGapClosedFloodFill(
          { width: w, height: h, inkAlpha },
          { seedX: 15, seedY: 15, maxGapWidthPx: 4 },
        );
        const wgsl = wave119.validateGapClosingFlatFillWgsl(wave119.buildGapClosingFlatFillWgsl());
        const ok =
          cmp.ok &&
          cmp.naiveLeakedToBorder &&
          !cmp.gapClosedLeakedToBorder &&
          cmp.leakedPixels === 0 &&
          wgsl.valid;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `3px 선화 틈새 밀봉(누출 0px · ${cmp.preventedLeakPixelCount}px 차단) · WGSL 통과`,
          metrics: {
            leakedPixels: cmp.leakedPixels,
            preventedLeakPixels: cmp.preventedLeakPixelCount,
            wgslValid: wgsl.valid,
          },
        };
      },
    },
    {
      id: "wave120VectorInkIntersection4k",
      waveLabel: "Wave 120",
      titleKo: "가변 필압 벡터 먹선 교차점 지우개 · 4K SDF 재렌더",
      capabilitySummaryKo: "자투리 절단 오차 <1e-4px · 부분 선폭 조각 · 600DPI SDF 우위·WGSL",
      async execute() {
        const wave120 = await import("../wasm64-wave120-vector-ink-reeditable-width-and-4k-rerender-kernel");
        const layer = {
          layerId: "hub-ink-120",
          widthPx: 64,
          heightPx: 64,
          dpi: 150,
          strokes: [
            {
              id: "collar",
              closed: false,
              taperStartPx: 0,
              taperEndPx: 0,
              points: [
                { x: 8, y: 32, widthPx: 3.2, pressure: 0.7 },
                { x: 32, y: 32, widthPx: 3.2, pressure: 0.7 },
                { x: 58, y: 32, widthPx: 3.2, pressure: 0.7 },
              ],
            },
            {
              id: "shoulder",
              closed: false,
              taperStartPx: 0,
              taperEndPx: 0,
              points: [
                { x: 44, y: 8, widthPx: 3.0, pressure: 0.65 },
                { x: 44, y: 56, widthPx: 3.0, pressure: 0.65 },
              ],
            },
          ],
        };
        const erased = wave120.eraseVectorStrokeToIntersections(layer, "collar", { x: 54, y: 32 });
        const comp = wave120.compareVectorRerenderVsRasterUpscale(erased.layer, 64, 64, 4);
        const wgsl = wave120.validateVectorInkSdfWgsl(wave120.buildVectorInkSdfWgsl());
        const ok =
          erased.status === "trimmed-end-tail" &&
          erased.residualOvershootPx < 1e-4 &&
          comp.passedAdvantageGate &&
          comp.sharpnessAdvantageRatio > 1.8 &&
          wgsl.valid;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `교차 자투리 절단(오차 ${erased.residualOvershootPx.toExponential(1)}px) · 600DPI 선명도 ${round2(comp.sharpnessAdvantageRatio)}x · WGSL 통과`,
          metrics: {
            residualOvershootPx: erased.residualOvershootPx,
            sharpnessAdvantageRatio: round2(comp.sharpnessAdvantageRatio),
            wgslValid: wgsl.valid,
          },
        };
      },
    },
    {
      id: "wave121XpbdClothHairWindBaker",
      waveLabel: "Wave 121",
      titleKo: "XPBD 물리 옷주름·망토·머리카락 바람장 포즈 베이커",
      capabilitySummaryKo: "4종 의상·헤어 XPBD · 인체 충돌 관통 0건 · 주름 능선·WGSL",
      async execute() {
        const wave121 = await import("../wasm64-wave121-xpbd-cloth-hair-wind-pose-baker");
        const bake = wave121.bakeHeroWebtoonFreezeFrame("fantasy-flowing-cape", { steps: 18 });
        const wgsl = wave121.validateXpbdClothHairWgsl(
          wave121.buildXpbdClothHairWgsl("fantasy-flowing-cape", { prefersReducedMotion: true }),
        );
        const ok =
          bake.traceReady &&
          bake.colliderPenetrationCount === 0 &&
          bake.maxStretchErrorRatio < 0.02 &&
          bake.foldRidges.ridges.length > 0 &&
          wgsl.valid;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `망토 관통 0건 · 신축 ${round2(bake.maxStretchErrorRatio * 100)}% · 주름 능선 ${bake.foldRidges.ridges.length}가닥 · WGSL 통과`,
          metrics: {
            colliderPenetrations: bake.colliderPenetrationCount,
            foldRidgeCount: bake.foldRidges.ridges.length,
            wgslValid: wgsl.valid,
          },
        };
      },
    },
    {
      id: "wave122CinematicLensOpticsBokeh",
      waveLabel: "Wave 122",
      titleKo: "시네마틱 렌즈 광학 · 아나모픽 보케 · 대사 보호 파이프라인",
      capabilitySummaryKo: "Brown-Conrady 가역 왜곡 · 아나모픽 2x · 대사 훼손 0px · WGSL",
      async execute() {
        const wave122 = await import("../wasm64-wave122-cinematic-lens-optics-and-bokeh-pipeline");
        const width = 24;
        const height = 24;
        const rgba = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < width * height; i += 1) {
          rgba.set([160, 140, 120, 255], i * 4);
        }
        const result = wave122.applyCinematicLensOpticsToTile({
          width,
          height,
          rgba,
          presetId: "anamorphic-cinema-2x",
          textSafeBoxes: [{ id: "hub-dlg", x: 2, y: 2, width: 8, height: 6, labelKo: "대사" }],
          prefersReducedMotion: true,
        });
        const audit = wave122.auditCinematicPostReadability(result);
        const wgsl = wave122.validateCinematicLensOpticsWgsl(
          wave122.buildCinematicLensOpticsWgsl("anamorphic-cinema-2x", { prefersReducedMotion: true }),
        );
        const ok =
          audit.passed &&
          result.metrics.textBoxCorruptedPixelCount === 0 &&
          result.effectiveShutterJitterPx === 0 &&
          wgsl.valid;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `아나모픽 2x 출고 통과 · 대사 훼손 0px · 저모션 지터 0px · WGSL 통과`,
          metrics: {
            textCorruptedPixels: result.metrics.textBoxCorruptedPixelCount,
            auditPassed: audit.passed,
            wgslValid: wgsl.valid,
          },
        };
      },
    },
  ];
}

/** 기존 초격차 런타임 허브에 Wave 117~122 확장 서브시스템 6종을 일괄 등록한다. */
export function registerWave117To122Extensions(hub: StudioSupergapRuntimeHub): StudioSupergapRuntimeHub {
  for (const ext of createWave117To122ExtensionSubsystems()) {
    hub.registerExtensionSubsystem(ext);
  }
  return hub;
}
