// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  ANTI_CLIP_OFFSET_RANGE_MM,
  STUDIO_TEAM_SCALE_ORDER,
  STUDIO_TEAM_SCALE_PRESETS,
  StudioScaleAnd3dFitConsole,
  VIRTUAL_WORKDESK_LIGHTING_PRESETS,
  VRM_AUTO_FIT_SOCKETS,
  VRM_AUTO_FIT_SOCKET_COUNT,
  advancePomodoroWorkdeskPhase,
  buildOutsourceCutSandboxPackage,
  buildWebtoon3dGenPipelinePlan,
  classifyTeamScaleByMemberCount,
  computeCharacterItemAutoFit,
  computeDeadlineBottleneckHeatmap,
  createBatonTouchHandoff,
  createMonitorPresetScreens,
  createVirtualWorkdeskSession,
  distributeParallelRenderQueue,
  evaluateEnterpriseRbacPermission,
  planMultiMonitorLayout,
  probeMultiMonitorEnvironment,
  resolveTeamScaleWorkspaceConfig,
  transferBoneWeightsPreview,
  triggerVirtualCameraShutter,
  updateWebcamMirrorBoothState,
  type VrmSocketGroupId,
} from "./index";
import { STUDIO_SCALE_FIT_SPRITE_PATHS } from "./vrm-autofit-socket-registry";

afterEach(cleanup);

const STANDARD_BODY = {
  heightCm: 172,
  shoulderWidthRatio: 1.05,
  torsoDepthRatio: 1.0,
  limbThicknessRatio: 1.0,
  clothLayerThicknessMm: 1.5,
  poseBendDeg: 20,
} as const;

