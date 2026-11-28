/**
 * Wave 67: 스튜디오 데스크 LAN P2P 이종 GPU/NPU 메쉬 오프로더 및 비의료 창작 리듬 인체공학 페이서.
 *
 * 1. 로컬 서브넷 LAN P2P 메쉬 오프로더:
 *    - 태블릿(iPad/Android)과 같은 작업실 네트워크의 Mac Studio / RTX PC 간 RTT(<= 4ms),
 *      VRAM 여유량, 배터리, 열 쓰로틀링, 전송 대역폭, 작업 연산량을 종합해 로컬 실행 vs LAN 오프로딩을 결정한다.
 *    - 연결 끊김이나 지연 급증 시 단일 프레임 예산(targetFrameBudgetMs) 안에서 무중단 로컬 폴백을 보장한다.
 *
 * 2. 비의료 창작 리듬 인체공학 페이서:
 *    - 의학적 판단이나 진단 표현을 엄격히 배제하고, 연속 작업 시간·획 속도 저하·취소(Undo) 급증·미세 떨림 등
 *      순수 작업 리듬 통계만으로 친절한 한국어 휴식·스트레칭 안내와 자동 손떨림 보정 강도 추천을 산출한다.
 */

export type DeviceFormFactor =
  | "tablet-ipad"
  | "tablet-android"
  | "desktop-mac-studio"
  | "desktop-rtx-pc"
  | "laptop-workstation";

export type AcceleratorKind =
  | "apple-metal-ane"
  | "nvidia-cuda-tensor"
  | "amd-rocm"
  | "webgpu-integrated"
  | "cpu-wasm";

export type ThermalState = "nominal" | "fair" | "serious" | "critical";

export type MeshWorkloadKind =
  | "brush-stroke-realtime"
  | "ai-inpaint-tile"
  | "vector-trace-batch"
  | "bg3d-npr-render"
  | "color-flatting-sdf"
  | "export-upscale-4k";

export interface LocalDeviceTelemetry {
  readonly deviceId: string;
  readonly formFactor: DeviceFormFactor;
  readonly accelerator: AcceleratorKind;
  readonly availableVramMb: number;
  readonly computeTflops: number;
  readonly npuTops?: number;
  readonly batteryPercent: number;
  readonly isPluggedIn: boolean;
  readonly thermalState: ThermalState;
  /** 단일 프레임 예산(ms, 예: 120Hz = 8.33ms, 60Hz = 16.67ms) */
  readonly targetFrameBudgetMs: number;
}

export interface LanPeerNode {
  readonly peerId: string;
  readonly displayName: string;
  readonly formFactor: DeviceFormFactor;
  readonly accelerator: AcceleratorKind;
  readonly sameSubnetLan: boolean;
  readonly connected: boolean;
  readonly rttMs: number;
  readonly jitterMs: number;
  readonly bandwidthMbps: number;
  readonly availableVramMb: number;
  readonly computeTflops: number;
  readonly npuTops?: number;
  readonly activeQueueDepth: number;
  readonly thermalState: ThermalState;
  readonly batteryPercent?: number;
  readonly isPluggedIn: boolean;
  readonly lastHeartbeatAgeMs: number;
}

export interface MeshWorkloadRequest {
  readonly workloadId: string;
  readonly kind: MeshWorkloadKind;
  readonly payloadBytes: number;
  readonly resultBytes: number;
  readonly estimatedGflops: number;
  readonly requiredVramMb: number;
  readonly deadlineMs?: number;
  readonly latencySensitive: boolean;
}

