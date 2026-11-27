import { describe, expect, it } from "vitest";

import {
  buildBeforeAfterWipeCardSpec,
  buildSpoilerMaskRegions,
  buildStageAwareWorkspaceChrome,
  CANONICAL_SEVEN_MENUS,
  CANONICAL_TOP_MENU_BUDGET,
  compileLookRecipeGraph,
  compileOneKnobKoreanLookMacro,
  composeRightsBomAttributionFooter,
  computeBt709RelativeLuminance,
  computeCurvatureCrosshatchField,
  computeShortformSafeZoneFrame,
  computeXLandscapeSmartCrop,
  evaluateSurfaceCrosshatchSample,
  inferStudioCreationStage,
  INSTAGRAM_PORTRAIT_HEIGHT_PX,
  INSTAGRAM_PORTRAIT_WIDTH_PX,
  LayerBranchVersionGraph,
  LOOK_RECIPE_NODE_STRIDE_BYTES,
  LOOK_RECIPE_UNIFORM_ALIGNMENT_BYTES,
  LookRecipeGraphError,
  MAX_PRIMARY_CONTROL_COUNT,
  MIN_CONTROL_HIT_SIZE_PX,
  MIN_PRIMARY_CONTROL_COUNT,
  packageCreatorSnsShowcase,
  planInstagramShowcaseCarousel,
  resolveSignatureWatermarkPlacement,
  SACRED_MIN_CANVAS_VIEWPORT_RATIO,
  sanitizeAndNormalizeStudioLayers,
  selectBeatSyncedTimelapseKeyframes,
  SHORTFORM_VERTICAL_HEIGHT_PX,
  SHORTFORM_VERTICAL_WIDTH_PX,
  SINGLE_CONTEXT_BAR_HEIGHT_PX,
  validateLookRecipeGraph,
  verifyCompositeOrderEquivalence,
  X_LANDSCAPE_HEIGHT_PX,
  X_LANDSCAPE_WIDTH_PX,
  type Point2D,
  type ShowcaseSemanticRegion,
  type StudioLayerDescriptor,
} from "./index";

function polygonSignedArea(pts: readonly Point2D[]): number {
  let acc = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const cur = pts[i];
    const next = pts[(i + 1) % pts.length];
    acc += cur.x * next.y - next.x * cur.y;
  }
  return Math.abs(acc) * 0.5;
}

const SAMPLE_WEBTOON_REGIONS: readonly ShowcaseSemanticRegion[] = [
  { id: "face-1", kind: "character-face", bounds: { x: 220, y: 320, width: 360, height: 380 }, importanceWeight: 2.5 },
  { id: "bubble-1", kind: "speech-bubble", bounds: { x: 120, y: 1240, width: 520, height: 220 }, importanceWeight: 3.0 },
  { id: "bubble-2", kind: "speech-bubble", bounds: { x: 380, y: 1468, width: 460, height: 190 }, importanceWeight: 3.0 },
  { id: "face-2", kind: "character-face", bounds: { x: 280, y: 2560, width: 420, height: 410 }, importanceWeight: 2.6 },
  { id: "bubble-3", kind: "speech-bubble", bounds: { x: 160, y: 2990, width: 580, height: 210 }, importanceWeight: 3.2 },
  { id: "spoiler-twist", kind: "spoiler", bounds: { x: 180, y: 3650, width: 680, height: 420 }, importanceWeight: 4.0 },
];

