// @vitest-environment jsdom

import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StudioErgonomicsSettingsSection } from "../ergonomics/StudioErgonomicsSettingsSection";

import {
  DEVICE_FORM_FACTOR_ORDER,
  MULTI_DEVICE_SPRITE_PATHS,
  STYLUS_PRESSURE_PRESETS,
  StudioMultiDeviceEcosystemHub,
  StudioSmartTvModeView,
  StudioSmartwatchCompanionView,
  appendSpatialRibbonPoint,
  classifyDeviceFormFactor,
  computeFoldableHingeAvoidance,
  computeMouseVelocityTaper,
  createArSmartGlassTracingState,
  createMultiDeviceSyncBridge,
  createWebXrDirectorSession,
  createWebcamQuickHudAdapter,
  detectBrowserHardwareAndNextGenCapabilities,
  evaluateBarrelTwist,
  evaluateStylusPressureCurve,
  evaluateStylusTiltShading,
  interpretGamepadSnapshot,
  interpretMidiControlChange,
  interpretTouchscreenGesture,
  interpretTrackpadGesture,
  moveTvSpatialFocusIndex,
  resolveFootPedalEvent,
  resolveHandednessLayout,
  resolvePenSideButtonAction,
  resolveWebHidPresetCommand,
  setWebXrDirectorMode,
  snapRotationWithMagnet,
  updateArTracingState,
  type BroadcastChannelLike,
  type MultiDeviceSyncEnvelope,
} from "./index";

const WEB_PUBLIC_ROOT = resolve(process.cwd(), "apps/web/public");

function createMockBroadcastBus(): (name: string) => BroadcastChannelLike {
  const rooms = new Map<string, Set<(event: { readonly data: unknown }) => void>>();
  return (name: string) => {
    let room = rooms.get(name);
    if (!room) {
      room = new Set();
      rooms.set(name, room);
    }
    const localListeners = new Set<(event: { readonly data: unknown }) => void>();
    return {
      name,
      postMessage(message: unknown) {
        for (const listener of room) {
          if (!localListeners.has(listener)) {
            listener({ data: message });
          }
        }
      },
      addEventListener(_type, listener) {
        localListeners.add(listener);
        room.add(listener);
      },
      removeEventListener(_type, listener) {
        localListeners.delete(listener);
        room.delete(listener);
      },
      close() {
        for (const listener of localListeners) {
          room.delete(listener);
        }
        localListeners.clear();
      },
    };
  };
}

afterEach(() => {
  cleanup();
});

