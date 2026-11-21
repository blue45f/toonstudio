/**
 * 3분 인터랙티브 실습 매뉴얼 엔진 (InteractiveManualEngine + searchManualRecipes)
 * 및 OKLCH 스펙터클 테마·IP 가치 시뮬레이터 통합 진입 모듈 (무과금 ₩0 · 결정론).
 */

export {
  ATELIER_GENRE_THEMES,
  StudioSpectacleThemeEngine,
  clampCurtainPosition,
  computeOklchContrastRatio,
  formatOklch,
  type AchievementPulseSpec,
  type AtelierGenreTheme,
  type AtelierGenreThemeId,
  type AtelierThemeContrastAudit,
  type BeforeAfterCurtainState,
  type OklchColor,
} from "./studio-spectacle-theme-engine";

export {
  DEFAULT_IP_VALUATION_INPUT,
  SECONDARY_EXPANSION_SPECS,
  evaluateWebtoonIpValuation,
  formatKrwMan,
  type IpValuationFormulaBreakdown,
  type IpValuationLever,
  type SecondaryExpansionId,
  type SecondaryExpansionSpec,
  type WebtoonIpValuationInput,
  type WebtoonIpValuationReport,
} from "./webtoon-ip-valuation-engine";

export type ManualStepId =
  | "step-1-draw-stroke"
  | "step-2-one-tap-color"
  | "step-3-speech-bubble";

export type ManualRecipeContext =
  | "all"
  | "canvas"
  | "color"
  | "lettering"
  | "scene3d"
  | "theme"
  | "ip";

export interface CanvasStrokePoint {
  readonly x: number;
  readonly y: number;
}

export interface ManualPracticeStroke {
  readonly id: string;
  readonly points: readonly CanvasStrokePoint[];
  readonly pathLengthPx: number;
}

export interface ManualColorTone {
  readonly id: string;
  readonly label: string;
  readonly fillOklch: string;
  readonly shadowOklch: string;
}

