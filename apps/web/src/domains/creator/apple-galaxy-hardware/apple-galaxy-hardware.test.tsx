// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { StudioAppleGalaxyHardwarePanel } from "./StudioAppleGalaxyHardwarePanel";
import {
  DEFAULT_APPLE_WORKSPACE_INPUT,
  DEFAULT_GALAXY_WORKSPACE_INPUT,
  buildAppleWorkspacePlan,
  buildGalaxyWorkspacePlan,
  buildSamsungDexDualLayout,
  buildToonStudioDeepLink,
  buildVisionProSpatialWindows,
  computeProMotionFrameBudget,
  evaluateFoldableFlexPosture,
  mapForceTouchTrackpadGesture,
  mapGalaxyWatchBezelTick,
  mapSPenAirActionGesture,
  normalizeAndroidShareTargetPayload,
  parseToonStudioDeepLink,
  resolveDisplayP3SurfaceConfig,
} from "./apple-galaxy-ecosystem-engine";
import {
  DEFAULT_COLLISION_SCENE_BODIES,
  DEFAULT_MIDI_CHANNEL_MAP,
  createDefaultMidiMixerState,
  createInitialFootPedalState,
  mapMidiCcToStudioControl,
  resolveObjectCollisionAndDropToFloor,
  routeFootPedalEvent,
  simulatePhysicalTrajectoryFrame,
  type CollisionBodyInput,
} from "./collision-trajectory-midi-pedal";

const RAW_COLOR_REGEX = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/;
const MODULE_DIR = resolve(process.cwd(), "apps/web/src/domains/creator/apple-galaxy-hardware");

