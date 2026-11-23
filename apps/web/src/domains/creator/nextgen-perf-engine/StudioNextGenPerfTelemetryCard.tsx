/**
 * 차세대 크롬 성능 엔진 진단 HUD & 8K 메모리 예산 시뮬레이터 카드.
 *
 * - Wasm64 · WebGPU · WebNN · WebCodecs · OPFS · WebRTC P2P · Compute Pressure · 동적 LOD
 *   8대 축을 OKLCH 컬러 신호등과 수치(`tabular-nums`)로 한눈에 진단한다.
 * - 8K 다중 레이어(32/64/128) · 고밀도 3D 메시 · RGBA8/RGBA16F · Wasm64 vs 32비트 페이징 비교를
 *   실시간으로 시뮬레이션하며, WebCodecs 캐스팅 및 벡터 잉크 GPU 리본 메트릭을 함께 표시한다.
 */
import { useMemo, useState, type ReactElement } from "react";

import {
  CANVAS_MEMORY_WORKLOAD_PRESETS,
  compareWasm64VsWasm32Plan,
  formatMemoryMiB,
  planCanvasMemoryStrategy,
  type CanvasMemoryWorkloadPreset,
  type CanvasPixelBitDepth,
  type MemoryHealthTone,
} from "./wasm64-memory-arena-planner";
import {
  computeDynamicLodProfile,
  planWebCodecsMirrorProfile,
  probeNextGenPerfCapabilities,
  tessellateShaderVectorInkRibbon,
  type ComputePressureState,
  type MirrorQualityMode,
  type MirrorTargetDevice,
  type NextGenPerfCapabilitySnapshot,
  type VectorInkBezierSegment,
} from "./webnn-webcodecs-stream-adapter";

import "./nextgen-perf-engine.css";

export const NEXTGEN_PERF_SPRITE_SRC = "/assets/studio/vibrant-sprites/tech-webgpu.webp" as const;

export interface StudioNextGenPerfTelemetryCardProps {
  readonly reduceMotion?: boolean;
  readonly initialCapabilities?: NextGenPerfCapabilitySnapshot;
}

type SignalTone = MemoryHealthTone;

interface CapabilitySignalItem {
  readonly id: string;
  readonly nameKo: string;
  readonly stateKo: string;
  readonly detailKo: string;
  readonly tone: SignalTone;
}

const PRESSURE_SIMULATION_OPTIONS: readonly {
  readonly state: ComputePressureState;
  readonly frameTimeMs: number;
  readonly labelKo: string;
}[] = Object.freeze([
  { state: "nominal", frameTimeMs: 9.2, labelKo: "쾌적 (9.2ms)" },
  { state: "fair", frameTimeMs: 15.8, labelKo: "보통 (15.8ms)" },
  { state: "serious", frameTimeMs: 21.4, labelKo: "부하 (21.4ms)" },
  { state: "critical", frameTimeMs: 29.8, labelKo: "긴급 (29.8ms)" },
]);

const MIRROR_TARGET_OPTIONS: readonly {
  readonly id: MirrorTargetDevice;
  readonly labelKo: string;
}[] = Object.freeze([
  { id: "secondary-monitor", labelKo: "보조 모니터" },
  { id: "ipad-companion", labelKo: "아이패드" },
  { id: "smart-tv-cast", labelKo: "스마트 TV" },
]);

const SAMPLE_VECTOR_INK_SEGMENTS: readonly VectorInkBezierSegment[] = Object.freeze([
  Object.freeze({
    p0: { x: 0, y: 0 },
    p1: { x: 42, y: -28 },
    p2: { x: 118, y: 34 },
    p3: { x: 180, y: 6 },
    pressureStart: 0.35,
    pressureEnd: 0.95,
    baseRadiusPx: 6,
    tiltScale: 1.15,
  }),
  Object.freeze({
    p0: { x: 180, y: 6 },
    p1: { x: 240, y: -18 },
    p2: { x: 310, y: 22 },
    p3: { x: 372, y: -4 },
    pressureStart: 0.95,
    pressureEnd: 0.25,
    baseRadiusPx: 6,
    tiltScale: 1.05,
  }),
]);