export interface ManualSpeechBubble {
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

export interface ManualCompletionBadge {
  readonly id: "studio-3min-first-clear";
  readonly title: string;
  readonly subtitle: string;
  readonly completedStepCount: 3;
}

export interface ManualStepDefinition {
  readonly id: ManualStepId;
  readonly order: 1 | 2 | 3;
  readonly title: string;
  readonly actionLabel: string;
  readonly estimatedSec: number;
  readonly shortcutHint: string;
  readonly contextualTip: string;
  readonly recipeContext: ManualRecipeContext;
}

export interface ManualPracticeSnapshot {
  readonly currentStepId: ManualStepId | null;
  readonly completedStepIds: readonly ManualStepId[];
  readonly progressPercent: number;
  readonly estimatedRemainingSec: number;
  readonly strokes: readonly ManualPracticeStroke[];
  readonly autoColorApplied: boolean;
  readonly selectedColorToneId: string;
  readonly speechBubble: ManualSpeechBubble | null;
  readonly badge: ManualCompletionBadge | null;
  readonly celebrationTriggered: boolean;
  readonly contextualTip: string;
  readonly statusMessage: string;
}

export interface ManualActionResult {
  readonly ok: boolean;
  readonly reason: string;
  readonly snapshot: ManualPracticeSnapshot;
}

export interface ManualRecipe {
  readonly id: string;
  readonly title: string;
  readonly context: Exclude<ManualRecipeContext, "all">;
  readonly contextLabel: string;
  readonly durationSec: number;
  readonly shortcut: string;
  readonly steps: readonly [string, string, string];
  readonly proTip: string;
  readonly keywords: readonly string[];
}

export interface ManualRecipeMatch {
  readonly recipe: ManualRecipe;
  readonly score: number;
  readonly matchedBy: "shortcut" | "title" | "keyword" | "context";
}

export const MANUAL_STEP_DEFINITIONS: readonly ManualStepDefinition[] = [
  {
    id: "step-1-draw-stroke",
    order: 1,
    title: "1단계 · 캔버스에 1획 긋기",
    actionLabel: "선화 1획 긋기",
    estimatedSec: 60,
    shortcutHint: "B (잉크 펜)",
    contextualTip: "필압 보정이 켜져 있어 손이 떨려도 매끄러운 웹툰 선이 그려집니다.",
    recipeContext: "canvas",
  },
  {
    id: "step-2-one-tap-color",
    order: 2,
    title: "2단계 · 원탭 자동 채색 적용",
    actionLabel: "원탭 자동 채색",
    estimatedSec: 60,
    shortcutHint: "G (스마트 채우기)",
    contextualTip: "선화 아래 레이어에 닫힌 영역을 자동 인식해 밑색과 1차 명암을 채웁니다.",
    recipeContext: "color",
  },
  {
    id: "step-3-speech-bubble",
    order: 3,
    title: "3단계 · 말풍선 대사 배치",
    actionLabel: "말풍선 배치 · 완주",
    estimatedSec: 60,
    shortcutHint: "T (말풍선·식자)",
    contextualTip: "대사 길이에 맞춰 말풍선 여백과 꼬리 방향을 자동 정렬합니다.",
    recipeContext: "lettering",
  },
];

export const MANUAL_COLOR_TONES: readonly ManualColorTone[] = [
  {
    id: "sunlit-cream",
    label: "햇살 크림 톤",
    fillOklch: "oklch(0.90 0.055 82)",
    shadowOklch: "oklch(0.76 0.085 68)",
  },
  {
    id: "ice-cyan",
    label: "청명 시안 톤",
    fillOklch: "oklch(0.84 0.065 212)",
    shadowOklch: "oklch(0.66 0.095 224)",
  },
  {
    id: "hanji-coral",
    label: "한지 코랄 톤",
    fillOklch: "oklch(0.87 0.075 34)",
    shadowOklch: "oklch(0.70 0.11 26)",
  },
];

export const MANUAL_RECIPES: readonly ManualRecipe[] = [
  {
    id: "recipe-ink-stroke",
    title: "떨림 없는 1획 잉크 선화 긋기",
    context: "canvas",
    contextLabel: "드로잉",
    durationSec: 15,
    shortcut: "B",
    steps: [
      "B 키로 잉크 펜을 선택하고 굵기를 3~5px로 맞춥니다.",
      "손떨림 보정(스무딩)을 켜고 캐릭터 윤곽을 한 번에 긋습니다.",
      "선 끝에서 힘을 빼 자연스러운 필압 테이퍼를 만듭니다.",
    ],
    proTip: "Shift를 누른 채 클릭하면 직선 집중선과 컷 테두리를 즉시 연결할 수 있습니다.",
    keywords: ["선화", "펜", "브러시", "1획", "긋기", "필압", "드로잉", "잉크"],
  },
  {
    id: "recipe-undo-redo",
    title: "실수 즉시 되돌리기·다시 실행",
    context: "canvas",
    contextLabel: "드로잉",
    durationSec: 10,
    shortcut: "Ctrl+Z",
    steps: [
      "방금 그은 획이 마음에 들지 않으면 Ctrl+Z(macOS: Cmd+Z)를 누릅니다.",
      "다시 살리려면 Ctrl+Shift+Z로 1단계 복원합니다.",
      "로컬 OPFS 스냅샷이 작업 이력을 안전하게 보존합니다.",
    ],
    proTip: "태블릿에서는 두 손가락 탭(되돌리기)·세 손가락 탭(다시 실행)을 함께 쓸 수 있습니다.",
    keywords: ["되돌리기", "실행취소", "복구", "히스토리", "undo", "단축키"],
  },
  {
    id: "recipe-one-tap-color",
    title: "원탭 자동 밑색·1차 그림자 채우기",
    context: "color",
    contextLabel: "채색",
    durationSec: 15,
    shortcut: "G",
    steps: [
      "선화 레이어를 참조로 지정한 뒤 G 키(스마트 채우기)를 누릅니다.",
      "원하는 아틀리에 팔레트 톤을 고르고 닫힌 영역 안쪽을 탭합니다.",
      "틈새 자동 보정이 2px 이하 열린 선을 메워 깔끔하게 채색합니다.",
    ],
    proTip: "채색 후 클리핑 마스크(Ctrl+Alt+G)를 얹으면 선 밖으로 번지지 않고 명암을 올릴 수 있습니다.",
    keywords: ["채색", "원탭", "자동채색", "밑색", "채우기", "컬러", "그림자", "팔레트"],
  },
  {
    id: "recipe-clipping-shadow",
    title: "선 밖 번짐 없는 레이어 클리핑 명암",
    context: "color",
    contextLabel: "채색",
    durationSec: 15,
    shortcut: "Ctrl+Alt+G",
    steps: [
      "밑색 레이어 바로 위에 새 레이어를 만들고 곱하기(Multiply) 모드로 바꿉니다.",
      "Ctrl+Alt+G로 아래 밑색 영역에 클리핑 마스크를 겁니다.",
      "광원 반대편에 1차 그림자와 림라이트를 빠르게 얹습니다.",
    ],
    proTip: "장르 아틀리에 무드 테마에 맞춰 그림자 채도를 살짝 낮추면 색이 탁해지지 않습니다.",
    keywords: ["클리핑", "레이어", "명암", "곱하기", "림라이트", "채색"],
  },
  {
    id: "recipe-speech-bubble",
    title: "웹툰 말풍선·세로/가로 식자 15초 배치",
    context: "lettering",
    contextLabel: "식자·말풍선",
    durationSec: 15,
    shortcut: "T",
    steps: [
      "T 키를 눌러 말풍선 도구를 열고 컷 상단 여백에 드래그합니다.",
      "대사를 입력하면 줄바꿈과 안전 여백이 모바일 가독성에 맞춰 정리됩니다.",
      "꼬리 핸들을 화자 입 방향으로 끌어 시선 동선을 완성합니다.",
    ],
    proTip: "한 말풍선에 3줄 이하로 나누면 모바일 세로 스크롤 완독률이 높아집니다.",
    keywords: ["말풍선", "대사", "식자", "텍스트", "글자", "폰트", "말꼬리"],
  },
  {
    id: "recipe-sfx-localization",
    title: "효과음(SFX) 다국어 레이어 분리",
    context: "lettering",
    contextLabel: "식자·말풍선",
    durationSec: 20,
    shortcut: "Shift+T",
    steps: [
      "Shift+T로 효과음 전용 벡터 레이어를 원고 선화와 분리해 생성합니다.",
      "외곽선 스트로크와 기울기를 조절해 타격감을 살립니다.",
      "글로벌 번역 시 텍스트 레이어만 교체해 배경 재작업을 없앱니다.",
    ],
    proTip: "해외 연재용 번역을 준비할 때 대사·효과음 레이어를 분리해 두면 현지화 시간이 절반 이하로 줄어듭니다.",
    keywords: ["효과음", "SFX", "번역", "다국어", "글로벌", "식자", "레이어"],
  },
  {
    id: "recipe-3d-stage-curtain",
    title: "러프 콘티 위에 3D 배경 투시 맞추기",
    context: "scene3d",
    contextLabel: "3D 배경",
    durationSec: 20,
    shortcut: "3",
    steps: [
      "3 키로 3D 배경 뷰포트를 열고 콘티의 눈높이(호라이즌)에 카메라를 맞춥니다.",
      "비포/애프터 커튼 슬라이더로 러프 콘티와 3D 선화 추출 결과를 대조합니다.",
      "마음에 드는 구도에서 선화·그림자 패스를 2D 레이어로 굽습니다.",
    ],
    proTip: "광각(24~28mm)은 헌터·액션 컷에, 표준(50mm)은 로판·학원 일상 컷에 자연스럽습니다.",
    keywords: ["3D", "배경", "투시", "카메라", "콘티", "비포애프터", "선화추출"],
  },
  {
    id: "recipe-genre-atelier-mood",
    title: "4대 장르 아틀리에 무드 테마 전환",
    context: "theme",
    contextLabel: "무드·IP",
    durationSec: 15,
    shortcut: "Alt+M",
    steps: [
      "Alt+M 또는 상단 장르 무드 바에서 작품 장르(로판·헌터·학원·무협)를 고릅니다.",
      "OKLCH 고대비 팔레트와 보조 광원이 작업실 분위기에 즉시 반영됩니다.",
      "장시간 야간 작업 시에도 4.5:1 이상 대비로 눈의 피로를 줄입니다.",
    ],
    proTip: "모션 민감도(prefers-reduced-motion)가 켜진 기기에서는 성취 연출이 정적 배지로 자동 전환됩니다.",
    keywords: ["테마", "무드", "로판", "헌터", "학원", "무협", "OKLCH", "다크모드", "대비"],
  },
  {
    id: "recipe-opfs-safe-save",
    title: "오프라인 즉시 저장 & 원고 보호 확인",
    context: "canvas",
    contextLabel: "드로잉",
    durationSec: 15,
    shortcut: "Ctrl+S",
    steps: [
      "Ctrl+S를 누르면 브라우저 로컬 OPFS 저장소에 원고 스냅샷이 즉시 기록됩니다.",
      "인터넷이 끊겨도 직전 획까지 손실 없이 이어 그릴 수 있습니다.",
      "마감 전 내보내기 체크리스트로 해상도와 라이선스 BOM을 함께 확인합니다.",
    ],
    proTip: "주기적인 로컬 스냅샷은 클라우드 업로드 비용(₩0) 없이 마감 사고를 예방합니다.",
    keywords: ["저장", "자동저장", "OPFS", "오프라인", "백업", "마감", "단축키"],
  },
  {
    id: "recipe-ip-valuation-lever",
    title: "연재 지표로 IP 확장 가치 우선순위 점검",
    context: "ip",
    contextLabel: "무드·IP",
    durationSec: 20,
    shortcut: "Alt+V",
    steps: [
      "현재 연재 회차, 완독률, 유료 전환율, 번역 언어 수를 입력합니다.",
      "단행본·웹소설·웹드라마·굿즈 등 2차 확장 옵션을 조합해 시뮬레이션합니다.",
      "가치 상승 레버 Top 3를 보고 다음 분기 집중 과제를 정합니다.",
    ],
    proTip: "회차가 40화 이상 쌓였을 때 다국어 번역과 2차 판권 확장의 시너지가 크게 커집니다.",
    keywords: ["IP", "가치", "시뮬레이터", "완독률", "유료전환", "판권", "번역", "웹드라마", "굿즈"],
  },
];

function computeStrokeLength(points: readonly CanvasStrokePoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    if (!prev || !curr) continue;
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    if (Number.isFinite(dx) && Number.isFinite(dy)) {
      total += Math.hypot(dx, dy);
    }
  }
  return Math.round(total * 10) / 10;
}

