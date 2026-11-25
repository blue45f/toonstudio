/**
 * Wave 49E — 세로 스크롤 감정 곡선 · 컷 호흡 오토 디렉터 순수 결정론 엔진.
 *
 * - 4종 대표 회차 리듬 프리셋(로맨스 1화 · 액션 12화 · 스릴러 반전 · 일상 코미디 4단)
 * - 연속 평탄 구간 · 과밀 대사 연타 · 클라이맥스 직전 여백 부족 · 엔딩 클리프행어 강도 진단
 * - 비파괴 Top-3 컷 호흡 연출 개선안(긴장 여백 확장 / 클로즈업·임팩트 확대 / 엔딩 클리프행어 극대화)
 * - 비파괴 미리보기 · 적용 · 직전/전체 원복 상태 머신 + 컷별 편집 + 리듬 시트 Markdown/JSON 내보내기
 */

export type ScrollPacingPresetId = "romance-ep1" | "action-ep12" | "thriller-twist" | "comedy-fourbeat";
export type ScrollShotScale = "extreme-wide" | "wide" | "medium" | "close-up" | "extreme-close-up";
export type ScrollBeatRole = "hook" | "setup" | "build" | "breather" | "climax" | "cliffhanger";
export type ScrollPacingIssueCode = "flat-pacing" | "dense-dialogue" | "narrow-climax-gutter" | "weak-cliffhanger";
export type ScrollPacingSeverity = "ok" | "warn" | "critical";
export type ScrollPacingStrategyId = "tension-gutter-expansion" | "closeup-impact-boost" | "cliffhanger-surge";
export type ScrollRhythmGrade = "S" | "A" | "B" | "C" | "D";

export interface ScrollPacingCut {
  readonly cutId: string; readonly cutNumber: number; readonly sceneLabelKo: string; readonly sceneLabelEn: string;
  readonly beatRole: ScrollBeatRole; readonly gutterPx: number; readonly panelHeightPx: number;
  readonly shotScale: ScrollShotScale; readonly dialogueChars: number; readonly tensionScore: number;
}
export interface ScrollPacingPreset {
  readonly id: ScrollPacingPresetId; readonly titleKo: string; readonly titleEn: string;
  readonly episodeLabelKo: string; readonly episodeLabelEn: string; readonly genreKo: string; readonly genreEn: string;
  readonly rhythmGoalKo: string; readonly rhythmGoalEn: string; readonly cuts: readonly ScrollPacingCut[];
}
export interface ShotScaleMeta {
  readonly id: ScrollShotScale; readonly labelKo: string; readonly labelEn: string;
  readonly shortKo: string; readonly shortEn: string; readonly impactWeight: number;
}
export interface FlatPacingZone {
  readonly startCut: number; readonly endCut: number; readonly cutNumbers: readonly number[];
  readonly avgTension: number; readonly tensionSpan: number;
  readonly severity: "warn" | "critical"; readonly reasonKo: string; readonly reasonEn: string;
}
export interface DenseDialogueZone {
  readonly startCut: number; readonly endCut: number; readonly cutNumbers: readonly number[];
  readonly totalChars: number; readonly maxChars: number;
  readonly severity: "warn" | "critical"; readonly reasonKo: string; readonly reasonEn: string;
}
export interface ClimaxGutterShortfall {
  readonly cutNumber: number; readonly currentGutterPx: number; readonly recommendedGutterPx: number;
  readonly deficitPx: number; readonly tensionScore: number;
  readonly severity: "warn" | "critical"; readonly reasonKo: string; readonly reasonEn: string;
}
export interface ScrollPacingIssue {
  readonly id: string; readonly code: ScrollPacingIssueCode; readonly severity: "warn" | "critical";
  readonly cutNumbers: readonly number[]; readonly titleKo: string; readonly titleEn: string;
  readonly detailKo: string; readonly detailEn: string;
}
export interface CutPacingDiagnostic {
  readonly cutNumber: number; readonly scrollStartPx: number; readonly scrollEndPx: number;
  readonly estimatedReadSec: number; readonly tensionDelta: number;
  readonly warningCodes: readonly ScrollPacingIssueCode[]; readonly status: ScrollPacingSeverity;
}
export interface ScrollTensionAuditReport {
  readonly cutCount: number; readonly immersionScore: number; readonly grade: ScrollRhythmGrade;
  readonly cliffhangerStrength: number; readonly totalScrollHeightPx: number;
  readonly estimatedTotalReadSec: number; readonly averageGutterPx: number;
  readonly averageDialogueChars: number; readonly tensionRange: number;
  readonly peakTensionCutNumber: number; readonly peakTensionScore: number;
  readonly flatZones: readonly FlatPacingZone[]; readonly denseDialogueZones: readonly DenseDialogueZone[];
  readonly climaxGutterShortfalls: readonly ClimaxGutterShortfall[];
  readonly issues: readonly ScrollPacingIssue[]; readonly cutDiagnostics: readonly CutPacingDiagnostic[];
}
export interface CutPacingPatch {
  readonly cutNumber: number; readonly gutterPx?: number; readonly panelHeightPx?: number;
  readonly shotScale?: ScrollShotScale; readonly dialogueChars?: number; readonly tensionScore?: number;
  readonly deltaGutterPx: number; readonly deltaPanelHeightPx: number;
  readonly deltaDialogueChars: number; readonly deltaTensionScore: number;
}
export interface ScrollPacingProposal {
  readonly id: string; readonly rank: 1 | 2 | 3; readonly strategyId: ScrollPacingStrategyId;
  readonly titleKo: string; readonly titleEn: string; readonly summaryKo: string; readonly summaryEn: string;
  readonly changesKo: readonly string[]; readonly changesEn: readonly string[];
  readonly affectedCutNumbers: readonly number[]; readonly cutPatches: readonly CutPacingPatch[];
  readonly proposedCuts: readonly ScrollPacingCut[]; readonly projectedAudit: ScrollTensionAuditReport;
  readonly scoreGain: number; readonly cliffhangerGain: number;
}
export type ScrollPacingProposalTop3 = readonly [ScrollPacingProposal, ScrollPacingProposal, ScrollPacingProposal];
export interface ScrollPacingHistoryEntry {
  readonly entryId: string; readonly revision: number;
  readonly action: "apply" | "edit" | "revert-last" | "revert-all";
  readonly summaryKo: string; readonly summaryEn: string;
}
export interface ScrollPacingSessionState {
  readonly presetId: ScrollPacingPresetId; readonly baselineCuts: readonly ScrollPacingCut[];
  readonly workingCuts: readonly ScrollPacingCut[]; readonly selectedCutNumber: number;
  readonly previewProposalId: string | null; readonly appliedStrategyIds: readonly ScrollPacingStrategyId[];
  readonly undoStack: readonly (readonly ScrollPacingCut[])[];
  readonly revision: number; readonly history: readonly ScrollPacingHistoryEntry[];
}
export type EditableCutMetricsPatch = Partial<
  Pick<ScrollPacingCut, "gutterPx" | "panelHeightPx" | "shotScale" | "dialogueChars" | "tensionScore">
>;

export const MIN_GUTTER_PX = 40;
export const MAX_GUTTER_PX = 640;
export const MIN_PANEL_HEIGHT_PX = 320;
export const MAX_PANEL_HEIGHT_PX = 1400;
export const MIN_DIALOGUE_CHARS = 0;
export const MAX_DIALOGUE_CHARS = 180;
export const MIN_TENSION_SCORE = 0;
export const MAX_TENSION_SCORE = 100;
export const TENSION_GUTTER_EXPANSION_MIN_PX = 180;
export const TENSION_GUTTER_EXPANSION_MAX_PX = 320;
const SCROLL_PX_PER_SEC = 540;
const CHARS_PER_SEC = 12;

