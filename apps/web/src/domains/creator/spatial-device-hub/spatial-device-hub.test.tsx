// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { StudioSpatialDeviceHubPanel } from "./StudioSpatialDeviceHubPanel";
import {
  DEFAULT_SPATIAL_HUD_PANELS,
  VR_SCOUTING_SCENES,
  applySpatialAudioToWebAudioPanner,
  captureVrAngleToCutFrame,
  computeSpatialHudAnchors,
  createInitialVrScoutingRig,
  detectWebXrDeviceSupport,
  sampleRealWorldColorToOklch,
  stepVrScoutingRig,
  type PannerNodeLike,
  type VrScoutingSceneSpec,
} from "./ar-glass-vr-webxr-stage";
import {
  APPLE_CREATIVE_PRESET_ENVS,
  DEFAULT_TRACKPAD_CANVAS_STATE,
  DEFAULT_WATCH_COMPANION_STATE,
  WATCH_BLE_GATT_SPEC,
  calibrateRefreshRateFromFrameDeltas,
  createAppleHandoffSession,
  createWatchBleScanRequestOptions,
  detectAppleCreativeCapabilities,
  evaluateCreatorBreakReminder,
  ingestContinuityPhotoToCanvas,
  mapMacTrackpadGesture,
  parseWatchBleCharacteristicPacket,
  routeWatchCompanionEvent,
} from "./mac-ipad-watch-companion";

const RAW_COLOR_REGEX = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/;
const MEDICAL_PROHIBITED_REGEX = /심박|부정맥|피로\s*진단|의학적|질환|치료|heart\s*rate|arrhythmia|diagnos(is|e)|medical\s*advice/i;
const MODULE_DIR = resolve(process.cwd(), "apps/web/src/domains/creator/spatial-device-hub");

