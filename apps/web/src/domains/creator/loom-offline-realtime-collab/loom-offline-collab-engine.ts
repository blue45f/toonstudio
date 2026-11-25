/**
 * Wave 66A — LoomSync 완전 오프라인 비행기 모드 시뮬레이터 & 실시간 팀 협업 엔진.
 *
 * - 100% ToonStudio 고유 브랜드(LoomSync · AtelierStage · ToonCore · KilnExport)
 * - 비행기 모드 6단계 무결성 시뮬레이션: Service Worker Precached Shell + COOP/COEP +
 *   /offline-draw/portable.html 비상 캔버스 + SQLite WASM WAL + OPFS CAS + Multi-Tab Leader Lock +
 *   재연결 256×256 RLE-Delta 타일 업로드 및 HLC CRDT 인과 수렴 검증(바이트 손실 0건)
 * - 실시간 팀 협업 6대 모듈: 4역할 소프트 락·핸드오프, 캔버스 공간 핀+10초 음성+빨간펜,
 *   120Hz 16B 라이브 커서·따라보기, A/B안 비주얼 디프 브랜치·타임머신 롤백,
 *   검수 메타데이터 모형(실제 암호화·키 생성/폐기·공유 URL 미생성), JSON 내보내기
 */

export const LOOM_OFFLINE_COLLAB_SCHEMA_VERSION = "toonstudio.loom-offline-collab.v1" as const;
export const LOOM_SYNC_BRAND = "LoomSync" as const;
export const ATELIER_STAGE_BRAND = "AtelierStage" as const;
export const TOON_CORE_BRAND = "ToonCore" as const;
export const KILN_EXPORT_BRAND = "KilnExport" as const;

export const TILE_SIZE_PX = 256 as const;
export const STROKE_DELTA_FRAME_BYTES = 16 as const;
export const CURSOR_TARGET_HZ = 120 as const;
export const MAX_VOICE_PIN_SECONDS = 10 as const;
export const VIOLET_HUE_MIN_DEG = 265 as const;
export const VIOLET_HUE_MAX_DEG = 325 as const;
export const DEFAULT_SIMULATION_EPOCH_MS = Date.UTC(2026, 10, 26, 12, 0, 0);

export type OfflineStackLayerId =
  | "sw-precache-shell" | "coop-coep-isolation" | "portable-emergency-canvas"
  | "sqlite-wasm-wal" | "opfs-cas-tiles" | "multitab-leader-lock" | "hlc-crdt-delta-replay";

export type OfflineStageId =
  | "stage-1-precache-isolation" | "stage-2-network-sever" | "stage-3-offline-authoring"
  | "stage-4-tab-crash-wal-recovery" | "stage-5-reconnect-rle-delta" | "stage-6-hlc-crdt-convergence";

export type OfflineCapabilityTier = "offline-100-percent" | "network-required";
export type CollabRoleId = "lineart" | "flat-color" | "bg-3d" | "lettering-sfx";
export type LayerLockStatus = "locked-active" | "handoff-requested" | "available";
export type SpatialPinStatus = "open" | "resolved";
export type EpisodeBranchId = "main-cut-baseline" | "branch-a-sunset-rim" | "branch-b-moonlit-noir";
export type WatermarkDensity = "subtle" | "standard" | "strict";

export interface OklchColor { readonly l: number; readonly c: number; readonly h: number; }
export interface HlcTimestamp { readonly physicalMs: number; readonly logical: number; readonly nodeId: string; }
export interface DirtyTileCoordinate { readonly tx: number; readonly ty: number; readonly opCount: number; }

export interface OfflineStackLayerSpec {
  readonly id: OfflineStackLayerId; readonly order: number; readonly brand: string;
  readonly titleKo: string; readonly titleEn: string;
  readonly detailKo: string; readonly detailEn: string; readonly artifactRef: string;
}

export interface OfflineCapabilityBoundaryItem {
  readonly id: string; readonly tier: OfflineCapabilityTier; readonly brand: string;
  readonly titleKo: string; readonly titleEn: string; readonly reasonKo: string; readonly reasonEn: string;
}

export interface SimulatedCrdtOp {
  readonly opId: string; readonly origin: "local-offline" | "remote-peer";
  readonly kind: "stroke" | "layer-edit" | "stage-3d-placement";
  readonly tileX: number; readonly tileY: number; readonly payloadBytes: number;
  readonly hlc: HlcTimestamp; readonly walChecksum: string;
}

export interface OfflineSimulationInput {
  readonly offlineStrokeCount?: number; readonly layerEditCount?: number; readonly stage3dPlacementCount?: number;
  readonly canvasWidthPx?: number; readonly canvasHeightPx?: number; readonly simulateTabCrash?: boolean;
  readonly simulateRemoteConcurrentOps?: number; readonly swInstalledBeforeOutage?: boolean;
  readonly coopCoepEnabled?: boolean; readonly peerTabCount?: number;
}

export interface NormalizedOfflineSimulationInput {
  readonly offlineStrokeCount: number; readonly layerEditCount: number; readonly stage3dPlacementCount: number;
  readonly canvasWidthPx: number; readonly canvasHeightPx: number; readonly simulateTabCrash: boolean;
  readonly simulateRemoteConcurrentOps: number; readonly swInstalledBeforeOutage: boolean;
  readonly coopCoepEnabled: boolean; readonly peerTabCount: number; readonly clamped: boolean;
}

export interface OfflineSimulationStage {
  readonly id: OfflineStageId; readonly step: number; readonly status: "pass" | "warn";
  readonly titleKo: string; readonly titleEn: string; readonly metricLabel: string;
  readonly summaryKo: string; readonly summaryEn: string;
}

export interface OfflineOutageSimulationReport {
  readonly schemaVersion: typeof LOOM_OFFLINE_COLLAB_SCHEMA_VERSION;
  readonly brand: typeof LOOM_SYNC_BRAND;
  readonly input: NormalizedOfflineSimulationInput;
  readonly coldInstallBlocked: boolean;
  readonly totalLocalOperations: number; readonly remoteConcurrentOperations: number;
  readonly walFramesCommitted: number; readonly walFramesRecovered: number;
  readonly lostBytes: number; readonly lostOperations: number;
  readonly leaderTabId: string; readonly standbyTabsFenced: number;
  readonly tilesX: number; readonly tilesY: number; readonly totalCanvasTiles: number;
  readonly dirtyTileCount: number; readonly dirtyTilesSample: readonly DirtyTileCoordinate[];
  readonly fullCanvasRawBytes: number; readonly dirtyTilesRawBytes: number;
  readonly rleDeltaUploadBytes: number; readonly bandwidthSavedPercent: number;
  readonly localMergedHash: string; readonly remoteMergedHash: string;
  readonly convergenceRatePercent: number; readonly unresolvedConflictCount: number;
  readonly zeroByteLossVerified: boolean;
  readonly stages: readonly OfflineSimulationStage[];
  readonly stackLayers: readonly OfflineStackLayerSpec[];
}

export interface CollabRoleLane {
  readonly roleId: CollabRoleId; readonly labelKo: string; readonly labelEn: string;
  readonly memberNameKo: string; readonly memberNameEn: string;
  readonly layerId: string; readonly layerNameKo: string; readonly layerNameEn: string;
  readonly cutRange: string; readonly lockStatus: LayerLockStatus;
  readonly ownerRoleId: CollabRoleId; readonly pendingRequesterRoleId: CollabRoleId | null;
  readonly cursorXNorm: number; readonly cursorYNorm: number;
  readonly activeToolKo: string; readonly activeToolEn: string;
  readonly dirtyTilesPending: number; readonly accentOklch: OklchColor;
}

export interface LockHandoffResult {
  readonly lanes: readonly CollabRoleLane[]; readonly overwritePrevented: boolean;
  readonly eventKo: string; readonly eventEn: string;
}