export const SHOT_SCALE_OPTIONS: readonly ShotScaleMeta[] = [
  { id: "extreme-wide", labelKo: "익스트림 와이드", labelEn: "Extreme Wide", shortKo: "EW", shortEn: "EW", impactWeight: 0.75 },
  { id: "wide", labelKo: "와이드 풀샷", labelEn: "Wide Shot", shortKo: "WS", shortEn: "WS", impactWeight: 0.85 },
  { id: "medium", labelKo: "미디엄 바스트", labelEn: "Medium Shot", shortKo: "MS", shortEn: "MS", impactWeight: 1.0 },
  { id: "close-up", labelKo: "클로즈업", labelEn: "Close-Up", shortKo: "CU", shortEn: "CU", impactWeight: 1.15 },
  { id: "extreme-close-up", labelKo: "익스트림 클로즈업", labelEn: "Extreme Close-Up", shortKo: "ECU", shortEn: "ECU", impactWeight: 1.25 },
];
export const BEAT_ROLE_LABELS: Readonly<Record<ScrollBeatRole, { readonly ko: string; readonly en: string }>> = {
  hook: { ko: "도입 훅", en: "Hook" }, setup: { ko: "상황 설정", en: "Setup" },
  build: { ko: "감정 적층", en: "Build" }, breather: { ko: "숨 고르기", en: "Breather" },
  climax: { ko: "클라이맥스", en: "Climax" }, cliffhanger: { ko: "엔딩 절단", en: "Cliffhanger" },
};
type RawCutTuple = readonly [string, string, ScrollBeatRole, number, number, ScrollShotScale, number, number];

function buildCuts(rows: readonly RawCutTuple[]): readonly ScrollPacingCut[] {
  return rows.map((r, idx) => ({
    cutId: `cut-${String(idx + 1).padStart(2, "0")}`,
    cutNumber: idx + 1,
    sceneLabelKo: r[0], sceneLabelEn: r[1], beatRole: r[2],
    gutterPx: r[3], panelHeightPx: r[4], shotScale: r[5], dialogueChars: r[6], tensionScore: r[7],
  }));
}

