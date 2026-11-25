/**
 * Wave 45D — 글로벌 IP·OTT·출판 피칭 바이블 자동 조판 스튜디오 엔진.
 *
 * - 12장 에디토리얼 피칭 바이블 구조 생성기 (`buildPitchBibleDeck`)
 * - 25~45자 로그라인 정밀 검증기 (`validateLoglineLength`)
 * - 3종 장르 스타터 (`액션 판타지` · `현대 로맨스` · `미스터리 스릴러`)
 * - 피칭 완성도·누락·과장/허구 통계 감사기 (`auditPitchBibleReadiness`, 0~100점)
 * - 모든 시장·예산 범위 및 감사 지표에 `dataSourceKind: "estimate"` 명시 (허구 통계 생성 금지)
 * - 에디토리얼 Markdown 바이블 (`exportPitchBibleMarkdown`) & JSON 패키지 (`exportPitchBibleJson`)
 *
 * 순수 함수형 모듈: Web Storage · private Map store · BigInt 리터럴 · 원시 색상 리터럴 미사용.
 */

export const PITCH_BIBLE_SCHEMA_VERSION = "toonstudio.global-ip-pitch-bible.v1" as const;
export const PITCH_DATA_SOURCE_KIND = "estimate" as const;
export const LOGLINE_MIN_CHARS = 25;
export const LOGLINE_MAX_CHARS = 45;
export const TARGET_SEASON_EPISODES = 12;
export const TARGET_SEASON_CHAPTERS = 60;
export const RECOMMENDED_CORE_CHARACTERS = 4;

export const PITCH_GENRE_IDS = ["action-fantasy", "modern-romance", "mystery-thriller"] as const;
export type PitchGenreId = (typeof PITCH_GENRE_IDS)[number];

export const PITCH_SLIDE_IDS = [
  "cover", "logline", "creative-intent", "world-rules", "core-characters", "season-arc",
  "visual-tone", "target-positioning", "comp-positioning", "secondary-rights", "production-schedule", "contact",
] as const;
export type PitchSlideId = (typeof PITCH_SLIDE_IDS)[number];

export const SECONDARY_RIGHTS_TRACK_IDS = ["print", "merch", "anime", "game"] as const;
export type SecondaryRightTrackId = (typeof SECONDARY_RIGHTS_TRACK_IDS)[number];

export type PitchDataSourceKind = typeof PITCH_DATA_SOURCE_KIND;
export type LoglineLengthStatus = "empty" | "too-short" | "optimal" | "too-long";
export type PitchAuditSeverity = "blocker" | "warning";
export type PitchAuditCategory = "missing" | "exaggeration" | "structure" | "estimate-guard";
export type PitchReadinessGrade = "pitch-ready" | "needs-polish" | "draft-incomplete";
export type SlideAuditStatus = "ready" | "warning" | "missing";
export type RightsPriority = "core" | "secondary" | "exploratory";

export interface PitchGenreMeta {
  readonly id: PitchGenreId; readonly labelKo: string; readonly labelEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
}
export interface PitchSlideMeta {
  readonly id: PitchSlideId; readonly slideNumber: number; readonly titleKo: string; readonly titleEn: string;
  readonly subtitleKo: string; readonly subtitleEn: string; readonly hasEstimateData: boolean;
}
export interface PitchEstimateRange {
  readonly dataSourceKind: PitchDataSourceKind; readonly badgeLabelKo: "추정"; readonly badgeLabelEn: "Estimate";
  readonly unitKo: string; readonly unitEn: string; readonly minAmount: number; readonly maxAmount: number;
  readonly assumptionKo: string; readonly assumptionEn: string;
}
export interface PitchCoverInput {
  readonly titleKo: string; readonly titleEn: string; readonly taglineKo: string;
  readonly genreBadgeKo: string; readonly formatTargetKo: string; readonly studioName: string;
  readonly serializationStatusKo: string; readonly versionLabel: string; readonly updatedDateIso: string;
}
export interface PitchLoglineInput { readonly loglineKo: string; readonly highConceptHookKo: string; }
export interface PitchCreativeIntentInput {
  readonly originMotifKo: string; readonly universalThemeKo: string;
  readonly globalTimelinessKo: string; readonly directorPromiseKo: string;
}
export interface WorldRuleItem { readonly id: string; readonly titleKo: string; readonly ruleKo: string; readonly costLimitKo: string; }
export interface PitchWorldRulesInput {
  readonly settingSummaryKo: string; readonly conflictMechanismKo: string; readonly rules: readonly WorldRuleItem[];
}
export interface PitchCharacterProfile {
  readonly id: string; readonly nameKo: string; readonly roleKo: string; readonly archetypeKo: string;
  readonly desireKo: string; readonly fatalFlawKo: string; readonly seasonArcKo: string;
}
export interface SeasonArcBlock {
  readonly id: string; readonly actLabelKo: string; readonly episodeRangeLabel: string;
  readonly episodeCount: number; readonly chapterStart: number; readonly chapterEnd: number;
  readonly summaryKo: string; readonly cliffhangerKo: string;
}
export interface PitchSeasonArcInput {
  readonly seasonTitleKo: string; readonly formatNoteKo: string;
  readonly season2HookKo: string; readonly blocks: readonly SeasonArcBlock[];
}
export interface PaletteToneNote { readonly id: string; readonly roleKo: string; readonly oklchSpec: string; readonly usageKo: string; }
export interface PitchVisualToneInput {
  readonly artStyleKo: string; readonly lightingMoodKo: string; readonly cameraGrammarKo: string;
  readonly paletteNotes: readonly PaletteToneNote[]; readonly moodKeywords: readonly string[];
}
export interface PitchTargetPositioningInput {
  readonly primaryAudienceKo: string; readonly secondaryAudienceKo: string;
  readonly ottChannels: readonly string[]; readonly publishingMarkets: readonly string[];
  readonly viewerHookKo: string; readonly addressableRangeEstimate: PitchEstimateRange;
}
export interface CompReferenceEntry {
  readonly id: string; readonly referenceTitleKo: string; readonly mediumKo: string;
  readonly sharedAxisKo: string; readonly differentiationKo: string;
}
export interface PitchCompPositioningInput { readonly positioningFormulaKo: string; readonly entries: readonly CompReferenceEntry[]; }
export interface SecondaryRightTrack {
  readonly id: SecondaryRightTrackId; readonly labelKo: string; readonly labelEn: string;
  readonly windowLabelKo: string; readonly partnerTypeKo: string; readonly priority: RightsPriority;
  readonly deliverableKo: string; readonly budgetRangeEstimate: PitchEstimateRange;
}
export interface PitchSecondaryRightsInput { readonly expansionThesisKo: string; readonly tracks: readonly SecondaryRightTrack[]; }
export interface ProductionMilestone {
  readonly id: string; readonly phaseKo: string; readonly timeframeKo: string;
  readonly deliverableGateKo: string; readonly ownerKo: string;
}
export interface PitchProductionScheduleInput {
  readonly cadenceSummaryKo: string; readonly milestones: readonly ProductionMilestone[];
  readonly totalBudgetEstimate: PitchEstimateRange;
}
export interface PitchContactInput {
  readonly rightsHolderKo: string; readonly representativeKo: string; readonly contactEmail: string;
  readonly availableRights: readonly string[]; readonly materialsReadyKo: string; readonly responseWindowKo: string;
}
export interface PitchBibleInput {
  readonly genreId: PitchGenreId; readonly cover: PitchCoverInput; readonly logline: PitchLoglineInput;
  readonly creativeIntent: PitchCreativeIntentInput; readonly worldRules: PitchWorldRulesInput;
  readonly coreCharacters: readonly PitchCharacterProfile[]; readonly seasonArc: PitchSeasonArcInput;
  readonly visualTone: PitchVisualToneInput; readonly targetPositioning: PitchTargetPositioningInput;
  readonly compPositioning: PitchCompPositioningInput; readonly secondaryRights: PitchSecondaryRightsInput;
  readonly productionSchedule: PitchProductionScheduleInput; readonly contact: PitchContactInput;
}
export interface LoglineValidationResult {
  readonly trimmed: string; readonly charCount: number; readonly charCountNoSpaces: number;
  readonly minChars: number; readonly maxChars: number; readonly status: LoglineLengthStatus;
  readonly isOptimal: boolean; readonly deltaFromRange: number; readonly messageKo: string; readonly messageEn: string;
}
export interface ExaggerationMatch { readonly kind: "overclaim" | "unverified-stat"; readonly matchedText: string; readonly ruleId: string; }
export interface SeasonArcTotals {
  readonly blockCount: number; readonly totalEpisodes: number; readonly totalChapters: number;
  readonly targetEpisodes: number; readonly targetChapters: number; readonly matchesStandard12x60: boolean;
}
export interface PitchBibleSlide {
  readonly id: PitchSlideId; readonly slideNumber: number; readonly titleKo: string; readonly titleEn: string;
  readonly subtitleKo: string; readonly subtitleEn: string; readonly headlineKo: string;
  readonly summaryBulletsKo: readonly string[]; readonly hasEstimateData: boolean;
  readonly dataSourceKind?: PitchDataSourceKind;
}
export interface PitchBibleDeck {
  readonly schemaVersion: typeof PITCH_BIBLE_SCHEMA_VERSION; readonly dataSourceKind: PitchDataSourceKind;
  readonly badgeLabelKo: "추정"; readonly badgeLabelEn: "Estimate";
  readonly estimateDisclaimerKo: string; readonly estimateDisclaimerEn: string;
  readonly genreId: PitchGenreId; readonly input: PitchBibleInput; readonly slides: readonly PitchBibleSlide[];
  readonly loglineValidation: LoglineValidationResult; readonly seasonTotals: SeasonArcTotals;
  readonly characterCount: number; readonly rightsTrackCount: number; readonly allEstimatesTagged: boolean;
}
export interface PitchAuditIssue {
  readonly id: string; readonly code: string; readonly severity: PitchAuditSeverity;
  readonly category: PitchAuditCategory; readonly slideId: PitchSlideId; readonly matchedPhrase?: string;
  readonly titleKo: string; readonly titleEn: string; readonly detailKo: string; readonly detailEn: string;
  readonly fixHintKo: string; readonly fixHintEn: string;
}
export interface SlideReadinessSummary {
  readonly slideId: PitchSlideId; readonly slideNumber: number;
  readonly status: SlideAuditStatus; readonly issueCount: number; readonly blockerCount: number;
}
export interface PitchBibleReadinessAudit {
  readonly score: number; readonly grade: PitchReadinessGrade; readonly dataSourceKind: PitchDataSourceKind;
  readonly badgeLabelKo: "추정"; readonly badgeLabelEn: "Estimate";
  readonly disclaimerKo: string; readonly disclaimerEn: string;
  readonly issues: readonly PitchAuditIssue[]; readonly missingIssues: readonly PitchAuditIssue[];
  readonly exaggerationIssues: readonly PitchAuditIssue[]; readonly structureIssues: readonly PitchAuditIssue[];
  readonly estimateGuardIssues: readonly PitchAuditIssue[]; readonly blockerCount: number; readonly warningCount: number;
  readonly readySlideCount: number; readonly totalSlideCount: number; readonly slideAudits: readonly SlideReadinessSummary[];
}
export interface PitchExportOptions { readonly locale?: "ko" | "en"; }

export const ESTIMATE_DISCLAIMER_KO =
  "시장 규모·예산 범위 및 완성도 점수는 실측 확정치가 아닌 기획 단계 추정(estimate)입니다. 계약 전 파트너 실사 검증이 필요합니다.";
export const ESTIMATE_DISCLAIMER_EN =
  "Market ranges, budget bands, and readiness scores are planning estimates (dataSourceKind: estimate), not audited commercial figures.";

export const PITCH_GENRE_METAS: readonly PitchGenreMeta[] = [
  { id: "action-fantasy", labelKo: "액션 판타지", labelEn: "Action Fantasy", summaryKo: "하이컨셉 세계관·12부작 시즌 액션·애니/게임 확장 중심", summaryEn: "High-concept worldbuilding, 12-ep season action, anime & game expansion" },
  { id: "modern-romance", labelKo: "현대 로맨스", labelEn: "Modern Romance", summaryKo: "감정선 밀도·OTT 드라마 공동제작·글로벌 단행본 중심", summaryEn: "Character-driven drama, OTT series co-production & global print editions" },
  { id: "mystery-thriller", labelKo: "미스터리 스릴러", labelEn: "Mystery Thriller", summaryKo: "에피소드 클리프행어·글로벌 미니시리즈·추리 단행본 확장", summaryEn: "Episodic cliffhangers, global limited series & suspense publishing" },
];

