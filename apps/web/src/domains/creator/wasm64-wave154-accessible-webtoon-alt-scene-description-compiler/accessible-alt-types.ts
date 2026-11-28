/**
 * Wave 154 — 웹툰 컷별 한/영/일 시각장애인·저시력자 접근성 대체텍스트(KWCAG 2.2 · WCAG 2.2 AA · EAA)
 * 및 오디오·점자 대본 컴파일러 계약 타입 정의.
 *
 * - 순수 ES2017 strict TypeScript (`verbatimModuleSyntax` 준수).
 * - 외부 런타임 의존성 없이 브라우저·Worker·Node에서 결정론적으로 동작한다.
 */

/** 지원 접근성 출력 로케일 (한국어·영어·일본어). */
export type AccessibleLocale = "ko-KR" | "en-US" | "ja-JP";

/** 기본 3개국어 로케일 목록. */
export const SUPPORTED_ACCESSIBLE_LOCALES: readonly AccessibleLocale[] = [
  "ko-KR",
  "en-US",
  "ja-JP",
];

/** 간결 Alt-Text 권장 목표 길이 (스크린리더 탐색 피로 방지 기준). */
export const DEFAULT_CONCISE_ALT_TARGET_CHARS = 220;

/** 간결 Alt-Text 비대화 경고 상한 길이 (`alt-length-bloat` 기준). */
export const DEFAULT_CONCISE_ALT_BLOAT_LIMIT_CHARS = 260;

/** Wave 154가 검증하는 국제·국내 웹 접근성 표준 목록. */
export const ACCESSIBILITY_COMPLIANCE_STANDARDS: readonly string[] = [
  "KWCAG 2.2 (1.1.1 적절한 대체 텍스트 제공)",
  "WCAG 2.2 AA (1.1.1 Non-text Content, 1.3.2 Meaningful Sequence)",
  "EAA (Directive (EU) 2019/882 Digital Accessibility)",
];

/** 웹툰 컷 카메라 샷 스케일. */
export type PanelShotScale =
  | "extreme-closeup"
  | "closeup"
  | "medium-shot"
  | "wide-establishing"
  | "insert-detail";

/** 컷 내부 인물 수평 배치 위치. */
export type CharacterHorizontalPosition = "left" | "center" | "right";

/** 말풍선 대사 발화 전달 스타일. */
export type DialogueDeliveryStyle =
  | "normal"
  | "shout"
  | "whisper"
  | "internal"
  | "narration"
  | "offscreen";

/** 접근성 출력 프로파일 구분. */
export type AccessibilityOutputProfile =
  | "concise-alt"
  | "extended-longdesc"
  | "aria-reading-nodes";

/** 컷에 등장하는 인물 메타데이터. */
export interface AccessibleCharacterCue {
  readonly characterId: string;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly nameJa: string;
  readonly horizontalPosition: CharacterHorizontalPosition;
  readonly expressionLabel: string;
  readonly expressionLabelEn?: string;
  readonly expressionLabelJa?: string;
  readonly actionDescription: string;
  readonly actionDescriptionEn?: string;
  readonly actionDescriptionJa?: string;
}

/** 컷에 배치된 발화 순서별 대사 메타데이터. */
export interface AccessibleDialogueCue {
  readonly dialogueId: string;
  readonly order: number;
  readonly speakerId: string;
  readonly speakerName: string;
  readonly speakerNameEn?: string;
  readonly speakerNameJa?: string;
  readonly deliveryStyle: DialogueDeliveryStyle;
  readonly text: string;
  readonly textEn?: string;
  readonly textJa?: string;
}

/** 컷에 그려진 시각 효과음(의성어/의태어) 및 청각 의미 메타데이터. */
export interface AccessibleSfxCue {
  readonly sfxId: string;
  readonly visualGlyph: string;
  readonly semanticMeaning: string;
  readonly semanticMeaningEn?: string;
  readonly semanticMeaningJa?: string;
}

/** 수동 Alt-Text 덮어쓰기 형식 (단일 문자열 또는 로케일별 맵). */
export type ManualAltOverrideInput =
  | string
  | Readonly<Partial<Record<AccessibleLocale, string>>>;