export interface LanPeerSelectionOptions {
  /** 허용 최대 LAN RTT(ms, 기본값 4.0ms) */
  readonly maxLanRttMs?: number;
  /** 허용 최대 하트비트 경과 시간(ms, 기본값 1500ms) */
  readonly maxHeartbeatAgeMs?: number;
  /** 오프로딩을 선택하기 위한 최소 속도 향상 배율 (기본값 1.25) */
  readonly minOffloadSpeedupRatio?: number;
  /** 로컬 태블릿 저배터리 판단 임계치(%, 기본값 20) */
  readonly lowBatteryThresholdPercent?: number;
  /** 배터리 보호를 위해 무선 대용량 오프로딩을 중단할 초저배터리 하한(%, 기본값 10) */
  readonly criticalLocalBatteryPercent?: number;
  /** 미충전 피어가 오프로딩을 수락할 최소 배터리(%, 기본값 30) */
  readonly minPeerBatteryPercent?: number;
}

export type PeerRejectionReason =
  | "outside-local-lan"
  | "peer-disconnected"
  | "heartbeat-stale"
  | "rtt-exceeded"
  | "vram-insufficient"
  | "thermal-critical"
  | "peer-low-battery";

export interface EvaluatedLanPeerCandidate {
  readonly peerId: string;
  readonly displayName: string;
  readonly eligible: boolean;
  readonly rejectionReasons: readonly PeerRejectionReason[];
  readonly rttMs: number;
  readonly transferMs: number;
  readonly queueWaitMs: number;
  readonly computeMs: number;
  readonly estimatedTotalMs: number;
  readonly effectiveTflops: number;
}

export interface LanPeerSelectionResult {
  readonly selectedPeer: EvaluatedLanPeerCandidate | null;
  readonly candidates: readonly EvaluatedLanPeerCandidate[];
  readonly eligibleCount: number;
}

export type MeshExecutionDecision = "offload-lan-peer" | "execute-local";

export type MeshDecisionReason =
  | "lan-peer-faster"
  | "local-vram-insufficient"
  | "local-thermal-relief"
  | "local-battery-relief"
  | "no-eligible-lan-peer"
  | "local-faster-than-lan"
  | "local-critical-battery-radio-guard"
  | "tiny-interactive-local-fastpath";

export interface OneFrameFallbackContract {
  readonly guaranteedWithinOneFrame: boolean;
  readonly targetFrameBudgetMs: number;
  readonly watchdogSwitchBudgetMs: number;
  readonly degradedLocalTileScale: number;
  readonly actionOnDisconnect: "immediate-local-resume" | "local-proxy-resume";
  readonly triggerConditions: readonly string[];
}

export interface LanP2pMeshOffloadPlan {
  readonly workloadId: string;
  readonly decision: MeshExecutionDecision;
  readonly reason: MeshDecisionReason;
  readonly targetPeerId: string | null;
  readonly targetDisplayName: string;
  readonly localEstimatedMs: number;
  readonly selectedPeerEstimatedMs: number | null;
  readonly estimatedSpeedupRatio: number;
  readonly fallbackContract: OneFrameFallbackContract;
  readonly peerSelection: LanPeerSelectionResult;
  readonly statusMessageKo: string;
}

export interface PeerDisconnectFailoverResult {
  readonly workloadId: string;
  readonly failedPeerId: string | null;
  readonly switchedToLocal: boolean;
  readonly totalFailoverMs: number;
  readonly targetFrameBudgetMs: number;
  readonly withinSingleFrameBudget: boolean;
  readonly frameDropCount: number;
  readonly activeTileScale: number;
  readonly noticeKo: string;
}

export type CreativePacingLevel =
  | "flow"
  | "gentle-nudge"
  | "rest-recommended"
  | "pause-suggested";

export type PacingSignalKind =
  | "long-continuous-session"
  | "velocity-drop"
  | "undo-spike"
  | "elevated-jitter";

export interface CreativePacingTelemetry {
  readonly continuousDrawingMinutes: number;
  readonly baselineStrokeVelocityPxPerSec: number;
  readonly recentStrokeVelocityPxPerSec: number;
  readonly baselineUndoPerMinute: number;
  readonly recentUndoPerMinute: number;
  /** 고주파 손떨림·경로 흔들림 비율 [0..1] */
  readonly strokeJitterRatio: number;
  /** 현재 브러시 손떨림 보정 강도 [0..1] */
  readonly currentStabilizerStrength: number;
  readonly minutesSinceLastBreak: number;
}