export const PITCH_SLIDE_METAS: readonly PitchSlideMeta[] = [
  { id: "cover", slideNumber: 1, titleKo: "표지", titleEn: "Cover", subtitleKo: "IP 타이틀·포맷·권리 메타", subtitleEn: "Title, format & rights metadata", hasEstimateData: false },
  { id: "logline", slideNumber: 2, titleKo: "로그라인", titleEn: "Logline", subtitleKo: "25~45자 핵심 문장 검증", subtitleEn: "25-45 char core hook validation", hasEstimateData: false },
  { id: "creative-intent", slideNumber: 3, titleKo: "기획 의도", titleEn: "Creative Intent", subtitleKo: "창작 출발점과 보편 정서", subtitleEn: "Creator thesis & universal resonance", hasEstimateData: false },
  { id: "world-rules", slideNumber: 4, titleKo: "세계관 규칙", titleEn: "World Rules", subtitleKo: "핵심 법칙과 대가·갈등 구조", subtitleEn: "Core rules, limits & conflict engine", hasEstimateData: false },
  { id: "core-characters", slideNumber: 5, titleKo: "핵심 캐릭터 4인", titleEn: "4 Core Characters", subtitleKo: "욕망·결함·시즌 1 변화 아크", subtitleEn: "Desire, flaw & Season 1 character arcs", hasEstimateData: false },
  { id: "season-arc", slideNumber: 6, titleKo: "시즌 1 아크 (12부작/60화)", titleEn: "Season 1 Arc (12 Ep / 60 Ch)", subtitleKo: "웹툰 60화↔OTT 12부작 대응", subtitleEn: "60-chapter to 12-episode beat map", hasEstimateData: false },
  { id: "visual-tone", slideNumber: 7, titleKo: "비주얼 톤앤매너", titleEn: "Visual Tone & Manner", subtitleKo: "작화·조명·OKLCH 색감 기조", subtitleEn: "Art direction, lighting & OKLCH palette", hasEstimateData: false },
  { id: "target-positioning", slideNumber: 8, titleKo: "타깃 독자·OTT 포지셔닝", titleEn: "Audience & OTT Positioning", subtitleKo: "핵심 시청층·유통 채널(추정)", subtitleEn: "Core demographics & platforms (estimate)", hasEstimateData: true },
  { id: "comp-positioning", slideNumber: 9, titleKo: "유사 흥행 비교 구도", titleEn: "Comparable Matrix", subtitleKo: "레퍼런스 구조와 차별화 축", subtitleEn: "Reference structure & differentiation", hasEstimateData: false },
  { id: "secondary-rights", slideNumber: 10, titleKo: "2차 판권 확장 맵", titleEn: "Secondary Rights Map", subtitleKo: "단행본·굿즈·애니·게임 로드맵(추정)", subtitleEn: "Print, merch, anime & game map (estimate)", hasEstimateData: true },
  { id: "production-schedule", slideNumber: 11, titleKo: "제작 일정", titleEn: "Production Schedule", subtitleKo: "마일스톤·산출물·예산 범위(추정)", subtitleEn: "Milestones, gates & budget band (estimate)", hasEstimateData: true },
  { id: "contact", slideNumber: 12, titleKo: "협업 문의", titleEn: "Collaboration & Contact", subtitleKo: "협의 가능 권리·샘플 요청", subtitleEn: "Available rights & materials contact", hasEstimateData: false },
];

export const AVAILABLE_RIGHTS_OPTIONS: readonly string[] = [
  "글로벌 전자연재·번역", "단행본 출판", "OTT 드라마 영상화", "애니메이션 공동제작", "굿즈·라이선싱", "게임·인터랙티브",
];

interface ExaggerationRule { readonly id: string; readonly kind: "overclaim" | "unverified-stat"; readonly pattern: RegExp; }

const EXAGGERATION_RULES: readonly ExaggerationRule[] = [
  { id: "ko-guaranteed-hit", kind: "overclaim", pattern: /(?:100%\s*흥행|흥행\s*보장|대박\s*확정|실패\s*없는|무조건\s*(?:성공|흥행|1위)|확정\s*매출)/gu },
  { id: "ko-absolute-rank", kind: "overclaim", pattern: /(?:전\s*세계\s*1위|압도적\s*1위|역대\s*최고\s*(?:흥행|매출|시청률))/gu },
  { id: "ko-unverified-stat", kind: "unverified-stat", pattern: /(?:누적\s*\d+(?:[.,]\d+)?\s*(?:억|천만|만)\s*뷰|조회수\s*\d+(?:[.,]\d+)?\s*(?:억|천만|만)\s*(?:보장|확정)|(?:시장\s*점유율|전환율|시청률|ROI)\s*\d+(?:[.,]\d+)?%|연\s*매출\s*\d+(?:[.,]\d+)?\s*억\s*(?:확정|보장))/giu },
  { id: "en-overclaim", kind: "overclaim", pattern: /\b(?:guaranteed\s+(?:hit|success|blockbuster|no\.?\s*1)|100%\s*(?:success|hit|guaranteed)|proven\s+blockbuster|zero\s+risk)\b/giu },
  { id: "en-unverified-stat", kind: "unverified-stat", pattern: /\b(?:guaranteed\s+\d+(?:[.,]\d+)?\s*(?:m|million|billion)\s+views|roi\s+\d+%)\b/giu },
];

function sanitizeNonNeg(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 10) / 10 : fallback;
}

export function createPitchEstimateRange(params: {
  readonly minAmount: number; readonly maxAmount: number; readonly unitKo: string; readonly unitEn: string;
  readonly assumptionKo: string; readonly assumptionEn: string;
}): PitchEstimateRange {
  return {
    dataSourceKind: PITCH_DATA_SOURCE_KIND, badgeLabelKo: "추정", badgeLabelEn: "Estimate",
    unitKo: params.unitKo, unitEn: params.unitEn,
    minAmount: sanitizeNonNeg(params.minAmount, 0), maxAmount: sanitizeNonNeg(params.maxAmount, 0),
    assumptionKo: params.assumptionKo, assumptionEn: params.assumptionEn,
  };
}

export function formatEstimateRangeLabel(range: PitchEstimateRange, locale: "ko" | "en" = "ko"): string {
  const numLocale = locale === "en" ? "en-US" : "ko-KR";
  const unit = locale === "en" ? range.unitEn : range.unitKo;
  const badge = locale === "en" ? range.badgeLabelEn : range.badgeLabelKo;
  return `${range.minAmount.toLocaleString(numLocale)}~${range.maxAmount.toLocaleString(numLocale)} ${unit} (${badge})`;
}

export function validateLoglineLength(rawLogline: string): LoglineValidationResult {
  const trimmed = rawLogline.trim();
  const charCount = Array.from(trimmed).length;
  const charCountNoSpaces = Array.from(trimmed.replace(/\s+/gu, "")).length;
  const base = { trimmed, charCount, charCountNoSpaces, minChars: LOGLINE_MIN_CHARS, maxChars: LOGLINE_MAX_CHARS };
  if (charCount === 0) {
    return { ...base, status: "empty", isOptimal: false, deltaFromRange: -LOGLINE_MIN_CHARS, messageKo: "로그라인이 비어 있습니다. 주인공·갈등·목표를 25~45자로 압축해 주세요.", messageEn: "Logline is empty. Summarize protagonist, conflict, and goal in 25-45 characters." };
  }
  if (charCount < LOGLINE_MIN_CHARS) {
    const shortage = LOGLINE_MIN_CHARS - charCount;
    return { ...base, status: "too-short", isOptimal: false, deltaFromRange: -shortage, messageKo: `권장 범위(25~45자)보다 ${shortage}자 짧습니다. 갈등이나 대가를 보강하세요.`, messageEn: `${shortage} chars below the 25-45 target band. Add stakes or central conflict.` };
  }
  if (charCount > LOGLINE_MAX_CHARS) {
    const excess = charCount - LOGLINE_MAX_CHARS;
    return { ...base, status: "too-long", isOptimal: false, deltaFromRange: excess, messageKo: `권장 범위(25~45자)보다 ${excess}자 깁니다. 수식어를 덜어 한 호흡으로 줄이세요.`, messageEn: `${excess} chars above the 25-45 target band. Trim modifiers for one-breath clarity.` };
  }
  return { ...base, status: "optimal", isOptimal: true, deltaFromRange: 0, messageKo: `피칭 최적 범위(${charCount}자 / 25~45자)에 들어맞습니다.`, messageEn: `Within optimal pitch range (${charCount} chars / 25-45 target).` };
}

export function detectExaggerationMatches(text: string): readonly ExaggerationMatch[] {
  if (text.trim().length === 0) return [];
  const matches: ExaggerationMatch[] = [];
  const seen = new Set<string>();
  for (const rule of EXAGGERATION_RULES) {
    const re = new RegExp(rule.pattern.source, rule.pattern.flags);
    for (const found of text.matchAll(re)) {
      const phrase = found[0].trim();
      const key = `${rule.id}:${phrase.toLowerCase()}`;
      if (phrase.length > 0 && !seen.has(key)) {
        seen.add(key);
        matches.push({ kind: rule.kind, matchedText: phrase, ruleId: rule.id });
      }
    }
  }
  return matches;
}

function makeDefaultTracks(c: {
  readonly printWindow: string; readonly printDeliv: string; readonly printRange: readonly [number, number];
  readonly merchWindow: string; readonly merchDeliv: string; readonly merchRange: readonly [number, number];
  readonly animeWindow: string; readonly animePartner: string; readonly animeDeliv: string; readonly animeRange: readonly [number, number];
  readonly gameWindow: string; readonly gamePriority: RightsPriority; readonly gameDeliv: string; readonly gameRange: readonly [number, number];
}): readonly SecondaryRightTrack[] {
  return [
    { id: "print", labelKo: "단행본·글로벌 출판", labelEn: "Print & Global Publishing", windowLabelKo: c.printWindow, partnerTypeKo: "국내·북미·일본·유럽 단행본 출판사", priority: "core", deliverableKo: c.printDeliv, budgetRangeEstimate: createPitchEstimateRange({ minAmount: c.printRange[0], maxAmount: c.printRange[1], unitKo: "천만원", unitEn: "10M KRW", assumptionKo: "초판 조판·번역·리터칭 기획 가정(추정)", assumptionEn: "Planning estimate for print layout & translation" }) },
    { id: "merch", labelKo: "굿즈·컬렉터블", labelEn: "Merchandise & Collectibles", windowLabelKo: c.merchWindow, partnerTypeKo: "팬덤 굿즈 제작사·팝업 리테일 파트너", priority: "secondary", deliverableKo: c.merchDeliv, budgetRangeEstimate: createPitchEstimateRange({ minAmount: c.merchRange[0], maxAmount: c.merchRange[1], unitKo: "천만원", unitEn: "10M KRW", assumptionKo: "소량 한정판 SKU 6~10종 초기 생산 가정(추정)", assumptionEn: "Planning estimate for 6-10 limited collector SKUs" }) },
    { id: "anime", labelKo: "애니·드라마 영상화", labelEn: "Anime & OTT Series", windowLabelKo: c.animeWindow, partnerTypeKo: c.animePartner, priority: "core", deliverableKo: c.animeDeliv, budgetRangeEstimate: createPitchEstimateRange({ minAmount: c.animeRange[0], maxAmount: c.animeRange[1], unitKo: "억원", unitEn: "100M KRW", assumptionKo: "시즌 1(12부작) 개발·파일럿 공동제작 범위 가정(추정)", assumptionEn: "Planning estimate for 12-ep Season 1 pilot scope" }) },
    { id: "game", labelKo: "게임·인터랙티브", labelEn: "Game & Interactive", windowLabelKo: c.gameWindow, partnerTypeKo: "중견 개발사·글로벌 인디 퍼블리셔", priority: c.gamePriority, deliverableKo: c.gameDeliv, budgetRangeEstimate: createPitchEstimateRange({ minAmount: c.gameRange[0], maxAmount: c.gameRange[1], unitKo: "억원", unitEn: "100M KRW", assumptionKo: "IP 라이선스 미니멈 개런티·프로토타입 범위 가정(추정)", assumptionEn: "Planning estimate for IP license prototype scope" }) },
  ];
}

function makeRules(rows: readonly (readonly [string, string, string])[]): readonly WorldRuleItem[] {
  return rows.map(([titleKo, ruleKo, costLimitKo], i) => ({ id: `wr-${i + 1}`, titleKo, ruleKo, costLimitKo }));
}
function makeChars(rows: readonly (readonly [string, string, string, string, string, string])[]): readonly PitchCharacterProfile[] {
  return rows.map(([nameKo, roleKo, archetypeKo, desireKo, fatalFlawKo, seasonArcKo], i) => ({
    id: `ch-${i + 1}`, nameKo, roleKo, archetypeKo, desireKo, fatalFlawKo, seasonArcKo,
  }));
}
function makeBlocks(rows: readonly (readonly [string, string, number, number, number, string, string])[]): readonly SeasonArcBlock[] {
  return rows.map(([actLabelKo, episodeRangeLabel, episodeCount, chapterStart, chapterEnd, summaryKo, cliffhangerKo], i) => ({
    id: `act-${i + 1}`, actLabelKo, episodeRangeLabel, episodeCount, chapterStart, chapterEnd, summaryKo, cliffhangerKo,
  }));
}
function makePalettes(rows: readonly (readonly [string, string, string])[]): readonly PaletteToneNote[] {
  return rows.map(([roleKo, oklchSpec, usageKo], i) => ({ id: `pal-${i + 1}`, roleKo, oklchSpec, usageKo }));
}
function makeComps(rows: readonly (readonly [string, string, string, string])[]): readonly CompReferenceEntry[] {
  return rows.map(([referenceTitleKo, mediumKo, sharedAxisKo, differentiationKo], i) => ({
    id: `comp-${i + 1}`, referenceTitleKo, mediumKo, sharedAxisKo, differentiationKo,
  }));
}
function makeMilestones(rows: readonly (readonly [string, string, string, string])[]): readonly ProductionMilestone[] {
  return rows.map(([phaseKo, timeframeKo, deliverableGateKo, ownerKo], i) => ({
    id: `ms-${i + 1}`, phaseKo, timeframeKo, deliverableGateKo, ownerKo,
  }));
}

