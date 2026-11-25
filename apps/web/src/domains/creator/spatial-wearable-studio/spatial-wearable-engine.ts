/**
 * Wave 46C — 애플 비전 프로·AR 스마트 글래스·스마트 워치·멀티 스크린 공간 창작 생태계 엔진.
 *
 * - 6대 디바이스 노드 역할 카탈로그(`vision-pro-webxr`, `ar-smart-glasses`, `smart-watch-crown`,
 *   `mac-studio-primary`, `tablet-pen-deck`, `phone-reader-mirror`) 및 공개 브라우저 API 지원 범위
 * - 멀티 디바이스 페어링 토폴로지(`computeMultiDeviceTopology`): 역할 충돌 검사 · 지연 예산 추정 · 대역폭 배분
 * - 공간 6DoF 캔버스·레퍼런스 월 배치 솔버(`computeSpatialCanvasRig`): 눈높이·거리·FOV 기반 3D 좌표 및 시선 하향각(0°~-15°) 계산
 * - 워치 크라운·링 제스처 매퍼(`resolveWearableDialAction`) + 비의료 단순 작업 시간 휴식 리마인더(`evaluateSessionBreakReminder`)
 * - AR 스마트 글래스 투시 그리드·마감 타이머 최소 간섭 HUD 프로필(`buildArGlassesHudProfile`) + 세션 설정 JSON 직렬화/복원
 *
 * 순수 함수형 모듈: Web Storage · BigInt 리터럴 · private Map store · 원시 색 코드 미사용.
 */

export const SPATIAL_WEARABLE_SCHEMA_ID = "toonstudio.spatial-wearable-studio.v1" as const;

export type SpatialSimulationDataSourceKind = "estimate";
export type SpatialDeviceId =
  | "vision-pro-webxr" | "ar-smart-glasses" | "smart-watch-crown"
  | "mac-studio-primary" | "tablet-pen-deck" | "phone-reader-mirror";
export type SpatialDeviceFormFactor =
  | "spatial-hmd" | "optical-ar-glasses" | "wearable-wrist-ring"
  | "desktop-workstation" | "pen-tablet" | "mobile-mirror";
export type SpatialDeviceRole =
  | "primary-spatial-canvas" | "ar-hud-overlay" | "wearable-controller"
  | "primary-desktop-canvas" | "pen-sub-canvas" | "reader-mirror-monitor";
export type BrowserCapabilitySupport = "supported" | "partial" | "unsupported";
export type SyncTransportMode = "lan-webrtc" | "usb-tether-hybrid" | "cloud-relay";
export type DeviceChannelKind = "canvas-tiles" | "stroke-vectors" | "hud-telemetry" | "dial-control" | "reader-mirror";
export type TopologyConflictSeverity = "info" | "warn" | "critical";
export type TopologyConflictCode =
  | "empty-topology" | "no-primary-canvas" | "optical-headset-overlap" | "primary-canvas-authority-conflict"
  | "bluetooth-safari-bridge-needed" | "pen-precision-advisory" | "bandwidth-oversubscribed" | "latency-budget-exceeded";
export type LatencyBudgetGrade = "optimal" | "acceptable" | "congested";
export type NeckFlexionStatus = "comfortable" | "caution" | "strain-risk";
export type ShoulderReachStatus = "comfortable" | "too-close" | "extended-reach";
export type VergenceComfortStatus = "comfortable" | "too-close" | "far-detail-caution";
export type WearableDialMode = "brush-size" | "canvas-zoom" | "timeline-scrub" | "undo-redo";
export type WearableGestureKind = "crown-rotate" | "ring-pinch-twist" | "double-tap" | "crown-press";
export type WearableHapticPattern = "micro-tick" | "detent-notch" | "boundary-thud" | "double-confirm" | "none";
export type BreakReminderStatus = "working" | "micro-break-suggested" | "break-due" | "extended-session";
export type WatchBreakHapticCue = "none" | "gentle-pulse" | "two-pulse-reminder";
export type ArHudPresetId = "perspective-grid-minimal" | "pose-silhouette-whisper" | "deadline-focus-only";
export type PerspectiveGridType = "none" | "1-point" | "2-point" | "3-point";
export type ArHudCorner = "top-right" | "top-left" | "bottom-right";
export type ArHudInterferenceGrade = "minimal" | "moderate" | "intrusive";
export type MultiDevicePresetId =
  | "mac-ipad-watch-phone" | "vision-pro-solo" | "tablet-ar-glasses" | "vision-pro-tablet-watch";

export interface SpatialEstimateProvenance {
  readonly dataSourceKind: SpatialSimulationDataSourceKind;
  readonly badgeLabelKo: "시뮬레이션 · 추정"; readonly badgeLabelEn: "Simulated · Estimate";
  readonly noticeKo: string; readonly noticeEn: string;
}
export interface BrowserCapabilityMatrix {
  readonly webXr: BrowserCapabilitySupport; readonly webRtc: BrowserCapabilitySupport;
  readonly webBluetooth: BrowserCapabilitySupport; readonly pointerEvents: BrowserCapabilitySupport;
}
export interface SpatialDeviceNodeSpec {
  readonly id: SpatialDeviceId; readonly role: SpatialDeviceRole; readonly formFactor: SpatialDeviceFormFactor;
  readonly labelKo: string; readonly labelEn: string; readonly shortLabelKo: string; readonly shortLabelEn: string;
  readonly roleLabelKo: string; readonly roleLabelEn: string;
  readonly primaryCanvasCapable: boolean; readonly headMounted: boolean;
  readonly penInputCapable: boolean; readonly spatialCanvasCapable: boolean;
  readonly browserCapabilities: BrowserCapabilityMatrix; readonly channelKind: DeviceChannelKind;
  readonly baseFrameLatencyMs: number; readonly syncOverheadMs: number;
  readonly minBandwidthMbps: number; readonly targetBandwidthMbps: number; readonly bandwidthPriority: number;
  readonly capabilityNoteKo: string; readonly capabilityNoteEn: string;
}
export interface MultiDevicePresetSpec {
  readonly id: MultiDevicePresetId; readonly labelKo: string; readonly labelEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
  readonly deviceIds: readonly SpatialDeviceId[]; readonly recommendedTransport: SyncTransportMode;
}
export interface TopologyConflict {
  readonly code: TopologyConflictCode; readonly severity: TopologyConflictSeverity;
  readonly deviceIds: readonly SpatialDeviceId[];
  readonly titleKo: string; readonly titleEn: string; readonly detailKo: string; readonly detailEn: string;
  readonly recommendationKo: string; readonly recommendationEn: string;
}
export interface BandwidthAllocation {
  readonly deviceId: SpatialDeviceId; readonly dataSourceKind: SpatialSimulationDataSourceKind;
  readonly channelKind: DeviceChannelKind; readonly minBandwidthMbps: number; readonly targetBandwidthMbps: number;
  readonly allocatedBandwidthMbps: number; readonly bandwidthSharePct: number; readonly underMinimum: boolean;
}
export interface TopologyLink {
  readonly sourceId: SpatialDeviceId; readonly targetId: SpatialDeviceId; readonly transport: SyncTransportMode;
  readonly channelKind: DeviceChannelKind; readonly dataSourceKind: SpatialSimulationDataSourceKind;
  readonly estimatedRttMs: number; readonly allocatedBandwidthMbps: number;
}
export interface LatencyBudgetEstimate {
  readonly dataSourceKind: SpatialSimulationDataSourceKind;
  readonly captureAndEncodeMs: number; readonly networkTransportMs: number; readonly decodeAndCompositeMs: number;
  readonly totalEndToEndMs: number; readonly targetStrokeBudgetMs: number; readonly grade: LatencyBudgetGrade;
}
export interface ComputeMultiDeviceTopologyOptions {
  readonly activeDeviceIds: readonly SpatialDeviceId[];
  readonly availableLinkBandwidthMbps?: number; readonly syncTransportMode?: SyncTransportMode;
}
export interface MultiDeviceTopologyResult {
  readonly dataSourceKind: SpatialSimulationDataSourceKind; readonly provenance: SpatialEstimateProvenance;
  readonly activeDeviceIds: readonly SpatialDeviceId[]; readonly activeDevices: readonly SpatialDeviceNodeSpec[];
  readonly syncTransportMode: SyncTransportMode; readonly availableLinkBandwidthMbps: number;
  readonly hubDeviceId: SpatialDeviceId | null; readonly primaryCanvasDeviceId: SpatialDeviceId | null;
  readonly links: readonly TopologyLink[]; readonly bandwidthAllocations: readonly BandwidthAllocation[];
  readonly totalTargetBandwidthMbps: number; readonly totalAllocatedBandwidthMbps: number;
  readonly bandwidthUtilizationPct: number; readonly bandwidthHeadroomMbps: number;
  readonly latencyBudget: LatencyBudgetEstimate; readonly conflicts: readonly TopologyConflict[];
  readonly criticalConflictCount: number; readonly warningConflictCount: number; readonly healthScore: number;
}