/** 개별 웹툰 컷 접근성 컴파일 입력. */
export interface AccessiblePanelInput {
  readonly panelId: string;
  readonly panelIndex: number;
  readonly shotScale: PanelShotScale;
  readonly settingKo: string;
  readonly settingEn: string;
  readonly settingJa: string;
  readonly lightingMood: string;
  readonly lightingMoodEn?: string;
  readonly lightingMoodJa?: string;
  readonly characters: readonly AccessibleCharacterCue[];
  readonly dialogues: readonly AccessibleDialogueCue[];
  readonly sfxItems: readonly AccessibleSfxCue[];
  readonly manualAltOverride?: ManualAltOverrideInput;
}

/** 회차 단위 웹툰 접근성 컴파일 입력. */
export interface AccessibleEpisodeInput {
  readonly episodeId: string;
  readonly seriesTitleKo: string;
  readonly seriesTitleEn?: string;
  readonly seriesTitleJa?: string;
  readonly episodeTitleKo: string;
  readonly episodeTitleEn?: string;
  readonly episodeTitleJa?: string;
  readonly panels: readonly AccessiblePanelInput[];
}

/** 접근성 컴파일러 동작 옵션. */
export interface CompileAccessibilityOptions {
  readonly conciseAltTargetChars?: number;
  readonly conciseAltBloatLimitChars?: number;
  readonly enableAntiRedundancyDelta?: boolean;
  readonly stripRedundantAltPrefix?: boolean;
  readonly locales?: readonly AccessibleLocale[];
}

/** ARIA 읽기 그래프 노드 유형. */
export type AriaReadingNodeKind =
  | "panel-landmark"
  | "scene-description"
  | "sfx-cue"
  | "dialogue-line";

/** 스크린리더용 ARIA 랜드마크 및 읽기 순서 노드. */
export interface AriaReadingNode {
  readonly nodeId: string;
  readonly panelId: string;
  readonly panelIndex: number;
  readonly readingOrder: number;
  readonly kind: AriaReadingNodeKind;
  readonly ariaRole: "region" | "img" | "note" | "paragraph";
  readonly ariaLabel: string;
  readonly textContent: string;
  readonly lang: AccessibleLocale;
  readonly sourceRefId: string;
  readonly deliveryStyle?: DialogueDeliveryStyle;
  readonly speakerId?: string;
}

/** 컷별 단일 로케일 접근성 컴파일 산출물 (3대 출력 프로파일 포함). */
export interface LocalizedPanelAccessibilityOutput {
  readonly locale: AccessibleLocale;
  readonly panelId: string;
  readonly panelIndex: number;
  readonly conciseAlt: string;
  readonly conciseAltCharCount: number;
  readonly extendedLongdesc: string;
  readonly ariaReadingNodes: readonly AriaReadingNode[];
  readonly reusedPreviousSetting: boolean;
  readonly reusedCharacterIds: readonly string[];
  readonly usedManualAltOverride: boolean;
  readonly strippedRedundantPrefix: boolean;
  readonly transcribedDialogueIds: readonly string[];
  readonly explainedSfxIds: readonly string[];
}

/** 컷별 다국어 통합 접근성 컴파일 결과. */
export interface CompiledAccessiblePanel {
  readonly panelId: string;
  readonly panelIndex: number;
  readonly shotScale: PanelShotScale;
  readonly sourceCharacterCount: number;
  readonly sourceDialogueCount: number;
  readonly sourceSfxCount: number;
  readonly byLocale: Readonly<Record<AccessibleLocale, LocalizedPanelAccessibilityOutput>>;
}

/** 회차 전체 접근성 컴파일 산출물 및 무결성 지문. */
export interface CompiledAccessibleEpisode {
  readonly episodeId: string;
  readonly seriesTitleByLocale: Readonly<Record<AccessibleLocale, string>>;
  readonly episodeTitleByLocale: Readonly<Record<AccessibleLocale, string>>;
  readonly locales: readonly AccessibleLocale[];
  readonly panels: readonly CompiledAccessiblePanel[];
  readonly totalPanelCount: number;
  readonly totalDialogueCount: number;
  readonly totalSfxCount: number;
  readonly antiRedundancySkippedSettingsCount: number;
  readonly conciseAltTargetChars: number;
  readonly conciseAltBloatLimitChars: number;
  readonly accessibilityManifestSha256Hex: string;
}