const STARTER_TEMPLATES: Readonly<Record<PitchGenreId, PitchBibleInput>> = {
  "action-fantasy": {
    genreId: "action-fantasy",
    cover: { titleKo: "잔광의 시계공", titleEn: "Clockmaker of Afterglow", taglineKo: "멈춰 선 태양로를 되돌리는 12부작 스팀·아케인 반격 서사", genreBadgeKo: "액션 판타지 · 어드벤처", formatTargetKo: "글로벌 웹툰(60화) · OTT 12부작 애니/실사", studioName: "스튜디오 아틀리에 레드", serializationStatusKo: "파일럿 1~5화 원고 및 시즌 1 전체 트리트먼트 보유", versionLabel: "Pitch Bible v1.2", updatedDateIso: "2026-11-25" },
    logline: { loglineKo: "시간을 독점한 부유 제국에서 시계공이 금지된 태양로를 깨워 탈환전에 나선다.", highConceptHookKo: "화폐가 곧 남은 수명인 하늘 도시에서, 시간을 수선하는 기술자가 제국의 시계탑을 해체한다." },
    creativeIntent: { originMotifKo: "시간을 아껴 쓰며 살아가는 현대인의 압박을 '수명을 태엽으로 교환하는 제국'이라는 시각적 은유로 번역했다.", universalThemeKo: "권력이 독점한 시간을 되찾는 연대와, 완벽한 영원보다 유한한 오늘을 선택하는 인간성.", globalTimelinessKo: "스팀펑크 공예 미학과 근접 기계 액션은 언어 장벽이 낮아 북미·일본·유럽 독자층에 동시 호소한다.", directorPromiseKo: "매 화 말미에 기계 장치의 물리 법칙을 활용한 역전 시퀀스를 배치해 12부작 영상화 시 명확한 액션 시그니처를 제공한다." },
    worldRules: {
      settingSummaryKo: "상층 태양권(부유 제국)과 하층 황혼권(추락 지대)으로 양분된 수직 도시 군도.",
      conflictMechanismKo: "시간 태엽을 과다 사용하면 사용자의 기억이 역순으로 소실되어, 승리를 위해 소중한 기억을 걸어야 한다.",
      rules: makeRules([
        ["태엽 등가교환 법칙", "모든 기계 마법은 공인 시계탑이 발행한 잔여 시간으로만 가동된다.", "1분 가속 시 최근 기억 1일치가 영구 마모된다."],
        ["금지된 태양로 재점화", "태양로는 하층 지대의 공용 시간을 되살리지만 제국 방공망의 최우선 표적이 된다.", "점화 72시간 내 3개 중계탑을 연결하지 못하면 노심이 붕괴한다."],
        ["영시(00:00) 정지 구역", "매일 자정 3분간 중계탑 밖에서는 모든 물리 운동이 멈춘다.", "정지 구역 안에서 움직일 수 있는 이는 구형 회중시계 소지자뿐이다."],
      ]),
    },
    coreCharacters: makeChars([
      ["강하진", "주인공 · 하층 시계공", "수선공에서 반란 설계자로", "동생의 멈춘 회중시계를 다시 움직이게 한다.", "타인의 희생을 막으려 모든 위험을 혼자 떠안는다.", "개인 복수에서 하층 전체의 공용 시간을 복원하는 연대 리더로 성장한다."],
      ["세라 벨", "조력자 · 제국 전직 항해사", "내부 고발자 전략가", "조작된 천문력 기록을 대중에 공개한다.", "감정보다 확률을 우선해 동료와 충돌한다.", "완벽한 계산 대신 불확실한 동료를 신뢰하는 파트너로 변화한다."],
      ["카일 린", "대립자 · 시계탑 집행관", "질서를 신봉하는 비극적 적수", "부유 도시 추락을 막기 위해 제국 통제를 유지한다.", "하층의 희생을 불가피한 비용으로 합리화한다.", "제국 수뇌부의 은폐를 목격하며 신념이 균열한다."],
      ["노아 영", "핵심 변수 · 기억 수집가", "정보상 겸 규칙 해설자", "사라진 초대 태양로 설계도를 복원한다.", "양쪽 진영에 거래를 걸어 신뢰를 얻지 못한다.", "관망자에서 태양로 점화의 마지막 열쇠를 쥔 조력자로 돌아선다."],
    ]),
    seasonArc: {
      seasonTitleKo: "시즌 1: 멈춘 시계탑의 72시간", formatNoteKo: "웹툰 60화 연재분을 1부당 5화씩 재구성해 OTT 12부작으로 대응",
      season2HookKo: "첫 번째 태양로가 점화된 순간, 제국 너머 해저 시계 도시의 비상 신호가 깨어난다.",
      blocks: makeBlocks([
        ["1막 · 발단", "EP 01~03", 3, 1, 15, "하진이 동생의 시계를 고치다 금지된 태양로 코어를 발견하고 세라와 합류한다.", "영시 정지 구역에서 집행관 카일이 하진의 작업실을 포위한다."],
        ["2막 · 전개", "EP 04~06", 3, 16, 30, "첫 중계탑 잠입 작전 중 기억 소실 부작용과 노아의 이중 거래가 드러난다.", "세라의 과거 천문 기록이 조작되었음이 공개되며 팀이 분열한다."],
        ["3막 · 위기", "EP 07~09", 3, 31, 45, "상층 의회가 하층 전력 차단을 선언하고, 하진은 기억을 걸고 공중 열차를 탈취한다.", "카일이 태양로 코어를 탈취해 중앙 시계탑 최상층으로 퇴각한다."],
        ["4막 · 절정/결말", "EP 10~12", 3, 46, 60, "72시간 카운트다운 속에 3개 중계탑을 동시 점화하고 중앙 시계탑 톱니를 해방한다.", "하층에 첫 일출이 떠오르는 순간, 해저 도시의 거대 시계바늘이 역회전한다."],
      ]),
    },
    visualTone: {
      artStyleKo: "선명한 잉크 선화 위에 붓결 텍스처를 얹은 에디토리얼 시네마틱 웹툰 작화", lightingMoodKo: "황혼 구리빛 역광과 상층 냉백광의 뚜렷한 명암 대비", cameraGrammarKo: "수직 스크롤 낙하감을 강조하는 롱테이크 부감 컷과 기계 기어 클로즈업 교차",
      paletteNotes: makePalettes([["황혼 황동 키 컬러", "oklch(0.68 0.14 58)", "태양로 점화·회중시계 핵심 하이라이트"], ["상층 제국 냉청 회색", "oklch(0.46 0.05 245)", "중앙 시계탑 외벽·집행관 제복 기조"], ["영시 심야 잉크", "oklch(0.22 0.03 255)", "정지 구역 배경·긴장 고조 시퀀스"]]),
      moodKeywords: ["스팀 공예", "수직 낙하 구도", "황혼 역광", "시계태엽 역학"],
    },
    targetPositioning: {
      primaryAudienceKo: "글로벌 18~34세 액션 판타지·애니메이션 코어 시청층", secondaryAudienceKo: "스팀펑크·세계관 몰입형 그래픽노블 독자 및 콘솔 액션 게이머",
      ottChannels: ["글로벌 스트리밍 애니 오리지널", "일본·북미 동시방영 TV/OTT", "글로벌 웹툰 주간 연재"], publishingMarkets: ["한국", "일본", "북미", "프랑스"],
      viewerHookKo: "매 에피소드 '시간 대가'라는 명확한 규칙 위에서 펼쳐지는 두뇌·기계 액션의 쾌감.",
      addressableRangeEstimate: createPitchEstimateRange({ minAmount: 120, maxAmount: 260, unitKo: "만 명(타깃 코어 풀)", unitEn: "10K target core pool", assumptionKo: "주요 4개 권역 액션 판타지 웹툰·애니 구독층 기반 내부 기획 가정(추정)", assumptionEn: "Internal planning estimate across 4 key action-fantasy territories" }),
    },
    compPositioning: {
      positioningFormulaKo: "스팀펑크 계급 도시의 시각 밀도 × 시간 제한 두뇌 반격 서사",
      entries: makeComps([
        ["상하층 수직 도시형 애니 레퍼런스 축", "글로벌 OTT 애니메이션", "계급이 분리된 도시 미술과 앙상블 대립 구도", "단순 힘의 대결이 아닌 '기억을 담보로 한 시간 공학' 규칙으로 전술 긴장 강화"],
        ["시간 역전·루프 기반 스릴러 레퍼런스 축", "웹툰·시리즈 드라마", "회차 말미 강한 클리프행어와 복선 회수 쾌감", "개인 루프 대신 도시 전체가 멈추는 '영시 3분' 공용 룰로 팀 액션 확장"],
        ["장인·공예 소재 소년 판타지 축", "일본·글로벌 출판 만화", "도구 개조와 성장 서사가 주는 수집·굿즈 친화성", "회중시계·태엽 모듈 등 실물 굿즈와 게임 스킬 트리로 직결되는 설계"],
      ]),
    },
    secondaryRights: {
      expansionThesisKo: "회중시계·태엽 도면 같은 물리 아이콘이 출판 특전·굿즈·액션 RPG 메커닉으로 자연스럽게 확장된다.",
      tracks: makeDefaultTracks({ printWindow: "연재 25화 도달 시 1~2권 동시 출간", printDeliv: "양장 컬렉터 에디션 + 세계관 시계 도면 소책자", printRange: [6, 14], merchWindow: "시즌 1 중반 팝업·크라우드 펀딩", merchDeliv: "황동 회중시계 레플리카·아크릴 디오라마·설정 아트북", merchRange: [4, 10], animeWindow: "웹툰 40화 완결권 진입 시 공동제작 착수", animePartner: "글로벌 OTT·한일 애니메이션 공동제작 스튜디오", animeDeliv: "12부작(24분×12) 시리즈 바이블·파일럿 PV 90초", animeRange: [28, 55], gameWindow: "시즌 1 완결 후 프로토타입 라이선싱", gamePriority: "secondary", gameDeliv: "시간 정지 퍼즐-액션 RPG 콘셉트 문서·보스전 데모", gameRange: [12, 26] }),
    },
    productionSchedule: {
      cadenceSummaryKo: "프리프로덕션 3개월 + 주간 연재 15개월(60화) 병행 중 OTT 파일럿 패키징 진행",
      milestones: makeMilestones([["1단계 · 바이블 및 파일럿 1~5화 확정", "2027 Q1", "영문·일문 피칭 바이블 및 1~5화 완성 원고", "원작자·스튜디오 PD"], ["2단계 · 글로벌 웹툰 동시 론칭(1~20화)", "2027 Q2~Q3", "비축 12화 확보 및 4개 언어 식자 검수 완료", "제작팀·현지화 파트너"], ["3단계 · 단행본 1~2권 및 영상화 옵션 계약", "2027 Q4", "시즌 1 12부작 트리트먼트·파일럿 대본 1~2부", "IP 사업·영상 파트너"], ["4단계 · 시즌 1 완결(60화) 및 2차 판권 전개", "2028 Q1~Q2", "단행본 전권·굿즈 1차 라인업·시즌 2 프리뷰", "전 파트너 공동"]]),
      totalBudgetEstimate: createPitchEstimateRange({ minAmount: 4.5, maxAmount: 8.2, unitKo: "억원(웹툰 시즌 1 + 피칭 패키징)", unitEn: "100M KRW (Webtoon S1 + Packaging)", assumptionKo: "60화 스튜디오 제작·4개국 번역·PV 파일럿 제작 기획 가정(추정)", assumptionEn: "Planning estimate for 60-ch production, 4-lang localization & pilot PV" }),
    },
    contact: { rightsHolderKo: "스튜디오 아틀리에 레드 (원작 단독 저작권 보유)", representativeKo: "김서윤 IP 사업 리드", contactEmail: "ip-pitch@atelier-red.example", availableRights: ["글로벌 전자연재·번역", "단행본 출판", "애니메이션 공동제작", "굿즈·라이선싱", "게임·인터랙티브"], materialsReadyKo: "파일럿 1~5화 컬러 원고, 캐릭터 설정집(4인), 60화 전체 시놉시스(한/영)", responseWindowKo: "미팅 요청 접수 후 영업일 3일 이내 전체 자료실 링크 회신" },
  },
  "modern-romance": {
    genreId: "modern-romance",
    cover: { titleKo: "자정 11시, 편집자의 서재", titleEn: "Eleven PM at the Editor's Desk", taglineKo: "폐간 직전 문예지 사무실에서 시작되는 12권의 원고·관계 회복 로맨스", genreBadgeKo: "현대 로맨스 · 오피스 드라마", formatTargetKo: "글로벌 웹툰(60화) · OTT 12부작 실사 드라마", studioName: "페이퍼문 스토리랩", serializationStatusKo: "1~6화 콘티·채색 샘플 및 드라마 1~2부 대본 트리트먼트 보유", versionLabel: "Pitch Bible v1.0", updatedDateIso: "2026-11-25" },
    logline: { loglineKo: "폐간 위기 편집자와 정체를 숨긴 작가가 12권의 원고를 고치며 사랑을 배운다.", highConceptHookKo: "매주 밤 11시 교정지 여백에 남긴 붉은 메모가 두 사람의 오래된 상처를 복원한다." },
    creativeIntent: { originMotifKo: "빠른 소비 속에서 '한 문장을 함께 고치는 느린 다정함'이 주는 치유와 긴장감을 현대 오피스 로맨스로 담았다.", universalThemeKo: "일과 자아를 지키려는 어른들이 서로의 초고를 인정하며 관계의 경계를 넘어서는 과정.", globalTimelinessKo: "한국형 오피스·출판사 배경 로맨스 드라마는 아시아·북미·중남미 OTT에서 안정적인 시즌 제작 수요를 보인다.", directorPromiseKo: "매 에피소드를 1권의 원고 퇴고 미션과 연결해 로맨스 감정선과 출판 현장의 리얼리티를 균형 있게 엮는다." },
    worldRules: {
      settingSummaryKo: "서울 서촌의 30년 된 독립 문예 출판사 '월간 서재'와 인근 심야 서점 거리.",
      conflictMechanismKo: "익명 계약 조항 탓에 작가는 정체를 밝힐 수 없고, 편집자는 판매 부수 기한 내에 잡지를 살려야 한다.",
      rules: makeRules([
        ["자정 11시 교정 약속", "매주 목요일 밤 11시에만 원고 파일과 손글씨 교정 메모를 주고받는다.", "실명 공개 시 기존 출판사와의 위약 조항이 발동한다."],
        ["12호 연속 흑자 조건", "모회사 합병을 막으려면 1년 치 12호의 연속 발행 완주가 필요하다.", "단 한 호라도 결호가 나면 즉시 편집부가 해체된다."],
      ]),
    },
    coreCharacters: makeChars([
      ["윤다혜", "주인공 · 문예지 수석 편집자", "완벽주의 실무자", "스승이 남긴 월간 문예지를 폐간에서 지켜낸다.", "도움을 청하지 못하고 모든 마감을 혼자 버틴다.", "혼자 버티는 책임감에서 함께 쓰는 신뢰의 관계로 마음을 연다."],
      ["한도윤", "주인공 · 익명 베스트셀러 소설가", "은둔형 천재 작가", "과거 표절 누명을 벗고 자신의 이름으로 다시 출간한다.", "세상의 시선을 피하려 관계를 먼저 끊는다.", "익명의 안전지대를 벗어나 다혜의 곁에서 정면으로 마주 선다."],
      ["서지민", "조력자 · 독립 서점 대표", "현실 감각의 중재자", "지역 독자 커뮤니티와 출판사의 상생 모델을 만든다.", "남의 연애엔 명쾌하지만 정작 본인 고민은 숨긴다.", "서재 프로젝트의 오프라인 낭독회를 성사시키며 든든한 축이 된다."],
      ["오태경", "대립자 · 대형 플랫폼 인수 팀장", "효율 중심 구조조정 전문가", "월간 서재의 아카이브 판권만 분리 인수하려 한다.", "콘텐츠의 정서적 가치를 숫자로만 환산한다.", "편집부의 진정성에 흔들리며 상생형 공동 출판안을 제안하게 된다."],
    ]),
    seasonArc: {
      seasonTitleKo: "시즌 1: 12권의 교정지", formatNoteKo: "웹툰 60화를 1권(5화) 단위로 매핑해 OTT 12부작 로맨스 드라마로 구성",
      season2HookKo: "복간 기념 북토크 직후, 두 사람에게 해외 공동 편집 프로젝트 제안서가 도착한다.",
      blocks: makeBlocks([
        ["1막 · 익명 계약", "EP 01~03", 3, 1, 15, "폐간 통보를 받은 다혜가 익명 작가 '자정'의 원고를 발굴하며 심야 교정을 시작한다.", "다혜는 낮에 부딪힌 무뚝뚝한 서점 단골 도윤의 필체가 교정지와 같음을 눈치챈다."],
        ["2막 · 오해와 거리", "EP 04~06", 3, 16, 30, "도윤의 정체를 모른 척한 채 첫 특집호가 호평을 얻고, 두 사람은 빗속에서 가까워진다.", "오태경 팀장이 도윤의 과거 계약 분쟁 자료를 편집부에 들이민다."],
        ["3막 · 정체 공개 위기", "EP 07~09", 3, 31, 45, "도윤이 다혜를 지키기 위해 익명 계약을 해지하려 하고, 편집부는 9호 결호 위기를 맞는다.", "자정 11시 마지막 교정지에 도윤이 처음으로 자신의 실명을 적어 건넨다."],
        ["4막 · 12호 완주와 고백", "EP 10~12", 3, 46, 60, "표절 오해를 정면 해명하고 독자 낭독회와 함께 12호 복간 특집을 완성한다.", "서촌 서재 창가에서 두 사람이 첫 공동 저서의 초고를 함께 펼친다."],
      ]),
    },
    visualTone: {
      artStyleKo: "수채 번짐과 연필 선의 온기를 살린 세련된 어반 감성 로맨스 작화", lightingMoodKo: "심야 스탠드 앰버 조명과 비 온 뒤 서촌 새벽빛의 부드러운 대비", cameraGrammarKo: "손끝·교정 메모·시선 교차를 여백과 함께 포착하는 서정적 미디엄 클로즈업",
      paletteNotes: makePalettes([["심야 스탠드 앰버", "oklch(0.76 0.11 72)", "서재 야근 장면·감정 전환 조명"], ["교정 붉은 잉크 포인트", "oklch(0.56 0.16 24)", "원고 메모·핵심 감정 밑줄 연출"], ["서촌 새벽 슬레이트", "oklch(0.42 0.04 248)", "비 오는 거리·갈등 고조 씬"]]),
      moodKeywords: ["서촌 야경", "교정 메모", "어른 로맨스", "따뜻한 필름 질감"],
    },
    targetPositioning: {
      primaryAudienceKo: "20~39세 현대 로맨스·힐링 오피스 드라마 핵심 시청층", secondaryAudienceKo: "에세이·독립 출판 감성에 공감하는 글로벌 K-로맨스 팬덤",
      ottChannels: ["글로벌 OTT 오리지널 12부작 드라마", "국내 지상파·종편 동시 편성", "글로벌 웹툰 로맨스 메인관"], publishingMarkets: ["한국", "일본", "대만·동남아", "북미"],
      viewerHookKo: "자극적 막장 없이도 원고 한 줄마다 설렘과 긴장을 쌓아 올리는 어른의 오피스 로맨스.",
      addressableRangeEstimate: createPitchEstimateRange({ minAmount: 150, maxAmount: 310, unitKo: "만 명(타깃 코어 풀)", unitEn: "10K target core pool", assumptionKo: "아시아·북미 K-로맨스 드라마 및 웹툰 독자층 기반 내부 기획 가정(추정)", assumptionEn: "Internal planning estimate across Asia & NA K-romance audience pools" }),
    },
    compPositioning: {
      positioningFormulaKo: "출판 오피스 일상의 온기 × 익명 정체 서사의 설레는 텐션",
      entries: makeComps([
        ["출판사·전문직 배경 K-로맨스 드라마 축", "OTT 실사 드라마", "책과 일터가 주는 세련된 미장센과 성숙한 대사 톤", "매 회차 '교정지 붉은 메모'를 시각 장치로 활용해 웹툰·드라마 연출 일체화"],
        ["비밀 정체·계약 관계 현대 로맨스 축", "글로벌 로맨스 웹툰", "낮과 밤의 간극에서 오는 코미디와 설렘", "재벌 클리셰를 배제하고 창작자·편집자의 동등한 프로페셔널 연대로 차별화"],
      ]),
    },
    secondaryRights: {
      expansionThesisKo: "문예지·만년필·북커버 등 작품 속 오브제가 출판·문구·오디오드라마 굿즈로 자연스럽게 확장된다.",
      tracks: makeDefaultTracks({ printWindow: "연재 20화 돌파 시 단행본 1권 + 산문 부록", printDeliv: "실제 문예지 판형 단행본 + 교정 메모 포스트카드 세트", printRange: [5, 11], merchWindow: "단행본 2권 출간 연계 문구 컬래버", merchDeliv: "서재 북커버·교정용 붉은 잉크 노트·향초 에디션", merchRange: [3, 8], animeWindow: "웹툰 30화 시점 실사 드라마 개발 우선 착수", animePartner: "국내외 OTT 드라마 스튜디오·방송사 공동제작", animeDeliv: "12부작(50분×12) 드라마 기획안·파일럿 대본 2부", animeRange: [45, 85], gameWindow: "드라마 방영 후 비주얼 노벨 확장 검토", gamePriority: "exploratory", gameDeliv: "선택형 오디오·텍스트 인터랙티브 외전 시나리오", gameRange: [4, 9] }),
    },
    productionSchedule: {
      cadenceSummaryKo: "웹툰 시즌 1(60화) 선론칭과 동시에 드라마 개발 옵션을 병행 추진하는 투트랙 일정",
      milestones: makeMilestones([["1단계 · 파일럿 1~6화 및 드라마 기획안 완성", "2027 Q1", "컬러 1~6화 + 12부작 드라마 트리트먼트", "원작자·기획 PD"], ["2단계 · 한국·일본·북미 웹툰 동시 론칭", "2027 Q2", "비축 10화 및 번역 스타일 가이드 완료", "스튜디오·플랫폼"], ["3단계 · 실사 드라마 대본 개발·캐스팅 패키징", "2027 Q4", "1~4부 대본 및 제작사 공동개발 계약", "영상화 파트너"], ["4단계 · 시즌 1 완결·단행본 전권 및 문구 굿즈", "2028 Q2", "60화 완결·전 6권 단행본·북토크 팝업", "출판·MD 파트너"]]),
      totalBudgetEstimate: createPitchEstimateRange({ minAmount: 3.4, maxAmount: 6.2, unitKo: "억원(웹툰 시즌 1 + 드라마 개발 패키지)", unitEn: "100M KRW (Webtoon S1 + Drama Dev)", assumptionKo: "60화 로맨스 작화·번역·대본 트리트먼트 개발 기획 가정(추정)", assumptionEn: "Planning estimate for 60-ch art, translation & drama treatment" }),
    },
    contact: { rightsHolderKo: "페이퍼문 스토리랩 (국내외 전 판권 보유)", representativeKo: "박지안 글로벌 IP 매니저", contactEmail: "rights@papermoon-lab.example", availableRights: ["글로벌 전자연재·번역", "단행본 출판", "OTT 드라마 영상화", "굿즈·라이선싱"], materialsReadyKo: "1~6화 완성 원고, 4인 캐릭터 프로필, 12부작 드라마 트리트먼트(한/영)", responseWindowKo: "문의 접수 후 영업일 2일 이내 NDA 및 전체 열람본 안내" },
  },
  "mystery-thriller": {
    genreId: "mystery-thriller",
    cover: { titleKo: "안개항 4번 부두의 기록관", titleEn: "Archivist of Fog Harbor Pier 4", taglineKo: "해무가 덮인 항구에서 20년 전 실종 선박의 음성 기록을 복원하는 12부작 미스터리", genreBadgeKo: "미스터리 스릴러 · 추리 서스펜스", formatTargetKo: "글로벌 웹툰(60화) · OTT 12부작 스릴러 미니시리즈", studioName: "노스피어 아카이브 스튜디오", serializationStatusKo: "1~5화 컬러 원고 및 사건 연표·단서 매트릭스 완비", versionLabel: "Pitch Bible v1.1", updatedDateIso: "2026-11-25" },
    logline: { loglineKo: "해무 낀 부두에 남은 실종자 음성을 쫓는 기록관이 20년 전 진실과 마주한다.", highConceptHookKo: "매년 해무 경보가 울리는 밤, 낡은 등대 무전기에 기록되지 않은 조난 음성이 도착한다." },
    creativeIntent: { originMotifKo: "사라진 항구 마을의 기록 보관소에서 출발해, 망각을 강요하는 공동체와 끝까지 기록하려는 개인의 대결을 그렸다.", universalThemeKo: "덮어둔 과거는 반드시 되돌아오며, 진실을 증언하는 용기가 다음 세대를 구한다.", globalTimelinessKo: "북유럽 누아르 감성의 해양 미스터리는 글로벌 OTT 미니시리즈 시장에서 국경 없이 강한 몰입을 만든다.", directorPromiseKo: "매 5화마다 하나의 음성 테이프 단서를 해독하고 거짓 증언을 뒤집는 페어플레이 추리 구조를 유지한다." },
    worldRules: {
      settingSummaryKo: "1년의 절반이 해무에 잠기는 폐쇄적 항구 도시 '백무항'과 구 등대 기록 보관소.",
      conflictMechanismKo: "해무가 짙어져 선박 통항이 중단되는 18시간 동안 외부 수사 지원이 끊긴 밀실 상태가 형성된다.",
      rules: makeRules([
        ["해무 밀실 18시간", "해무 경보 발령 시 육로 터널과 연안 선박이 모두 통제되어 항구가 고립된다.", "증거 확보 전 경보가 풀리면 관련 기록이 항만청 권한으로 봉인된다."],
        ["자기 테이프 1회 재생 마모", "20년 된 습기 찬 조난 무전 테이프는 재생할수록 잡음이 늘어 음성 판독이 어려워진다.", "3회 이상 재생 시 결정적 증언 구간이 영구 손실된다."],
      ]),
    },
    coreCharacters: makeChars([
      ["정해원", "주인공 · 항만 기록관", "집요한 아키비스트", "20년 전 실종된 아버지가 누명을 벗도록 진실을 밝힌다.", "기록만 믿고 살아 있는 증인의 감정을 놓치곤 한다.", "차가운 문서 해석자에서 피해자 유가족과 연대하는 증언자로 변화한다."],
      ["최민재", "조력자 · 해양경찰 수사관", "원칙주의 현장 형사", "미제로 남은 4번 부두 선박 침몰 사건을 재수사한다.", "상부 지시와 현장 양심 사이에서 결정을 미룬다.", "조직의 침묵을 깨고 공식 재심 청구를 밀어붙인다."],
      ["백도현", "대립자 · 항만 개발 조합장", "선의를 가장한 권력자", "4번 부두 재개발 승인을 위해 과거 사고 기록을 폐기한다.", "마을의 번영이라는 명분으로 개인의 희생을 정당화한다.", "자신의 안전을 위해 가장 믿었던 측근마저 배신하며 파국으로 치닫는다."],
      ["유소영", "핵심 증인 · 전직 등대 통신원", "비밀을 품은 목격자", "20년간 숨겨온 원본 항해 일지를 안전하게 넘긴다.", "과거의 죄책감 때문에 결정적 순간에 도피한다.", "공포를 이겨내고 청문회에서 마지막 진실을 증언한다."],
    ]),
    seasonArc: {
      seasonTitleKo: "시즌 1: 4번 부두의 일곱 개 테이프", formatNoteKo: "웹툰 60화를 12개 단서 파일로 쪼개 OTT 12부작 미스터리 미니시리즈로 설계",
      season2HookKo: "사건 종결 후 기록 보관소 지하에서 인접 항구의 미공개 조난 테이프 상자가 발견된다.",
      blocks: makeBlocks([
        ["1막 · 첫 무전", "EP 01~03", 3, 1, 15, "해원이 4번 부두 폐창고에서 20년 전 선박의 미등록 무전 테이프를 발견한다.", "테이프 끝부분에서 이미 사망 처리된 선장의 목소리가 현재 날짜를 부른다."],
        ["2막 · 조작된 항해 일지", "EP 04~06", 3, 16, 30, "민재와 공조해 항만 기록의 위조 흔적을 추적하고 전 통신원 소영을 찾아낸다.", "기록 보관소에 방화가 발생하고 3번 테이프가 사라진다."],
        ["3막 · 해무 고립 18시간", "EP 07~09", 3, 31, 45, "짙은 해무로 항구가 고립된 밤, 용의자들이 4번 부두 등대에 모여 심리전을 벌인다.", "해원의 아버지가 사고 책임자가 아니라 구조 신호를 보낸 인물임이 드러난다."],
        ["4막 · 진실 공개", "EP 10~12", 3, 46, 60, "마지막 테이프의 잔여 음성을 복원해 백도현의 보험 사기와 은폐 공모를 입증한다.", "해무가 걷힌 새벽, 보관소 지하 금고에서 또 다른 항구의 사건 파일이 열린다."],
      ]),
    },
    visualTone: {
      artStyleKo: "거친 연필 해칭과 차분한 저채도 명암을 활용한 누아르 에디토리얼 작화", lightingMoodKo: "안개 속 나트륨 가로등과 등대 탐조등이 가르는 날카로운 실루엣 대비", cameraGrammarKo: "좁은 시야의 안개 프레임과 테이프 파형·문서 인서트를 교차하는 서스펜스 리듬",
      paletteNotes: makePalettes([["해무 심해 청회", "oklch(0.36 0.04 228)", "안개 낀 부두·폐쇄 공간 기본 톤"], ["등대 나트륨 호박색", "oklch(0.74 0.14 70)", "탐조등·단서 발견 결정적 프레임"], ["봉인 인주 적갈색", "oklch(0.50 0.13 28)", "기밀 문서 도장·위험 경보 포인트"]]),
      moodKeywords: ["해양 누아르", "아날로그 테이프", "안개 밀실", "정밀 추리"],
    },
    targetPositioning: {
      primaryAudienceKo: "25~44세 미스터리·범죄 스릴러 OTT 시리즈 및 추리 장르 애호가", secondaryAudienceKo: "아날로그 기록·밀실 추리 그래픽노블 및 추리 어드벤처 게임 유저",
      ottChannels: ["글로벌 OTT 리미티드 스릴러 시리즈", "유럽·북미 그래픽노블 출판", "글로벌 웹툰 스릴러관"], publishingMarkets: ["한국", "북미", "프랑스·독일", "일본"],
      viewerHookKo: "초자연 장치 없이 아날로그 테이프·항해 기록의 물리 단서만으로 숨 막히는 반전을 설계한다.",
      addressableRangeEstimate: createPitchEstimateRange({ minAmount: 100, maxAmount: 220, unitKo: "만 명(타깃 코어 풀)", unitEn: "10K target core pool", assumptionKo: "글로벌 스릴러 미니시리즈·추리 그래픽노블 구독층 기반 내부 기획 가정(추정)", assumptionEn: "Internal planning estimate across mystery thriller series & graphic novel pools" }),
    },
    compPositioning: {
      positioningFormulaKo: "항구 밀실의 북유럽 누아르 분위기 × 음성 단서 해독 페어플레이 추리",
      entries: makeComps([
        ["해안 소도시 실종 추적 미니시리즈 축", "글로벌 OTT 스릴러", "폐쇄적 지역 공동체와 오래된 비밀의 층위", "단순 형사물에서 벗어나 '기록관과 자기 테이프 복원'이라는 청각·문서 추리 축 도입"],
        ["문서·녹취 기반 추리 서스펜스 웹툰 축", "웹툰·그래픽노블", "독자가 함께 단서를 대조하는 참여형 쾌감", "단행본 및 인터랙티브 추리 게임으로 직결되는 실물 사건 파일 구조"],
      ]),
    },
    secondaryRights: {
      expansionThesisKo: "7개의 조난 테이프와 항해 일지가 실물 사건 파일 단행본·추리 보드게임·오디오 스릴러로 확장된다.",
      tracks: makeDefaultTracks({ printWindow: "시즌 중반 단행본 + 실물 단서 봉투 동봉", printDeliv: "하드커버 추리 단행본 + 사건 기록 복제 엽서 7종", printRange: [5, 12], merchWindow: "완결 시점 추리 키트·오디오북 연계", merchDeliv: "사건 파일 추리 보드 키트·카세트형 사운드트랙 에디션", merchRange: [3, 9], animeWindow: "웹툰 30화 시점 OTT 실사 미니시리즈 개발", animePartner: "글로벌 OTT 스릴러 제작사·국제 공동제작 스튜디오", animeDeliv: "12부작(45분×12) 시리즈 바이블·단서 연표 매트릭스", animeRange: [50, 95], gameWindow: "시즌 1 완결 후 인디 추리 어드벤처 개발", gamePriority: "secondary", gameDeliv: "음성 테이프 분석·문서 대조형 PC/모바일 추리 게임 기획서", gameRange: [6, 15] }),
    },
    productionSchedule: {
      cadenceSummaryKo: "사건 연표 전편 설계 완료 후 60화 연재와 글로벌 리미티드 시리즈 피칭을 동시 진행",
      milestones: makeMilestones([["1단계 · 전편 단서 매트릭스 및 1~5화 완성", "2027 Q1", "60화 사건 연표 + 1~5화 컬러 파일럿", "원작자·추리 감수팀"], ["2단계 · 글로벌 웹툰 연재 개시(1~20화)", "2027 Q2~Q3", "비축 12화 확보 및 영/불/일 번역 완료", "스튜디오·현지화팀"], ["3단계 · OTT 시리즈 옵션 및 단행본 1~2권", "2027 Q4", "시리즈 바이블·파일럿 대본·단행본 초판", "영상·출판 파트너"], ["4단계 · 시즌 1 완결 및 추리 게임 프로토타입", "2028 Q2", "60화 완결·추리 키트·게임 데모 빌드", "라이선싱 파트너"]]),
      totalBudgetEstimate: createPitchEstimateRange({ minAmount: 3.8, maxAmount: 7.0, unitKo: "억원(웹툰 시즌 1 + 시리즈 패키징)", unitEn: "100M KRW (Webtoon S1 + Series Package)", assumptionKo: "60화 스릴러 작화·음향 모티프 자문·국제 피칭 번역 가정(추정)", assumptionEn: "Planning estimate for 60-ch art, consulting & international pitch pack" }),
    },
    contact: { rightsHolderKo: "노스피어 아카이브 스튜디오 (저작권 100% 자체 보유)", representativeKo: "이도현 IP 프로듀서", contactEmail: "pitch@northpier-studio.example", availableRights: ["글로벌 전자연재·번역", "단행본 출판", "OTT 드라마 영상화", "게임·인터랙티브"], materialsReadyKo: "1~5화 원고, 전체 사건 연표·단서표, 12부작 트리트먼트(한/영/불)", responseWindowKo: "문의 접수 후 영업일 3일 이내 비밀유지서약 및 자료 패키지 전달" },
  },
};