function clampUnit(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function buildSnapshot(state: {
  readonly completedStepIds: readonly ManualStepId[];
  readonly strokes: readonly ManualPracticeStroke[];
  readonly autoColorApplied: boolean;
  readonly selectedColorToneId: string;
  readonly speechBubble: ManualSpeechBubble | null;
  readonly statusMessage: string;
}): ManualPracticeSnapshot {
  const orderedIds: readonly ManualStepId[] = [
    "step-1-draw-stroke",
    "step-2-one-tap-color",
    "step-3-speech-bubble",
  ];
  const completedSet = new Set(state.completedStepIds);
  const completedOrdered = orderedIds.filter((id) => completedSet.has(id));
  const nextStep = MANUAL_STEP_DEFINITIONS.find((step) => !completedSet.has(step.id)) ?? null;
  const completedCount = completedOrdered.length;
  const progressPercent = completedCount === 3 ? 100 : Math.round((completedCount / 3) * 100);
  const estimatedRemainingSec = MANUAL_STEP_DEFINITIONS.reduce(
    (sum, step) => (completedSet.has(step.id) ? sum : sum + step.estimatedSec),
    0,
  );
  const allComplete = completedCount === 3;
  const badge: ManualCompletionBadge | null = allComplete
    ? {
        id: "studio-3min-first-clear",
        title: "3분 스튜디오 첫 완주",
        subtitle: "1획 선화 · 원탭 채색 · 말풍선 배치를 모두 마쳤습니다.",
        completedStepCount: 3,
      }
    : null;
  const contextualTip = nextStep
    ? nextStep.contextualTip
    : "모든 체험을 마쳤습니다. 아래 15초 레시피 검색이나 IP 가치 시뮬레이터로 이어가 보세요.";

  return {
    currentStepId: nextStep ? nextStep.id : null,
    completedStepIds: completedOrdered,
    progressPercent,
    estimatedRemainingSec,
    strokes: state.strokes,
    autoColorApplied: state.autoColorApplied,
    selectedColorToneId: state.selectedColorToneId,
    speechBubble: state.speechBubble,
    badge,
    celebrationTriggered: allComplete,
    contextualTip,
    statusMessage: state.statusMessage,
  };
}

export class InteractiveManualEngine {
  private snapshot: ManualPracticeSnapshot;

  constructor(initial?: Partial<ManualPracticeSnapshot>) {
    this.snapshot = buildSnapshot({
      completedStepIds: initial?.completedStepIds ?? [],
      strokes: initial?.strokes ?? [],
      autoColorApplied: initial?.autoColorApplied ?? false,
      selectedColorToneId: initial?.selectedColorToneId ?? MANUAL_COLOR_TONES[0]!.id,
      speechBubble: initial?.speechBubble ?? null,
      statusMessage:
        initial?.statusMessage ??
        "1단계부터 시작해 보세요. 캔버스에 1획만 그으면 바로 다음 단계가 열립니다.",
    });
  }

  static fromSnapshot(snapshot: ManualPracticeSnapshot): InteractiveManualEngine {
    return new InteractiveManualEngine(snapshot);
  }

  getSnapshot(): ManualPracticeSnapshot {
    return this.snapshot;
  }

  recordCanvasStroke(points: readonly CanvasStrokePoint[]): ManualActionResult {
    const validPoints = points
      .filter((pt) => Number.isFinite(pt.x) && Number.isFinite(pt.y))
      .map((pt) => ({
        x: Math.round(clampUnit(pt.x, 0, 320, 0) * 10) / 10,
        y: Math.round(clampUnit(pt.y, 0, 200, 0) * 10) / 10,
      }));
    const pathLengthPx = computeStrokeLength(validPoints);
    if (validPoints.length < 2 || pathLengthPx < 8) {
      this.snapshot = buildSnapshot({
        ...this.snapshot,
        statusMessage: "조금 더 길게 1획을 그어 주세요(최소 8px 이상 이동).",
      });
      return { ok: false, reason: "stroke-too-short", snapshot: this.snapshot };
    }

    const nextStroke: ManualPracticeStroke = {
      id: `stroke-${this.snapshot.strokes.length + 1}`,
      points: validPoints,
      pathLengthPx,
    };
    const nextCompleted = new Set<ManualStepId>(this.snapshot.completedStepIds);
    nextCompleted.add("step-1-draw-stroke");

    this.snapshot = buildSnapshot({
      ...this.snapshot,
      strokes: [...this.snapshot.strokes, nextStroke],
      completedStepIds: [...nextCompleted],
      statusMessage: "1단계 완료! 이제 원탭 자동 채색을 눌러 밑색을 채워 보세요.",
    });
    return { ok: true, reason: "stroke-recorded", snapshot: this.snapshot };
  }

  applyOneTapColor(toneId?: string): ManualActionResult {
    if (!this.snapshot.completedStepIds.includes("step-1-draw-stroke")) {
      this.snapshot = buildSnapshot({
        ...this.snapshot,
        statusMessage: "먼저 1단계에서 캔버스에 선화 1획을 그어 주세요.",
      });
      return { ok: false, reason: "prerequisite-step-1-required", snapshot: this.snapshot };
    }

    const chosenTone =
      MANUAL_COLOR_TONES.find((tone) => tone.id === toneId) ??
      MANUAL_COLOR_TONES.find((tone) => tone.id === this.snapshot.selectedColorToneId) ??
      MANUAL_COLOR_TONES[0]!;

    const nextCompleted = new Set<ManualStepId>(this.snapshot.completedStepIds);
    nextCompleted.add("step-2-one-tap-color");

    this.snapshot = buildSnapshot({
      ...this.snapshot,
      autoColorApplied: true,
      selectedColorToneId: chosenTone.id,
      completedStepIds: [...nextCompleted],
      statusMessage: `2단계 완료! "${chosenTone.label}" 밑색을 채웠습니다. 마지막으로 말풍선 대사를 올려 보세요.`,
    });
    return { ok: true, reason: "one-tap-color-applied", snapshot: this.snapshot };
  }

  placeSpeechBubble(
    rawText: string,
    position?: { readonly x: number; readonly y: number },
  ): ManualActionResult {
    if (!this.snapshot.completedStepIds.includes("step-2-one-tap-color")) {
      this.snapshot = buildSnapshot({
        ...this.snapshot,
        statusMessage: "먼저 2단계 원탭 자동 채색을 완료한 뒤 말풍선을 배치해 주세요.",
      });
      return { ok: false, reason: "prerequisite-step-2-required", snapshot: this.snapshot };
    }

    const trimmed = rawText.trim().slice(0, 60);
    if (!trimmed) {
      this.snapshot = buildSnapshot({
        ...this.snapshot,
        statusMessage: "말풍선에 넣을 대사를 1글자 이상 입력해 주세요.",
      });
      return { ok: false, reason: "empty-dialogue", snapshot: this.snapshot };
    }

    const bubble: ManualSpeechBubble = {
      text: trimmed,
      x: Math.round(clampUnit(position?.x ?? 218, 84, 248, 218)),
      y: Math.round(clampUnit(position?.y ?? 48, 34, 152, 48)),
    };
    const nextCompleted = new Set<ManualStepId>(this.snapshot.completedStepIds);
    nextCompleted.add("step-3-speech-bubble");

    this.snapshot = buildSnapshot({
      ...this.snapshot,
      speechBubble: bubble,
      completedStepIds: [...nextCompleted],
      statusMessage: "3단계 모두 완주! '3분 스튜디오 첫 완주' 배지가 발급되었습니다.",
    });
    return { ok: true, reason: "speech-bubble-placed", snapshot: this.snapshot };
  }

  reset(): ManualActionResult {
    this.snapshot = buildSnapshot({
      completedStepIds: [],
      strokes: [],
      autoColorApplied: false,
      selectedColorToneId: MANUAL_COLOR_TONES[0]!.id,
      speechBubble: null,
      statusMessage: "실습 캔버스를 초기화했습니다. 1획 긋기부터 다시 체험할 수 있습니다.",
    });
    return { ok: true, reason: "reset", snapshot: this.snapshot };
  }
}

function normalizeQuery(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/gu, " ");
}