describe("spatial-device-hub: Mac/iPad ProMotion·P3 · 워치 BLE · AR 6DoF HUD · VR 3D 스카우팅", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("Display-P3 광색역과 ProMotion 60/120Hz 프레임 버짓 및 reduced-motion 제한을 정확히 프로파일링한다", () => {
    const macCaps = detectAppleCreativeCapabilities(APPLE_CREATIVE_PRESET_ENVS["macbook-pro-m4"]);
    expect(macCaps.deviceClass).toBe("mac-apple-silicon");
    expect(macCaps.displayP3Supported).toBe(true);
    expect(macCaps.canvasColorSpace).toBe("display-p3");
    expect(macCaps.refreshRateHz).toBe(120);
    expect(macCaps.isProMotion120Hz).toBe(true);
    expect(macCaps.frameBudgetMs).toBe(8.33);
    expect(macCaps.strokeCoalescingMode).toBe("coalesced-120hz");
    expect(macCaps.supportsForceTouchTrackpad).toBe(true);

    const ipadCaps = detectAppleCreativeCapabilities(APPLE_CREATIVE_PRESET_ENVS["ipad-pro-m4"]);
    expect(ipadCaps.deviceClass).toBe("ipad-pro-air");
    expect(ipadCaps.isIpadOs).toBe(true);
    expect(ipadCaps.supportsApplePencilHover).toBe(true);
    expect(ipadCaps.supportsSidecarExtendedCanvas).toBe(true);
    expect(ipadCaps.isProMotion120Hz).toBe(true);

    const stdCaps = detectAppleCreativeCapabilities(APPLE_CREATIVE_PRESET_ENVS["standard-60hz"]);
    expect(stdCaps.displayP3Supported).toBe(false);
    expect(stdCaps.canvasColorSpace).toBe("srgb");
    expect(stdCaps.refreshRateHz).toBe(60);
    expect(stdCaps.frameBudgetMs).toBe(16.67);
    expect(stdCaps.strokeCoalescingMode).toBe("standard-60hz");

    const reducedCaps = detectAppleCreativeCapabilities({
      ...APPLE_CREATIVE_PRESET_ENVS["macbook-pro-m4"],
      matchMedia: (q) => ({ matches: q.includes("color-gamut: p3") || q.includes("prefers-reduced-motion: reduce") }),
    });
    expect(reducedCaps.reducedMotionPreferred).toBe(true);
    expect(reducedCaps.refreshRateHz).toBe(60);
    expect(reducedCaps.strokeCoalescingMode).toBe("power-save-60hz");

    expect(calibrateRefreshRateFromFrameDeltas([8.2, 8.33, 8.4, 8.3, 8.35])).toBe(120);
    expect(calibrateRefreshRateFromFrameDeltas([11.1, 11.2, 11.0])).toBe(90);
    expect(calibrateRefreshRateFromFrameDeltas([16.6, 16.7, 16.8])).toBe(60);
  });

  it("Mac 포스터치 트랙패드 제스처 라우팅과 iPad Sidecar·Continuity Camera 사진 핸드오프를 검증한다", () => {
    const zoomed = mapMacTrackpadGesture({ kind: "pinch-zoom", scaleFactor: 1.5 }, DEFAULT_TRACKPAD_CANVAS_STATE);
    expect(zoomed.action).toBe("canvas-zoom");
    expect(zoomed.nextState.zoomPercent).toBe(150);

    const wheelPinched = mapMacTrackpadGesture({ kind: "wheel-pinch", wheelDeltaY: 45 }, zoomed.nextState);
    expect(wheelPinched.nextState.zoomPercent).toBeLessThan(150);

    const rotated = mapMacTrackpadGesture({ kind: "two-finger-rotate", rotationDeltaDeg: 22, snapRotationStepDeg: 15 }, zoomed.nextState);
    expect(rotated.action).toBe("canvas-rotate");
    expect(rotated.nextState.rotationDeg).toBe(15);

    const softForce = mapMacTrackpadGesture({ kind: "force-click", forcePressure: 0.4 }, rotated.nextState);
    expect(softForce.action).toBe("noop");

    const hardForce = mapMacTrackpadGesture({ kind: "force-click", forcePressure: 0.88 }, rotated.nextState);
    expect(hardForce.action).toBe("force-eyedropper-peek");
    expect(hardForce.nextState.eyedropperPeekActive).toBe(true);
    expect(hardForce.hapticFeedbackHint).toBe("detent-medium");

    const undone = mapMacTrackpadGesture({ kind: "three-finger-swipe-left" }, hardForce.nextState);
    expect(undone.action).toBe("history-undo");
    expect(undone.nextState.undoCount).toBe(5);
    expect(undone.nextState.redoCount).toBe(2);

    const redone = mapMacTrackpadGesture({ kind: "three-finger-swipe-right" }, undone.nextState);
    expect(redone.action).toBe("history-redo");
    expect(redone.nextState.undoCount).toBe(6);

    const focused = mapMacTrackpadGesture({ kind: "three-finger-swipe-up" }, redone.nextState);
    expect(focused.action).toBe("toggle-focus-canvas");
    expect(focused.nextState.focusCanvasMode).toBe(true);

    const macCaps = detectAppleCreativeCapabilities(APPLE_CREATIVE_PRESET_ENVS["macbook-pro-m4"]);
    const sidecarSession = createAppleHandoffSession({ mode: "ipad-sidecar-canvas", canvasWidthPx: 1600, canvasHeightPx: 2400, capabilities: macCaps });
    expect(sidecarSession.sidecarViewportRatioPercent).toBeGreaterThanOrEqual(85);
    expect(sidecarSession.preferredColorSpace).toBe("display-p3");

    const photoSession = createAppleHandoffSession({
      mode: "continuity-camera-photo", canvasWidthPx: 1600, canvasHeightPx: 2400,
      capabilities: macCaps, targetLayerRole: "sketch-trace",
    });
    const okReceipt = ingestContinuityPhotoToCanvas(photoSession, {
      filename: "desk-pose<1>.heic", mimeType: "image/heic", byteSize: 3_500_000, widthPx: 3024, heightPx: 4032,
    });
    expect(okReceipt.accepted).toBe(true);
    expect(okReceipt.colorSpace).toBe("display-p3");
    expect(okReceipt.sanitizedFilename).toBe("desk-pose_1_.heic");
    expect(okReceipt.placedWidthPx).toBeLessThanOrEqual(1600);
    expect(okReceipt.placedHeightPx).toBeLessThanOrEqual(2400);

    const blockedMime = ingestContinuityPhotoToCanvas(photoSession, {
      filename: "bad.svg", mimeType: "image/svg+xml", byteSize: 1200, widthPx: 400, heightPx: 400,
    });
    expect(blockedMime.accepted).toBe(false);
    expect(blockedMime.reasonCode).toBe("unsupported-mime");

    const blockedHuge = ingestContinuityPhotoToCanvas(photoSession, {
      filename: "huge.png", mimeType: "image/png", byteSize: 30 * 1024 * 1024, widthPx: 4000, heightPx: 4000,
    });
    expect(blockedHuge.accepted).toBe(false);
    expect(blockedHuge.reasonCode).toBe("file-too-large");
  });

  it("워치 BLE GATT 패킷 파싱, 크라운·더블탭 라우팅, 비의료 안전 작업 휴식 리마인더를 검증한다", () => {
    const scanOpts = createWatchBleScanRequestOptions();
    expect(scanOpts.filters[0]?.services).toContain(WATCH_BLE_GATT_SPEC.companionServiceUuid);
    expect(scanOpts.optionalServices).toContain(WATCH_BLE_GATT_SPEC.standardBatteryServiceUuid);

    const crownPlusEv = parseWatchBleCharacteristicPacket(new Uint8Array([0x01, 4, 0, 77]), "apple-watch");
    expect(crownPlusEv).toEqual({ kind: "crown-delta", deviceKind: "apple-watch", deltaTicks: 4, batteryPercent: 77 });

    const crownMinusEv = parseWatchBleCharacteristicPacket(new Uint8Array([0x01, 253, 0, 76]), "wear-os");
    expect(crownMinusEv?.deltaTicks).toBe(-3);
    expect(parseWatchBleCharacteristicPacket(new Uint8Array([0x01]))).toBeNull();

    const brushed = routeWatchCompanionEvent(crownPlusEv ?? { kind: "crown-delta", deviceKind: "apple-watch", deltaTicks: 4 }, DEFAULT_WATCH_COMPANION_STATE);
    expect(brushed.action).toBe("adjust-brush-size");
    expect(brushed.nextState.brushSizePx).toBeGreaterThan(DEFAULT_WATCH_COMPANION_STATE.brushSizePx);
    expect(brushed.nextState.connectedBatteryPercent).toBe(77);

    const zoomed = routeWatchCompanionEvent(
      { kind: "crown-delta", deviceKind: "wear-os", deltaTicks: 3 },
      { ...brushed.nextState, crownMode: "canvas-zoom" },
    );
    expect(zoomed.action).toBe("adjust-canvas-zoom");
    expect(zoomed.nextState.canvasZoomPercent).toBe(115);

    const scrubbed = routeWatchCompanionEvent(
      { kind: "crown-delta", deviceKind: "smart-ring", deltaTicks: 5 },
      { ...zoomed.nextState, crownMode: "timeline-scrub" },
    );
    expect(scrubbed.action).toBe("scrub-timeline");
    expect(scrubbed.nextState.timelineFrame).toBe(17);

    const undoTap = routeWatchCompanionEvent({ kind: "double-tap", deviceKind: "apple-watch" }, scrubbed.nextState);
    expect(undoTap.action).toBe("history-undo");
    expect(undoTap.nextState.undoDepth).toBe(DEFAULT_WATCH_COMPANION_STATE.undoDepth - 1);

    const layerTap = routeWatchCompanionEvent(
      { kind: "double-tap", deviceKind: "smart-ring" },
      { ...undoTap.nextState, doubleTapBinding: "toggle-layer-visibility" },
    );
    expect(layerTap.action).toBe("toggle-layer-visibility");
    expect(layerTap.nextState.activeLayerVisible).toBe(false);

    // 비의료·비진단 작업 시간 휴식 리마인더 전 구간 + 의료 문구 0건 검증
    const reports = [20, 43, 52, 92].map((m) => evaluateCreatorBreakReminder({ continuousWorkMinutes: m, intervalMinutes: 50 }));
    expect(reports.map((r) => r.level)).toEqual(["steady", "upcoming", "break-recommended", "extended-break-recommended"]);
    expect(reports[0]?.shouldNotifyWatch).toBe(false);
    expect(reports[2]?.shouldNotifyWatch).toBe(true);
    expect(reports[3]?.suggestedBreakDurationMinutes).toBe(10);

    for (const rep of reports) {
      expect(rep.isNonMedicalGuidance).toBe(true);
      const joined = [rep.titleKo, rep.titleEn, rep.messageKo, rep.messageEn, rep.stretchGuideKo, rep.stretchGuideEn, rep.noteKo, rep.noteEn].join(" ");
      expect(MEDICAL_PROHIBITED_REGEX.test(joined), `Unexpected medical wording: ${joined}`).toBe(false);
    }
  });

  it("AR 스마트 글래스 6DoF 공간 HUD 충돌 0건 배치와 실물 컬러 OKLCH 변환을 검증한다", async () => {
    const arSupport = await detectWebXrDeviceSupport({
      isSessionSupported: async (mode) => mode === "immersive-ar",
    });
    expect(arSupport.webXrAvailable).toBe(true);
    expect(arSupport.immersiveArSupported).toBe(true);
    expect(arSupport.recommendedSessionMode).toBe("immersive-ar");

    const noXr = await detectWebXrDeviceSupport(null);
    expect(noXr.webXrAvailable).toBe(false);
    expect(noXr.recommendedSessionMode).toBe("inline-preview");

    for (const profile of ["xreal-glass", "vision-pro", "webxr-ar-headset"] as const) {
      const layout = computeSpatialHudAnchors({ deviceProfile: profile });
      expect(layout.anchors).toHaveLength(3);
      expect(layout.collisionCount).toBe(0);
      expect(layout.canvasOverlapCount).toBe(0);
      expect(layout.allWithinComfortRange).toBe(true);
      for (const anchor of layout.anchors) {
        expect(anchor.canvasClearanceMeters).toBeGreaterThanOrEqual(0.05);
      }
    }

    // 동일 슬롯에 복수 패널이 몰려도 솔버가 충돌 0건으로 분리한다.
    const crowded = computeSpatialHudAnchors({
      deviceProfile: "vision-pro",
      headPose: { positionMeters: { x: 0.4, y: 1.5, z: 0.2 }, yawDeg: 25, pitchDeg: 0, rollDeg: 0 },
      panels: [
        ...DEFAULT_SPATIAL_HUD_PANELS,
        { id: "hud-brush", role: "brush-shelf", labelKo: "브러시 선반", labelEn: "Brush Shelf", preferredSlot: "left", widthMeters: 0.3, heightMeters: 0.36 },
      ],
    });
    expect(crowded.anchors).toHaveLength(4);
    expect(crowded.collisionCount).toBe(0);
    expect(crowded.canvasOverlapCount).toBe(0);

    // 실물 컬러 스포이드 -> OKLCH 변환 정확성 & Display-P3 광색역 판별
    const white = sampleRealWorldColorToOklch({ r: 255, g: 255, b: 255, sourceColorSpace: "srgb" });
    expect(white.oklch.l).toBeCloseTo(1, 2);
    expect(white.oklch.c).toBeLessThan(0.005);
    expect(white.cssOklch.startsWith("oklch(")).toBe(true);
    expect(RAW_COLOR_REGEX.test(white.cssOklch)).toBe(false);

    const p3Red = sampleRealWorldColorToOklch({ r: 1, g: 0, b: 0, channelRange: "0-1", sourceColorSpace: "display-p3" });
    expect(p3Red.wideGamutOutsideSrgb).toBe(true);
    expect(p3Red.oklch.c).toBeGreaterThan(0.24);
    expect(p3Red.hueFamilyEn).toContain("Red");

    const warmCalibrated = sampleRealWorldColorToOklch({ r: 210, g: 150, b: 110, whiteBalanceKelvin: 3600 });
    expect(warmCalibrated.oklch.h).not.toBe(warmCalibrated.rawOklch.h);
    expect(warmCalibrated.contrastVsLightCanvas).toBeGreaterThan(1);
    expect(warmCalibrated.contrastVsDarkCanvas).toBeGreaterThan(1);
  });

  it("VR 3D 배경 걸어다니기 스카우팅, 경계 클램핑, 2D 컷 스냅 및 WebAudio Spatial Panner 방위각/고도각을 검증한다", () => {
    const startAlley = createInitialVrScoutingRig("alley");
    const lowDramatic = stepVrScoutingRig(startAlley, {
      moveForwardMeters: 2.0, verticalOffsetMeters: -0.9, pitchDeltaDeg: 18, rollDeltaDeg: 10, fovDeltaDeg: -14,
    });
    expect(lowDramatic.positionMeters.z).toBeCloseTo(3.4, 2);
    expect(lowDramatic.positionMeters.y).toBeCloseTo(0.7, 2);
    expect(lowDramatic.shotType).toBe("low-angle-dramatic");
    expect(lowDramatic.verticalFovDeg).toBe(40);

    // 씬 워크 경계 밖 이동은 안전 클램핑된다.
    const outOfBounds = stepVrScoutingRig(lowDramatic, { moveRightMeters: 10, moveForwardMeters: 12 });
    expect(outOfBounds.clampedToBounds).toBe(true);
    expect(outOfBounds.positionMeters.x).toBe(VR_SCOUTING_SCENES.alley.walkBounds.maxX);

    // 정면/우측/좌측/상단 오디오 큐 방위각(azimuth)·고도각(elevation) 기하 검증
    const calibrationScene: VrScoutingSceneSpec = {
      ...VR_SCOUTING_SCENES.classroom,
      audioCues: [
        { cueId: "front", labelKo: "정면", labelEn: "Front", positionMeters: { x: 0, y: 1.5, z: -4 }, refDistanceMeters: 1, maxDistanceMeters: 20, rolloffFactor: 1 },
        { cueId: "right", labelKo: "우측", labelEn: "Right", positionMeters: { x: 4, y: 1.5, z: 0 }, refDistanceMeters: 1, maxDistanceMeters: 20, rolloffFactor: 1 },
        { cueId: "left-up", labelKo: "좌상단", labelEn: "Left Up", positionMeters: { x: -3, y: 4.5, z: 0 }, refDistanceMeters: 1, maxDistanceMeters: 20, rolloffFactor: 1 },
      ],
    };
    const originRig = stepVrScoutingRig(createInitialVrScoutingRig("classroom"), { teleportTarget: { x: 0, y: 1.5, z: 0 } }, calibrationScene);
    const snap = captureVrAngleToCutFrame(originRig, { sceneOverride: calibrationScene, aspectRatio: "9:16", sequenceIndex: 3 });

    expect(snap.snapshotId).toBe("vr-cut-classroom-03");
    expect(snap.camera.equivalent35mmFocalLengthMm).toBeGreaterThan(20);
    expect(snap.spatialAudioSources).toHaveLength(3);
    expect(snap.spatialAudioSources[0]?.azimuthDeg).toBeCloseTo(0, 1);
    expect(snap.spatialAudioSources[1]?.azimuthDeg).toBeCloseTo(90, 1);
    expect(snap.spatialAudioSources[2]?.azimuthDeg).toBeCloseTo(-90, 1);
    expect(snap.spatialAudioSources[2]?.elevationDeg).toBeGreaterThan(40);
    expect(snap.spatialAudioSources[0]?.attenuationGain).toBeLessThanOrEqual(1);

    const mockSetX = vi.fn();
    const mockPanner: PannerNodeLike = {
      positionX: { setValueAtTime: mockSetX },
      positionY: { value: 0 },
      positionZ: { value: 0 },
    };
    const firstConfig = snap.spatialAudioSources[1]?.webAudioPannerConfig;
    expect(firstConfig?.panningModel).toBe("HRTF");
    if (firstConfig) applySpatialAudioToWebAudioPanner(mockPanner, firstConfig, 1.25);
    expect(mockPanner.panningModel).toBe("HRTF");
    expect(mockSetX).toHaveBeenCalledWith(4, 1.25);
  });

  it("StudioSpatialDeviceHubPanel은 모든 props 없이 3개 탭·인터랙션·KO/EN 전환이 정상 동작한다", () => {
    const onTrackpad = vi.fn();
    const onPhoto = vi.fn();
    const onWatch = vi.fn();
    const onSwatch = vi.fn();
    const onVrCut = vi.fn();

    render(
      <StudioSpatialDeviceHubPanel
        onTrackpadGesture={onTrackpad}
        onContinuityPhotoPlaced={onPhoto}
        onWatchEventRouted={onWatch}
        onRealWorldSwatchSampled={onSwatch}
        onVrCutCaptured={onVrCut}
      />,
    );

    // 탭 1: Mac/iPad ProMotion · P3 · 트랙패드
    expect(screen.getByRole("tab", { name: "Mac/iPad ProMotion · P3 · 트랙패드" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("apple-color-gamut").textContent).toBe("display-p3");
    expect(screen.getByTestId("apple-frame-budget").textContent).toContain("8.33 ms");
    fireEvent.click(screen.getByRole("button", { name: "표준 60Hz · sRGB" }));
    expect(screen.getByTestId("apple-frame-budget").textContent).toContain("16.67 ms");
    fireEvent.click(screen.getByRole("button", { name: "핀치 확대 +20%" }));
    expect(onTrackpad).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("trackpad-readout").textContent).toContain("120%");
    fireEvent.click(screen.getByRole("button", { name: "원클릭 사진→캔버스 배치" }));
    expect(onPhoto).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("handoff-status").textContent).toContain("studio-desk-sketch.heic");

    // 탭 2: 워치 크라운/제스처 리모컨
    fireEvent.click(screen.getByRole("tab", { name: "워치 크라운/제스처 리모컨" }));
    fireEvent.click(screen.getByRole("button", { name: "크라운 +3틱" }));
    expect(onWatch).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("watch-brush-zoom").textContent).toContain("30px");
    fireEvent.click(screen.getByRole("button", { name: "연속 90분" }));
    expect(screen.getByTestId("break-level-badge").textContent).toContain("10분 자리 일어나기 휴식 시간");

    // 탭 3: AR 글래스 공간 HUD · VR 3D 스카우팅
    fireEvent.click(screen.getByRole("tab", { name: "AR 글래스 공간 HUD · VR 3D 스카우팅" }));
    expect(screen.getByTestId("ar-hud-collision-badge").textContent).toContain("충돌 0 · 캔버스 침범 0");
    fireEvent.click(screen.getByRole("button", { name: "오후 햇살 테라코타" }));
    expect(onSwatch).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("ar-oklch-swatch").textContent).toContain("oklch(");
    fireEvent.click(screen.getByRole("button", { name: "방과 후 교실" }));
    fireEvent.click(screen.getByRole("button", { name: "로우앵글 · 더치틸트" }));
    fireEvent.click(screen.getByRole("button", { name: "2D 콘티 컷 카메라 스냅 + 공간 음향 산출" }));
    expect(onVrCut).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("vr-cut-snapshot-card").textContent).toContain("HRTF");

    // 기본 props 생략 + EN 전환 검증
    cleanup();
    useI18n.setState({ lang: "en" });
    render(<StudioSpatialDeviceHubPanel />);
    expect(screen.getByRole("tab", { name: "Mac/iPad ProMotion · P3 · Trackpad" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Watch Crown / Gesture Remote" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "AR Spatial HUD · VR 3D Scouting" })).toBeTruthy();
  });

  it("Calm Atelier 토큰 위생·배럴 금지·원시색상/localStorage/transition-all 0건·파일 줄 수 상한을 모두 준수한다", () => {
    expect(existsSync(resolve(MODULE_DIR, "index.ts"))).toBe(false);
    expect(existsSync(resolve(MODULE_DIR, "index.tsx"))).toBe(false);

    const budgets: readonly { readonly file: string; readonly maxLines: number; readonly isTest?: boolean }[] = [
      { file: "mac-ipad-watch-companion.ts", maxLines: 680 },
      { file: "ar-glass-vr-webxr-stage.ts", maxLines: 680 },
      { file: "StudioSpatialDeviceHubPanel.tsx", maxLines: 460 },
      { file: "spatial-device-hub.test.tsx", maxLines: 750, isTest: true },
    ];

    for (const entry of budgets) {
      const source = readFileSync(resolve(MODULE_DIR, entry.file), "utf8");
      const lineCount = source.split("\n").length;
      expect(lineCount, `${entry.file} lines ${lineCount} <= ${entry.maxLines}`).toBeLessThanOrEqual(entry.maxLines);
      expect(RAW_COLOR_REGEX.test(source), `${entry.file} must not contain raw hex/rgb/hsl`).toBe(false);
      if (!entry.isTest) {
        expect(source.includes("localStorage"), `${entry.file} must not use localStorage`).toBe(false);
        expect(source.includes("transition-all"), `${entry.file} must not use transition-all`).toBe(false);
        expect(MEDICAL_PROHIBITED_REGEX.test(source), `${entry.file} must not contain medical/diagnostic wording`).toBe(false);
      }
    }

    const panelSource = readFileSync(resolve(MODULE_DIR, "StudioSpatialDeviceHubPanel.tsx"), "utf8");
    expect(panelSource).toContain("[word-break:keep-all]");
    expect(panelSource).toContain("tabular-nums");
  });
});
