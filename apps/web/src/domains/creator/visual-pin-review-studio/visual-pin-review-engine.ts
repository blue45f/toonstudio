/**
 * Wave 46D — 직관적 캔버스 핀 검수(6종 원클릭 도장 · 전후 비교 · 6단계 바통터치) +
 * 5대 외부 툴 오픈 표준 라운드트립 브리지 순수 엔진.
 *
 * - 6종 원클릭 시각 검수 도장(`expression-fix`, `hand-anatomy`, `balloon-pos`, `bg-perspective`, `tone-missing`, `approved-stamp`)
 * - 컷 좌표(`xPct`, `yPct`, `0..100`) 번호 핀 불변 상태 관리(`open` / `in-progress` / `resolved`)
 * - 6단계 바통터치 상태기계(`conti` → `lineart` → `flat-color` → `shading` → `lettering` → `final-ready`)
 *   및 미해결 핀 자동 안내(`evaluateStageGateReadiness`) + 1줄 요약 알림 페이로드 생성
 * - 5대 외부 툴 오픈 표준 브리지(`csp-psd-layers`, `photoshop-psd-cmyk`, `blender-glb-camera`, `figma-tokens-json`, `slack-notion-digest`)
 *   유료 사유 포맷 우회 없이 공개 표준 교환 포맷(`.psd`, `.glb`, JSON 토큰, Markdown) 손실/보존 매핑표 및 매니페스트 생성
 *
 * 순수 함수형 모듈: Web Storage · private Map store · BigInt 리터럴 · 원시 색상 리터럴 미사용.
 */

export const REVIEW_STAMP_IDS = [
  "expression-fix", "hand-anatomy", "balloon-pos", "bg-perspective", "tone-missing", "approved-stamp",
] as const;
export type ReviewStampId = (typeof REVIEW_STAMP_IDS)[number];

export const REVIEW_PIN_STATUSES = ["open", "in-progress", "resolved"] as const;
export type ReviewPinStatus = (typeof REVIEW_PIN_STATUSES)[number];

export const BATON_STAGE_IDS = [
  "conti", "lineart", "flat-color", "shading", "lettering", "final-ready",
] as const;
export type BatonStageId = (typeof BATON_STAGE_IDS)[number];

export const EXTERNAL_BRIDGE_IDS = [
  "csp-psd-layers", "photoshop-psd-cmyk", "blender-glb-camera", "figma-tokens-json", "slack-notion-digest",
] as const;
export type ExternalBridgeId = (typeof EXTERNAL_BRIDGE_IDS)[number];

export type SemanticTone = "accent" | "bad" | "warn" | "cool" | "good";
export type RoundtripFidelityStatus = "preserved" | "approximated" | "flattened";
export type StageGateStatus = "ready" | "blocked" | "finalized";
export type ReviewLocale = "ko" | "en";

export const DEFAULT_REVIEW_TIMESTAMP_ISO = "2026-11-25T13:30:00Z";
export const VISUAL_PIN_BRIDGE_SCHEMA_VERSION = "toonstudio.visual-pin-roundtrip.v1";

export interface ReviewStampSpec {
  readonly id: ReviewStampId; readonly shortCode: string;
  readonly labelKo: string; readonly labelEn: string;
  readonly defaultCommentKo: string; readonly defaultCommentEn: string;
  readonly defaultStageId: BatonStageId; readonly tone: SemanticTone;
  readonly blocksStageGate: boolean; readonly defaultStatus: ReviewPinStatus;
}

export interface BatonStageSpec {
  readonly id: BatonStageId; readonly order: number;
  readonly labelKo: string; readonly labelEn: string;
  readonly shortLabelKo: string; readonly shortLabelEn: string;
  readonly ownerRoleKo: string; readonly ownerRoleEn: string;
  readonly nextStageId: BatonStageId | null;
  readonly gateGoalKo: string; readonly gateGoalEn: string;
}

export interface ReviewCutDescriptor {
  readonly id: string; readonly cutNumber: number;
  readonly titleKo: string; readonly titleEn: string;
  readonly beforeSummaryKo: string; readonly beforeSummaryEn: string;
  readonly afterSummaryKo: string; readonly afterSummaryEn: string;
}

export interface ReviewPin {
  readonly id: string; readonly pinNumber: number; readonly cutId: string;
  readonly stampId: ReviewStampId; readonly xPct: number; readonly yPct: number;
  readonly comment: string; readonly stageId: BatonStageId;
  readonly status: ReviewPinStatus; readonly assignee: string;
  readonly createdAtIso: string; readonly updatedAtIso: string;
}

export interface StageTransitionRecord {
  readonly id: string; readonly fromStageId: BatonStageId; readonly toStageId: BatonStageId;
  readonly direction: "advance" | "rewind"; readonly forced: boolean;
  readonly actorName: string; readonly summaryKo: string; readonly summaryEn: string;
  readonly timestampIso: string;
}

export interface VisualPinReviewState {
  readonly projectTitle: string; readonly episodeLabel: string;
  readonly activeCutId: string; readonly currentStageId: BatonStageId;
  readonly pins: readonly ReviewPin[]; readonly nextPinNumber: number;
  readonly beforeAfterSplitPct: number; readonly history: readonly StageTransitionRecord[];
}

export interface AddReviewPinInput {
  readonly stampId: ReviewStampId; readonly xPct: number; readonly yPct: number;
  readonly cutId?: string; readonly comment?: string; readonly stageId?: BatonStageId;
  readonly status?: ReviewPinStatus; readonly assignee?: string;
  readonly locale?: ReviewLocale; readonly timestampIso?: string;
}

export interface InitialReviewStateOptions {
  readonly variant?: "sample" | "clean"; readonly projectTitle?: string; readonly episodeLabel?: string;
  readonly currentStageId?: BatonStageId; readonly activeCutId?: string; readonly beforeAfterSplitPct?: number;
}

export interface ReviewPinSummary {
  readonly total: number; readonly openCount: number; readonly inProgressCount: number;
  readonly resolvedCount: number; readonly blockingUnresolvedCount: number; readonly approvedStampCount: number;
  readonly byStamp: Readonly<Record<ReviewStampId, number>>;
  readonly unresolvedByStage: Readonly<Record<BatonStageId, number>>;
}

export interface StageGateNotificationPayload {
  readonly channelHint: "slack" | "notion" | "studio-toast";
  readonly severity: StageGateStatus;
  readonly currentStageId: BatonStageId; readonly nextStageId: BatonStageId | null;
  readonly unresolvedCount: number; readonly resolvedCount: number;
  readonly pinRefs: readonly number[];
  readonly oneLineSummaryKo: string; readonly oneLineSummaryEn: string;
  readonly actionPromptKo: string; readonly actionPromptEn: string;
}

export interface StageGateReadinessReport {
  readonly currentStage: BatonStageSpec; readonly nextStage: BatonStageSpec | null;
  readonly gateStatus: StageGateStatus; readonly canAdvance: boolean; readonly progressPct: number;
  readonly unresolvedBlockingPins: readonly ReviewPin[];
  readonly currentStageBlockingPins: readonly ReviewPin[];
  readonly upcomingStageBlockingPins: readonly ReviewPin[];
  readonly resolvedPinCount: number; readonly approvedStampCount: number;
  readonly autoGuidanceKo: string; readonly autoGuidanceEn: string;
  readonly notification: StageGateNotificationPayload;
}

export interface AdvanceStageOptions {
  readonly force?: boolean; readonly actorName?: string; readonly timestampIso?: string;
}

export interface StageTransitionResult {
  readonly transitioned: boolean; readonly state: VisualPinReviewState;
  readonly gate: StageGateReadinessReport; readonly notification: StageGateNotificationPayload;
}

export interface RoundtripFieldMapping {
  readonly id: string; readonly featureKo: string; readonly featureEn: string;
  readonly status: RoundtripFidelityStatus;
  readonly detailKo: string; readonly detailEn: string;
  readonly workaroundKo: string; readonly workaroundEn: string;
}

