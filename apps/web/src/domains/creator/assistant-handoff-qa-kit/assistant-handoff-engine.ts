import { assertHandoffDocument, assertLayerInputs, MAX_HANDOFF_LAYERS, uniqueHandoffId } from "./handoff-input-contract";

/**
 * Wave 44E — 어시스턴트·외주 분업 인수인계 패키지 & 선화·채색·식자 검수 킷 엔진.
 *
 * - 한국 웹툰 스튜디오 7대 표준 레이어 명명 규약(`01_LINE`..`07_TEXT`) 자동 검증기 (`auditLayerNamingConvention`)
 * - 원클릭 표준명 자동 보정 미리보기 및 일괄 정리 (`buildLayerRenamePreview`, `applyLayerAutoFix`)
 * - 5대 공정(`lineart`, `flat-color`, `shading`, `background-3d`, `lettering`) 체크리스트 + 차단 이슈 집계 (`evaluateHandoffReadiness`)
 * - 컷당 단가 × 공정별 담당 컷 수 기반 어시스턴트 정산 프리뷰 (`estimateAssistantPayout`, `dataSourceKind: "estimate"`, 사용자 입력 세율 가정 계산)
 * - 원클릭 인수인계 브리프(Markdown/JSON) 생성 (`buildHandoffBriefMarkdown`, `exportHandoffPackageJson`)
 *
 * 순수 함수형 모듈: Web Storage · private Map store · BigInt 리터럴 · 원시 색상 리터럴 미사용.
 */

export const STANDARD_LAYER_CODES = ["01_LINE", "02_BASE", "03_SHADOW", "04_LIGHT", "05_BG3D", "06_SFX", "07_TEXT"] as const;
export type StandardLayerCode = (typeof STANDARD_LAYER_CODES)[number];

export const HANDOFF_STAGE_IDS = ["lineart", "flat-color", "shading", "background-3d", "lettering"] as const;
export type HandoffStageId = (typeof HANDOFF_STAGE_IDS)[number];

export const STANDARD_STUDIO_DPIS = [300, 350] as const;
export type StandardStudioDpi = (typeof STANDARD_STUDIO_DPIS)[number];

export type DocumentColorSpace = "sRGB" | "Display-P3" | "CMYK" | "Grayscale" | "AdobeRGB";
export type StudioLayerKind = "raster" | "vector" | "text" | "folder" | "3d";
export type StudioBlendMode = "normal" | "multiply" | "screen" | "overlay" | "add-glow";
export type DeliverableFileFormat = "CLIP" | "PSD" | "TOONSTUDIO";
export type AuditIssueSeverity = "blocker" | "warning";
export type ReadinessVerdict = "ready" | "ready-with-warnings" | "blocked";
export type PayoutDataSourceKind = "estimate";

export type LayerAuditIssueCode =
  | "missing-required-layer" | "arbitrary-layer-name" | "non-standard-layer-name"
  | "hidden-required-layer" | "locked-editable-layer" | "unlocked-upstream-layer"
  | "zero-opacity-layer" | "dpi-mismatch" | "color-space-mismatch"
  | "layer-order-inverted" | "duplicate-exact-name";

export interface StandardLayerSlotSpec {
  readonly code: StandardLayerCode; readonly order: number;
  readonly labelKo: string; readonly labelEn: string; readonly recommendedBlendMode: StudioBlendMode;
  readonly purposeKo: string; readonly purposeEn: string; readonly keywords: readonly string[];
}

export interface StageChecklistItemSpec {
  readonly id: string; readonly stageId: HandoffStageId; readonly isBlocker: boolean;
  readonly titleKo: string; readonly titleEn: string; readonly detailKo: string; readonly detailEn: string;
}

export interface HandoffStageSpec {
  readonly id: HandoffStageId; readonly labelKo: string; readonly labelEn: string;
  readonly shortLabelKo: string; readonly shortLabelEn: string;
  readonly deliverableSummaryKo: string; readonly deliverableSummaryEn: string;
  readonly requiredLayers: readonly StandardLayerCode[];
  readonly editableTargetLayers: readonly StandardLayerCode[];
  readonly upstreamLockedLayers: readonly StandardLayerCode[];
  readonly defaultRatePerCutKrw: number; readonly defaultCutCount: number;
  readonly checklist: readonly StageChecklistItemSpec[];
}

export interface StudioLayerInput {
  readonly id: string; readonly name: string; readonly visible: boolean; readonly locked: boolean;
  readonly kind?: StudioLayerKind; readonly opacityPct?: number; readonly blendMode?: StudioBlendMode;
}

export interface LayerAuditDocumentInput {
  readonly stageId: HandoffStageId; readonly dpi: number; readonly expectedDpi?: StandardStudioDpi;
  readonly colorSpace: DocumentColorSpace; readonly expectedColorSpace?: DocumentColorSpace;
  readonly layers: readonly StudioLayerInput[];
}

export interface LayerAuditIssue {
  readonly id: string; readonly code: LayerAuditIssueCode; readonly severity: AuditIssueSeverity;
  readonly layerId?: string; readonly layerName?: string; readonly targetCode?: StandardLayerCode;
  readonly titleKo: string; readonly titleEn: string; readonly detailKo: string; readonly detailEn: string;
  readonly fixHintKo: string; readonly fixHintEn: string;
}

export interface AuditedLayerEntry {
  readonly layer: StudioLayerInput; readonly matchedCode: StandardLayerCode | null;
  readonly isStandardName: boolean; readonly isArbitraryName: boolean;
  readonly suggestedName: string; readonly issues: readonly LayerAuditIssue[];
}

export interface LayerRenamePreviewItem {
  readonly layerId: string; readonly beforeName: string; readonly afterName: string;
  readonly inferredCode: StandardLayerCode; readonly changed: boolean;
  readonly reasonKo: string; readonly reasonEn: string;
  readonly recommendedVisible: boolean; readonly recommendedLocked: boolean;
}

export interface LayerAuditResult {
  readonly stageId: HandoffStageId; readonly dpi: number; readonly expectedDpi: StandardStudioDpi | null;
  readonly dpiValid: boolean; readonly colorSpace: DocumentColorSpace;
  readonly expectedColorSpace: DocumentColorSpace; readonly colorSpaceValid: boolean;
  readonly presentStandardCodes: readonly StandardLayerCode[];
  readonly missingRequiredCodes: readonly StandardLayerCode[];
  readonly missingOptionalCodes: readonly StandardLayerCode[];
  readonly auditedLayers: readonly AuditedLayerEntry[];
  readonly renamePreview: readonly LayerRenamePreviewItem[];
  readonly issues: readonly LayerAuditIssue[]; readonly blockers: readonly LayerAuditIssue[];
  readonly warnings: readonly LayerAuditIssue[]; readonly standardCompliancePct: number; readonly auditScore: number;
}