export interface Vec3Meters { readonly x: number; readonly y: number; readonly z: number; }
export interface EulerDegrees { readonly pitch: number; readonly yaw: number; readonly roll: number; }
export interface SpatialCanvasRigInput {
  readonly eyeHeightM?: number; readonly viewingDistanceM?: number; readonly horizontalFovDeg?: number;
  readonly verticalFovDeg?: number; readonly gazePitchDeg?: number; readonly panelCurvatureDeg?: number;
}
export type NormalizedSpatialRigInput = Readonly<Required<SpatialCanvasRigInput>>;
export interface SpatialMainCutPanelPlacement {
  readonly id: "main-cut-panel"; readonly positionM: Vec3Meters; readonly rotationDeg: EulerDegrees;
  readonly widthM: number; readonly heightM: number; readonly curvatureDeg: number;
  readonly curvatureRadiusM: number | null; readonly sagittaM: number; readonly distanceM: number;
  readonly angularWidthDeg: number; readonly angularHeightDeg: number;
}
export interface SpatialReferenceBoardPlacement {
  readonly id: "left-reference-board"; readonly positionM: Vec3Meters; readonly rotationDeg: EulerDegrees;
  readonly widthM: number; readonly heightM: number; readonly distanceM: number; readonly yawFromCenterDeg: number;
}
export interface SpatialPoseStagePlacement {
  readonly id: "right-pose-stage"; readonly positionM: Vec3Meters; readonly rotationDeg: EulerDegrees;
  readonly widthM: number; readonly heightM: number; readonly depthM: number;
  readonly distanceM: number; readonly yawFromCenterDeg: number;
}
export interface SpatialErgonomicsAssessment {
  readonly dataSourceKind: SpatialSimulationDataSourceKind; readonly gazeDownwardAngleDeg: number;
  readonly comfortableGazeMinDeg: -15; readonly comfortableGazeMaxDeg: 0;
  readonly isWithinComfortableGazeBand: boolean; readonly neckFlexionStatus: NeckFlexionStatus;
  readonly horizontalHeadSweepDeg: number; readonly shoulderReachStatus: ShoulderReachStatus;
  readonly vergenceComfortStatus: VergenceComfortStatus; readonly ergonomicsScore: number;
  readonly summaryKo: string; readonly summaryEn: string;
  readonly recommendationsKo: readonly string[]; readonly recommendationsEn: readonly string[];
}
export interface SpatialCanvasRigResult {
  readonly dataSourceKind: SpatialSimulationDataSourceKind; readonly provenance: SpatialEstimateProvenance;
  readonly input: NormalizedSpatialRigInput; readonly userEyeOriginM: Vec3Meters;
  readonly mainCutPanel: SpatialMainCutPanelPlacement; readonly leftReferenceBoard: SpatialReferenceBoardPlacement;
  readonly rightPoseStage: SpatialPoseStagePlacement; readonly ergonomics: SpatialErgonomicsAssessment;
}

export interface WearableStudioControlState {
  readonly brushSizePx: number; readonly canvasZoomPct: number;
  readonly timelineFrame: number; readonly timelineMaxFrames: number;
  readonly historyIndex: number; readonly historyMaxIndex: number;
}
export interface WearableDialActionInput {
  readonly mode: WearableDialMode; readonly gesture: WearableGestureKind;
  readonly detentDelta?: number; readonly precisionModifier?: boolean; readonly state: WearableStudioControlState;
}
export interface WearableDialActionResult {
  readonly mode: WearableDialMode; readonly nextMode: WearableDialMode; readonly gesture: WearableGestureKind;
  readonly detentDelta: number; readonly commandId: string;
  readonly previousValue: number; readonly nextValue: number; readonly unit: "px" | "%" | "frame" | "step";
  readonly clamped: boolean; readonly hapticPattern: WearableHapticPattern;
  readonly nextState: WearableStudioControlState; readonly summaryKo: string; readonly summaryEn: string;
}
export interface SessionBreakReminderInput {
  readonly elapsedWorkMinutes: number; readonly breakIntervalMinutes?: number;
  readonly microStretchIntervalMinutes?: number; readonly hapticNudgeEnabled?: boolean; readonly wearingHmd?: boolean;
}
export interface SessionBreakReminderResult {
  readonly dataSourceKind: SpatialSimulationDataSourceKind; readonly isMedicalAdvice: false;
  readonly disclaimerKo: string; readonly disclaimerEn: string;
  readonly status: BreakReminderStatus; readonly elapsedWorkMinutes: number;
  readonly effectiveBreakIntervalMinutes: number; readonly microStretchIntervalMinutes: number;
  readonly minutesUntilNextBreak: number; readonly recommendedRestMinutes: number;
  readonly watchHapticCue: WatchBreakHapticCue; readonly messageKo: string; readonly messageEn: string;
}
export interface ArHudPresetSpec {
  readonly id: ArHudPresetId; readonly labelKo: string; readonly labelEn: string;
  readonly defaultGridType: PerspectiveGridType; readonly defaultGridOpacityPct: number;
  readonly showPoseOverlay: boolean; readonly showDeadlineTimer: boolean;
  readonly summaryKo: string; readonly summaryEn: string;
}
export interface ArGlassesHudOptions {
  readonly presetId?: ArHudPresetId; readonly perspectiveGridType?: PerspectiveGridType;
  readonly gridOpacityPct?: number; readonly showDeadlineTimer?: boolean;
  readonly deadlineRemainingMinutes?: number; readonly peripheralCorner?: ArHudCorner;
}
export interface ArHudOverlayElement {
  readonly id: "perspective-grid" | "pose-silhouette" | "deadline-timer";
  readonly labelKo: string; readonly labelEn: string;
  readonly placementZone: "peripheral-frame" | "right-peripheral" | ArHudCorner;
  readonly estimatedOcclusionPct: number;
}
export interface ArGlassesHudProfile {
  readonly dataSourceKind: SpatialSimulationDataSourceKind; readonly presetId: ArHudPresetId;
  readonly perspectiveGridType: PerspectiveGridType; readonly gridOpacityPct: number;
  readonly showPoseOverlay: boolean; readonly showDeadlineTimer: boolean; readonly deadlineRemainingMinutes: number;
  readonly peripheralCorner: ArHudCorner; readonly estimatedFovOcclusionPct: number;
  readonly interferenceGrade: ArHudInterferenceGrade; readonly centerSafeZoneClear: boolean;
  readonly hudElements: readonly ArHudOverlayElement[]; readonly noteKo: string; readonly noteEn: string;
}
export interface SpatialWearableSessionSnapshot {
  readonly activeDeviceIds: readonly SpatialDeviceId[]; readonly syncTransportMode: SyncTransportMode;
  readonly availableLinkBandwidthMbps: number; readonly spatialRigInput: NormalizedSpatialRigInput;
  readonly wearableMode: WearableDialMode; readonly wearableState: WearableStudioControlState;
  readonly elapsedWorkMinutes: number; readonly breakIntervalMinutes: number;
  readonly hapticNudgeEnabled: boolean; readonly arHudOptions: Required<ArGlassesHudOptions>;
}
export type ParseSpatialWearableSessionResult =
  | { readonly ok: true; readonly config: SpatialWearableSessionSnapshot }
  | { readonly ok: false; readonly errorCode: "invalid-json" | "invalid-schema" | "invalid-fields"; readonly messageKo: string; readonly messageEn: string };

export const NON_MEDICAL_BREAK_DISCLAIMER_KO = "비의료 단순 작업 시간 타이머 알림입니다. 생체 측정이나 의학적 피로 진단이 아닙니다.";
export const NON_MEDICAL_BREAK_DISCLAIMER_EN = "Non-medical elapsed work-time reminder only. Not biometric monitoring or medical diagnosis.";
export const SPATIAL_ESTIMATE_PROVENANCE: SpatialEstimateProvenance = {
  dataSourceKind: "estimate", badgeLabelKo: "시뮬레이션 · 추정", badgeLabelEn: "Simulated · Estimate",
  noticeKo: "지연 시간·대역폭·공간 6DoF 좌표·시야 점유율은 공개 웹 표준(WebXR·WebRTC·WebBluetooth·PointerEvents) 기준 시뮬레이션 추정치이며 실기기 계측값이 아닙니다.",
  noticeEn: "Latency, bandwidth, 6DoF coordinates, and HUD occlusion are simulation estimates modeled on public web APIs, not hardware benchmarks.",
};
export const COMFORTABLE_GAZE_MIN_DEG = -15 as const;
export const COMFORTABLE_GAZE_MAX_DEG = 0 as const;
export const TARGET_STROKE_LATENCY_BUDGET_MS = 28;
export const DEFAULT_LINK_BANDWIDTH_MBPS = 120;

export const SPATIAL_DEVICE_IDS: readonly SpatialDeviceId[] = [
  "vision-pro-webxr", "ar-smart-glasses", "smart-watch-crown",
  "mac-studio-primary", "tablet-pen-deck", "phone-reader-mirror",
];