describe("wasm64-wave39-sns-showcase-workflow-simplifier", () => {
  it("1. DP 인스타 4:5 캐러셀 분할기가 세로 스크롤 컷의 말풍선과 얼굴을 단 한 건도 절단하지 않는다", () => {
    const plan = planInstagramShowcaseCarousel({ canvasWidthPx: 1080, canvasHeightPx: 4320, regions: SAMPLE_WEBTOON_REGIONS });
    expect(plan.targetWidthPx).toBe(INSTAGRAM_PORTRAIT_WIDTH_PX);
    expect(plan.targetHeightPx).toBe(INSTAGRAM_PORTRAIT_HEIGHT_PX);
    expect(plan.slides.length).toBeGreaterThanOrEqual(3);
    expect(plan.speechBubbleCutCount).toBe(0);
    expect(plan.protectedRegionCutCount).toBe(0);
    for (let i = 0; i < plan.slides.length - 1; i += 1) {
      const cutY = plan.slides[i].sourceCrop.y + plan.slides[i].sourceCrop.height;
      expect(cutY).toBe(plan.slides[i + 1].sourceCrop.y);
      for (const r of SAMPLE_WEBTOON_REGIONS) {
        if (r.kind === "speech-bubble" || r.kind === "character-face") {
          expect(cutY > r.bounds.y && cutY < r.bounds.y + r.bounds.height).toBe(false);
        }
      }
    }
  });

  it("2. 말풍선 두 개가 8px 간격으로 밀집된 경계에서도 정확히 틈새 좌표로 분할한다", () => {
    const tightRegions: readonly ShowcaseSemanticRegion[] = [
      { id: "b-top", kind: "speech-bubble", bounds: { x: 100, y: 1120, width: 600, height: 220 }, importanceWeight: 3 },
      { id: "b-bot", kind: "speech-bubble", bounds: { x: 140, y: 1348, width: 580, height: 240 }, importanceWeight: 3 },
    ];
    const plan = planInstagramShowcaseCarousel({ canvasWidthPx: 1080, canvasHeightPx: 2700, regions: tightRegions, candidateStepPx: 64 });
    expect(plan.speechBubbleCutCount).toBe(0);
    expect(plan.slides).toHaveLength(2);
    expect(plan.slides[0].sourceCrop.height).toBeGreaterThanOrEqual(1340);
    expect(plan.slides[0].sourceCrop.height).toBeLessThanOrEqual(1348);
  });

  it("3. 짧은 단컷 원고는 불필요한 쪼개기 없이 단일 4:5 슬라이드로 레터박스 패딩만 계산한다", () => {
    const plan = planInstagramShowcaseCarousel({ canvasWidthPx: 1080, canvasHeightPx: 1200, regions: [SAMPLE_WEBTOON_REGIONS[0]] });
    expect(plan.slides).toHaveLength(1);
    expect(plan.slides[0].letterboxTopPx + plan.slides[0].letterboxBottomPx).toBe(150);
    expect(plan.speechBubbleCutCount).toBe(0);
  });

  it("4. X(16:9) 스마트 크롭이 고중요도 얼굴·대사를 포착하면서 스포일러 영역을 회피한다", () => {
    const crop = computeXLandscapeSmartCrop({ canvasWidthPx: 1080, canvasHeightPx: 4320, regions: SAMPLE_WEBTOON_REGIONS });
    expect(crop.targetWidthPx).toBe(X_LANDSCAPE_WIDTH_PX);
    expect(crop.targetHeightPx).toBe(X_LANDSCAPE_HEIGHT_PX);
    expect(crop.sourceCrop.width).toBe(1080);
    expect(crop.sourceCrop.height).toBe(608);
    expect(crop.spoilerOverlapAreaPx).toBe(0);
    expect(crop.primaryFocusRegionIds.length).toBeGreaterThan(0);
  });

  it("5. Reels/Shorts/TikTok 9:16 프레이밍이 상하단 앱 UI 가림 영역 밖의 안전 구역 안에만 중요 컷을 배치한다", () => {
    const frame = computeShortformSafeZoneFrame({ canvasWidthPx: 1080, canvasHeightPx: 3200, regions: SAMPLE_WEBTOON_REGIONS.slice(0, 3) });
    expect(frame.frameWidthPx).toBe(SHORTFORM_VERTICAL_WIDTH_PX);
    expect(frame.frameHeightPx).toBe(SHORTFORM_VERTICAL_HEIGHT_PX);
    expect(frame.hudCollisionCount).toBe(0);
    expect(frame.projectedContentRect.x).toBeGreaterThanOrEqual(frame.safeZoneRect.x);
    expect(frame.projectedContentRect.y).toBeGreaterThanOrEqual(frame.safeZoneRect.y);
    expect(frame.projectedContentRect.y + frame.projectedContentRect.height).toBeLessThanOrEqual(frame.safeZoneRect.y + frame.safeZoneRect.height);
  });

  it("6. Before/After 수직 및 대각선 와이프 폴리곤이 카드 전체 면적을 빈틈·겹침 없이 정확히 이분할한다", () => {
    const vertical = buildBeforeAfterWipeCardSpec({ widthPx: 1080, heightPx: 1350, mode: "vertical-split", splitRatio: 0.4 });
    const diagonal = buildBeforeAfterWipeCardSpec({ widthPx: 1080, heightPx: 1350, mode: "diagonal-wipe", splitRatio: 0.5, diagonalAngleDeg: 22 });
    const cardArea = 1080 * 1350;
    expect(polygonSignedArea(vertical.beforeClipPolygon) + polygonSignedArea(vertical.afterClipPolygon)).toBeCloseTo(cardArea, 4);
    expect(polygonSignedArea(diagonal.beforeClipPolygon) + polygonSignedArea(diagonal.afterClipPolygon)).toBeCloseTo(cardArea, 4);
    expect(diagonal.dividerStart.x).toBeGreaterThan(diagonal.dividerEnd.x);
  });

  it("7. 비트 동기화 타임랩스 키프레임 선택기가 BPM 박자 격자에 스냅하면서 제작 공정 순서를 보존한다", () => {
    const selected = selectBeatSyncedTimelapseKeyframes({
      bpm: 120,
      durationMs: 4_000,
      beatSubdivision: 1,
      maxKeyframes: 4,
      snapshots: [
        { snapshotId: "s1", stage: "rough", timestampMs: 100, visualChangeScore: 0.4, strokeCount: 25 },
        { snapshotId: "s2", stage: "ink", timestampMs: 900, visualChangeScore: 0.92, strokeCount: 140 },
        { snapshotId: "s3", stage: "ink", timestampMs: 1_200, visualChangeScore: 0.25, strokeCount: 165 },
        { snapshotId: "s4", stage: "shade", timestampMs: 2_400, visualChangeScore: 0.88, strokeCount: 310 },
        { snapshotId: "s5", stage: "final", timestampMs: 3_800, visualChangeScore: 0.95, strokeCount: 400 },
      ],
    });
    expect(selected).toHaveLength(4);
    expect(selected[0].stage).toBe("rough");
    expect(selected[selected.length - 1].stage).toBe("final");
    for (const kf of selected) expect(kf.beatTimeMs % 500).toBe(0);
  });

  it("8. 스포일러 마스크 생성기가 패딩 확장과 캔버스 경계 클램핑을 정확히 수행한다", () => {
    const masks = buildSpoilerMaskRegions(
      [{ id: "sp-edge", kind: "spoiler", bounds: { x: 4, y: 10, width: 200, height: 150 }, importanceWeight: 5 }],
      { canvasWidthPx: 1080, canvasHeightPx: 1920, effect: "gaussian-blur", featherPaddingPx: 16 },
    );
    expect(masks).toHaveLength(1);
    expect(masks[0].maskBounds).toEqual({ x: 0, y: 0, width: 220, height: 176 });
    expect(masks[0].effect).toBe("gaussian-blur");
    expect(masks[0].blurSigmaPx).toBeGreaterThanOrEqual(14);
  });

  it("9. BT.709 휘도 기반 서명 워터마크가 말풍선 충돌을 피하고 밝은/어두운 배경 모두 WCAG 4.5:1 이상을 확보한다", () => {
    expect(computeBt709RelativeLuminance(0, 0, 0)).toBe(0);
    expect(computeBt709RelativeLuminance(255, 255, 255)).toBeCloseTo(1, 5);

    const onDark = resolveSignatureWatermarkPlacement({
      frameWidthPx: 1080,
      frameHeightPx: 1350,
      watermarkWidthPx: 180,
      watermarkHeightPx: 44,
      regions: [{ id: "bubble-br", kind: "speech-bubble", bounds: { x: 820, y: 1220, width: 250, height: 120 }, importanceWeight: 3 }],
      cornerSamples: [
        { anchor: "bottom-right", r8: 250, g8: 250, b8: 250 },
        { anchor: "bottom-left", r8: 18, g8: 22, b8: 30 },
      ],
    });
    expect(onDark.anchor).toBe("bottom-left");
    expect(onDark.regionOverlapAreaPx).toBe(0);
    expect(onDark.textHex).toBe("#FAF8F3");
    expect(onDark.wcagContrastRatio).toBeGreaterThanOrEqual(4.5);

    const onLight = resolveSignatureWatermarkPlacement({
      frameWidthPx: 1080,
      frameHeightPx: 1350,
      watermarkWidthPx: 180,
      watermarkHeightPx: 44,
      cornerSamples: [{ anchor: "bottom-right", r8: 246, g8: 244, b8: 238 }],
    });
    expect(onLight.anchor).toBe("bottom-right");
    expect(onLight.textHex).toBe("#111318");
    expect(onLight.wcagContrastRatio).toBeGreaterThanOrEqual(4.5);
  });

  it("10. Rights BOM 출처 조합기와 통합 쇼케이스 패키저가 상업 충돌을 감지하고 ShareChannel UTM 링크를 생성한다", () => {
    const conflictCheck = composeRightsBomAttributionFooter(
      [
        { assetId: "a1", assetTitle: "한옥 기와 3D", authorName: "김장인", licenseSpdx: "CC-BY-4.0" },
        { assetId: "a2", assetTitle: "한옥 기와 3D", authorName: "김장인", licenseSpdx: "CC-BY-4.0" },
        { assetId: "a3", assetTitle: "비상업 브러시", authorName: "박작가", licenseSpdx: "NC-Restricted" },
      ],
      { commercialPublish: true },
    );
    expect(conflictCheck.requiredCredits).toHaveLength(1);
    expect(conflictCheck.hasCommercialConflict).toBe(true);
    expect(conflictCheck.conflictAssetIds).toEqual(["a3"]);

    const pkg = packageCreatorSnsShowcase({
      workTitle: "달빛 검객 12화",
      shareUrl: "/title/moonlight-blade/ep-12",
      origin: "https://www.toonstudio.cloud",
      channels: ["x", "instagram", "kakao"],
      canvasWidthPx: 1080,
      canvasHeightPx: 2800,
      regions: SAMPLE_WEBTOON_REGIONS.slice(0, 4),
      rightsBom: [{ assetId: "a1", assetTitle: "구름 브러시", authorName: "이작가", licenseSpdx: "CC-BY-4.0" }],
      cornerSamples: [{ anchor: "bottom-right", r8: 240, g8: 240, b8: 240 }],
    });
    const xShare = pkg.channelShares.find((c) => c.channel === "x")!;
    const igShare = pkg.channelShares.find((c) => c.channel === "instagram")!;
    expect(xShare.attributedUrl).toContain("utm_source=x");
    expect(xShare.attributedUrl).toContain("utm_campaign=content_share");
    expect(xShare.intentUrl).toContain("https://twitter.com/intent/tweet");
    expect(igShare.attributedUrl).toContain("utm_source=instagram");
    expect(igShare.intentUrl).toBeNull();
  });

  it("11. 창작 단계 추론기가 도구 신호와 활성 레이어 구성으로부터 6대 공정을 정확히 판별한다", () => {
    const baseLayer: StudioLayerDescriptor = {
      id: "l1", name: "컷1_러프", blendMode: "normal", opacity: 1, visible: true, locked: false, isClippingMask: false, nonZeroPixelCount: 1200,
    };
    expect(inferStudioCreationStage({ activeToolKind: "pencil-rough", layers: [baseLayer] }).stage).toBe("rough");
    expect(inferStudioCreationStage({ activeToolKind: "ink-pen", layers: [baseLayer] }).stage).toBe("ink");
    expect(inferStudioCreationStage({ activeToolKind: "fill-bucket", layers: [baseLayer] }).stage).toBe("flat");
    expect(inferStudioCreationStage({ activeToolKind: "shading-brush", layers: [baseLayer] }).stage).toBe("shade");
    expect(inferStudioCreationStage({ activeToolKind: "speech-balloon", layers: [baseLayer] }).stage).toBe("lettering");
    expect(inferStudioCreationStage({ preflightRequested: true, layers: [baseLayer] }).stage).toBe("export");
  });

  it("12. 단계별 워크스페이스 크롬 보장기가 >= 82% 신성한 뷰포트·44px 상단바·7메뉴·5~9 순화 한글 액션을 강제한다", () => {
    const plan = buildStageAwareWorkspaceChrome({
      stage: "ink",
      viewportWidthPx: 1280,
      viewportHeightPx: 800,
      requestedTopBarHeightPx: 96,
      requestedLeftRailWidthPx: 64,
      requestedRightPanelWidthPx: 420,
      requestedBottomShelfHeightPx: 180,
      requestedMenuLabels: Array.from({ length: 18 }, (_, i) => `메뉴${i}`),
      requestedControlHitSizePx: 28,
      extraControlCount: 9,
      activeOverrideCount: 2,
    });
    expect(plan.invariantsSatisfied).toBe(true);
    expect(plan.contextBarHeightPx).toBe(SINGLE_CONTEXT_BAR_HEIGHT_PX);
    expect(plan.topMenus).toEqual(CANONICAL_SEVEN_MENUS);
    expect(plan.topMenus.length).toBeLessThanOrEqual(CANONICAL_TOP_MENU_BUDGET);
    expect(plan.canvasViewportRatio).toBeGreaterThanOrEqual(SACRED_MIN_CANVAS_VIEWPORT_RATIO);
    expect(plan.primaryControls.length).toBeGreaterThanOrEqual(MIN_PRIMARY_CONTROL_COUNT);
    expect(plan.primaryControls.length).toBeLessThanOrEqual(MAX_PRIMARY_CONTROL_COUNT);
    for (const ctrl of plan.primaryControls) {
      expect(ctrl.hitWidthPx).toBeGreaterThanOrEqual(MIN_CONTROL_HIT_SIZE_PX);
      expect(ctrl.hitHeightPx).toBeGreaterThanOrEqual(MIN_CONTROL_HIT_SIZE_PX);
      expect(/[A-Za-z]/u.test(ctrl.labelKo)).toBe(false);
    }
    expect(plan.overflowDisclosure.hiddenControlCount).toBeGreaterThan(0);
  });

  it("13. 빈 레이어 정리기가 일반 빈 레이어만 제거하고 클리핑 기준 빈 레이어와 잠금 레이어는 안전 보존한다", () => {
    const layers: readonly StudioLayerDescriptor[] = [
      { id: "empty-trash", name: "레이어 1 사본 3", blendMode: "normal", opacity: 1, visible: true, locked: false, isClippingMask: false, nonZeroPixelCount: 0 },
      { id: "locked-empty", name: "가이드 잠금", blendMode: "normal", opacity: 1, visible: true, locked: true, isClippingMask: false, nonZeroPixelCount: 0 },
      { id: "clip-base-empty", name: "컷1_밑색", blendMode: "normal", opacity: 1, visible: true, locked: false, isClippingMask: false, nonZeroPixelCount: 0 },
      { id: "clipped-shade", name: "컷1_그림자", blendMode: "multiply", opacity: 0.8, visible: true, locked: false, isClippingMask: true, nonZeroPixelCount: 540 },
    ];
    const report = sanitizeAndNormalizeStudioLayers(layers);
    expect(report.removedLayerIds).toEqual(["empty-trash"]);
    expect(report.preservedEmptyBaseLayerIds).toEqual(["clip-base-empty"]);
    expect(report.keptLayers.map((l) => l.id)).toEqual(["locked-empty", "clip-base-empty", "clipped-shade"]);
    expect(report.compositeEquivalence.equivalent).toBe(true);
  });

  it("14. 어지러운 레이어명을 컷·역할별 표준 한글 폴더로 정규화하면서 비가환 블렌드 Z-순서를 100% 보존한다", () => {
    const messyStack: readonly StudioLayerDescriptor[] = [
      { id: "c1-flat", name: "컷1 밑색 사본 2", blendMode: "normal", opacity: 1, visible: true, locked: false, isClippingMask: false, nonZeroPixelCount: 4000, sampleColor: { r: 0.85, g: 0.72, b: 0.66, a: 0.95 } },
      { id: "atmo-mul", name: "레이어 9 사본 4", blendMode: "multiply", opacity: 0.75, visible: true, locked: false, isClippingMask: false, nonZeroPixelCount: 3200, sampleColor: { r: 0.35, g: 0.4, b: 0.72, a: 0.8 } },
      { id: "c1-rim", name: "컷1 빛효과 최종", blendMode: "screen", opacity: 0.85, visible: true, locked: false, isClippingMask: false, nonZeroPixelCount: 1800, sampleColor: { r: 0.95, g: 0.62, b: 0.3, a: 0.7 } },
      { id: "c1-ink", name: "컷1_선화_진짜최종", blendMode: "normal", opacity: 1, visible: true, locked: false, isClippingMask: false, nonZeroPixelCount: 2500, sampleColor: { r: 0.08, g: 0.08, b: 0.1, a: 0.98 } },
    ];
    const report = sanitizeAndNormalizeStudioLayers(messyStack);
    expect(report.compositeEquivalence.equivalent).toBe(true);
    expect(report.compositeEquivalence.maxChannelDelta).toBeLessThanOrEqual(1e-6);
    expect(report.keptLayers[0].normalizedNameKo).toBe("컷01_밑색_01");
    expect(report.keptLayers[3].normalizedNameKo).toBe("컷01_선화_01");
    expect(report.folders.every((f) => f.blendMode === "pass-through")).toBe(true);

    const brokenCheck = verifyCompositeOrderEquivalence(messyStack, [messyStack[0], messyStack[2], messyStack[1], messyStack[3]]);
    expect(brokenCheck.equivalent).toBe(false);
    expect(brokenCheck.zOrderMonotonic).toBe(false);
  });

  it("15. 원노브(0..100) 한국어 마감 매크로 3종이 0에서 항등 우회되고 다이얼 증가 시 단조 응답한다", () => {
    const zeroSumi = compileOneKnobKoreanLookMacro("sumi-ink-bleed", 0);
    const fullSumi = compileOneKnobKoreanLookMacro("sumi-ink-bleed", 100);
    expect(zeroSumi.labelKo).toBe("동양화 먹 번짐");
    expect(zeroSumi.isIdentityBypass).toBe(true);
    expect(fullSumi.parameters.wetDiffusionRadiusPx).toBeGreaterThan(zeroSumi.parameters.wetDiffusionRadiusPx);
    expect(compileOneKnobKoreanLookMacro("sunset-rim-backlight", 60).parameters.keyLightKelvin).toBeLessThan(6500);
    expect(compileOneKnobKoreanLookMacro("print-bw-screentone", 85).parameters.screentoneFrequencyLpi).toBeLessThan(85);
  });

  it("16. 곡률·광원 교차 해칭기가 조도에 따라 0~3단 스트로크를 활성화하고 직교 접선 프레임을 유지한다", () => {
    const config = { lightDir: [0, 0, 1] as const, baseSpacingPx: 8, baseStrokeWidthPx: 1.6 };
    const bright = evaluateSurfaceCrosshatchSample({ sampleId: "lit", normal: [0, 0, 1], principalCurvatureDir1: [1, 0, 0], kappa1: 0.4, kappa2: 0.1 }, config);
    const mid1 = evaluateSurfaceCrosshatchSample({ sampleId: "mid", normal: [0.86, 0, 0.5], principalCurvatureDir1: [0, 1, 0], kappa1: 0.8, kappa2: 0.2 }, config);
    const mid2 = evaluateSurfaceCrosshatchSample({ sampleId: "dark2", normal: [0.96, 0, 0.28], principalCurvatureDir1: [0, 1, 0], kappa1: 1.2, kappa2: 0.3 }, config);
    const deep = evaluateSurfaceCrosshatchSample({ sampleId: "deep", normal: [0, 0, -1], principalCurvatureDir1: [1, 0, 0], kappa1: 2.0, kappa2: 0.5 }, config);
    expect([bright.activeTierCount, mid1.activeTierCount, mid2.activeTierCount, deep.activeTierCount]).toEqual([0, 1, 2, 3]);
    const orthoDot = deep.unitTangent1[0] * deep.unitTangent2[0] + deep.unitTangent1[1] * deep.unitTangent2[1] + deep.unitTangent1[2] * deep.unitTangent2[2];
    expect(Math.abs(orthoDot)).toBeLessThan(1e-6);
  });

  it("17. 고곡률 능선일수록 해칭 간격이 촘촘해지고 실루엣 가장자리에서 외곽선 동적 필압 두께가 증가한다", () => {
    const config = { lightDir: [0, 1, 0] as const };
    const flatCenter = evaluateSurfaceCrosshatchSample({ sampleId: "center", normal: [0, 0, 1], principalCurvatureDir1: [1, 0, 0], kappa1: 0.1, kappa2: 0.1, viewDir: [0, 0, 1] }, config);
    const sharpRim = evaluateSurfaceCrosshatchSample({ sampleId: "rim", normal: [1, 0, 0.05], principalCurvatureDir1: [0, 1, 0], kappa1: 3.0, kappa2: 0.4, viewDir: [0, 0, 1] }, config);
    expect(sharpRim.tiers[0].spacingPx).toBeLessThan(flatCenter.tiers[0].spacingPx);
    expect(sharpRim.dynamicContourWidthPx).toBeGreaterThan(flatCenter.dynamicContourWidthPx);
    const report = computeCurvatureCrosshatchField(
      [{ sampleId: "c", normal: [0, 0, 1], principalCurvatureDir1: [0, 1, 0], kappa1: 0.1, kappa2: 0.2 }],
      config,
    );
    expect(report.evaluations).toHaveLength(1);
    expect(report.meanContourWidthPx).toBeGreaterThan(0);
  });

  it("18. 비파괴 레이어 버전 분기 그래프가 형제 브랜치를 격리하고 공통 조상(LCA) 기반 변경 레이어를 산출한다", () => {
    const graph = new LayerBranchVersionGraph();
    graph.commit({ commitId: "c-root", branchName: "main", parentCommitId: null, timestampMs: 1_700_000_001_000, labelKo: "기본 낮 장면", layerPatches: { "layer-sky": { opacity: 1, lookPresetTag: "daylight" } } });
    graph.commit({ commitId: "c-sunset", branchName: "variation-sunset", parentCommitId: "c-root", timestampMs: 1_700_000_002_000, labelKo: "노을 분기", layerPatches: { "layer-sky": { lookPresetTag: "sunset-gold" } } });
    graph.commit({ commitId: "c-rain", branchName: "variation-rain", parentCommitId: "c-root", timestampMs: 1_700_000_003_000, labelKo: "비 오는 밤 분기", layerPatches: { "layer-rain": { opacity: 0.75, blendMode: "screen" } } });

    expect(graph.checkout("c-sunset").layerStates["layer-sky"].lookPresetTag).toBe("sunset-gold");
    expect(graph.checkout("c-rain").layerStates["layer-sky"].lookPresetTag).toBe("daylight");
    expect(graph.getBranchHeadCommitId("variation-rain")).toBe("c-rain");
    const diff = graph.diffCommits("c-sunset", "c-rain");
    expect(diff.commonAncestorCommitId).toBe("c-root");
    expect(diff.changedLayerIds).toEqual(["layer-rain", "layer-sky"]);
    expect(() => graph.commit({ commitId: "c-orphan", branchName: "b", parentCommitId: "missing", timestampMs: 1_700_000_004_000, labelKo: "고아", layerPatches: {} })).toThrow();
  });

  it("19. 룩 레시피 그래프 검증기가 순환(Cycle) 경로와 미정의 노드 참조·중복 ID를 정확히 검출한다", () => {
    const cyclic = validateLookRecipeGraph({
      nodes: [{ nodeId: "src", kind: "source-canvas" }, { nodeId: "grade", kind: "color-grade-lut" }, { nodeId: "hatch", kind: "crosshatch-ink" }],
      edges: [{ fromNodeId: "src", toNodeId: "grade" }, { fromNodeId: "grade", toNodeId: "hatch" }, { fromNodeId: "hatch", toNodeId: "grade" }],
    });
    expect(cyclic.valid).toBe(false);
    expect(cyclic.errorCode).toBe("CYCLE_DETECTED");
    expect(cyclic.cycleNodeIds).toEqual(["grade", "hatch", "grade"]);
    expect(() => compileLookRecipeGraph({ nodes: [{ nodeId: "a", kind: "tone-curve" }], edges: [{ fromNodeId: "a", toNodeId: "a" }] })).toThrow(LookRecipeGraphError);
    expect(validateLookRecipeGraph({ nodes: [{ nodeId: "src", kind: "source-canvas" }], edges: [{ fromNodeId: "src", toNodeId: "ghost" }] }).errorCode).toBe("UNKNOWN_NODE_REF");
    expect(validateLookRecipeGraph({ nodes: [{ nodeId: "dup", kind: "source-canvas" }, { nodeId: "dup", kind: "paper-grain" }], edges: [] }).errorCode).toBe("DUPLICATE_NODE_ID");
  });

  it("20. 비파괴 룩 레시피 컴파일러가 16B 정렬 Float32Array 유니폼 버퍼와 입력 순서 무관 결정론적 해시를 생성한다", () => {
    const graphA = compileLookRecipeGraph({
      graphVersion: 3,
      nodes: [
        { nodeId: "src", kind: "source-canvas", params: [1, 0, 0, 0] },
        { nodeId: "curve", kind: "tone-curve", blendOpacity: 0.9, params: [1.15, 0.95, 0.02, 0.98] },
        { nodeId: "grain", kind: "paper-grain", blendOpacity: 0.45, params: [0.6, 0.35, 0.2, 1] },
        { nodeId: "out", kind: "output-composite", params: [1, 1, 1, 1] },
      ],
      edges: [
        { fromNodeId: "src", toNodeId: "curve", inputSlot: 0 },
        { fromNodeId: "src", toNodeId: "grain", inputSlot: 0 },
        { fromNodeId: "curve", toNodeId: "out", inputSlot: 0 },
        { fromNodeId: "grain", toNodeId: "out", inputSlot: 1 },
      ],
    });
    const graphShuffled = compileLookRecipeGraph({
      graphVersion: 3,
      nodes: [
        { nodeId: "out", kind: "output-composite", params: [1, 1, 1, 1] },
        { nodeId: "grain", kind: "paper-grain", blendOpacity: 0.45, params: [0.6, 0.35, 0.2, 1] },
        { nodeId: "src", kind: "source-canvas", params: [1, 0, 0, 0] },
        { nodeId: "curve", kind: "tone-curve", blendOpacity: 0.9, params: [1.15, 0.95, 0.02, 0.98] },
      ],
      edges: [
        { fromNodeId: "grain", toNodeId: "out", inputSlot: 1 },
        { fromNodeId: "src", toNodeId: "grain", inputSlot: 0 },
        { fromNodeId: "curve", toNodeId: "out", inputSlot: 0 },
        { fromNodeId: "src", toNodeId: "curve", inputSlot: 0 },
      ],
    });

    expect(graphA.uniformBuffer).toBeInstanceOf(Float32Array);
    expect(graphA.uniformByteLength % LOOK_RECIPE_UNIFORM_ALIGNMENT_BYTES).toBe(0);
    for (const slice of graphA.nodeSlices) {
      expect(slice.byteOffset % LOOK_RECIPE_UNIFORM_ALIGNMENT_BYTES).toBe(0);
      expect(slice.byteLength).toBe(LOOK_RECIPE_NODE_STRIDE_BYTES);
    }
    expect(graphA.topologicalNodeIds).toEqual(["src", "curve", "grain", "out"]);
    expect(graphA.deterministicHashHex).toBe(graphShuffled.deterministicHashHex);
  });

  it("21. 룩 레시피 노드의 -0.0과 +0.0 파라미터가 동일한 정규화 비트열과 해시를 산출한다", () => {
    const negZero = compileLookRecipeGraph({ nodes: [{ nodeId: "n1", kind: "halftone-screen", params: [-0, 65, 45, 1] }], edges: [] });
    const posZero = compileLookRecipeGraph({ nodes: [{ nodeId: "n1", kind: "halftone-screen", params: [0, 65, 45, 1] }], edges: [] });
    expect(negZero.deterministicHashHex).toBe(posZero.deterministicHashHex);
  });
});