export interface EvaluatedChecklistItem extends StageChecklistItemSpec {
  readonly checked: boolean; readonly blocksHandoff: boolean;
}

export interface HandoffBlockerItem {
  readonly id: string; readonly source: "layer-audit" | "checklist" | "custom"; readonly code: string;
  readonly titleKo: string; readonly titleEn: string; readonly actionKo: string; readonly actionEn: string;
}

export interface HandoffReadinessInput {
  readonly document: LayerAuditDocumentInput;
  readonly checkedChecklistIds: readonly string[];
  readonly customBlockers?: readonly string[];
}

export interface HandoffReadinessReport {
  readonly stage: HandoffStageSpec; readonly layerAudit: LayerAuditResult;
  readonly checklistItems: readonly EvaluatedChecklistItem[];
  readonly checkedCount: number; readonly totalChecklistCount: number; readonly checklistCompletionPct: number;
  readonly blockers: readonly HandoffBlockerItem[]; readonly warnings: readonly LayerAuditIssue[];
  readonly blockerCount: number; readonly warningCount: number;
  readonly readinessScore: number; readonly verdict: ReadinessVerdict;
}

export interface StagePayoutAllocationInput {
  readonly stageId: HandoffStageId; readonly assigneeName?: string;
  readonly cutCount: number; readonly ratePerCutKrw: number; readonly rushMultiplierPct?: number;
}

export interface AssistantPayoutInput {
  readonly allocations: readonly StagePayoutAllocationInput[];
  readonly includeWithholdingTax?: boolean;
  readonly nationalIncomeTaxRatePct?: number; readonly localIncomeTaxRatePct?: number;
}

export interface StagePayoutLineEstimate {
  readonly stageId: HandoffStageId; readonly labelKo: string; readonly labelEn: string;
  readonly assigneeName: string; readonly cutCount: number; readonly ratePerCutKrw: number;
  readonly rushMultiplierPct: number; readonly baseSubtotalKrw: number; readonly rushSurchargeKrw: number;
  readonly grossAmountKrw: number; readonly nationalIncomeTaxKrw: number; readonly localIncomeTaxKrw: number;
  readonly withholdingTaxKrw: number; readonly netPayoutKrw: number;
}

export interface AssistantPayoutEstimate {
  readonly dataSourceKind: PayoutDataSourceKind; readonly badgeLabelKo: "추정"; readonly badgeLabelEn: "Estimate";
  readonly includeWithholdingTax: boolean;
  readonly withholdingRatePct: number; readonly nationalIncomeTaxRatePct: number; readonly localIncomeTaxRatePct: number;
  readonly lines: readonly StagePayoutLineEstimate[];
  readonly totalCuts: number; readonly activeStageCount: number;
  readonly totalBaseSubtotalKrw: number; readonly totalRushSurchargeKrw: number; readonly totalGrossAmountKrw: number;
  readonly totalNationalIncomeTaxKrw: number; readonly totalLocalIncomeTaxKrw: number;
  readonly totalWithholdingTaxKrw: number; readonly totalNetPayoutKrw: number; readonly averageGrossPerCutKrw: number;
  readonly estimateNoticeKo: string; readonly estimateNoticeEn: string;
  readonly taxDisclaimerKo: string; readonly taxDisclaimerEn: string;
}

export interface HandoffAutoFixResult {
  readonly nextDocument: LayerAuditDocumentInput;
  readonly renamedCount: number; readonly addedMissingCount: number;
  readonly stateFixCount: number; readonly specFixCount: number; readonly totalFixCount: number;
  readonly renamePreview: readonly LayerRenamePreviewItem[];
}

export interface HandoffBriefContext {
  readonly projectTitle: string; readonly episodeLabel: string;
  readonly senderName: string; readonly receiverName: string;
  readonly dueDateIso: string; readonly deliverableFormat: DeliverableFileFormat;
  readonly notes?: string; readonly readiness: HandoffReadinessReport;
  readonly payout: AssistantPayoutEstimate; readonly locale?: "ko" | "en";
}

function makeSlot(
  code: StandardLayerCode, order: number, labelKo: string, labelEn: string,
  recommendedBlendMode: StudioBlendMode, purposeKo: string, purposeEn: string, keywords: readonly string[],
): StandardLayerSlotSpec {
  return { code, order, labelKo, labelEn, recommendedBlendMode, purposeKo, purposeEn, keywords };
}

function makeChecklistItem(
  stageId: HandoffStageId, id: string, isBlocker: boolean,
  titleKo: string, titleEn: string, detailKo: string, detailEn: string,
): StageChecklistItemSpec {
  return { id, stageId, isBlocker, titleKo, titleEn, detailKo, detailEn };
}

function makeIssue(
  id: string, code: LayerAuditIssueCode, severity: AuditIssueSeverity,
  titleKo: string, titleEn: string, detailKo: string, detailEn: string,
  fixHintKo: string, fixHintEn: string,
  meta?: { readonly layerId?: string; readonly layerName?: string; readonly targetCode?: StandardLayerCode },
): LayerAuditIssue {
  return { id, code, severity, titleKo, titleEn, detailKo, detailEn, fixHintKo, fixHintEn, ...meta };
}

export const STANDARD_LAYER_SLOTS: readonly StandardLayerSlotSpec[] = [
  makeSlot("01_LINE", 1, "선화", "Lineart", "normal", "인물·소품 펜선(참조 레이어 설정 및 틈새 닫힘 기준)", "Character & prop ink lines (closed gaps, reference-ready)", ["선화", "펜선", "라인", "잉크", "선따기", "line", "lineart", "ink"]),
  makeSlot("02_BASE", 2, "밑색", "Flat Color", "normal", "컬러시트 기준 평면 채색(클리핑 부모 레이어)", "Flat base fills matched to official color sheet", ["밑색", "채색", "베이스", "바탕색", "flat", "base", "color", "fill"]),
  makeSlot("03_SHADOW", 3, "명암", "Shadow", "multiply", "곱하기(Multiply) 클리핑 그림자 및 1·2차 음영", "Multiply-clipped primary and secondary shading", ["명암", "그림자", "쉐도우", "음영", "어둠", "shadow", "shade", "multiply"]),
  makeSlot("04_LIGHT", 4, "빛·하이라이트", "Light & Highlight", "screen", "스크린/발광닷지 역광·림라이트·반사광 후보정", "Screen/Add-Glow rim light and specular highlights", ["하이라이트", "역광", "광원", "빛", "라이트", "발광", "후보정", "light", "highlight", "glow", "rim"]),
  makeSlot("05_BG3D", 5, "3D·배경", "3D Background", "normal", "스케치업·블렌더 배경 렌더 및 선추출 레이어", "3D rendered background plates and line extraction", ["배경", "3d", "스케치업", "블렌더", "건축", "bg", "bg3d", "background", "env"]),
  makeSlot("06_SFX", 6, "효과음", "SFX", "normal", "해외 로컬라이제이션 분리가 가능한 의성어·의태어", "Separable hand-lettered sound effects for localization", ["효과음", "의성어", "의태어", "sfx", "sound", "onomatopoeia"]),
  makeSlot("07_TEXT", 7, "대사·식자", "Text & Balloons", "normal", "비래스터화 텍스트 및 벡터 말풍선 레이어", "Editable vector balloons and non-rasterized dialogue text", ["대사", "식자", "말풍선", "텍스트", "글자", "나레이션", "text", "balloon", "letter", "dialogue", "caption"]),
];