function normalizeShortcut(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/gu, "");
}

export function searchManualRecipes(
  query: string,
  context: ManualRecipeContext = "all",
): readonly ManualRecipeMatch[] {
  const normalized = normalizeQuery(query);
  const compactQuery = normalizeShortcut(query);
  const scoped =
    context === "all"
      ? MANUAL_RECIPES
      : MANUAL_RECIPES.filter((recipe) => recipe.context === context);

  if (!normalized) {
    return scoped.map((recipe, index) => ({
      recipe,
      score: Math.max(10, 50 - index),
      matchedBy: "context" as const,
    }));
  }

  const tokens = normalized.split(" ").filter(Boolean);
  const matches: ManualRecipeMatch[] = [];

  for (const recipe of scoped) {
    const shortcutCompact = normalizeShortcut(recipe.shortcut);
    const titleLower = recipe.title.toLowerCase();
    const keywordsLower = recipe.keywords.map((kw) => kw.toLowerCase());
    const bodyLower = [recipe.contextLabel, ...recipe.steps, recipe.proTip, recipe.shortcut]
      .join(" ")
      .toLowerCase();

    if (shortcutCompact === compactQuery) {
      matches.push({ recipe, score: 120, matchedBy: "shortcut" });
      continue;
    }

    let score = 0;
    let matchedBy: ManualRecipeMatch["matchedBy"] = "keyword";

    if (shortcutCompact.includes(compactQuery) && compactQuery.length >= 2) {
      score += 95;
      matchedBy = "shortcut";
    }
    if (titleLower.startsWith(normalized)) {
      score += 90;
      matchedBy = "title";
    } else if (titleLower.includes(normalized)) {
      score += 75;
      matchedBy = "title";
    }

    const tokenMatched = tokens.every(
      (token) =>
        titleLower.includes(token) ||
        shortcutCompact.includes(token) ||
        keywordsLower.some((kw) => kw.includes(token)) ||
        bodyLower.includes(token),
    );

    if (tokenMatched) {
      for (const token of tokens) {
        if (keywordsLower.some((kw) => kw === token)) score += 32;
        else if (keywordsLower.some((kw) => kw.includes(token))) score += 20;
        else if (titleLower.includes(token)) score += 24;
        else if (bodyLower.includes(token)) score += 12;
      }
    }

    if (score > 0) {
      matches.push({ recipe, score, matchedBy });
    }
  }

  return matches.sort(
    (a, b) =>
      b.score - a.score ||
      a.recipe.durationSec - b.recipe.durationSec ||
      a.recipe.id.localeCompare(b.recipe.id),
  );
}