export const SCROLL_PACING_PRESETS: readonly ScrollPacingPreset[] = [
  {
    id: "romance-ep1",
    titleKo: "로맨스 감정 고조 1화", titleEn: "Romance Emotional Swell Ep.1",
    episodeLabelKo: "1화 · 16컷 대표 구간", episodeLabelEn: "Ep.1 · 16-Cut Segment",
    genreKo: "로맨스", genreEn: "Romance",
    rhythmGoalKo: "일상 호감에서 숨 고르기 여백을 거쳐 고백 임팩트와 설레는 절단으로 마감",
    rhythmGoalEn: "Escalate from quiet tension through a breathing gutter into a confession climax and warm cliffhanger",
    cuts: buildCuts([
      ["소나기 내리는 교문 전경", "Rainy campus gate establishing shot", "hook", 80, 760, "extreme-wide", 12, 48],
      ["우산 없이 멈춰 선 주인공", "Protagonist paused without an umbrella", "setup", 110, 620, "wide", 18, 42],
      ["옆으로 기울어진 투명 우산", "Clear umbrella tilting overhead", "setup", 110, 560, "medium", 24, 44],
      ["어색한 인사 주고받기", "Awkward greeting exchange", "setup", 115, 540, "medium", 28, 46],
      ["젖은 어깨를 바라보는 시선", "Glance at rain-soaked shoulder", "setup", 110, 540, "medium", 22, 45],
      ["정류장까지 나란히 걷는 발걸음", "Walking side by side to the bus stop", "build", 120, 560, "wide", 26, 47],
      ["과거 오해를 풀어놓는 긴 대사", "Long explanation clearing a past misunderstanding", "build", 100, 640, "medium", 68, 54],
      ["상대의 답장 사연 연달아 설명", "Follow-up monologue detailing unsent messages", "build", 95, 660, "medium", 74, 58],
      ["빗소리에 묻히는 짧은 한숨", "Quiet sigh under heavy rain", "breather", 160, 520, "close-up", 14, 52],
      ["우산 손잡이 위 스친 손끝", "Fingertips brushing on the umbrella handle", "build", 140, 620, "extreme-close-up", 8, 68],
      ["급히 눈을 마주치는 컷", "Sudden eye contact under the canopy", "build", 125, 680, "close-up", 16, 76],
      ["입술을 떼기 직전 정적", "Still pause before speaking", "breather", 150, 560, "close-up", 0, 64],
      ["고백 직격 클라이맥스 컷", "Direct confession climax frame", "climax", 95, 760, "medium", 32, 92],
      ["멈춘 빗방울과 흔들린 눈동자", "Frozen raindrops and trembling eyes", "build", 120, 620, "close-up", 12, 78],
      ["버스 헤드라이트가 스쳐 지나감", "Bus headlights sweeping past", "build", 130, 600, "wide", 34, 74],
      ["대답 직전 잘리는 엔딩 컷", "Cut right before the reply", "cliffhanger", 130, 640, "medium", 48, 76],
    ]),
  },
  {
    id: "action-ep12",
    titleKo: "액션 추격 12화", titleEn: "Action Rooftop Chase Ep.12",
    episodeLabelKo: "12화 · 20컷 대표 구간", episodeLabelEn: "Ep.12 · 20-Cut Segment",
    genreKo: "액션", genreEn: "Action",
    rhythmGoalKo: "빠른 연타 추격 뒤 찰나의 정적 여백으로 역전 일격과 낙하 클리프행어 극대화",
    rhythmGoalEn: "Drive rapid pursuit cuts into a sudden stillness gutter before the counter-strike and rooftop cliffhanger",
    cuts: buildCuts([
      ["네온 빗속 뒷골목 질주", "Sprint through rain-slick neon alley", "hook", 70, 740, "wide", 10, 68],
      ["철제 비상계단 도약", "Vaulting onto iron fire escape", "build", 85, 620, "medium", 14, 73],
      ["뒤쫓는 그림자 세 명", "Three shadows closing behind", "build", 90, 580, "wide", 12, 66],
      ["무전기 작전 브리핑 연타 1", "Dense radio tactical briefing 1", "setup", 95, 620, "medium", 82, 62],
      ["무전기 봉쇄 경로 설명 2", "Dense radio blockade breakdown 2", "setup", 95, 610, "medium", 66, 60],
      ["환풍구 구간 단순 돌파 1", "Routine vent hurdle 1", "build", 90, 560, "medium", 24, 61],
      ["환풍구 구간 단순 돌파 2", "Routine vent hurdle 2", "build", 95, 560, "medium", 22, 63],
      ["간판 위 착지 반복 3", "Repeated neon-sign landing 3", "build", 90, 570, "medium", 18, 62],
      ["옥상 난간까지 평행 추격 4", "Flat parallel rooftop sprint 4", "build", 100, 580, "wide", 20, 64],
      ["칼날 섬광이 시야를 가름", "Blade glint slicing across frame", "build", 80, 620, "close-up", 10, 74],
      ["철근을 딛고 반격 자세", "Pivoting off steel beam into stance", "build", 75, 660, "medium", 16, 80],
      ["연속 회피 3연타 동작", "Three-beat dodge sequence", "build", 70, 580, "wide", 8, 82],
      ["벽면 반동 직전 숨 멈춤", "Breath hold before wall rebound", "breather", 130, 500, "close-up", 6, 70],
      ["상대 빈틈을 포착한 시선", "Eyes locking onto the opening", "build", 110, 560, "extreme-close-up", 4, 83],
      ["역전 일격 필살 클라이맥스", "Decisive counter-strike climax", "climax", 110, 820, "medium", 28, 96],
      ["부서진 콘크리트 파편 비산", "Shattered concrete debris flying", "build", 100, 700, "wide", 10, 82],
      ["먼지 속 거친 호흡 정리", "Catching breath through swirling dust", "breather", 150, 540, "medium", 18, 68],
      ["옥상 끝자락에 선 최종 보스", "Final boss stepping onto rooftop edge", "build", 120, 640, "wide", 30, 76],
      ["무너지는 난간과 미끄러진 발", "Crumbling ledge and slipping boot", "build", 125, 620, "close-up", 24, 79],
      ["추락 직전 손을 놓치는 엔딩", "Fingers losing grip over the drop", "cliffhanger", 120, 680, "medium", 44, 81],
    ]),
  },
  {
    id: "thriller-twist",
    titleKo: "스릴러 반전 엔딩", titleEn: "Thriller Twist Ending",
    episodeLabelKo: "24화 · 18컷 대표 구간", episodeLabelEn: "Ep.24 · 18-Cut Segment",
    genreKo: "스릴러", genreEn: "Thriller",
    rhythmGoalKo: "건조한 단서 탐색에서 정적 여백을 길게 늘여 진범 공개 반전과 충격 절단 완성",
    rhythmGoalEn: "Stretch silence gutters out of dry investigation cuts to detonate the culprit reveal and cold cut-off",
    cuts: buildCuts([
      ["자정 복도 깜빡이는 비상등", "Flickering midnight hallway lamp", "hook", 95, 720, "extreme-wide", 8, 56],
      ["잠겨 있어야 할 자료실 문", "Archive door left slightly ajar", "setup", 120, 600, "wide", 14, 50],
      ["CCTV 타임코드 점검 1", "Reviewing CCTV timecode 1", "setup", 125, 560, "medium", 26, 48],
      ["출입 카드 로그 대조 2", "Cross-checking keycard log 2", "setup", 130, 560, "medium", 30, 50],
      ["비상계단 센서 기록 확인 3", "Inspecting stairwell sensor log 3", "setup", 120, 550, "medium", 28, 49],
      ["사물함 열쇠 번호 대조 4", "Matching locker key serial 4", "setup", 130, 560, "medium", 24, 51],
      ["형사의 알리바이 추리 독백 1", "Detective alibi deduction wall of text 1", "build", 110, 660, "medium", 76, 58],
      ["공범 동선 가설 설명 2", "Accomplice timeline monologue 2", "build", 105, 680, "medium", 86, 61],
      ["종이 봉투 안에서 떨어진 사진", "Photograph slipping out of manila folder", "build", 135, 600, "close-up", 12, 68],
      ["복도 바깥 젖은 발자국 소리", "Wet footsteps echoing outside", "build", 125, 580, "wide", 10, 74],
      ["문 손잡이가 천천히 돌아감", "Door handle turning slowly", "build", 115, 620, "extreme-close-up", 6, 80],
      ["형광등이 꺼지며 내려앉은 어둠", "Fluorescent tube dying into blackout", "breather", 155, 540, "wide", 0, 66],
      ["손전등 빛이 문턱을 훑음", "Flashlight beam sweeping the threshold", "build", 130, 600, "medium", 8, 78],
      ["진범 얼굴이 드러나는 반전 컷", "Culprit face revealed in flash of light", "climax", 85, 780, "medium", 26, 95],
      ["사진 뒷면의 지워진 서명", "Erased signature on the back of the photo", "build", 120, 620, "close-up", 18, 82],
      ["주인공 이름이 적힌 명단", "Roster listing the protagonist's own name", "build", 130, 600, "medium", 34, 74],
      ["등 뒤에서 잠기는 철문 소리", "Steel lock snapping shut behind", "build", 135, 610, "medium", 30, 77],
      ["미소 짓는 진범의 한 마디", "Culprit smiling with final line", "cliffhanger", 140, 650, "medium", 54, 79],
    ]),
  },
  {
    id: "comedy-fourbeat",
    titleKo: "일상 코미디 4단 템포", titleEn: "Slice-of-Life 4-Beat Comedy",
    episodeLabelKo: "7화 · 14컷 대표 구간", episodeLabelEn: "Ep.7 · 14-Cut Segment",
    genreKo: "일상 코미디", genreEn: "Comedy",
    rhythmGoalKo: "기·승·전·결 4단 템포를 살리고 만담 과밀을 덜어내 펀치라인 여백과 반전 엔딩 강화",
    rhythmGoalEn: "Sharpen 4-beat comedic rhythm by trimming chatter walls and framing punchline timing gutters",
    cuts: buildCuts([
      ["월요일 아침 완벽 지각 방지 선언", "Monday morning vow never to be late again", "hook", 80, 640, "wide", 22, 46],
      ["알람 세 개 점검 루틴 1", "Checking three alarms routine 1", "setup", 100, 540, "medium", 26, 36],
      ["현관 신발 정리 루틴 2", "Lining up shoes by the door 2", "setup", 105, 530, "medium", 24, 38],
      ["엘리베이터 대기 루틴 3", "Waiting calmly for the elevator 3", "setup", 100, 540, "medium", 28, 37],
      ["동료와의 장황한 출근 무용담 1", "Overlong commuting brag banter 1", "build", 95, 620, "medium", 68, 48],
      ["회사 커피 머신 고장 변명 2", "Rambling excuse about office coffee machine 2", "build", 95, 640, "medium", 84, 52],
      ["바지 주머니에서 울린 수상한 진동", "Suspicious buzz from trouser pocket", "build", 115, 560, "close-up", 16, 62],
      ["회의실 문 앞에서 멈춘 정적", "Sudden silence right outside conference room", "breather", 140, 480, "medium", 4, 46],
      ["발밑을 내려다본 순간 동공 지진", "Looking down in instant panic", "build", 105, 580, "close-up", 10, 72],
      ["슬리퍼 짝짝이 대형 펀치라인", "Mismatched bedroom slippers giant punchline", "climax", 90, 720, "medium", 24, 88],
      ["동료들의 단체 침묵 리액션", "Deadpan group silence from coworkers", "breather", 130, 560, "wide", 12, 58],
      ["몰래 책상 밑으로 발 숨기기", "Frantically hiding feet under desk", "build", 115, 540, "medium", 28, 54],
      ["발표 지목으로 이름 불리는 순간", "Called up to present at the front", "build", 120, 560, "medium", 32, 62],
      ["슬리퍼를 바라보는 팀장님 엔딩", "Team lead staring straight at the slippers", "cliffhanger", 115, 600, "medium", 46, 68],
    ]),
  },
];

const clampNumber = (v: number, min: number, max: number, fallback: number): number =>
  Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
const round1 = (v: number): number => Math.round(v * 10) / 10;
const cloneCuts = (cuts: readonly ScrollPacingCut[]): ScrollPacingCut[] => cuts.map((c) => ({ ...c }));
const gradeFromScore = (score: number): ScrollRhythmGrade =>
  score >= 90 ? "S" : score >= 80 ? "A" : score >= 68 ? "B" : score >= 54 ? "C" : "D";