/** 6대 웹툰 접근성 출고 결함 코드. */
export type AccessibilityDefectCode =
  | "missing-panel-alt"
  | "untranscribed-dialogue"
  | "unexplained-visual-sfx"
  | "redundant-alt-prefix"
  | "alt-length-bloat"
  | "reading-order-gap-or-duplicate";

/** 결함 심각도 (`blocker` 1건 이상이면 출고 차단 fail-closed). */
export type AccessibilityDefectSeverity = "blocker" | "warning";

/** 개별 접근성 결함 감사 레코드. */
export interface AccessibilityAuditDefect {
  readonly defectId: string;
  readonly code: AccessibilityDefectCode;
  readonly severity: AccessibilityDefectSeverity;
  readonly locale: AccessibleLocale;
  readonly panelId: string;
  readonly panelIndex: number;
  readonly standardRef: string;
  readonly messageKo: string;
  readonly evidence: string;
}

/** 회차 접근성 출고 판정. */
export type AccessibilityComplianceVerdict =
  | "pass"
  | "pass-with-warnings"
  | "fail-closed";

/** 컷별 접근성 감사 집계 행 (SVG 게이지 및 타임라인 입력). */
export interface PanelAccessibilityAuditRow {
  readonly panelId: string;
  readonly panelIndex: number;
  readonly conciseAltCharCount: number;
  readonly dialogueCount: number;
  readonly transcribedDialogueCount: number;
  readonly sfxCount: number;
  readonly explainedSfxCount: number;
  readonly ariaNodeCount: number;
  readonly reusedPreviousSetting: boolean;
  readonly blockerCount: number;
  readonly warningCount: number;
  readonly readingOrders: readonly number[];
  readonly hasReadingOrderDefect: boolean;
}

/** 회차 접근성 감사 옵션. */
export interface AuditAccessibilityOptions {
  readonly primaryLocale?: AccessibleLocale;
  readonly locales?: readonly AccessibleLocale[];
  readonly conciseAltBloatLimitChars?: number;
}

/** 회차 접근성 종합 감사 리포트. */
export interface EpisodeAccessibilityAuditReport {
  readonly episodeId: string;
  readonly episodeTitleKo: string;
  readonly primaryLocale: AccessibleLocale;
  readonly checkedLocales: readonly AccessibleLocale[];
  readonly verdict: AccessibilityComplianceVerdict;
  readonly readyForRelease: boolean;
  readonly kwcag22Compliant: boolean;
  readonly wcag22AaCompliant: boolean;
  readonly eaaCompliant: boolean;
  readonly totalPanelCount: number;
  readonly totalDialogueCount: number;
  readonly totalSfxCount: number;
  readonly blockerCount: number;
  readonly warningCount: number;
  readonly altCoveragePercent: number;
  readonly dialogueTranscriptionCoveragePercent: number;
  readonly sfxSemanticCoveragePercent: number;
  readonly averageConciseAltChars: number;
  readonly maxConciseAltChars: number;
  readonly conciseAltTargetChars: number;
  readonly conciseAltBloatLimitChars: number;
  readonly antiRedundancySkippedSettingsCount: number;
  readonly panelMetrics: readonly PanelAccessibilityAuditRow[];
  readonly defects: readonly AccessibilityAuditDefect[];
  readonly defectCountsByCode: Readonly<Record<AccessibilityDefectCode, number>>;
  readonly accessibilityManifestSha256Hex: string;
}

/** 점자·TTS 오디오 드라마 대본 익스포트 옵션. */
export interface ScreenReaderTranscriptExportOptions {
  readonly locale?: AccessibleLocale;
  readonly includePanelHeaders?: boolean;
  readonly includeSfxCues?: boolean;
  readonly includeShotNotes?: boolean;
  readonly brailleSafeAsciiPunctuation?: boolean;
}