export interface ErgonomicPacingOptions {
  /** 가벼운 휴식 안내 시작 연속 시간(분, 기본값 45) */
  readonly gentleReminderMinutes?: number;
  /** 적극적 휴식 권고 시작 연속 시간(분, 기본값 75) */
  readonly breakRecommendedMinutes?: number;
  /** 기준 대비 획 속도 저하 감지 비율 (기본값 0.30 = 30% 이상 감소) */
  readonly velocityDropWarnRatio?: number;
  /** 기준 대비 Undo 빈도 급증 배수 (기본값 2.2배) */
  readonly undoSpikeMultiplier?: number;
  /** 자동 손떨림 보정 추천 상한 [0..1] (기본값 0.85) */
  readonly maxRecommendedStabilizer?: number;
}

export interface CreativeErgonomicPacingResult {
  readonly pacingLevel: CreativePacingLevel;
  /** 0~100 작업 리듬 부하 지수 (비의료 작업 지표) */
  readonly workRhythmLoadIndex: number;
  readonly isMedicalAdvice: false;
  readonly nonMedicalNoticeKo: string;
  readonly detectedSignals: readonly PacingSignalKind[];
  readonly headlineKo: string;
  readonly guidanceKo: string;
  readonly suggestedBreakMinutes: number;
  readonly suggestedStretchActivityKo: string | null;
  readonly recommendedStabilizerStrength: number;
  readonly stabilizerDelta: number;
  readonly shouldAutoBoostStabilizer: boolean;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function thermalComputeFactor(state: ThermalState): number {
  switch (state) {
    case "nominal":
      return 1.0;
    case "fair":
      return 0.88;
    case "serious":
      return 0.62;
    case "critical":
      return 0.32;
  }
}

function isNpuAcceleratedWorkload(kind: MeshWorkloadKind): boolean {
  return kind === "ai-inpaint-tile" || kind === "color-flatting-sdf" || kind === "export-upscale-4k";
}

function estimateLocalComputeMs(
  local: LocalDeviceTelemetry,
  workload: MeshWorkloadRequest,
  lowBatteryThreshold: number,
): number {
  const thermalFactor = thermalComputeFactor(local.thermalState);
  const batteryFactor =
    !local.isPluggedIn && local.batteryPercent <= lowBatteryThreshold ? 0.78 : 1.0;
  const npuBonus = isNpuAcceleratedWorkload(workload.kind) ? (local.npuTops ?? 0) * 0.35 : 0;
  const effectiveTflops = Math.max(
    0.05,
    (local.computeTflops + npuBonus) * thermalFactor * batteryFactor,
  );
  return workload.estimatedGflops / effectiveTflops;
}

/**
 * 현재 작업에 가장 적합한 로컬 서브넷 LAN P2P GPU/NPU 피어를 선별하고 모든 후보의 지연 비용을 산출한다.
 */
export function selectBestLanPeerForWorkload(
  local: LocalDeviceTelemetry,
  peers: readonly LanPeerNode[],
  workload: MeshWorkloadRequest,
  options: LanPeerSelectionOptions = {},
): LanPeerSelectionResult {
  const maxLanRttMs = options.maxLanRttMs ?? 4.0;
  const maxHeartbeatAgeMs = options.maxHeartbeatAgeMs ?? 1500;
  const minPeerBatteryPercent = options.minPeerBatteryPercent ?? 30;
  const candidates: EvaluatedLanPeerCandidate[] = [];

  for (let i = 0; i < peers.length; i += 1) {
    const peer = peers[i];
    if (peer.peerId === local.deviceId) continue;

    const rejectionReasons: PeerRejectionReason[] = [];
    if (!peer.sameSubnetLan) rejectionReasons.push("outside-local-lan");
    if (!peer.connected) rejectionReasons.push("peer-disconnected");
    if (peer.lastHeartbeatAgeMs > maxHeartbeatAgeMs) rejectionReasons.push("heartbeat-stale");
    if (peer.rttMs > maxLanRttMs) rejectionReasons.push("rtt-exceeded");
    if (peer.availableVramMb < workload.requiredVramMb) rejectionReasons.push("vram-insufficient");
    if (peer.thermalState === "critical") rejectionReasons.push("thermal-critical");
    if (!peer.isPluggedIn && (peer.batteryPercent ?? 100) < minPeerBatteryPercent) {
      rejectionReasons.push("peer-low-battery");
    }

    const totalTransferBytes = Math.max(0, workload.payloadBytes) + Math.max(0, workload.resultBytes);
    const bandwidthMbps = Math.max(1, peer.bandwidthMbps);
    const transferMs = (totalTransferBytes * 8) / (bandwidthMbps * 1000);
    const queueWaitMs = Math.max(0, peer.activeQueueDepth) * 1.5;

    const npuBonus = isNpuAcceleratedWorkload(workload.kind) ? (peer.npuTops ?? 0) * 0.45 : 0;
    const effectiveTflops = Math.max(
      0.1,
      (peer.computeTflops + npuBonus) * thermalComputeFactor(peer.thermalState),
    );
    const computeMs = Math.max(0, workload.estimatedGflops) / effectiveTflops;
    const estimatedTotalMs =
      Math.max(0, peer.rttMs) + Math.max(0, peer.jitterMs) * 0.5 + transferMs + queueWaitMs + computeMs;

    candidates.push({
      peerId: peer.peerId,
      displayName: peer.displayName,
      eligible: rejectionReasons.length === 0,
      rejectionReasons,
      rttMs: peer.rttMs,
      transferMs,
      queueWaitMs,
      computeMs,
      estimatedTotalMs,
      effectiveTflops,
    });
  }

  candidates.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if (Math.abs(a.estimatedTotalMs - b.estimatedTotalMs) > 0.05) {
      return a.estimatedTotalMs - b.estimatedTotalMs;
    }
    return a.rttMs - b.rttMs;
  });

  const eligibleCount = candidates.filter((c) => c.eligible).length;
  const selectedPeer = eligibleCount > 0 ? candidates[0] : null;

  return {
    selectedPeer,
    candidates,
    eligibleCount,
  };
}