export const SPATIAL_DEVICE_CATALOG: readonly SpatialDeviceNodeSpec[] = [
  { id: "vision-pro-webxr", role: "primary-spatial-canvas", formFactor: "spatial-hmd", labelKo: "애플 비전 프로 (WebXR 공간 캔버스)", labelEn: "Apple Vision Pro (WebXR Spatial Canvas)", shortLabelKo: "비전 프로", shortLabelEn: "Vision Pro", roleLabelKo: "WebXR 공간 캔버스", roleLabelEn: "WebXR Spatial Canvas", primaryCanvasCapable: true, headMounted: true, penInputCapable: false, spatialCanvasCapable: true, browserCapabilities: { webXr: "supported", webRtc: "supported", webBluetooth: "unsupported", pointerEvents: "supported" }, channelKind: "canvas-tiles", baseFrameLatencyMs: 11, syncOverheadMs: 8, minBandwidthMbps: 18, targetBandwidthMbps: 42, bandwidthPriority: 5, capabilityNoteKo: "visionOS Safari는 WebXR·WebRTC·시선 핀치 PointerEvents를 지원하며 WebBluetooth는 컴패니언 브리지가 필요합니다.", capabilityNoteEn: "visionOS Safari supports WebXR, WebRTC, and transient PointerEvents; WebBluetooth requires a companion bridge." },
  { id: "ar-smart-glasses", role: "ar-hud-overlay", formFactor: "optical-ar-glasses", labelKo: "AR 스마트 글래스 (투시·포즈 오버레이)", labelEn: "AR Smart Glasses (Perspective & Pose HUD)", shortLabelKo: "스마트 글래스", shortLabelEn: "AR Glasses", roleLabelKo: "핸즈프리 투시/포즈 HUD", roleLabelEn: "Hands-Free AR HUD", primaryCanvasCapable: false, headMounted: true, penInputCapable: false, spatialCanvasCapable: true, browserCapabilities: { webXr: "partial", webRtc: "supported", webBluetooth: "partial", pointerEvents: "partial" }, channelKind: "hud-telemetry", baseFrameLatencyMs: 14, syncOverheadMs: 9, minBandwidthMbps: 4, targetBandwidthMbps: 12, bandwidthPriority: 3, capabilityNoteKo: "XR 지원 브라우저에서 투시 가이드·마감 타이머 최소 간섭 HUD를 표시하며 일부 기기는 호스트 미러링으로 동작합니다.", capabilityNoteEn: "Renders minimal perspective guides and deadline timers on XR browsers or tethered host displays." },
  { id: "smart-watch-crown", role: "wearable-controller", formFactor: "wearable-wrist-ring", labelKo: "스마트 워치 · 링 (크라운 다이얼·휴식 알림)", labelEn: "Smart Watch / Ring (Crown Dial & Break Cue)", shortLabelKo: "스마트 워치", shortLabelEn: "Smart Watch", roleLabelKo: "크라운 다이얼 · 작업 시간 알림", roleLabelEn: "Crown Dial & Break Cue", primaryCanvasCapable: false, headMounted: false, penInputCapable: false, spatialCanvasCapable: false, browserCapabilities: { webXr: "unsupported", webRtc: "partial", webBluetooth: "supported", pointerEvents: "partial" }, channelKind: "dial-control", baseFrameLatencyMs: 6, syncOverheadMs: 10, minBandwidthMbps: 0.2, targetBandwidthMbps: 0.8, bandwidthPriority: 4, capabilityNoteKo: "Chromium 호스트에서는 BLE GATT 직접 연동, Safari 계열에서는 WebRTC 컴패니언 릴레이로 크라운·링 입력을 전달합니다.", capabilityNoteEn: "Uses BLE GATT on Chromium hosts or a WebRTC companion bridge on Safari to forward crown and ring gestures." },
  { id: "mac-studio-primary", role: "primary-desktop-canvas", formFactor: "desktop-workstation", labelKo: "맥 스튜디오 · 맥북 (메인 원고 캔버스)", labelEn: "Mac Studio / MacBook (Primary Canvas Hub)", shortLabelKo: "맥 메인 캔버스", shortLabelEn: "Mac Primary", roleLabelKo: "메인 원고 캔버스 · 허브", roleLabelEn: "Primary Canvas & Hub", primaryCanvasCapable: true, headMounted: false, penInputCapable: false, spatialCanvasCapable: false, browserCapabilities: { webXr: "partial", webRtc: "supported", webBluetooth: "partial", pointerEvents: "supported" }, channelKind: "canvas-tiles", baseFrameLatencyMs: 8, syncOverheadMs: 3, minBandwidthMbps: 10, targetBandwidthMbps: 28, bandwidthPriority: 5, capabilityNoteKo: "고해상도 원고 합성과 로컬 WebRTC 허브 역할을 맡으며 Chromium 계열 브라우저에서 WebBluetooth를 함께 지원합니다.", capabilityNoteEn: "Acts as high-resolution canvas hub and WebRTC coordinator, with WebBluetooth available in Chromium browsers." },
  { id: "tablet-pen-deck", role: "pen-sub-canvas", formFactor: "pen-tablet", labelKo: "아이패드 · 갤럭시 탭 (펜 서브 캔버스)", labelEn: "iPad / Galaxy Tab (Pen Sub-Canvas Deck)", shortLabelKo: "펜 태블릿", shortLabelEn: "Pen Tablet", roleLabelKo: "필압 펜 입력 · 서브 캔버스", roleLabelEn: "Pen Input Sub-Canvas", primaryCanvasCapable: true, headMounted: false, penInputCapable: true, spatialCanvasCapable: false, browserCapabilities: { webXr: "unsupported", webRtc: "supported", webBluetooth: "partial", pointerEvents: "supported" }, channelKind: "stroke-vectors", baseFrameLatencyMs: 8, syncOverheadMs: 6, minBandwidthMbps: 6, targetBandwidthMbps: 16, bandwidthPriority: 5, capabilityNoteKo: "PointerEvents 필압·기울기·coalesced 샘플을 수집해 메인 허브로 전송하거나 단독 원고 캔버스로 동작합니다.", capabilityNoteEn: "Captures PointerEvents pressure/tilt strokes for host sync or runs standalone as a primary pen canvas." },
  { id: "phone-reader-mirror", role: "reader-mirror-monitor", formFactor: "mobile-mirror", labelKo: "스마트폰 (9:16 실시간 독자 미러)", labelEn: "Smartphone (9:16 Live Reader Mirror)", shortLabelKo: "폰 9:16 미러", shortLabelEn: "Phone Mirror", roleLabelKo: "9:16 실시간 독자 뷰어 미러", roleLabelEn: "9:16 Live Reader Mirror", primaryCanvasCapable: false, headMounted: false, penInputCapable: false, spatialCanvasCapable: false, browserCapabilities: { webXr: "partial", webRtc: "supported", webBluetooth: "partial", pointerEvents: "supported" }, channelKind: "reader-mirror", baseFrameLatencyMs: 12, syncOverheadMs: 7, minBandwidthMbps: 3, targetBandwidthMbps: 9, bandwidthPriority: 2, capabilityNoteKo: "WebRTC 저지연 미러로 실제 독자 스마트폰 화면 비율(9:16)의 말풍선 크기와 스크롤 호흡을 즉시 확인합니다.", capabilityNoteEn: "Mirrors the active episode in 9:16 over WebRTC to check bubble readability and vertical pacing in real time." },
];

export const MULTI_DEVICE_PRESETS: readonly MultiDevicePresetSpec[] = [
  { id: "mac-ipad-watch-phone", labelKo: "맥 + 아이패드 + 워치 + 폰", labelEn: "Mac + iPad + Watch + Phone", summaryKo: "메인 캔버스 + 펜 입력 데크 + 손목 다이얼 + 9:16 독자 미러 4종 표준 화실", summaryEn: "Primary Mac canvas + pen tablet deck + watch dial + 9:16 reader mirror", deviceIds: ["mac-studio-primary", "tablet-pen-deck", "smart-watch-crown", "phone-reader-mirror"], recommendedTransport: "lan-webrtc" },
  { id: "vision-pro-solo", labelKo: "비전 프로 단독", labelEn: "Vision Pro Solo", summaryKo: "WebXR 6DoF 곡면 메인 컷·레퍼런스 보드·3D 포즈 스테이지 단독 공간 작업", summaryEn: "Standalone WebXR 6DoF curved cut wall, reference board, and 3D pose stage", deviceIds: ["vision-pro-webxr"], recommendedTransport: "lan-webrtc" },
  { id: "tablet-ar-glasses", labelKo: "갤럭시 탭 + 스마트 글래스", labelEn: "Galaxy Tab + AR Glasses", summaryKo: "태블릿 펜 드로잉 + 핸즈프리 투시 그리드·마감 타이머 경량 이동형 조합", summaryEn: "Portable pen tablet drawing paired with minimal hands-free AR perspective HUD", deviceIds: ["tablet-pen-deck", "ar-smart-glasses"], recommendedTransport: "usb-tether-hybrid" },
  { id: "vision-pro-tablet-watch", labelKo: "비전 프로 + 펜 태블릿 + 워치", labelEn: "Vision Pro + Pen Tablet + Watch", summaryKo: "공간 대형 레퍼런스 월과 정밀 필압 선화·손목 크라운 조작 하이브리드", summaryEn: "Spatial reference wall combined with precision stylus deck and wrist dial", deviceIds: ["vision-pro-webxr", "tablet-pen-deck", "smart-watch-crown"], recommendedTransport: "lan-webrtc" },
];

export const WEARABLE_DIAL_MODES: readonly WearableDialMode[] = ["brush-size", "canvas-zoom", "timeline-scrub", "undo-redo"];
export const DEFAULT_WEARABLE_CONTROL_STATE: WearableStudioControlState = { brushSizePx: 18, canvasZoomPct: 100, timelineFrame: 12, timelineMaxFrames: 120, historyIndex: 24, historyMaxIndex: 40 };
export const AR_HUD_PRESETS: readonly ArHudPresetSpec[] = [
  { id: "perspective-grid-minimal", labelKo: "투시 그리드 최소 간섭", labelEn: "Minimal Perspective Grid", defaultGridType: "2-point", defaultGridOpacityPct: 18, showPoseOverlay: false, showDeadlineTimer: true, summaryKo: "외곽 2점 투시 안내선과 우측 상단 마감 타이머만 얇게 띄워 중앙 시야를 확보합니다.", summaryEn: "Projects subtle peripheral 2-point guide lines and a compact corner deadline timer." },
  { id: "pose-silhouette-whisper", labelKo: "포즈 실루엣 오버레이", labelEn: "Pose Silhouette Whisper", defaultGridType: "1-point", defaultGridOpacityPct: 14, showPoseOverlay: true, showDeadlineTimer: true, summaryKo: "우측 주변 시야에 3D 포즈 실루엣 윤곽을 투사하고 중앙 드로잉 시야는 비워 둡니다.", summaryEn: "Places a light 3D pose silhouette in the peripheral band while keeping central gaze clear." },
  { id: "deadline-focus-only", labelKo: "마감 타이머 초저간섭", labelEn: "Deadline Focus Only", defaultGridType: "none", defaultGridOpacityPct: 10, showPoseOverlay: false, showDeadlineTimer: true, summaryKo: "그리드·포즈를 끄고 가장자리 마감 타이머만 유지해 시야 점유율을 최소화합니다.", summaryEn: "Keeps only the corner deadline counter visible for minimum visual obstruction." },
];
export const DEFAULT_SPATIAL_RIG_INPUT: NormalizedSpatialRigInput = { eyeHeightM: 1.22, viewingDistanceM: 1.35, horizontalFovDeg: 95, verticalFovDeg: 70, gazePitchDeg: -8, panelCurvatureDeg: 24 };