describe("1. 42-소켓 VRM 본 자동 스냅 · Anti-Clip 자연 밀착 엔진", () => {
  it("정본 42개 소켓이 8대 부위(head/neck/chest/leftHand/rightHand/hips/back/feet)에 빠짐없이 매핑된다", () => {
    expect(VRM_AUTO_FIT_SOCKET_COUNT).toBe(42);
    expect(VRM_AUTO_FIT_SOCKETS).toHaveLength(42);

    const uniqueIds = new Set(VRM_AUTO_FIT_SOCKETS.map((socket) => socket.id));
    expect(uniqueIds.size).toBe(42);

    const requiredGroups: readonly VrmSocketGroupId[] = [
      "head",
      "neck",
      "chest",
      "leftHand",
      "rightHand",
      "hips",
      "back",
      "feet",
    ];
    for (const group of requiredGroups) {
      const count = VRM_AUTO_FIT_SOCKETS.filter((socket) => socket.group === group).length;
      expect(count).toBeGreaterThanOrEqual(4);
    }
  });

  it("체형 스케일 연동 cageScale · curveWrap · 1.5~3.0mm Anti-Clip 오프셋으로 자연 밀착을 계산한다", () => {
    const result = computeCharacterItemAutoFit({
      socketId: "back-upper-spine",
      itemNameKo: "학생 백팩",
      itemCategory: "backpack-wings",
      rigidity: "semi-flexible",
      body: { ...STANDARD_BODY, shoulderWidthRatio: 1.18, clothLayerThicknessMm: 2.5 },
    });

    expect(result.socket.vrmBone).toBe("upperChest");
    expect(result.minimumSafeOffsetMm).toBeGreaterThanOrEqual(ANTI_CLIP_OFFSET_RANGE_MM.min);
    expect(result.minimumSafeOffsetMm).toBeLessThanOrEqual(ANTI_CLIP_OFFSET_RANGE_MM.max);
    expect(result.isSkinSafe).toBe(true);
    expect(result.penetrationRiskMm).toBe(0);
    expect(result.cageScale.x).toBeGreaterThan(1.15);
    expect(result.curveWrap.axis).toBe("vertical-arc");
    expect(result.fitConfidenceScore).toBeGreaterThanOrEqual(90);
    expect(result.fitGrade).toBe("seamless");
  });

  it("피부 뚫림(클리핑) 위험 오프셋을 감지하고 원클릭 보정 패치로 안전 복원한다", () => {
    const risky = computeCharacterItemAutoFit({
      socketId: "chest-sternum",
      itemNameKo: "흉갑",
      itemCategory: "armor-chest",
      rigidity: "rigid",
      body: { ...STANDARD_BODY, poseBendDeg: 70, clothLayerThicknessMm: 3.0 },
      userAntiClipOffsetMm: 0.6,
      userScaleMultiplier: 1.4,
    });

    expect(risky.isSkinSafe).toBe(false);
    expect(risky.penetrationRiskMm).toBeGreaterThan(0);
    expect(risky.fitGrade).toBe("clip-risk");
    expect(risky.fitConfidenceScore).toBeLessThan(65);
    expect(risky.autoCorrectionsKo.length).toBeGreaterThanOrEqual(2);

    const fixed = computeCharacterItemAutoFit({
      socketId: "chest-sternum",
      itemNameKo: "흉갑",
      itemCategory: "armor-chest",
      rigidity: "semi-flexible",
      body: { ...STANDARD_BODY, poseBendDeg: 70, clothLayerThicknessMm: 3.0 },
      userAntiClipOffsetMm: risky.suggestedPatch.antiClipOffsetMm,
      userCurveWrapStrength: 0.64,
      userScaleMultiplier: risky.suggestedPatch.scaleMultiplier,
    });

    expect(fixed.isSkinSafe).toBe(true);
    expect(fixed.fitConfidenceScore).toBeGreaterThanOrEqual(90);
  });

  it("transferBoneWeightsPreview가 강체 1본, 유연 천 최대 4본 가중치 합계 1.000을 보장한다", () => {
    const rigidWeights = transferBoneWeightsPreview("head-nose-bridge", "rigid");
    expect(rigidWeights.bindings).toHaveLength(1);
    expect(rigidWeights.totalWeight).toBe(1);
    expect(rigidWeights.springSecondaryMotion).toBe(false);

    const clothWeights = transferBoneWeightsPreview("back-upper-spine", "soft-cloth", 18);
    expect(clothWeights.bindings.length).toBeGreaterThanOrEqual(2);
    expect(clothWeights.bindings.length).toBeLessThanOrEqual(4);
    expect(clothWeights.maxInfluencesPerVertex).toBeLessThanOrEqual(4);
    expect(clothWeights.totalWeight).toBeCloseTo(1, 3);
    expect(clothWeights.springSecondaryMotion).toBe(true);
  });
});

describe("2. 웹툰 특화 3D 생성 파이프라인 (매니폴드 0 · 3층 분리 출력 · VRM 52 블렌드셰입)", () => {
  it("캐릭터 파이프라인이 멀티뷰 정합·매니폴드 쿼드 0·3단 셀 셰이더 3층 출력·VRM 52 블렌드셰입을 생성한다", () => {
    const plan = buildWebtoon3dGenPipelinePlan({
      assetKind: "character",
      assetTitleKo: "주인공 VRM 캐릭터",
      inputSource: "single-sketch",
      celBands: 3,
    });

    expect(plan.stages).toHaveLength(5);
    expect(plan.topologyContract.nonManifoldEdges).toBe(0);
    expect(plan.topologyContract.looseVertices).toBe(0);
    expect(plan.topologyContract.degenerateTriangles).toBe(0);
    expect(plan.topologyContract.floorGroundedY).toBe(0);
    expect(plan.topologyContract.metricUnitScale).toBe(1);
    expect(plan.threeLayerOutputs.map((layer) => layer.id)).toEqual([
      "lineart",
      "shading",
      "material-id-mask",
    ]);
    expect(plan.riggingContract.vrmHumanoidEnabled).toBe(true);
    expect(plan.riggingContract.blendshapeCount).toBe(52);
    expect(plan.riggingContract.autoFitSocketCount).toBe(42);
  });

  it("배경·소품 파이프라인은 모바일 예산과 3층 출력(선화/음영/재질 ID 마스크)을 유지한다", () => {
    const bgPlan = buildWebtoon3dGenPipelinePlan({
      assetKind: "background",
      assetTitleKo: "옥상 3D 배경",
      inputSource: "text-prompt",
      targetPlatform: "mobile-hero",
    });

    expect(bgPlan.multiviewAnglesCount).toBe(8);
    expect(bgPlan.topologyContract.triangleBudgetMax).toBe(45_000);
    expect(bgPlan.riggingContract.blendshapeCount).toBe(0);
    expect(bgPlan.threeLayerOutputs).toHaveLength(3);
  });
});