describe("1. 폼팩터 10단계 분류 · 왼손/오른손잡이 반전 · 폴더블 힌지 회피 · BroadcastChannel 브릿지", () => {
  it("10단계 반응형 폼팩터를 모두 결정론적으로 판별한다", () => {
    expect(DEVICE_FORM_FACTOR_ORDER).toHaveLength(10);
    expect(classifyDeviceFormFactor({ width: 224, height: 224, isRoundDisplay: true }).formFactor).toBe("watch-round");
    expect(classifyDeviceFormFactor({ width: 204, height: 252, isRoundDisplay: false }).formFactor).toBe("watch-rect");
    expect(classifyDeviceFormFactor({ width: 320, height: 640, pointerClass: "coarse" }).formFactor).toBe("mobile-xs");
    expect(classifyDeviceFormFactor({ width: 430, height: 932, pointerClass: "coarse" }).formFactor).toBe("mobile-lg");
    expect(classifyDeviceFormFactor({ width: 820, height: 1180, pointerClass: "coarse" }).formFactor).toBe("tablet-portrait");
    expect(classifyDeviceFormFactor({ width: 1120, height: 820, pointerClass: "coarse" }).formFactor).toBe("tablet-landscape");
    expect(classifyDeviceFormFactor({ width: 1440, height: 1080, viewportSegments: 2 }).formFactor).toBe("foldable-dual");
    expect(classifyDeviceFormFactor({ width: 1440, height: 900, pointerClass: "fine" }).formFactor).toBe("desktop");
    expect(classifyDeviceFormFactor({ width: 2560, height: 1080, pointerClass: "fine" }).formFactor).toBe("ultrawide");
    expect(classifyDeviceFormFactor({ width: 1920, height: 1080, tvModeHint: true }).formFactor).toBe("tv-10ft");
  });

  it("왼손/오른손잡이 반전과 폴더블 세로·가로 힌지 회피 영역을 정확히 계산한다", () => {
    const rightLayout = resolveHandednessLayout("desktop", "right");
    const leftLayout = resolveHandednessLayout("desktop", "left");
    expect(rightLayout.toolRailSide).toBe("left");
    expect(rightLayout.watchCrownSide).toBe("right");
    expect(leftLayout.toolRailSide).toBe("right");
    expect(leftLayout.inspectorSide).toBe("left");
    expect(leftLayout.watchCrownSide).toBe("left");
    expect(leftLayout.dialPadSide).toBe("right");

    const bookPlan = computeFoldableHingeAvoidance(
      { width: 1440, height: 1080 },
      { x: 704, y: 0, width: 32, height: 1080 },
      12,
    );
    expect(bookPlan.posture).toBe("folded-book");
    expect(bookPlan.hingeAxis).toBe("vertical");
    expect(bookPlan.primaryCanvasRect.width).toBe(692);
    expect(bookPlan.secondaryToolRect?.x).toBe(748);
    expect(bookPlan.isPointInHingeZone(720, 500)).toBe(true);
    expect(bookPlan.isPointInHingeZone(200, 500)).toBe(false);

    const tabletopPlan = computeFoldableHingeAvoidance(
      { width: 1080, height: 1440 },
      { x: 0, y: 704, width: 1080, height: 32 },
      10,
    );
    expect(tabletopPlan.posture).toBe("folded-tabletop");
    expect(tabletopPlan.hingeAxis).toBe("horizontal");
    expect(tabletopPlan.primaryCanvasRect.height).toBe(694);
    expect(tabletopPlan.isPointInHingeZone(500, 720)).toBe(true);
  });

  it("BroadcastChannel 크로스-디바이스 브릿지로 워치·데스크톱 간 실시간 동기화 및 폴백을 수행한다", () => {
    const factory = createMockBroadcastBus();
    const receivedByDesktop: MultiDeviceSyncEnvelope[] = [];
    const desktopBridge = createMultiDeviceSyncBridge({
      deviceId: "desktop-1",
      formFactor: "desktop",
      channelFactory: factory,
    });
    const watchBridge = createMultiDeviceSyncBridge({
      deviceId: "watch-1",
      formFactor: "watch-round",
      channelFactory: factory,
    });

    expect(desktopBridge.transportMode).toBe("broadcast-channel");
    desktopBridge.subscribe((env) => receivedByDesktop.push(env));

    watchBridge.announceHello("left");
    watchBridge.publish({ kind: "brush.delta", sizePx: 18, opacity: 1, colorTokenId: "coral" });
    watchBridge.publish({ kind: "voice.bubble", text: "지금 바로 출발!", tone: "shout" });

    expect(desktopBridge.getPeers()).toHaveLength(1);
    expect(desktopBridge.getPeers()[0]?.formFactor).toBe("watch-round");
    expect(receivedByDesktop.some((env) => env.payload.kind === "voice.bubble")).toBe(true);

    watchBridge.close();
    expect(desktopBridge.getPeers()).toHaveLength(0);
    desktopBridge.close();

    const fallbackBridge = createMultiDeviceSyncBridge({
      deviceId: "offline-1",
      channelFactory: () => null,
    });
    expect(fallbackBridge.transportMode).toBe("memory-loopback");
    fallbackBridge.publish({ kind: "canvas.undo", reasonKo: "테스트" });
    expect(fallbackBridge.getHistory()).toHaveLength(1);
    fallbackBridge.close();
  });
});