function clamp(v: number, min: number, max: number): number { return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min; }
function round1(v: number): number { return Math.round(v * 10) / 10; }
function round2(v: number): number { return Math.round(v * 100) / 100; }
function round3(v: number): number { return Math.round(v * 1000) / 1000; }
function degToRad(deg: number): number { return (deg * Math.PI) / 180; }
function readClampedNum(obj: Record<string, unknown>, key: string, fallback: number, min: number, max: number): number {
  return clamp(typeof obj[key] === "number" ? obj[key] : fallback, min, max);
}
function addConflict(
  list: TopologyConflict[], code: TopologyConflictCode, severity: TopologyConflictSeverity, deviceIds: readonly SpatialDeviceId[],
  titleKo: string, titleEn: string, detailKo: string, detailEn: string, recommendationKo: string, recommendationEn: string,
): void {
  list.push({ code, severity, deviceIds, titleKo, titleEn, detailKo, detailEn, recommendationKo, recommendationEn });
}

export function isSpatialDeviceId(value: unknown): value is SpatialDeviceId {
  return typeof value === "string" && SPATIAL_DEVICE_IDS.includes(value as SpatialDeviceId);
}
export function getSpatialDeviceSpec(id: SpatialDeviceId): SpatialDeviceNodeSpec {
  return SPATIAL_DEVICE_CATALOG.find((item) => item.id === id) ?? SPATIAL_DEVICE_CATALOG[0];
}
export function getMultiDevicePreset(id: MultiDevicePresetId): MultiDevicePresetSpec {
  return MULTI_DEVICE_PRESETS.find((item) => item.id === id) ?? MULTI_DEVICE_PRESETS[0];
}
export function getArHudPreset(id: ArHudPresetId): ArHudPresetSpec {
  return AR_HUD_PRESETS.find((item) => item.id === id) ?? AR_HUD_PRESETS[0];
}

/** 멀티 디바이스 페어링 토폴로지: 역할 충돌 검사 · 지연 예산 추정 · 우선순위 대역폭 배분. */
export function computeMultiDeviceTopology(options: ComputeMultiDeviceTopologyOptions): MultiDeviceTopologyResult {
  const availableLinkBandwidthMbps = round1(clamp(options.availableLinkBandwidthMbps ?? DEFAULT_LINK_BANDWIDTH_MBPS, 5, 2000));
  const syncTransportMode: SyncTransportMode = options.syncTransportMode ?? "lan-webrtc";
  const uniqueSet = new Set<SpatialDeviceId>();
  for (const id of options.activeDeviceIds) { if (isSpatialDeviceId(id)) uniqueSet.add(id); }
  const activeDeviceIds = SPATIAL_DEVICE_IDS.filter((id) => uniqueSet.has(id));
  const activeDevices = activeDeviceIds.map((id) => getSpatialDeviceSpec(id));

  const hasVisionPro = uniqueSet.has("vision-pro-webxr");
  const hasArGlasses = uniqueSet.has("ar-smart-glasses");
  const hasWatch = uniqueSet.has("smart-watch-crown");
  const hasMac = uniqueSet.has("mac-studio-primary");
  const hasTablet = uniqueSet.has("tablet-pen-deck");

  const primaryCanvasDeviceId: SpatialDeviceId | null = hasMac ? "mac-studio-primary" : hasVisionPro ? "vision-pro-webxr" : hasTablet ? "tablet-pen-deck" : null;
  const hubDeviceId: SpatialDeviceId | null = primaryCanvasDeviceId ?? activeDeviceIds[0] ?? null;

  const totalMinBw = activeDevices.reduce((s, d) => s + d.minBandwidthMbps, 0);
  const totalTargetBw = round1(activeDevices.reduce((s, d) => s + d.targetBandwidthMbps, 0));
  const remainingPool = Math.max(0, availableLinkBandwidthMbps - totalMinBw);
  const weightedDemand = activeDevices.reduce((s, d) => s + Math.max(0, d.targetBandwidthMbps - d.minBandwidthMbps) * d.bandwidthPriority, 0);

  const bandwidthAllocations: BandwidthAllocation[] = activeDevices.map((dev) => {
    let allocated: number;
    let underMinimum = false;
    if (totalMinBw > availableLinkBandwidthMbps) {
      allocated = round2(dev.minBandwidthMbps * (availableLinkBandwidthMbps / totalMinBw));
      underMinimum = true;
    } else if (totalTargetBw <= availableLinkBandwidthMbps) {
      allocated = round2(dev.targetBandwidthMbps);
    } else {
      const extra = Math.max(0, dev.targetBandwidthMbps - dev.minBandwidthMbps);
      allocated = round2(Math.min(dev.targetBandwidthMbps, dev.minBandwidthMbps + (weightedDemand > 0 ? remainingPool * ((extra * dev.bandwidthPriority) / weightedDemand) : 0)));
    }
    return {
      deviceId: dev.id, dataSourceKind: "estimate", channelKind: dev.channelKind,
      minBandwidthMbps: dev.minBandwidthMbps, targetBandwidthMbps: dev.targetBandwidthMbps,
      allocatedBandwidthMbps: allocated, bandwidthSharePct: round1((allocated / availableLinkBandwidthMbps) * 100), underMinimum,
    };
  });

  const totalAllocatedBandwidthMbps = round1(bandwidthAllocations.reduce((s, a) => s + a.allocatedBandwidthMbps, 0));
  const bandwidthUtilizationPct = round1((totalAllocatedBandwidthMbps / availableLinkBandwidthMbps) * 100);
  const bandwidthHeadroomMbps = round1(Math.max(0, availableLinkBandwidthMbps - totalAllocatedBandwidthMbps));

  const transportMult = syncTransportMode === "usb-tether-hybrid" ? 0.55 : syncTransportMode === "cloud-relay" ? 2.35 : 1;
  const baseNetMs = syncTransportMode === "usb-tether-hybrid" ? 2 : syncTransportMode === "cloud-relay" ? 19 : 5;
  const peerDevices = hubDeviceId ? activeDevices.filter((d) => d.id !== hubDeviceId) : [];
  const links: TopologyLink[] = peerDevices.map((peer) => {
    const alloc = bandwidthAllocations.find((item) => item.deviceId === peer.id);
    const penalty = alloc?.underMinimum ? 14 : totalTargetBw > availableLinkBandwidthMbps ? 5 : 0;
    return {
      sourceId: hubDeviceId as SpatialDeviceId, targetId: peer.id, transport: syncTransportMode,
      channelKind: peer.channelKind, dataSourceKind: "estimate",
      estimatedRttMs: round1((baseNetMs + peer.syncOverheadMs) * transportMult + penalty),
      allocatedBandwidthMbps: alloc?.allocatedBandwidthMbps ?? 0,
    };
  });

  const maxPeerSyncMs = peerDevices.reduce((m, d) => Math.max(m, d.syncOverheadMs), 0);
  const maxFrameMs = activeDevices.reduce((m, d) => Math.max(m, d.baseFrameLatencyMs), 0);
  const congestionMs = totalMinBw > availableLinkBandwidthMbps ? 16 : totalTargetBw > availableLinkBandwidthMbps ? 6 : 0;
  const captureAndEncodeMs = activeDevices.length === 0 ? 0 : round1(Math.max(4, maxFrameMs * 0.45));
  const networkTransportMs = peerDevices.length === 0 ? 0 : round1((baseNetMs + maxPeerSyncMs * 0.7) * transportMult + congestionMs);
  const decodeAndCompositeMs = activeDevices.length === 0 ? 0 : round1(Math.max(4, maxFrameMs * 0.5));
  const totalEndToEndMs = round1(captureAndEncodeMs + networkTransportMs + decodeAndCompositeMs);
  const latencyGrade: LatencyBudgetGrade = totalEndToEndMs <= TARGET_STROKE_LATENCY_BUDGET_MS ? "optimal" : totalEndToEndMs <= 45 ? "acceptable" : "congested";

  const conflicts: TopologyConflict[] = [];
  if (activeDevices.length === 0) {
    addConflict(conflicts, "empty-topology", "critical", [], "선택된 디바이스가 없습니다", "No active devices selected",
      "최소 1대 이상의 메인 캔버스 기기(맥·비전 프로·펜 태블릿)를 활성화해야 합니다.", "Enable at least one primary canvas device (Mac, Vision Pro, or Pen Tablet).",
      "프리셋에서 작업 조합을 고르거나 메인 캔버스 노드를 켜세요.", "Pick a preset or enable a primary canvas device.");
  } else if (primaryCanvasDeviceId === null) {
    addConflict(conflicts, "no-primary-canvas", "critical", activeDeviceIds, "메인 캔버스 권한 기기가 없습니다", "Missing primary canvas host",
      "보조 기기(워치·폰 미러·스마트 글래스)만 활성화되어 원고 캔버스를 호스팅할 노드가 없습니다.", "Only companion devices are active without a primary canvas host.",
      "맥 메인 캔버스, 비전 프로, 또는 펜 태블릿 중 1대 이상을 켜세요.", "Enable Mac Primary, Vision Pro, or Pen Tablet as the canvas host.");
  }
  if (hasVisionPro && hasArGlasses) {
    addConflict(conflicts, "optical-headset-overlap", "critical", ["vision-pro-webxr", "ar-smart-glasses"], "두부 착용 디스플레이 역할 충돌", "Head-mounted display overlap",
      "애플 비전 프로와 AR 스마트 글래스는 동시에 착용할 수 없는 두부 디스플레이 노드입니다.", "Apple Vision Pro and AR Smart Glasses cannot be worn simultaneously.",
      "공간 작업에는 비전 프로만, 이동형 투시 HUD에는 스마트 글래스만 선택하세요.", "Keep either Vision Pro for spatial immersion or AR Glasses for light HUD.");
  }
  if (hasVisionPro && hasMac) {
    addConflict(conflicts, "primary-canvas-authority-conflict", "warn", ["mac-studio-primary", "vision-pro-webxr"], "메인 캔버스 권한 이중 배치 주의", "Dual primary canvas authority",
      "맥과 비전 프로가 모두 메인 캔버스 후보입니다. 맥을 허브, 비전 프로를 공간 뷰포트로 우선 배정했습니다.", "Both Mac and Vision Pro can host the primary canvas; Mac is pinned as hub and Vision Pro as spatial viewport.",
      "지연과 대역폭을 줄이려면 비전 프로 단독 또는 맥+태블릿으로 분리하세요.", "Split into Vision Pro solo or Mac + Tablet for tighter latency.");
  }
  if (hasWatch && hasVisionPro && !hasMac) {
    addConflict(conflicts, "bluetooth-safari-bridge-needed", "info", ["smart-watch-crown", "vision-pro-webxr"], "WebBluetooth 미지원 → 컴패니언 릴레이 적용", "WebBluetooth unavailable on visionOS — companion bridge required",
      "visionOS Safari는 WebBluetooth를 지원하지 않아 워치 크라운 입력이 WebRTC 컴패니언 채널로 우회 추정됩니다.", "visionOS Safari lacks WebBluetooth, routing watch crown gestures through a WebRTC companion bridge.",
      "WebRTC 컴패니언 브리지를 유지하거나 Chromium 호스트를 함께 사용하세요.", "Keep the WebRTC companion relay active or pair with a Chromium host.");
  }
  if (hasVisionPro && !hasTablet && !hasMac) {
    addConflict(conflicts, "pen-precision-advisory", "info", ["vision-pro-webxr"], "정밀 펜선 작업 시 펜 태블릿 페어링 권장", "Pen tablet recommended for fine lineart",
      "비전 프로 단독 모드는 콘티·구도·3D 포즈 검토에 적합하며 정밀 필압 선화는 태블릿 데크와 함께 쓸 때 안정적입니다.", "Vision Pro solo excels at layout and 3D posing; pair a pen tablet for precision inking.",
      "선화 단계에서는 아이패드/갤럭시 탭 펜 데크를 켜세요.", "Enable Pen Tablet when moving to final inking.");
  }
  if (totalMinBw > availableLinkBandwidthMbps) {
    addConflict(conflicts, "bandwidth-oversubscribed", "critical", activeDeviceIds, "가용 대역폭이 최소 요구량보다 부족함 (추정)", "Available bandwidth below minimum demand (est.)",
      `최소 필요 ${round1(totalMinBw)} Mbps 대비 현재 링크 ${availableLinkBandwidthMbps} Mbps로 프레임 드롭 위험이 큽니다.`, `Minimum demand (${round1(totalMinBw)} Mbps) exceeds available link (${availableLinkBandwidthMbps} Mbps).`,
      "링크 대역폭을 확보하거나 보조 미러/AR 오버레이를 잠시 끄세요.", "Increase link capacity or disable secondary mirror/HUD nodes.");
  } else if (totalTargetBw > availableLinkBandwidthMbps) {
    addConflict(conflicts, "bandwidth-oversubscribed", "warn", activeDeviceIds, "권장 대역폭 초과 — 우선순위 배분 적용 (추정)", "Target bandwidth exceeded — priority throttling active (est.)",
      `권장 합계 ${totalTargetBw} Mbps가 링크 ${availableLinkBandwidthMbps} Mbps를 넘어 메인 캔버스·펜 데크에 우선 배분했습니다.`, `Target sum (${totalTargetBw} Mbps) exceeds ${availableLinkBandwidthMbps} Mbps; canvas and pen channels prioritized.`,
      "Wi-Fi 6E 로컬망 또는 USB 하이브리드 전환을 권장합니다.", "Switch to Wi-Fi 6E LAN or USB tether hybrid for full bitrate.");
  }
  if (totalEndToEndMs > TARGET_STROKE_LATENCY_BUDGET_MS && activeDevices.length > 0) {
    addConflict(conflicts, "latency-budget-exceeded", totalEndToEndMs > 45 ? "critical" : "warn", activeDeviceIds,
      `추정 동기화 지연 ${totalEndToEndMs}ms (권장 ${TARGET_STROKE_LATENCY_BUDGET_MS}ms 이하)`, `Estimated sync latency ${totalEndToEndMs}ms (target <= ${TARGET_STROKE_LATENCY_BUDGET_MS}ms)`,
      "릴레이 경유 또는 대역폭 혼잡으로 펜 획·뷰포트 동기화 지연이 권장 예산보다 높게 추정됩니다.", "Relay hops or congestion push estimated sync latency above the target stroke budget.",
      "전송 방식을 로컬 LAN WebRTC 또는 USB 하이브리드로 전환하세요.", "Switch to LAN WebRTC or USB Tether Hybrid.");
  }

  const criticalConflictCount = conflicts.filter((c) => c.severity === "critical").length;
  const warningConflictCount = conflicts.filter((c) => c.severity === "warn").length;
  const healthScore = clamp(100 - criticalConflictCount * 32 - warningConflictCount * 14 - (latencyGrade === "congested" ? 10 : 0), 0, 100);

  return {
    dataSourceKind: "estimate", provenance: SPATIAL_ESTIMATE_PROVENANCE,
    activeDeviceIds, activeDevices, syncTransportMode, availableLinkBandwidthMbps,
    hubDeviceId, primaryCanvasDeviceId, links, bandwidthAllocations,
    totalTargetBandwidthMbps: totalTargetBw, totalAllocatedBandwidthMbps, bandwidthUtilizationPct, bandwidthHeadroomMbps,
    latencyBudget: {
      dataSourceKind: "estimate", captureAndEncodeMs, networkTransportMs, decodeAndCompositeMs,
      totalEndToEndMs, targetStrokeBudgetMs: TARGET_STROKE_LATENCY_BUDGET_MS, grade: latencyGrade,
    },
    conflicts, criticalConflictCount, warningConflictCount, healthScore,
  };
}