export interface ExternalBridgeSpec {
  readonly id: ExternalBridgeId;
  readonly toolNameKo: string; readonly toolNameEn: string;
  readonly shortNameKo: string; readonly shortNameEn: string;
  readonly openStandardFormatKo: string; readonly openStandardFormatEn: string;
  readonly fileExtension: string; readonly mimeType: string;
  readonly proprietaryBypassAvoided: true;
  readonly avoidedProprietaryFormatKo: string; readonly avoidedProprietaryFormatEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
  readonly mappings: readonly RoundtripFieldMapping[];
}

export interface BridgeFidelitySummary {
  readonly preservedCount: number; readonly approximatedCount: number;
  readonly flattenedCount: number; readonly totalMappings: number; readonly preservationRatePct: number;
}

export interface ExternalBridgeManifestOptions {
  readonly scope?: "episode" | "active-cut"; readonly locale?: ReviewLocale; readonly generatedAtIso?: string;
}

export interface ExternalBridgeManifest {
  readonly schemaVersion: typeof VISUAL_PIN_BRIDGE_SCHEMA_VERSION;
  readonly bridge: ExternalBridgeSpec; readonly proprietaryBypassAvoided: true;
  readonly scope: "episode" | "active-cut";
  readonly suggestedFileName: string; readonly generatedAtIso: string;
  readonly episode: {
    readonly projectTitle: string; readonly episodeLabel: string; readonly activeCutId: string;
    readonly currentStageId: BatonStageId; readonly nextStageId: BatonStageId | null; readonly gateStatus: StageGateStatus;
  };
  readonly pinSummary: ReviewPinSummary; readonly pins: readonly ReviewPin[];
  readonly fidelitySummary: BridgeFidelitySummary;
  readonly oneLineDigestKo: string; readonly oneLineDigestEn: string;
  readonly markdownDigest: string; readonly jsonPayload: string;
}

function mapRow(
  id: string, status: RoundtripFidelityStatus, featureKo: string, featureEn: string,
  detailKo: string, detailEn: string, workaroundKo: string, workaroundEn: string,
): RoundtripFieldMapping {
  return { id, status, featureKo, featureEn, detailKo, detailEn, workaroundKo, workaroundEn };
}

function makePinPatch(
  state: VisualPinReviewState,
  pinId: string,
  updater: (pin: ReviewPin) => ReviewPin | null,
): VisualPinReviewState {
  let changed = false;
  const pins = state.pins.map((pin) => {
    if (pin.id !== pinId) return pin;
    const next = updater(pin);
    if (!next) return pin;
    changed = true;
    return next;
  });
  return changed ? { ...state, pins } : state;
}

export const REVIEW_STAMP_SPECS: readonly [ReviewStampSpec, ...ReviewStampSpec[]] = [
  { id: "expression-fix", shortCode: "표정", labelKo: "표정 수정", labelEn: "Expression Fix", defaultCommentKo: "눈매·입꼬리 감정선 1단계 더 또렷하게 보정", defaultCommentEn: "Sharpen eye line and mouth angle to match scene emotion", defaultStageId: "lineart", tone: "accent", blocksStageGate: true, defaultStatus: "open" },
  { id: "hand-anatomy", shortCode: "손", labelKo: "손가락 보정", labelEn: "Hand Anatomy", defaultCommentKo: "손가락 관절 길이·마디 수와 쥐는 각도 재정리", defaultCommentEn: "Fix finger joint proportion, count, and grip angle", defaultStageId: "lineart", tone: "bad", blocksStageGate: true, defaultStatus: "open" },
  { id: "balloon-pos", shortCode: "말풍선", labelKo: "말풍선 위치", labelEn: "Balloon Position", defaultCommentKo: "인물 시선과 턱선 가리지 않게 말풍선 상단 여백으로 이동", defaultCommentEn: "Shift speech balloon into upper margin clear of eyeline", defaultStageId: "lettering", tone: "cool", blocksStageGate: true, defaultStatus: "open" },
  { id: "bg-perspective", shortCode: "투시", labelKo: "배경 투시", labelEn: "BG Perspective", defaultCommentKo: "난간 소실점을 인물 눈높이(아이레벨)와 맞춰 재정렬", defaultCommentEn: "Align railing vanishing point with character eye level", defaultStageId: "conti", tone: "warn", blocksStageGate: true, defaultStatus: "open" },
  { id: "tone-missing", shortCode: "채색", labelKo: "톤·채색 누락", labelEn: "Tone / Color Missing", defaultCommentKo: "목 그림자·옷깃 안쪽 밑색과 역광 톤 누락 채우기", defaultCommentEn: "Fill missing neck shadow, collar base fill, and rim tone", defaultStageId: "shading", tone: "warn", blocksStageGate: true, defaultStatus: "open" },
  { id: "approved-stamp", shortCode: "승인", labelKo: "승인 완료", labelEn: "Approved", defaultCommentKo: "컷 검수 OK · 수정 반영 확인 완료", defaultCommentEn: "Cut approved — revision verified ready for next step", defaultStageId: "final-ready", tone: "good", blocksStageGate: false, defaultStatus: "resolved" },
];

export const BATON_STAGE_SPECS: readonly [BatonStageSpec, ...BatonStageSpec[]] = [
  { id: "conti", order: 1, labelKo: "1. 콘티", labelEn: "1. Storyboard", shortLabelKo: "콘티", shortLabelEn: "Conti", ownerRoleKo: "메인 작가", ownerRoleEn: "Lead Artist", nextStageId: "lineart", gateGoalKo: "구도·카메라 투시·컷 호흡 확정", gateGoalEn: "Lock framing, perspective, and pacing" },
  { id: "lineart", order: 2, labelKo: "2. 선화", labelEn: "2. Lineart", shortLabelKo: "선화", shortLabelEn: "Lineart", ownerRoleKo: "선화 어시", ownerRoleEn: "Lineart Assist", nextStageId: "flat-color", gateGoalKo: "표정·손가락·폐곡선 외곽선 정리", gateGoalEn: "Finalize expression, hands, and clean outlines" },
  { id: "flat-color", order: 3, labelKo: "3. 밑색", labelEn: "3. Flat Color", shortLabelKo: "밑색", shortLabelEn: "Flat Color", ownerRoleKo: "밑색 어시", ownerRoleEn: "Flats Assist", nextStageId: "shading", gateGoalKo: "파츠별 경계 틈 없는 밑색 분리", gateGoalEn: "Separate gap-free base color masks" },
  { id: "shading", order: 4, labelKo: "4. 명암·효과", labelEn: "4. Shading & FX", shortLabelKo: "명암", shortLabelEn: "Shading", ownerRoleKo: "명암 어시", ownerRoleEn: "Shading Assist", nextStageId: "lettering", gateGoalKo: "광원 일관성·톤 누락·역광 마감", gateGoalEn: "Verify lighting continuity and fill missing tones" },
  { id: "lettering", order: 5, labelKo: "5. 식자·말풍선", labelEn: "5. Lettering", shortLabelKo: "식자", shortLabelEn: "Lettering", ownerRoleKo: "식자 담당", ownerRoleEn: "Letterer", nextStageId: "final-ready", gateGoalKo: "말풍선 시선 간섭 제거·오탈자 검수", gateGoalEn: "Clear face sightlines and proofread balloons" },
  { id: "final-ready", order: 6, labelKo: "6. 최종 납품", labelEn: "6. Final Ready", shortLabelKo: "최종 납품", shortLabelEn: "Final Ready", ownerRoleKo: "담당 PD", ownerRoleEn: "Managing PD", nextStageId: null, gateGoalKo: "전 공정 핀 0건 확인 후 연재본 출고", gateGoalEn: "Zero open pins verified for episode delivery" },
];