describe("2. 주변기기 입력 오케스트레이터 & 하드웨어·차세대 API 감지기", () => {
  it("필압 커브·배럴 회전·기울기 음영·펜 사이드 버튼 3단 매핑을 계산한다", () => {
    const light = evaluateStylusPressureCurve(0.5, STYLUS_PRESSURE_PRESETS.light);
    const balanced = evaluateStylusPressureCurve(0.5, STYLUS_PRESSURE_PRESETS.balanced);
    const heavy = evaluateStylusPressureCurve(0.5, STYLUS_PRESSURE_PRESETS.heavy);
    expect(light.calibratedPressure).toBeGreaterThan(balanced.calibratedPressure);
    expect(balanced.calibratedPressure).toBeGreaterThan(heavy.calibratedPressure);
    expect(evaluateStylusPressureCurve(0.01, STYLUS_PRESSURE_PRESETS.heavy).calibratedPressure).toBe(0);

    const twist = evaluateBarrelTwist(405, 15);
    expect(twist.normalizedAngleDeg).toBe(45);
    expect(twist.effectiveNibAngleDeg).toBe(60);

    const flatTilt = evaluateStylusTiltShading(0, 0);
    const angledTilt = evaluateStylusTiltShading(55, 20);
    expect(flatTilt.isBroadsideShading).toBe(false);
    expect(angledTilt.isBroadsideShading).toBe(true);
    expect(angledTilt.shadingWidthMultiplier).toBeGreaterThan(1.5);

    expect(resolvePenSideButtonAction("primary-lower", "webtoon-ink").actionId).toBe("eyedropper");
    expect(resolvePenSideButtonAction("secondary-upper", "webtoon-ink").actionId).toBe("radial-menu");
    expect(resolvePenSideButtonAction("tail-double-tap", "webtoon-ink").actionId).toBe("toggle-eraser");
  });

  it("마우스 속도 테이퍼·트랙패드 Force Touch/0° 자석 스냅·아이패드 제스처를 정확히 해석한다", () => {
    const slowMouse = computeMouseVelocityTaper({ speedPxPerSec: 160, strokeProgress: 0.5 });
    const fastMouse = computeMouseVelocityTaper({ speedPxPerSec: 1_800, strokeProgress: 0.92 });
    expect(slowMouse.syntheticPressure).toBeGreaterThan(fastMouse.syntheticPressure);
    expect(slowMouse.magneticSmoothingAlpha).toBeLessThan(fastMouse.magneticSmoothingAlpha);

    expect(snapRotationWithMagnet(357).snappedAngleDeg).toBe(0);
    expect(snapRotationWithMagnet(4).didSnap).toBe(true);
    expect(snapRotationWithMagnet(93).snappedAngleDeg).toBe(90);
    expect(snapRotationWithMagnet(27).didSnap).toBe(false);

    const forceGesture = interpretTrackpadGesture({ pinchScale: 1.4, rotationDeg: 3, forceLevel: 1.0 });
    expect(forceGesture.forceTouchTriggered).toBe(true);
    expect(forceGesture.forceActionId).toBe("quick-eyedropper");
    expect(forceGesture.rotation.snappedAngleDeg).toBe(0);

    expect(interpretTouchscreenGesture({ fingerCount: 2, durationMs: 120, moveDistancePx: 2 }).action).toBe("undo");
    expect(interpretTouchscreenGesture({ fingerCount: 3, durationMs: 140, moveDistancePx: 3 }).action).toBe("redo");
    expect(interpretTouchscreenGesture({ fingerCount: 1, durationMs: 480, moveDistancePx: 4 }).action).toBe("eyedropper");
    expect(
      interpretTouchscreenGesture({ fingerCount: 1, durationMs: 100, moveDistancePx: 2, maxContactDiameterPx: 34 }).action,
    ).toBe("palm-rejected");
  });

  it("WebHID·게임패드·WebMIDI·풋페달·웹캠 옵트인·AR·WebXR·실시간 능력 감지기를 검증한다", () => {
    expect(resolveWebHidPresetCommand("tourbox-neo-elite", "knob.cw")?.actionId).toBe("brush.size+");
    expect(resolveWebHidPresetCommand("loupedeck-ct-live", "wheel.main")?.actionId).toBe("timeline.scrub");

    const gamepadCmd = interpretGamepadSnapshot({ axisX: 0.75, axisY: -0.5, pressedButtons: ["button.l1"] });
    expect(gamepadCmd.brushSizeDeltaPx).toBeGreaterThan(0);
    expect(gamepadCmd.zoomDeltaPercent).toBeGreaterThan(0);
    expect(gamepadCmd.triggeredActions).toContain("history.undo");

    const midi = interpretMidiControlChange(1, 127);
    expect(midi?.mappedValue).toBe(120);
    expect(resolveFootPedalEvent("left", true).actionId).toBe("history.undo");
    expect(resolveFootPedalEvent("right", true, true).actionId).toBe("voice-bubble-toggle");

    const webcam = createWebcamQuickHudAdapter();
    expect(webcam.getState().optInConsented).toBe(false);
    webcam.processSignal({ kind: "expression", expression: "brow-raise" });
    expect(webcam.getState().lastTriggeredActionKo).toContain("대기");
    webcam.setOptInConsent(true);
    webcam.processSignal({ kind: "expression", expression: "brow-raise" });
    expect(webcam.getState().lastTriggeredActionKo).toContain("래디얼 퀵 HUD");

    const ar = updateArTracingState(createArSmartGlassTracingState(), { active: true, overlayOpacity: 0.72, anchorLocked: true });
    expect(ar.overlayOpacity).toBe(0.72);
    expect(ar.anchorLocked).toBe(true);

    const xrStart = setWebXrDirectorMode(createWebXrDirectorSession("director-360"), "spatial-ribbon-sketch", true);
    const xrDrawn = appendSpatialRibbonPoint(xrStart, { x: 0.5, y: 1.2, z: -1.5, widthCm: 3 });
    expect(xrDrawn.ribbonPoints).toHaveLength(1);

    const fullCaps = detectBrowserHardwareAndNextGenCapabilities({
      hasPointerEvent: true,
      maxTouchPoints: 10,
      hasForceTouch: true,
      hasWebHid: true,
      hasWebMidi: true,
      hasGamepad: true,
      hasBroadcastChannel: true,
      hasSpeechRecognition: true,
      hasMediaDevices: true,
      hasWebXr: true,
      hasViewportSegments: true,
      hasVibrate: true,
    });
    expect(fullCaps.fallbackCount).toBe(0);
    expect(fullCaps.readyCount + fullCaps.optInCount).toBe(12);

    const fallbackCaps = detectBrowserHardwareAndNextGenCapabilities({
      hasPointerEvent: false,
      maxTouchPoints: 0,
      hasForceTouch: false,
      hasWebHid: false,
      hasWebMidi: false,
      hasGamepad: false,
      hasBroadcastChannel: false,
      hasSpeechRecognition: false,
      hasMediaDevices: false,
      hasWebXr: false,
      hasViewportSegments: false,
      hasVibrate: false,
    });
    expect(fallbackCaps.fallbackCount).toBe(12);
  });

  it("6종 device-*.webp 컬러 스프라이트 파일이 public 경로에 실제로 존재한다", () => {
    for (const relPath of Object.values(MULTI_DEVICE_SPRITE_PATHS)) {
      const diskPath = resolve(WEB_PUBLIC_ROOT, relPath.replace(/^\/+/u, ""));
      expect(existsSync(diskPath), `누락된 스프라이트 파일: ${diskPath}`).toBe(true);
    }
  });
});