/** 공간 6DoF 캔버스·좌측 레퍼런스 보드·우측 3D 포즈 홀로그램 스테이지 배치 및 목·어깨 인체공학 솔버. */
export function computeSpatialCanvasRig(rawInput: SpatialCanvasRigInput): SpatialCanvasRigResult {
  const input: NormalizedSpatialRigInput = {
    eyeHeightM: round2(clamp(rawInput.eyeHeightM ?? DEFAULT_SPATIAL_RIG_INPUT.eyeHeightM, 0.9, 1.95)),
    viewingDistanceM: round2(clamp(rawInput.viewingDistanceM ?? DEFAULT_SPATIAL_RIG_INPUT.viewingDistanceM, 0.7, 2.8)),
    horizontalFovDeg: round1(clamp(rawInput.horizontalFovDeg ?? DEFAULT_SPATIAL_RIG_INPUT.horizontalFovDeg, 45, 120)),
    verticalFovDeg: round1(clamp(rawInput.verticalFovDeg ?? DEFAULT_SPATIAL_RIG_INPUT.verticalFovDeg, 35, 95)),
    gazePitchDeg: round1(clamp(rawInput.gazePitchDeg ?? DEFAULT_SPATIAL_RIG_INPUT.gazePitchDeg, -35, 20)),
    panelCurvatureDeg: round1(clamp(rawInput.panelCurvatureDeg ?? DEFAULT_SPATIAL_RIG_INPUT.panelCurvatureDeg, 0, 60)),
  };

  const userEyeOriginM: Vec3Meters = { x: 0, y: input.eyeHeightM, z: 0 };
  const pitchRad = degToRad(input.gazePitchDeg);
  const mainAngularWidthDeg = round1(clamp(input.horizontalFovDeg * 0.56, 28, 62));
  const mainWidthM = round3(clamp(2 * input.viewingDistanceM * Math.tan(degToRad(mainAngularWidthDeg / 2)), 0.65, 2.4));
  const mainHeightM = round3(clamp(Math.min(2 * input.viewingDistanceM * Math.tan(degToRad(input.verticalFovDeg * 0.31)), mainWidthM * 0.76), 0.45, 1.65));
  const mainAngularHeightDeg = round1((2 * Math.atan2(mainHeightM / 2, input.viewingDistanceM) * 180) / Math.PI);

  const curvatureRad = degToRad(input.panelCurvatureDeg);
  const curvatureRadiusM = input.panelCurvatureDeg > 0 ? round3(mainWidthM / curvatureRad) : null;
  const sagittaM = curvatureRadiusM !== null ? round3(curvatureRadiusM * (1 - Math.cos(curvatureRad / 2))) : 0;

  const mainCutPanel: SpatialMainCutPanelPlacement = {
    id: "main-cut-panel",
    positionM: { x: 0, y: round3(Math.max(0.35, input.eyeHeightM + input.viewingDistanceM * Math.sin(pitchRad))), z: round3(-input.viewingDistanceM * Math.cos(pitchRad)) },
    rotationDeg: { pitch: round1(-input.gazePitchDeg * 0.65), yaw: 0, roll: 0 },
    widthM: mainWidthM, heightM: mainHeightM, curvatureDeg: input.panelCurvatureDeg,
    curvatureRadiusM, sagittaM, distanceM: input.viewingDistanceM, angularWidthDeg: mainAngularWidthDeg, angularHeightDeg: mainAngularHeightDeg,
  };

  const wingYawAbsDeg = round1(clamp(mainAngularWidthDeg * 0.56 + 15, 30, 52));
  const wingPos = (distM: number, yawDeg: number, pitchScale: number): Vec3Meters => {
    const pRad = degToRad(input.gazePitchDeg * pitchScale);
    const horiz = distM * Math.cos(pRad);
    return {
      x: round3(horiz * Math.sin(degToRad(yawDeg))),
      y: round3(Math.max(0.35, input.eyeHeightM + distM * Math.sin(pRad))),
      z: round3(-horiz * Math.cos(degToRad(yawDeg))),
    };
  };

  const leftDistM = round3(input.viewingDistanceM * 1.04);
  const leftReferenceBoard: SpatialReferenceBoardPlacement = {
    id: "left-reference-board", positionM: wingPos(leftDistM, -wingYawAbsDeg, 0.85),
    rotationDeg: { pitch: round1(-input.gazePitchDeg * 0.55), yaw: wingYawAbsDeg, roll: 0 },
    widthM: round3(mainWidthM * 0.58), heightM: round3(mainHeightM * 0.88), distanceM: leftDistM, yawFromCenterDeg: -wingYawAbsDeg,
  };

  const rightDistM = round3(input.viewingDistanceM * 0.94);
  const rightPoseStage: SpatialPoseStagePlacement = {
    id: "right-pose-stage", positionM: wingPos(rightDistM, wingYawAbsDeg, 1.05),
    rotationDeg: { pitch: round1(-input.gazePitchDeg * 0.45), yaw: -wingYawAbsDeg, roll: 0 },
    widthM: round3(mainWidthM * 0.52), heightM: round3(mainHeightM * 0.82),
    depthM: round3(clamp(mainWidthM * 0.36, 0.32, 0.85)), distanceM: rightDistM, yawFromCenterDeg: wingYawAbsDeg,
  };

  const isWithinComfortableGazeBand = input.gazePitchDeg <= COMFORTABLE_GAZE_MAX_DEG && input.gazePitchDeg >= COMFORTABLE_GAZE_MIN_DEG;
  const neckFlexionStatus: NeckFlexionStatus = isWithinComfortableGazeBand
    ? "comfortable" : input.gazePitchDeg > 6 || input.gazePitchDeg < -22 ? "strain-risk" : "caution";
  const horizontalHeadSweepDeg = round1(wingYawAbsDeg * 2);
  const shoulderReachStatus: ShoulderReachStatus = rightDistM < 0.8 ? "too-close" : rightDistM > 2.0 ? "extended-reach" : "comfortable";
  const vergenceComfortStatus: VergenceComfortStatus = input.viewingDistanceM < 0.85 ? "too-close" : input.viewingDistanceM > 2.2 ? "far-detail-caution" : "comfortable";

  const recommendationsKo: string[] = [];
  const recommendationsEn: string[] = [];
  let ergonomicsScore = 100;
  if (neckFlexionStatus === "strain-risk") {
    ergonomicsScore -= 34;
    recommendationsKo.push(input.gazePitchDeg > 0 ? "시선이 눈높이 위로 올라가 목 뒤쪽 부담이 커집니다. 시선 하향각을 0°~-15°로 낮추세요." : "시선이 -22° 아래로 과도하게 숙여집니다. 패널 높이를 올려 0°~-15° 범위로 맞추세요.");
    recommendationsEn.push(input.gazePitchDeg > 0 ? "Upward gaze increases cervical strain. Lower the panel into 0° to -15°." : "Steep downward pitch below -22° increases neck flexion. Raise the panel into 0° to -15°.");
  } else if (neckFlexionStatus === "caution") {
    ergonomicsScore -= 14;
    recommendationsKo.push("편안한 시선 하향각(0°~-15°) 경계에 가깝습니다. 메인 패널 높이를 소폭 조정하세요.");
    recommendationsEn.push("Gaze angle sits just outside the 0° to -15° comfort band; nudge panel height.");
  }
  if (vergenceComfortStatus === "too-close") {
    ergonomicsScore -= 22;
    recommendationsKo.push("시청 거리가 0.85m 미만이라 초점 피로가 커질 수 있습니다. 1.2~1.6m 거리를 권장합니다.");
    recommendationsEn.push("Viewing distance under 0.85m increases vergence fatigue; 1.2m–1.6m is preferred.");
  } else if (vergenceComfortStatus === "far-detail-caution") {
    ergonomicsScore -= 12;
    recommendationsKo.push("시청 거리가 2.2m를 넘어 작은 말풍선·세부 선화 판독이 어려워질 수 있습니다.");
    recommendationsEn.push("Distance beyond 2.2m may reduce fine lineart and caption legibility.");
  }
  if (shoulderReachStatus !== "comfortable") {
    ergonomicsScore -= 12;
    recommendationsKo.push("우측 3D 포즈 스테이지 거리를 0.8~2.0m 안으로 맞추면 어깨 회전 부담이 줄어듭니다.");
    recommendationsEn.push("Keep the right 3D pose stage within 0.8m–2.0m for comfortable inspection.");
  }
  if (horizontalHeadSweepDeg > 95) {
    ergonomicsScore -= 10;
    recommendationsKo.push("좌우 패널 사이 고개 회전 폭이 95°를 넘습니다. FOV나 곡률을 소폭 조절하세요.");
    recommendationsEn.push("Total head sweep exceeds 95°; narrow FOV or increase curvature slightly.");
  }

  return {
    dataSourceKind: "estimate", provenance: SPATIAL_ESTIMATE_PROVENANCE,
    input, userEyeOriginM, mainCutPanel, leftReferenceBoard, rightPoseStage,
    ergonomics: {
      dataSourceKind: "estimate", gazeDownwardAngleDeg: input.gazePitchDeg,
      comfortableGazeMinDeg: COMFORTABLE_GAZE_MIN_DEG, comfortableGazeMaxDeg: COMFORTABLE_GAZE_MAX_DEG,
      isWithinComfortableGazeBand, neckFlexionStatus, horizontalHeadSweepDeg,
      shoulderReachStatus, vergenceComfortStatus, ergonomicsScore: clamp(ergonomicsScore, 0, 100),
      summaryKo: neckFlexionStatus === "comfortable" ? `시선 하향각 ${input.gazePitchDeg}°로 편안한 구간(0°~-15°) 안에 배치되었습니다.` : neckFlexionStatus === "caution" ? `시선 각도 ${input.gazePitchDeg}°로 편안한 하향각(0°~-15°)을 소폭 벗어났습니다.` : `시선 각도 ${input.gazePitchDeg}°로 목·어깨 부담 구간입니다. 0°~-15°로 조정을 권장합니다.`,
      summaryEn: neckFlexionStatus === "comfortable" ? `Gaze pitch ${input.gazePitchDeg}° stays inside the comfortable 0° to -15° band.` : neckFlexionStatus === "caution" ? `Gaze pitch ${input.gazePitchDeg}° sits slightly outside 0° to -15°.` : `Gaze pitch ${input.gazePitchDeg}° is in a neck/shoulder strain zone; adjust into 0° to -15°.`,
      recommendationsKo, recommendationsEn,
    },
  };
}