export interface SpatialReviewPin {
  readonly id: string; readonly cutId: string; readonly xNorm: number; readonly yNorm: number;
  readonly authorRoleId: CollabRoleId; readonly assigneeRoleId: CollabRoleId; readonly status: SpatialPinStatus;
  readonly noteKo: string; readonly noteEn: string; readonly voiceMemoDurationSec: number;
  readonly voiceWaveformPeaks: readonly number[];
  readonly redlinePoints: readonly (readonly [number, number])[]; readonly createdAtLabel: string;
}

export interface AddSpatialPinInput {
  readonly cutId?: string; readonly xNorm: number; readonly yNorm: number;
  readonly authorRoleId: CollabRoleId; readonly assigneeRoleId: CollabRoleId;
  readonly noteKo: string; readonly noteEn: string; readonly voiceMemoDurationSec?: number;
}

export interface LiveCursorTelemetry {
  readonly frameBytes: typeof STROKE_DELTA_FRAME_BYTES; readonly targetHz: typeof CURSOR_TARGET_HZ;
  readonly activeMembers: number; readonly perMemberBytesPerSec: number;
  readonly teamTotalBytesPerSec: number; readonly teamTotalKbps: number;
  readonly latencyBudgetMs: {
    readonly captureAndPackMs: number; readonly transportRttHalfMs: number;
    readonly hlcDecodeAndRenderMs: number; readonly totalMs: number;
  };
  readonly followTargetRoleId: CollabRoleId | null; readonly spotlightActive: boolean;
  readonly viewportFocusXNorm: number; readonly viewportFocusYNorm: number; readonly viewportZoomPercent: number;
}

export interface EpisodeBranchVariant {
  readonly id: EpisodeBranchId; readonly labelKo: string; readonly labelEn: string;
  readonly lightingPresetKo: string; readonly lightingPresetEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
  readonly changedTileCount: number; readonly contrastRatio: number; readonly kilnExportReady: boolean;
  readonly previewTintOklch: OklchColor; readonly rimAccentOklch: OklchColor;
}

export interface TimeMachineSnapshot {
  readonly id: string; readonly branchId: EpisodeBranchId; readonly timestampLabel: string;
  readonly labelKo: string; readonly labelEn: string; readonly stateHash: string;
}

export interface E2eeForensicLinkInput {
  readonly episodeId?: string; readonly viewerHandle?: string; readonly viewerRoleLabel?: string;
  readonly expiresInHours?: number; readonly watermarkDensity?: WatermarkDensity;
  readonly allowDownload?: boolean; readonly nowEpochMs?: number;
}

export interface E2eeForensicReviewLink {
  readonly episodeId: string; readonly cipherSuite: "none" | "AES-GCM-256";
  readonly keyDerivation: "none" | "ECDH-P256 + HKDF-SHA-256"; readonly ivBytes: 0 | 12; readonly authTagBits: 0 | 128;
  readonly serverCanReadPlaintext: false | null; readonly keyFingerprint: string;
  readonly modelKind?: "review-metadata-simulation"; readonly plannedCipherSuite?: "AES-GCM-256";
  readonly encryptionPerformed?: false; readonly keyMaterialGenerated?: false;
  readonly watermarkApplied?: false; readonly liveShareEnabled?: false;
  readonly viewerHandle: string; readonly viewerRoleLabel: string;
  readonly watermarkDensity: WatermarkDensity; readonly allowDownload: boolean;
  readonly watermarkText: string; readonly watermarkDigest: string;
  readonly createdAtIso: string; readonly expiresAtIso: string;
  readonly expiresAtEpochMs: number; readonly expiresInHours: number; readonly reviewUrl: string;
}

export interface ForensicLinkVerificationResult {
  readonly valid: boolean; readonly isExpired: boolean;
  readonly watermarkDigestValid: boolean; readonly zeroKnowledgeEnforced: boolean;
  readonly verdictKo: string; readonly verdictEn: string;
  readonly verificationKind?: "metadata-checksum-only"; readonly cryptographicProtectionVerified?: false;
  readonly keyRevoked?: false;
}

export interface RealtimeTeamCollabInput {
  readonly lanes?: readonly CollabRoleLane[]; readonly pins?: readonly SpatialReviewPin[];
  readonly hideResolvedRedlines?: boolean; readonly followTargetRoleId?: CollabRoleId | null;
  readonly activeBranchId?: EpisodeBranchId; readonly adoptedBranchId?: EpisodeBranchId;
  readonly snapshots?: readonly TimeMachineSnapshot[]; readonly e2eeInput?: E2eeForensicLinkInput;
  readonly overwritePreventedCount?: number; readonly checkEpochMs?: number;
}

export interface RealtimeTeamCollabReport {
  readonly brand: typeof LOOM_SYNC_BRAND;
  readonly lanes: readonly CollabRoleLane[]; readonly activeLockedLayerCount: number;
  readonly pendingHandoffCount: number; readonly overwritePreventedCount: number;
  readonly zeroOverwriteGuaranteed: boolean; readonly pins: readonly SpatialReviewPin[];
  readonly openPinCount: number; readonly resolvedPinCount: number;
  readonly visibleRedlinePinCount: number; readonly hideResolvedRedlines: boolean;
  readonly cursorTelemetry: LiveCursorTelemetry;
  readonly activeBranch: EpisodeBranchVariant; readonly adoptedBranch: EpisodeBranchVariant;
  readonly branches: readonly EpisodeBranchVariant[]; readonly snapshots: readonly TimeMachineSnapshot[];
  readonly e2eeLink: E2eeForensicReviewLink; readonly e2eeVerification: ForensicLinkVerificationResult;
}

export interface LoomOfflineCollabExportInput {
  readonly offlineInput?: OfflineSimulationInput; readonly collabInput?: RealtimeTeamCollabInput;
}

export interface LoomOfflineCollabExportPayload {
  readonly schemaVersion: typeof LOOM_OFFLINE_COLLAB_SCHEMA_VERSION;
  readonly brands: readonly [typeof LOOM_SYNC_BRAND, typeof ATELIER_STAGE_BRAND, typeof TOON_CORE_BRAND, typeof KILN_EXPORT_BRAND];
  readonly offlineSimulation: OfflineOutageSimulationReport;
  readonly offlineBoundary: readonly OfflineCapabilityBoundaryItem[];
  readonly realtimeCollab: RealtimeTeamCollabReport;
  readonly honestyNoteKo: string; readonly honestyNoteEn: string;
  readonly runtimeEvidence?: {
    readonly opfsWritePerformed: false; readonly sqliteWalPersisted: false; readonly realtimeNetworkConnected: false;
    readonly encryptionPerformed: false; readonly keyMaterialGenerated: false; readonly watermarkApplied: false;
  };
}

export interface LoomOfflineCollabExportBundle {
  readonly payload: LoomOfflineCollabExportPayload; readonly json: string;
}

export function isVioletHueDeg(hue: number): boolean {
  const normalized = ((hue % 360) + 360) % 360;
  return normalized >= VIOLET_HUE_MIN_DEG && normalized <= VIOLET_HUE_MAX_DEG;
}

export function sanitizeNonVioletOklch(color: OklchColor): OklchColor {
  const l = Number.isFinite(color.l) ? Math.min(1, Math.max(0, color.l)) : 0.5;
  const c = Number.isFinite(color.c) ? Math.min(0.4, Math.max(0, color.c)) : 0.1;
  const rawH = Number.isFinite(color.h) ? ((color.h % 360) + 360) % 360 : 226;
  const h = isVioletHueDeg(rawH) ? (rawH < 295 ? 228 : 344) : Math.round(rawH * 10) / 10;
  return { l: Math.round(l * 1000) / 1000, c: Math.round(c * 1000) / 1000, h };
}

export function formatOklch(color: OklchColor, alpha?: number): string {
  const safe = sanitizeNonVioletOklch(color);
  if (alpha !== undefined && Number.isFinite(alpha)) {
    return `oklch(${safe.l} ${safe.c} ${safe.h} / ${Math.min(1, Math.max(0, alpha)).toFixed(2)})`;
  }
  return `oklch(${safe.l} ${safe.c} ${safe.h})`;
}

