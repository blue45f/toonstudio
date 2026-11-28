/**
 * Wave 72 공개 배럴 진입점 (`studio-supergap-runtime-hub`).
 *
 * - `desktop-loopback-bridge-transport`: 127.0.0.1/localhost 허용 목록 강제 루프백 HTTP IPC 클라이언트
 * - `studio-supergap-runtime-hub`: Wave 54~67 및 확장 슬롯(Wave 68~70+) 통합 지연 로드 런타임 허브
 * - `StudioSupergapStatusDrawer`: Calm Atelier 규격 초격차 엔진 상태 드로어 UI
 */

export {
  DEFAULT_DESKTOP_LOOPBACK_PORT,
  DEFAULT_LOOPBACK_TIMEOUT_MS,
  DesktopLoopbackBridgeTransport,
  LOOPBACK_HEALTH_ENDPOINT_PATH,
  LOOPBACK_IPC_ENDPOINT_PATH,
  LOOPBACK_PROBE_ENDPOINT_PATH,
  LoopbackBridgeSecurityError,
  LoopbackBridgeTransportError,
  assertValidLoopbackBaseUrl,
  probeDesktopLoopbackBridge,
  type DesktopLoopbackBridgeConfig,
  type DesktopLoopbackHealthResponse,
  type DesktopLoopbackProbeConnected,
  type DesktopLoopbackProbeFallback,
  type DesktopLoopbackProbeResponse,
  type DesktopLoopbackProbeResult,
  type LoopbackSecurityErrorCode,
  type LoopbackTransportErrorCode,
} from "./desktop-loopback-bridge-transport";

export {
  createStudioSupergapRuntimeHub,
  type BuiltinSupergapSubsystemId,
  type HardwareBridgeStatus,
  type StudioSupergapHubSnapshot,
  type StudioSupergapRuntimeHub,
  type StudioSupergapRuntimeHubOptions,
  type SupergapExtensionExecutionContext,
  type SupergapExtensionExecutionOutput,
  type SupergapExtensionSubsystemDefinition,
  type SupergapRuntimeReport,
  type SupergapSubsystemExecutionResult,
  type SupergapSubsystemMetadata,
  type SupergapSubsystemStatus,
} from "./studio-supergap-runtime-hub";

export {
  StudioSupergapStatusDrawer,
  type StudioSupergapStatusDrawerProps,
} from "./StudioSupergapStatusDrawer";

export {
  createFullStudioSupergapRuntimeHub,
  createWave68To70ExtensionSubsystems,
  registerWave68To70Extensions,
} from "./wave68-70-extensions";

export {
  createWave73To80ExtensionSubsystems,
  registerWave73To80Extensions,
} from "./wave73-80-extensions";

export {
  createWave81To86ExtensionSubsystems,
  registerWave81To86Extensions,
} from "./wave81-86-extensions";

export {
  createWave87To92ExtensionSubsystems,
  registerWave87To92Extensions,
} from "./wave87-92-extensions";

export {
  createWave93To98ExtensionSubsystems,
  registerWave93To98Extensions,
} from "./wave93-98-extensions";

export {
  createWave99To104ExtensionSubsystems,
  registerWave99To104Extensions,
} from "./wave99-104-extensions";

export {
  createWave105To110ExtensionSubsystems,
  registerWave105To110Extensions,
} from "./wave105-110-extensions";

export {
  createWave111To116ExtensionSubsystems,
  registerWave111To116Extensions,
} from "./wave111-116-extensions";

export {
  createWave117To122ExtensionSubsystems,
  registerWave117To122Extensions,
} from "./wave117-122-extensions";