export const SAMPLE_REVIEW_CUTS: readonly [ReviewCutDescriptor, ...ReviewCutDescriptor[]] = [
  { id: "cut-01", cutNumber: 1, titleKo: "1컷 · 옥상 대치 클로즈업", titleEn: "Cut 1 · Rooftop Face-Off Close-Up", beforeSummaryKo: "수정 전: 눈매 흐림 · 손가락 관절 어색 · 말풍선 턱선 겹침", beforeSummaryEn: "Before: soft gaze, hand proportion drift, balloon clipping chin", afterSummaryKo: "수정 후: 시선 집중 · 손가락 관절 정리 · 상단 여백 말풍선 정렬", afterSummaryEn: "After: focused gaze, clean hand joints, upper-margin balloon" },
  { id: "cut-02", cutNumber: 2, titleKo: "2컷 · 복도 추격 풀샷", titleEn: "Cut 2 · Corridor Chase Full Shot", beforeSummaryKo: "수정 전: 복도 소실점 들뜸 · 교복 카라 그림자 누락", beforeSummaryEn: "Before: lifted corridor vanishing point, missing collar shadow", afterSummaryKo: "수정 후: 아이레벨 소실점 일치 · 역광 그림자 톤 보강", afterSummaryEn: "After: eye-level perspective lock, rim shadow filled" },
  { id: "cut-03", cutNumber: 3, titleKo: "3컷 · 대사 반전 바스트샷", titleEn: "Cut 3 · Plot Twist Bust Shot", beforeSummaryKo: "수정 전: 말풍선 꼬리 방향 혼선 · 배경 톤 경계 누락", beforeSummaryEn: "Before: ambiguous balloon tail, missing backdrop tone edge", afterSummaryKo: "수정 후: 화자 꼬리 명확화 · 배경 그라데이션 톤 마감", afterSummaryEn: "After: crisp speaker tail, balanced backdrop tone" },
];

