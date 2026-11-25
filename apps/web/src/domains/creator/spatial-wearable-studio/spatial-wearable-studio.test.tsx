// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AR_HUD_PRESETS,
  COMFORTABLE_GAZE_MAX_DEG,
  COMFORTABLE_GAZE_MIN_DEG,
  DEFAULT_SPATIAL_RIG_INPUT,
  DEFAULT_WEARABLE_CONTROL_STATE,
  MULTI_DEVICE_PRESETS,
  NON_MEDICAL_BREAK_DISCLAIMER_KO,
  SPATIAL_DEVICE_CATALOG,
  SPATIAL_DEVICE_IDS,
  SPATIAL_WEARABLE_SCHEMA_ID,
  StudioSpatialWearablePanel,
  WEARABLE_DIAL_MODES,
  buildArGlassesHudProfile,
  computeMultiDeviceTopology,
  computeSpatialCanvasRig,
  evaluateSessionBreakReminder,
  exportSpatialWearableSessionJson,
  getArHudPreset,
  getMultiDevicePreset,
  getSpatialDeviceSpec,
  isSpatialDeviceId,
  parseSpatialWearableSessionJson,
  resolveWearableDialAction,
  type SpatialWearableSessionSnapshot,
} from "./index";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function makeSnapshot(overrides?: Partial<SpatialWearableSessionSnapshot>): SpatialWearableSessionSnapshot {
  return {
    activeDeviceIds: overrides?.activeDeviceIds ?? ["mac-studio-primary", "tablet-pen-deck", "smart-watch-crown", "phone-reader-mirror"],
    syncTransportMode: overrides?.syncTransportMode ?? "lan-webrtc",
    availableLinkBandwidthMbps: overrides?.availableLinkBandwidthMbps ?? 120,
    spatialRigInput: overrides?.spatialRigInput ?? DEFAULT_SPATIAL_RIG_INPUT,
    wearableMode: overrides?.wearableMode ?? "brush-size",
    wearableState: overrides?.wearableState ?? DEFAULT_WEARABLE_CONTROL_STATE,
    elapsedWorkMinutes: overrides?.elapsedWorkMinutes ?? 32,
    breakIntervalMinutes: overrides?.breakIntervalMinutes ?? 50,
    hapticNudgeEnabled: overrides?.hapticNudgeEnabled ?? true,
    arHudOptions: overrides?.arHudOptions ?? {
      presetId: "perspective-grid-minimal",
      perspectiveGridType: "2-point",
      gridOpacityPct: 18,
      showDeadlineTimer: true,
      deadlineRemainingMinutes: 45,
      peripheralCorner: "top-right",
    },
  };
}