function resolveReadinessBadgeKo(tier: NextGenPerfCapabilitySnapshot["readinessTier"]): string {
  if (tier === "nextgen-ready") return "차세대 풀 가속";
  if (tier === "hybrid-accelerated") return "하이브리드 가속";
  return "안전 폴백 모드";
}

function buildCapabilitySignals(
  capabilities: NextGenPerfCapabilitySnapshot,
  lodTierLabelKo: string,
  lodTierIndex: 0 | 1 | 2 | 3,
): readonly CapabilitySignalItem[] {
  const wasm64Tone: SignalTone = capabilities.wasm64.supported
    ? "good"
    : capabilities.wasm64.wasmAvailable
      ? "warn"
      : "bad";
  const webgpuTone: SignalTone = capabilities.webgpuSupported ? "good" : "warn";
  const webnnTone: SignalTone = capabilities.webnn.npuAvailable
    ? "good"
    : capabilities.webnn.supported || capabilities.webnn.gpuFallbackAvailable
      ? "warn"
      : "bad";
  const webcodecsTone: SignalTone = capabilities.webcodecs.supported ? "good" : "warn";
  const opfsTone: SignalTone = capabilities.opfsWebRtc.opfsSupported ? "good" : "warn";
  const webrtcTone: SignalTone = capabilities.opfsWebRtc.webrtcP2pSupported ? "good" : "warn";
  const pressureTone: SignalTone = capabilities.computePressureSupported ? "good" : "warn";
  const lodTone: SignalTone = lodTierIndex <= 1 ? "good" : lodTierIndex === 2 ? "warn" : "bad";

  return [
    {
      id: "wasm64",
      nameKo: "Wasm64 (Memory64)",
      stateKo: capabilities.wasm64.supported ? "64비트 스왑리스" : "32비트 LRU 폴백",
      detailKo: capabilities.wasm64.supported
        ? `최대 ${capabilities.wasm64.maxLinearMemoryGiB} GiB 주소 공간`
        : `안전 힙 ${formatMemoryMiB(capabilities.wasm64.safeArenaCeilingMiB)}`,
      tone: wasm64Tone,
    },
    {
      id: "webgpu",
      nameKo: "WebGPU 타일·잉크",
      stateKo: capabilities.webgpuSupported ? "GPU 파이프라인 활성" : "Canvas2D 안전 폴백",
      detailKo: capabilities.webgpuSupported
        ? "256px 타일 + 벡터 잉크 셰이더"
        : "비 WebGPU 브라우저 호환 경로",
      tone: webgpuTone,
    },
    {
      id: "webnn",
      nameKo: "WebNN 로컬 NPU",
      stateKo: capabilities.webnn.npuAvailable
        ? "NPU 가속 준비"
        : capabilities.webnn.supported
          ? "WebNN GPU 활성"
          : `${capabilities.webnn.preferredBackend} 폴백`,
      detailKo: "온디바이스 추론 · 서버 비용 ₩0",
      tone: webnnTone,
    },
    {
      id: "webcodecs",
      nameKo: "WebCodecs 캐스팅",
      stateKo: capabilities.webcodecs.supported ? "하드웨어 인코딩" : "안전 폴백 스트림",
      detailKo: capabilities.webcodecs.lossless444Ready
        ? "4:4:4 무손실 · 저지연 미러링"
        : "4:2:0 호환 스트림 폴백",
      tone: webcodecsTone,
    },
    {
      id: "opfs",
      nameKo: "OPFS 로컬 아레나",
      stateKo: capabilities.opfsWebRtc.opfsSupported ? "즉시 영속 저장" : "메모리 스냅샷 폴백",
      detailKo: `로컬 커밋 약 ${capabilities.opfsWebRtc.estimatedLocalCommitMs}ms`,
      tone: opfsTone,
    },
    {
      id: "webrtc",
      nameKo: "WebRTC P2P 동기화",
      stateKo: capabilities.opfsWebRtc.webrtcP2pSupported ? "P2P 초저지연 준비" : "릴레이 폴백",
      detailKo: `예상 동기 RTT ${capabilities.opfsWebRtc.estimatedPeerSyncRttMs}ms`,
      tone: webrtcTone,
    },
    {
      id: "pressure",
      nameKo: "Compute Pressure",
      stateKo: capabilities.computePressureSupported ? "CPU 열 압력 감지" : "프레임타임 기반 제어",
      detailKo: capabilities.computePressureSupported
        ? "PressureObserver 자동 연동"
        : "프레임 예산 기반 안전 제어",
      tone: pressureTone,
    },
    {
      id: "lod",
      nameKo: "동적 LOD 등급",
      stateKo: lodTierLabelKo,
      detailKo: "60fps 목표 자동 계단 최적화",
      tone: lodTone,
    },
  ];
}