describe("3. 4단계 창작 규모별 자동 적응 모드 (1인 / 2~3인 / 7~8인 / 30인+)", () => {
  it("인원수에 따라 4단계 규모를 정확히 분류하고 UI 가시성을 전환한다", () => {
    expect(STUDIO_TEAM_SCALE_ORDER).toEqual([
      "solo",
      "small-team",
      "production-team",
      "enterprise-studio",
    ]);
    expect(classifyTeamScaleByMemberCount(1)).toBe("solo");
    expect(classifyTeamScaleByMemberCount(3)).toBe("small-team");
    expect(classifyTeamScaleByMemberCount(8)).toBe("production-team");
    expect(classifyTeamScaleByMemberCount(35)).toBe("enterprise-studio");

    const solo = resolveTeamScaleWorkspaceConfig("solo");
    expect(solo.uiVisibility.approvalWorkflow).toBe(false);
    expect(solo.uiVisibility.taskAssignment).toBe(false);
    expect(solo.uiVisibility.kanbanBoard).toBe(false);
    expect(solo.uiVisibility.aiMultiAssistantDock).toBe(true);
    expect(solo.canvasViewportTargetPct).toBe(90);

    const small = resolveTeamScaleWorkspaceConfig("small-team");
    expect(small.uiVisibility.relay3LaneBoard).toBe(true);
    expect(small.uiVisibility.oneClickBatonTouch).toBe(true);
    expect(small.uiVisibility.layerLockGuards).toBe(true);
    expect(small.uiVisibility.multiTitleControlTower).toBe(false);
    expect(STUDIO_TEAM_SCALE_PRESETS["small-team"].relayLanes).toHaveLength(3);

    const prod = resolveTeamScaleWorkspaceConfig("production-team");
    expect(prod.uiVisibility.kanbanBoard).toBe(true);
    expect(prod.uiVisibility.bottleneckHeatmap).toBe(true);
    expect(prod.uiVisibility.biblePaletteMandatorySync).toBe(true);
    expect(prod.preset.biblePaletteSyncPolicy.mandatoryBibleSync).toBe(true);

    const ent = resolveTeamScaleWorkspaceConfig("enterprise-studio");
    expect(ent.uiVisibility.multiTitleControlTower).toBe(true);
    expect(ent.uiVisibility.rbacAdminPanel).toBe(true);
    expect(ent.uiVisibility.outsourceSandbox).toBe(true);
    expect(ent.uiVisibility.renderFarmQueue).toBe(true);
  });

  it("2~3인 바통 터치 · 7~8인 병목 히트맵 · 30인+ RBAC/외주 샌드박스·권리 BOM/병렬 렌더 큐가 정확히 동작한다", () => {
    const handoff = createBatonTouchHandoff("story-lineart", "메인 작가", "1~15컷");
    expect(handoff.toLane?.id).toBe("flat-shading");
    expect(handoff.lockedLayerNamesKo).toContain("선화 잉크");
    expect(handoff.unlockedLayerNamesKo).toContain("밑색 마스크");

    const heatmap = computeDeadlineBottleneckHeatmap([
      { stageKo: "명암", queuedCuts: 30, activeArtists: 1, avgMinutesPerCut: 20, hoursUntilDeadline: 4 },
      { stageKo: "식자", queuedCuts: 6, activeArtists: 2, avgMinutesPerCut: 10, hoursUntilDeadline: 5 },
    ]);
    expect(heatmap[0].severity).toBe("critical");
    expect(heatmap[1].severity).toBe("smooth");

    expect(evaluateEnterpriseRbacPermission("studio-director", "manageRbac")).toBe(true);
    expect(evaluateEnterpriseRbacPermission("external-contractor", "exportCutSandbox")).toBe(false);
    expect(evaluateEnterpriseRbacPermission("legal-rights-auditor", "auditRightsBom")).toBe(true);

    const blockedSandbox = buildOutsourceCutSandboxPackage({
      episodeId: "ep14",
      cutIds: ["cut-1", "cut-2"],
      recipientId: "vendor-a",
      expiresInHours: 24,
      bomAssets: [
        {
          assetId: "font-restricted",
          titleKo: "사내 전용 폰트",
          kind: "font",
          licenseCleared: true,
          allowOutsourceRedistribution: false,
        },
      ],
    });
    expect(blockedSandbox.allowed).toBe(false);
    expect(blockedSandbox.rightsBomPassed).toBe(false);
    expect(blockedSandbox.blockedAssetIds).toEqual(["font-restricted"]);

    const renderPlan = distributeParallelRenderQueue(
      [
        { jobId: "j1", titleKo: "컷1", estimatedSeconds: 60, priority: "urgent" },
        { jobId: "j2", titleKo: "컷2", estimatedSeconds: 50, priority: "urgent" },
        { jobId: "j3", titleKo: "컷3", estimatedSeconds: 40, priority: "normal" },
        { jobId: "j4", titleKo: "컷4", estimatedSeconds: 30, priority: "batch" },
      ],
      ["gpu-1", "gpu-2"],
    );
    expect(renderPlan.makespanSeconds).toBe(90);
    expect(renderPlan.sequentialTotalSeconds).toBe(180);
    expect(renderPlan.speedupFactor).toBe(2);
  });
});