function cloneEstimateRange(r: PitchEstimateRange): PitchEstimateRange {
  return {
    dataSourceKind: PITCH_DATA_SOURCE_KIND, badgeLabelKo: "추정", badgeLabelEn: "Estimate",
    unitKo: r.unitKo, unitEn: r.unitEn,
    minAmount: sanitizeNonNeg(r.minAmount, 0), maxAmount: sanitizeNonNeg(r.maxAmount, 0),
    assumptionKo: r.assumptionKo, assumptionEn: r.assumptionEn,
  };
}

export function createPitchBibleStarter(genreId: PitchGenreId = "action-fantasy"): PitchBibleInput {
  const s = STARTER_TEMPLATES[genreId];
  return {
    genreId: s.genreId, cover: { ...s.cover }, logline: { ...s.logline }, creativeIntent: { ...s.creativeIntent },
    worldRules: { settingSummaryKo: s.worldRules.settingSummaryKo, conflictMechanismKo: s.worldRules.conflictMechanismKo, rules: s.worldRules.rules.map((r) => ({ ...r })) },
    coreCharacters: s.coreCharacters.map((c) => ({ ...c })),
    seasonArc: { seasonTitleKo: s.seasonArc.seasonTitleKo, formatNoteKo: s.seasonArc.formatNoteKo, season2HookKo: s.seasonArc.season2HookKo, blocks: s.seasonArc.blocks.map((b) => ({ ...b })) },
    visualTone: { ...s.visualTone, paletteNotes: s.visualTone.paletteNotes.map((p) => ({ ...p })), moodKeywords: [...s.visualTone.moodKeywords] },
    targetPositioning: { ...s.targetPositioning, ottChannels: [...s.targetPositioning.ottChannels], publishingMarkets: [...s.targetPositioning.publishingMarkets], addressableRangeEstimate: cloneEstimateRange(s.targetPositioning.addressableRangeEstimate) },
    compPositioning: { positioningFormulaKo: s.compPositioning.positioningFormulaKo, entries: s.compPositioning.entries.map((e) => ({ ...e })) },
    secondaryRights: { expansionThesisKo: s.secondaryRights.expansionThesisKo, tracks: s.secondaryRights.tracks.map((t) => ({ ...t, budgetRangeEstimate: cloneEstimateRange(t.budgetRangeEstimate) })) },
    productionSchedule: { cadenceSummaryKo: s.productionSchedule.cadenceSummaryKo, milestones: s.productionSchedule.milestones.map((m) => ({ ...m })), totalBudgetEstimate: cloneEstimateRange(s.productionSchedule.totalBudgetEstimate) },
    contact: { ...s.contact, availableRights: [...s.contact.availableRights] },
  };
}