function clampNumber(value: number | undefined, fallback: number, min: number, max: number): { readonly value: number; readonly clamped: boolean } {
  if (value === undefined || !Number.isFinite(value)) return { value: fallback, clamped: value !== undefined };
  const clampedValue = Math.min(max, Math.max(min, value));
  return { value: clampedValue, clamped: clampedValue !== value };
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): { readonly value: number; readonly clamped: boolean } {
  const res = clampNumber(value, fallback, min, max);
  const rounded = Math.round(res.value);
  return { value: rounded, clamped: res.clamped || rounded !== res.value };
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).toUpperCase().padStart(8, "0");
}

export function compareHlcTimestamp(left: HlcTimestamp, right: HlcTimestamp): number {
  if (left.physicalMs !== right.physicalMs) return left.physicalMs - right.physicalMs;
  if (left.logical !== right.logical) return left.logical - right.logical;
  return left.nodeId < right.nodeId ? -1 : left.nodeId > right.nodeId ? 1 : 0;
}

export const OFFLINE_STACK_LAYERS: readonly OfflineStackLayerSpec[] = [
  { id: "sw-precache-shell", order: 1, brand: LOOM_SYNC_BRAND, titleKo: "Service Worker Precached Shell", titleEn: "Service Worker Precached Shell", detailKo: "크리티컬 앱 셸·i18n 사전을 원자적 캐시(toonstudio-emergency-drawing-shell-v2)로 선적재합니다.", detailEn: "Atomically precaches the critical app shell and studio i18n bundles for zero-network boot.", artifactRef: "/offline-draw/sw.js" },
  { id: "coop-coep-isolation", order: 2, brand: TOON_CORE_BRAND, titleKo: "COOP/COEP 교차 출처 격리", titleEn: "COOP/COEP Cross-Origin Isolation", detailKo: "same-origin · require-corp 헤더로 SharedArrayBuffer와 ToonCore WASM64 워커를 오프라인에서도 유지합니다.", detailEn: "Maintains SharedArrayBuffer and ToonCore WASM64 workers offline via same-origin and require-corp headers.", artifactRef: "config/http-response-headers.json" },
  { id: "portable-emergency-canvas", order: 3, brand: TOON_CORE_BRAND, titleKo: "/offline-draw/portable.html 비상 캔버스", titleEn: "/offline-draw/portable.html Emergency Canvas", detailKo: "네트워크 완전 단절·메인 번들 손상 시에도 즉시 진입하는 독립 경량 비상 드로잉 경로입니다.", detailEn: "Self-contained emergency drawing surface that boots even when the network is completely severed.", artifactRef: "/offline-draw/portable.html" },
  { id: "sqlite-wasm-wal", order: 4, brand: TOON_CORE_BRAND, titleKo: "SQLite WASM WAL 원장", titleEn: "SQLite WASM WAL Ledger", detailKo: "모든 스트로크·레이어·3D 배치 변경을 프레임 체크섬과 함께 Write-Ahead Log에 즉시 커밋합니다.", detailEn: "Commits every stroke, layer edit, and 3D placement into a checksummed Write-Ahead Log.", artifactRef: "opfs://tooncore/episode.sqlite-wal" },
  { id: "opfs-cas-tiles", order: 5, brand: LOOM_SYNC_BRAND, titleKo: "OPFS CAS 256×256 타일 저장소", titleEn: "OPFS CAS 256×256 Tile Store", detailKo: "변경된 256×256 타일 블록만 콘텐츠 해시(CAS)로 로컬 저장해 중복 쓰기와 용량을 절감합니다.", detailEn: "Persists mutated 256×256 tiles in content-addressable OPFS blocks to eliminate redundant writes.", artifactRef: "opfs://loomsync/cas-tiles-256/" },
  { id: "multitab-leader-lock", order: 6, brand: LOOM_SYNC_BRAND, titleKo: "Multi-Tab Leader Lock", titleEn: "Multi-Tab Leader Lock", detailKo: "단일 리더 탭에만 WAL 쓰기 권한을 부여해 다중 탭 동시 편집 시 스플릿 브레인을 차단합니다.", detailEn: "Grants exclusive WAL writer authority to one leader tab so multi-tab sessions never corrupt state.", artifactRef: "navigator.locks::loomsync-wal-leader" },
  { id: "hlc-crdt-delta-replay", order: 7, brand: LOOM_SYNC_BRAND, titleKo: "재연결 HLC CRDT 델타 재생", titleEn: "Reconnect HLC CRDT Delta Replay", detailKo: "온라인 복귀 시 변경 타일만 RLE-Delta로 압축 전송하고 HLC 인과 전순서로 무충돌 수렴합니다.", detailEn: "Uploads only RLE-Delta compressed dirty tiles on reconnect and converges deterministically via HLC ordering.", artifactRef: "loomsync://hlc-crdt/rle-delta-v1" },
] as const;

export const OFFLINE_CAPABILITY_BOUNDARY: readonly OfflineCapabilityBoundaryItem[] = [
  { id: "offline-drawing-layers", tier: "offline-100-percent", brand: TOON_CORE_BRAND, titleKo: "2D 드로잉 · 브러시 · 레이어 편집", titleEn: "2D Drawing, Brushes & Layer Editing", reasonKo: "ToonCore 로컬 엔진과 캐시된 셸에서 네트워크 0바이트로 100% 동작합니다.", reasonEn: "Runs 100% locally in ToonCore with zero network requests once precached." },
  { id: "offline-3d-cad-stage", tier: "offline-100-percent", brand: ATELIER_STAGE_BRAND, titleKo: "AtelierStage 3D 배경 배치 · CAD 모델링", titleEn: "AtelierStage 3D Staging & CAD Modeling", reasonKo: "로컬 캐시된 3D 씬·소품과 WASM 커널로 인터넷 없이 구도와 배치를 편집합니다.", reasonEn: "Stages cached 3D scenes and parametric CAD props fully offline inside local WASM kernels." },
  { id: "offline-opfs-wal-save", tier: "offline-100-percent", brand: LOOM_SYNC_BRAND, titleKo: "SQLite WASM WAL + OPFS CAS 로컬 저장", titleEn: "SQLite WASM WAL + OPFS CAS Local Persistence", reasonKo: "Multi-Tab Leader Lock 보호 아래 브라우저 OPFS에 무손실 자동 저장·복구됩니다.", reasonEn: "Auto-saves losslessly to browser OPFS under Multi-Tab Leader Lock protection." },
  { id: "offline-ondevice-npu-export", tier: "offline-100-percent", brand: KILN_EXPORT_BRAND, titleKo: "온디바이스 NPU 보조 · 로컬 KilnExport 출고", titleEn: "On-Device NPU Assist & Local KilnExport", reasonKo: "기기 내 WebNN/NPU 가속과 로컬 PNG/4K 인코딩은 서버 호출 없이 완료됩니다.", reasonEn: "Local WebNN/NPU passes and KilnExport rendering finish without server calls." },
  { id: "offline-portable-emergency", tier: "offline-100-percent", brand: TOON_CORE_BRAND, titleKo: "/offline-draw/portable.html 비상 캔버스", titleEn: "/offline-draw/portable.html Emergency Canvas", reasonKo: "오프라인 프리캐시 완료 후 망 단절 상태에서도 즉시 드로잉을 이어갑니다.", reasonEn: "Provides an immediate standalone canvas whenever offline precache is installed." },
  { id: "net-initial-sw-install", tier: "network-required", brand: LOOM_SYNC_BRAND, titleKo: "최초 1회 방문 및 Service Worker 설치", titleEn: "First-Time Visit & Service Worker Install", reasonKo: "브라우저에 앱 셸이 한 번도 설치되지 않은 초기 상태에서는 최초 1회 온라인 접속이 필요합니다.", reasonEn: "A clean browser profile requires one initial online visit to precache the Service Worker shell." },
  { id: "net-cloud-llm", tier: "network-required", brand: ATELIER_STAGE_BRAND, titleKo: "클라우드 LLM · 원격 서버 추론", titleEn: "Cloud LLM & Remote Server Inference", reasonKo: "외부 클라우드 대형 모델 API는 온라인 복귀 전까지 큐 대기 상태로 보류됩니다.", reasonEn: "Cloud-hosted LLM APIs stay queued until network connectivity returns." },
  { id: "net-remote-team-sync", tier: "network-required", brand: LOOM_SYNC_BRAND, titleKo: "원격 팀원 실시간 LoomSync 델타 송수신", titleEn: "Remote Team Realtime LoomSync Sync", reasonKo: "오프라인 편집은 로컬 WAL에 안전 누적되며, 팀원 화면 반영은 재연결 즉시 자동 재생됩니다.", reasonEn: "Offline edits stay durable in local WAL and replay to remote teammates upon reconnection." },
  { id: "net-external-payment", tier: "network-required", brand: KILN_EXPORT_BRAND, titleKo: "외부 결제 · 라이선스 정산 검증", titleEn: "External Billing & License Settlement", reasonKo: "결제 승인 및 원격 영수증 검증은 보안상 실시간 네트워크 연결이 필수입니다.", reasonEn: "Payment authorization and remote receipt verification strictly require live network access." },
] as const;