describe("4. 멀티 모니터 팝아웃 오케스트레이터 & 가상 스튜디오 실무화 엔진", () => {
  it("Window Management API(getScreenDetails) 감지 및 1·2·3모니터·액정타블렛 배치를 계산한다", () => {
    const supportedProbe = probeMultiMonitorEnvironment({
      getScreenDetails: async () => ({ screens: [{}, {}] }),
      screen: { isExtended: true },
    });
    expect(supportedProbe.windowManagementApiSupported).toBe(true);
    expect(supportedProbe.detectedScreenCount).toBe(2);

    const fallbackProbe = probeMultiMonitorEnvironment({});
    expect(fallbackProbe.windowManagementApiSupported).toBe(false);

    const single = planMultiMonitorLayout({ screens: createMonitorPresetScreens("single-monitor") });
    expect(single.topology).toBe("single-monitor");
    expect(single.primaryCanvasViewportPct).toBeGreaterThanOrEqual(82);
    expect(single.popoutWindows).toHaveLength(0);

    const dual = planMultiMonitorLayout({ screens: createMonitorPresetScreens("dual-monitor") });
    expect(dual.primaryCanvasViewportPct).toBe(100);
    expect(dual.popoutWindows).toHaveLength(2);
    const readerPopout = dual.popoutWindows.find((win) => win.id === "reader-mobile-scroll-preview");
    expect(readerPopout?.targetSyncLatencyMs).toBe(16);

    const triple = planMultiMonitorLayout({ screens: createMonitorPresetScreens("triple-monitor") });
    expect(triple.topology).toBe("triple-monitor");
    expect(triple.primaryCanvasViewportPct).toBe(100);
    expect(triple.popoutWindows).toHaveLength(3);

    const penDisplay = planMultiMonitorLayout({
      screens: createMonitorPresetScreens("pen-display-plus-monitor"),
    });
    expect(penDisplay.topology).toBe("pen-display-plus-monitor");
    expect(penDisplay.penDisplayDedicatedCanvas).toBe(true);
    expect(penDisplay.primaryCanvasScreenId).toBe("screen-pen-tablet");
    expect(penDisplay.primaryCanvasViewportPct).toBe(100);
  });

  it("가상 화실 50/10 포모도로 조명(햇살→노을→밤 스탠드)·셔터 2D 컷 삽입·로컬 웹캠 거울 부스를 제어한다", () => {
    const initial = createVirtualWorkdeskSession({ initialLighting: "morning-sunlight" });
    expect(initial.pomodoroRhythm.focusMinutes).toBe(50);
    expect(initial.pomodoroRhythm.breakMinutes).toBe(10);
    expect(initial.pomodoroRhythm.phase).toBe("focus");
    expect(initial.webcamMirrorBooth.enabled).toBe(false);
    expect(initial.webcamMirrorBooth.onDeviceOnly).toBe(true);

    // 1회 전진: focus -> break (10분 휴식 안내)
    const onBreak = advancePomodoroWorkdeskPhase(initial);
    expect(onBreak.pomodoroRhythm.phase).toBe("break");
    expect(onBreak.pomodoroRhythm.completedFocusCycles).toBe(1);
    expect(onBreak.pomodoroRhythm.breakGuidanceKo).toContain("10분 휴식");

    // 2회 전진: break -> focus (햇살 -> 노을 자동 전환)
    const sunsetFocus = advancePomodoroWorkdeskPhase(onBreak);
    expect(sunsetFocus.pomodoroRhythm.phase).toBe("focus");
    expect(sunsetFocus.pomodoroRhythm.lightingPresetId).toBe("sunset-atelier");
    expect(sunsetFocus.pomodoroRhythm.activeLighting.colorTempKelvin).toBe(
      VIRTUAL_WORKDESK_LIGHTING_PRESETS["sunset-atelier"].colorTempKelvin,
    );

    // 셔터 -> 2D 컷 즉시 삽입
    const withCapture = triggerVirtualCameraShutter(sunsetFocus, {
      cutNumber: 15,
      cameraPresetKo: "하이앵글 옥상 28mm",
      focalLengthMm: 28,
      includeThreeLayerPasses: true,
    });
    expect(withCapture.capturedCuts).toHaveLength(1);
    expect(withCapture.capturedCuts[0].insertedInto2dCut).toBe(true);
    expect(withCapture.capturedCuts[0].cutNumber).toBe(15);

    // 웹캠 거울 부스 옵트인
    const withWebcam = updateWebcamMirrorBoothState(withCapture, {
      enabled: true,
      mirrorMode: "hand-pose-mirror",
    });
    expect(withWebcam.webcamMirrorBooth.enabled).toBe(true);
    expect(withWebcam.webcamMirrorBooth.onDeviceOnly).toBe(true);
    expect(withWebcam.webcamMirrorBooth.mirrorMode).toBe("hand-pose-mirror");
  });
});