describe("apple-galaxy-hardware: Apple 5종 · Galaxy 5종 · 3D 간섭/물리 궤적 · Web MIDI/풋 페달 · UI", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("Apple 생태계 5종(Display-P3 · ProMotion 120Hz · Force Touch · toonstudio:// Handoff · Stage Manager/Universal Control/Vision Pro)을 검증한다", () => {
    // 1) Display-P3 광색역 및 혼합 색역 경고
    const p3Surface = resolveDisplayP3SurfaceConfig(
      { widthPx: 2560, heightPx: 1440, scaleFactor: 2, supportsDisplayP3: true, hdrHeadroom: 2.0, maxRefreshHz: 120 },
      { role: "external-studio-display", widthPx: 1920, heightPx: 1080, supportsDisplayP3: false },
    );
    expect(p3Surface.colorSpace).toBe("display-p3");
    expect(p3Surface.canvas2dContextOptions.colorSpace).toBe("display-p3");
    expect(p3Surface.webGpuFormat).toBe("rgba16float");
    expect(p3Surface.mixedGamutWarning).toBe(true);
    expect(p3Surface.fallbackMappingPolicy).toBe("perceptual-clip");

    const srgbSurface = resolveDisplayP3SurfaceConfig({
      widthPx: 1920, heightPx: 1080, scaleFactor: 1, supportsDisplayP3: false, maxRefreshHz: 60,
    });
    expect(srgbSurface.colorSpace).toBe("srgb");
    expect(srgbSurface.webGpuFormat).toBe("bgra8unorm");

    // 2) ProMotion 120Hz 가변 주사율 및 열/절전 제어
    const draw120 = computeProMotionFrameBudget(120, "drawing", "nominal", false);
    expect(draw120.targetHz).toBe(120);
    expect(draw120.frameBudgetMs).toBe(8.33);
    expect(draw120.predictedPointerHorizonMs).toBe(8.33);
    expect(draw120.useCoalescedEvents).toBe(true);

    const idle24 = computeProMotionFrameBudget(120, "idle", "nominal", false);
    expect(idle24.targetHz).toBe(24);
    const thermalCap = computeProMotionFrameBudget(120, "drawing", "critical", false);
    expect(thermalCap.targetHz).toBe(48);
    expect(thermalCap.throttledBySystem).toBe(true);

    // 3) macOS Force Touch 트랙패드 압력 단계(0/1/2) 및 멀티핑거 매핑
    expect(mapForceTouchTrackpadGesture({ webkitForce: 0.4 }).studioCommand).toBe("hover");
    const stage1 = mapForceTouchTrackpadGesture({ webkitForce: 1.6, fingerCount: 1 });
    expect(stage1.stage).toBe(1);
    expect(stage1.studioCommand).toBe("pressure-stroke");
    expect(stage1.hapticPattern).toBe("alignment-detent");

    expect(mapForceTouchTrackpadGesture({ webkitForce: 2.3, fingerCount: 1 }).studioCommand).toBe("eyedropper-loupe");
    expect(mapForceTouchTrackpadGesture({ webkitForce: 2.4, fingerCount: 1, paintingMode: true }).studioCommand).toBe("pressure-boost");
    expect(mapForceTouchTrackpadGesture({ webkitForce: 2.2, fingerCount: 1, modifier: "option" }).studioCommand).toBe("quick-look-reference");
    expect(mapForceTouchTrackpadGesture({ webkitForce: 2.2, fingerCount: 2 }).studioCommand).toBe("zoom-fit-toggle");
    expect(mapForceTouchTrackpadGesture({ webkitForce: 2.2, fingerCount: 3 }).studioCommand).toBe("radial-palette-peek");

    // 4) toonstudio:// 단축어·Handoff 딥링크 빌드/파싱 라운드트립 및 악성 URL 차단
    const built = buildToonStudioDeepLink({
      action: "handoff-resume",
      projectId: "night-shift_01",
      episodeId: "ep07",
      cutIndex: 18,
      layerId: "ink-main",
      zoomPct: 165,
      scrollY: 4200,
      sourceDevice: "ipad",
      shortcutName: "밤샘 마감 이어그리기",
      handoffTokenHash: "hnd_90ab12cd",
    });
    const parsed = parseToonStudioDeepLink(built);
    expect(parsed.valid).toBe(true);
    expect(parsed.action).toBe("handoff-resume");
    expect(parsed.projectId).toBe("night-shift_01");
    expect(parsed.cutIndex).toBe(18);
    expect(parsed.zoomPct).toBe(165);
    expect(parsed.sourceDevice).toBe("ipad");
    expect(parsed.restorePlan?.activityType).toBe("cloud.toonstudio.handoff.canvas");
    expect(parsed.restorePlan?.targetRoute).toBe("/studio/night-shift_01/episode/ep07");

    expect(parseToonStudioDeepLink("javascript:alert(1)").errorCode).toBe("disallowed-scheme");
    expect(parseToonStudioDeepLink("https://evil.example/open?projectId=a").errorCode).toBe("disallowed-scheme");
    expect(parseToonStudioDeepLink("toonstudio://handoff-resume?projectId=../etc/passwd").errorCode).toBe("unsafe-character");
    expect(parseToonStudioDeepLink("toonstudio://unknown-op?projectId=rain-01").errorCode).toBe("unsupported-action");

    // 5) Stage Manager / Mac Universal Control / Vision Pro 3-창 공간 배치
    const macUcPlan = buildAppleWorkspacePlan(DEFAULT_APPLE_WORKSPACE_INPUT);
    expect(macUcPlan.universalControlBridge.enabled).toBe(true);
    expect(macUcPlan.windows.length).toBe(3);
    expect(macUcPlan.canvasViewportRatioPct).toBeGreaterThanOrEqual(82);

    const ipadStagePlan = buildAppleWorkspacePlan({
      ...DEFAULT_APPLE_WORKSPACE_INPUT,
      formFactor: "ipad-stage-manager",
      secondaryDisplay: undefined,
    });
    expect(ipadStagePlan.windows).toHaveLength(2);
    expect(ipadStagePlan.canvasViewportRatioPct).toBeGreaterThanOrEqual(82);

    const visionWindows = buildVisionProSpatialWindows({ viewingDistanceMeters: 1.7, canvasWidthMeters: 1.3 });
    expect(visionWindows.windows).toHaveLength(3);
    expect(visionWindows.windows.map((w) => w.windowId)).toEqual([
      "left-tools-layers",
      "main-canvas",
      "right-reference-3d",
    ]);
    expect(visionWindows.windows[0].yawDeg).toBe(22);
    expect(visionWindows.windows[1].yawDeg).toBe(0);
    expect(visionWindows.windows[2].yawDeg).toBe(-22);
    expect(visionWindows.withinErgonomicNeckLimit).toBe(true);

    const visionPlan = buildAppleWorkspacePlan({
      ...DEFAULT_APPLE_WORKSPACE_INPUT,
      formFactor: "vision-pro-spatial",
    });
    expect(visionPlan.visionProLayout?.windows).toHaveLength(3);
    expect(visionPlan.canvasViewportRatioPct).toBe(90);
  });

  it("Android · Galaxy 생태계 5종(S-Pen 에어 액션 · DeX 듀얼 · Z Fold Flex 힌지 · Share Target · Watch 베젤)을 검증한다", () => {
    // 1) S-Pen 에어 액션 BLE 제스처 + 커스텀 바인딩 + 저전력 경고
    const flickUndo = mapSPenAirActionGesture({ gesture: "hold-flick-left", hoverDistanceMm: 4, tiltDeg: 35, batteryPct: 80 });
    expect(flickUndo.command).toBe("undo");
    expect(flickUndo.bleConnected).toBe(true);
    expect(flickUndo.lowBatteryWarning).toBe(false);

    const customLowBat = mapSPenAirActionGesture({
      gesture: "double-press",
      batteryPct: 12,
      customBindings: { "double-press": "canvas-rotate-cw" },
    });
    expect(customLowBat.command).toBe("canvas-rotate-cw");
    expect(customLowBat.lowBatteryWarning).toBe(true);

    // 2) Samsung DeX 외부 모니터 분리 레이아웃
    const dexActive = buildSamsungDexDualLayout({ connected: true, widthPx: 2560, heightPx: 1440 }, 1856, 2160);
    expect(dexActive.active).toBe(true);
    expect(dexActive.externalMonitorCanvas.canvasViewportRatioPct).toBeGreaterThan(95);
    expect(dexActive.deviceCompanionPad.mode).toBe("spen-digitizer-pad");
    expect(dexActive.deviceCompanionPad.aspectPreserved).toBe(true);
    expect(dexActive.deviceCompanionPad.quickKeys).toContain("flip-horizontal");

    // 3) Galaxy Z Fold DevicePosture 힌지 각도별 3단계 자동 전환
    const cover = evaluateFoldableFlexPosture({ posture: "folded", hingeAngleDeg: 10, screenWidthPx: 904, screenHeightPx: 2316 });
    expect(cover.mode).toBe("cover-screen");
    expect(cover.bottomControllerRect).toBeNull();

    const flex = evaluateFoldableFlexPosture({
      posture: "folded", hingeAngleDeg: 108, screenWidthPx: 1856, screenHeightPx: 2160, creaseThicknessPx: 30,
    });
    expect(flex.mode).toBe("flex-mode-split");
    expect(flex.bottomControllerRect).not.toBeNull();
    expect(flex.creaseExclusionBandPx.thickness).toBe(30);
    expect(flex.topCanvasRect.y + flex.topCanvasRect.height).toBeLessThanOrEqual(flex.creaseExclusionBandPx.start);
    expect(flex.bottomControllerRect?.y).toBeGreaterThanOrEqual(flex.creaseExclusionBandPx.end);
    expect(flex.controllerModules).toContain("color-wheel");

    const flat = evaluateFoldableFlexPosture({ posture: "continuous", hingeAngleDeg: 178, screenWidthPx: 1856, screenHeightPx: 2160 });
    expect(flat.mode).toBe("unfolded-tablet");
    expect(flat.canvasViewportRatioPct).toBeGreaterThanOrEqual(82);

    // 4) Android PWA Share Target / Quick Share 정규화 및 보안 필터링
    const shareRes = normalizeAndroidShareTargetPayload({
      sourceApp: "quick-share",
      title: "씬 레퍼런스\u0007공유",
      text: "옥상 컷 조명",
      url: "javascript:alert(1)",
      files: [
        { name: "bg-sky.webp", mimeType: "image/webp", sizeBytes: 512_000 },
        { name: "prop.glb", mimeType: "model/gltf-binary", sizeBytes: 2_400_000 },
        { name: "../../evil.png", mimeType: "image/png", sizeBytes: 120_000 },
        { name: "payload.exe", mimeType: "application/x-msdownload", sizeBytes: 50_000 },
        { name: "huge.png", mimeType: "image/png", sizeBytes: 90_000_000 },
      ],
    });
    expect(shareRes.safeUrl).toBeNull();
    expect(shareRes.rejectedUrlReason).toContain("disallowed-url-scheme");
    expect(shareRes.acceptedFiles).toHaveLength(2);
    expect(shareRes.acceptedFiles[0].targetRoute).toBe("reference-board");
    expect(shareRes.acceptedFiles[1].targetRoute).toBe("3d-prop-stage");
    expect(shareRes.rejectedFiles.map((f) => f.reasonCode)).toEqual([
      "unsafe-filename",
      "unsupported-mime",
      "oversized-file",
    ]);

    // 5) Galaxy Watch 회전 베젤 다이얼 (가속 배율 · 360도 래핑 · 디바운스)
    const fastSpin = mapGalaxyWatchBezelTick({ deltaTicks: 2, intervalMs: 30, mode: "brush-size", currentValue: 20 });
    expect(fastSpin.accepted).toBe(true);
    expect(fastSpin.accelerationMultiplier).toBe(4);
    expect(fastSpin.nextValue).toBe(36);

    const wrapRotate = mapGalaxyWatchBezelTick({ deltaTicks: -2, intervalMs: 140, mode: "canvas-rotate", currentValue: 5 });
    expect(wrapRotate.nextValue).toBe(355);

    const bounceIgnore = mapGalaxyWatchBezelTick({ deltaTicks: 1, intervalMs: 6, mode: "opacity", currentValue: 80 });
    expect(bounceIgnore.accepted).toBe(false);

    // 통합 Galaxy 플랜
    const galaxyPlan = buildGalaxyWorkspacePlan(DEFAULT_GALAXY_WORKSPACE_INPUT);
    expect(galaxyPlan.activeFormFactor).toBe("flex-mode-split");
    expect(galaxyPlan.shareIntake?.acceptedFiles).toHaveLength(2);
  });

  it("3D/2D OBB·AABB 간섭 방지 솔버는 겹침을 0mm로 해소하고 중력 방향으로 바닥/지지면에 정확히 안착시킨다", () => {
    // 1) 기본 책상+회전 머그컵+스케치북+의자 씬: 초기 겹침 > 0 -> 최종 0mm, 책상 위 지지 & 의자 바닥 안착
    const sceneRes = resolveObjectCollisionAndDropToFloor(DEFAULT_COLLISION_SCENE_BODIES, { floorY: 0, minClearanceMm: 0 });
    expect(sceneRes.initialMaxPenetrationMm).toBeGreaterThan(0);
    expect(sceneRes.finalMaxPenetrationMm).toBe(0);
    expect(sceneRes.zeroPenetrationVerified).toBe(true);

    const desk = sceneRes.bodies.find((b) => b.id === "desk-static");
    const mug = sceneRes.bodies.find((b) => b.id === "mug-obb");
    const chair = sceneRes.bodies.find((b) => b.id === "chair-obb");
    expect(desk?.displacementMm).toBe(0);
    expect(mug?.supportedById).toBe("desk-static");
    expect(mug?.minWorldY).toBeCloseTo(0.75, 2);
    expect(chair?.supportedById).toBe("floor");
    expect(chair?.minWorldY).toBeCloseTo(0, 3);

    // 1-b) 다단 적재(책상 위 스케치북 위 지우개) 중력 안착 + 0mm 간섭 검증
    const stackedRes = resolveObjectCollisionAndDropToFloor([
      ...DEFAULT_COLLISION_SCENE_BODIES,
      { id: "eraser-top", shape: "aabb", center: { x: 0.06, y: 1.25, z: 0.03 }, halfExtents: { x: 0.03, y: 0.01, z: 0.02 } },
    ]);
    expect(stackedRes.finalMaxPenetrationMm).toBe(0);
    const eraser = stackedRes.bodies.find((b) => b.id === "eraser-top");
    expect(eraser?.supportedById).toBe("sketchbook-obb");
    expect(eraser?.minWorldY).toBeCloseTo(0.79, 2);

    // 2) 동일 좌표 완전 중첩 회전 3D OBB 2개 + 2D 모드 검증
    const identicalOverlap: readonly CollisionBodyInput[] = [
      { id: "a", shape: "obb", center: { x: 0, y: 1.2, z: 0 }, halfExtents: { x: 0.25, y: 0.25, z: 0.25 }, rotationDeg: { x: 0, y: 45, z: 0 } },
      { id: "b", shape: "obb", center: { x: 0, y: 1.2, z: 0 }, halfExtents: { x: 0.25, y: 0.25, z: 0.25 }, rotationDeg: { x: 0, y: -30, z: 0 } },
    ];
    const separated = resolveObjectCollisionAndDropToFloor(identicalOverlap, { floorY: 0, minClearanceMm: 5 });
    expect(separated.initialMaxPenetrationMm).toBeGreaterThan(400);
    expect(separated.finalMaxPenetrationMm).toBe(0);
    expect(separated.zeroPenetrationVerified).toBe(true);
    expect(separated.bodies.every((b) => b.minWorldY >= -0.001)).toBe(true);

    const res2d = resolveObjectCollisionAndDropToFloor(
      [
        { id: "card-1", shape: "aabb", center: { x: 0, y: 0.5, z: 2.5 }, halfExtents: { x: 0.3, y: 0.2, z: 0.1 } },
        { id: "card-2", shape: "aabb", center: { x: 0.1, y: 0.5, z: 2.5 }, halfExtents: { x: 0.3, y: 0.2, z: 0.1 } },
      ],
      { floorY: 0, dimensionMode: "2d" },
    );
    expect(res2d.finalMaxPenetrationMm).toBe(0);
    expect(res2d.bodies[0].resolvedCenter.z).toBe(2.5);
    expect(res2d.bodies[1].resolvedCenter.z).toBe(2.5);
  });

  it("포물선 탄도 · 유리파편 폭발 · 꽃잎 흩날림 물리 궤적 프레임을 결정론적으로 추출한다", () => {
    const ballEarly = simulatePhysicalTrajectoryFrame({ preset: "ballistic", timeSec: 0.7, fps: 24 });
    const ballLate = simulatePhysicalTrajectoryFrame({ preset: "ballistic", timeSec: 2.1, fps: 24 });
    expect(ballEarly.frameIndex).toBe(17);
    expect(ballEarly.metrics.apexHeightM).toBeGreaterThan(3.5);
    expect(ballEarly.particles[0].trail.length).toBeGreaterThanOrEqual(4);
    expect(ballLate.particles[0].bounces).toBeGreaterThanOrEqual(1);
    expect(ballLate.metrics.maxHorizontalRangeM).toBeGreaterThan(ballEarly.metrics.maxHorizontalRangeM);

    const glassA = simulatePhysicalTrajectoryFrame({ preset: "glass-shatter", timeSec: 0.45, particleCount: 16, seed: 777 });
    const glassB = simulatePhysicalTrajectoryFrame({ preset: "glass-shatter", timeSec: 0.45, particleCount: 16, seed: 777 });
    expect(glassA.particles).toHaveLength(16);
    expect(glassA.particles[0].position).toEqual(glassB.particles[0].position);
    expect(glassA.particles.some((p) => p.glintIntensity > 0)).toBe(true);

    const petals = simulatePhysicalTrajectoryFrame({ preset: "petal-drift", timeSec: 1.5, particleCount: 12, seed: 42 });
    expect(petals.particles).toHaveLength(12);
    expect(petals.metrics.averageSpeedMps).toBeLessThan(4.5);
    expect(petals.particles.some((p) => p.position.x > -1.4)).toBe(true);
  });

  it("Web MIDI 8채널 믹서(브러시·불투명도·수분·종이결·임파스토·색온도·명도·채도)와 USB/BLE 3-페달 라우터를 검증한다", () => {
    expect(DEFAULT_MIDI_CHANNEL_MAP).toHaveLength(8);
    const mixer = createDefaultMidiMixerState();

    // 8개 전체 채널 매핑 확인
    for (const ch of DEFAULT_MIDI_CHANNEL_MAP) {
      const mapped = mapMidiCcToStudioControl({ status: 0xb0, cc: ch.cc, value: 127, currentValues: mixer });
      expect(mapped.matched).toBe(true);
      expect(mapped.controlId).toBe(ch.controlId);
      expect(mapped.mappedValue).toBeCloseTo(ch.max, 1);
      expect(mapped.ledFeedbackBytes[0]).toBe(0xb0);
      expect(mapped.ledFeedbackBytes[1]).toBe(ch.cc);
    }

    // 브러시 크기 지수 곡선 정밀도(CC 64 -> 중간값보다 작은 세밀한 구간) & 색온도 중앙 디텐트(6100K)
    const brushMid = mapMidiCcToStudioControl({ status: 0xb0, cc: 1, value: 64 });
    expect(brushMid.mappedValue).toBeGreaterThan(15);
    expect(brushMid.mappedValue).toBeLessThan(20);
    const colorTempNeutral = mapMidiCcToStudioControl({ status: 0xb0, cc: 6, value: 64 });
    expect(colorTempNeutral.mappedValue).toBe(6100);

    // Pickup 모드(소프트 테이크오버) & 비-CC 상태 차단
    const blockedPickup = mapMidiCcToStudioControl({ status: 0xb0, cc: 2, value: 10, currentValues: { opacity: 90 }, pickupMode: true });
    expect(blockedPickup.pickedUp).toBe(false);
    expect(blockedPickup.mappedValue).toBe(90);
    expect(mapMidiCcToStudioControl({ status: 0x90, cc: 1, value: 100 }).rejectReason).toBe("not-cc-status");
    expect(mapMidiCcToStudioControl({ status: 0xb0, cc: 99, value: 100 }).rejectReason).toBe("unmapped-cc");

    // USB/BLE 3-페달 라우터: 좌(Undo + 더블탭 Redo), 중(홀드 임시 지우개 -> 릴리즈 원복), 우(좌우 반전), 채터링 차단
    let state = createInitialFootPedalState("pen");
    const r1 = routeFootPedalEvent(state, { pedal: "left", phase: "down", timestampMs: 100 });
    expect(r1.command).toBe("undo");
    expect(r1.nextState.undoCount).toBe(1);
    const bounce = routeFootPedalEvent(r1.nextState, { pedal: "left", phase: "up", timestampMs: 112 });
    expect(bounce.accepted).toBe(false);
    expect(bounce.rejectReason).toBe("debounced");
    const r1Up = routeFootPedalEvent(r1.nextState, { pedal: "left", phase: "up", timestampMs: 160 });
    const r2Double = routeFootPedalEvent(r1Up.nextState, { pedal: "left", phase: "down", timestampMs: 280 });
    expect(r2Double.command).toBe("redo");
    expect(r2Double.nextState.redoCount).toBe(1);
    state = routeFootPedalEvent(r2Double.nextState, { pedal: "left", phase: "up", timestampMs: 340 }).nextState;

    const cDown = routeFootPedalEvent(state, { pedal: "center", phase: "down", timestampMs: 500, transport: "ble-midi" });
    expect(cDown.command).toBe("momentary-eraser-engage");
    expect(cDown.nextState.activeTool).toBe("eraser");
    const cUp = routeFootPedalEvent(cDown.nextState, { pedal: "center", phase: "up", timestampMs: 900, transport: "ble-midi" });
    expect(cUp.command).toBe("momentary-eraser-release");
    expect(cUp.nextState.activeTool).toBe("pen");

    const rightFlip = routeFootPedalEvent(cUp.nextState, { pedal: "right", phase: "down", timestampMs: 1200 });
    expect(rightFlip.command).toBe("canvas-flip-horizontal");
    expect(rightFlip.nextState.canvasFlippedH).toBe(true);
  });

  it("StudioAppleGalaxyHardwarePanel은 모든 props 없이 3개 탭·인터랙션·KO/EN 전환이 정상 동작한다", () => {
    const onApple = vi.fn();
    const onMidi = vi.fn();
    const onPedal = vi.fn();

    render(
      <StudioAppleGalaxyHardwarePanel
        onApplePlanChanged={onApple}
        onMidiControlMapped={onMidi}
        onFootPedalRouted={onPedal}
      />,
    );

    // Tab 1: Apple 생태계
    expect(screen.getByRole("tab", { name: "Apple 생태계(Mac·iPad·Vision Pro)" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("apple-gamut-badge").textContent).toContain("DISPLAY-P3");
    fireEvent.click(screen.getByRole("button", { name: "Vision Pro 3-창 공간" }));
    expect(onApple).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("vision-pro-layout-grid")).toBeTruthy();

    // Tab 2: Galaxy 특화
    fireEvent.click(screen.getByRole("tab", { name: "Galaxy 특화(S-Pen·DeX·Z Fold Flex)" }));
    expect(screen.getByTestId("galaxy-flex-summary").textContent).toContain("Flex Mode");
    fireEvent.click(screen.getByRole("button", { name: "DeX 외부 모니터 연결" }));
    expect(screen.getByTestId("galaxy-flex-summary").textContent).toContain("DeX 듀얼스크린 활성");
    fireEvent.click(screen.getByRole("button", { name: "+1 Tick" }));
    expect(screen.getByTestId("watch-bezel-readout").textContent).toContain("26px");

    // Tab 3: 3D 충돌·궤적 물리 · MIDI/풋 페달
    fireEvent.click(screen.getByRole("tab", { name: "3D 충돌·궤적 물리 · MIDI/풋 페달" }));
    expect(screen.getByTestId("collision-summary").textContent).toContain("최종 0mm");
    fireEvent.change(screen.getByLabelText("MIDI CC1 brush-size"), { target: { value: "100" } });
    expect(onMidi).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "좌: Undo" }));
    fireEvent.click(screen.getByRole("button", { name: "중: 임시 지우개" }));
    expect(screen.getByTestId("pedal-state-badge").textContent).toContain("eraser");
    fireEvent.click(screen.getByRole("button", { name: "중: 지우개 해제" }));
    expect(screen.getByTestId("pedal-state-badge").textContent).toContain("brush");
    fireEvent.click(screen.getByRole("button", { name: "우: 좌우 반전" }));
    expect(screen.getByTestId("pedal-state-badge").textContent).toContain("FLIP");
    expect(onPedal).toHaveBeenCalledTimes(4);

    // EN 전환 검증 (모든 props 생략)
    cleanup();
    useI18n.setState({ lang: "en" });
    render(<StudioAppleGalaxyHardwarePanel />);
    expect(screen.getByRole("tab", { name: "Apple Ecosystem (Mac · iPad · Vision Pro)" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Galaxy Special (S-Pen · DeX · Z Fold Flex)" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "3D Collision · Trajectory · MIDI/Pedal" })).toBeTruthy();
  });

  it("Calm Atelier 토큰 위생·배럴 금지·원시색상/localStorage/transition-all 0건·파일 줄 수 상한을 모두 준수한다", () => {
    expect(existsSync(resolve(MODULE_DIR, "index.ts"))).toBe(false);
    expect(existsSync(resolve(MODULE_DIR, "index.tsx"))).toBe(false);

    const fileBudgets: readonly { readonly file: string; readonly maxLines: number; readonly isTest?: boolean }[] = [
      { file: "apple-galaxy-ecosystem-engine.ts", maxLines: 700 },
      { file: "collision-trajectory-midi-pedal.ts", maxLines: 680 },
      { file: "StudioAppleGalaxyHardwarePanel.tsx", maxLines: 460 },
      { file: "apple-galaxy-hardware.test.tsx", maxLines: 750, isTest: true },
    ];

    for (const entry of fileBudgets) {
      const source = readFileSync(resolve(MODULE_DIR, entry.file), "utf8");
      const lineCount = source.split("\n").length;
      expect(lineCount, `${entry.file} line count ${lineCount} <= ${entry.maxLines}`).toBeLessThanOrEqual(entry.maxLines);
      expect(RAW_COLOR_REGEX.test(source), `${entry.file} must not contain raw hex/rgb/hsl`).toBe(false);
      if (!entry.isTest) {
        expect(source.includes("localStorage"), `${entry.file} must not use localStorage`).toBe(false);
        expect(source.includes("transition-all"), `${entry.file} must not use transition-all`).toBe(false);
      }
    }

    const panelSource = readFileSync(resolve(MODULE_DIR, "StudioAppleGalaxyHardwarePanel.tsx"), "utf8");
    expect(panelSource).toContain("[word-break:keep-all]");
    expect(panelSource).toContain("tabular-nums");
  });
});