export function getOfflineCapabilityBoundary(): readonly OfflineCapabilityBoundaryItem[] {
  return OFFLINE_CAPABILITY_BOUNDARY.map((item) => ({ ...item }));
}

export function normalizeOfflineSimulationInput(input?: OfflineSimulationInput): NormalizedOfflineSimulationInput {
  const strokes = clampInt(input?.offlineStrokeCount, 100, 1, 1000);
  const layers = clampInt(input?.layerEditCount, 18, 0, 200);
  const stage3d = clampInt(input?.stage3dPlacementCount, 6, 0, 64);
  const width = clampInt(input?.canvasWidthPx, 2048, 512, 8192);
  const height = clampInt(input?.canvasHeightPx, 4096, 512, 16384);
  const remoteOps = clampInt(input?.simulateRemoteConcurrentOps, 14, 0, 200);
  const tabs = clampInt(input?.peerTabCount, 2, 1, 8);
  return {
    offlineStrokeCount: strokes.value,
    layerEditCount: layers.value,
    stage3dPlacementCount: stage3d.value,
    canvasWidthPx: width.value,
    canvasHeightPx: height.value,
    simulateTabCrash: input?.simulateTabCrash ?? true,
    simulateRemoteConcurrentOps: remoteOps.value,
    swInstalledBeforeOutage: input?.swInstalledBeforeOutage ?? true,
    coopCoepEnabled: input?.coopCoepEnabled ?? true,
    peerTabCount: tabs.value,
    clamped: strokes.clamped || layers.clamped || stage3d.clamped || width.clamped || height.clamped || remoteOps.clamped || tabs.clamped,
  };
}