describe("5. StudioScaleAnd3dFitConsole UI 렌더링 · 인터랙션 · 품질 계약", () => {
  it("4단계 규모 원클릭 전환, 3D 자연 밀착 자동 보정, 멀티 모니터 배치도, 가상 화실 조명을 조작할 수 있다", () => {
    render(<StudioScaleAnd3dFitConsole />);

    // 1) 기본 1인 모드 -> 2~3인 바통 터치 -> 30인+ 전환
    expect(screen.getByTestId("active-scale-pill").textContent).toContain("1인 작가 모드");
    expect(screen.getByTestId("hidden-clutter-summary").textContent).toContain("결재 승인함");

    fireEvent.click(screen.getByTestId("scale-tier-btn-small-team"));
    expect(screen.getByTestId("active-scale-pill").textContent).toContain("소규모 팀");
    fireEvent.click(screen.getByTestId("baton-touch-btn"));
    expect(screen.getByRole("status").textContent).toContain("바통을 넘겼습니다");

    fireEvent.click(screen.getByTestId("scale-tier-btn-enterprise-studio"));
    expect(screen.getByTestId("active-scale-pill").textContent).toContain("대규모 스튜디오");

    // 2) 3D 자연 밀착 & 웹툰 3D 생성 탭
    fireEvent.click(screen.getByTestId("scale-fit-tab-autofit-3d"));
    expect(screen.getByTestId("scale-fit-3d-panel")).toBeTruthy();
    const offsetSlider = screen.getByLabelText(/Anti-Clip 피부 밀착 오프셋/u);
    fireEvent.change(offsetSlider, { target: { value: "0.5" } });
    expect(screen.getByTestId("anticlip-offset-value").textContent).toContain("0.5mm");
    fireEvent.click(screen.getByTestId("apply-autofit-correction-btn"));
    expect(screen.getByTestId("fit-confidence-badge").textContent).toContain("점");

    // 3) 멀티 모니터 팝아웃 탭
    fireEvent.click(screen.getByTestId("scale-fit-tab-multi-monitor"));
    expect(screen.getByTestId("multi-monitor-panel")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "액정타블렛 + 보조" }));
    expect(screen.getByTestId("multi-monitor-summary").textContent).toContain("액정타블렛");

    // 4) 가상 화실 포모도로 탭
    fireEvent.click(screen.getByTestId("scale-fit-tab-virtual-workdesk"));
    const workdesk = screen.getByTestId("virtual-workdesk-panel");
    expect(workdesk.getAttribute("data-workdesk-lighting")).toBe("morning-sunlight");
    fireEvent.click(screen.getByRole("button", { name: /밤 스탠드 집중 모드/u }));
    expect(workdesk.getAttribute("data-workdesk-lighting")).toBe("night-desk-lamp");
    fireEvent.click(screen.getByTestId("virtual-shutter-btn"));
    expect(screen.getByTestId("latest-shutter-capture").textContent).toContain("즉시 삽입");
    fireEvent.click(screen.getByTestId("webcam-mirror-toggle-btn"));
    expect(screen.getByTestId("webcam-mirror-toggle-btn").getAttribute("aria-pressed")).toBe("true");
  });

  it("4종 컬러 스프라이트 WebP 실존 및 CSS/TSX 무원시색·무스토리지·접근성 계약을 만족한다", () => {
    for (const relPath of Object.values(STUDIO_SCALE_FIT_SPRITE_PATHS)) {
      const diskPath = resolve(process.cwd(), "apps/web/public", relPath.replace(/^\//u, ""));
      expect(existsSync(diskPath)).toBe(true);
    }

    const css = readFileSync(
      resolve(
        process.cwd(),
        "apps/web/src/domains/creator/studio-scale-and-3d-fit/studio-scale-and-3d-fit.css",
      ),
      "utf8",
    );
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(css).not.toContain("transition: all");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("word-break: keep-all");
    expect(css).toContain("tabular-nums");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("forced-colors: active");

    const sourceFiles = [
      "character-3d-item-autofit-engine.ts",
      "vrm-autofit-socket-registry.ts",
      "team-scale-adaptive-mode.ts",
      "multi-monitor-and-virtual-workdesk.ts",
      "StudioScaleAnd3dFitConsole.tsx",
      "StudioScaleAnd3dFitDetailTabs.tsx",
    ];
    for (const fileName of sourceFiles) {
      const content = readFileSync(
        resolve(process.cwd(), "apps/web/src/domains/creator/studio-scale-and-3d-fit", fileName),
        "utf8",
      );
      expect(content).not.toMatch(/\b(localStorage|sessionStorage|indexedDB)\b/u);
      expect(content.split("\n").length).toBeLessThanOrEqual(600);
    }
  });
});