function sanitizeCut(cut: ScrollPacingCut, index: number): ScrollPacingCut {
  return {
    ...cut,
    cutId: cut.cutId || `cut-${String(index + 1).padStart(2, "0")}`,
    cutNumber: Number.isFinite(cut.cutNumber) && cut.cutNumber >= 1 ? Math.round(cut.cutNumber) : index + 1,
    gutterPx: Math.round(clampNumber(cut.gutterPx, MIN_GUTTER_PX, MAX_GUTTER_PX, 120)),
    panelHeightPx: Math.round(clampNumber(cut.panelHeightPx, MIN_PANEL_HEIGHT_PX, MAX_PANEL_HEIGHT_PX, 600)),
    dialogueChars: Math.round(clampNumber(cut.dialogueChars, MIN_DIALOGUE_CHARS, MAX_DIALOGUE_CHARS, 0)),
    tensionScore: Math.round(clampNumber(cut.tensionScore, MIN_TENSION_SCORE, MAX_TENSION_SCORE, 50)),
  };
}
export function getScrollPacingPreset(presetId: ScrollPacingPresetId): ScrollPacingPreset {
  return SCROLL_PACING_PRESETS.find((preset) => preset.id === presetId) ?? SCROLL_PACING_PRESETS[0];
}
export function getShotScaleMeta(scale: ScrollShotScale): ShotScaleMeta {
  return SHOT_SCALE_OPTIONS.find((item) => item.id === scale) ?? SHOT_SCALE_OPTIONS[2];
}

function detectFlatZones(cuts: readonly ScrollPacingCut[]): FlatPacingZone[] {
  const zones: FlatPacingZone[] = [];
  let start = 0;
  while (start <= cuts.length - 3) {
    if (cuts[start].tensionScore >= 85 || cuts[start].beatRole === "climax") { start += 1; continue; }
    let end = start;
    let minT = cuts[start].tensionScore; let maxT = minT;
    let minG = cuts[start].gutterPx; let maxG = minG;
    while (end + 1 < cuts.length) {
      const next = cuts[end + 1];
      if (next.tensionScore >= 85 || next.beatRole === "climax") break;
      const nMinT = Math.min(minT, next.tensionScore); const nMaxT = Math.max(maxT, next.tensionScore);
      const nMinG = Math.min(minG, next.gutterPx); const nMaxG = Math.max(maxG, next.gutterPx);
      if (Math.abs(next.tensionScore - cuts[end].tensionScore) <= 6 && nMaxT - nMinT <= 8 && nMaxG - nMinG <= 55) {
        end += 1; minT = nMinT; maxT = nMaxT; minG = nMinG; maxG = nMaxG;
      } else break;
    }
    const len = end - start + 1;
    if (len >= 3) {
      const slice = cuts.slice(start, end + 1);
      const cutNumbers = slice.map((item) => item.cutNumber);
      const avgTension = round1(slice.reduce((s, item) => s + item.tensionScore, 0) / len);
      const tensionSpan = maxT - minT;
      zones.push({
        startCut: cutNumbers[0], endCut: cutNumbers[len - 1], cutNumbers, avgTension, tensionSpan,
        severity: len >= 4 ? "critical" : "warn",
        reasonKo: `${cutNumbers[0]}~${cutNumbers[len - 1]}컷(${len}연속) 긴장도 편차 ${tensionSpan}pt·여백 단조로 지루함 위험`,
        reasonEn: `Cuts ${cutNumbers[0]}-${cutNumbers[len - 1]} (${len} in a row) stay flat (${tensionSpan}pt span) with uniform gutters`,
      });
      start = end + 1;
    } else start += 1;
  }
  return zones;
}

function detectDenseDialogueZones(cuts: readonly ScrollPacingCut[]): DenseDialogueZone[] {
  const flagged = new Array<boolean>(cuts.length).fill(false);
  for (let i = 0; i < cuts.length; i += 1) {
    if (cuts[i].dialogueChars >= 78) flagged[i] = true;
    if (i + 1 < cuts.length) {
      const a = cuts[i].dialogueChars;
      const b = cuts[i + 1].dialogueChars;
      if ((a >= 52 && b >= 52) || (a + b >= 115 && a >= 45 && b >= 45)) {
        flagged[i] = true;
        flagged[i + 1] = true;
      }
    }
  }
  const zones: DenseDialogueZone[] = [];
  let idx = 0;
  while (idx < cuts.length) {
    if (!flagged[idx]) { idx += 1; continue; }
    let end = idx;
    while (end + 1 < cuts.length && flagged[end + 1]) end += 1;
    const slice = cuts.slice(idx, end + 1);
    const cutNumbers = slice.map((item) => item.cutNumber);
    const totalChars = slice.reduce((s, item) => s + item.dialogueChars, 0);
    const maxChars = Math.max(...slice.map((item) => item.dialogueChars));
    const rangeKo = slice.length === 1 ? `${cutNumbers[0]}컷` : `${cutNumbers[0]}~${cutNumbers[cutNumbers.length - 1]}컷`;
    const rangeEn = slice.length === 1 ? `Cut ${cutNumbers[0]}` : `Cuts ${cutNumbers[0]}-${cutNumbers[cutNumbers.length - 1]}`;
    zones.push({
      startCut: cutNumbers[0], endCut: cutNumbers[cutNumbers.length - 1], cutNumbers, totalChars, maxChars,
      severity: maxChars >= 80 || slice.length >= 3 ? "critical" : "warn",
      reasonKo: `${rangeKo} 누적 ${totalChars}자(최대 ${maxChars}자) 과밀 대사로 스크롤 호흡 막힘`,
      reasonEn: `${rangeEn} pack ${totalChars} chars (peak ${maxChars}), clogging scroll pacing`,
    });
    idx = end + 1;
  }
  return zones;
}

function detectClimaxGutterShortfalls(cuts: readonly ScrollPacingCut[]): ClimaxGutterShortfall[] {
  const shortfalls: ClimaxGutterShortfall[] = [];
  for (let i = 1; i < cuts.length; i += 1) {
    const cut = cuts[i];
    const prev = cuts[i - 1];
    const isClimax = cut.beatRole === "climax" || (cut.beatRole !== "cliffhanger" && cut.tensionScore >= 86 && cut.tensionScore - prev.tensionScore >= 12);
    if (!isClimax) continue;
    const recommendedGutterPx = cut.tensionScore >= 92 ? 320 : 280;
    if (cut.gutterPx < recommendedGutterPx) {
      const deficitPx = recommendedGutterPx - cut.gutterPx;
      shortfalls.push({
        cutNumber: cut.cutNumber, currentGutterPx: cut.gutterPx, recommendedGutterPx, deficitPx,
        tensionScore: cut.tensionScore, severity: deficitPx >= 140 ? "critical" : "warn",
        reasonKo: `${cut.cutNumber}컷 클라이맥스(긴장도 ${cut.tensionScore}) 직전 여백 ${cut.gutterPx}px로 권장 ${recommendedGutterPx}px 대비 ${deficitPx}px 부족`,
        reasonEn: `Climax Cut ${cut.cutNumber} (tension ${cut.tensionScore}) has ${cut.gutterPx}px gutter, ${deficitPx}px below ${recommendedGutterPx}px target`,
      });
    }
  }
  return shortfalls;
}

function computeCliffhangerStrength(cuts: readonly ScrollPacingCut[]): number {
  if (cuts.length === 0) return 0;
  const tail = cuts.slice(-3);
  const last = tail[tail.length - 1];
  const prev = tail.length >= 2 ? tail[tail.length - 2] : last;
  const rise = last.tensionScore - tail[0].tensionScore;
  const stepToEnd = last.tensionScore - prev.tensionScore;
  const accelBonus = tail.length >= 3 && prev.gutterPx <= 110 && prev.panelHeightPx <= 540 ? 6 : 0;
  const momentum = clampNumber(
    (rise > 0 ? Math.min(12, rise * 0.65) : Math.max(-6, rise * 0.4)) + (stepToEnd > 0 ? Math.min(8, stepToEnd * 0.7) : 0) + accelBonus,
    0, 24, 0,
  );
  const gutterScore = last.gutterPx >= 260 && last.gutterPx <= 500
    ? 14 + clampNumber((last.gutterPx - prev.gutterPx) / 40, 0, 4, 0)
    : last.gutterPx >= 180 ? 9 : 4;
  const dialoguePunch = last.dialogueChars <= 16 ? 12 : last.dialogueChars <= 28 ? 8 : last.dialogueChars <= 42 ? 4 : 1;
  const shotBonus = last.shotScale === "extreme-close-up" ? 8 : last.shotScale === "close-up" ? 6 : last.shotScale === "medium" ? 3 : 2;
  return Math.round(clampNumber((last.tensionScore / 100) * 38 + momentum + gutterScore + dialoguePunch + shotBonus, 0, 100, 0));
}