export function computeSeasonArcTotals(blocks: readonly SeasonArcBlock[]): SeasonArcTotals {
  let totalEpisodes = 0;
  let totalChapters = 0;
  for (const b of blocks) {
    if (Number.isFinite(b.episodeCount) && b.episodeCount > 0) totalEpisodes += Math.round(b.episodeCount);
    if (Number.isFinite(b.chapterStart) && Number.isFinite(b.chapterEnd) && b.chapterEnd >= b.chapterStart && b.chapterStart > 0) {
      totalChapters += Math.round(b.chapterEnd - b.chapterStart + 1);
    }
  }
  return {
    blockCount: blocks.length, totalEpisodes, totalChapters,
    targetEpisodes: TARGET_SEASON_EPISODES, targetChapters: TARGET_SEASON_CHAPTERS,
    matchesStandard12x60: totalEpisodes === TARGET_SEASON_EPISODES && totalChapters === TARGET_SEASON_CHAPTERS,
  };
}

export function buildPitchBibleDeck(input: PitchBibleInput): PitchBibleDeck {
  const n: PitchBibleInput = {
    ...input,
    targetPositioning: { ...input.targetPositioning, addressableRangeEstimate: cloneEstimateRange(input.targetPositioning.addressableRangeEstimate) },
    secondaryRights: { ...input.secondaryRights, tracks: input.secondaryRights.tracks.map((t) => ({ ...t, budgetRangeEstimate: cloneEstimateRange(t.budgetRangeEstimate) })) },
    productionSchedule: { ...input.productionSchedule, totalBudgetEstimate: cloneEstimateRange(input.productionSchedule.totalBudgetEstimate) },
  };
  const loglineValidation = validateLoglineLength(n.logline.loglineKo);
  const seasonTotals = computeSeasonArcTotals(n.seasonArc.blocks);
  const estimateRanges = [
    n.targetPositioning.addressableRangeEstimate,
    ...n.secondaryRights.tracks.map((t) => t.budgetRangeEstimate),
    n.productionSchedule.totalBudgetEstimate,
  ];
  const slideContent: Readonly<Record<PitchSlideId, { readonly headlineKo: string; readonly bullets: readonly string[] }>> = {
    cover: { headlineKo: `${n.cover.titleKo || "제목 미입력"} (${n.cover.titleEn || "Untitled"})`, bullets: [`장르·포맷: ${n.cover.genreBadgeKo} / ${n.cover.formatTargetKo}`, `권리사: ${n.cover.studioName} · ${n.cover.serializationStatusKo}`, `문서 버전: ${n.cover.versionLabel} (${n.cover.updatedDateIso})`] },
    logline: { headlineKo: loglineValidation.trimmed || "로그라인 미입력", bullets: [`글자수 점검: ${loglineValidation.charCount}자 (권장 25~45자 · ${loglineValidation.messageKo})`, `하이컨셉 후크: ${n.logline.highConceptHookKo}`] },
    "creative-intent": { headlineKo: n.creativeIntent.universalThemeKo || "기획 의도 미입력", bullets: [`창작 출발점: ${n.creativeIntent.originMotifKo}`, `글로벌 시의성: ${n.creativeIntent.globalTimelinessKo}`, `연출 약속: ${n.creativeIntent.directorPromiseKo}`] },
    "world-rules": { headlineKo: n.worldRules.settingSummaryKo || "세계관 배경 미입력", bullets: [`핵심 갈등 장치: ${n.worldRules.conflictMechanismKo}`, ...n.worldRules.rules.map((r) => `${r.titleKo}: ${r.ruleKo} (대가: ${r.costLimitKo})`)] },
    "core-characters": { headlineKo: `핵심 캐릭터 ${n.coreCharacters.length}인 (권장 4인)`, bullets: n.coreCharacters.map((c) => `${c.nameKo} (${c.roleKo}) — 욕망: ${c.desireKo} / 결함: ${c.fatalFlawKo}`) },
    "season-arc": { headlineKo: `${n.seasonArc.seasonTitleKo} — ${seasonTotals.totalEpisodes}부작 / ${seasonTotals.totalChapters}화`, bullets: [...n.seasonArc.blocks.map((b) => `${b.actLabelKo} ${b.episodeRangeLabel} (${b.chapterStart}~${b.chapterEnd}화): ${b.summaryKo}`), `시즌 2 훅: ${n.seasonArc.season2HookKo}`] },
    "visual-tone": { headlineKo: n.visualTone.artStyleKo || "비주얼 톤 미입력", bullets: [`조명 기조: ${n.visualTone.lightingMoodKo}`, `카메라 문법: ${n.visualTone.cameraGrammarKo}`, `OKLCH 팔레트: ${n.visualTone.paletteNotes.map((p) => `${p.roleKo}(${p.oklchSpec})`).join(" · ")}`] },
    "target-positioning": { headlineKo: n.targetPositioning.primaryAudienceKo || "타깃 독자 미입력", bullets: [`OTT·플랫폼 적합: ${n.targetPositioning.ottChannels.join(", ")}`, `1차 출판 권역: ${n.targetPositioning.publishingMarkets.join(", ")}`, `추정 타깃 범위: ${formatEstimateRangeLabel(n.targetPositioning.addressableRangeEstimate, "ko")}`] },
    "comp-positioning": { headlineKo: n.compPositioning.positioningFormulaKo || "비교 구도 미입력", bullets: n.compPositioning.entries.map((e) => `${e.referenceTitleKo} (${e.mediumKo}) → 차별화: ${e.differentiationKo}`) },
    "secondary-rights": { headlineKo: `2차 판권 ${n.secondaryRights.tracks.length}대 축 확장 로드맵 (추정)`, bullets: n.secondaryRights.tracks.map((t) => `${t.labelKo} [${t.windowLabelKo}]: ${t.deliverableKo} · ${formatEstimateRangeLabel(t.budgetRangeEstimate, "ko")}`) },
    "production-schedule": { headlineKo: `${n.productionSchedule.milestones.length}단계 제작 일정 · ${formatEstimateRangeLabel(n.productionSchedule.totalBudgetEstimate, "ko")}`, bullets: n.productionSchedule.milestones.map((m) => `${m.timeframeKo} · ${m.phaseKo}: ${m.deliverableGateKo}`) },
    contact: { headlineKo: `${n.contact.rightsHolderKo} (${n.contact.representativeKo})`, bullets: [`협의 가능 판권: ${n.contact.availableRights.join(", ") || "미선택"}`, `제공 가능 자료: ${n.contact.materialsReadyKo}`, `문의 채널: ${n.contact.contactEmail} (${n.contact.responseWindowKo})`] },
  };
  return {
    schemaVersion: PITCH_BIBLE_SCHEMA_VERSION, dataSourceKind: PITCH_DATA_SOURCE_KIND, badgeLabelKo: "추정", badgeLabelEn: "Estimate",
    estimateDisclaimerKo: ESTIMATE_DISCLAIMER_KO, estimateDisclaimerEn: ESTIMATE_DISCLAIMER_EN,
    genreId: n.genreId, input: n,
    slides: PITCH_SLIDE_METAS.map((meta) => ({
      ...meta, headlineKo: slideContent[meta.id].headlineKo, summaryBulletsKo: slideContent[meta.id].bullets,
      dataSourceKind: meta.hasEstimateData ? PITCH_DATA_SOURCE_KIND : undefined,
    })),
    loglineValidation, seasonTotals, characterCount: n.coreCharacters.length,
    rightsTrackCount: n.secondaryRights.tracks.length,
    allEstimatesTagged: estimateRanges.every((r) => r.dataSourceKind === PITCH_DATA_SOURCE_KIND),
  };
}