export function StudioNextGenPerfTelemetryCard({
  reduceMotion = false,
  initialCapabilities,
}: StudioNextGenPerfTelemetryCardProps): ReactElement {
  const [capabilities] = useState<NextGenPerfCapabilitySnapshot>(
    () =>
      initialCapabilities
      ?? probeNextGenPerfCapabilities({
        wasm64Probe: { nowMs: 0 },
      }),
  );

  const [selectedPresetId, setSelectedPresetId] =
    useState<CanvasMemoryWorkloadPreset["id"]>("8k-64l");
  const [bitDepth, setBitDepth] = useState<CanvasPixelBitDepth>("rgba8");
  const [simulateMode, setSimulateMode] = useState<"device" | "wasm64" | "wasm32">("device");
  const [pressureIdx, setPressureIdx] = useState<number>(0);
  const [mirrorTarget, setMirrorTarget] = useState<MirrorTargetDevice>("ipad-companion");
  const [mirrorQuality, setMirrorQuality] = useState<MirrorQualityMode>("lossless-444");

  const activePreset =
    CANVAS_MEMORY_WORKLOAD_PRESETS.find((preset) => preset.id === selectedPresetId)
    ?? CANVAS_MEMORY_WORKLOAD_PRESETS[0];

  const comparison = useMemo(
    () =>
      compareWasm64VsWasm32Plan(
        {
          widthPx: activePreset.widthPx,
          heightPx: activePreset.heightPx,
          layerCount: activePreset.layerCount,
          bitDepth,
          activeSparseFillRatio: activePreset.activeSparseFillRatio,
          meshTriangleCount: activePreset.meshTriangleCount,
          undoHistoryDepth: activePreset.undoHistoryDepth,
          opfsAvailable: capabilities.opfsWebRtc.opfsSupported,
        },
        Math.max(16, capabilities.wasm64.deviceMemoryGiB),
      ),
    [activePreset, bitDepth, capabilities.opfsWebRtc.opfsSupported, capabilities.wasm64.deviceMemoryGiB],
  );

  const activeMemoryPlan = useMemo(() => {
    if (simulateMode === "wasm64") return comparison.wasm64Plan;
    if (simulateMode === "wasm32") return comparison.wasm32Plan;
    return planCanvasMemoryStrategy({
      widthPx: activePreset.widthPx,
      heightPx: activePreset.heightPx,
      layerCount: activePreset.layerCount,
      bitDepth,
      activeSparseFillRatio: activePreset.activeSparseFillRatio,
      meshTriangleCount: activePreset.meshTriangleCount,
      undoHistoryDepth: activePreset.undoHistoryDepth,
      wasm64: capabilities.wasm64,
      opfsAvailable: capabilities.opfsWebRtc.opfsSupported,
    });
  }, [activePreset, bitDepth, capabilities.opfsWebRtc.opfsSupported, capabilities.wasm64, comparison, simulateMode]);

  const pressureSample =
    PRESSURE_SIMULATION_OPTIONS[pressureIdx] ?? PRESSURE_SIMULATION_OPTIONS[0];

  const lodProfile = useMemo(
    () =>
      computeDynamicLodProfile({
        pressureState: pressureSample.state,
        frameTimeMs: pressureSample.frameTimeMs,
        targetFps: 60,
        previousTier: "ultra",
        consecutiveStableFrames: pressureSample.state === "nominal" ? 16 : 0,
      }),
    [pressureSample],
  );

  const mirrorProfile = useMemo(
    () =>
      planWebCodecsMirrorProfile({
        targetDevice: mirrorTarget,
        qualityMode: mirrorQuality,
        capability: capabilities.webcodecs,
      }),
    [capabilities.webcodecs, mirrorQuality, mirrorTarget],
  );

  const vectorRibbon = useMemo(
    () =>
      tessellateShaderVectorInkRibbon(SAMPLE_VECTOR_INK_SEGMENTS, {
        subdivisions: lodProfile.vectorRibbonSubdivisions,
        zoomScale: 2,
      }),
    [lodProfile.vectorRibbonSubdivisions],
  );

  const signals = useMemo(
    () => buildCapabilitySignals(capabilities, lodProfile.labelKo, lodProfile.tierIndex),
    [capabilities, lodProfile.labelKo, lodProfile.tierIndex],
  );

  const meterPercent = Math.min(100, Math.round(activeMemoryPlan.budgetUtilizationRatio * 100));

  return (
    <section
      className="ngp-card"
      data-testid="studio-nextgen-perf-telemetry-card"
      data-ngp-reduce-motion={reduceMotion ? "true" : "false"}
      aria-label="차세대 크롬 성능 엔진 진단 HUD"
    >
      <header className="ngp-header">
        <div className="ngp-header-lead">
          <div className="ngp-sprite-frame" aria-hidden="true">
            <img
              src={NEXTGEN_PERF_SPRITE_SRC}
              alt=""
              width={56}
              height={56}
              loading="lazy"
              className="ngp-sprite-img"
            />
          </div>
          <div className="ngp-title-wrap">
            <p className="ngp-kicker">NEXT-GEN CHROME ENGINE HUD</p>
            <h3 className="ngp-title">
              Wasm64 8K 아레나 · WebGPU/WebNN · WebCodecs · 동적 LOD 진단
            </h3>
            <p className="ngp-subtitle">
              현재 브라우저의 64비트 메모리, 로컬 NPU 추론, 무손실 캐스팅, 열 압력 자동 최적화를
              실시간 점검합니다.
            </p>
          </div>
        </div>
        <span
          className="ngp-score-pill ngp-num"
          data-testid="ngp-readiness-score"
        >
          준비도 {capabilities.readinessScore}/100 ·{" "}
          {resolveReadinessBadgeKo(capabilities.readinessTier)}
        </span>
      </header>

      <div
        className="ngp-signal-grid"
        role="list"
        aria-label="차세대 웹 성능 8대 신호등"
      >
        {signals.map((signal) => (
          <article
            key={signal.id}
            role="listitem"
            data-testid={`ngp-signal-${signal.id}`}
            className={`ngp-signal-item ngp-signal-item--${signal.tone}`}
          >
            <div className="ngp-signal-head">
              <span className={`ngp-dot ngp-dot--${signal.tone}`} aria-hidden="true" />
              <span className="ngp-signal-name">{signal.nameKo}</span>
            </div>
            <span className={`ngp-signal-state ngp-signal-state--${signal.tone}`}>
              {signal.stateKo}
            </span>
            <p className="ngp-signal-detail ngp-num">{signal.detailKo}</p>
          </article>
        ))}
      </div>

      <section className="ngp-panel" aria-label="8K 다중 레이어 메모리 예산 시뮬레이터">
        <div className="ngp-panel-head">
          <h4 className="ngp-panel-title">8K 메모리 예산 · 스왑리스 아레나 시뮬레이터</h4>
          <div className="ngp-chip-row" role="group" aria-label="픽셀 정밀도 및 주소 모드">
            <button
              type="button"
              className={`ngp-chip-btn ${bitDepth === "rgba8" ? "ngp-chip-btn--active" : ""}`}
              aria-pressed={bitDepth === "rgba8"}
              onClick={() => setBitDepth("rgba8")}
            >
              RGBA8 (4B)
            </button>
            <button
              type="button"
              className={`ngp-chip-btn ${bitDepth === "rgba16f" ? "ngp-chip-btn--active" : ""}`}
              aria-pressed={bitDepth === "rgba16f"}
              onClick={() => setBitDepth("rgba16f")}
            >
              RGBA16F HDR (8B)
            </button>
            <button
              type="button"
              className={`ngp-chip-btn ${simulateMode === "device" ? "ngp-chip-btn--active" : ""}`}
              aria-pressed={simulateMode === "device"}
              onClick={() => setSimulateMode("device")}
            >
              현재 기기
            </button>
            <button
              type="button"
              className={`ngp-chip-btn ${simulateMode === "wasm64" ? "ngp-chip-btn--active" : ""}`}
              aria-pressed={simulateMode === "wasm64"}
              onClick={() => setSimulateMode("wasm64")}
            >
              Wasm64 비교
            </button>
            <button
              type="button"
              className={`ngp-chip-btn ${simulateMode === "wasm32" ? "ngp-chip-btn--active" : ""}`}
              aria-pressed={simulateMode === "wasm32"}
              onClick={() => setSimulateMode("wasm32")}
            >
              32비트 비교
            </button>
          </div>
        </div>

        <div className="ngp-chip-row" role="group" aria-label="8K 작업 프리셋">
          {CANVAS_MEMORY_WORKLOAD_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              data-testid={`ngp-preset-${preset.id}`}
              className={`ngp-chip-btn ${selectedPresetId === preset.id ? "ngp-chip-btn--active" : ""}`}
              aria-pressed={selectedPresetId === preset.id}
              onClick={() => {
                setSelectedPresetId(preset.id);
                setBitDepth(preset.bitDepth);
              }}
            >
              <span>{preset.labelKo}</span>
            </button>
          ))}
        </div>

        <div
          className="ngp-meter-track"
          role="progressbar"
          aria-label="아레나 메모리 점유율"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={meterPercent}
        >
          <div
            className={`ngp-meter-fill ngp-meter-fill--${activeMemoryPlan.healthTone}`}
            style={{ width: `${meterPercent}%` }}
          />
        </div>

        <dl className="ngp-metrics-grid ngp-num">
          <div className="ngp-metric-box">
            <dt>선택 전략</dt>
            <dd data-testid="ngp-memory-strategy">{activeMemoryPlan.strategyLabelKo}</dd>
          </div>
          <div className="ngp-metric-box">
            <dt>필요 예산 / 아레나 상한</dt>
            <dd data-testid="ngp-memory-budget">
              {formatMemoryMiB(activeMemoryPlan.breakdown.totalRequiredMiB)} /{" "}
              {formatMemoryMiB(activeMemoryPlan.arenaCeilingMiB)}
            </dd>
          </div>
          <div className="ngp-metric-box">
            <dt>예상 스왑 지연 / OPFS 스필</dt>
            <dd data-testid="ngp-memory-stall">
              {activeMemoryPlan.estimatedSwapStallMsPerPan.toFixed(1)} ms ·{" "}
              {formatMemoryMiB(activeMemoryPlan.opfsSpillMiB)}
            </dd>
          </div>
          <div className="ngp-metric-box">
            <dt>64비트 전환 시 절감</dt>
            <dd>
              -{comparison.swapStallSavedMs.toFixed(1)} ms · 스필 -
              {formatMemoryMiB(comparison.avoidedOpfsSpillMiB)}
            </dd>
          </div>
        </dl>

        <p className="ngp-summary-note" aria-live="polite">
          {activeMemoryPlan.summaryKo} {activeMemoryPlan.recommendationKo}
        </p>
      </section>

      <div className="ngp-split-grid">
        <section className="ngp-panel" aria-label="Compute Pressure 동적 LOD 조절기">
          <div className="ngp-panel-head">
            <h4 className="ngp-panel-title">Compute Pressure · 60fps 동적 LOD</h4>
          </div>
          <div className="ngp-chip-row" role="group" aria-label="열 압력 시뮬레이션">
            {PRESSURE_SIMULATION_OPTIONS.map((option, idx) => (
              <button
                key={option.state}
                type="button"
                data-testid={`ngp-pressure-${option.state}`}
                className={`ngp-chip-btn ${pressureIdx === idx ? "ngp-chip-btn--active" : ""}`}
                aria-pressed={pressureIdx === idx}
                onClick={() => setPressureIdx(idx)}
              >
                {option.labelKo}
              </button>
            ))}
          </div>
          <dl className="ngp-metrics-grid ngp-num">
            <div className="ngp-metric-box">
              <dt>파티클 밀도</dt>
              <dd data-testid="ngp-lod-particles">
                {Math.round(lodProfile.particleDensityScale * 100)}%
              </dd>
            </div>
            <div className="ngp-metric-box">
              <dt>그림자 해상도</dt>
              <dd data-testid="ngp-lod-shadow">{lodProfile.shadowMapResolution}px</dd>
            </div>
            <div className="ngp-metric-box">
              <dt>수채화 서브스텝</dt>
              <dd data-testid="ngp-lod-watercolor">{lodProfile.watercolorSubsteps}단계</dd>
            </div>
            <div className="ngp-metric-box">
              <dt>3D AA · 리본 분할</dt>
              <dd data-testid="ngp-lod-aa">
                {lodProfile.aaMode3d.toUpperCase()} · {lodProfile.vectorRibbonSubdivisions}seg
              </dd>
            </div>
          </dl>
          <p className="ngp-summary-note" aria-live="polite">
            {lodProfile.reasonKo} (벡터 잉크 GPU 리본: {vectorRibbon.vertexCount}정점 ·{" "}
            {vectorRibbon.triangleCount}삼각형 · {vectorRibbon.gpuBufferBytes}B)
          </p>
        </section>

        <section className="ngp-panel" aria-label="WebCodecs 무손실 미러링 프로파일">
          <div className="ngp-panel-head">
            <h4 className="ngp-panel-title">WebCodecs 저지연 캔버스 미러링</h4>
            <button
              type="button"
              data-testid="ngp-mirror-quality-toggle"
              className={`ngp-chip-btn ${mirrorQuality === "lossless-444" ? "ngp-chip-btn--active" : ""}`}
              aria-pressed={mirrorQuality === "lossless-444"}
              onClick={() =>
                setMirrorQuality((prev) =>
                  prev === "lossless-444" ? "ultra-low-latency" : "lossless-444",
                )
              }
            >
              {mirrorQuality === "lossless-444" ? "4:4:4 무손실 우선" : "초저지연 우선"}
            </button>
          </div>
          <div className="ngp-chip-row" role="group" aria-label="미러링 대상 디바이스">
            {MIRROR_TARGET_OPTIONS.map((target) => (
              <button
                key={target.id}
                type="button"
                data-testid={`ngp-mirror-${target.id}`}
                className={`ngp-chip-btn ${mirrorTarget === target.id ? "ngp-chip-btn--active" : ""}`}
                aria-pressed={mirrorTarget === target.id}
                onClick={() => setMirrorTarget(target.id)}
              >
                {target.labelKo}
              </button>
            ))}
          </div>
          <dl className="ngp-metrics-grid ngp-num">
            <div className="ngp-metric-box">
              <dt>해상도 · FPS</dt>
              <dd data-testid="ngp-mirror-res">
                {mirrorProfile.widthPx}×{mirrorProfile.heightPx} · {mirrorProfile.targetFps}fps
              </dd>
            </div>
            <div className="ngp-metric-box">
              <dt>목표 비트레이트</dt>
              <dd data-testid="ngp-mirror-bitrate">{mirrorProfile.targetBitrateMbps} Mbps</dd>
            </div>
            <div className="ngp-metric-box">
              <dt>크로마 · 지연</dt>
              <dd>
                {mirrorProfile.chromaSubsampling} · {mirrorProfile.estimatedGlassToGlassMs}ms
              </dd>
            </div>
            <div className="ngp-metric-box">
              <dt>코덱 경로</dt>
              <dd>{mirrorProfile.codec}</dd>
            </div>
          </dl>
          <p className="ngp-summary-note" aria-live="polite">
            {mirrorProfile.summaryKo}
          </p>
        </section>
      </div>
    </section>
  );
}