function buildFallbackContract(
  local: LocalDeviceTelemetry,
  workload: MeshWorkloadRequest,
  peerRttMs: number | null,
): OneFrameFallbackContract {
  const frameBudget = Math.max(4, local.targetFrameBudgetMs);
  const baseWatchdog = peerRttMs !== null ? peerRttMs * 1.35 + 0.8 : 0.5;
  const watchdogSwitchBudgetMs = Math.round(Math.min(baseWatchdog, frameBudget * 0.45) * 100) / 100;
  const localCanFitFull = local.availableVramMb >= workload.requiredVramMb;
  const degradedLocalTileScale = localCanFitFull
    ? 1.0
    : local.availableVramMb >= workload.requiredVramMb * 0.5
      ? 0.75
      : 0.5;

  return {
    guaranteedWithinOneFrame: watchdogSwitchBudgetMs < frameBudget,
    targetFrameBudgetMs: frameBudget,
    watchdogSwitchBudgetMs,
    degradedLocalTileScale,
    actionOnDisconnect: localCanFitFull ? "immediate-local-resume" : "local-proxy-resume",
    triggerConditions: [
      "peer-disconnect",
      "rtt-spike-over-limit",
      "heartbeat-timeout",
      "peer-vram-oom",
    ],
  };
}

/**
 * 로컬 기기 상태와 스튜디오 LAN P2P 피어 목록을 분석해 최적 실행 경로와 1프레임 로컬 폴백 계약을 수립한다.
 */