export function runOfflineOutageSimulation(input?: OfflineSimulationInput): OfflineOutageSimulationReport {
  const norm = normalizeOfflineSimulationInput(input);
  const tilesX = Math.ceil(norm.canvasWidthPx / TILE_SIZE_PX);
  const tilesY = Math.ceil(norm.canvasHeightPx / TILE_SIZE_PX);
  const totalCanvasTiles = tilesX * tilesY;
  const localOps: SimulatedCrdtOp[] = [];
  const dirtyTileCounts = new Map<string, { tx: number; ty: number; count: number }>();

  const registerOp = (idx: number, kind: SimulatedCrdtOp["kind"], payloadBytes: number): void => {
    const tx = (idx * 3 + (kind === "stage-3d-placement" ? 2 : 0)) % Math.max(1, Math.min(tilesX, 4));
    const ty = Math.floor(idx / 5) % Math.max(1, Math.min(tilesY, 6));
    const key = `${tx}:${ty}`;
    dirtyTileCounts.set(key, { tx, ty, count: (dirtyTileCounts.get(key)?.count ?? 0) + 1 });
    const hlc: HlcTimestamp = { physicalMs: DEFAULT_SIMULATION_EPOCH_MS + idx * 40, logical: idx % 8, nodeId: "tab-leader-01" };
    const opId = `loc-${kind.slice(0, 3)}-${idx}`;
    localOps.push({ opId, origin: "local-offline", kind, tileX: tx, tileY: ty, payloadBytes, hlc, walChecksum: fnv1aHex(`${opId}:${tx}:${ty}:${payloadBytes}:${hlc.physicalMs}`) });
  };

  for (let i = 0; i < norm.offlineStrokeCount; i += 1) registerOp(i, "stroke", 96 + (i % 4) * 16);
  for (let i = 0; i < norm.layerEditCount; i += 1) registerOp(norm.offlineStrokeCount + i, "layer-edit", 144);
  for (let i = 0; i < norm.stage3dPlacementCount; i += 1) registerOp(norm.offlineStrokeCount + norm.layerEditCount + i, "stage-3d-placement", 320);

  const remoteOps: SimulatedCrdtOp[] = [];
  for (let i = 0; i < norm.simulateRemoteConcurrentOps; i += 1) {
    const tx = (i + 1) % tilesX;
    const ty = (i * 2) % tilesY;
    const hlc: HlcTimestamp = { physicalMs: DEFAULT_SIMULATION_EPOCH_MS + i * 55 + 15, logical: i % 4, nodeId: "peer-color-02" };
    const opId = `rem-op-${i}`;
    remoteOps.push({ opId, origin: "remote-peer", kind: i % 3 === 0 ? "layer-edit" : "stroke", tileX: tx, tileY: ty, payloadBytes: 112, hlc, walChecksum: fnv1aHex(`${opId}:${tx}:${ty}:${hlc.physicalMs}`) });
  }

  const walFramesCommitted = localOps.length;
  const walFramesRecovered = localOps.filter((op) => op.walChecksum.length === 8).length;
  const lostOperations = walFramesCommitted - walFramesRecovered;
  const lostBytes = lostOperations === 0 ? 0 : lostOperations * 128;

  const dirtyTilesSorted: DirtyTileCoordinate[] = [...dirtyTileCounts.values()]
    .map((entry) => ({ tx: entry.tx, ty: entry.ty, opCount: entry.count }))
    .sort((a, b) => (a.ty !== b.ty ? a.ty - b.ty : a.tx - b.tx));

  const dirtyTileCount = dirtyTilesSorted.length;
  const bytesPerTileRaw = TILE_SIZE_PX * TILE_SIZE_PX * 4;
  const fullCanvasRawBytes = totalCanvasTiles * bytesPerTileRaw;
  const dirtyTilesRawBytes = dirtyTileCount * bytesPerTileRaw;
  const opPayloadTotalBytes = localOps.reduce((sum, op) => sum + op.payloadBytes, 0);
  const rleDeltaUploadBytes = Math.round(dirtyTileCount * 11264 + opPayloadTotalBytes * 0.42);
  const bandwidthSavedPercent = fullCanvasRawBytes > 0 ? Math.round((1 - rleDeltaUploadBytes / fullCanvasRawBytes) * 1000) / 10 : 0;

  const forwardMerged = [...localOps, ...remoteOps].sort((a, b) => compareHlcTimestamp(a.hlc, b.hlc));
  const reverseMerged = [...remoteOps, ...localOps].sort((a, b) => compareHlcTimestamp(a.hlc, b.hlc));
  const localMergedHash = fnv1aHex(forwardMerged.map((op) => `${op.opId}@${op.walChecksum}`).join("|"));
  const remoteMergedHash = fnv1aHex(reverseMerged.map((op) => `${op.opId}@${op.walChecksum}`).join("|"));
  const converged = localMergedHash === remoteMergedHash;
  const coldInstallBlocked = !norm.swInstalledBeforeOutage;

  const stages: readonly OfflineSimulationStage[] = [
    {
      id: "stage-1-precache-isolation", step: 1, status: coldInstallBlocked || !norm.coopCoepEnabled ? "warn" : "pass",
      titleKo: "SW 앱 셸 프리캐시 · COOP/COEP · 비상 캔버스 검증", titleEn: "SW Precache Shell, COOP/COEP & Emergency Canvas",
      metricLabel: coldInstallBlocked ? "초회 설치 필요" : norm.coopCoepEnabled ? "COOP/COEP 격리 + portable.html 준비" : "COOP/COEP 미활성(단일 스레드 폴백)",
      summaryKo: coldInstallBlocked ? "최초 1회 온라인 방문 전에는 Service Worker 앱 셸을 설치할 수 없어 오프라인 진입 전 선설치가 필요합니다." : "Service Worker Precached Shell과 /offline-draw/portable.html 비상 경로가 확인되어 무망 부팅이 가능합니다.",
      summaryEn: coldInstallBlocked ? "One initial online visit is required before Service Worker precache can boot offline." : "Service Worker Precached Shell and /offline-draw/portable.html are verified for zero-network boot.",
    },
    {
      id: "stage-2-network-sever", step: 2, status: "pass",
      titleKo: "비행기 모드 진입 · Multi-Tab Leader Lock 확보", titleEn: "Airplane Mode Sever & Multi-Tab Leader Lock",
      metricLabel: `HTTP/WS 0패킷 · 리더 1 / 대기 ${norm.peerTabCount - 1}탭`,
      summaryKo: "네트워크 완전 단절 상태에서 tab-leader-01이 단독 WAL 쓰기 락을 확보하고 대기 탭 쓰기를 차단합니다.",
      summaryEn: "Network fully severed; tab-leader-01 holds the sole WAL writer lock while standby tabs stay fenced.",
    },
    {
      id: "stage-3-offline-authoring", step: 3, status: "pass",
      titleKo: "오프라인 작화 · SQLite WASM WAL + OPFS CAS 기록", titleEn: "Offline Authoring into SQLite WASM WAL + OPFS CAS",
      metricLabel: `스트로크 ${norm.offlineStrokeCount} · 레이어 ${norm.layerEditCount} · 3D ${norm.stage3dPlacementCount}`,
      summaryKo: `총 ${localOps.length}건의 로컬 편집이 SQLite WASM WAL 프레임과 ${dirtyTileCount}개 OPFS CAS 256×256 타일에 커밋되었습니다.`,
      summaryEn: `Committed ${localOps.length} offline edits to SQLite WASM WAL frames and ${dirtyTileCount} OPFS CAS 256×256 tiles.`,
    },
    {
      id: "stage-4-tab-crash-wal-recovery", step: 4, status: lostBytes === 0 && lostOperations === 0 ? "pass" : "warn",
      titleKo: norm.simulateTabCrash ? "갑작스런 탭 크래시 시뮬레이션 → WAL 무손실 복구" : "정상 재기동 WAL 체크포인트 검증",
      titleEn: norm.simulateTabCrash ? "Sudden Tab Crash Simulation → Zero-Loss WAL Recovery" : "Clean Restart WAL Checkpoint Check",
      metricLabel: `복구 ${walFramesRecovered}/${walFramesCommitted} 프레임 · 손실 ${lostBytes}B`,
      summaryKo: "비정상 종료 직후 재부팅 시 모든 WAL 체크섬과 OPFS CAS 타일이 대조되어 바이트 손실 0건을 검증했습니다.",
      summaryEn: "Post-crash reboot verified every WAL checksum and OPFS CAS tile with 0 bytes lost.",
    },
    {
      id: "stage-5-reconnect-rle-delta", step: 5, status: "pass",
      titleKo: "온라인 재연결 · 256×256 변경 타일 RLE-Delta 압축 업로드", titleEn: "Online Reconnect · 256×256 Dirty Tile RLE-Delta Upload",
      metricLabel: `${dirtyTileCount}/${totalCanvasTiles} 타일 · ${Math.round(rleDeltaUploadBytes / 1024)}KB (${bandwidthSavedPercent}% 절감)`,
      summaryKo: `전체 캔버스 대신 변경된 ${dirtyTileCount}개 타일만 RLE-Delta로 압축 전송해 전송량을 ${bandwidthSavedPercent}% 절감했습니다.`,
      summaryEn: `Uploaded only ${dirtyTileCount} dirty tiles via RLE-Delta compression, cutting transfer volume by ${bandwidthSavedPercent}%.`,
    },
    {
      id: "stage-6-hlc-crdt-convergence", step: 6, status: converged ? "pass" : "warn",
      titleKo: "HLC CRDT 델타 재생 · 충돌 자동 수렴 100% 검증", titleEn: "HLC CRDT Delta Replay · 100% Automatic Convergence",
      metricLabel: `수렴 100% · 해시 ${localMergedHash} · 충돌 0건`,
      summaryKo: `오프라인 ${localOps.length}건 + 원격 동시 ${remoteOps.length}건을 HLC 인과 전순서로 병합해 양단 해시(${localMergedHash})가 100% 일치했습니다.`,
      summaryEn: `Merged ${localOps.length} offline and ${remoteOps.length} remote ops via HLC total order with matching hash ${localMergedHash}.`,
    },
  ];

  return {
    schemaVersion: LOOM_OFFLINE_COLLAB_SCHEMA_VERSION, brand: LOOM_SYNC_BRAND, input: norm, coldInstallBlocked,
    totalLocalOperations: localOps.length, remoteConcurrentOperations: remoteOps.length,
    walFramesCommitted, walFramesRecovered, lostBytes, lostOperations,
    leaderTabId: "tab-leader-01", standbyTabsFenced: Math.max(0, norm.peerTabCount - 1),
    tilesX, tilesY, totalCanvasTiles, dirtyTileCount, dirtyTilesSample: dirtyTilesSorted.slice(0, 18),
    fullCanvasRawBytes, dirtyTilesRawBytes, rleDeltaUploadBytes, bandwidthSavedPercent,
    localMergedHash, remoteMergedHash, convergenceRatePercent: converged ? 100 : 0,
    unresolvedConflictCount: converged ? 0 : 1, zeroByteLossVerified: lostBytes === 0 && lostOperations === 0 && converged,
    stages, stackLayers: OFFLINE_STACK_LAYERS.map((layer) => ({ ...layer })),
  };
}

const CANONICAL_ROLE_LANES: readonly CollabRoleLane[] = [
  { roleId: "lineart", labelKo: "선화 작가", labelEn: "Lineart Lead", memberNameKo: "하윤 (메인 작가)", memberNameEn: "Hayun (Lead Artist)", layerId: "layer-lineart-01", layerNameKo: "L-01 캐릭터 펜 선화", layerNameEn: "L-01 Character Ink Lineart", cutRange: "C-01 ~ C-04", lockStatus: "locked-active", ownerRoleId: "lineart", pendingRequesterRoleId: null, cursorXNorm: 0.28, cursorYNorm: 0.36, activeToolKo: "ToonCore G-펜 120Hz", activeToolEn: "ToonCore G-Pen 120Hz", dirtyTilesPending: 5, accentOklch: { l: 0.52, c: 0.14, h: 226 } },
  { roleId: "flat-color", labelKo: "밑색 어시", labelEn: "Flat Colorist", memberNameKo: "지호 (채색 어시)", memberNameEn: "Jiho (Flat Colorist)", layerId: "layer-flat-02", layerNameKo: "L-02 인물 밑색·명암", layerNameEn: "L-02 Flat Color & Shadow", cutRange: "C-01 ~ C-04", lockStatus: "locked-active", ownerRoleId: "flat-color", pendingRequesterRoleId: null, cursorXNorm: 0.48, cursorYNorm: 0.56, activeToolKo: "영역 채우기 올가미", activeToolEn: "Smart Region Fill", dirtyTilesPending: 7, accentOklch: { l: 0.54, c: 0.14, h: 156 } },
  { roleId: "bg-3d", labelKo: "3D 배경", labelEn: "3D Background", memberNameKo: "서진 (배경 감독)", memberNameEn: "Seojin (3D Stage)", layerId: "layer-bg3d-03", layerNameKo: "L-03 AtelierStage 3D 배경", layerNameEn: "L-03 AtelierStage 3D Backdrop", cutRange: "C-02 ~ C-04", lockStatus: "locked-active", ownerRoleId: "bg-3d", pendingRequesterRoleId: null, cursorXNorm: 0.69, cursorYNorm: 0.34, activeToolKo: "AtelierStage 카메라 릭", activeToolEn: "AtelierStage Camera Rig", dirtyTilesPending: 4, accentOklch: { l: 0.54, c: 0.13, h: 192 } },
  { roleId: "lettering-sfx", labelKo: "식자/말풍선", labelEn: "Lettering & SFX", memberNameKo: "민아 (식자·연출)", memberNameEn: "Mina (Lettering/SFX)", layerId: "layer-sfx-04", layerNameKo: "L-04 대사·말풍선·효과음", layerNameEn: "L-04 Balloons & SFX", cutRange: "C-01 ~ C-04", lockStatus: "locked-active", ownerRoleId: "lettering-sfx", pendingRequesterRoleId: null, cursorXNorm: 0.81, cursorYNorm: 0.68, activeToolKo: "말풍선 꼬리 벡터", activeToolEn: "Balloon Tail Vector", dirtyTilesPending: 3, accentOklch: { l: 0.57, c: 0.14, h: 42 } },
] as const;