export function auditScrollTensionCurve(rawCuts: readonly ScrollPacingCut[]): ScrollTensionAuditReport {
  if (rawCuts.length === 0) {
    return {
      cutCount: 0, immersionScore: 0, grade: "D", cliffhangerStrength: 0,
      totalScrollHeightPx: 0, estimatedTotalReadSec: 0, averageGutterPx: 0, averageDialogueChars: 0,
      tensionRange: 0, peakTensionCutNumber: 0, peakTensionScore: 0,
      flatZones: [], denseDialogueZones: [], climaxGutterShortfalls: [], issues: [], cutDiagnostics: [],
    };
  }

  const cuts = rawCuts.map(sanitizeCut);
  const flatZones = detectFlatZones(cuts);
  const denseDialogueZones = detectDenseDialogueZones(cuts);
  const climaxGutterShortfalls = detectClimaxGutterShortfalls(cuts);
  const cliffhangerStrength = computeCliffhangerStrength(cuts);

  const issues: ScrollPacingIssue[] = [
    ...flatZones.map((z): ScrollPacingIssue => ({
      id: `flat-${z.startCut}-${z.endCut}`, code: "flat-pacing", severity: z.severity, cutNumbers: z.cutNumbers,
      titleKo: `지루함 경고 · ${z.startCut}~${z.endCut}컷 연속 평탄`,
      titleEn: `Flat Pacing · Cuts ${z.startCut}-${z.endCut}`, detailKo: z.reasonKo, detailEn: z.reasonEn,
    })),
    ...denseDialogueZones.map((z): ScrollPacingIssue => ({
      id: `dense-${z.startCut}-${z.endCut}`, code: "dense-dialogue", severity: z.severity, cutNumbers: z.cutNumbers,
      titleKo: `호흡 막힘 · ${z.startCut === z.endCut ? `${z.startCut}컷` : `${z.startCut}~${z.endCut}컷`} 대사 과밀`,
      titleEn: `Dense Dialogue · ${z.startCut === z.endCut ? `Cut ${z.startCut}` : `Cuts ${z.startCut}-${z.endCut}`}`,
      detailKo: z.reasonKo, detailEn: z.reasonEn,
    })),
    ...climaxGutterShortfalls.map((s): ScrollPacingIssue => ({
      id: `climax-gutter-${s.cutNumber}`, code: "narrow-climax-gutter", severity: s.severity, cutNumbers: [s.cutNumber],
      titleKo: `임팩트 약화 · ${s.cutNumber}컷 클라이맥스 직전 여백 부족`,
      titleEn: `Weak Impact · Narrow Gutter Before Cut ${s.cutNumber}`, detailKo: s.reasonKo, detailEn: s.reasonEn,
    })),
  ];

  if (cliffhangerStrength < 76) {
    const tailCuts = cuts.slice(-3).map((item) => item.cutNumber);
    issues.push({
      id: `weak-cliffhanger-${tailCuts[tailCuts.length - 1]}`, code: "weak-cliffhanger",
      severity: cliffhangerStrength < 56 ? "critical" : "warn", cutNumbers: tailCuts,
      titleKo: `엔딩 여운 약화 · 클리프행어 강도 ${cliffhangerStrength}점`,
      titleEn: `Soft Ending · Cliffhanger Strength ${cliffhangerStrength}`,
      detailKo: `마지막 ${tailCuts.length}컷(${tailCuts[0]}~${tailCuts[tailCuts.length - 1]}컷) 템포 가속과 절단 여백이 부족합니다.`,
      detailEn: `Final ${tailCuts.length} cuts (${tailCuts[0]}-${tailCuts[tailCuts.length - 1]}) need tighter acceleration and sharper cut-off.`,
    });
  }

  let cursorY = 0;
  let totalReadSec = 0;
  let peakCut = cuts[0];
  let minTension = cuts[0].tensionScore;
  let maxTension = cuts[0].tensionScore;

  const cutDiagnostics: CutPacingDiagnostic[] = cuts.map((cut, index) => {
    const scrollStartPx = cursorY;
    const blockHeight = cut.gutterPx + cut.panelHeightPx;
    cursorY += blockHeight;
    const estimatedReadSec = round1(blockHeight / SCROLL_PX_PER_SEC + cut.dialogueChars / CHARS_PER_SEC);
    totalReadSec += estimatedReadSec;
    if (cut.tensionScore > peakCut.tensionScore) peakCut = cut;
    if (cut.tensionScore < minTension) minTension = cut.tensionScore;
    if (cut.tensionScore > maxTension) maxTension = cut.tensionScore;
    const matched = issues.filter((issue) => issue.cutNumbers.includes(cut.cutNumber));
    const status: ScrollPacingSeverity = matched.some((m) => m.severity === "critical") ? "critical" : matched.length > 0 ? "warn" : "ok";
    return {
      cutNumber: cut.cutNumber, scrollStartPx, scrollEndPx: cursorY, estimatedReadSec,
      tensionDelta: index === 0 ? 0 : cut.tensionScore - cuts[index - 1].tensionScore,
      warningCodes: Array.from(new Set(matched.map((m) => m.code))), status,
    };
  });

  const tensionRange = maxTension - minTension;
  const dynamicBonus = tensionRange >= 40 ? 7 : tensionRange >= 28 ? 4 : tensionRange < 18 ? -6 : 0;
  const cliffhangerDelta = Math.round(clampNumber((cliffhangerStrength - 62) * 0.28, -9, 10, 0));
  let penalty = 0;
  for (const z of flatZones) penalty += z.severity === "critical" ? 13 : 9;
  for (const z of denseDialogueZones) penalty += z.severity === "critical" ? 12 : 8;
  for (const s of climaxGutterShortfalls) penalty += s.severity === "critical" ? 14 : 10;
  if (cliffhangerStrength < 76) penalty += cliffhangerStrength < 56 ? 9 : 5;

  const immersionScore = Math.round(clampNumber(85 + dynamicBonus + cliffhangerDelta - penalty, 0, 100, 0));
  return {
    cutCount: cuts.length, immersionScore, grade: gradeFromScore(immersionScore), cliffhangerStrength,
    totalScrollHeightPx: cursorY, estimatedTotalReadSec: round1(totalReadSec),
    averageGutterPx: Math.round(cuts.reduce((s, c) => s + c.gutterPx, 0) / cuts.length),
    averageDialogueChars: round1(cuts.reduce((s, c) => s + c.dialogueChars, 0) / cuts.length),
    tensionRange, peakTensionCutNumber: peakCut.cutNumber, peakTensionScore: peakCut.tensionScore,
    flatZones, denseDialogueZones, climaxGutterShortfalls, issues, cutDiagnostics,
  };
}