export function planLanP2pMeshOffload(
  local: LocalDeviceTelemetry,
  peers: readonly LanPeerNode[],
  workload: MeshWorkloadRequest,
  options: LanPeerSelectionOptions = {},
): LanP2pMeshOffloadPlan {
  const minOffloadSpeedupRatio = options.minOffloadSpeedupRatio ?? 1.25;
  const lowBatteryThreshold = options.lowBatteryThresholdPercent ?? 20;
  const criticalLocalBattery = options.criticalLocalBatteryPercent ?? 10;

  const localEstimatedMs = estimateLocalComputeMs(local, workload, lowBatteryThreshold);
  const peerSelection = selectBestLanPeerForWorkload(local, peers, workload, options);
  const bestPeer = peerSelection.selectedPeer;
  const localVramDeficit = local.availableVramMb < workload.requiredVramMb;
  const localThermalPressure = local.thermalState === "serious" || local.thermalState === "critical";
  const localLowBattery = !local.isPluggedIn && local.batteryPercent <= lowBatteryThreshold;
  const localCriticalBattery = !local.isPluggedIn && local.batteryPercent <= criticalLocalBattery;

  const fallbackContract = buildFallbackContract(local, workload, bestPeer?.rttMs ?? null);

  if (!bestPeer) {
    return {
      workloadId: workload.workloadId,
      decision: "execute-local",
      reason: "no-eligible-lan-peer",
      targetPeerId: null,
      targetDisplayName: local.deviceId,
      localEstimatedMs,
      selectedPeerEstimatedMs: null,
      estimatedSpeedupRatio: 1,
      fallbackContract,
      peerSelection,
      statusMessageKo: "조건(RTT 4ms 이하·VRAM·전원)에 맞는 로컬 LAN 피어가 없어 기기에서 바로 실행합니다.",
    };
  }

  const speedupRatio = localEstimatedMs / Math.max(0.05, bestPeer.estimatedTotalMs);

  // 초저배터리 상태의 태블릿에서 로컬 VRAM 여유가 있으면 대역폭 송출 대신 즉시 로컬 안전 실행으로 폴백
  if (localCriticalBattery && !localVramDeficit) {
    return {
      workloadId: workload.workloadId,
      decision: "execute-local",
      reason: "local-critical-battery-radio-guard",
      targetPeerId: null,
      targetDisplayName: local.deviceId,
      localEstimatedMs,
      selectedPeerEstimatedMs: bestPeer.estimatedTotalMs,
      estimatedSpeedupRatio: speedupRatio,
      fallbackContract,
      peerSelection,
      statusMessageKo: "배터리 잔량이 매우 낮아 무선 전송 끊김을 막기 위해 로컬에서 안전하게 실행합니다.",
    };
  }

  // 초경량 실시간 입력(로컬 2ms 이하 & 피어보다 빠름)은 네트워크 왕복 없이 로컬 직행
  if (
    workload.latencySensitive &&
    !localVramDeficit &&
    !localThermalPressure &&
    localEstimatedMs <= 2.0 &&
    localEstimatedMs <= bestPeer.estimatedTotalMs
  ) {
    return {
      workloadId: workload.workloadId,
      decision: "execute-local",
      reason: "tiny-interactive-local-fastpath",
      targetPeerId: null,
      targetDisplayName: local.deviceId,
      localEstimatedMs,
      selectedPeerEstimatedMs: bestPeer.estimatedTotalMs,
      estimatedSpeedupRatio: speedupRatio,
      fallbackContract,
      peerSelection,
      statusMessageKo: "즉각 반응이 필요한 가벼운 작업이라 네트워크 왕복 없이 로컬에서 처리합니다.",
    };
  }

  if (localVramDeficit) {
    return {
      workloadId: workload.workloadId,
      decision: "offload-lan-peer",
      reason: "local-vram-insufficient",
      targetPeerId: bestPeer.peerId,
      targetDisplayName: bestPeer.displayName,
      localEstimatedMs,
      selectedPeerEstimatedMs: bestPeer.estimatedTotalMs,
      estimatedSpeedupRatio: speedupRatio,
      fallbackContract,
      peerSelection,
      statusMessageKo: `로컬 VRAM이 부족해 같은 LAN의 ${bestPeer.displayName}(${bestPeer.rttMs.toFixed(1)}ms)으로 작업을 넘깁니다.`,
    };
  }

  const thermalBudgetMs = workload.latencySensitive
    ? localEstimatedMs * 1.15
    : Math.max(localEstimatedMs * 1.5, local.targetFrameBudgetMs);
  if (localThermalPressure && bestPeer.estimatedTotalMs <= thermalBudgetMs) {
    return {
      workloadId: workload.workloadId,
      decision: "offload-lan-peer",
      reason: "local-thermal-relief",
      targetPeerId: bestPeer.peerId,
      targetDisplayName: bestPeer.displayName,
      localEstimatedMs,
      selectedPeerEstimatedMs: bestPeer.estimatedTotalMs,
      estimatedSpeedupRatio: speedupRatio,
      fallbackContract,
      peerSelection,
      statusMessageKo: `기기 발열을 줄이기 위해 로컬 LAN의 ${bestPeer.displayName}으로 연산을 분산합니다.`,
    };
  }

  if (localLowBattery && bestPeer.estimatedTotalMs <= localEstimatedMs) {
    return {
      workloadId: workload.workloadId,
      decision: "offload-lan-peer",
      reason: "local-battery-relief",
      targetPeerId: bestPeer.peerId,
      targetDisplayName: bestPeer.displayName,
      localEstimatedMs,
      selectedPeerEstimatedMs: bestPeer.estimatedTotalMs,
      estimatedSpeedupRatio: speedupRatio,
      fallbackContract,
      peerSelection,
      statusMessageKo: `배터리 소모를 아끼기 위해 전원이 연결된 ${bestPeer.displayName}으로 무거운 연산을 오프로드합니다.`,
    };
  }

  if (speedupRatio >= minOffloadSpeedupRatio) {
    return {
      workloadId: workload.workloadId,
      decision: "offload-lan-peer",
      reason: "lan-peer-faster",
      targetPeerId: bestPeer.peerId,
      targetDisplayName: bestPeer.displayName,
      localEstimatedMs,
      selectedPeerEstimatedMs: bestPeer.estimatedTotalMs,
      estimatedSpeedupRatio: speedupRatio,
      fallbackContract,
      peerSelection,
      statusMessageKo: `로컬 LAN의 ${bestPeer.displayName}(${bestPeer.rttMs.toFixed(1)}ms)이 ${speedupRatio.toFixed(1)}배 빨라 자동으로 오프로드합니다.`,
    };
  }

  return {
    workloadId: workload.workloadId,
    decision: "execute-local",
    reason: "local-faster-than-lan",
    targetPeerId: null,
    targetDisplayName: local.deviceId,
    localEstimatedMs,
    selectedPeerEstimatedMs: bestPeer.estimatedTotalMs,
    estimatedSpeedupRatio: speedupRatio,
    fallbackContract,
    peerSelection,
    statusMessageKo: "전송 시간을 포함하면 로컬 실행이 더 빨라 기기에서 바로 처리합니다.",
  };
}