describe("1. 6대 디바이스 노드 카탈로그 · 공개 브라우저 기능 매트릭스", () => {
  it("6대 디바이스 ID와 역할·지연·대역폭 기본 스펙이 정확히 등록되어 있다", () => {
    expect(SPATIAL_DEVICE_IDS).toEqual([
      "vision-pro-webxr",
      "ar-smart-glasses",
      "smart-watch-crown",
      "mac-studio-primary",
      "tablet-pen-deck",
      "phone-reader-mirror",
    ]);
    expect(SPATIAL_DEVICE_CATALOG).toHaveLength(6);
    for (const dev of SPATIAL_DEVICE_CATALOG) {
      expect(dev.minBandwidthMbps).toBeGreaterThan(0);
      expect(dev.targetBandwidthMbps).toBeGreaterThanOrEqual(dev.minBandwidthMbps);
      expect(dev.baseFrameLatencyMs).toBeGreaterThan(0);
    }
  });

  it("공개 웹 표준 지원 범위(WebXR·WebRTC·WebBluetooth·PointerEvents)가 플랫폼 현실과 일치한다", () => {
    const vp = getSpatialDeviceSpec("vision-pro-webxr");
    expect(vp.browserCapabilities.webXr).toBe("supported");
    expect(vp.browserCapabilities.webRtc).toBe("supported");
    expect(vp.browserCapabilities.webBluetooth).toBe("unsupported");
    expect(vp.headMounted).toBe(true);

    const watch = getSpatialDeviceSpec("smart-watch-crown");
    expect(watch.browserCapabilities.webBluetooth).toBe("supported");
    expect(watch.browserCapabilities.webXr).toBe("unsupported");

    const tablet = getSpatialDeviceSpec("tablet-pen-deck");
    expect(tablet.penInputCapable).toBe(true);
    expect(tablet.browserCapabilities.pointerEvents).toBe("supported");
  });

  it("4종 멀티 디바이스 프리셋이 유효한 기기 조합과 권장 전송 모드를 정의한다", () => {
    expect(MULTI_DEVICE_PRESETS).toHaveLength(4);
    for (const preset of MULTI_DEVICE_PRESETS) {
      expect(preset.deviceIds.length).toBeGreaterThanOrEqual(1);
      expect(preset.deviceIds.every(isSpatialDeviceId)).toBe(true);
    }
    expect(getMultiDevicePreset("vision-pro-solo").deviceIds).toEqual(["vision-pro-webxr"]);
    expect(getMultiDevicePreset("tablet-ar-glasses").deviceIds).toEqual(["tablet-pen-deck", "ar-smart-glasses"]);
  });

  it("isSpatialDeviceId 및 lookup 헬퍼가 정상 키와 미지원 키를 안전하게 처리한다", () => {
    expect(isSpatialDeviceId("vision-pro-webxr")).toBe(true);
    expect(isSpatialDeviceId("unknown-vr")).toBe(false);
    expect(isSpatialDeviceId(42)).toBe(false);
    expect(getArHudPreset("deadline-focus-only").defaultGridType).toBe("none");
  });

  it("모든 시뮬레이션 출력 구조체가 dataSourceKind='estimate' 출처를 명시한다", () => {
    const topo = computeMultiDeviceTopology({ activeDeviceIds: ["mac-studio-primary", "tablet-pen-deck"] });
    const rig = computeSpatialCanvasRig({});
    const brk = evaluateSessionBreakReminder({ elapsedWorkMinutes: 30 });
    const hud = buildArGlassesHudProfile({});
    expect(topo.dataSourceKind).toBe("estimate");
    expect(topo.latencyBudget.dataSourceKind).toBe("estimate");
    expect(rig.dataSourceKind).toBe("estimate");
    expect(rig.ergonomics.dataSourceKind).toBe("estimate");
    expect(brk.dataSourceKind).toBe("estimate");
    expect(hud.dataSourceKind).toBe("estimate");
  });
});