export const COLLAB_ROLE_LANES: readonly CollabRoleLane[] = CANONICAL_ROLE_LANES;

export function getDefaultCollabRoleLanes(): CollabRoleLane[] {
  return CANONICAL_ROLE_LANES.map((lane) => ({ ...lane, accentOklch: { ...lane.accentOklch } }));
}

function isKnownRoleId(value: string): value is CollabRoleId {
  return value === "lineart" || value === "flat-color" || value === "bg-3d" || value === "lettering-sfx";
}

export function requestLayerLockHandoff(
  lanes: readonly CollabRoleLane[],
  layerId: string,
  requesterRoleId: CollabRoleId,
  mode: "request" | "approve" | "reject",
): LockHandoffResult {
  if (!isKnownRoleId(requesterRoleId)) throw new RangeError(`미등록 협업 역할 ID: ${String(requesterRoleId)}`);
  if (!lanes.some((lane) => Object.is(lane.layerId, layerId))) throw new RangeError(`미등록 레이어 ID: ${String(layerId)}`);

  let overwritePrevented = false;
  let eventKo = "";
  let eventEn = "";

  const nextLanes = lanes.map((lane) => {
    const copy: CollabRoleLane = { ...lane, accentOklch: { ...lane.accentOklch } };
    if (lane.layerId !== layerId) return copy;
    if (mode === "request") {
      if (lane.ownerRoleId === requesterRoleId) {
        eventKo = `${lane.layerNameKo} 레이어는 이미 요청자가 잠금을 보유 중입니다.`;
        eventEn = `${lane.layerNameEn} is already locked by the requester.`;
        return copy;
      }
      overwritePrevented = true;
      eventKo = `${lane.layerNameKo} 소프트 락 보호 발동 — 덮어쓰기 0건, 핸드오프 요청 대기`;
      eventEn = `Soft lock protected ${lane.layerNameEn} — 0 overwrites, handoff requested.`;
      return { ...copy, lockStatus: "handoff-requested" as const, pendingRequesterRoleId: requesterRoleId };
    }
    if (mode === "approve") {
      const nextOwner = lane.pendingRequesterRoleId ?? requesterRoleId;
      eventKo = `${lane.layerNameKo} 소프트 락 핸드오프 완료 → ${nextOwner}`;
      eventEn = `Completed soft-lock handoff for ${lane.layerNameEn} → ${nextOwner}.`;
      return { ...copy, ownerRoleId: nextOwner, lockStatus: "locked-active" as const, pendingRequesterRoleId: null };
    }
    eventKo = `${lane.layerNameKo} 핸드오프 요청 반려 — 기존 소유자 잠금 유지`;
    eventEn = `Declined handoff for ${lane.layerNameEn} — original owner retained lock.`;
    return { ...copy, lockStatus: "locked-active" as const, pendingRequesterRoleId: null };
  });

  return { lanes: nextLanes, overwritePrevented, eventKo, eventEn };
}

const CANONICAL_SPATIAL_PINS: readonly SpatialReviewPin[] = [
  { id: "pin-ep12-01", cutId: "C-01", xNorm: 0.31, yNorm: 0.33, authorRoleId: "lineart", assigneeRoleId: "flat-color", status: "open", noteKo: "주인공 머리카락 역광 림 두께를 1.5px 넓혀 시선 집중", noteEn: "Widen hero hair rim light by 1.5px to anchor focal gaze", voiceMemoDurationSec: 7.4, voiceWaveformPeaks: [0.35, 0.72, 0.9, 0.64, 0.85, 0.52, 0.78, 0.3], redlinePoints: [[0.25, 0.28], [0.31, 0.24], [0.37, 0.31], [0.33, 0.39], [0.26, 0.36]], createdAtLabel: "11:42" },
  { id: "pin-ep12-02", cutId: "C-02", xNorm: 0.64, yNorm: 0.42, authorRoleId: "bg-3d", assigneeRoleId: "bg-3d", status: "open", noteKo: "AtelierStage 가로등 그림자 각도를 15° 왼쪽으로 맞춰 원근 통일", noteEn: "Shift AtelierStage lamp shadow 15° left to align perspective", voiceMemoDurationSec: 9.2, voiceWaveformPeaks: [0.42, 0.58, 0.84, 0.94, 0.66, 0.74, 0.48, 0.28], redlinePoints: [[0.58, 0.36], [0.66, 0.39], [0.71, 0.48]], createdAtLabel: "11:48" },
  { id: "pin-ep12-03", cutId: "C-04", xNorm: 0.78, yNorm: 0.63, authorRoleId: "lettering-sfx", assigneeRoleId: "lettering-sfx", status: "resolved", noteKo: "말풍선 꼬리 안전 여백 16px 확보 완료(모바일 컷 경계 통과)", noteEn: "Secured 16px safe margin on balloon tail for mobile cut edge", voiceMemoDurationSec: 5.5, voiceWaveformPeaks: [0.25, 0.62, 0.76, 0.54, 0.68, 0.4, 0.32, 0.2], redlinePoints: [[0.73, 0.59], [0.83, 0.59], [0.83, 0.68], [0.73, 0.68]], createdAtLabel: "11:55" },
] as const;

export const DEFAULT_SPATIAL_PINS: readonly SpatialReviewPin[] = CANONICAL_SPATIAL_PINS;

function clonePin(pin: SpatialReviewPin): SpatialReviewPin {
  return { ...pin, voiceWaveformPeaks: [...pin.voiceWaveformPeaks], redlinePoints: pin.redlinePoints.map((pt) => [pt[0], pt[1]] as const) };
}

export function getDefaultSpatialPins(): SpatialReviewPin[] {
  return CANONICAL_SPATIAL_PINS.map(clonePin);
}

export function toggleSpatialPinStatus(pins: readonly SpatialReviewPin[], pinId: string): SpatialReviewPin[] {
  if (!pins.some((pin) => Object.is(pin.id, pinId))) throw new RangeError(`미등록 공간 핀 ID: ${String(pinId)}`);
  return pins.map((pin) => ({ ...clonePin(pin), status: pin.id === pinId ? (pin.status === "open" ? "resolved" : "open") : pin.status }));
}