/** 워치 크라운·스마트 링 제스처 매퍼(브러시 크기/확대축소/타임라인 스크럽/실행취소). */
export function resolveWearableDialAction(input: WearableDialActionInput): WearableDialActionResult {
  const { mode, gesture, precisionModifier = false, state } = input;
  const delta = Number.isFinite(input.detentDelta ?? 0) ? Math.trunc(input.detentDelta ?? 0) : 0;
  const maxF = Math.max(1, Math.trunc(state.timelineMaxFrames));
  const maxH = Math.max(1, Math.trunc(state.historyMaxIndex));
  const norm: WearableStudioControlState = {
    brushSizePx: Math.round(clamp(state.brushSizePx, 1, 300)), canvasZoomPct: Math.round(clamp(state.canvasZoomPct, 10, 800)),
    timelineFrame: Math.round(clamp(state.timelineFrame, 0, maxF)), timelineMaxFrames: maxF,
    historyIndex: Math.round(clamp(state.historyIndex, 0, maxH)), historyMaxIndex: maxH,
  };

  if (gesture === "double-tap") {
    const nextMode = WEARABLE_DIAL_MODES[(WEARABLE_DIAL_MODES.indexOf(mode) + 1) % WEARABLE_DIAL_MODES.length];
    const value = mode === "brush-size" ? norm.brushSizePx : mode === "canvas-zoom" ? norm.canvasZoomPct : mode === "timeline-scrub" ? norm.timelineFrame : norm.historyIndex;
    const unit = mode === "brush-size" ? "px" : mode === "canvas-zoom" ? "%" : mode === "timeline-scrub" ? "frame" : "step";
    return {
      mode, nextMode, gesture, detentDelta: 0, commandId: "studio.wearable.mode-cycle",
      previousValue: value, nextValue: value, unit, clamped: false, hapticPattern: "double-confirm", nextState: norm,
      summaryKo: `더블 탭으로 다이얼 모드를 전환했습니다 (${mode} → ${nextMode}).`, summaryEn: `Double tap cycled dial mode (${mode} -> ${nextMode}).`,
    };
  }

  const isPress = gesture === "crown-press";
  if (mode === "undo-redo") {
    const prev = norm.historyIndex;
    const effDelta = isPress ? -1 : delta;
    const raw = prev + effDelta;
    const next = Math.round(clamp(raw, 0, maxH));
    const clamped = next !== raw;
    return {
      mode, nextMode: mode, gesture, detentDelta: effDelta,
      commandId: effDelta < 0 ? "studio.history.undo" : effDelta > 0 ? "studio.history.redo" : "studio.wearable.noop",
      previousValue: prev, nextValue: next, unit: "step", clamped,
      hapticPattern: clamped ? "boundary-thud" : effDelta === 0 ? "none" : "detent-notch",
      nextState: { ...norm, historyIndex: next },
      summaryKo: `${effDelta < 0 ? "실행취소" : effDelta > 0 ? "다시실행" : "유지"} 히스토리 단계 ${prev} → ${next} / ${maxH}.`,
      summaryEn: `${effDelta < 0 ? "Undo" : effDelta > 0 ? "Redo" : "No-op"} history step ${prev} -> ${next} / ${maxH}.`,
    };
  }

  const spec =
    mode === "brush-size"
      ? { prev: norm.brushSizePx, min: 1, max: 300, step: precisionModifier ? 1 : norm.brushSizePx >= 60 ? 5 : 2, resetVal: DEFAULT_WEARABLE_CONTROL_STATE.brushSizePx, unit: "px" as const, cmd: "studio.brush.resize", resetCmd: "studio.brush.reset-size", haptic: "micro-tick" as const, labelKo: "브러시 크기", labelEn: "brush size" }
      : mode === "canvas-zoom"
        ? { prev: norm.canvasZoomPct, min: 10, max: 800, step: precisionModifier ? 5 : 15, resetVal: 100, unit: "%" as const, cmd: "studio.viewport.zoom", resetCmd: "studio.viewport.zoom-reset", haptic: "detent-notch" as const, labelKo: "캔버스 배율", labelEn: "canvas zoom" }
        : { prev: norm.timelineFrame, min: 0, max: maxF, step: precisionModifier ? 1 : 4, resetVal: 0, unit: "frame" as const, cmd: "studio.timeline.scrub", resetCmd: "studio.timeline.jump-start", haptic: "micro-tick" as const, labelKo: "타임라인 프레임", labelEn: "timeline frame" };

  const raw = isPress ? spec.resetVal : spec.prev + delta * spec.step;
  const next = Math.round(clamp(raw, spec.min, spec.max));
  const clamped = !isPress && next !== raw;
  const nextState: WearableStudioControlState =
    mode === "brush-size" ? { ...norm, brushSizePx: next } : mode === "canvas-zoom" ? { ...norm, canvasZoomPct: next } : { ...norm, timelineFrame: next };

  return {
    mode, nextMode: mode, gesture, detentDelta: isPress ? 0 : delta,
    commandId: isPress ? spec.resetCmd : delta === 0 ? "studio.wearable.noop" : spec.cmd,
    previousValue: spec.prev, nextValue: next, unit: spec.unit, clamped,
    hapticPattern: isPress ? "detent-notch" : clamped ? "boundary-thud" : delta === 0 ? "none" : spec.haptic,
    nextState,
    summaryKo: isPress ? `크라운 클릭으로 ${spec.labelKo}을(를) 기본값(${next}${spec.unit})으로 복원했습니다.` : `${spec.labelKo} ${spec.prev}${spec.unit} → ${next}${spec.unit}.`,
    summaryEn: isPress ? `Crown press reset ${spec.labelEn} to ${next}${spec.unit}.` : `Adjusted ${spec.labelEn} from ${spec.prev}${spec.unit} to ${next}${spec.unit}.`,
  };
}