export const HANDOFF_STAGE_SPECS: readonly HandoffStageSpec[] = [
  {
    id: "lineart", labelKo: "선화 공정", labelEn: "Lineart Stage", shortLabelKo: "선화", shortLabelEn: "Lineart",
    deliverableSummaryKo: "외곽선 틈새를 닫고 펜 굵기를 통일해 밑색 공정으로 넘깁니다.",
    deliverableSummaryEn: "Close ink gaps and standardize stroke weight before flat coloring.",
    requiredLayers: ["01_LINE"], editableTargetLayers: ["01_LINE"], upstreamLockedLayers: [],
    defaultRatePerCutKrw: 8000, defaultCutCount: 18,
    checklist: [
      makeChecklistItem("lineart", "line-closed-gaps", true, "외곽선 틈새 마감 확인", "Outer ink contours closed", "자동 선택·채우기 누수가 생기지 않도록 머리카락·의상 경계를 닫습니다.", "Close hair and garment contours so bucket fills do not leak."),
      makeChecklistItem("lineart", "line-brush-spec", true, "지정 펜 브러시·안티앨리어싱 일치", "Brush preset & anti-aliasing match", "메인 작가 지정 펜 굵기(표준 1.8~2.5px)와 안티앨리어싱 옵션을 맞춥니다.", "Match studio pen thickness and anti-aliasing spec."),
      makeChecklistItem("lineart", "line-rough-hidden", true, "러프·콘티 레이어 정리", "Rough & storyboard hidden or purged", "인계 파일에 러프 선이 켜진 채 섞이지 않도록 숨기거나 폴더 분리합니다.", "Hide or remove rough sketch layers prior to export."),
      makeChecklistItem("lineart", "line-ref-tag", false, "밑색용 참조 레이어 설정 권장", "Mark 01_LINE as reference layer", "밑색 어시스턴트가 즉시 채우기 작업을 시작할 수 있게 참조 레이어로 지정합니다.", "Tag 01_LINE as reference layer for immediate flat-fill workflow."),
    ],
  },
  {
    id: "flat-color", labelKo: "밑색 공정", labelEn: "Flat Color Stage", shortLabelKo: "밑색", shortLabelEn: "Flat Color",
    deliverableSummaryKo: "캐릭터 공식 컬러시트 값으로 틈새 없이 밑색을 채우고 선화 원본을 보호합니다.",
    deliverableSummaryEn: "Apply flat base colors from the color sheet without altering ink lines.",
    requiredLayers: ["01_LINE", "02_BASE"], editableTargetLayers: ["02_BASE"], upstreamLockedLayers: ["01_LINE"],
    defaultRatePerCutKrw: 5000, defaultCutCount: 24,
    checklist: [
      makeChecklistItem("flat-color", "flat-color-sheet", true, "공식 캐릭터 컬러시트 일치", "Matches official character palette", "피부·헤어·의상 색상을 바이블 스포이드 기준과 오차 없이 맞춥니다.", "Verify skin, hair, and outfit swatches against the character sheet."),
      makeChecklistItem("flat-color", "flat-no-halo", true, "선화 경계 흰 틈(할로)·미채색 0건", "Zero white halo gaps along ink edges", "어두운 배경 검사 레이어를 깔아 선화 안쪽 미채색 틈새를 확인합니다.", "Inspect over a dark check fill to verify zero halo leaks."),
      makeChecklistItem("flat-color", "flat-line-protected", true, "01_LINE 원본 선화 무수정·병합 금지", "01_LINE kept unmerged & untouched", "선화와 밑색을 합치지 않고 01_LINE 보호 잠금을 유지합니다.", "Keep 01_LINE locked and never merge into 02_BASE."),
      makeChecklistItem("flat-color", "flat-part-masks", false, "피부·머리카락·의상 파츠 분리 권장", "Separate skin/hair/outfit sub-masks", "명암 공정에서 파츠별 선택이 빠르도록 경계 색상을 명확히 구분합니다.", "Keep crisp boundaries for faster downstream shading selection."),
    ],
  },
  {
    id: "shading", labelKo: "명암·후보정 공정", labelEn: "Shading & Lighting Stage", shortLabelKo: "명암", shortLabelEn: "Shading",
    deliverableSummaryKo: "씬 광원 방향에 맞춰 클리핑 그림자(03_SHADOW)와 역광(04_LIGHT)을 분리 납품합니다.",
    deliverableSummaryEn: "Deliver clipped shadows and highlights aligned to scene key light.",
    requiredLayers: ["01_LINE", "02_BASE", "03_SHADOW", "04_LIGHT"],
    editableTargetLayers: ["03_SHADOW", "04_LIGHT"], upstreamLockedLayers: ["01_LINE", "02_BASE"],
    defaultRatePerCutKrw: 7000, defaultCutCount: 20,
    checklist: [
      makeChecklistItem("shading", "shade-light-dir", true, "씬 주광원 방향·시간대 통일", "Scene key-light direction consistent", "컷 간 그림자 방향이 뒤집히지 않도록 주광원 화살표와 시간대 톤을 맞춥니다.", "Keep shadow throw direction aligned across consecutive panels."),
      makeChecklistItem("shading", "shade-multiply-clip", true, "03_SHADOW 곱하기·클리핑 비파괴 유지", "03_SHADOW stays Multiply & clipped", "밑색과 병합하지 않고 클리핑 마스크·블렌드 모드를 유지해 수정 여지를 남깁니다.", "Do not flatten shadows into base colors; preserve clipping masks."),
      makeChecklistItem("shading", "shade-highlight-clipping", false, "04_LIGHT 하이라이트 백화 점검", "Check 04_LIGHT highlight blow-out", "모바일 밝기 환경에서 인물 이목구비가 날아가지 않도록 발광 강도를 조절합니다.", "Avoid overblown specular highlights obscuring facial features."),
      makeChecklistItem("shading", "shade-clean-skin", false, "피부 음영 탁도 점검", "Avoid muddy gray skin shadows", "검정·회색 대신 따뜻한 채도 음영으로 피부 생기를 유지합니다.", "Use warm-shifted shadows instead of desaturated gray."),
    ],
  },
  {
    id: "background-3d", labelKo: "3D·배경 공정", labelEn: "3D Background Stage", shortLabelKo: "3D 배경", shortLabelEn: "BG 3D",
    deliverableSummaryKo: "인물 눈높이에 맞춘 3D 카메라 구도와 상업 라이선스 검증 배경(05_BG3D)을 납품합니다.",
    deliverableSummaryEn: "Match 3D camera eye-level to characters and verify asset licenses.",
    requiredLayers: ["01_LINE", "05_BG3D"], editableTargetLayers: ["05_BG3D"], upstreamLockedLayers: ["01_LINE"],
    defaultRatePerCutKrw: 9000, defaultCutCount: 12,
    checklist: [
      makeChecklistItem("background-3d", "bg-eye-level", true, "인물 눈높이·소실점·화각 일치", "Eye-level & perspective match characters", "인물 접지선과 3D 배경 수평선이 어긋나지 않게 맞춥니다.", "Align 3D horizon and focal length with character staging."),
      makeChecklistItem("background-3d", "bg-line-balance", true, "배경 선 추출 굵기·톤 균형", "Background line weight subordinate to ink", "배경 선이 인물 선화보다 두껍지 않도록 감쇠하고 색선 보정을 적용합니다.", "Keep extracted 3D lines thinner and softer than foreground ink."),
      makeChecklistItem("background-3d", "bg-license-bom", true, "3D 에셋·텍스처 상업 연재 라이선스 확인", "Commercial asset license BOM verified", "외주 PC에서 사용한 스케치업·블렌더 소품의 상업 연재 권한을 증빙합니다.", "Confirm every 3D prop and texture carries commercial serialization rights."),
      makeChecklistItem("background-3d", "bg-depth-blur", false, "원경 공기원근·아웃포커스 분리", "Separate depth haze & blur layer", "근경·원경 폴더를 분리해 후보정 시 심도 조절이 가능하도록 구성합니다.", "Split foreground and distant plates for adjustable depth blur."),
    ],
  },
  {
    id: "lettering", labelKo: "식자·효과음 공정", labelEn: "Lettering & SFX Stage", shortLabelKo: "식자", shortLabelEn: "Lettering",
    deliverableSummaryKo: "비래스터화 대사(07_TEXT)와 분리 효과음(06_SFX)으로 국내·해외 동시 출고 규격을 맞춥니다.",
    deliverableSummaryEn: "Keep dialogue editable and SFX separated for domestic and global export.",
    requiredLayers: ["01_LINE", "06_SFX", "07_TEXT"],
    editableTargetLayers: ["06_SFX", "07_TEXT"],
    upstreamLockedLayers: ["01_LINE", "02_BASE", "03_SHADOW", "04_LIGHT", "05_BG3D"],
    defaultRatePerCutKrw: 3500, defaultCutCount: 30,
    checklist: [
      makeChecklistItem("lettering", "text-non-rasterized", true, "07_TEXT 텍스트 레이어 비래스터화 유지", "07_TEXT kept editable (not rasterized)", "오탈자 수정과 해외 번역 교체를 위해 텍스트 레이어를 래스터화하지 않습니다.", "Keep dialogue as live text layers for typo fixes and translation."),
      makeChecklistItem("lettering", "text-font-margin", true, "상업 폰트 라이선스 & 말풍선 여백 준수", "Commercial font license & balloon padding", "허가된 연재 폰트만 사용하고 말풍선 내부 여백을 상하좌우 15% 이상 유지합니다.", "Use licensed fonts only and preserve >=15% inner balloon padding."),
      makeChecklistItem("lettering", "text-sfx-split", true, "06_SFX 효과음과 07_TEXT 대사 분리", "06_SFX separated from 07_TEXT & artwork", "글로벌 연재 식자 교체를 위해 효과음을 배경·명암 레이어에 합치지 않습니다.", "Never flatten SFX into shading or background layers."),
      makeChecklistItem("lettering", "text-mobile-legibility", false, "모바일 800px 기준 가독 폰트 크기 점검", "Mobile 800px legibility verified", "스마트폰 화면 축소 시 작은 괄호 대사가 뭉개지지 않는지 미리보기로 확인합니다.", "Verify small parenthetical lines remain crisp at 800px width."),
    ],
  },
];