describe("3. 스마트워치 컴패니언 & 스마트 TV 10ft D-Pad 공간 포커스 UI", () => {
  it("StudioSmartwatchCompanionView에서 크라운·콘티 패드·4원색·1탭 Undo·보이스 말풍선이 동작한다", () => {
    const syncEvents: MultiDeviceSyncEnvelope[] = [];
    const bridge = createMultiDeviceSyncBridge({ channelFactory: () => null });
    bridge.subscribe((env) => syncEvents.push(env));

    render(<StudioSmartwatchCompanionView handedness="left" syncBridge={bridge} />);
    expect(screen.getByTestId("smartwatch-physical-frame").getAttribute("data-watch-shape")).toBe("round");

    fireEvent.click(screen.getByRole("button", { name: "사각 워치" }));
    expect(screen.getByTestId("smartwatch-physical-frame").getAttribute("data-watch-shape")).toBe("rect");

    fireEvent.click(screen.getByRole("button", { name: "크라운 올리기" }));
    expect(syncEvents.some((e) => e.payload.kind === "brush.delta")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /크라운: 줌/u }));
    fireEvent.keyDown(screen.getByTestId("smartwatch-crown-dial"), { key: "ArrowUp" });
    expect(syncEvents.some((e) => e.payload.kind === "canvas.zoom")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "골드 하이라이트" }));
    fireEvent.click(screen.getByRole("button", { name: "3초 콘티 1획 찍기" }));
    fireEvent.click(screen.getByTestId("smartwatch-one-tap-undo"));
    expect(syncEvents.some((e) => e.payload.kind === "canvas.undo")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "잠깐, 저기 봐!" }));
    expect(syncEvents.some((e) => e.payload.kind === "voice.bubble")).toBe(true);
    expect(screen.getByText(/말풍선: 잠깐, 저기 봐!/u)).toBeTruthy();

    bridge.close();
  });

  it("StudioSmartTvModeView에서 D-Pad 키보드 공간 포커스(황금·코랄 링)와 모드·페어링 전환이 동작한다", () => {
    expect(moveTvSpatialFocusIndex(0, "ArrowRight", 3, 6)).toBe(1);
    expect(moveTvSpatialFocusIndex(1, "ArrowDown", 3, 6)).toBe(4);
    expect(moveTvSpatialFocusIndex(4, "ArrowLeft", 3, 6)).toBe(3);
    expect(moveTvSpatialFocusIndex(3, "ArrowUp", 3, 6)).toBe(0);

    const bridge = createMultiDeviceSyncBridge({ channelFactory: () => null });
    render(<StudioSmartTvModeView syncBridge={bridge} />);

    const grid = screen.getByTestId("tv-spatial-focus-grid");
    expect(screen.getByTestId("tv-tile-0").getAttribute("data-tv-focused")).toBe("true");
    expect(screen.getByTestId("tv-tile-0").className).toContain("mde-tv-tile-focused");

    fireEvent.keyDown(grid, { key: "ArrowRight" });
    expect(screen.getByTestId("tv-tile-1").getAttribute("data-tv-focused")).toBe("true");
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    expect(screen.getByTestId("tv-tile-4").getAttribute("data-tv-focused")).toBe("true");
    fireEvent.keyDown(grid, { key: "Enter" });
    expect(screen.getByTestId("tv-tile-4").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "라이브 방송 오버레이" }));
    expect(screen.getByTestId("tv-live-broadcast-banner")).toBeTruthy();

    const pairingBtn = screen.getByTestId("tv-wireless-pairing-toggle");
    fireEvent.click(pairingBtn);
    expect(pairingBtn.getAttribute("aria-pressed")).toBe("true");
    bridge.close();
  });
});