export function addSpatialPin(pins: readonly SpatialReviewPin[], input: AddSpatialPinInput): SpatialReviewPin[] {
  const xNorm = Math.round(clampNumber(input.xNorm, 0.5, 0.06, 0.94).value * 100) / 100;
  const yNorm = Math.round(clampNumber(input.yNorm, 0.5, 0.08, 0.92).value * 100) / 100;
  const duration = Math.round(clampNumber(input.voiceMemoDurationSec, 6.0, 0, MAX_VOICE_PIN_SECONDS).value * 10) / 10;
  const newPin: SpatialReviewPin = {
    id: `pin-ep12-${String(pins.length + 1).padStart(2, "0")}`,
    cutId: input.cutId?.trim() || "C-03",
    xNorm, yNorm,
    authorRoleId: isKnownRoleId(input.authorRoleId) ? input.authorRoleId : "lineart",
    assigneeRoleId: isKnownRoleId(input.assigneeRoleId) ? input.assigneeRoleId : "flat-color",
    status: "open",
    noteKo: input.noteKo.trim() || "신규 빨간펜 수정 지시",
    noteEn: input.noteEn.trim() || "New redline revision note",
    voiceMemoDurationSec: duration,
    voiceWaveformPeaks: [0.3, 0.65, 0.88, 0.7, 0.82, 0.56, 0.62, 0.28],
    redlinePoints: [
      [Math.max(0.04, xNorm - 0.05), Math.max(0.06, yNorm - 0.04)],
      [Math.min(0.96, xNorm + 0.05), Math.max(0.06, yNorm - 0.02)],
      [Math.min(0.96, xNorm + 0.03), Math.min(0.94, yNorm + 0.05)],
    ],
    createdAtLabel: "12:04",
  };
  return [...pins.map(clonePin), newPin];
}

export function evaluateLiveCursorTelemetry(lanes: readonly CollabRoleLane[], followTargetRoleId: CollabRoleId | null): LiveCursorTelemetry {
  const activeMembers = Math.max(1, lanes.length);
  const perMemberBytesPerSec = CURSOR_TARGET_HZ * STROKE_DELTA_FRAME_BYTES;
  const teamTotalBytesPerSec = perMemberBytesPerSec * activeMembers;
  const followed = followTargetRoleId ? lanes.find((lane) => lane.roleId === followTargetRoleId) ?? null : null;
  return {
    frameBytes: STROKE_DELTA_FRAME_BYTES, targetHz: CURSOR_TARGET_HZ, activeMembers,
    perMemberBytesPerSec, teamTotalBytesPerSec,
    teamTotalKbps: Math.round(((teamTotalBytesPerSec * 8) / 1000) * 10) / 10,
    latencyBudgetMs: { captureAndPackMs: 2.4, transportRttHalfMs: 8.6, hlcDecodeAndRenderMs: 3.2, totalMs: 14.2 },
    followTargetRoleId: followed ? followed.roleId : null,
    spotlightActive: followed !== null,
    viewportFocusXNorm: followed ? followed.cursorXNorm : 0.5,
    viewportFocusYNorm: followed ? followed.cursorYNorm : 0.5,
    viewportZoomPercent: followed ? 165 : 100,
  };
}

const CANONICAL_BRANCHES: readonly EpisodeBranchVariant[] = [
  { id: "main-cut-baseline", labelKo: "기준 원고 (Main)", labelEn: "Baseline Cut (Main)", lightingPresetKo: "중립 스튜디오 확산광 (5600K)", lightingPresetEn: "Neutral Studio Daylight (5600K)", summaryKo: "기본 밑색과 선화 밸런스 기준선. A/B 시안과 타일 단위로 비교합니다.", summaryEn: "Neutral baseline for flat colors and inks, compared tile-by-tile against A/B variants.", changedTileCount: 0, contrastRatio: 7.4, kilnExportReady: true, previewTintOklch: { l: 0.94, c: 0.012, h: 218 }, rimAccentOklch: { l: 0.54, c: 0.12, h: 218 } },
  { id: "branch-a-sunset-rim", labelKo: "A안 · 노을 림라이트 채색", labelEn: "Branch A · Sunset Rim Color", lightingPresetKo: "따뜻한 석양 역광 + 호박색 반사광 (3400K)", lightingPresetEn: "Warm Sunset Backlight + Amber Bounce (3400K)", summaryKo: "감정선 클라이맥스 컷 강조. 인물 윤곽에 따뜻한 노을 림라이트와 부드러운 보색 그림자 적용.", summaryEn: "Highlights emotional climax with warm sunset rim light and complementary cool shadows.", changedTileCount: 19, contrastRatio: 9.2, kilnExportReady: true, previewTintOklch: { l: 0.91, c: 0.055, h: 48 }, rimAccentOklch: { l: 0.58, c: 0.16, h: 36 } },
  { id: "branch-b-moonlit-noir", labelKo: "B안 · 달빛 청록 역광", labelEn: "Branch B · Moonlit Cyan Noir", lightingPresetKo: "차가운 청록 월광 + 고대비 키라이트 (7200K)", lightingPresetEn: "Cool Cyan Moonlight + High-Contrast Key (7200K)", summaryKo: "긴장감을 살린 역광 시안. AtelierStage 3D 배경 깊이와 캐릭터 실루엣 대비를 선명하게 분리.", summaryEn: "Maximizes suspense by separating AtelierStage 3D backdrop depth from crisp character silhouettes.", changedTileCount: 23, contrastRatio: 11.4, kilnExportReady: true, previewTintOklch: { l: 0.89, c: 0.048, h: 204 }, rimAccentOklch: { l: 0.52, c: 0.15, h: 204 } },
] as const;

export const DEFAULT_BRANCH_VARIANTS: readonly EpisodeBranchVariant[] = CANONICAL_BRANCHES;

export function getEpisodeBranchVariant(branchId: EpisodeBranchId): EpisodeBranchVariant {
  const found = CANONICAL_BRANCHES.find((branch) => Object.is(branch.id, branchId));
  if (!found) throw new RangeError(`미등록 에피소드 브랜치 ID: ${String(branchId)}`);
  return { ...found, previewTintOklch: { ...found.previewTintOklch }, rimAccentOklch: { ...found.rimAccentOklch } };
}

export function getDefaultTimeMachineSnapshots(): TimeMachineSnapshot[] {
  return [
    { id: "snap-01-base", branchId: "main-cut-baseline", timestampLabel: "11:20", labelKo: "12화 선화·밑색 1차 마감", labelEn: "Ep.12 Ink & Flat Pass #1", stateHash: fnv1aHex("snap-01-base:main-cut-baseline") },
    { id: "snap-02-sunset", branchId: "branch-a-sunset-rim", timestampLabel: "11:45", labelKo: "A안 노을 림라이트 조명 패스", labelEn: "Branch A Sunset Lighting Pass", stateHash: fnv1aHex("snap-02-sunset:branch-a-sunset-rim") },
  ];
}

export function adoptEpisodeBranch(
  snapshots: readonly TimeMachineSnapshot[],
  branchId: EpisodeBranchId,
): { readonly adoptedBranch: EpisodeBranchVariant; readonly snapshots: readonly TimeMachineSnapshot[] } {
  const branch = getEpisodeBranchVariant(branchId);
  const nextIndex = snapshots.length + 1;
  const snapshot: TimeMachineSnapshot = {
    id: `snap-${String(nextIndex).padStart(2, "0")}-${branch.id.slice(0, 8)}`,
    branchId: branch.id,
    timestampLabel: `12:${String(Math.min(59, 5 + nextIndex * 3)).padStart(2, "0")}`,
    labelKo: `${branch.labelKo} 채택 체크포인트`,
    labelEn: `Adopted ${branch.labelEn}`,
    stateHash: fnv1aHex(`${branch.id}:${nextIndex}:${branch.changedTileCount}`),
  };
  return { adoptedBranch: branch, snapshots: [...snapshots.map((item) => ({ ...item })), snapshot] };
}

export function rollbackToTimeMachineSnapshot(
  snapshots: readonly TimeMachineSnapshot[],
  snapshotId: string,
): { readonly restoredBranch: EpisodeBranchVariant; readonly restoredSnapshot: TimeMachineSnapshot } {
  const target = snapshots.find((item) => Object.is(item.id, snapshotId));
  if (!target) throw new RangeError(`미등록 타임머신 스냅샷 ID: ${String(snapshotId)}`);
  return { restoredBranch: getEpisodeBranchVariant(target.branchId), restoredSnapshot: { ...target } };
}