describe("2. 멀티 디바이스 페어링 토폴로지 솔버 (computeMultiDeviceTopology)", () => {
  it("맥+아이패드+워치+폰 4종 표준 조합에서 맥을 허브·메인 캔버스로 배정하고 충돌 0건을 반환한다", () => {
    const topo = computeMultiDeviceTopology({
      activeDeviceIds: ["mac-studio-primary", "tablet-pen-deck", "smart-watch-crown", "phone-reader-mirror"],
      availableLinkBandwidthMbps: 120,
      syncTransportMode: "lan-webrtc",
    });
    expect(topo.hubDeviceId).toBe("mac-studio-primary");
    expect(topo.primaryCanvasDeviceId).toBe("mac-studio-primary");
    expect(topo.links).toHaveLength(3);
    expect(topo.criticalConflictCount).toBe(0);
    expect(topo.warningConflictCount).toBe(0);
    expect(topo.latencyBudget.grade).toBe("optimal");
    expect(topo.totalAllocatedBandwidthMbps).toBe(topo.totalTargetBandwidthMbps);
    expect(topo.healthScore).toBe(100);
  });

  it("비전 프로와 AR 스마트 글래스를 동시에 켜면 두부 디스플레이 충돌(optical-headset-overlap) critical을 감지한다", () => {
    const topo = computeMultiDeviceTopology({
      activeDeviceIds: ["vision-pro-webxr", "ar-smart-glasses"],
    });
    const conflict = topo.conflicts.find((c) => c.code === "optical-headset-overlap");
    expect(conflict?.severity).toBe("critical");
    expect(topo.criticalConflictCount).toBeGreaterThanOrEqual(1);
    expect(topo.healthScore).toBeLessThan(75);
  });

  it("맥과 비전 프로를 동시 활성화하면 메인 캔버스 권한 이중 배치 경고를 반환하고 맥을 허브로 고정한다", () => {
    const topo = computeMultiDeviceTopology({
      activeDeviceIds: ["mac-studio-primary", "vision-pro-webxr"],
    });
    expect(topo.hubDeviceId).toBe("mac-studio-primary");
    expect(topo.conflicts.some((c) => c.code === "primary-canvas-authority-conflict" && c.severity === "warn")).toBe(true);
  });

  it("빈 조합은 empty-topology, 보조 기기만 켠 조합은 no-primary-canvas critical을 감지한다", () => {
    const empty = computeMultiDeviceTopology({ activeDeviceIds: [] });
    expect(empty.hubDeviceId).toBeNull();
    expect(empty.conflicts.some((c) => c.code === "empty-topology" && c.severity === "critical")).toBe(true);

    const companionOnly = computeMultiDeviceTopology({
      activeDeviceIds: ["smart-watch-crown", "phone-reader-mirror"],
    });
    expect(companionOnly.primaryCanvasDeviceId).toBeNull();
    expect(companionOnly.conflicts.some((c) => c.code === "no-primary-canvas" && c.severity === "critical")).toBe(true);
  });

  it("비전 프로 단독 및 비전 프로+워치 조합에서 공개 API 제약(BLE 브리지·펜 권장) 안내를 생성한다", () => {
    const solo = computeMultiDeviceTopology({ activeDeviceIds: ["vision-pro-webxr"] });
    expect(solo.conflicts.some((c) => c.code === "pen-precision-advisory" && c.severity === "info")).toBe(true);

    const vpWatch = computeMultiDeviceTopology({ activeDeviceIds: ["vision-pro-webxr", "smart-watch-crown"] });
    expect(vpWatch.conflicts.some((c) => c.code === "bluetooth-safari-bridge-needed" && c.severity === "info")).toBe(true);
  });

  it("가용 대역폭이 목표 미만이면 우선순위 배분(warn), 최소 미만이면 underMinimum(critical)로 안전하게 제한한다", () => {
    const devices = ["mac-studio-primary", "tablet-pen-deck", "phone-reader-mirror"] as const;
    const tight = computeMultiDeviceTopology({ activeDeviceIds: devices, availableLinkBandwidthMbps: 30 });
    expect(tight.totalAllocatedBandwidthMbps).toBeLessThanOrEqual(30);
    expect(tight.conflicts.some((c) => c.code === "bandwidth-oversubscribed" && c.severity === "warn")).toBe(true);

    const starved = computeMultiDeviceTopology({ activeDeviceIds: devices, availableLinkBandwidthMbps: 10 });
    expect(starved.totalAllocatedBandwidthMbps).toBeLessThanOrEqual(10);
    expect(starved.bandwidthAllocations.every((a) => a.underMinimum)).toBe(true);
    expect(starved.conflicts.some((c) => c.code === "bandwidth-oversubscribed" && c.severity === "critical")).toBe(true);
  });

  it("전송 모드별 지연 예산이 USB 하이브리드 < LAN WebRTC < 클라우드 릴레이 순으로 단조 증가한다", () => {
    const devs = ["mac-studio-primary", "tablet-pen-deck", "phone-reader-mirror"] as const;
    const usb = computeMultiDeviceTopology({ activeDeviceIds: devs, syncTransportMode: "usb-tether-hybrid" });
    const lan = computeMultiDeviceTopology({ activeDeviceIds: devs, syncTransportMode: "lan-webrtc" });
    const relay = computeMultiDeviceTopology({ activeDeviceIds: devs, syncTransportMode: "cloud-relay" });
    expect(usb.latencyBudget.totalEndToEndMs).toBeLessThan(lan.latencyBudget.totalEndToEndMs);
    expect(lan.latencyBudget.totalEndToEndMs).toBeLessThan(relay.latencyBudget.totalEndToEndMs);
    expect(relay.conflicts.some((c) => c.code === "latency-budget-exceeded")).toBe(true);
  });
});