describe("4. StudioMultiDeviceEcosystemHub 통합 렌더링 & 인체공학 설정 지연 연결", () => {
  it("6종 스프라이트·왼손 반전·하드웨어 신호등·시필 패드·전 탭 전환과 워치 동기화를 렌더링한다", () => {
    const bridge = createMultiDeviceSyncBridge({ channelFactory: () => null });
    render(<StudioMultiDeviceEcosystemHub syncBridge={bridge} />);

    expect(screen.getByTestId("mde-sprite-card-digitizer")).toBeTruthy();
    expect(screen.getByTestId("mde-sprite-card-dial-pad")).toBeTruthy();
    expect(screen.getByTestId("mde-sprite-card-watch")).toBeTruthy();
    expect(screen.getByTestId("mde-sprite-card-tv")).toBeTruthy();
    expect(screen.getByTestId("mde-sprite-card-ar-glasses")).toBeTruthy();
    expect(screen.getByTestId("mde-sprite-card-vr-headset")).toBeTruthy();
    expect(screen.getByTestId("mde-hardware-traffic-lights")).toBeTruthy();

    fireEvent.click(screen.getByTestId("mde-handedness-left"));
    expect(screen.getByTestId("studio-multidevice-ecosystem-hub").getAttribute("data-mde-handedness")).toBe("left");

    fireEvent.click(screen.getByTestId("mde-run-synthetic-stroke"));
    expect(screen.getByText(/시필 완료/u)).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /WebHID/u }));
    expect(screen.getByTestId("mde-controllers-panel")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /스마트워치/u }));
    expect(screen.getByTestId("studio-smartwatch-companion-view")).toBeTruthy();
    expect(screen.getByTestId("studio-smart-tv-mode-view")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "크라운 올리기" }));
    expect(screen.getByTestId("mde-sync-feed-latest").textContent).toContain("브러시");

    fireEvent.click(screen.getByRole("tab", { name: /WebXR/u }));
    expect(screen.getByTestId("mde-spatial-panel")).toBeTruthy();
    fireEvent.click(screen.getByTestId("webcam-optin-toggle"));
    fireEvent.click(screen.getByTestId("webxr-append-ribbon-point"));
    expect(screen.getByText(/공간 리본 3D 좌표 추가 \(1점\)/u)).toBeTruthy();

    bridge.close();
  });

  it("StudioErgonomicsSettingsSection 안에 기본 접힘 상태로 지연 연결되어 펼칠 때 마운트된다", async () => {
    render(<StudioErgonomicsSettingsSection />);
    const disclosure = screen.getByTestId("studio-multidevice-ecosystem-disclosure") as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(screen.queryByTestId("studio-multidevice-ecosystem-hub")).toBeNull();

    disclosure.open = true;
    fireEvent(disclosure, new Event("toggle"));

    await waitFor(() => {
      expect(screen.getByTestId("studio-multidevice-ecosystem-hub")).toBeTruthy();
    });
  });
});