function isDeck(value: PitchBibleDeck | PitchBibleInput): value is PitchBibleDeck {
  return "slides" in value && "input" in value;
}

function collectSlideNarrativeTexts(i: PitchBibleInput): readonly { readonly slideId: PitchSlideId; readonly text: string }[] {
  return [
    { slideId: "cover", text: `${i.cover.titleKo} ${i.cover.taglineKo} ${i.cover.serializationStatusKo}` },
    { slideId: "logline", text: `${i.logline.loglineKo} ${i.logline.highConceptHookKo}` },
    { slideId: "creative-intent", text: `${i.creativeIntent.originMotifKo} ${i.creativeIntent.universalThemeKo} ${i.creativeIntent.globalTimelinessKo} ${i.creativeIntent.directorPromiseKo}` },
    { slideId: "world-rules", text: `${i.worldRules.settingSummaryKo} ${i.worldRules.conflictMechanismKo} ${i.worldRules.rules.map((r) => `${r.titleKo} ${r.ruleKo} ${r.costLimitKo}`).join(" ")}` },
    { slideId: "core-characters", text: i.coreCharacters.map((c) => `${c.nameKo} ${c.desireKo} ${c.fatalFlawKo} ${c.seasonArcKo}`).join(" ") },
    { slideId: "season-arc", text: `${i.seasonArc.seasonTitleKo} ${i.seasonArc.season2HookKo} ${i.seasonArc.blocks.map((b) => `${b.summaryKo} ${b.cliffhangerKo}`).join(" ")}` },
    { slideId: "visual-tone", text: `${i.visualTone.artStyleKo} ${i.visualTone.lightingMoodKo} ${i.visualTone.cameraGrammarKo}` },
    { slideId: "target-positioning", text: `${i.targetPositioning.primaryAudienceKo} ${i.targetPositioning.secondaryAudienceKo} ${i.targetPositioning.viewerHookKo} ${i.targetPositioning.addressableRangeEstimate.assumptionKo}` },
    { slideId: "comp-positioning", text: `${i.compPositioning.positioningFormulaKo} ${i.compPositioning.entries.map((e) => `${e.referenceTitleKo} ${e.sharedAxisKo} ${e.differentiationKo}`).join(" ")}` },
    { slideId: "secondary-rights", text: `${i.secondaryRights.expansionThesisKo} ${i.secondaryRights.tracks.map((t) => `${t.deliverableKo} ${t.budgetRangeEstimate.assumptionKo}`).join(" ")}` },
    { slideId: "production-schedule", text: `${i.productionSchedule.cadenceSummaryKo} ${i.productionSchedule.milestones.map((m) => `${m.phaseKo} ${m.deliverableGateKo}`).join(" ")} ${i.productionSchedule.totalBudgetEstimate.assumptionKo}` },
    { slideId: "contact", text: `${i.contact.rightsHolderKo} ${i.contact.materialsReadyKo}` },
  ];
}