function buildCutPatches(before: readonly ScrollPacingCut[], after: readonly ScrollPacingCut[]): readonly CutPacingPatch[] {
  const patches: CutPacingPatch[] = [];
  for (let i = 0; i < before.length; i += 1) {
    const prev = before[i];
    const next = after[i];
    if (!next) continue;
    const dG = next.gutterPx - prev.gutterPx;
    const dH = next.panelHeightPx - prev.panelHeightPx;
    const dD = next.dialogueChars - prev.dialogueChars;
    const dT = next.tensionScore - prev.tensionScore;
    if (dG === 0 && dH === 0 && dD === 0 && dT === 0 && next.shotScale === prev.shotScale) continue;
    patches.push({
      cutNumber: next.cutNumber,
      gutterPx: dG !== 0 ? next.gutterPx : undefined,
      panelHeightPx: dH !== 0 ? next.panelHeightPx : undefined,
      shotScale: next.shotScale !== prev.shotScale ? next.shotScale : undefined,
      dialogueChars: dD !== 0 ? next.dialogueChars : undefined,
      tensionScore: dT !== 0 ? next.tensionScore : undefined,
      deltaGutterPx: dG, deltaPanelHeightPx: dH, deltaDialogueChars: dD, deltaTensionScore: dT,
    });
  }
  return patches;
}

function buildProposal(
  rank: 1 | 2 | 3, strategyId: ScrollPacingStrategyId, titleKo: string, titleEn: string,
  summaryKo: string, summaryEn: string, changesKo: readonly string[], changesEn: readonly string[],
  baseCuts: readonly ScrollPacingCut[], baseAudit: ScrollTensionAuditReport, proposedCuts: readonly ScrollPacingCut[],
): ScrollPacingProposal {
  const cutPatches = buildCutPatches(baseCuts, proposedCuts);
  const projectedAudit = auditScrollTensionCurve(proposedCuts);
  return {
    id: `proposal-${rank}-${strategyId}`, rank, strategyId, titleKo, titleEn, summaryKo, summaryEn,
    changesKo, changesEn, affectedCutNumbers: cutPatches.map((p) => p.cutNumber), cutPatches,
    proposedCuts, projectedAudit,
    scoreGain: projectedAudit.immersionScore - baseAudit.immersionScore,
    cliffhangerGain: projectedAudit.cliffhangerStrength - baseAudit.cliffhangerStrength,
  };
}

export function proposeScrollPacingAdjustmentsTop3(rawCuts: readonly ScrollPacingCut[]): ScrollPacingProposalTop3 {
  const baseCuts = rawCuts.map(sanitizeCut);
  const baseAudit = auditScrollTensionCurve(baseCuts);

  // 1) 긴장 여백 확장안 (+180~320px)
  const cutsP1 = cloneCuts(baseCuts);
  const ko1: string[] = [];
  const en1: string[] = [];
  if (cutsP1.length >= 2) {
    const targets = baseAudit.climaxGutterShortfalls.length > 0
      ? baseAudit.climaxGutterShortfalls.map((item) => item.cutNumber - 1)
      : [Math.max(1, baseAudit.peakTensionCutNumber - 1)];
    for (const idx of targets) {
      const target = cutsP1[idx];
      if (!target) continue;
      const sf = baseAudit.climaxGutterShortfalls.find((item) => item.cutNumber === target.cutNumber);
      const addPx = Math.round(clampNumber(sf ? sf.deficitPx + 45 : 220, TENSION_GUTTER_EXPANSION_MIN_PX, TENSION_GUTTER_EXPANSION_MAX_PX, 240));
      const nextG = Math.min(MAX_GUTTER_PX, target.gutterPx + addPx);
      cutsP1[idx] = { ...target, gutterPx: nextG, tensionScore: Math.min(MAX_TENSION_SCORE, target.tensionScore + 4) };
      ko1.push(`${target.cutNumber}컷 직전 세로 여백 +${nextG - target.gutterPx}px 확장 (${target.gutterPx}→${nextG}px)`);
      en1.push(`Expand gutter before Cut ${target.cutNumber} by +${nextG - target.gutterPx}px (${target.gutterPx}→${nextG}px)`);
      if (idx - 1 >= 0) {
        const prev = cutsP1[idx - 1];
        const nextT = Math.max(30, prev.tensionScore - 5);
        cutsP1[idx - 1] = { ...prev, tensionScore: nextT, dialogueChars: Math.min(prev.dialogueChars, 14) };
        ko1.push(`${prev.cutNumber}컷 숨 고르기 긴장도 ${prev.tensionScore}→${nextT} 조정으로 낙차 극대화`);
        en1.push(`Ease breather Cut ${prev.cutNumber} tension ${prev.tensionScore}→${nextT} to sharpen contrast`);
      }
    }
  }
  const p1 = buildProposal(
    1, "tension-gutter-expansion", "긴장 여백 확장안", "Tension Gutter Expansion",
    "반전·고백 직전 세로 여백을 +180~320px 늘려 독자의 스크롤 속도를 늦추고 임팩트를 키웁니다.",
    "Add +180 to +320px vertical breathing space before climax cuts to build scroll anticipation.",
    ko1.length > 0 ? ko1 : ["핵심 전환 구간 여백 비율을 유지합니다."],
    en1.length > 0 ? en1 : ["Maintain existing transition gutter cadence."],
    baseCuts, baseAudit, cutsP1,
  );

  // 2) 클로즈업·임팩트 컷 확대안
  const cutsP2 = cloneCuts(baseCuts);
  const ko2: string[] = [];
  const en2: string[] = [];
  if (cutsP2.length > 0) {
    const peakIdx = Math.max(0, baseAudit.peakTensionCutNumber - 1);
    const peak = cutsP2[peakIdx];
    const nextH = Math.min(MAX_PANEL_HEIGHT_PX, peak.panelHeightPx + 220);
    const nextScale: ScrollShotScale = peak.shotScale === "extreme-close-up" ? "extreme-close-up" : "close-up";
    cutsP2[peakIdx] = {
      ...peak, panelHeightPx: nextH, shotScale: nextScale,
      tensionScore: Math.min(MAX_TENSION_SCORE, peak.tensionScore + 4), dialogueChars: Math.min(peak.dialogueChars, 22),
    };
    ko2.push(`${peak.cutNumber}컷 임팩트 높이 +${nextH - peak.panelHeightPx}px 확장 · ${getShotScaleMeta(nextScale).labelKo} 전환`);
    en2.push(`Expand impact Cut ${peak.cutNumber} height +${nextH - peak.panelHeightPx}px and tighten to ${getShotScaleMeta(nextScale).labelEn}`);
    for (const flat of baseAudit.flatZones) {
      const midIdx = flat.cutNumbers[Math.floor(flat.cutNumbers.length / 2)] - 1;
      const mid = cutsP2[midIdx];
      if (!mid) continue;
      cutsP2[midIdx] = {
        ...mid, shotScale: "close-up",
        tensionScore: Math.min(MAX_TENSION_SCORE, mid.tensionScore + 13),
        gutterPx: Math.min(MAX_GUTTER_PX, mid.gutterPx + 85),
        panelHeightPx: Math.min(MAX_PANEL_HEIGHT_PX, mid.panelHeightPx + 160),
      };
      ko2.push(`평탄 구간 ${mid.cutNumber}컷 클로즈업 확대 · 긴장도 +13pt로 리듬 변주`);
      en2.push(`Break flat zone at Cut ${mid.cutNumber} with close-up expansion (+13pt tension)`);
    }
    for (const dense of baseAudit.denseDialogueZones) {
      for (const cutNo of dense.cutNumbers) {
        const target = cutsP2[cutNo - 1];
        if (!target) continue;
        cutsP2[cutNo - 1] = {
          ...target,
          dialogueChars: Math.min(44, Math.max(18, Math.round(target.dialogueChars * 0.56))),
          gutterPx: Math.min(MAX_GUTTER_PX, target.gutterPx + 50),
        };
      }
      ko2.push(`과밀 대사 ${dense.startCut}~${dense.endCut}컷 말풍선 분리로 대사량 약 44% 경감`);
      en2.push(`Split speech balloons in Cuts ${dense.startCut}-${dense.endCut} to reduce density by ~44%`);
    }
  }
  const p2 = buildProposal(
    2, "closeup-impact-boost", "클로즈업·임팩트 컷 확대안", "Close-Up & Impact Boost",
    "핵심 컷 높이와 클로즈업을 키우고, 평탄 구간 변주와 과밀 대사 분리로 몰입 호흡을 되살립니다.",
    "Enlarge hero close-ups, punctuate flat runs, and split dense dialogue blocks for cleaner reading flow.",
    ko2.length > 0 ? ko2 : ["핵심 컷 구도와 대사 밀도가 균형 잡혀 있습니다."],
    en2.length > 0 ? en2 : ["Hero framing and dialogue density are already balanced."],
    baseCuts, baseAudit, cutsP2,
  );

  // 3) 엔딩 클리프행어 극대화안 (마지막 3컷 가속 + 여운 절단)
  const cutsP3 = cloneCuts(baseCuts);
  const ko3: string[] = [];
  const en3: string[] = [];
  if (cutsP3.length >= 3) {
    const i1 = cutsP3.length - 3;
    const i2 = cutsP3.length - 2;
    const i3 = cutsP3.length - 1;
    const c1 = cutsP3[i1];
    const c2 = cutsP3[i2];
    const c3 = cutsP3[i3];
    cutsP3[i1] = { ...c1, gutterPx: Math.min(c1.gutterPx, 85), panelHeightPx: Math.min(c1.panelHeightPx, 500), dialogueChars: Math.min(c1.dialogueChars, 24), tensionScore: Math.max(c1.tensionScore, 74) };
    cutsP3[i2] = { ...c2, gutterPx: 65, panelHeightPx: 440, shotScale: "close-up", dialogueChars: Math.min(c2.dialogueChars, 18), tensionScore: Math.max(c2.tensionScore, 85) };
    const nextEndG = Math.min(MAX_GUTTER_PX, Math.max(320, c3.gutterPx + 210));
    cutsP3[i3] = { ...c3, gutterPx: nextEndG, panelHeightPx: Math.min(MAX_PANEL_HEIGHT_PX, Math.max(c3.panelHeightPx + 180, 880)), shotScale: "extreme-close-up", dialogueChars: Math.min(c3.dialogueChars, 12), tensionScore: Math.max(c3.tensionScore, 96) };
    ko3.push(`${c1.cutNumber}·${c2.cutNumber}컷 여백 축소(85→65px)·컴팩트 높이로 스크롤 템포 가속`);
    ko3.push(`${c3.cutNumber}컷 직전 여백 ${nextEndG}px 확장 · 익스트림 클로즈업 · 대사 ${cutsP3[i3].dialogueChars}자로 여운 절단`);
    en3.push(`Accelerate Cuts ${c1.cutNumber}-${c2.cutNumber} with tighter gutters (85→65px) and compact panels`);
    en3.push(`Frame final Cut ${c3.cutNumber} with ${nextEndG}px pause gutter, ECU framing, and ${cutsP3[i3].dialogueChars}-char cold cut-off`);
  }
  const p3 = buildProposal(
    3, "cliffhanger-surge", "엔딩 클리프행어 극대화안", "Cliffhanger Surge Finale",
    "마지막 3컷의 템포를 빠르게 당긴 뒤 최종 컷 직전 긴 여백과 짧은 대사로 다음 화 클릭을 유도합니다.",
    "Accelerate the last 3 beats into a long suspense gutter and razor-sharp final cut-off.",
    ko3.length > 0 ? ko3 : ["최소 3컷 이상 구간에서 엔딩 가속안을 계산합니다."],
    en3.length > 0 ? en3 : ["Requires at least 3 cuts to tune ending acceleration."],
    baseCuts, baseAudit, cutsP3,
  );

  return [p1, p2, p3];
}