/** 세션 작업 시간 기반 휴식 리마인더(비의료 · 단순 작업 시간 알림 명시). */
export function evaluateSessionBreakReminder(input: SessionBreakReminderInput): SessionBreakReminderResult {
  const elapsedWorkMinutes = Math.round(clamp(input.elapsedWorkMinutes, 0, 720));
  const configured = Math.round(clamp(input.breakIntervalMinutes ?? 50, 15, 120));
  const effectiveBreakIntervalMinutes = input.wearingHmd === true ? Math.min(configured, 40) : configured;
  const microStretchIntervalMinutes = Math.min(
    Math.round(clamp(input.microStretchIntervalMinutes ?? Math.round(effectiveBreakIntervalMinutes * 0.5), 10, 60)),
    Math.max(10, effectiveBreakIntervalMinutes - 5),
  );
  const hapticOn = input.hapticNudgeEnabled ?? true;
  const remaining = Math.max(0, effectiveBreakIntervalMinutes - elapsedWorkMinutes);

  const status: BreakReminderStatus =
    elapsedWorkMinutes >= Math.round(effectiveBreakIntervalMinutes * 1.5) ? "extended-session"
      : elapsedWorkMinutes >= effectiveBreakIntervalMinutes ? "break-due"
        : elapsedWorkMinutes >= microStretchIntervalMinutes ? "micro-break-suggested" : "working";
  const recommendedRestMinutes = status === "extended-session" ? 10 : status === "break-due" ? 5 : status === "micro-break-suggested" ? 1 : 0;
  const watchHapticCue: WatchBreakHapticCue = !hapticOn || status === "working" ? "none" : status === "micro-break-suggested" ? "gentle-pulse" : "two-pulse-reminder";
  const messageKo =
    status === "extended-session" ? `연속 작업 ${elapsedWorkMinutes}분 경과 · 설정 주기(${effectiveBreakIntervalMinutes}분)를 크게 넘겨 10분 휴식을 권장합니다.`
      : status === "break-due" ? `설정 작업 주기 ${effectiveBreakIntervalMinutes}분에 도달했습니다. 5분 정도 손목·시야를 쉬어 주세요.`
        : status === "micro-break-suggested" ? `${elapsedWorkMinutes}분 경과 · 잠깐 먼 곳을 보며 1분 가볍게 숨을 고르는 타이밍입니다.`
          : `작업 시작 ${elapsedWorkMinutes}분 경과 · 다음 휴식 타이머까지 ${remaining}분 남았습니다.`;
  const messageEn =
    status === "extended-session" ? `${elapsedWorkMinutes} min session (past ${effectiveBreakIntervalMinutes} min timer). Take a 10+ min break.`
      : status === "break-due" ? `Reached your ${effectiveBreakIntervalMinutes} min timer. Pause for a 5 min rest.`
        : status === "micro-break-suggested" ? `${elapsedWorkMinutes} min elapsed · good moment for a quick 1 min visual pause.`
          : `${elapsedWorkMinutes} min elapsed · ${remaining} min until next break timer.`;

  return {
    dataSourceKind: "estimate", isMedicalAdvice: false,
    disclaimerKo: NON_MEDICAL_BREAK_DISCLAIMER_KO, disclaimerEn: NON_MEDICAL_BREAK_DISCLAIMER_EN,
    status, elapsedWorkMinutes, effectiveBreakIntervalMinutes, microStretchIntervalMinutes,
    minutesUntilNextBreak: remaining, recommendedRestMinutes, watchHapticCue, messageKo, messageEn,
  };
}

/** AR 스마트 글래스 투시 그리드·마감 타이머 최소 간섭 HUD 프로필 빌더. */
export function buildArGlassesHudProfile(options: ArGlassesHudOptions): ArGlassesHudProfile {
  const preset = getArHudPreset(options.presetId ?? "perspective-grid-minimal");
  const perspectiveGridType: PerspectiveGridType = options.perspectiveGridType ?? preset.defaultGridType;
  const gridOpacityPct = Math.round(clamp(options.gridOpacityPct ?? preset.defaultGridOpacityPct, 5, 45));
  const showDeadlineTimer = options.showDeadlineTimer ?? preset.showDeadlineTimer;
  const deadlineRemainingMinutes = Math.round(clamp(options.deadlineRemainingMinutes ?? 45, 0, 720));
  const peripheralCorner: ArHudCorner = options.peripheralCorner ?? "top-right";

  const hudElements: ArHudOverlayElement[] = [];
  if (perspectiveGridType !== "none") {
    const base = perspectiveGridType === "3-point" ? 5.8 : perspectiveGridType === "2-point" ? 4.4 : 3.1;
    hudElements.push({ id: "perspective-grid", labelKo: `${perspectiveGridType} 투시 가이드 (${gridOpacityPct}%)`, labelEn: `${perspectiveGridType} Perspective Grid (${gridOpacityPct}%)`, placementZone: "peripheral-frame", estimatedOcclusionPct: round1(base * (0.55 + gridOpacityPct / 50)) });
  }
  if (preset.showPoseOverlay) {
    hudElements.push({ id: "pose-silhouette", labelKo: "우측 주변 시야 3D 포즈 실루엣", labelEn: "Right-Peripheral 3D Pose Silhouette", placementZone: "right-peripheral", estimatedOcclusionPct: 5.2 });
  }
  if (showDeadlineTimer) {
    hudElements.push({ id: "deadline-timer", labelKo: `마감 타이머 (${deadlineRemainingMinutes}분 남음)`, labelEn: `Deadline Timer (${deadlineRemainingMinutes} min left)`, placementZone: peripheralCorner, estimatedOcclusionPct: 2.1 });
  }

  const estimatedFovOcclusionPct = round1(hudElements.reduce((sum, item) => sum + item.estimatedOcclusionPct, 0));
  const interferenceGrade: ArHudInterferenceGrade = estimatedFovOcclusionPct <= 10 ? "minimal" : estimatedFovOcclusionPct <= 16 ? "moderate" : "intrusive";
  const centerSafeZoneClear = gridOpacityPct <= 30 && estimatedFovOcclusionPct <= 16;

  return {
    dataSourceKind: "estimate", presetId: preset.id, perspectiveGridType, gridOpacityPct,
    showPoseOverlay: preset.showPoseOverlay, showDeadlineTimer, deadlineRemainingMinutes, peripheralCorner,
    estimatedFovOcclusionPct, interferenceGrade, centerSafeZoneClear, hudElements,
    noteKo: centerSafeZoneClear ? "중앙 60% 드로잉 시야를 방해하지 않는 최소 간섭 주변부 HUD 구성입니다 (추정)." : "그리드 불투명도 또는 오버레이 점유가 높습니다. 불투명도를 25% 이하로 낮추면 중앙 시야가 쾌적합니다.",
    noteEn: centerSafeZoneClear ? "Peripheral-only minimal HUD keeps the central 60% drawing gaze cone unobstructed (est.)." : "Grid opacity or overlay coverage is high; reduce opacity below 25% for clearer central vision.",
  };
}