export const EXTERNAL_BRIDGE_SPECS: readonly [ExternalBridgeSpec, ...ExternalBridgeSpec[]] = [
  {
    id: "csp-psd-layers", toolNameKo: "클립스튜디오 (CSP)", toolNameEn: "Clip Studio Paint", shortNameKo: "클립스튜디오", shortNameEn: "CSP",
    openStandardFormatKo: "공개 표준 .psd (레이어 계층) + .pins.json 사이드카", openStandardFormatEn: "Open Standard .psd (Layer Stack) + .pins.json Sidecar",
    fileExtension: ".psd", mimeType: "image/vnd.adobe.photoshop", proprietaryBypassAvoided: true,
    avoidedProprietaryFormatKo: "사유 바이너리 .clip 포맷 역공학·우회 없음", avoidedProprietaryFormatEn: "No proprietary .clip binary reverse-engineering or bypass",
    summaryKo: "래스터 레이어·폴더·블렌드 모드를 공개 .psd로 넘기고 컷 핀 좌표를 JSON으로 동반 저장합니다.",
    summaryEn: "Exchanges raster layers, folders, and blend modes via standard .psd with a pin-coordinate JSON sidecar.",
    mappings: [
      mapRow("csp-layers", "preserved", "래스터 레이어 · 폴더 계층 · 불투명도", "Raster Layers, Folders & Opacity", "01_LINE~07_TEXT 구조와 잠금·표시 상태를 1:1로 유지합니다.", "Preserves 01_LINE..07_TEXT folder hierarchy, visibility, and opacity 1:1.", "CSP에서 바로 열어 추가 정리 없이 작업", "Open directly in CSP with no manual restacking"),
      mapRow("csp-blends", "preserved", "표준 블렌드 모드 (곱하기·스크린·오버레이)", "Standard Blend Modes (Multiply / Screen / Overlay)", "PSD 공통 블렌드 키로 매핑되어 색 변화 없이 열립니다.", "Maps cleanly to shared PSD blend keys without tonal shift.", "CSP 전용 Add(Glow) 사용 시 발광 메모 병기", "Add note when substituting CSP-only Add(Glow)"),
      mapRow("csp-pins", "preserved", "캔버스 검수 핀 좌표 · 6종 도장 메타", "Canvas Pin Coordinates & 6 Stamp Metadata", "동반 .pins.json 파일과 가이드 레이어 라벨로 위치를 유지합니다.", "Preserved via .pins.json sidecar plus optional top guide layer.", "수정본 .psd 재가져오기 시 기존 핀 그대로 비교", "Re-import updated .psd into ToonStudio to compare against pins"),
      mapRow("csp-vector", "flattened", "CSP 벡터 선화 · 스크린톤 파라미터", "CSP Vector Ink & Screentone Parameters", "공개 .psd 한계로 벡터 제어점과 톤 주파수는 래스터로 평탄화됩니다.", "Open .psd flattens vector control points and live screentone frequencies.", "재편집용 마스터 벡터는 ToonStudio 스냅샷에 보관", "Keep master vector snapshot inside ToonStudio for re-inking"),
      mapRow("csp-3d", "approximated", "3D 소재 · 포즈 레이어 연동", "3D Pose & Asset Layers", "2D 투영 기준선 래스터로 변환하고 카메라 FOV를 JSON에 기록합니다.", "Exported as 2D reference raster while preserving camera FOV in JSON.", "3D 구도 수정은 Blender .glb 브리지와 병행", "Pair with Blender .glb bridge when camera edits are needed"),
    ],
  },
  {
    id: "photoshop-psd-cmyk", toolNameKo: "포토샵 (CMYK 인쇄)", toolNameEn: "Adobe Photoshop (CMYK)", shortNameKo: "포토샵", shortNameEn: "Photoshop",
    openStandardFormatKo: "공개 표준 .psd + ICC 프로파일 메타 + 대사 JSON", openStandardFormatEn: "Open Standard .psd + ICC Profile Metadata + Script JSON",
    fileExtension: ".psd", mimeType: "image/vnd.adobe.photoshop", proprietaryBypassAvoided: true,
    avoidedProprietaryFormatKo: "사유 클라우드 .psdc 프로토콜 우회 없음", avoidedProprietaryFormatEn: "No proprietary .psdc cloud protocol bypass",
    summaryKo: "단행본·굿즈 인쇄용 300/350 DPI 분리 레이어와 CMYK 색역 주의 항목을 공개 .psd로 묶습니다.",
    summaryEn: "Packages print-ready 300/350 DPI separated layers and CMYK gamut notes via standard .psd.",
    mappings: [
      mapRow("ps-masks", "preserved", "레이어 그룹 · 클리핑 마스크 · 알파 채널", "Layer Groups, Clipping Masks & Alpha", "단행본 표지·내지 후가공 분리 작업에 필요한 마스크를 유지합니다.", "Maintains mask hierarchy required for print finishing separation.", "출판사 도련 3mm 안전선 체크리스트 동봉", "Include 3mm bleed checklist for print vendor handoff"),
      mapRow("ps-dpi", "preserved", "300/350 DPI 해상도 · 재단선 가이드", "300/350 DPI Resolution & Trim Guides", "인쇄 해상도 헤더와 안전선 좌표를 정확히 기록합니다.", "Writes exact print DPI header and safe-area guide coordinates.", "웹 연재용 sRGB 원본과 단행본 폴더 분리", "Keep web sRGB master separate from print folder"),
      mapRow("ps-cmyk", "approximated", "sRGB → CMYK 색역 변환 (Japan Color 2001 기준)", "sRGB to CMYK Gamut Mapping", "고채도 형광·네온 발광색은 인쇄 가능한 CMYK 색역으로 완만히 조정됩니다.", "High-chroma neon tones compress to printable CMYK gamut.", "sRGB 마스터 보관 후 소프트 프루핑으로 톤 보정", "Retain sRGB master and tune midtones with soft proofing"),
      mapRow("ps-text", "approximated", "말풍선 · 효과음 식자 레이어", "Balloon & SFX Typography Layers", "폰트 깨짐 방지를 위해 위치 가이드 + UTF-8 대사 JSON을 병행합니다.", "Pairs guide placement with UTF-8 script JSON to prevent font drift.", "외주처 설치 폰트 목록을 브리프에 함께 기입", "List licensed studio font families in the handoff brief"),
      mapRow("ps-smart", "flattened", "외부 링크 스마트 오브젝트 · 라이브 필터", "Linked Smart Objects & Live Filters", "인쇄 오차 방지를 위해 비표준 필터 체인은 픽셀 베이크로 내보냅니다.", "Non-standard live filter chains bake to pixels for deterministic output.", "원본 이펙트 파라미터는 매니페스트 JSON에 참고 기록", "Effect parameters stay documented in the manifest JSON"),
    ],
  },
  {
    id: "blender-glb-camera", toolNameKo: "블렌더 (3D 배경)", toolNameEn: "Blender (3D Scene)", shortNameKo: "블렌더", shortNameEn: "Blender",
    openStandardFormatKo: "Khronos 공개 표준 glTF 2.0 (.glb) + 카메라·투시 핀 JSON", openStandardFormatEn: "Khronos Open Standard glTF 2.0 (.glb) + Camera & Pin JSON",
    fileExtension: ".glb", mimeType: "model/gltf-binary", proprietaryBypassAvoided: true,
    avoidedProprietaryFormatKo: "사유/내부 .blend DNA 바이너리 직접 파싱 우회 없음", avoidedProprietaryFormatEn: "No proprietary .blend internal DNA binary bypass",
    summaryKo: "3D 배경 메시·미터 스케일·카메라 FOV와 투시 수정 핀을 Khronos glTF 2.0 표준으로 왕복합니다.",
    summaryEn: "Round-trips 3D set geometry, meter scale, camera FOV, and perspective pins via Khronos glTF 2.0.",
    mappings: [
      mapRow("bl-mesh", "preserved", "메시 토폴로지 · 1m 스케일 · 바닥 접지(Y=0)", "Mesh Topology, 1m Scale & Y=0 Grounding", "Blender Z-Up ↔ glTF Y-Up 축 변환과 실측 미터 단위를 정규화합니다.", "Normalizes Z-Up to glTF Y-Up coordinates with exact 1.0 = 1m scale.", "Blender 내보내기 시 Apply Transform · +Y Up 유지", "Keep Apply Transform and +Y Up enabled on Blender export"),
      mapRow("bl-camera", "preserved", "컷 카메라 FOV · 아이레벨 · 투시 핀 좌표", "Cut Camera FOV, Eye-Level & Perspective Pins", "glTF 카메라 노드와 bg-perspective 핀 좌표를 동기화해 재촬영 오차를 막습니다.", "Syncs glTF camera node with bg-perspective pin coordinates.", "배경 어시가 JSON FOV 값만 맞춰 동일 화각 재렌더", "Set assistants match FOV from JSON to re-render exact framing"),
      mapRow("bl-pbr", "preserved", "PBR 기본 머티리얼 (BaseColor·Roughness·Normal)", "PBR Materials (BaseColor / Roughness / Normal)", "Principled BSDF 표준 슬롯이 glTF 2.0 Metallic-Roughness와 직접 호환됩니다.", "Principled BSDF channels map directly to glTF Metallic-Roughness.", "텍스처는 .glb 내부 임베드로 경로 깨짐 방지", "Embed textures inside .glb to avoid broken relative links"),
      mapRow("bl-nodes", "flattened", "절차적 셰이더 그래프 · 지오메트리 노드", "Procedural Shader & Geometry Nodes", "Blender 고유 노드 트리는 .glb 반출 전 베이크된 메시·텍스처로 평탄화됩니다.", "Blender-specific node graphs flatten into baked meshes and textures.", "노드 편집용 .blend 마스터는 팀 폴더에서 별도 버전 관리", "Version-control master .blend graphs alongside baked .glb"),
      mapRow("bl-freestyle", "approximated", "Freestyle / Grease Pencil 윤곽선 패스", "Freestyle / Grease Pencil Outline Pass", "ToonStudio 2D 선화 추출(LT) 파라미터 힌트로 근사 치환됩니다.", "Approximated via ToonStudio 2D line-extraction (LT) pass hints.", "05_BG3D 임포트 후 스튜디오 툰 라인 강도로 미세 조정", "Fine-tune line weight inside ToonStudio after importing 05_BG3D"),
    ],
  },
  {
    id: "figma-tokens-json", toolNameKo: "피그마 (UI · 타이포 토큰)", toolNameEn: "Figma (Design Tokens)", shortNameKo: "피그마", shortNameEn: "Figma",
    openStandardFormatKo: "W3C Design Tokens JSON (.tokens.json) + 프레임 주석 좌표", openStandardFormatEn: "W3C Design Tokens JSON (.tokens.json) + Frame Pin Coordinates",
    fileExtension: ".tokens.json", mimeType: "application/json", proprietaryBypassAvoided: true,
    avoidedProprietaryFormatKo: "비공개 .fig 바이너리 파싱·우회 없음", avoidedProprietaryFormatEn: "No private .fig binary parsing or bypass",
    summaryKo: "타이틀 로고·말풍선 타이포·시맨틱 색 역할과 검수 핀 좌표를 W3C 표준 JSON 토큰으로 교환합니다.",
    summaryEn: "Exchanges typography scales, semantic color roles, and review pin coordinates via W3C Design Tokens JSON.",
    mappings: [
      mapRow("fg-tokens", "preserved", "말풍선 타이포 스케일 · 여백 · 라운드 토큰", "Balloon Typography, Spacing & Radius Tokens", "W3C DTCG JSON 키-값 규격으로 썸네일·편집 팀과 오차 없이 공유합니다.", "Shares exact W3C DTCG JSON keys with thumbnail and editorial teams.", "Figma Variables Import 또는 공개 토큰 플러그인으로 반영", "Import directly into Figma Variables or open token plugins"),
      mapRow("fg-pins", "preserved", "컷 상대 좌표(0..100%) 검수 핀 주석", "Normalized (0..100%) Review Pin Annotations", "해상도가 달라도 컷 비율 기준 백분율 좌표로 정확히 같은 지점을 가리킵니다.", "Percentage coordinates stay aligned across desktop and mobile frames.", "썸네일 A/B 피드백도 동일 핀 번호로 추적", "Track thumbnail A/B feedback with the exact same pin numbers"),
      mapRow("fg-semantic", "preserved", "시맨틱 색상 역할 (accent·good·warn·bad)", "Semantic Color Roles (accent / good / warn / bad)", "원시 코드 하드코딩 대신 의미 역할명으로 매핑해 테마 일관성을 지킵니다.", "Maps semantic roles rather than hardcoded swatches for theme parity.", "OKLCH 팔레트 기준 문서와 함께 관리", "Reference OKLCH palette specification on theme updates"),
      mapRow("fg-autolayout", "approximated", "Figma Auto Layout · 컴포넌트 배리언트", "Figma Auto Layout & Component Variants", "프레임 폭·간격 토큰과 컷 순서 메타데이터로 근사 매핑됩니다.", "Approximated as frame dimension tokens and ordered cut metadata.", "반응형 규칙은 피그마 컴포넌트 세트에서 유지", "Keep responsive rules authored inside Figma component sets"),
      mapRow("fg-proto", "flattened", "인터랙티브 프로토타입 플로우 링크", "Interactive Prototype Flow Links", "정적 컷 시퀀스 및 6단계 바통 상태 체크리스트로 단순화됩니다.", "Flattens into ordered cut sequence and 6-stage baton status.", "독자 스크롤 연출은 ToonStudio 모바일 뷰어에서 검증", "Verify reader scroll pacing in ToonStudio mobile preview"),
    ],
  },
  {
    id: "slack-notion-digest", toolNameKo: "슬랙 · 노션 (협업 요약)", toolNameEn: "Slack & Notion Digest", shortNameKo: "슬랙·노션", shortNameEn: "Slack / Notion",
    openStandardFormatKo: "CommonMark Markdown (.md) + 1줄 바통 요약 JSON", openStandardFormatEn: "CommonMark Markdown (.md) + 1-Line Baton Summary JSON",
    fileExtension: ".md", mimeType: "text/markdown", proprietaryBypassAvoided: true,
    avoidedProprietaryFormatKo: "외부 OAuth 강제·비공개 API 스크래핑 우회 없음", avoidedProprietaryFormatEn: "No forced external OAuth scraping or private API bypass",
    summaryKo: "장황한 글 대신 1줄 바통 상태·번호 핀 표·담당자 할 일을 복사 1번으로 슬랙·노션에 붙여넣습니다.",
    summaryEn: "Generates paste-ready 1-line baton alerts and numbered pin tables for Slack and Notion with zero auth friction.",
    mappings: [
      mapRow("sn-oneline", "preserved", "바통터치 승계·차단 1줄 요약 알림", "1-Line Baton Gate Notification", "현재 공정·미해결 핀 번호·다음 담당자를 한 줄로 압축해 채널 노이즈를 줄입니다.", "Compresses stage, blocking pin numbers, and next owner into one line.", "슬랙 스레드 제목 또는 노션 회차 보드 상태 줄에 즉시 붙여넣기", "Paste directly into Slack thread header or Notion episode status"),
      mapRow("sn-table", "preserved", "번호 핀 좌표 · 도장 · 1줄 코멘트 체크표", "Numbered Pin, Stamp & Comment Checklist Table", "CommonMark 체크박스와 표 문법으로 노션·슬랙에서 깨지지 않습니다.", "Uses standard CommonMark checkboxes and tables compatible with Notion.", "해결 핀은 [x], 미해결 핀은 [ ]로 한눈에 구분", "Resolved pins render as [x] and open pins as [ ]"),
      mapRow("sn-owners", "preserved", "공정·담당자별 남은 작업 집계", "Per-Stage & Assignee Open Count", "어시스턴트·식자·PD별로 자신이 해결할 핀만 빠르게 추려냅니다.", "Groups remaining pins by stage owner for fast handoff triage.", "마감 전 1줄 요약 복사로 일일 공유 대체", "Use 1-line copy as a lightweight daily standup update"),
      mapRow("sn-sync", "approximated", "실시간 양방향 댓글 동기화", "Live Two-Way Thread Sync", "무인증·오프라인 환경 보호를 위해 단방향 스냅샷 복사 및 JSON으로 동작합니다.", "Operates as offline-safe one-way snapshot copy and JSON export.", "실제 해결 토글은 ToonStudio 핀 보드를 단일 기준으로 유지", "Keep ToonStudio pin board as single source of truth for status"),
      mapRow("sn-image", "flattened", "원본 컷 고해상도 이미지 바이트", "High-Res Cut Image Payload", "메신저 용량 부담을 줄이기 위해 컷 ID와 백분율 좌표 (x%, y%)로 요약합니다.", "Replaces heavy image blobs with cut IDs and (x%, y%) coordinate refs.", "이미지가 필요할 때만 .psd / PNG 컷 캡처를 별도 첨부", "Attach cut preview PNG separately only when visual context is needed"),
    ],
  },
];