/**
 * 오프로딩 중 LAN 피어 연결이 끊겼을 때 1프레임 내 로컬 폴백 전환 결과를 계산한다.
 */
export function handlePeerDisconnectFailover(
  activePlan: LanP2pMeshOffloadPlan,
  disconnectDetectionMs: number,
  localResumeSetupMs = 0.6,
): PeerDisconnectFailoverResult {
  const detection = clamp(disconnectDetectionMs, 0, activePlan.fallbackContract.watchdogSwitchBudgetMs);
  const setup = clamp(localResumeSetupMs, 0.1, 2.0);
  const totalFailoverMs = Math.round((detection + setup) * 100) / 100;
  const frameBudget = activePlan.fallbackContract.targetFrameBudgetMs;
  const withinSingleFrameBudget = totalFailoverMs <= frameBudget;
  const frameDropCount = withinSingleFrameBudget
    ? 0
    : Math.ceil((totalFailoverMs - frameBudget) / frameBudget);

  return {
    workloadId: activePlan.workloadId,
    failedPeerId: activePlan.targetPeerId,
    switchedToLocal: true,
    totalFailoverMs,
    targetFrameBudgetMs: frameBudget,
    withinSingleFrameBudget,
    frameDropCount,
    activeTileScale: activePlan.fallbackContract.degradedLocalTileScale,
    noticeKo: withinSingleFrameBudget
      ? `LAN 피어 연결이 끊겨 ${totalFailoverMs.toFixed(1)}ms 만에 로컬 실행으로 끊김 없이 전환했습니다.`
      : `LAN 피어 연결이 끊겨 로컬 실행으로 전환했습니다(${totalFailoverMs.toFixed(1)}ms 소요).`,
  };
}