/** 세션 설정 전체를 결정론적 JSON으로 직렬화한다. */
export function exportSpatialWearableSessionJson(snapshot: SpatialWearableSessionSnapshot): string {
  const topology = computeMultiDeviceTopology({ activeDeviceIds: snapshot.activeDeviceIds, availableLinkBandwidthMbps: snapshot.availableLinkBandwidthMbps, syncTransportMode: snapshot.syncTransportMode });
  const spatialRig = computeSpatialCanvasRig(snapshot.spatialRigInput);
  const wearingHmd = topology.activeDeviceIds.includes("vision-pro-webxr") || topology.activeDeviceIds.includes("ar-smart-glasses");
  const breakReminder = evaluateSessionBreakReminder({ elapsedWorkMinutes: snapshot.elapsedWorkMinutes, breakIntervalMinutes: snapshot.breakIntervalMinutes, hapticNudgeEnabled: snapshot.hapticNudgeEnabled, wearingHmd });
  const arHudProfile = buildArGlassesHudProfile(snapshot.arHudOptions);

  return JSON.stringify({
    schema: SPATIAL_WEARABLE_SCHEMA_ID, dataSourceKind: "estimate" as const, provenance: SPATIAL_ESTIMATE_PROVENANCE,
    nonMedicalNotice: { isMedicalAdvice: false as const, ko: NON_MEDICAL_BREAK_DISCLAIMER_KO, en: NON_MEDICAL_BREAK_DISCLAIMER_EN },
    config: snapshot,
    computed: {
      hubDeviceId: topology.hubDeviceId, primaryCanvasDeviceId: topology.primaryCanvasDeviceId, healthScore: topology.healthScore,
      latencyBudget: topology.latencyBudget, totalAllocatedBandwidthMbps: topology.totalAllocatedBandwidthMbps, bandwidthUtilizationPct: topology.bandwidthUtilizationPct,
      conflictCodes: topology.conflicts.map((c) => c.code),
      spatialRig: { mainCutPanel: spatialRig.mainCutPanel, leftReferenceBoard: spatialRig.leftReferenceBoard, rightPoseStage: spatialRig.rightPoseStage, ergonomics: { gazeDownwardAngleDeg: spatialRig.ergonomics.gazeDownwardAngleDeg, neckFlexionStatus: spatialRig.ergonomics.neckFlexionStatus, ergonomicsScore: spatialRig.ergonomics.ergonomicsScore } },
      breakReminder: { status: breakReminder.status, effectiveBreakIntervalMinutes: breakReminder.effectiveBreakIntervalMinutes, minutesUntilNextBreak: breakReminder.minutesUntilNextBreak, watchHapticCue: breakReminder.watchHapticCue },
      arHudProfile: { presetId: arHudProfile.presetId, estimatedFovOcclusionPct: arHudProfile.estimatedFovOcclusionPct, interferenceGrade: arHudProfile.interferenceGrade, centerSafeZoneClear: arHudProfile.centerSafeZoneClear },
    },
  }, null, 2);
}

/** 세션 설정 JSON을 fail-closed 방식으로 검증·복원한다. */
export function parseSpatialWearableSessionJson(rawJson: string): ParseSpatialWearableSessionResult {
  let parsed: unknown;
  try { parsed = JSON.parse(rawJson); } catch {
    return { ok: false, errorCode: "invalid-json", messageKo: "유효한 JSON 형식이 아닙니다.", messageEn: "Input is not valid JSON." };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, errorCode: "invalid-schema", messageKo: "루트 객체가 비어 있습니다.", messageEn: "Root JSON payload must be an object." };
  }
  const root = parsed as Record<string, unknown>;
  if (root.schema !== SPATIAL_WEARABLE_SCHEMA_ID || typeof root.config !== "object" || root.config === null) {
    return { ok: false, errorCode: "invalid-schema", messageKo: `지원 스키마(${SPATIAL_WEARABLE_SCHEMA_ID})가 일치하지 않습니다.`, messageEn: `Expected schema ${SPATIAL_WEARABLE_SCHEMA_ID} with config.` };
  }
  const cfg = root.config as Record<string, unknown>;
  if (!Array.isArray(cfg.activeDeviceIds) || !cfg.activeDeviceIds.every(isSpatialDeviceId)) {
    return { ok: false, errorCode: "invalid-fields", messageKo: "activeDeviceIds에 허용되지 않는 기기가 포함되어 있습니다.", messageEn: "activeDeviceIds contains an unsupported device ID." };
  }
  const transport = cfg.syncTransportMode;
  if (transport !== "lan-webrtc" && transport !== "usb-tether-hybrid" && transport !== "cloud-relay") {
    return { ok: false, errorCode: "invalid-fields", messageKo: "syncTransportMode 값이 유효하지 않습니다.", messageEn: "Invalid syncTransportMode value." };
  }

  const objOrEmpty = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {});
  const rawRig = objOrEmpty(cfg.spatialRigInput);
  const rawW = objOrEmpty(cfg.wearableState);
  const rawH = objOrEmpty(cfg.arHudOptions);
  const optNum = (o: Record<string, unknown>, k: string): number | undefined => (typeof o[k] === "number" ? o[k] : undefined);
  const rigInput = computeSpatialCanvasRig({
    eyeHeightM: optNum(rawRig, "eyeHeightM"), viewingDistanceM: optNum(rawRig, "viewingDistanceM"),
    horizontalFovDeg: optNum(rawRig, "horizontalFovDeg"), verticalFovDeg: optNum(rawRig, "verticalFovDeg"),
    gazePitchDeg: optNum(rawRig, "gazePitchDeg"), panelCurvatureDeg: optNum(rawRig, "panelCurvatureDeg"),
  }).input;

  const wearableMode: WearableDialMode = typeof cfg.wearableMode === "string" && WEARABLE_DIAL_MODES.includes(cfg.wearableMode as WearableDialMode) ? (cfg.wearableMode as WearableDialMode) : "brush-size";
  const presetId: ArHudPresetId = rawH.presetId === "perspective-grid-minimal" || rawH.presetId === "pose-silhouette-whisper" || rawH.presetId === "deadline-focus-only" ? rawH.presetId : "perspective-grid-minimal";
  const perspectiveGridType: PerspectiveGridType = rawH.perspectiveGridType === "none" || rawH.perspectiveGridType === "1-point" || rawH.perspectiveGridType === "2-point" || rawH.perspectiveGridType === "3-point" ? rawH.perspectiveGridType : getArHudPreset(presetId).defaultGridType;
  const peripheralCorner: ArHudCorner = rawH.peripheralCorner === "top-right" || rawH.peripheralCorner === "top-left" || rawH.peripheralCorner === "bottom-right" ? rawH.peripheralCorner : "top-right";
  const maxFrames = Math.round(readClampedNum(rawW, "timelineMaxFrames", DEFAULT_WEARABLE_CONTROL_STATE.timelineMaxFrames, 1, 3600));
  const maxHistory = Math.round(readClampedNum(rawW, "historyMaxIndex", DEFAULT_WEARABLE_CONTROL_STATE.historyMaxIndex, 1, 200));

  return {
    ok: true,
    config: {
      activeDeviceIds: [...new Set(cfg.activeDeviceIds)], syncTransportMode: transport,
      availableLinkBandwidthMbps: round1(readClampedNum(cfg, "availableLinkBandwidthMbps", DEFAULT_LINK_BANDWIDTH_MBPS, 5, 2000)),
      spatialRigInput: rigInput, wearableMode,
      wearableState: {
        brushSizePx: Math.round(readClampedNum(rawW, "brushSizePx", DEFAULT_WEARABLE_CONTROL_STATE.brushSizePx, 1, 300)),
        canvasZoomPct: Math.round(readClampedNum(rawW, "canvasZoomPct", DEFAULT_WEARABLE_CONTROL_STATE.canvasZoomPct, 10, 800)),
        timelineFrame: Math.round(readClampedNum(rawW, "timelineFrame", DEFAULT_WEARABLE_CONTROL_STATE.timelineFrame, 0, maxFrames)),
        timelineMaxFrames: maxFrames,
        historyIndex: Math.round(readClampedNum(rawW, "historyIndex", DEFAULT_WEARABLE_CONTROL_STATE.historyIndex, 0, maxHistory)),
        historyMaxIndex: maxHistory,
      },
      elapsedWorkMinutes: Math.round(readClampedNum(cfg, "elapsedWorkMinutes", 32, 0, 720)),
      breakIntervalMinutes: Math.round(readClampedNum(cfg, "breakIntervalMinutes", 50, 15, 120)),
      hapticNudgeEnabled: typeof cfg.hapticNudgeEnabled === "boolean" ? cfg.hapticNudgeEnabled : true,
      arHudOptions: {
        presetId, perspectiveGridType, gridOpacityPct: Math.round(readClampedNum(rawH, "gridOpacityPct", 18, 5, 45)),
        showDeadlineTimer: typeof rawH.showDeadlineTimer === "boolean" ? rawH.showDeadlineTimer : true,
        deadlineRemainingMinutes: Math.round(readClampedNum(rawH, "deadlineRemainingMinutes", 45, 0, 720)), peripheralCorner,
      },
    },
  };
}