export function getReviewStampSpec(stampId: ReviewStampId): ReviewStampSpec {
  return REVIEW_STAMP_SPECS.find((item) => item.id === stampId) ?? REVIEW_STAMP_SPECS[0];
}

export function getBatonStageSpec(stageId: BatonStageId): BatonStageSpec {
  return BATON_STAGE_SPECS.find((item) => item.id === stageId) ?? BATON_STAGE_SPECS[0];
}

export function getExternalBridgeSpec(bridgeId: ExternalBridgeId): ExternalBridgeSpec {
  return EXTERNAL_BRIDGE_SPECS.find((item) => item.id === bridgeId) ?? EXTERNAL_BRIDGE_SPECS[0];
}

export function getReviewCutDescriptor(cutId: string): ReviewCutDescriptor {
  return SAMPLE_REVIEW_CUTS.find((item) => item.id === cutId) ?? SAMPLE_REVIEW_CUTS[0];
}

export function clampPercent(value: number, fallback = 50): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;
}

export function normalizeSingleLineComment(raw: string | undefined, fallback: string, maxLength = 120): string {
  const cleaned = (raw ?? "").replace(/[\r\n]+/gu, " ").replace(/\s+/gu, " ").trim();
  const base = cleaned.length > 0 ? cleaned : fallback.replace(/[\r\n]+/gu, " ").replace(/\s+/gu, " ").trim();
  return base.length <= maxLength ? base : `${base.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

export function togglePinResolvedStatus(status: ReviewPinStatus): ReviewPinStatus {
  return status === "resolved" ? "open" : "resolved";
}

export function cyclePinStatus(status: ReviewPinStatus): ReviewPinStatus {
  if (status === "open") return "in-progress";
  return status === "in-progress" ? "resolved" : "open";
}

function makeSeedPin(
  pinNumber: number, cutId: string, stampId: ReviewStampId, xPct: number, yPct: number,
  comment: string, stageId: BatonStageId, status: ReviewPinStatus, assignee: string,
): ReviewPin {
  return {
    id: `pin-${pinNumber}`, pinNumber, cutId, stampId, xPct, yPct, comment, stageId, status, assignee,
    createdAtIso: DEFAULT_REVIEW_TIMESTAMP_ISO, updatedAtIso: DEFAULT_REVIEW_TIMESTAMP_ISO,
  };
}

export function createInitialVisualPinReviewState(options?: InitialReviewStateOptions): VisualPinReviewState {
  const variant = options?.variant ?? "sample";
  const stageId = options?.currentStageId ?? "lineart";
  const pins: readonly ReviewPin[] = variant === "clean"
    ? [makeSeedPin(1, "cut-01", "approved-stamp", 50, 45, "1컷 선화·표정·손가락 검수 완료 · 다음 공정 OK", "final-ready", "resolved", "메인 작가")]
    : [
      makeSeedPin(1, "cut-01", "expression-fix", 48, 30, "주인공 눈매 긴장감 1단계 더 날카롭게 보정", "lineart", "open", "선화 어시"),
      makeSeedPin(2, "cut-01", "hand-anatomy", 68, 64, "오른손 엄지 관절 길이와 쥐는 각도 정리", "lineart", "in-progress", "선화 어시"),
      makeSeedPin(3, "cut-01", "balloon-pos", 24, 20, "말풍선이 턱선 안 가리게 상단 여백으로 12px 이동", "lettering", "resolved", "식자 담당"),
      makeSeedPin(4, "cut-02", "bg-perspective", 76, 42, "복도 창틀 소실점을 캐릭터 아이레벨에 맞춰 정렬", "conti", "resolved", "메인 작가"),
    ];
  return {
    projectTitle: options?.projectTitle ?? "별빛 아틀리에",
    episodeLabel: options?.episodeLabel ?? "제14화",
    activeCutId: options?.activeCutId ?? SAMPLE_REVIEW_CUTS[0].id,
    currentStageId: stageId,
    pins,
    nextPinNumber: pins.length + 1,
    beforeAfterSplitPct: clampPercent(options?.beforeAfterSplitPct ?? 50, 50),
    history: [{
      id: "hist-init-1", fromStageId: "conti", toStageId: stageId, direction: "advance", forced: false,
      actorName: "메인 작가", summaryKo: "콘티 확정 후 선화 공정으로 바통 전달",
      summaryEn: "Storyboard locked and handed off to lineart", timestampIso: DEFAULT_REVIEW_TIMESTAMP_ISO,
    }],
  };
}

export function addVisualReviewPin(state: VisualPinReviewState, input: AddReviewPinInput): VisualPinReviewState {
  const stamp = getReviewStampSpec(input.stampId);
  const stageId = input.stageId ?? stamp.defaultStageId;
  const stage = getBatonStageSpec(stageId);
  const isEn = input.locale === "en";
  const timestamp = input.timestampIso ?? DEFAULT_REVIEW_TIMESTAMP_ISO;
  const pinNumber = Math.max(1, Math.round(state.nextPinNumber));
  const nextPin: ReviewPin = {
    id: `pin-${pinNumber}`, pinNumber, cutId: input.cutId ?? state.activeCutId, stampId: stamp.id,
    xPct: clampPercent(input.xPct, 50), yPct: clampPercent(input.yPct, 50),
    comment: normalizeSingleLineComment(input.comment, isEn ? stamp.defaultCommentEn : stamp.defaultCommentKo),
    stageId, status: input.status ?? stamp.defaultStatus,
    assignee: (input.assignee ?? "").trim() || (isEn ? stage.ownerRoleEn : stage.ownerRoleKo),
    createdAtIso: timestamp, updatedAtIso: timestamp,
  };
  return { ...state, pins: [...state.pins, nextPin], nextPinNumber: pinNumber + 1 };
}

export function updateReviewPinStatus(
  state: VisualPinReviewState, pinId: string, nextStatus: ReviewPinStatus, timestampIso = DEFAULT_REVIEW_TIMESTAMP_ISO,
): VisualPinReviewState {
  return makePinPatch(state, pinId, (pin) => (pin.status === nextStatus ? null : { ...pin, status: nextStatus, updatedAtIso: timestampIso }));
}

export function toggleReviewPinResolved(
  state: VisualPinReviewState, pinId: string, timestampIso = DEFAULT_REVIEW_TIMESTAMP_ISO,
): VisualPinReviewState {
  return makePinPatch(state, pinId, (pin) => ({ ...pin, status: togglePinResolvedStatus(pin.status), updatedAtIso: timestampIso }));
}

export function cycleReviewPinStatus(
  state: VisualPinReviewState, pinId: string, timestampIso = DEFAULT_REVIEW_TIMESTAMP_ISO,
): VisualPinReviewState {
  return makePinPatch(state, pinId, (pin) => ({ ...pin, status: cyclePinStatus(pin.status), updatedAtIso: timestampIso }));
}

export function updateReviewPinComment(
  state: VisualPinReviewState, pinId: string, comment: string, timestampIso = DEFAULT_REVIEW_TIMESTAMP_ISO,
): VisualPinReviewState {
  return makePinPatch(state, pinId, (pin) => {
    const normalized = normalizeSingleLineComment(comment, getReviewStampSpec(pin.stampId).defaultCommentKo);
    return normalized === pin.comment ? null : { ...pin, comment: normalized, updatedAtIso: timestampIso };
  });
}

export function updateReviewPinStage(
  state: VisualPinReviewState, pinId: string, stageId: BatonStageId, timestampIso = DEFAULT_REVIEW_TIMESTAMP_ISO,
): VisualPinReviewState {
  const stage = getBatonStageSpec(stageId);
  return makePinPatch(state, pinId, (pin) => (pin.stageId === stageId ? null : { ...pin, stageId, assignee: stage.ownerRoleKo, updatedAtIso: timestampIso }));
}

export function moveReviewPin(
  state: VisualPinReviewState, pinId: string, xPct: number, yPct: number, timestampIso = DEFAULT_REVIEW_TIMESTAMP_ISO,
): VisualPinReviewState {
  const nextX = clampPercent(xPct, 50);
  const nextY = clampPercent(yPct, 50);
  return makePinPatch(state, pinId, (pin) => (pin.xPct === nextX && pin.yPct === nextY ? null : { ...pin, xPct: nextX, yPct: nextY, updatedAtIso: timestampIso }));
}

export function removeReviewPin(state: VisualPinReviewState, pinId: string): VisualPinReviewState {
  const nextPins = state.pins.filter((pin) => pin.id !== pinId);
  return nextPins.length === state.pins.length ? state : { ...state, pins: nextPins };
}

export function resolveAllPinsForCut(
  state: VisualPinReviewState, cutId?: string, timestampIso = DEFAULT_REVIEW_TIMESTAMP_ISO,
): VisualPinReviewState {
  let changed = false;
  const pins = state.pins.map((pin) => {
    if ((cutId && pin.cutId !== cutId) || pin.status === "resolved") return pin;
    changed = true;
    return { ...pin, status: "resolved" as const, updatedAtIso: timestampIso };
  });
  return changed ? { ...state, pins } : state;
}

export function setBeforeAfterSplitPct(state: VisualPinReviewState, splitPct: number): VisualPinReviewState {
  const next = clampPercent(splitPct, state.beforeAfterSplitPct);
  return next === state.beforeAfterSplitPct ? state : { ...state, beforeAfterSplitPct: next };
}

export function selectActiveReviewCut(state: VisualPinReviewState, cutId: string): VisualPinReviewState {
  return state.activeCutId === cutId ? state : { ...state, activeCutId: cutId };
}

export function summarizeReviewPins(pins: readonly ReviewPin[], cutId?: string): ReviewPinSummary {
  const filtered = cutId ? pins.filter((pin) => pin.cutId === cutId) : pins;
  const byStamp: Record<ReviewStampId, number> = {
    "expression-fix": 0, "hand-anatomy": 0, "balloon-pos": 0,
    "bg-perspective": 0, "tone-missing": 0, "approved-stamp": 0,
  };
  const unresolvedByStage: Record<BatonStageId, number> = {
    conti: 0, lineart: 0, "flat-color": 0, shading: 0, lettering: 0, "final-ready": 0,
  };
  let openCount = 0;
  let inProgressCount = 0;
  let resolvedCount = 0;
  let blockingUnresolvedCount = 0;
  let approvedStampCount = 0;

  for (const pin of filtered) {
    byStamp[pin.stampId] += 1;
    if (pin.stampId === "approved-stamp") approvedStampCount += 1;
    if (pin.status === "open") openCount += 1;
    else if (pin.status === "in-progress") inProgressCount += 1;
    else resolvedCount += 1;

    if (getReviewStampSpec(pin.stampId).blocksStageGate && pin.status !== "resolved") {
      blockingUnresolvedCount += 1;
      unresolvedByStage[pin.stageId] += 1;
    }
  }
  return { total: filtered.length, openCount, inProgressCount, resolvedCount, blockingUnresolvedCount, approvedStampCount, byStamp, unresolvedByStage };
}

function formatPinRefPreview(pins: readonly ReviewPin[], isEn: boolean): string {
  const head = pins.slice(0, 3).map((pin) => {
    const stamp = getReviewStampSpec(pin.stampId);
    return isEn ? `Pin ${pin.pinNumber} ${stamp.labelEn}` : `${pin.pinNumber}번 ${stamp.labelKo}`;
  });
  const rest = pins.length - head.length;
  return rest <= 0 ? head.join(", ") : `${head.join(", ")} ${isEn ? `+${rest} more` : `외 ${rest}건`}`;
}

/** 6단계 바통터치 다음 단계 승인 가능 여부를 판정하고 자동 안내·1줄 요약 알림 페이로드를 생성한다. */
export function evaluateStageGateReadiness(state: VisualPinReviewState): StageGateReadinessReport {
  const currentStage = getBatonStageSpec(state.currentStageId);
  const nextStage = currentStage.nextStageId ? getBatonStageSpec(currentStage.nextStageId) : null;
  const unresolvedBlockingPins = state.pins.filter(
    (pin) => getReviewStampSpec(pin.stampId).blocksStageGate && pin.status !== "resolved",
  );
  const currentStageBlockingPins = unresolvedBlockingPins.filter((pin) => getBatonStageSpec(pin.stageId).order <= currentStage.order);
  const upcomingStageBlockingPins = unresolvedBlockingPins.filter((pin) => getBatonStageSpec(pin.stageId).order > currentStage.order);
  const resolvedPinCount = state.pins.filter((pin) => pin.status === "resolved").length;
  const approvedStampCount = state.pins.filter((pin) => pin.stampId === "approved-stamp").length;

  const gateStatus: StageGateStatus = unresolvedBlockingPins.length > 0 ? "blocked" : nextStage === null ? "finalized" : "ready";
  const canAdvance = gateStatus === "ready";
  const stageIndex = BATON_STAGE_IDS.indexOf(currentStage.id);
  const progressSteps = gateStatus === "finalized" ? BATON_STAGE_IDS.length : Math.max(1, stageIndex + (gateStatus === "ready" ? 1 : 0));
  const progressPct = Math.min(100, Math.round((progressSteps / BATON_STAGE_IDS.length) * 100));

  const pinRefs = unresolvedBlockingPins.map((pin) => pin.pinNumber);
  const refKo = formatPinRefPreview(unresolvedBlockingPins, false);
  const refEn = formatPinRefPreview(unresolvedBlockingPins, true);
  const titleTag = `${state.projectTitle} ${state.episodeLabel}`.trim();

  let autoGuidanceKo: string;
  let autoGuidanceEn: string;
  let oneLineSummaryKo: string;
  let oneLineSummaryEn: string;
  let actionPromptKo: string;
  let actionPromptEn: string;

  if (gateStatus === "blocked") {
    const targetKo = nextStage ? `${nextStage.shortLabelKo} 공정 승계` : "최종 납품 확정";
    const targetEn = nextStage ? `handoff to ${nextStage.shortLabelEn}` : "final delivery lock";
    autoGuidanceKo = `미해결 핀 ${unresolvedBlockingPins.length}건(${refKo})이 남아 있습니다. 핀을 완료하면 ${targetKo}가 자동으로 열립니다.`;
    autoGuidanceEn = `${unresolvedBlockingPins.length} open pin(s) (${refEn}) remain. Resolve them to unlock ${targetEn}.`;
    oneLineSummaryKo = normalizeSingleLineComment(`[바통 대기] ${titleTag} · ${currentStage.shortLabelKo}→${nextStage?.shortLabelKo ?? "최종"} 미해결 ${unresolvedBlockingPins.length}건 (${refKo})`, "[바통 대기]", 180);
    oneLineSummaryEn = normalizeSingleLineComment(`[Baton Hold] ${titleTag} · ${currentStage.shortLabelEn}->${nextStage?.shortLabelEn ?? "Final"} ${unresolvedBlockingPins.length} open (${refEn})`, "[Baton Hold]", 180);
    actionPromptKo = `미해결 핀 ${unresolvedBlockingPins.length}건 먼저 완료`;
    actionPromptEn = `Resolve ${unresolvedBlockingPins.length} open pin(s) first`;
  } else if (gateStatus === "ready" && nextStage) {
    autoGuidanceKo = `미해결 핀 0건 — '${currentStage.shortLabelKo}' 검수가 끝나 바로 '${nextStage.shortLabelKo}(${nextStage.ownerRoleKo})'로 바통을 넘길 수 있습니다.`;
    autoGuidanceEn = `0 open pins — '${currentStage.shortLabelEn}' is clear to hand off to '${nextStage.shortLabelEn} (${nextStage.ownerRoleEn})'.`;
    oneLineSummaryKo = normalizeSingleLineComment(`[바통 준비] ${titleTag} · ${currentStage.shortLabelKo} 완료(미해결 0건) → ${nextStage.shortLabelKo}(${nextStage.ownerRoleKo}) 즉시 승계 가능`, "[바통 준비]", 180);
    oneLineSummaryEn = normalizeSingleLineComment(`[Baton Ready] ${titleTag} · ${currentStage.shortLabelEn} clear (0 open) -> ${nextStage.shortLabelEn} (${nextStage.ownerRoleEn}) ready`, "[Baton Ready]", 180);
    actionPromptKo = `${nextStage.shortLabelKo} 공정으로 바통 넘기기`;
    actionPromptEn = `Pass baton to ${nextStage.shortLabelEn}`;
  } else {
    autoGuidanceKo = `전 공정 미해결 핀 0건 · 해결 ${resolvedPinCount}건 확인 완료. 연재본 최종 납품 준비가 끝났습니다.`;
    autoGuidanceEn = `All stages clear (0 open, ${resolvedPinCount} resolved). Episode is ready for final delivery.`;
    oneLineSummaryKo = normalizeSingleLineComment(`[최종 승인] ${titleTag} · 6단계 최종 납품 준비 완료 (해결 ${resolvedPinCount}건 · 승인 도장 ${approvedStampCount}건)`, "[최종 승인]", 180);
    oneLineSummaryEn = normalizeSingleLineComment(`[Final Approved] ${titleTag} · Stage 6 ready (${resolvedPinCount} resolved, ${approvedStampCount} approval stamps)`, "[Final Approved]", 180);
    actionPromptKo = "최종 납품 준비 완료";
    actionPromptEn = "Final delivery ready";
  }

  const notification: StageGateNotificationPayload = {
    channelHint: gateStatus === "blocked" ? "slack" : gateStatus === "ready" ? "notion" : "studio-toast",
    severity: gateStatus, currentStageId: currentStage.id, nextStageId: nextStage?.id ?? null,
    unresolvedCount: unresolvedBlockingPins.length, resolvedCount: resolvedPinCount, pinRefs,
    oneLineSummaryKo, oneLineSummaryEn, actionPromptKo, actionPromptEn,
  };
  return {
    currentStage, nextStage, gateStatus, canAdvance, progressPct,
    unresolvedBlockingPins, currentStageBlockingPins, upcomingStageBlockingPins,
    resolvedPinCount, approvedStampCount, autoGuidanceKo, autoGuidanceEn, notification,
  };
}

/** 바통터치 다음 공정으로 전이한다. 미해결 핀이 남아 있으면 force=true 없이 전이하지 않는다. */
export function advanceBatonStage(state: VisualPinReviewState, options?: AdvanceStageOptions): StageTransitionResult {
  const gateBefore = evaluateStageGateReadiness(state);
  const nextStage = gateBefore.nextStage;
  const forced = Boolean(options?.force);
  if (!nextStage || (!gateBefore.canAdvance && !forced)) {
    return { transitioned: false, state, gate: gateBefore, notification: gateBefore.notification };
  }
  const timestampIso = options?.timestampIso ?? DEFAULT_REVIEW_TIMESTAMP_ISO;
  const actorName = (options?.actorName ?? "").trim() || gateBefore.currentStage.ownerRoleKo;
  const isOverride = !gateBefore.canAdvance && forced;
  const record: StageTransitionRecord = {
    id: `hist-${state.history.length + 1}`, fromStageId: gateBefore.currentStage.id, toStageId: nextStage.id,
    direction: "advance", forced: isOverride, actorName,
    summaryKo: `${gateBefore.currentStage.shortLabelKo} → ${nextStage.shortLabelKo} 바통 승계${isOverride ? " (예외 승인)" : ""}`,
    summaryEn: `Handed off ${gateBefore.currentStage.shortLabelEn} -> ${nextStage.shortLabelEn}${isOverride ? " (override)" : ""}`,
    timestampIso,
  };
  const nextState: VisualPinReviewState = { ...state, currentStageId: nextStage.id, history: [record, ...state.history] };
  const gateAfter = evaluateStageGateReadiness(nextState);
  return { transitioned: true, state: nextState, gate: gateAfter, notification: gateAfter.notification };
}

/** 수정 반려 또는 검수 전환 시 지정 공정으로 바통을 이동한다. */
export function rewindBatonStage(
  state: VisualPinReviewState, targetStageId: BatonStageId, actorName = "메인 작가", timestampIso = DEFAULT_REVIEW_TIMESTAMP_ISO,
): StageTransitionResult {
  if (state.currentStageId === targetStageId) {
    const gate = evaluateStageGateReadiness(state);
    return { transitioned: false, state, gate, notification: gate.notification };
  }
  const fromSpec = getBatonStageSpec(state.currentStageId);
  const toSpec = getBatonStageSpec(targetStageId);
  const record: StageTransitionRecord = {
    id: `hist-${state.history.length + 1}`, fromStageId: fromSpec.id, toStageId: toSpec.id,
    direction: toSpec.order < fromSpec.order ? "rewind" : "advance", forced: false,
    actorName: actorName.trim() || "메인 작가",
    summaryKo: `${fromSpec.shortLabelKo} → ${toSpec.shortLabelKo} 공정 전환`,
    summaryEn: `Switched stage ${fromSpec.shortLabelEn} -> ${toSpec.shortLabelEn}`,
    timestampIso,
  };
  const nextState: VisualPinReviewState = { ...state, currentStageId: targetStageId, history: [record, ...state.history] };
  const gateAfter = evaluateStageGateReadiness(nextState);
  return { transitioned: true, state: nextState, gate: gateAfter, notification: gateAfter.notification };
}

export function summarizeBridgeFidelity(bridge: ExternalBridgeSpec): BridgeFidelitySummary {
  let preservedCount = 0;
  let approximatedCount = 0;
  let flattenedCount = 0;
  for (const row of bridge.mappings) {
    if (row.status === "preserved") preservedCount += 1;
    else if (row.status === "approximated") approximatedCount += 1;
    else flattenedCount += 1;
  }
  const totalMappings = bridge.mappings.length;
  const preservationRatePct = totalMappings === 0 ? 100 : Math.round(((preservedCount + approximatedCount * 0.5) / totalMappings) * 100);
  return { preservedCount, approximatedCount, flattenedCount, totalMappings, preservationRatePct };
}

export function buildVisualReviewDigestMarkdown(
  state: VisualPinReviewState, bridgeId: ExternalBridgeId = "slack-notion-digest", options?: ExternalBridgeManifestOptions,
): string {
  const isEn = options?.locale === "en";
  const scope = options?.scope ?? "episode";
  const bridge = getExternalBridgeSpec(bridgeId);
  const gate = evaluateStageGateReadiness(state);
  const scopedPins = scope === "active-cut" ? state.pins.filter((pin) => pin.cutId === state.activeCutId) : state.pins;
  const summary = summarizeReviewPins(scopedPins);

  const lines: string[] = [
    isEn ? `# Visual Pin Review Digest — ${state.projectTitle} (${state.episodeLabel})` : `# 캔버스 핀 검수 브리프 — ${state.projectTitle} (${state.episodeLabel})`,
    "",
    isEn ? `> ${gate.notification.oneLineSummaryEn}` : `> ${gate.notification.oneLineSummaryKo}`,
    "",
    isEn ? `- **Bridge**: ${bridge.toolNameEn} (${bridge.openStandardFormatEn})` : `- **외부 브리지**: ${bridge.toolNameKo} (${bridge.openStandardFormatKo})`,
    isEn ? `- **Open-Standard Policy**: ${bridge.avoidedProprietaryFormatEn}` : `- **오픈 표준 원칙**: ${bridge.avoidedProprietaryFormatKo}`,
    isEn
      ? `- **Stage**: ${gate.currentStage.labelEn} · Open Blocking Pins: ${summary.blockingUnresolvedCount} · Resolved: ${summary.resolvedCount}`
      : `- **현재 공정**: ${gate.currentStage.labelKo} · 미해결 차단 핀 ${summary.blockingUnresolvedCount}건 · 해결 ${summary.resolvedCount}건`,
    "",
    isEn ? "## Review Pins" : "## 컷 좌표 검수 핀",
  ];

  if (scopedPins.length === 0) {
    lines.push(isEn ? "- No pins registered." : "- 등록된 핀이 없습니다.");
  } else {
    for (const pin of scopedPins) {
      const stamp = getReviewStampSpec(pin.stampId);
      const stage = getBatonStageSpec(pin.stageId);
      const checkMark = pin.status === "resolved" ? "x" : " ";
      const statusLabel = isEn ? pin.status : pin.status === "resolved" ? "해결" : pin.status === "in-progress" ? "수정중" : "미해결";
      lines.push(`- [${checkMark}] ${isEn ? `Pin ${pin.pinNumber}` : `${pin.pinNumber}번`} (${pin.cutId} · ${pin.xPct}%, ${pin.yPct}%) [${isEn ? stamp.labelEn : stamp.labelKo} / ${isEn ? stage.shortLabelEn : stage.shortLabelKo} / ${statusLabel}] ${pin.comment}`);
    }
  }

  lines.push("", isEn ? "## Preservation & Loss Mapping" : "## 손실·보존 매핑표");
  lines.push(isEn ? "| Feature | Status | Detail |" : "| 항목 | 교환 상태 | 상세 |", "| --- | --- | --- |");
  for (const row of bridge.mappings) {
    const statusText = isEn ? row.status : row.status === "preserved" ? "원본 보존" : row.status === "approximated" ? "근사 변환" : "평탄화";
    lines.push(`| ${isEn ? row.featureEn : row.featureKo} | ${statusText} | ${isEn ? row.detailEn : row.detailKo} |`);
  }
  return lines.join("\n");
}

