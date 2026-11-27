/**
 * Wasm64 Wave 65 공개 배럴 진입점 (`wasm64-wave65-native-gpu-npu-bridge`).
 *
 * - `native-bridge-ipc-protocol`: Rust 크레이트(`crates/studio-native-gpu-npu-bridge`)와
 *   바이트-정확히 호환되는 바이너리 IPC 프레임 코덱(IEEE CRC-32) 및 단조 시퀀스·타임아웃·서킷브레이커
 * - `vendor-session-negotiator`: 6대 벤더(Apple·NVIDIA·AMD·Intel·Arm·Qualcomm) 결정론적 협상 및
 *   브라우저 샌드박스 WebGPU WGSL 자동 폴백
 * - `webgpu-shader-pipeline-prewarmer`: 브러시 첫 선택 300ms 컴파일 끊김을 0ms로 줄이는
 *   우선순위 WebGPU PSO 프리워머·LRU 캐시 및 무중단 WebGPU/네이티브 런타임 디스패처
 */

export {
  IPC_FLAGS,
  IPC_HEADER_BYTES,
  IPC_MAGIC_BYTES,
  IPC_MAX_PAYLOAD_BYTES,
  IPC_MIN_PACKET_BYTES,
  IPC_PACKET_KIND_TO_WIRE,
  IPC_PROTOCOL_VERSION,
  IPC_TRAILER_BYTES,
  IpcProtocolError,
  NativeBridgeIpcClient,
  VENDOR_TO_WIRE_ID,
  WIRE_ID_TO_VENDOR,
  WIRE_TO_IPC_PACKET_KIND,
  computeCrc32Ieee,
  decodeIpcFramePacket,
  encodeIpcFramePacket,
  type CircuitBreakerState,
  type GpuVendor,
  type IpcDecodeErrorCode,
  type IpcFramePacket,
  type IpcPacketKind,
  type NativeBridgeCallFallback,
  type NativeBridgeCallResult,
  type NativeBridgeCallSuccess,
  type NativeBridgeIpcClientOptions,
  type NativeBridgeIpcDiagnostics,
  type NativeBridgeTransport,
  type SharedMemoryHandleMeta,
} from "./native-bridge-ipc-protocol";

export {
  formatHostProbeDescriptor,
  negotiateNativeBridgeSession,
  type AmdFsrCapability,
  type GraphicsBackend,
  type HostHardwareProbe,
  type HostOs,
  type IntelXessCapability,
  type LowLatencyKind,
  type NativeBridgeSessionPlan,
  type NpuBackend,
  type UpscalerKind,
  type ZeroCopyTransport,
} from "./vendor-session-negotiator";

export {
  BUILTIN_STUDIO_BRUSH_SHADERS,
  StudioGpuNpuBridgeRuntime,
  WebGpuShaderPsoPrewarmer,
  computePsoCacheKey,
  type CompiledPsoEntry,
  type PsoAcquireResult,
  type PsoPipelineKind,
  type PsoPrewarmBatchReport,
  type PsoPrewarmPriority,
  type PsoPrewarmerStats,
  type PsoShaderDescriptor,
  type StudioBridgeRuntimeTelemetry,
  type StudioFrameDispatchRequest,
  type StudioFrameDispatchResult,
  type StudioGpuNpuBridgeRuntimeOptions,
  type WebGpuDeviceLike,
  type WebGpuPipelineLike,
  type WebGpuShaderModuleLike,
  type WebGpuShaderPsoPrewarmerOptions,
} from "./webgpu-shader-pipeline-prewarmer";