export function auditPitchBibleReadiness(deckOrInput: PitchBibleDeck | PitchBibleInput): PitchBibleReadinessAudit {
  const deck = isDeck(deckOrInput) ? deckOrInput : buildPitchBibleDeck(deckOrInput);
  const { input, loglineValidation, seasonTotals } = deck;
  const issues: PitchAuditIssue[] = [];
  let deduction = 0;
  const pushIssue = (issue: PitchAuditIssue, penalty: number): void => { issues.push(issue); deduction += penalty; };

  if (input.cover.titleKo.trim().length < 2 || input.cover.studioName.trim().length < 2) {
    pushIssue({ id: "missing-cover-core", code: "missing-cover-core", severity: "blocker", category: "missing", slideId: "cover", titleKo: "표지 필수 정보 누락", titleEn: "Missing cover essentials", detailKo: "작품명 또는 권리 보유 스튜디오명이 비어 있습니다.", detailEn: "Title or studio name is empty.", fixHintKo: "01 표지 슬라이드에서 작품명과 스튜디오명을 입력하세요.", fixHintEn: "Fill title and studio name on Slide 01." }, 12);
  }
  if (loglineValidation.status === "empty") {
    pushIssue({ id: "missing-logline", code: "missing-logline", severity: "blocker", category: "missing", slideId: "logline", titleKo: "로그라인 누락", titleEn: "Missing logline", detailKo: "핵심 1문장 로그라인이 비어 있습니다.", detailEn: "Core one-sentence logline is empty.", fixHintKo: "02 로그라인 슬라이드에 25~45자 로그라인을 작성하세요.", fixHintEn: "Write a 25-45 char logline on Slide 02." }, 14);
  } else if (!loglineValidation.isOptimal) {
    pushIssue({ id: "logline-length-out-of-range", code: "logline-length-out-of-range", severity: "warning", category: "structure", slideId: "logline", titleKo: `로그라인 글자수 권장 범위 이탈 (${loglineValidation.charCount}자)`, titleEn: `Logline out of 25-45 range (${loglineValidation.charCount} chars)`, detailKo: loglineValidation.messageKo, detailEn: loglineValidation.messageEn, fixHintKo: "글로벌 바이어가 3초 안에 읽을 수 있도록 25~45자로 다듬으세요.", fixHintEn: "Refine to 25-45 characters for 3-second readability." }, 7);
  }
  if (input.creativeIntent.originMotifKo.trim().length < 8 || input.creativeIntent.universalThemeKo.trim().length < 8) {
    pushIssue({ id: "missing-creative-intent", code: "missing-creative-intent", severity: "warning", category: "missing", slideId: "creative-intent", titleKo: "기획 의도 핵심 근거 부족", titleEn: "Thin creative intent", detailKo: "창작 출발점 또는 글로벌 보편 정서 설명이 8자 미만입니다.", detailEn: "Origin motif or universal theme is too brief.", fixHintKo: "03 기획 의도에 왜 지금 글로벌 독자가 반응할지 구체적으로 보강하세요.", fixHintEn: "Expand creator motivation and resonance on Slide 03." }, 8);
  }
  const validRules = input.worldRules.rules.filter((r) => r.titleKo.trim().length >= 2 && r.ruleKo.trim().length >= 5);
  if (input.worldRules.settingSummaryKo.trim().length < 6 || validRules.length < 2) {
    pushIssue({ id: "missing-world-rules", code: "missing-world-rules", severity: "warning", category: "missing", slideId: "world-rules", titleKo: "세계관 핵심 규칙 부족", titleEn: "Insufficient world rules", detailKo: `유효한 세계관 규칙이 ${validRules.length}개입니다 (최소 2개 권장).`, detailEn: `Only ${validRules.length} valid world rules (2+ recommended).`, fixHintKo: "04 세계관 규칙에서 규칙과 대가(제약) 쌍을 2개 이상 구체화하세요.", fixHintEn: "Define at least 2 rule-and-cost pairs on Slide 04." }, 8);
  }
  const completeChars = input.coreCharacters.filter((c) => c.nameKo.trim().length >= 1 && c.desireKo.trim().length >= 4 && c.fatalFlawKo.trim().length >= 4 && c.seasonArcKo.trim().length >= 4);
  if (input.coreCharacters.length < RECOMMENDED_CORE_CHARACTERS || completeChars.length < RECOMMENDED_CORE_CHARACTERS) {
    const isBlocker = completeChars.length < 2;
    pushIssue({ id: "incomplete-core-characters", code: "incomplete-core-characters", severity: isBlocker ? "blocker" : "warning", category: "missing", slideId: "core-characters", titleKo: `핵심 캐릭터 4인 구성 미달 (${completeChars.length}/4 완료)`, titleEn: `Core cast incomplete (${completeChars.length}/4 ready)`, detailKo: "글로벌 OTT·출판 피칭은 4인의 욕망·결함·시즌 아크가 완비되어야 합니다.", detailEn: "Pitch bibles require 4 core characters with desire, flaw, and arc.", fixHintKo: "05 핵심 캐릭터 4인 슬라이드에서 빈 욕망·결함·시즌 아크를 채우세요.", fixHintEn: "Complete desire, flaw, and arc for all 4 characters on Slide 05." }, isBlocker ? 14 : 8);
  }
  if (input.seasonArc.blocks.length === 0) {
    pushIssue({ id: "missing-season-arc", code: "missing-season-arc", severity: "blocker", category: "missing", slideId: "season-arc", titleKo: "시즌 1 에피소드 아크 누락", titleEn: "Missing Season 1 arc", detailKo: "시즌 1 구성 블록이 비어 있습니다.", detailEn: "Season 1 episode arc blocks are empty.", fixHintKo: "06 시즌 1 아크에 12부작/60화 대응 구성을 입력하세요.", fixHintEn: "Add 12-ep / 60-ch arc blocks on Slide 06." }, 14);
  } else if (!seasonTotals.matchesStandard12x60) {
    pushIssue({ id: "season-arc-ratio-mismatch", code: "season-arc-ratio-mismatch", severity: "warning", category: "structure", slideId: "season-arc", titleKo: `시즌 1 총량 불일치 (${seasonTotals.totalEpisodes}부작 / ${seasonTotals.totalChapters}화)`, titleEn: `Season 1 totals mismatch (${seasonTotals.totalEpisodes} ep / ${seasonTotals.totalChapters} ch)`, detailKo: "표준 시즌 1 피칭 규격인 12부작 / 60화 합계와 일치하지 않습니다.", detailEn: "Totals do not match the standard 12-ep / 60-ch pitch format.", fixHintKo: "06 시즌 1 아크에서 각 막의 부작 수와 화수 구간을 12부작/60화로 맞추세요.", fixHintEn: "Adjust act episode counts and chapter spans to 12 ep / 60 ch." }, 8);
  }
  if (input.visualTone.artStyleKo.trim().length < 5 || input.visualTone.lightingMoodKo.trim().length < 5) {
    pushIssue({ id: "missing-visual-tone", code: "missing-visual-tone", severity: "warning", category: "missing", slideId: "visual-tone", titleKo: "비주얼 톤앤매너 설명 부족", titleEn: "Incomplete visual tone", detailKo: "작화 스타일 또는 조명·명암 기조 설명이 부족합니다.", detailEn: "Art style or lighting direction is incomplete.", fixHintKo: "07 비주얼 톤앤매너에 작화·조명·카메라 문법을 보강하세요.", fixHintEn: "Fill art style and lighting direction on Slide 07." }, 6);
  }
  if (input.targetPositioning.primaryAudienceKo.trim().length < 4 || input.targetPositioning.ottChannels.length === 0) {
    pushIssue({ id: "missing-target-positioning", code: "missing-target-positioning", severity: "warning", category: "missing", slideId: "target-positioning", titleKo: "타깃 독자·OTT 포지셔닝 누락", titleEn: "Missing audience or OTT channels", detailKo: "1차 타깃 독자 또는 적합 OTT/플랫폼 채널이 비어 있습니다.", detailEn: "Primary audience or OTT channels are missing.", fixHintKo: "08 타깃 포지셔닝에서 코어 시청층과 플랫폼 채널을 지정하세요.", fixHintEn: "Specify target audience and OTT platforms on Slide 08." }, 7);
  }
  const validComps = input.compPositioning.entries.filter((e) => e.referenceTitleKo.trim().length >= 2 && e.differentiationKo.trim().length >= 5);
  if (validComps.length < 2) {
    pushIssue({ id: "missing-comp-positioning", code: "missing-comp-positioning", severity: "warning", category: "missing", slideId: "comp-positioning", titleKo: `유사 흥행 비교 구도 부족 (${validComps.length}/2 완료)`, titleEn: `Insufficient comparables (${validComps.length}/2)`, detailKo: "바이어 포지셔닝을 위해 최소 2개 레퍼런스 축과 차별화 문장이 필요합니다.", detailEn: "Provide at least 2 comparable axes with clear differentiation.", fixHintKo: "09 유사 흥행 비교 구도에서 레퍼런스와 차별화 포인트를 2개 이상 채우세요.", fixHintEn: "Complete at least 2 comparable entries on Slide 09." }, 7);
  }
  const presentTracks = new Set(input.secondaryRights.tracks.map((t) => t.id));
  const missingTracks = SECONDARY_RIGHTS_TRACK_IDS.filter((id) => !presentTracks.has(id));
  if (missingTracks.length > 0) {
    pushIssue({ id: "missing-secondary-rights-tracks", code: "missing-secondary-rights-tracks", severity: "warning", category: "missing", slideId: "secondary-rights", titleKo: `2차 판권 확장 축 누락 (${missingTracks.join(", ")})`, titleEn: `Missing secondary rights tracks (${missingTracks.join(", ")})`, detailKo: "단행본·굿즈·애니·게임 4대 2차 판권 축 중 일부가 누락되었습니다.", detailEn: "Some of the 4 secondary rights tracks are missing.", fixHintKo: "10 2차 판권 확장 맵에 4대 판권 전략을 모두 포함하세요.", fixHintEn: "Include all 4 secondary rights tracks on Slide 10." }, 7);
  }
  const validMilestones = input.productionSchedule.milestones.filter((m) => m.phaseKo.trim().length >= 2 && m.deliverableGateKo.trim().length >= 3);
  if (validMilestones.length < 3) {
    pushIssue({ id: "missing-schedule-milestones", code: "missing-schedule-milestones", severity: "warning", category: "missing", slideId: "production-schedule", titleKo: `제작 일정 마일스톤 부족 (${validMilestones.length}/3)`, titleEn: `Too few milestones (${validMilestones.length}/3)`, detailKo: "프리프로덕션·론칭·완결을 잇는 최소 3개 산출물 게이트가 필요합니다.", detailEn: "At least 3 milestone deliverable gates are needed.", fixHintKo: "11 제작 일정에 단계별 산출물 게이트를 3개 이상 입력하세요.", fixHintEn: "Define at least 3 milestone gates on Slide 11." }, 6);
  }
  const email = input.contact.contactEmail.trim();
  if (input.contact.rightsHolderKo.trim().length < 2 || !email.includes("@") || !email.includes(".") || email.includes(" ") || input.contact.availableRights.length === 0) {
    pushIssue({ id: "missing-contact-details", code: "missing-contact-details", severity: "blocker", category: "missing", slideId: "contact", titleKo: "협업 문의·권리 정보 미완성", titleEn: "Incomplete contact or rights info", detailKo: "권리 보유 주체, 유효한 문의 이메일 또는 협의 가능 판권 목록이 누락되었습니다.", detailEn: "Rights holder, valid email, or available rights selection is missing.", fixHintKo: "12 협업 문의 슬라이드에서 권리사·이메일·협의 가능 판권을 확인하세요.", fixHintEn: "Verify rights holder, email, and rights on Slide 12." }, 10);
  }

  const rangeChecks: readonly { readonly slideId: PitchSlideId; readonly labelKo: string; readonly range: PitchEstimateRange }[] = [
    { slideId: "target-positioning", labelKo: "타깃 도달 추정 범위", range: input.targetPositioning.addressableRangeEstimate },
    ...input.secondaryRights.tracks.map((t) => ({ slideId: "secondary-rights" as const, labelKo: `${t.labelKo} 예산 범위`, range: t.budgetRangeEstimate })),
    { slideId: "production-schedule", labelKo: "총 제작 예산 범위", range: input.productionSchedule.totalBudgetEstimate },
  ];
  for (const item of rangeChecks) {
    if (item.range.minAmount > item.range.maxAmount) {
      pushIssue({ id: `inverted-range-${item.slideId}-${item.labelKo}`, code: "inverted-estimate-range", severity: "blocker", category: "estimate-guard", slideId: item.slideId, titleKo: `${item.labelKo} 하한·상한 역전`, titleEn: `Inverted estimate range (${item.labelKo})`, detailKo: `최솟값(${item.range.minAmount})이 최댓값(${item.range.maxAmount})보다 큽니다.`, detailEn: `Minimum (${item.range.minAmount}) exceeds maximum (${item.range.maxAmount}).`, fixHintKo: "최솟값이 최댓값 이하가 되도록 추정 범위를 조정하세요.", fixHintEn: "Ensure minimum is less than or equal to maximum." }, 10);
    }
    if (item.range.assumptionKo.trim().length < 4) {
      pushIssue({ id: `missing-assumption-${item.slideId}-${item.labelKo}`, code: "missing-estimate-assumption", severity: "warning", category: "estimate-guard", slideId: item.slideId, titleKo: `${item.labelKo} 추정 근거 누락`, titleEn: `Missing estimate basis (${item.labelKo})`, detailKo: "모든 시장·예산 범위에는 추정(estimate) 가정 근거를 함께 명시해야 합니다.", detailEn: "Every estimate range must state its planning assumption.", fixHintKo: "해당 범위의 가정/근거 문장을 4자 이상 작성하세요.", fixHintEn: "Add a brief planning assumption for this band." }, 5);
    }
  }
  for (const slice of collectSlideNarrativeTexts(input)) {
    for (const m of detectExaggerationMatches(slice.text)) {
      const isStat = m.kind === "unverified-stat";
      pushIssue({
        id: `exag-${slice.slideId}-${m.ruleId}-${m.matchedText}`, code: isStat ? "unverified-market-stat" : "exaggerated-claim",
        severity: isStat ? "blocker" : "warning", category: "exaggeration", slideId: slice.slideId, matchedPhrase: m.matchedText,
        titleKo: isStat ? `근거 없는 확정 통계 표현 감지 ("${m.matchedText}")` : `과장·확정적 흥행 문구 감지 ("${m.matchedText}")`,
        titleEn: isStat ? `Unverified statistical claim ("${m.matchedText}")` : `Exaggerated hype phrasing ("${m.matchedText}")`,
        detailKo: isStat ? "실측 출처가 없는 조회수·매출·점유율 수치는 바이어 실사 단계에서 신뢰를 훼손합니다." : "확정적 흥행 보장 문구 대신 구조적 강점과 추정(estimate) 범위로 표현해야 합니다.",
        detailEn: isStat ? "Unsourced view/revenue/share statistics undermine buyer diligence." : "Replace guaranteed-hit phrasing with structural strengths and labeled estimates.",
        fixHintKo: `"${m.matchedText}" 문구를 삭제하고 근거 있는 기획 방향 또는 [추정] 범위로 고치세요.`,
        fixHintEn: `Remove "${m.matchedText}" and replace with verifiable positioning or an estimate range.`,
      }, isStat ? 14 : 9);
    }
  }

  const score = Math.max(0, Math.min(100, 100 - deduction));
  const blockerCount = issues.filter((i) => i.severity === "blocker").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const grade: PitchReadinessGrade = score >= 85 && blockerCount === 0 ? "pitch-ready" : score >= 60 ? "needs-polish" : "draft-incomplete";
  const slideAudits: SlideReadinessSummary[] = PITCH_SLIDE_METAS.map((meta) => {
    const sIssues = issues.filter((i) => i.slideId === meta.id);
    const sBlockers = sIssues.filter((i) => i.severity === "blocker").length;
    return { slideId: meta.id, slideNumber: meta.slideNumber, status: sBlockers > 0 ? "missing" : sIssues.length > 0 ? "warning" : "ready", issueCount: sIssues.length, blockerCount: sBlockers };
  });
  return {
    score, grade, dataSourceKind: PITCH_DATA_SOURCE_KIND, badgeLabelKo: "추정", badgeLabelEn: "Estimate",
    disclaimerKo: ESTIMATE_DISCLAIMER_KO, disclaimerEn: ESTIMATE_DISCLAIMER_EN,
    issues, missingIssues: issues.filter((i) => i.category === "missing"),
    exaggerationIssues: issues.filter((i) => i.category === "exaggeration"),
    structureIssues: issues.filter((i) => i.category === "structure"),
    estimateGuardIssues: issues.filter((i) => i.category === "estimate-guard"),
    blockerCount, warningCount,
    readySlideCount: slideAudits.filter((s) => s.status === "ready").length,
    totalSlideCount: PITCH_SLIDE_METAS.length, slideAudits,
  };
}