function pushHistory(
  session: ScrollPacingSessionState,
  action: ScrollPacingHistoryEntry["action"],
  summaryKo: string,
  summaryEn: string,
): { readonly revision: number; readonly history: readonly ScrollPacingHistoryEntry[] } {
  const revision = session.revision + 1;
  const entry: ScrollPacingHistoryEntry = { entryId: `rev-${revision}`, revision, action, summaryKo, summaryEn };
  return { revision, history: [entry, ...session.history].slice(0, 24) };
}

export function createScrollPacingSession(presetId: ScrollPacingPresetId = "romance-ep1"): ScrollPacingSessionState {
  const preset = getScrollPacingPreset(presetId);
  const baselineCuts = cloneCuts(preset.cuts);
  const workingCuts = cloneCuts(preset.cuts);
  const audit = auditScrollTensionCurve(workingCuts);
  const defaultCut = audit.climaxGutterShortfalls[0]?.cutNumber ?? audit.issues[0]?.cutNumbers[0] ?? workingCuts[0]?.cutNumber ?? 1;
  return {
    presetId: preset.id, baselineCuts, workingCuts, selectedCutNumber: defaultCut,
    previewProposalId: null, appliedStrategyIds: [], undoStack: [], revision: 0, history: [],
  };
}

export function selectScrollPacingCut(session: ScrollPacingSessionState, cutNumber: number): ScrollPacingSessionState {
  const clamped = Math.round(clampNumber(cutNumber, 1, Math.max(1, session.workingCuts.length), session.selectedCutNumber));
  return clamped === session.selectedCutNumber ? session : { ...session, selectedCutNumber: clamped };
}

export function previewScrollPacingProposal(session: ScrollPacingSessionState, proposalId: string | null): ScrollPacingSessionState {
  return { ...session, previewProposalId: proposalId !== null && session.previewProposalId === proposalId ? null : proposalId };
}

export function updateCutPacingMetrics(
  session: ScrollPacingSessionState, cutNumber: number, patch: EditableCutMetricsPatch,
): ScrollPacingSessionState {
  const idx = session.workingCuts.findIndex((item) => item.cutNumber === cutNumber);
  if (idx < 0) return session;
  const cur = session.workingCuts[idx];
  const updated: ScrollPacingCut = {
    ...cur,
    gutterPx: patch.gutterPx !== undefined ? Math.round(clampNumber(patch.gutterPx, MIN_GUTTER_PX, MAX_GUTTER_PX, cur.gutterPx)) : cur.gutterPx,
    panelHeightPx: patch.panelHeightPx !== undefined ? Math.round(clampNumber(patch.panelHeightPx, MIN_PANEL_HEIGHT_PX, MAX_PANEL_HEIGHT_PX, cur.panelHeightPx)) : cur.panelHeightPx,
    dialogueChars: patch.dialogueChars !== undefined ? Math.round(clampNumber(patch.dialogueChars, MIN_DIALOGUE_CHARS, MAX_DIALOGUE_CHARS, cur.dialogueChars)) : cur.dialogueChars,
    tensionScore: patch.tensionScore !== undefined ? Math.round(clampNumber(patch.tensionScore, MIN_TENSION_SCORE, MAX_TENSION_SCORE, cur.tensionScore)) : cur.tensionScore,
    shotScale: patch.shotScale ?? cur.shotScale,
  };
  if (
    updated.gutterPx === cur.gutterPx && updated.panelHeightPx === cur.panelHeightPx &&
    updated.dialogueChars === cur.dialogueChars && updated.tensionScore === cur.tensionScore &&
    updated.shotScale === cur.shotScale
  ) return session;
  const nextWorking = cloneCuts(session.workingCuts);
  nextWorking[idx] = updated;
  const meta = pushHistory(
    session, "edit",
    `${cutNumber}컷 수동 보정 (여백 ${updated.gutterPx}px · 긴장도 ${updated.tensionScore} · 높이 ${updated.panelHeightPx}px)`,
    `Manual edit Cut ${cutNumber} (gutter ${updated.gutterPx}px · tension ${updated.tensionScore} · height ${updated.panelHeightPx}px)`,
  );
  return { ...session, workingCuts: nextWorking, previewProposalId: null, undoStack: [...session.undoStack, cloneCuts(session.workingCuts)], ...meta };
}