/**
 * 작업 텔레메트리만으로 휴식·스트레칭 안내와 자동 손떨림 보정 강도를 추천하는 비의료 창작 리듬 페이서.
 */
export function evaluateCreativeErgonomicPacing(
  telemetry: CreativePacingTelemetry,
  options: ErgonomicPacingOptions = {},
): CreativeErgonomicPacingResult {
  const gentleMinutes = options.gentleReminderMinutes ?? 45;
  const breakMinutes = options.breakRecommendedMinutes ?? 75;
  const velocityDropWarnRatio = options.velocityDropWarnRatio ?? 0.3;
  const undoSpikeMultiplier = options.undoSpikeMultiplier ?? 2.2;
  const maxRecommendedStabilizer = clamp(options.maxRecommendedStabilizer ?? 0.85, 0.1, 0.95);

  const continuousMin = Math.max(0, telemetry.continuousDrawingMinutes);
  const sinceBreakMin = Math.max(continuousMin, telemetry.minutesSinceLastBreak);
  const baselineVel = Math.max(1, telemetry.baselineStrokeVelocityPxPerSec);
  const recentVel = Math.max(0, telemetry.recentStrokeVelocityPxPerSec);
  const velocityDropRatio = clamp((baselineVel - recentVel) / baselineVel, 0, 1);

  const baselineUndo = Math.max(0.5, telemetry.baselineUndoPerMinute);
  const recentUndo = Math.max(0, telemetry.recentUndoPerMinute);
  const undoRatio = recentUndo / baselineUndo;
  const jitter = clamp(telemetry.strokeJitterRatio, 0, 1);
  const currentStab = clamp(telemetry.currentStabilizerStrength, 0, 1);

  const detectedSignals: PacingSignalKind[] = [];
  if (sinceBreakMin >= gentleMinutes) detectedSignals.push("long-continuous-session");
  if (velocityDropRatio >= velocityDropWarnRatio) detectedSignals.push("velocity-drop");
  if (recentUndo >= 4 && undoRatio >= undoSpikeMultiplier) detectedSignals.push("undo-spike");
  if (jitter >= 0.42) detectedSignals.push("elevated-jitter");

  // 0~100 순수 작업 리듬 부하 점수 산출
  const durationScore = clamp((sinceBreakMin / Math.max(1, breakMinutes * 1.4)) * 40, 0, 40);
  const velocityScore = clamp((velocityDropRatio / 0.65) * 22, 0, 22);
  const undoScore = recentUndo >= 3 ? clamp(((undoRatio - 1) / 3) * 22, 0, 22) : 0;
  const jitterScore = clamp((jitter / 0.85) * 16, 0, 16);
  const workRhythmLoadIndex = Math.round(clamp(durationScore + velocityScore + undoScore + jitterScore, 0, 100));

  let pacingLevel: CreativePacingLevel;
  let suggestedBreakMinutes: number;
  let headlineKo: string;
  let guidanceKo: string;
  let suggestedStretchActivityKo: string | null;

  if (workRhythmLoadIndex >= 72 || (sinceBreakMin >= breakMinutes + 25 && detectedSignals.length >= 2)) {
    pacingLevel = "pause-suggested";
    suggestedBreakMinutes = 10;
    headlineKo = "잠시 펜을 내려놓고 10분 쉬어가면 선이 훨씬 가벼워져요";
    guidanceKo =
      "연속 작업 시간이 길어지고 취소 횟수와 속도 변화가 함께 커졌어요. 물 한 잔 마시고 어깨와 손을 푼 뒤 이어 그려보세요.";
    suggestedStretchActivityKo = "어깨 크게 3번 돌리기, 손목 가볍게 털기, 창밖 먼 곳 30초 바라보기";
  } else if (
    workRhythmLoadIndex >= 48 ||
    sinceBreakMin >= breakMinutes ||
    (detectedSignals.includes("undo-spike") && detectedSignals.length >= 2)
  ) {
    pacingLevel = "rest-recommended";
    suggestedBreakMinutes = 5;
    headlineKo = detectedSignals.includes("undo-spike")
      ? "취소가 잦아졌어요. 5분만 쉬고 이어가면 선이 깔끔해져요"
      : "집중해서 오래 그리셨어요. 5분 정도 쉬어갈 타이밍이에요";
    guidanceKo =
      "작업 속도와 리듬이 조금 느려졌어요. 잠깐 화면에서 눈을 떼고 손가락을 가볍게 풀어준 뒤 돌아오면 디테일 정리가 수월해집니다.";
    suggestedStretchActivityKo = "손가락 깍지 끼고 10초 기지개 켜기, 손목 천천히 5회 돌리기";
  } else if (workRhythmLoadIndex >= 26 || detectedSignals.length >= 1) {
    pacingLevel = "gentle-nudge";
    suggestedBreakMinutes = 3;
    headlineKo = "잠깐 손을 털고 눈을 쉬어갈 타이밍이에요";
    guidanceKo =
      "현재 작업 흐름을 유지하면서 2~3분만 가볍게 스트레칭해 두면 다음 컷 선화 집중력이 오래 유지됩니다.";
    suggestedStretchActivityKo = "먼 곳 20초 바라보기, 손바닥 폈다 쥐기 5회";
  } else {
    pacingLevel = "flow";
    suggestedBreakMinutes = 0;
    headlineKo = "지금 작업 리듬이 안정적이에요";
    guidanceKo = "획 속도와 취소 빈도가 평소 페이스를 잘 유지하고 있습니다. 편하게 작업을 이어가세요.";
    suggestedStretchActivityKo = null;
  }

  let boost = 0;
  if (jitter > 0.25) boost += (jitter - 0.25) * 0.45;
  if (detectedSignals.includes("undo-spike")) boost += 0.12;
  if (detectedSignals.includes("velocity-drop")) boost += 0.08;
  if (workRhythmLoadIndex >= 50) boost += 0.06;

  const rawRecommended = clamp(currentStab + boost, currentStab, maxRecommendedStabilizer);
  const recommendedStabilizerStrength = Math.round(rawRecommended * 100) / 100;
  const stabilizerDelta = Math.round((recommendedStabilizerStrength - currentStab) * 100) / 100;
  const shouldAutoBoostStabilizer = stabilizerDelta >= 0.05;

  return {
    pacingLevel,
    workRhythmLoadIndex,
    isMedicalAdvice: false,
    nonMedicalNoticeKo: "작업 리듬 기록을 바탕으로 안내하는 일반 휴식 가이드입니다.",
    detectedSignals,
    headlineKo,
    guidanceKo,
    suggestedBreakMinutes,
    suggestedStretchActivityKo,
    recommendedStabilizerStrength,
    stabilizerDelta,
    shouldAutoBoostStabilizer,
  };
}