const STANDARD_LAYER_PREFIX_PATTERN = /^(01_LINE|02_BASE|03_SHADOW|04_LIGHT|05_BG3D|06_SFX|07_TEXT)(?:_[A-Za-z0-9가-힣-]+)?$/u;
const ARBITRARY_NAME_PATTERNS: readonly RegExp[] = [
  /^레이어\s*\d*(?:\s*복사본(?:\s*\d*)?|\s*사본(?:\s*\d*)?)?$/iu,
  /^layer\s*\d*(?:\s*copy(?:\s*\d*)?)?$/iu,
  /^(?:제목\s*없음|untitled|신규\s*레이어|새\s*레이어|new\s*layer)(?:\s*\d*)?$/iu,
  /^(?:복사본|사본|임시|테스트|temp|tmp|copy|asdf|qwer|zzz)(?:[\s_-]*\d*)?$/iu,
  /^\d+$/u,
];
const STACK_DEPTH_ORDER: Readonly<Record<StandardLayerCode, number>> = {
  "07_TEXT": 1, "06_SFX": 2, "04_LIGHT": 3, "01_LINE": 4, "03_SHADOW": 5, "02_BASE": 6, "05_BG3D": 7,
};

export function getStandardLayerSlotSpec(code: StandardLayerCode): StandardLayerSlotSpec {
  return STANDARD_LAYER_SLOTS.find((slot) => slot.code === code) ?? STANDARD_LAYER_SLOTS[0]!;
}

export function getHandoffStageSpec(stageId: HandoffStageId): HandoffStageSpec {
  return HANDOFF_STAGE_SPECS.find((stage) => stage.id === stageId) ?? HANDOFF_STAGE_SPECS[0]!;
}

export function formatKrwAmount(amount: number, locale: "ko" | "en" = "ko"): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  return locale === "en" ? `KRW ${safe.toLocaleString("en-US")}` : `${safe.toLocaleString("ko-KR")}원`;
}

export function parseStandardLayerCode(layerName: string): StandardLayerCode | null {
  const match = STANDARD_LAYER_PREFIX_PATTERN.exec(layerName.trim());
  if (!match) return null;
  const code = match[1];
  return STANDARD_LAYER_CODES.includes(code as StandardLayerCode) ? (code as StandardLayerCode) : null;
}

export function isArbitraryLayerName(layerName: string): boolean {
  const trimmed = layerName.trim();
  if (trimmed.length === 0) return true;
  if (ARBITRARY_NAME_PATTERNS.some((pattern) => pattern.test(trimmed))) return true;
  return /(?:복사본|사본|\bcopy\b)/iu.test(trimmed) && parseStandardLayerCode(trimmed) === null;
}