export function applyScrollPacingProposal(session: ScrollPacingSessionState, proposal: ScrollPacingProposal): ScrollPacingSessionState {
  const nextApplied = session.appliedStrategyIds.includes(proposal.strategyId)
    ? session.appliedStrategyIds : [...session.appliedStrategyIds, proposal.strategyId];
  const meta = pushHistory(
    session, "apply",
    `'${proposal.titleKo}' 적용 (${proposal.affectedCutNumbers.length}컷 조정 · 몰입 ${proposal.scoreGain >= 0 ? "+" : ""}${proposal.scoreGain}점)`,
    `Applied '${proposal.titleEn}' (${proposal.affectedCutNumbers.length} cuts · immersion ${proposal.scoreGain >= 0 ? "+" : ""}${proposal.scoreGain})`,
  );
  return {
    ...session, workingCuts: cloneCuts(proposal.proposedCuts), previewProposalId: null,
    appliedStrategyIds: nextApplied, undoStack: [...session.undoStack, cloneCuts(session.workingCuts)], ...meta,
  };
}

export function revertLastPacingAdjustment(session: ScrollPacingSessionState): ScrollPacingSessionState {
  if (session.undoStack.length === 0) return session;
  const previousCuts = session.undoStack[session.undoStack.length - 1];
  const nextStack = session.undoStack.slice(0, -1);
  const meta = pushHistory(session, "revert-last", "직전 컷 호흡 변경을 한 단계 되돌렸습니다.", "Reverted the latest pacing adjustment by one step.");
  return {
    ...session, workingCuts: cloneCuts(previousCuts), previewProposalId: null, undoStack: nextStack,
    appliedStrategyIds: nextStack.length === 0 ? [] : session.appliedStrategyIds, ...meta,
  };
}

export function revertAllPacingAdjustments(session: ScrollPacingSessionState): ScrollPacingSessionState {
  const meta = pushHistory(session, "revert-all", "모든 컷 여백·긴장도 변경을 프리셋 원본으로 되돌렸습니다.", "Restored all cuts to the original episode baseline.");
  return { ...session, workingCuts: cloneCuts(session.baselineCuts), previewProposalId: null, appliedStrategyIds: [], undoStack: [], ...meta };
}

export function exportScrollPacingMarkdown(params: {
  readonly preset: ScrollPacingPreset; readonly cuts: readonly ScrollPacingCut[];
  readonly audit: ScrollTensionAuditReport; readonly session?: ScrollPacingSessionState;
  readonly locale?: "ko" | "en";
}): string {
  const { preset, cuts, audit, session, locale = "ko" } = params;
  const isEn = locale === "en";
  const lines: string[] = [
    isEn ? `# Scroll Pacing & Tension Sheet — ${preset.titleEn}` : `# 세로 스크롤 감정 곡선 · 컷 호흡 리듬 시트 — ${preset.titleKo}`,
    "",
    isEn ? `- **Immersion Rhythm Score**: ${audit.immersionScore}/100 (Grade ${audit.grade})` : `- **스크롤 몰입 리듬 점수**: ${audit.immersionScore}/100 (${audit.grade}등급)`,
    isEn ? `- **Cliffhanger Strength**: ${audit.cliffhangerStrength}/100` : `- **엔딩 클리프행어 강도**: ${audit.cliffhangerStrength}/100`,
    isEn ? `- **Scroll Length & Est. Read Time**: ${audit.totalScrollHeightPx}px · ${audit.estimatedTotalReadSec}s (${audit.cutCount} cuts)` : `- **총 세로 길이 · 예상 정독 시간**: ${audit.totalScrollHeightPx}px · ${audit.estimatedTotalReadSec}초 (${audit.cutCount}컷)`,
    isEn ? `- **Revision**: r${session?.revision ?? 0} | **Open Warnings**: ${audit.issues.length}` : `- **리비전**: r${session?.revision ?? 0} | **감지 경고**: ${audit.issues.length}건`,
    "",
    isEn ? "## Cut-by-Cut Rhythm Sheet" : "## 컷별 여백·긴장도 리듬표",
    isEn ? "| Cut | Scene | Beat | Shot | Gutter(px) | Height(px) | Dialogue | Tension | Status |" : "| 컷 | 장면 | 역할 | 샷 | 여백(px) | 컷높이(px) | 대사(자) | 긴장도 | 진단 |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |",
  ];
  for (let i = 0; i < cuts.length; i += 1) {
    const cut = cuts[i];
    const role = isEn ? BEAT_ROLE_LABELS[cut.beatRole].en : BEAT_ROLE_LABELS[cut.beatRole].ko;
    const shot = isEn ? getShotScaleMeta(cut.shotScale).shortEn : getShotScaleMeta(cut.shotScale).shortKo;
    lines.push(`| #${cut.cutNumber} | ${isEn ? cut.sceneLabelEn : cut.sceneLabelKo} | ${role} | ${shot} | ${cut.gutterPx} | ${cut.panelHeightPx} | ${cut.dialogueChars} | ${cut.tensionScore} | ${audit.cutDiagnostics[i]?.status ?? "ok"} |`);
  }
  if (audit.issues.length > 0) {
    lines.push("", isEn ? "## Detected Pacing Warnings" : "## 감지된 호흡 정체·이탈 경고");
    for (const issue of audit.issues) {
      lines.push(`- [${issue.severity.toUpperCase()}] ${isEn ? issue.titleEn : issue.titleKo}: ${isEn ? issue.detailEn : issue.detailKo}`);
    }
  }
  return lines.join("\n");
}

export function exportScrollPacingJson(params: {
  readonly preset: ScrollPacingPreset; readonly cuts: readonly ScrollPacingCut[];
  readonly audit: ScrollTensionAuditReport; readonly session?: ScrollPacingSessionState;
}): string {
  const { preset, cuts, audit, session } = params;
  return JSON.stringify({
    schema: "toonstudio.scroll-pacing-tension-composer.v1",
    presetId: preset.id, presetTitleKo: preset.titleKo, presetTitleEn: preset.titleEn,
    revision: session?.revision ?? 0, appliedStrategyIds: session?.appliedStrategyIds ?? [],
    summary: {
      cutCount: audit.cutCount, immersionScore: audit.immersionScore, grade: audit.grade,
      cliffhangerStrength: audit.cliffhangerStrength, totalScrollHeightPx: audit.totalScrollHeightPx,
      estimatedTotalReadSec: audit.estimatedTotalReadSec, averageGutterPx: audit.averageGutterPx,
      averageDialogueChars: audit.averageDialogueChars, peakTensionCutNumber: audit.peakTensionCutNumber,
      peakTensionScore: audit.peakTensionScore, issueCount: audit.issues.length,
    },
    issues: audit.issues.map((i) => ({ id: i.id, code: i.code, severity: i.severity, cutNumbers: i.cutNumbers, titleKo: i.titleKo, titleEn: i.titleEn })),
    cuts: cuts.map((c, idx) => ({
      cutId: c.cutId, cutNumber: c.cutNumber, sceneLabelKo: c.sceneLabelKo, sceneLabelEn: c.sceneLabelEn,
      beatRole: c.beatRole, shotScale: c.shotScale, gutterPx: c.gutterPx, panelHeightPx: c.panelHeightPx,
      dialogueChars: c.dialogueChars, tensionScore: c.tensionScore, status: audit.cutDiagnostics[idx]?.status ?? "ok",
    })),
  }, null, 2);
}