export function exportPitchBibleMarkdown(deck: PitchBibleDeck, auditInput?: PitchBibleReadinessAudit, options?: PitchExportOptions): string {
  const audit = auditInput ?? auditPitchBibleReadiness(deck);
  const isEn = options?.locale === "en";
  const { input, loglineValidation, seasonTotals } = deck;
  const loc = isEn ? "en" : "ko";
  return [
    `# ${isEn ? input.cover.titleEn : input.cover.titleKo} — ${isEn ? "Global IP Pitch Bible (12 Slides)" : "글로벌 IP 피칭 바이블 (12장)"}`, "",
    `> dataSourceKind: \`${deck.dataSourceKind}\` (${isEn ? "Estimate" : "추정"}) — ${isEn ? deck.estimateDisclaimerEn : deck.estimateDisclaimerKo}`, "",
    `## 01. ${isEn ? "Cover" : "표지"}`,
    `- **${isEn ? "Title" : "작품명"}**: ${input.cover.titleKo} / ${input.cover.titleEn}`,
    `- **${isEn ? "Tagline" : "태그라인"}**: ${input.cover.taglineKo}`,
    `- **${isEn ? "Genre & Format" : "장르·포맷"}**: ${input.cover.genreBadgeKo} | ${input.cover.formatTargetKo}`,
    `- **${isEn ? "Studio & Status" : "스튜디오·현황"}**: ${input.cover.studioName} (${input.cover.serializationStatusKo})`,
    `- **${isEn ? "Version" : "버전"}**: ${input.cover.versionLabel} (${input.cover.updatedDateIso})`, "",
    `## 02. ${isEn ? "Logline (25-45 Char Check)" : "로그라인 (25~45자 검증)"}`,
    `- **${isEn ? "Logline" : "핵심 로그라인"}**: ${loglineValidation.trimmed}`,
    `- **${isEn ? "Length Audit" : "글자수 검증"}**: ${loglineValidation.charCount}${isEn ? " chars" : "자"} (${isEn ? loglineValidation.messageEn : loglineValidation.messageKo})`,
    `- **${isEn ? "High-Concept Hook" : "하이컨셉 후크"}**: ${input.logline.highConceptHookKo}`, "",
    `## 03. ${isEn ? "Creative Intent" : "기획 의도"}`,
    `- **${isEn ? "Origin" : "창작 출발점"}**: ${input.creativeIntent.originMotifKo}`,
    `- **${isEn ? "Universal Theme" : "글로벌 보편 정서"}**: ${input.creativeIntent.universalThemeKo}`,
    `- **${isEn ? "Timeliness" : "시의성"}**: ${input.creativeIntent.globalTimelinessKo}`,
    `- **${isEn ? "Director Promise" : "연출 약속"}**: ${input.creativeIntent.directorPromiseKo}`, "",
    `## 04. ${isEn ? "World Rules" : "세계관 규칙"}`,
    `- **${isEn ? "Setting" : "공간·시대 배경"}**: ${input.worldRules.settingSummaryKo}`,
    `- **${isEn ? "Conflict Engine" : "갈등 메커니즘"}**: ${input.worldRules.conflictMechanismKo}`,
    ...input.worldRules.rules.map((r, idx) => `- **${idx + 1}. ${r.titleKo}**: ${r.ruleKo} _(${isEn ? "Cost" : "대가"}: ${r.costLimitKo})_`), "",
    `## 05. ${isEn ? "4 Core Characters" : "핵심 캐릭터 4인"}`,
    `| ${isEn ? "Name" : "이름"} | ${isEn ? "Role" : "역할"} | ${isEn ? "Desire" : "핵심 욕망"} | ${isEn ? "Flaw" : "치명적 결함"} | ${isEn ? "Season 1 Arc" : "시즌 1 변화 아크"} |`,
    "| --- | --- | --- | --- | --- |",
    ...input.coreCharacters.map((c) => `| ${c.nameKo} | ${c.roleKo} | ${c.desireKo} | ${c.fatalFlawKo} | ${c.seasonArcKo} |`), "",
    `## 06. ${isEn ? "Season 1 Arc (12 Episodes / 60 Chapters)" : "시즌 1 에피소드 아크 (12부작 / 60화)"}`,
    `- **${isEn ? "Season Title" : "시즌 부제"}**: ${input.seasonArc.seasonTitleKo} (${seasonTotals.totalEpisodes}${isEn ? " ep" : "부작"} / ${seasonTotals.totalChapters}${isEn ? " ch" : "화"})`,
    `- **${isEn ? "Mapping" : "변환 구조"}**: ${input.seasonArc.formatNoteKo}`,
    `| ${isEn ? "Act" : "막"} | ${isEn ? "Episodes" : "부작"} | ${isEn ? "Chapters" : "웹툰 화수"} | ${isEn ? "Summary" : "핵심 사건"} | ${isEn ? "Cliffhanger" : "클리프행어"} |`,
    "| --- | --- | --- | --- | --- |",
    ...input.seasonArc.blocks.map((b) => `| ${b.actLabelKo} | ${b.episodeRangeLabel} (${b.episodeCount}) | ${b.chapterStart}~${b.chapterEnd}화 | ${b.summaryKo} | ${b.cliffhangerKo} |`),
    `- **${isEn ? "Season 2 Hook" : "시즌 2 확장 훅"}**: ${input.seasonArc.season2HookKo}`, "",
    `## 07. ${isEn ? "Visual Tone & Manner" : "비주얼 톤앤매너"}`,
    `- **${isEn ? "Art Style" : "작화 스타일"}**: ${input.visualTone.artStyleKo}`,
    `- **${isEn ? "Lighting" : "조명·명암 기조"}**: ${input.visualTone.lightingMoodKo}`,
    `- **${isEn ? "Camera Grammar" : "카메라 연출"}**: ${input.visualTone.cameraGrammarKo}`,
    `- **OKLCH Palette**: ${input.visualTone.paletteNotes.map((p) => `${p.roleKo} \`${p.oklchSpec}\` (${p.usageKo})`).join(" / ")}`, "",
    `## 08. ${isEn ? "Target Audience & OTT Positioning [Estimate]" : "타깃 독자·OTT 포지셔닝 [추정]"}`,
    `- **${isEn ? "Primary Audience" : "코어 타깃"}**: ${input.targetPositioning.primaryAudienceKo}`,
    `- **${isEn ? "Secondary Audience" : "확장 타깃"}**: ${input.targetPositioning.secondaryAudienceKo}`,
    `- **OTT/Platforms**: ${input.targetPositioning.ottChannels.join(", ")}`,
    `- **${isEn ? "Publishing Markets" : "출판 권역"}**: ${input.targetPositioning.publishingMarkets.join(", ")}`,
    `- **${isEn ? "Estimated Pool" : "타깃 풀 범위 [추정]"}**: ${formatEstimateRangeLabel(input.targetPositioning.addressableRangeEstimate, loc)} — ${isEn ? input.targetPositioning.addressableRangeEstimate.assumptionEn : input.targetPositioning.addressableRangeEstimate.assumptionKo}`, "",
    `## 09. ${isEn ? "Comparable Positioning" : "유사 흥행 비교 구도"}`,
    `- **${isEn ? "Formula" : "비교 공식"}**: ${input.compPositioning.positioningFormulaKo}`,
    `| ${isEn ? "Reference Axis" : "레퍼런스 축"} | ${isEn ? "Medium" : "매체"} | ${isEn ? "Shared DNA" : "공통 문법"} | ${isEn ? "Differentiation" : "차별화 포인트"} |`,
    "| --- | --- | --- | --- |",
    ...input.compPositioning.entries.map((e) => `| ${e.referenceTitleKo} | ${e.mediumKo} | ${e.sharedAxisKo} | ${e.differentiationKo} |`), "",
    `## 10. ${isEn ? "Secondary Rights Expansion Map [Estimate]" : "2차 판권 확장 맵 (단행본·굿즈·애니·게임) [추정]"}`,
    `- **${isEn ? "Expansion Thesis" : "확장 전략"}**: ${input.secondaryRights.expansionThesisKo}`,
    `| ${isEn ? "Track" : "판권 축"} | ${isEn ? "Window" : "전개 시점"} | ${isEn ? "Partner" : "권장 파트너"} | ${isEn ? "Deliverable" : "핵심 산출물"} | ${isEn ? "Budget Band [Estimate]" : "추정 예산 범위 [추정]"} |`,
    "| --- | --- | --- | --- | --- |",
    ...input.secondaryRights.tracks.map((t) => `| ${isEn ? t.labelEn : t.labelKo} | ${t.windowLabelKo} | ${t.partnerTypeKo} | ${t.deliverableKo} | ${formatEstimateRangeLabel(t.budgetRangeEstimate, loc)} |`), "",
    `## 11. ${isEn ? "Production Schedule [Estimate]" : "제작 일정 [추정]"}`,
    `- **${isEn ? "Cadence" : "제작 리듬"}**: ${input.productionSchedule.cadenceSummaryKo}`,
    `- **${isEn ? "Total Budget Band [Estimate]" : "총 제작 예산 범위 [추정]"}**: ${formatEstimateRangeLabel(input.productionSchedule.totalBudgetEstimate, loc)} — ${isEn ? input.productionSchedule.totalBudgetEstimate.assumptionEn : input.productionSchedule.totalBudgetEstimate.assumptionKo}`,
    ...input.productionSchedule.milestones.map((m) => `- **${m.timeframeKo} · ${m.phaseKo}**: ${m.deliverableGateKo} (${m.ownerKo})`), "",
    `## 12. ${isEn ? "Collaboration & Contact" : "협업 문의"}`,
    `- **${isEn ? "Rights Holder" : "권리 보유"}**: ${input.contact.rightsHolderKo}`,
    `- **${isEn ? "Representative" : "담당자"}**: ${input.contact.representativeKo} (${input.contact.contactEmail})`,
    `- **${isEn ? "Available Rights" : "협의 가능 판권"}**: ${input.contact.availableRights.join(", ")}`,
    `- **${isEn ? "Ready Materials" : "열람 가능 자료"}**: ${input.contact.materialsReadyKo}`, "",
    `## ${isEn ? "Readiness Audit Summary [Estimate]" : "피칭 완성도 감사 요약 [추정]"}`,
    `- **${isEn ? "Score" : "완성도 점수"}**: ${audit.score}/100 (${audit.grade}) · dataSourceKind: \`${audit.dataSourceKind}\``,
    `- **${isEn ? "Findings" : "진단 결과"}**: ${isEn ? "Blockers" : "차단"} ${audit.blockerCount} / ${isEn ? "Warnings" : "경고"} ${audit.warningCount} / ${isEn ? "Exaggeration flags" : "과장 감지"} ${audit.exaggerationIssues.length}`,
    ...(audit.issues.length > 0
      ? audit.issues.map((i) => `- [${i.severity.toUpperCase()}] (${i.slideId}) ${isEn ? i.titleEn : i.titleKo} — ${isEn ? i.fixHintEn : i.fixHintKo}`)
      : [`- ${isEn ? "No blocking or exaggeration issues detected." : "누락 및 과장 경고 없이 피칭 준비 기준을 충족합니다."}`]),
  ].join("\n");
}

export function exportPitchBibleJson(deck: PitchBibleDeck, auditInput?: PitchBibleReadinessAudit, options?: PitchExportOptions): string {
  const audit = auditInput ?? auditPitchBibleReadiness(deck);
  return JSON.stringify({
    schemaVersion: PITCH_BIBLE_SCHEMA_VERSION, locale: options?.locale ?? "ko",
    dataSourceKind: PITCH_DATA_SOURCE_KIND, badgeLabelKo: "추정", badgeLabelEn: "Estimate",
    estimateDisclaimerKo: ESTIMATE_DISCLAIMER_KO, estimateDisclaimerEn: ESTIMATE_DISCLAIMER_EN,
    deck, audit,
  }, null, 2);
}