describe("3. 공간 6DoF 캔버스 · 레퍼런스 월 배치 솔버 (computeSpatialCanvasRig)", () => {
  it("메인 컷(전방 중앙)·좌측 레퍼런스(-X)·우측 3D 포즈 스테이지(+X, depthM) 3D 좌표를 일관되게 배치한다", () => {
    const rig = computeSpatialCanvasRig(DEFAULT_SPATIAL_RIG_INPUT);
    expect(rig.userEyeOriginM).toEqual({ x: 0, y: 1.22, z: 0 });
    expect(rig.mainCutPanel.positionM.x).toBe(0);
    expect(rig.mainCutPanel.positionM.z).toBeLessThan(0);
    expect(rig.leftReferenceBoard.positionM.x).toBeLessThan(0);
    expect(rig.leftReferenceBoard.yawFromCenterDeg).toBeLessThan(0);
    expect(rig.leftReferenceBoard.rotationDeg.yaw).toBeGreaterThan(0);
    expect(rig.rightPoseStage.positionM.x).toBeGreaterThan(0);
    expect(rig.rightPoseStage.yawFromCenterDeg).toBeGreaterThan(0);
    expect(rig.rightPoseStage.rotationDeg.yaw).toBeLessThan(0);
    expect(rig.rightPoseStage.depthM).toBeGreaterThan(0);
  });

  it("메인 컷 패널 곡률이 0°이면 평면(curvatureRadiusM=null, sagittaM=0), 증가할수록 만곡 깊이(sagittaM)가 커진다", () => {
    const flat = computeSpatialCanvasRig({ panelCurvatureDeg: 0 });
    expect(flat.mainCutPanel.curvatureRadiusM).toBeNull();
    expect(flat.mainCutPanel.sagittaM).toBe(0);

    const mild = computeSpatialCanvasRig({ panelCurvatureDeg: 20 });
    const deep = computeSpatialCanvasRig({ panelCurvatureDeg: 44 });
    expect(mild.mainCutPanel.curvatureRadiusM).not.toBeNull();
    expect(deep.mainCutPanel.sagittaM).toBeGreaterThan(mild.mainCutPanel.sagittaM);
  });

  it("시선 하향각이 0°~-15° 범위 안에 있으면 목/어깨 인체공학 상태가 comfortable로 판정된다", () => {
    expect(COMFORTABLE_GAZE_MIN_DEG).toBe(-15);
    expect(COMFORTABLE_GAZE_MAX_DEG).toBe(0);
    for (const pitch of [0, -8, -15]) {
      const rig = computeSpatialCanvasRig({ gazePitchDeg: pitch });
      expect(rig.ergonomics.isWithinComfortableGazeBand).toBe(true);
      expect(rig.ergonomics.neckFlexionStatus).toBe("comfortable");
    }
  });

  it("시선 각도가 위쪽(+10°)이거나 과도한 하향(-26°)이면 strain-risk, 경계(-18°)면 caution으로 분류된다", () => {
    const upward = computeSpatialCanvasRig({ gazePitchDeg: 10 });
    expect(upward.ergonomics.isWithinComfortableGazeBand).toBe(false);
    expect(upward.ergonomics.neckFlexionStatus).toBe("strain-risk");
    expect(upward.ergonomics.recommendationsKo.length).toBeGreaterThan(0);

    const steepDown = computeSpatialCanvasRig({ gazePitchDeg: -26 });
    expect(steepDown.ergonomics.neckFlexionStatus).toBe("strain-risk");

    const mildOut = computeSpatialCanvasRig({ gazePitchDeg: -18 });
    expect(mildOut.ergonomics.neckFlexionStatus).toBe("caution");
    expect(mildOut.ergonomics.ergonomicsScore).toBeGreaterThan(upward.ergonomics.ergonomicsScore);
  });

  it("시청 거리가 너무 가깝거나(<0.85m) 너무 멀면(>2.2m) 초점/어깨 거리 경고가 반영된다", () => {
    const tooClose = computeSpatialCanvasRig({ viewingDistanceM: 0.72 });
    expect(tooClose.ergonomics.vergenceComfortStatus).toBe("too-close");
    expect(tooClose.ergonomics.shoulderReachStatus).toBe("too-close");

    const tooFar = computeSpatialCanvasRig({ viewingDistanceM: 2.5 });
    expect(tooFar.ergonomics.vergenceComfortStatus).toBe("far-detail-caution");
    expect(tooFar.ergonomics.shoulderReachStatus).toBe("extended-reach");
  });

  it("비정상 NaN·극단 입력도 안전하게 클램핑되어 유한한 3D 좌표를 보장한다", () => {
    const rig = computeSpatialCanvasRig({
      eyeHeightM: Number.NaN,
      viewingDistanceM: 99,
      horizontalFovDeg: -10,
      gazePitchDeg: 90,
      panelCurvatureDeg: 180,
    });
    expect(Number.isFinite(rig.mainCutPanel.positionM.y)).toBe(true);
    expect(rig.input.viewingDistanceM).toBe(2.8);
    expect(rig.input.horizontalFovDeg).toBe(45);
    expect(rig.input.gazePitchDeg).toBe(20);
    expect(rig.input.panelCurvatureDeg).toBe(60);
  });
});