/** 5대 외부 툴 오픈 표준 라운드트립 매니페스트(손실/보존 표 · Markdown · JSON)를 생성한다. */
export function buildExternalBridgeManifest(
  bridgeId: ExternalBridgeId, state: VisualPinReviewState, options?: ExternalBridgeManifestOptions,
): ExternalBridgeManifest {
  const bridge = getExternalBridgeSpec(bridgeId);
  const scope = options?.scope ?? "episode";
  const generatedAtIso = options?.generatedAtIso ?? DEFAULT_REVIEW_TIMESTAMP_ISO;
  const gate = evaluateStageGateReadiness(state);
  const scopedPins = scope === "active-cut" ? state.pins.filter((pin) => pin.cutId === state.activeCutId) : state.pins;
  const pinSummary = summarizeReviewPins(scopedPins);
  const fidelitySummary = summarizeBridgeFidelity(bridge);
  const cutSlug = scope === "active-cut" ? state.activeCutId : "episode";
  const suggestedFileName = `toonstudio-${state.currentStageId}-${cutSlug}-${bridge.id}${bridge.fileExtension}`;
  const markdownDigest = buildVisualReviewDigestMarkdown(state, bridge.id, options);

  const oneLineDigestKo = normalizeSingleLineComment(
    `[${bridge.shortNameKo} · ${bridge.fileExtension}] ${gate.notification.oneLineSummaryKo} (보존 ${fidelitySummary.preservedCount} · 근사 ${fidelitySummary.approximatedCount} · 평탄화 ${fidelitySummary.flattenedCount})`,
    `[${bridge.shortNameKo}] 매니페스트 준비 완료`, 220,
  );
  const oneLineDigestEn = normalizeSingleLineComment(
    `[${bridge.shortNameEn} · ${bridge.fileExtension}] ${gate.notification.oneLineSummaryEn} (Preserved ${fidelitySummary.preservedCount} · Approx ${fidelitySummary.approximatedCount} · Flattened ${fidelitySummary.flattenedCount})`,
    `[${bridge.shortNameEn}] Manifest ready`, 220,
  );

  const episode = {
    projectTitle: state.projectTitle, episodeLabel: state.episodeLabel, activeCutId: state.activeCutId,
    currentStageId: state.currentStageId, nextStageId: gate.nextStage?.id ?? null, gateStatus: gate.gateStatus,
  };
  const serializable = {
    schemaVersion: VISUAL_PIN_BRIDGE_SCHEMA_VERSION, bridgeId: bridge.id, toolName: bridge.toolNameEn,
    openStandardFormat: bridge.openStandardFormatEn, fileExtension: bridge.fileExtension, mimeType: bridge.mimeType,
    proprietaryBypassAvoided: true as const, avoidedProprietaryFormat: bridge.avoidedProprietaryFormatEn,
    suggestedFileName, generatedAtIso, scope, episode,
    notification: {
      oneLineSummaryKo: gate.notification.oneLineSummaryKo, oneLineSummaryEn: gate.notification.oneLineSummaryEn,
      unresolvedCount: gate.notification.unresolvedCount, pinRefs: gate.notification.pinRefs,
    },
    fidelitySummary,
    mappings: bridge.mappings.map((row) => ({
      id: row.id, feature: row.featureEn, status: row.status, detail: row.detailEn, workaround: row.workaroundEn,
    })),
    pins: scopedPins,
  };

  return {
    schemaVersion: VISUAL_PIN_BRIDGE_SCHEMA_VERSION, bridge, proprietaryBypassAvoided: true, scope,
    suggestedFileName, generatedAtIso, episode, pinSummary, pins: scopedPins, fidelitySummary,
    oneLineDigestKo, oneLineDigestEn, markdownDigest, jsonPayload: JSON.stringify(serializable, null, 2),
  };
}