function sanitizeSuffixToken(raw: string): string {
  return raw
    .replace(/(?:복사본|사본|\bcopy\b|\blayer\b|레이어)/giu, "")
    .replace(/[^A-Za-z0-9가-힣]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .slice(0, 14);
}

function inferLayerCodeForRename(
  layer: StudioLayerInput, stageSpec: HandoffStageSpec, unassignedRequired: StandardLayerCode[],
): { readonly code: StandardLayerCode; readonly reasonKo: string; readonly reasonEn: string } {
  const exact = parseStandardLayerCode(layer.name);
  if (exact) return { code: exact, reasonKo: "표준 규약 일치", reasonEn: "Matches standard convention" };
  const lower = layer.name.trim().toLowerCase();
  for (const slot of STANDARD_LAYER_SLOTS) {
    if (slot.keywords.some((kw) => lower.includes(kw))) {
      return { code: slot.code, reasonKo: `이름 키워드 기반 ${slot.code}(${slot.labelKo}) 매핑`, reasonEn: `Matched keyword to ${slot.code} (${slot.labelEn})` };
    }
  }
  if (layer.kind === "text") return { code: "07_TEXT", reasonKo: "텍스트 레이어 유형 기반 07_TEXT 추론", reasonEn: "Inferred 07_TEXT from text layer kind" };
  if (layer.kind === "3d") return { code: "05_BG3D", reasonKo: "3D 레이어 유형 기반 05_BG3D 추론", reasonEn: "Inferred 05_BG3D from 3D layer kind" };
  if (layer.blendMode === "multiply") return { code: "03_SHADOW", reasonKo: "곱하기(Multiply) 블렌드 기반 03_SHADOW 추론", reasonEn: "Inferred 03_SHADOW from Multiply blend" };
  if (layer.blendMode === "screen" || layer.blendMode === "add-glow") {
    return { code: "04_LIGHT", reasonKo: "스크린/발광 블렌드 기반 04_LIGHT 추론", reasonEn: "Inferred 04_LIGHT from Screen/Glow blend" };
  }
  const nextMissing = unassignedRequired.shift();
  if (nextMissing) {
    return { code: nextMissing, reasonKo: `${stageSpec.shortLabelKo} 공정 누락 필수 슬롯 ${nextMissing} 할당`, reasonEn: `Assigned missing required slot ${nextMissing}` };
  }
  const fallback = stageSpec.editableTargetLayers[0] ?? "02_BASE";
  return { code: fallback, reasonKo: `현재 공정 주 작업 슬롯(${fallback}) 기준 표준화`, reasonEn: `Standardized to primary stage slot (${fallback})` };
}

/** 레이어 목록을 한국 웹툰 스튜디오 7대 표준 명명 규약으로 자동 보정하는 미리보기를 생성한다. */
export function buildLayerRenamePreview(
  layers: readonly StudioLayerInput[], stageId: HandoffStageId,
): readonly LayerRenamePreviewItem[] {
  assertLayerInputs(layers);
  const stageSpec = getHandoffStageSpec(stageId);
  const alreadyPresent = new Set<StandardLayerCode>();
  const reservedStandardNames = new Set<string>();
  for (const layer of layers) {
    const trimmed = layer.name.trim();
    const code = parseStandardLayerCode(trimmed);
    if (code) {
      alreadyPresent.add(code);
      reservedStandardNames.add(trimmed);
    }
  }
  const unassignedRequired = stageSpec.requiredLayers.filter((code) => !alreadyPresent.has(code));
  const usedNames = new Set<string>();
  const codeCounts: Partial<Record<StandardLayerCode, number>> = {};

  return layers.map((layer) => {
    const trimmed = layer.name.trim();
    const existingCode = parseStandardLayerCode(trimmed);
    const inferred = inferLayerCodeForRename(layer, stageSpec, unassignedRequired);
    const code = existingCode ?? inferred.code;
    const isTaken = (candidate: string): boolean => usedNames.has(candidate) || reservedStandardNames.has(candidate);

    let afterName = trimmed;
    if (!existingCode) {
      const count = (codeCounts[code] ?? 0) + 1;
      codeCounts[code] = count;
      const suffix = sanitizeSuffixToken(trimmed);
      const slot = getStandardLayerSlotSpec(code);
      const isPureKeyword = suffix.length === 0 || slot.keywords.some((kw) => kw === suffix.toLowerCase());
      afterName = !isTaken(code) && (count === 1 || isPureKeyword)
        ? code
        : isPureKeyword ? `${code}_${String(count).padStart(2, "0")}` : `${code}_${suffix}`;
      let seq = 2;
      while (isTaken(afterName)) {
        afterName = `${code}_${String(seq).padStart(2, "0")}`;
        seq += 1;
      }
    } else if (usedNames.has(trimmed)) {
      let seq = 2;
      while (isTaken(`${code}_${String(seq).padStart(2, "0")}`)) seq += 1;
      afterName = `${code}_${String(seq).padStart(2, "0")}`;
    }

    usedNames.add(afterName);
    return {
      layerId: layer.id, beforeName: layer.name, afterName, inferredCode: code, changed: afterName !== layer.name,
      reasonKo: existingCode && afterName === layer.name ? "표준 명명 규약 준수" : existingCode ? "중복 레이어명 번호 접미사 분리" : inferred.reasonKo,
      reasonEn: existingCode && afterName === layer.name ? "Compliant standard layer name" : existingCode ? "Disambiguated duplicate layer name" : inferred.reasonEn,
      recommendedVisible: stageSpec.requiredLayers.includes(code) ? true : layer.visible,
      recommendedLocked: stageSpec.editableTargetLayers.includes(code) ? false : stageSpec.upstreamLockedLayers.includes(code) ? true : layer.locked,
    };
  });
}

/** 한국 웹툰 스튜디오 7대 표준 레이어 명명 규약 · 잠금/비표시 실수 · 300/350 DPI · 색공간을 자동 검증한다. */
export function auditLayerNamingConvention(input: LayerAuditDocumentInput): LayerAuditResult {
  assertHandoffDocument(input);
  const stageSpec = getHandoffStageSpec(input.stageId);
  const dpi = input.dpi;
  const expectedDpi: StandardStudioDpi | null = input.expectedDpi === 350 ? 350 : input.expectedDpi === 300 ? 300 : null;
  const expectedColorSpace: DocumentColorSpace = input.expectedColorSpace ?? "sRGB";
  const colorSpace: DocumentColorSpace = input.colorSpace;

  const issues: LayerAuditIssue[] = [];
  const presentSet = new Set<StandardLayerCode>();
  const seenExactNames = new Set<string>();
  const renamePreview = buildLayerRenamePreview(input.layers, stageSpec.id);
  const renameByLayerId = new Map<string, LayerRenamePreviewItem>(renamePreview.map((item) => [item.layerId, item]));

  const dpiValid = expectedDpi !== null ? dpi === expectedDpi : (dpi === 300 || dpi === 350);
  if (!dpiValid) {
    const tKo = expectedDpi !== null ? `${expectedDpi} DPI` : "300 또는 350 DPI";
    const tEn = expectedDpi !== null ? `${expectedDpi} DPI` : "300 or 350 DPI";
    issues.push(makeIssue(`doc-dpi-${dpi}`, "dpi-mismatch", "blocker", `해상도 규격 불일치 (${dpi} DPI ≠ ${tKo})`, `Resolution mismatch (${dpi} DPI vs ${tEn})`, `현재 원고가 ${dpi} DPI입니다. 스튜디오 표준(${tKo})과 달라 선화 뭉개짐이나 배율 오차가 발생합니다.`, `Document is ${dpi} DPI instead of required ${tEn}.`, `문서 해상도를 ${expectedDpi ?? 300} DPI로 맞추세요.`, `Convert resolution to ${expectedDpi ?? 300} DPI.`));
  }
  const colorSpaceValid = colorSpace === expectedColorSpace;
  if (!colorSpaceValid) {
    issues.push(makeIssue(`doc-colorspace-${colorSpace}`, "color-space-mismatch", "blocker", `색공간 불일치 (${colorSpace} ≠ ${expectedColorSpace})`, `Color space mismatch (${colorSpace} vs ${expectedColorSpace})`, `${colorSpace} 전달 시 어시스턴트 모니터마다 피부톤·명암 채도가 틀어집니다.`, `Delivering ${colorSpace} instead of ${expectedColorSpace} causes color drift.`, `색공간을 ${expectedColorSpace}로 변환·임베드하세요.`, `Convert and embed ${expectedColorSpace}.`));
  }

  const auditedLayers: AuditedLayerEntry[] = input.layers.map((layer) => {
    const layerIssues: LayerAuditIssue[] = [];
    const trimmed = layer.name.trim();
    const matchedCode = parseStandardLayerCode(trimmed);
    const arbitrary = isArbitraryLayerName(trimmed);
    const previewItem = renameByLayerId.get(layer.id);
    const suggestedName = previewItem ? previewItem.afterName : trimmed;
    const meta = { layerId: layer.id, layerName: layer.name, targetCode: matchedCode ?? previewItem?.inferredCode };

    if (matchedCode) {
      presentSet.add(matchedCode);
    } else if (arbitrary) {
      layerIssues.push(makeIssue(`layer-arbitrary-${layer.id}`, "arbitrary-layer-name", "blocker", `임의 레이어명 탐지: "${layer.name || "(빈 이름)"}"`, `Arbitrary layer name: "${layer.name || "(empty)"}"`, "복사본·기본 생성명 상태로는 후공정 어시스턴트가 레이어 역할을 판별할 수 없습니다.", "Generic/copy layer names break downstream assistant handoff.", `표준명 "${suggestedName}"으로 변경하세요.`, `Rename to "${suggestedName}".`, meta));
    } else {
      layerIssues.push(makeIssue(`layer-nonstandard-${layer.id}`, "non-standard-layer-name", "warning", `비표준 레이어명: "${layer.name}"`, `Non-standard layer name: "${layer.name}"`, "한국 스튜디오 7대 표준 접두사(01_LINE~07_TEXT)를 따르지 않는 이름입니다.", "Layer does not start with a standard prefix (01_LINE..07_TEXT).", `표준명 "${suggestedName}"으로 통일하세요.`, `Standardize name to "${suggestedName}".`, meta));
    }

    if (trimmed.length > 0 && seenExactNames.has(trimmed)) {
      layerIssues.push(makeIssue(`layer-duplicate-${layer.id}`, "duplicate-exact-name", "warning", `중복 레이어명: "${trimmed}"`, `Duplicate layer name: "${trimmed}"`, "동일 이름 레이어가 중복되어 자동 배치와 검수 시 혼선이 발생합니다.", "Duplicate layer names confuse batch scripts and reviewers.", `"${suggestedName}"처럼 번호 접미사로 구분하세요.`, `Disambiguate as "${suggestedName}".`, meta));
    }
    if (trimmed.length > 0) seenExactNames.add(trimmed);

    const effCode = matchedCode ?? previewItem?.inferredCode ?? null;
    const isReq = effCode !== null && stageSpec.requiredLayers.includes(effCode);
    const isEdit = effCode !== null && stageSpec.editableTargetLayers.includes(effCode);
    const isUp = effCode !== null && stageSpec.upstreamLockedLayers.includes(effCode);

    if (isReq && !layer.visible) {
      layerIssues.push(makeIssue(`layer-hidden-${layer.id}`, "hidden-required-layer", "blocker", `필수 레이어 비표시 실수: "${layer.name}"`, `Required layer hidden: "${layer.name}"`, `${stageSpec.labelKo} 필수 레이어(${effCode})가 숨겨져 있어 출고 시 누락됩니다.`, `Required ${stageSpec.labelEn} layer (${effCode}) is hidden.`, "레이어 표시(눈 아이콘)를 켜세요.", "Turn layer visibility back on.", meta));
    }
    if (isReq && layer.visible && typeof layer.opacityPct === "number" && layer.opacityPct <= 0) {
      layerIssues.push(makeIssue(`layer-opacity-${layer.id}`, "zero-opacity-layer", "warning", `필수 레이어 불투명도 0%: "${layer.name}"`, `Required layer at 0% opacity: "${layer.name}"`, "표시는 켜져 있으나 불투명도가 0%여서 화면에 출력되지 않습니다.", "Layer is visible but opacity is 0%, rendering blank.", "불투명도를 100%로 복구하세요.", "Restore opacity to 100%.", meta));
    }
    if (isEdit && layer.locked) {
      layerIssues.push(makeIssue(`layer-locked-target-${layer.id}`, "locked-editable-layer", "blocker", `작업 대상 레이어 잠금 실수: "${layer.name}"`, `Editable target layer locked: "${layer.name}"`, `${stageSpec.labelKo} 어시스턴트가 편집해야 할 ${effCode} 레이어가 잠겨 있습니다.`, `Active target layer (${effCode}) for ${stageSpec.labelEn} is locked.`, "인계 전 작업 레이어 잠금을 해제하세요.", "Unlock the active target layer.", meta));
    }
    if (isUp && !layer.locked) {
      layerIssues.push(makeIssue(`layer-unlocked-upstream-${layer.id}`, "unlocked-upstream-layer", "warning", `전공정 완료 레이어 미잠금 주의: "${layer.name}"`, `Upstream layer unlocked: "${layer.name}"`, `${stageSpec.labelKo} 작업 중 전공정 완료본(${effCode})이 실수로 수정될 수 있습니다.`, `Completed upstream layer (${effCode}) is unlocked and exposed to accidental edits.`, `${effCode} 레이어에 보호 잠금을 거세요.`, `Lock ${effCode} to protect upstream artwork.`, meta));
    }

    issues.push(...layerIssues);
    return { layer, matchedCode, isStandardName: matchedCode !== null, isArbitraryName: arbitrary, suggestedName, issues: layerIssues };
  });

  const missingRequiredCodes = stageSpec.requiredLayers.filter((code) => !presentSet.has(code));
  for (const code of missingRequiredCodes) {
    const slot = getStandardLayerSlotSpec(code);
    issues.push(makeIssue(`missing-required-${code}`, "missing-required-layer", "blocker", `필수 표준 레이어 누락: ${code} (${slot.labelKo})`, `Missing required layer: ${code} (${slot.labelEn})`, `${stageSpec.labelKo} 인수인계에 반드시 필요한 ${code} 레이어가 규약명으로 존재하지 않습니다.`, `${stageSpec.labelEn} requires standard layer ${code}, which is missing.`, `원클릭 표준명 자동 보정을 실행하거나 ${code} 레이어를 생성하세요.`, `Run auto-rename or create ${code}.`, { targetCode: code }));
  }

  const firstIdx = (code: StandardLayerCode): number => auditedLayers.findIndex((item) => item.matchedCode === code);
  const idxLine = firstIdx("01_LINE");
  const idxBase = firstIdx("02_BASE");
  const idxBg = firstIdx("05_BG3D");
  if (idxLine >= 0 && idxBase >= 0 && idxBase < idxLine) {
    issues.push(makeIssue("order-base-above-line", "layer-order-inverted", "warning", "레이어 순서 역전: 02_BASE가 01_LINE 위에 위치", "Layer order inverted: 02_BASE sits above 01_LINE", "밑색 레이어가 선화 위에 배치되면 펜선이 가려집니다.", "Placing 02_BASE above 01_LINE obscures character ink lines.", "02_BASE를 01_LINE 아래로 내리세요.", "Move 02_BASE beneath 01_LINE.", { targetCode: "02_BASE" }));
  }
  if (idxLine >= 0 && idxBg >= 0 && idxBg < idxLine) {
    issues.push(makeIssue("order-bg-above-line", "layer-order-inverted", "warning", "레이어 순서 역전: 05_BG3D가 01_LINE 위에 위치", "Layer order inverted: 05_BG3D sits above 01_LINE", "3D 배경 레이어가 인물 선화를 덮고 있습니다.", "3D background layer covers foreground character lineart.", "05_BG3D를 인물 레이어 최하단으로 이동하세요.", "Move 05_BG3D below foreground layers.", { targetCode: "05_BG3D" }));
  }

  const presentStandardCodes = STANDARD_LAYER_CODES.filter((code) => presentSet.has(code));
  const missingOptionalCodes = STANDARD_LAYER_CODES.filter((code) => !presentSet.has(code) && !stageSpec.requiredLayers.includes(code));
  const blockers = issues.filter((issue) => issue.severity === "blocker");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const compliantCount = auditedLayers.filter((item) => item.isStandardName).length;
  const standardCompliancePct = auditedLayers.length > 0 ? Math.round((compliantCount / auditedLayers.length) * 100) : 0;
  const auditScore = Math.max(0, Math.min(100, 100 - blockers.length * 18 - warnings.length * 6));

  return {
    stageId: stageSpec.id, dpi, expectedDpi, dpiValid, colorSpace, expectedColorSpace, colorSpaceValid,
    presentStandardCodes, missingRequiredCodes, missingOptionalCodes, auditedLayers, renamePreview,
    issues, blockers, warnings, standardCompliancePct, auditScore,
  };
}

/** 원클릭 자동 보정: 표준명 적용 + 선택적으로 표시/잠금/누락 레이어/DPI·색공간을 표준으로 정규화한다. */
export function applyLayerAutoFix(
  document: LayerAuditDocumentInput,
  options?: { readonly normalizeStatesAndSpec?: boolean },
): HandoffAutoFixResult {
  assertHandoffDocument(document);
  const normalizeAll = options?.normalizeStatesAndSpec ?? true;
  const stageSpec = getHandoffStageSpec(document.stageId);
  const preview = buildLayerRenamePreview(document.layers, stageSpec.id);
  const previewById = new Map<string, LayerRenamePreviewItem>(preview.map((item) => [item.layerId, item]));

  let renamedCount = 0;
  let stateFixCount = 0;
  const updatedLayers: StudioLayerInput[] = document.layers.map((layer) => {
    const item = previewById.get(layer.id);
    if (!item) return layer;
    if (item.afterName !== layer.name) renamedCount += 1;
    if (!normalizeAll) return { ...layer, name: item.afterName };
    const nextOpacity = typeof layer.opacityPct === "number" && layer.opacityPct <= 0 ? 100 : layer.opacityPct;
    if (item.recommendedVisible !== layer.visible || item.recommendedLocked !== layer.locked || nextOpacity !== layer.opacityPct) {
      stateFixCount += 1;
    }
    return { ...layer, name: item.afterName, visible: item.recommendedVisible, locked: item.recommendedLocked, opacityPct: nextOpacity };
  });

  let addedMissingCount = 0;
  let specFixCount = 0;
  let nextDpi = document.dpi;
  let nextColorSpace = document.colorSpace;

  if (normalizeAll) {
    const present = new Set<StandardLayerCode>(
      updatedLayers.map((l) => parseStandardLayerCode(l.name)).filter((c): c is StandardLayerCode => c !== null),
    );
    const usedIds = new Set(updatedLayers.map((layer) => layer.id));
    for (const reqCode of stageSpec.requiredLayers) {
      if (!present.has(reqCode)) {
        if (updatedLayers.length >= MAX_HANDOFF_LAYERS) throw new RangeError("필수 레이어 추가 시 256개 상한을 넘습니다.");
        const slot = getStandardLayerSlotSpec(reqCode);
        const id = uniqueHandoffId(`auto-${reqCode.toLowerCase()}`, usedIds);
        usedIds.add(id);
        updatedLayers.push({
          id, name: reqCode, visible: true,
          locked: stageSpec.editableTargetLayers.includes(reqCode) ? false : stageSpec.upstreamLockedLayers.includes(reqCode),
          kind: reqCode === "07_TEXT" ? "text" : reqCode === "05_BG3D" ? "3d" : "raster",
          opacityPct: 100, blendMode: slot.recommendedBlendMode,
        });
        addedMissingCount += 1;
      }
    }
    updatedLayers.sort((a, b) => {
      const ca = parseStandardLayerCode(a.name);
      const cb = parseStandardLayerCode(b.name);
      return (ca ? STACK_DEPTH_ORDER[ca] : 50) - (cb ? STACK_DEPTH_ORDER[cb] : 50);
    });
    const targetDpi: StandardStudioDpi = document.expectedDpi ?? (document.dpi === 350 ? 350 : 300);
    if (document.dpi !== targetDpi) {
      nextDpi = targetDpi;
      specFixCount += 1;
    }
    const targetColorSpace: DocumentColorSpace = document.expectedColorSpace ?? "sRGB";
    if (document.colorSpace !== targetColorSpace) {
      nextColorSpace = targetColorSpace;
      specFixCount += 1;
    }
  }

  return {
    nextDocument: { ...document, dpi: nextDpi, colorSpace: nextColorSpace, layers: updatedLayers },
    renamedCount, addedMissingCount, stateFixCount, specFixCount,
    totalFixCount: renamedCount + addedMissingCount + stateFixCount + specFixCount,
    renamePreview: preview,
  };
}

/** 5대 공정 체크리스트와 레이어 감사 결과를 통합해 차단(blocker) 이슈와 인수인계 준비도를 판정한다. */
export function evaluateHandoffReadiness(input: HandoffReadinessInput): HandoffReadinessReport {
  const stage = getHandoffStageSpec(input.document.stageId);
  const layerAudit = auditLayerNamingConvention(input.document);
  if (input.checkedChecklistIds.length > 256 || (input.customBlockers?.length ?? 0) > 256) throw new RangeError("체크리스트·추가 이슈 상한은 256개입니다.");
  if (input.customBlockers?.some((note) => note.length > 4096)) throw new RangeError("추가 이슈 문구 상한은 4096자입니다.");
  const checkedSet = new Set(input.checkedChecklistIds);
  const checklistItems: EvaluatedChecklistItem[] = stage.checklist.map((item) => {
    const checked = checkedSet.has(item.id);
    return { ...item, checked, blocksHandoff: item.isBlocker && !checked };
  });

  const checkedCount = checklistItems.filter((item) => item.checked).length;
  const totalChecklistCount = checklistItems.length;
  const checklistCompletionPct = totalChecklistCount > 0 ? Math.round((checkedCount / totalChecklistCount) * 100) : 100;

  const blockers: HandoffBlockerItem[] = [
    ...layerAudit.blockers.map((issue) => ({
      id: issue.id, source: "layer-audit" as const, code: issue.code,
      titleKo: issue.titleKo, titleEn: issue.titleEn, actionKo: issue.fixHintKo, actionEn: issue.fixHintEn,
    })),
    ...checklistItems.filter((item) => item.blocksHandoff).map((item) => ({
      id: `checklist-${item.id}`, source: "checklist" as const, code: item.id,
      titleKo: `필수 검수 미확인: ${item.titleKo}`, titleEn: `Unchecked blocker QA: ${item.titleEn}`,
      actionKo: item.detailKo, actionEn: item.detailEn,
    })),
    ...(input.customBlockers ?? []).map((note) => note.trim()).filter((note) => note.length > 0).map((note, idx) => ({
      id: `custom-blocker-${idx + 1}`, source: "custom" as const, code: "custom-blocker",
      titleKo: `메인 작가 지정 차단 이슈: ${note}`, titleEn: `Director blocker note: ${note}`,
      actionKo: "해결 후 체크하고 재검수를 요청하세요.", actionEn: "Resolve and request re-check before sign-off.",
    })),
  ];

  const blockerCount = blockers.length;
  const warningCount = layerAudit.warnings.length;
  const weighted = Math.round(layerAudit.auditScore * 0.65 + checklistCompletionPct * 0.35);
  const readinessScore = blockerCount > 0 ? Math.min(79, Math.max(0, weighted - Math.min(25, blockerCount * 4))) : Math.max(0, Math.min(100, weighted));
  const verdict: ReadinessVerdict = blockerCount > 0 ? "blocked" : warningCount > 0 ? "ready-with-warnings" : "ready";

  return {
    stage, layerAudit, checklistItems, checkedCount, totalChecklistCount, checklistCompletionPct,
    blockers, warnings: layerAudit.warnings, blockerCount, warningCount, readinessScore, verdict,
  };
}

export { estimateAssistantPayout, buildHandoffBriefMarkdown, exportHandoffPackageJson } from "./handoff-output";

/** 실무에서 자주 발생하는 레이어 실수(임의 이름·숨김·미잠금 등)가 포함된 공정별 기본 데모 문서를 생성한다. */
export function createSampleHandoffDocument(
  stageId: HandoffStageId = "shading", variant: "with-issues" | "clean" = "with-issues",
): LayerAuditDocumentInput {
  const mk = (id: string, name: string, visible: boolean, locked: boolean, kind: StudioLayerKind, blendMode: StudioBlendMode): StudioLayerInput =>
    ({ id, name, visible, locked, kind, opacityPct: 100, blendMode });
  if (variant === "clean") {
    const up = getHandoffStageSpec(stageId).upstreamLockedLayers;
    return {
      stageId, dpi: 300, expectedDpi: 300, colorSpace: "sRGB", expectedColorSpace: "sRGB",
      layers: [
        mk("l-text", "07_TEXT", true, up.includes("07_TEXT"), "text", "normal"),
        mk("l-sfx", "06_SFX", true, up.includes("06_SFX"), "raster", "normal"),
        mk("l-light", "04_LIGHT", true, up.includes("04_LIGHT"), "raster", "screen"),
        mk("l-line", "01_LINE", true, up.includes("01_LINE"), "vector", "normal"),
        mk("l-shadow", "03_SHADOW", true, up.includes("03_SHADOW"), "raster", "multiply"),
        mk("l-base", "02_BASE", true, up.includes("02_BASE"), "raster", "normal"),
        mk("l-bg3d", "05_BG3D", true, up.includes("05_BG3D"), "3d", "normal"),
      ],
    };
  }
  return {
    stageId, dpi: 300, expectedDpi: 300, colorSpace: "sRGB", expectedColorSpace: "sRGB",
    layers: [
      mk("s-text", "말풍선 대사", true, false, "text", "normal"),
      mk("s-sfx", "06_SFX", true, false, "raster", "normal"),
      mk("s-light", "04_LIGHT", false, false, "raster", "screen"),
      mk("s-line", "01_LINE", true, false, "vector", "normal"),
      mk("s-shadow", "레이어 1 복사본", true, true, "raster", "multiply"),
      mk("s-base", "02_BASE", true, true, "raster", "normal"),
      mk("s-bg3d", "05_BG3D", true, true, "3d", "normal"),
    ],
  };
}

/** 5대 공정 기본 정산 시뮬레이션 입력(추정 참고 단가)을 생성한다. */
export function createDefaultPayoutAllocations(): readonly StagePayoutAllocationInput[] {
  return HANDOFF_STAGE_SPECS.map((stage) => ({
    stageId: stage.id, assigneeName: `${stage.shortLabelKo} 어시스턴트`,
    cutCount: stage.defaultCutCount, ratePerCutKrw: stage.defaultRatePerCutKrw, rushMultiplierPct: 100,
  }));
}