describe("4. 워치 크라운·링 제스처 · 비의료 휴식 알림 · AR HUD · JSON 직렬화", () => {
  it("브러시 크기 모드에서 정밀/표준 회전, 경계 클램핑(boundary-thud), 크라운 클릭 기본값 복원이 동작한다", () => {
    const inc = resolveWearableDialAction({ mode: "brush-size", gesture: "crown-rotate", detentDelta: 3, state: DEFAULT_WEARABLE_CONTROL_STATE });
    expect(inc.commandId).toBe("studio.brush.resize");
    expect(inc.nextValue).toBe(24);
    expect(inc.hapticPattern).toBe("micro-tick");

    const fine = resolveWearableDialAction({ mode: "brush-size", gesture: "ring-pinch-twist", detentDelta: 1, precisionModifier: true, state: inc.nextState });
    expect(fine.nextValue).toBe(25);

    const hitMin = resolveWearableDialAction({ mode: "brush-size", gesture: "crown-rotate", detentDelta: -50, state: fine.nextState });
    expect(hitMin.nextValue).toBe(1);
    expect(hitMin.clamped).toBe(true);
    expect(hitMin.hapticPattern).toBe("boundary-thud");

    const reset = resolveWearableDialAction({ mode: "brush-size", gesture: "crown-press", state: hitMin.nextState });
    expect(reset.commandId).toBe("studio.brush.reset-size");
    expect(reset.nextValue).toBe(18);
  });

  it("확대/축소와 타임라인 스크럽 모드가 회전 스텝·경계·클릭 리셋을 정확히 처리한다", () => {
    const zoomIn = resolveWearableDialAction({ mode: "canvas-zoom", gesture: "crown-rotate", detentDelta: 2, state: DEFAULT_WEARABLE_CONTROL_STATE });
    expect(zoomIn.nextValue).toBe(130);
    expect(zoomIn.commandId).toBe("studio.viewport.zoom");

    const zoomReset = resolveWearableDialAction({ mode: "canvas-zoom", gesture: "crown-press", state: zoomIn.nextState });
    expect(zoomReset.nextValue).toBe(100);

    const scrub = resolveWearableDialAction({ mode: "timeline-scrub", gesture: "ring-pinch-twist", detentDelta: 5, state: DEFAULT_WEARABLE_CONTROL_STATE });
    expect(scrub.nextValue).toBe(32);
    expect(scrub.commandId).toBe("studio.timeline.scrub");

    const jumpZero = resolveWearableDialAction({ mode: "timeline-scrub", gesture: "crown-press", state: scrub.nextState });
    expect(jumpZero.nextValue).toBe(0);
  });

  it("실행취소/다시실행 모드와 더블 탭 4모드 순환이 결정론적으로 동작한다", () => {
    const undo = resolveWearableDialAction({ mode: "undo-redo", gesture: "crown-rotate", detentDelta: -2, state: DEFAULT_WEARABLE_CONTROL_STATE });
    expect(undo.commandId).toBe("studio.history.undo");
    expect(undo.nextValue).toBe(22);

    const pressUndo = resolveWearableDialAction({ mode: "undo-redo", gesture: "crown-press", state: undo.nextState });
    expect(pressUndo.commandId).toBe("studio.history.undo");
    expect(pressUndo.nextValue).toBe(21);

    const redo = resolveWearableDialAction({ mode: "undo-redo", gesture: "ring-pinch-twist", detentDelta: 3, state: pressUndo.nextState });
    expect(redo.commandId).toBe("studio.history.redo");
    expect(redo.nextValue).toBe(24);

    let mode = WEARABLE_DIAL_MODES[0];
    const visited: string[] = [mode];
    for (let i = 0; i < 4; i += 1) {
      const cycled = resolveWearableDialAction({ mode, gesture: "double-tap", state: DEFAULT_WEARABLE_CONTROL_STATE });
      expect(cycled.commandId).toBe("studio.wearable.mode-cycle");
      expect(cycled.hapticPattern).toBe("double-confirm");
      mode = cycled.nextMode;
      visited.push(mode);
    }
    expect(visited).toEqual(["brush-size", "canvas-zoom", "timeline-scrub", "undo-redo", "brush-size"]);
  });

  it("휴식 리마인더는 비의료(isMedicalAdvice=false) 고지를 강제하고 작업 경과·HMD 착용에 따라 알림 단계를 바꾼다", () => {
    const early = evaluateSessionBreakReminder({ elapsedWorkMinutes: 15, breakIntervalMinutes: 50 });
    expect(early.isMedicalAdvice).toBe(false);
    expect(early.disclaimerKo).toBe(NON_MEDICAL_BREAK_DISCLAIMER_KO);
    expect(early.status).toBe("working");
    expect(early.watchHapticCue).toBe("none");

    const micro = evaluateSessionBreakReminder({ elapsedWorkMinutes: 30, breakIntervalMinutes: 50 });
    expect(micro.status).toBe("micro-break-suggested");
    expect(micro.watchHapticCue).toBe("gentle-pulse");

    const due = evaluateSessionBreakReminder({ elapsedWorkMinutes: 50, breakIntervalMinutes: 50 });
    expect(due.status).toBe("break-due");
    expect(due.watchHapticCue).toBe("two-pulse-reminder");

    const muted = evaluateSessionBreakReminder({ elapsedWorkMinutes: 80, breakIntervalMinutes: 50, hapticNudgeEnabled: false });
    expect(muted.status).toBe("extended-session");
    expect(muted.watchHapticCue).toBe("none");

    const hmd = evaluateSessionBreakReminder({ elapsedWorkMinutes: 40, breakIntervalMinutes: 60, wearingHmd: true });
    expect(hmd.effectiveBreakIntervalMinutes).toBe(40);
    expect(hmd.status).toBe("break-due");
  });

  it("AR 스마트 글래스 HUD 프로필이 최소 간섭 시야 점유율과 중앙 안전 시야 여부를 판정한다", () => {
    expect(AR_HUD_PRESETS).toHaveLength(3);
    const deadlineOnly = buildArGlassesHudProfile({ presetId: "deadline-focus-only" });
    const gridMinimal = buildArGlassesHudProfile({ presetId: "perspective-grid-minimal" });
    const poseWhisper = buildArGlassesHudProfile({ presetId: "pose-silhouette-whisper" });

    expect(deadlineOnly.estimatedFovOcclusionPct).toBeLessThan(gridMinimal.estimatedFovOcclusionPct);
    expect(gridMinimal.estimatedFovOcclusionPct).toBeLessThan(poseWhisper.estimatedFovOcclusionPct);
    expect(deadlineOnly.interferenceGrade).toBe("minimal");
    expect(gridMinimal.centerSafeZoneClear).toBe(true);

    const heavy = buildArGlassesHudProfile({
      presetId: "pose-silhouette-whisper",
      perspectiveGridType: "3-point",
      gridOpacityPct: 45,
      showDeadlineTimer: true,
    });
    expect(heavy.centerSafeZoneClear).toBe(false);
  });

  it("exportSpatialWearableSessionJson과 parseSpatialWearableSessionJson이 설정을 손실 없이 왕복 직렬화한다", () => {
    const snap = makeSnapshot({
      activeDeviceIds: ["vision-pro-webxr", "tablet-pen-deck", "smart-watch-crown"],
      syncTransportMode: "usb-tether-hybrid",
      availableLinkBandwidthMbps: 180,
      wearableMode: "timeline-scrub",
      elapsedWorkMinutes: 42,
    });
    const json = exportSpatialWearableSessionJson(snap);
    expect(json).toContain(SPATIAL_WEARABLE_SCHEMA_ID);
    expect(json).toContain('"dataSourceKind": "estimate"');
    expect(json).toContain('"isMedicalAdvice": false');

    const restored = parseSpatialWearableSessionJson(json);
    expect(restored.ok).toBe(true);
    if (restored.ok) {
      expect(restored.config.activeDeviceIds).toEqual(snap.activeDeviceIds);
      expect(restored.config.syncTransportMode).toBe("usb-tether-hybrid");
      expect(restored.config.availableLinkBandwidthMbps).toBe(180);
      expect(restored.config.wearableMode).toBe("timeline-scrub");
      expect(restored.config.elapsedWorkMinutes).toBe(42);
    }
  });

  it("parseSpatialWearableSessionJson은 깨진 JSON·오류 스키마·미지원 기기 ID를 fail-closed로 거부한다", () => {
    const badJson = parseSpatialWearableSessionJson("{broken");
    expect(badJson.ok).toBe(false);
    if (!badJson.ok) expect(badJson.errorCode).toBe("invalid-json");

    const badSchema = parseSpatialWearableSessionJson(JSON.stringify({ schema: "other.v0", config: {} }));
    expect(badSchema.ok).toBe(false);
    if (!badSchema.ok) expect(badSchema.errorCode).toBe("invalid-schema");

    const badDev = parseSpatialWearableSessionJson(
      JSON.stringify({ schema: SPATIAL_WEARABLE_SCHEMA_ID, config: { activeDeviceIds: ["fake-device"], syncTransportMode: "lan-webrtc" } }),
    );
    expect(badDev.ok).toBe(false);
    if (!badDev.ok) expect(badDev.errorCode).toBe("invalid-fields");

    const badTransport = parseSpatialWearableSessionJson(
      JSON.stringify({ schema: SPATIAL_WEARABLE_SCHEMA_ID, config: { activeDeviceIds: ["vision-pro-webxr"], syncTransportMode: "bluetooth-mesh" } }),
    );
    expect(badTransport.ok).toBe(false);
    if (!badTransport.ok) expect(badTransport.errorCode).toBe("invalid-fields");
  });
});