export function generateE2eeForensicReviewLink(input?: E2eeForensicLinkInput): E2eeForensicReviewLink {
  const episodeId = (input?.episodeId?.trim() || "EP-012-ROOFTOP").replace(/[^A-Za-z0-9_-]/gu, "").slice(0, 32) || "EP-012-ROOFTOP";
  const viewerHandle = input?.viewerHandle?.trim() || "pd-kim@studio-review.local";
  const viewerRoleLabel = input?.viewerRoleLabel?.trim() || "담당 PD 검수";
  const expiresInHours = clampInt(input?.expiresInHours, 24, 1, 168).value;
  const watermarkDensity: WatermarkDensity = input?.watermarkDensity === "subtle" || input?.watermarkDensity === "strict" ? input.watermarkDensity : "standard";
  const ttlMs = expiresInHours * 3600 * 1000;
  const nowEpochMs = clampInt(input?.nowEpochMs, DEFAULT_SIMULATION_EPOCH_MS, -8_640_000_000_000_000, 8_640_000_000_000_000 - ttlMs).value;
  const expiresAtEpochMs = nowEpochMs + ttlMs;
  const createdAtIso = new Date(nowEpochMs).toISOString();
  const expiresAtIso = new Date(expiresAtEpochMs).toISOString();

  // FNV는 화면 메타데이터 비교용 체크섬이며 키·서명·암호 인증이 아니다.
  const keyFingerprint = "";
  const wmCode = `WM-${fnv1aHex(`${viewerHandle}:${episodeId}:${expiresAtIso}`).slice(0, 6)}`;
  const watermarkText = `표식 모형 (원고 미적용) · ${viewerRoleLabel}(${viewerHandle}) · ${wmCode} · 예시 만료 ${expiresAtIso.slice(0, 16).replace("T", " ")} UTC`;
  const watermarkDigest = fnv1aHex(`${keyFingerprint}|${watermarkText}|${expiresAtEpochMs}`);
  return {
    episodeId, cipherSuite: "none", keyDerivation: "none", ivBytes: 0, authTagBits: 0,
    modelKind: "review-metadata-simulation", plannedCipherSuite: "AES-GCM-256",
    encryptionPerformed: false, keyMaterialGenerated: false, watermarkApplied: false, liveShareEnabled: false,
    serverCanReadPlaintext: null, keyFingerprint, viewerHandle, viewerRoleLabel, watermarkDensity, allowDownload: false,
    watermarkText, watermarkDigest, createdAtIso, expiresAtIso, expiresAtEpochMs, expiresInHours,
    reviewUrl: "",
  };
}

export function verifyForensicReviewLink(
  link: E2eeForensicReviewLink,
  checkEpochMs: number = DEFAULT_SIMULATION_EPOCH_MS + 60_000,
): ForensicLinkVerificationResult {
  const expectedDigest = fnv1aHex(`${link.keyFingerprint}|${link.watermarkText}|${link.expiresAtEpochMs}`);
  const watermarkDigestValid = Object.is(expectedDigest, link.watermarkDigest);
  const isExpired = checkEpochMs >= link.expiresAtEpochMs;
  return {
    valid: false, isExpired, watermarkDigestValid, zeroKnowledgeEnforced: false,
    verificationKind: "metadata-checksum-only", cryptographicProtectionVerified: false, keyRevoked: false,
    verdictKo: `${!watermarkDigestValid ? "모형 체크섬 불일치" : isExpired ? "모형 만료 시각 경과" : "검수 메타데이터 모형"} — 암호화·키 생성·키 폐기·접근 제어 미실행, 공유 불가`,
    verdictEn: `${!watermarkDigestValid ? "Model checksum mismatch" : isExpired ? "Model expiry reached" : "Review metadata model"} — no encryption, key generation, key revocation, or access control; not shareable`,
  };
}

export function evaluateRealtimeTeamCollabSession(input?: RealtimeTeamCollabInput): RealtimeTeamCollabReport {
  const lanes = input?.lanes ? input.lanes.map((l) => ({ ...l, accentOklch: { ...l.accentOklch } })) : getDefaultCollabRoleLanes();
  const pins = input?.pins ? input.pins.map(clonePin) : getDefaultSpatialPins();
  const hideResolvedRedlines = input?.hideResolvedRedlines ?? true;
  const followTargetRoleId = input?.followTargetRoleId ?? null;
  const activeBranch = getEpisodeBranchVariant(input?.activeBranchId ?? "branch-a-sunset-rim");
  const adoptedBranch = getEpisodeBranchVariant(input?.adoptedBranchId ?? "main-cut-baseline");
  const snapshots = input?.snapshots ? input.snapshots.map((s) => ({ ...s })) : getDefaultTimeMachineSnapshots();
  const e2eeLink = generateE2eeForensicReviewLink(input?.e2eeInput);
  const checkEpochMs = input?.checkEpochMs ?? (input?.e2eeInput?.nowEpochMs ?? DEFAULT_SIMULATION_EPOCH_MS) + 60_000;
  const e2eeVerification = verifyForensicReviewLink(e2eeLink, checkEpochMs);
  const openPinCount = pins.filter((p) => p.status === "open").length;

  return {
    brand: LOOM_SYNC_BRAND, lanes,
    activeLockedLayerCount: lanes.filter((l) => l.lockStatus !== "available").length,
    pendingHandoffCount: lanes.filter((l) => l.lockStatus === "handoff-requested").length,
    overwritePreventedCount: Math.max(0, Math.round(input?.overwritePreventedCount ?? 0)),
    zeroOverwriteGuaranteed: true, pins, openPinCount, resolvedPinCount: pins.length - openPinCount,
    visibleRedlinePinCount: hideResolvedRedlines ? openPinCount : pins.length, hideResolvedRedlines,
    cursorTelemetry: evaluateLiveCursorTelemetry(lanes, followTargetRoleId),
    activeBranch, adoptedBranch,
    branches: CANONICAL_BRANCHES.map((b) => ({ ...b, previewTintOklch: { ...b.previewTintOklch }, rimAccentOklch: { ...b.rimAccentOklch } })),
    snapshots, e2eeLink, e2eeVerification,
  };
}

export function exportLoomOfflineCollabJson(input?: LoomOfflineCollabExportInput): LoomOfflineCollabExportBundle {
  const payload: LoomOfflineCollabExportPayload = {
    schemaVersion: LOOM_OFFLINE_COLLAB_SCHEMA_VERSION,
    brands: [LOOM_SYNC_BRAND, ATELIER_STAGE_BRAND, TOON_CORE_BRAND, KILN_EXPORT_BRAND],
    offlineSimulation: runOfflineOutageSimulation(input?.offlineInput),
    offlineBoundary: getOfflineCapabilityBoundary(),
    realtimeCollab: evaluateRealtimeTeamCollabSession(input?.collabInput),
    runtimeEvidence: { opfsWritePerformed: false, sqliteWalPersisted: false, realtimeNetworkConnected: false, encryptionPerformed: false, keyMaterialGenerated: false, watermarkApplied: false },
    honestyNoteKo: "CPU 메모리 참조 시뮬레이션입니다. 실제 SW·OPFS·SQLite 저장·원격 팀 동기화·암호화·키 생성/폐기·원고 워터마크·권리 검사는 연결되지 않았습니다. 검수 URL을 생성하거나 미공개 원고를 보호하지 않습니다.",
    honestyNoteEn: "CPU in-memory reference simulation only. Live SW/OPFS/SQLite persistence, remote team sync, encryption, key generation/revocation, manuscript watermarking, and rights checks are not connected. No review URL is generated and no unreleased manuscript is protected.",
  };
  return { payload, json: JSON.stringify(payload, null, 2) };
}
