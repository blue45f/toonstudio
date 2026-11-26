/**
 * Super-Gap 통합 엔드투엔드 런타임 허브 & 핫패스 브리지 공개 진입점 (`₩0 로컬 · 0B eager impact`).
 *
 * - Creator Draw-to-Publish Pipeline (`runCreatorDrawToPublishPipeline`):
 *   원시 스타일러스 스트로크 → FFT 손떨림 보정(#4) + 적응형 브러시 → 벡터 틈새 폐합·오토플랫(#3)
 *   → 캐릭터 연속성 Diff & 모바일 10초 이탈 히트맵(#10) → WebGPU 비가시성 워터마크(PSNR >= 42 dB) +
 *   양자내성 WOTS+/ECDSA 하이브리드 봉인(#14) → CMYK PDF/X-4 · EPUB3 · 플랫폼 규격 패키저 & IP 파생 번들(#35)
 * - Thermal-Adaptive GPU/Physics Feedback Loop (`ThermalAdaptiveRuntimeLoop`, `runThermalAdaptiveFeedbackCycle`):
 *   120Hz 프레임 텔레메트리 → 발열/배터리 페이서 → VRS · SVT 밉 바이어스 · XPBD 서브스텝 ·
 *   포비에이티드 타일 우선순위 · 멀티패스 렌더 그래프 VRAM 예산 실시간 협조 제어
 * - Cold-Boot & 35-Capability / 62-ABI Readiness Matrix (`auditSuperGapPlatformReadiness`):
 *   전 35개 Super-Gap 역량 · 62-Export WASM64 브리지 · 오프라인 PWA 핀 무결성 · 비행기 모드 콜드부트 감사
 *
 * 주의: Studio 초기 진입 그래프(`main.tsx`, `studio-legacy-editor-adapter.tsx`)에서 정적 import하지 않고,
 * 기능 실행 시점에만 동적(on-demand) 지연 로드한다.
 */

export {
  auditSuperGapPlatformReadiness,
  inspectWasm64BridgeAvailability,
  runCreatorDrawToPublishPipeline,
  runThermalAdaptiveFeedbackCycle,
  SUPER_GAP_35_CAPABILITY_REGISTRY,
  SUPER_GAP_TOTAL_CAPABILITIES,
  ThermalAdaptiveRuntimeLoop,
  WASM64_CORE_EXPECTED_EXPORTS,
  WASM64_EXTENDED_EXPECTED_C_ABI_FUNCTIONS,
  WASM64_EXTENDED_EXPECTED_EXPORTS,
  type CreatorDrawToPublishInput,
  type CreatorDrawToPublishResult,
  type CreatorDrawToPublishStageTimingsMs,
  type OfflinePwaPinIntegrityReport,
  type PipelineStylusStrokeInput,
  type RawStylusStrokePoint,
  type Stage1StylusAndBrushSummary,
  type Stage2AutoFlatAndRasterSummary,
  type Stage3QaSummary,
  type Stage4DefenseAndSealSummary,
  type Stage5PublishAndIpSummary,
  type SuperGapCapabilityDescriptor,
  type SuperGapPillarId,
  type SuperGapPlatformReadinessReport,
  type SuperGapReadinessAuditInput,
  type ThermalAdaptiveLoopOptions,
  type ThermalFeedbackCycleResult,
  type ThermalFeedbackFrameInput,
  type ThermalLiveControlOutputs,
  type Wasm64BridgeAvailabilityReport,
  type Wasm64BridgeProbeInput,
} from "./supergap-end-to-end-orchestrator";