describe("5. StudioSpatialWearablePanel UI · 상호작용 · 접근성", () => {
  it("Props 없이 단독 렌더링되며 시뮬레이션/추정 배지·비의료 알림·공간 6DoF 평면도 SVG를 표시한다", () => {
    render(<StudioSpatialWearablePanel />);
    expect(screen.getByTestId("studio-spatial-wearable-panel")).toBeTruthy();
    const badge = screen.getByTestId("spatial-estimate-badge");
    expect(badge.getAttribute("data-source-kind")).toBe("estimate");
    expect(badge.textContent).toContain("시뮬레이션");
    expect(screen.getByTestId("spatial-non-medical-notice").textContent).toContain("비의료");
    expect(screen.getByTestId("spatial-rig-topdown-svg")).toBeTruthy();
    expect(screen.getByTestId("spatial-svg-main-panel")).toBeTruthy();
    expect(screen.getByTestId("spatial-svg-left-ref")).toBeTruthy();
    expect(screen.getByTestId("spatial-svg-right-pose")).toBeTruthy();
  });

  it("프리셋 전환과 개별 기기 토글로 비전 프로+스마트 글래스 동시 선택 시 충돌 경고를 즉시 띄운다", () => {
    render(<StudioSpatialWearablePanel />);
    fireEvent.click(screen.getByTestId("spatial-preset-vision-pro-solo"));
    expect(screen.getByTestId("spatial-kpi-topology").textContent).toContain("100 / 100");

    fireEvent.click(screen.getByTestId("spatial-toggle-ar-smart-glasses"));
    const conflicts = screen.getByTestId("spatial-conflicts-list");
    expect(conflicts.querySelector('[data-conflict-code="optical-headset-overlap"]')).not.toBeNull();
  });

  it("공간 6DoF 시선 하향각과 곡률 슬라이더를 변경하면 SVG 속성과 인체공학 진단이 실시간 갱신된다", () => {
    render(<StudioSpatialWearablePanel />);
    const svg = screen.getByTestId("spatial-rig-topdown-svg");
    expect(svg.getAttribute("data-neck-status")).toBe("comfortable");

    fireEvent.change(screen.getByTestId("spatial-pitch-slider"), { target: { value: "10" } });
    expect(svg.getAttribute("data-gaze-pitch-deg")).toBe("10");
    expect(svg.getAttribute("data-neck-status")).toBe("strain-risk");

    fireEvent.change(screen.getByTestId("spatial-curvature-slider"), { target: { value: "40" } });
    expect(svg.getAttribute("data-curvature-deg")).toBe("40");
  });

  it("워치 크라운·링 시뮬레이터 버튼과 작업 시간 슬라이더가 값·모드·휴식 알림을 정확히 갱신한다", () => {
    render(<StudioSpatialWearablePanel />);
    expect(screen.getByTestId("spatial-dial-value").textContent).toBe("18px");

    fireEvent.click(screen.getByTestId("spatial-dial-inc5"));
    expect(screen.getByTestId("spatial-dial-value").textContent).toBe("28px");

    fireEvent.click(screen.getByTestId("spatial-dial-press"));
    expect(screen.getByTestId("spatial-dial-value").textContent).toBe("18px");

    fireEvent.click(screen.getByTestId("spatial-dial-double-tap"));
    expect(screen.getByTestId("spatial-dial-value").textContent).toBe("100%");

    fireEvent.change(screen.getByTestId("spatial-work-minutes-slider"), { target: { value: "60" } });
    expect(screen.getByTestId("spatial-work-minutes-readout").textContent).toContain("60분");
    expect(screen.getByTestId("spatial-break-message").textContent).toContain("5분");
  });

  it("AR HUD 프리셋·JSON 복사·미리보기 접기·초기화 버튼과 콜백이 정상 동작한다", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: write } });
    const onTopologyChange = vi.fn();
    const onRigChange = vi.fn();
    const onExportJson = vi.fn();

    render(
      <StudioSpatialWearablePanel
        onTopologyChange={onTopologyChange}
        onRigChange={onRigChange}
        onExportJson={onExportJson}
      />,
    );
    expect(onTopologyChange).toHaveBeenCalled();
    expect(onRigChange).toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("spatial-ar-preset-deadline-focus-only"));
    expect(screen.getByTestId("spatial-ar-occlusion-badge").textContent).toContain("2.1%");

    fireEvent.click(screen.getByTestId("spatial-copy-json-btn"));
    expect(write).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onExportJson).toHaveBeenCalledTimes(1));
    expect(onExportJson.mock.calls[0]?.[0]).toContain(SPATIAL_WEARABLE_SCHEMA_ID);
    expect(screen.getByTestId("spatial-json-preview").textContent).toContain('"dataSourceKind": "estimate"');

    fireEvent.click(screen.getByTestId("spatial-json-toggle-btn"));
    expect(screen.queryByTestId("spatial-json-preview")).toBeNull();

    fireEvent.click(screen.getByTestId("spatial-reset-btn"));
    expect(screen.getByTestId("spatial-status-banner").textContent).toContain("복원");
  });

  it("영문 로케일(locale='en')과 초기 프리셋 props를 정확히 반영한다", () => {
    render(
      <StudioSpatialWearablePanel
        locale="en"
        initialPresetId="tablet-ar-glasses"
        initialElapsedWorkMinutes={10}
      />,
    );
    expect(screen.getByTestId("spatial-estimate-badge").textContent).toContain("Simulated");
    expect(screen.getByTestId("spatial-non-medical-notice").textContent).toContain("Non-medical");
    expect(screen.getByTestId("spatial-copy-json-btn").textContent).toContain("Copy Config JSON");
    expect(screen.getByTestId("spatial-toggle-ar-smart-glasses").getAttribute("aria-pressed")).toBe("true");
  });
});

describe("6. 코드 위생 자가 검증 (파일 줄수 <= 800 · Calm Atelier 토큰 · 금지 패턴 0건)", () => {
  it("모든 모듈 파일이 800줄 이하이며 원시 색·transition-all·= {}·Storage·private Map store·BigInt·Sparkles가 0건이다", () => {
    const dir = path.resolve(import.meta.dirname);
    const requiredFiles = [
      "spatial-wearable-engine.ts",
      "StudioSpatialWearablePanel.tsx",
      "index.ts",
      "spatial-wearable-studio.test.tsx",
      "spatial-boundaries.test.tsx",
      "spatial-input-contract.ts",
      "use-example-delivery.ts",
    ];
    for (const file of requiredFiles) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect([...allFiles].sort()).toEqual([...requiredFiles].sort());

    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      const lineCount = src.split(/\r?\n/).length;
      expect(lineCount).toBeLessThanOrEqual(800);
      expect(src).not.toMatch(/:\s*any\b/u);
      expect(src).not.toMatch(/\bas\s+any\b/u);

      if (file !== "spatial-wearable-studio.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/\b\d+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
      }

      if (file === "StudioSpatialWearablePanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toContain("Sparkles");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
      }
    }
  });
});
