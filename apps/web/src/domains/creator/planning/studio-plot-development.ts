/**
 * 전개 제안 루프 — 회차 기획에서 "지금 비트 다음에 뭘 쓰지?"를 선택지로 푼다.
 *
 * 문제 (투닝 플러스 Stories 흡수 보고서 축 B2): 창작 멘토 챗은 대화 상대일 뿐
 * 제안이 기획 필드로 반영되는 루프가 없었다. 시즌 비트 보드·플롯라인 타임라인은
 * 구조를 그리는 도구이지 전개를 제안하지 않는다.
 *
 * 이 모듈은 장르 비트 라이브러리(단계 × 장르 풍미)를 결정적으로 읽어,
 * 현재 turningPoints 뒤에 올 전개 후보를 만든다. 원칙:
 * - 제안은 선택지로만 존재한다. 어떤 함수도 기획을 자동 확정하지 않으며,
 *   적용(applyDevelopmentSuggestion)은 작가가 고른 제안 하나만 turningPoints에
 *   덧붙이는 불변 연산이다. 무시는 표면의 세션 상태일 뿐 데이터에 남지 않는다.
 * - 결정적이다: 같은 입력 → 같은 제안 (랜덤·시각 없음, 테스트 가능, 오프라인).
 * - 순환한다: 제안을 하나 넣으면 단계 추론이 앞으로 가고, 다음 제안은
 *   그다음 단계를 향해 다시 도출된다 (기획 → 제안 → 반영 → 재제안).
 * - 마지막 단계의 제안은 다음 회차 씨앗(nextEpisodeSeed)을 함께 품어,
 *   흐름 F-7(이전 회차 cliffhanger → 다음 회차 openingHook 인계)과 합류한다:
 *   다음 회차가 열리면 F-7이 cliffhanger를 인용하고, 이 씨앗은 그 재료가 된다.
 */

/** 전개 단계 — 회차 한 편의 비트가 밟는 순서. 추론은 개수 + 마지막 비트 신호어. */
export type PlotDevelopmentStageId =
  | "opening"
  | "inciting"
  | "escalation"
  | "midpoint"
  | "complication"
  | "crisis"
  | "climax"
  | "hook";

export interface PlotDevelopmentStage {
  readonly id: PlotDevelopmentStageId;
  readonly label: string;
  /** 이 단계에서 제안이 노리는 것 — 카드에 그대로 보이는 안내. */
  readonly intent: string;
}

export const PLOT_DEVELOPMENT_STAGES: readonly PlotDevelopmentStage[] = Object.freeze([
  { id: "opening", label: "도입", intent: "주인공의 일상과 결핍을 한 장면으로 세운다" },
  { id: "inciting", label: "사건 촉발", intent: "일상을 깨는 사건으로 이야기를 출발시킨다" },
  { id: "escalation", label: "갈등 심화", intent: "갈등의 대가를 키우고 선택을 좁힌다" },
  { id: "midpoint", label: "중간 발견", intent: "판이 뒤집히는 발견으로 후반의 방향을 바꾼다" },
  { id: "complication", label: "변수 등장", intent: "예상 밖의 변수로 계획을 무너뜨린다" },
  { id: "crisis", label: "위기 절정", intent: "잃을 것이 가장 큰 순간으로 몰아넣는다" },
  { id: "climax", label: "선택과 대결", intent: "주인공의 선택으로 갈등을 정면 돌파한다" },
  { id: "hook", label: "마무리 훅", intent: "다음 화를 열게 만드는 질문을 남긴다" },
]);

/** 마지막 비트의 신호어 — 개수 추론을 한 단계까지만 보정한다 (지어낸 정밀도 금지). */
const LATE_SIGNALS = ["반전", "배신", "정체", "밝혀", "드러나", "위기", "절체절명", "대결", "결전", "선택"] as const;

export interface PlotDevelopmentInput {
  /** taxonomy 장르명 (자유 문자열 허용 — 모르면 공통 라이브러리). */
  readonly genre?: string;
  readonly turningPoints: readonly string[];
  readonly coreConflict?: string;
  readonly logline?: string;
  readonly cliffhanger?: string;
}

export interface PlotDevelopmentSuggestion {
  readonly id: string;
  readonly stage: PlotDevelopmentStageId;
  readonly stageLabel: string;
  /** 카드 제목 — 짧은 전개 이름. */
  readonly title: string;
  /** 고르면 turningPoints에 그대로 들어가는 전개 문장. */
  readonly text: string;
  /** 왜 지금 이 전개인지 — 현재 갈등/직전 비트와의 연결 한 줄. */
  readonly rationale: string;
  /**
   * 다음 회차 씨앗 (hook 단계 제안에만). 적용하면 이번 화 cliffhanger의 재료가 되고,
   * 다음 회차에서는 F-7 인계가 openingHook 초안으로 인용한다.
   */
  readonly nextEpisodeSeed?: string;
}

interface StageTemplate {
  readonly title: string;
  readonly text: string;
  readonly seed?: string;
}

/**
 * 단계별 공통 전개 틀. {갈등}은 coreConflict, {직전}은 마지막 turningPoint를
 * 짧게 줄인 참조로 채워진다 — 재료가 없으면 자리 문구 없이 문장이 완성되도록
 * 갈등 참조형과 독립형을 함께 둔다.
 */
const STAGE_TEMPLATES: Readonly<Record<PlotDevelopmentStageId, readonly StageTemplate[]>> = {
  opening: [
    { title: "결핍이 보이는 일상", text: "주인공의 평범한 하루에서 비어 있는 한 가지가 드러나는 장면으로 연다" },
    { title: "소망의 실마리", text: "주인공이 진짜로 원하는 것이 작은 행동 하나로 엿보이는 장면으로 연다" },
    { title: "불편한 균형", text: "겉으로는 평화롭지만 모두가 참아 온 불편이 스치는 장면으로 연다" },
  ],
  inciting: [
    { title: "일상을 깨는 사건", text: "평범하던 하루를 끝내는 사건이 터지고, 주인공이 그 한가운데에 선다" },
    { title: "거절할 수 없는 제안", text: "주인공에게 거절하면 더 잃는 제안이 도착하고, 시계가 돌기 시작한다" },
    { title: "우연이 아닌 만남", text: "피하고 싶던 상대·물건·소식과 정면으로 마주치는 만남이 벌어진다" },
  ],
  escalation: [
    { title: "대가의 구체화", text: "{갈등}의 대가가 추상에서 구체로 — 잃을 사람의 이름이 정해진다" },
    { title: "시간 제한", text: "갈등에 마감 시한이 걸리며 우물쭈물할 여유가 사라진다" },
    { title: "편 가르기", text: "주변 인물들이 갈등을 두고 편이 갈리고, 주인공이 한쪽을 골라야 한다" },
  ],
  midpoint: [
    { title: "진짜 문제의 발견", text: "지금까지의 갈등이 껍데기였음이 드러나고, 진짜 문제가 모습을 보인다" },
    { title: "믿음의 균열", text: "굳게 믿어 온 사실 하나가 거짓으로 밝혀지며 판이 뒤집힌다" },
    { title: "숨은 연결", text: "따로 보이던 두 사건이 하나의 원인으로 이어져 있었음이 드러난다" },
  ],
  complication: [
    { title: "조력자의 조건", text: "도와줄 수 있는 인물이 예상 밖의 조건을 걸고, 계획이 처음으로 어긋난다" },
    { title: "적의 선행", text: "상대가 한발 먼저 움직여 주인공이 세운 계획이 무효가 된다" },
    { title: "제3의 변수", text: "어느 편도 아닌 제3의 존재가 끼어들어 갈등의 모양 자체가 바뀐다" },
  ],
  crisis: [
    { title: "가장 아픈 상실 위기", text: "주인공이 가장 지키고 싶던 것을 눈앞에서 잃을 위기에 놓인다" },
    { title: "선택지의 소멸", text: "도망칠 길과 미룰 길이 모두 막히고, 남은 선택은 하나뿐이 된다" },
    { title: "공개되는 비밀", text: "숨겨 온 비밀이 최악의 타이밍에 모두에게 알려질 위기에 놓인다" },
  ],
  climax: [
    { title: "정면 선택", text: "주인공이 대가를 알면서도 피하지 않는 선택을 하고, 갈등과 정면으로 맞선다" },
    { title: "희생을 건 한 수", text: "주인공이 자기 것을 내어주는 한 수로 판을 뒤집으려 한다" },
    { title: "약점의 역이용", text: "내내 약점이던 것이 결정적인 순간에 무기가 되어 돌아온다" },
  ],
  hook: [
    {
      title: "답보다 큰 질문",
      text: "이번 화의 답이 도착하는 순간, 그보다 큰 질문이 함께 도착한다",
      seed: "도착한 답이 만든 새 질문에서 다음 화가 시작된다",
    },
    {
      title: "낯익은 얼굴의 귀환",
      text: "끝났다고 믿은 인물이 전혀 다른 얼굴로 다시 등장한다",
      seed: "돌아온 인물이 건네는 첫마디에서 다음 화가 시작된다",
    },
    {
      title: "대가의 청구서",
      text: "승리의 대가가 아직 청구되지 않았음이 마지막 장면에서 드러난다",
      seed: "청구된 대가를 마주하는 장면에서 다음 화가 시작된다",
    },
  ],
};

/** 장르 풍미 — 단계 틀 위에 얹는 장르 전용 전개. seed 빌더의 장르 키트와 같은 15종. */
const GENRE_FLAVOR: Readonly<Record<string, Partial<Record<PlotDevelopmentStageId, readonly StageTemplate[]>>>> = {
  "로맨스": {
    midpoint: [{ title: "감정보다 먼저 드러난 비밀", text: "상대의 비밀이 두 사람의 감정보다 먼저 드러나, 다가갈 이유와 물러날 이유가 뒤바뀐다" }],
    crisis: [{ title: "고백 직전의 방해", text: "마음을 전하려는 순간, 관계를 흔드는 소식이 먼저 도착한다" }],
  },
  "로판": {
    midpoint: [{ title: "원작과 달라진 연쇄", text: "주인공이 바꾼 전개 하나가 원작에 없던 연쇄를 일으키기 시작한다" }],
    complication: [{ title: "악역의 다른 얼굴", text: "악역으로만 알던 인물의 숨은 사정이 드러나 계산이 복잡해진다" }],
  },
  "판타지": {
    escalation: [{ title: "힘의 대가", text: "힘을 쓸 때마다 치러야 할 대가가 구체적인 모습으로 다가온다" }],
    midpoint: [{ title: "예언의 재해석", text: "예언의 한 구절이 전혀 다른 뜻으로 읽히며 여정의 목적이 바뀐다" }],
  },
  "현판": {
    escalation: [{ title: "목격자의 등장", text: "숨겨 온 능력을 목격한 사람이 생기고, 침묵의 값을 요구한다" }],
    crisis: [{ title: "랭킹의 역전 위기", text: "쌓아 올린 평가가 한 번의 실수로 무너질 위기에 놓인다" }],
  },
  "무협": {
    complication: [{ title: "은원의 뒤집힘", text: "원수로 알던 상대가 사실은 은인이었음이 드러나 검을 거둘 곳이 사라진다" }],
    climax: [{ title: "약속을 건 대결", text: "무공 대결보다 먼저 지켜야 할 약속을 걸고 승부에 나선다" }],
  },
  "액션": {
    escalation: [{ title: "표적의 변경", text: "의뢰의 표적이 가장 지켜야 할 사람으로 바뀌며 계획이 뒤집힌다" }],
    crisis: [{ title: "무너진 퇴로", text: "준비해 둔 퇴로가 막히고, 시간 제한만 남은 채 거리에 선다" }],
  },
  "스릴러": {
    midpoint: [{ title: "뒤집히는 시간 순서", text: "증거 하나가 사건의 시간 순서를 뒤집고, 모든 진술이 다시 의심받는다" }],
    complication: [{ title: "조력자의 거짓말", text: "가장 믿었던 조력자의 거짓말이 드러나 혼자 진실을 쥐게 된다" }],
  },
  "미스터리": {
    midpoint: [{ title: "공통의 빈틈", text: "용의자 전원의 알리바이에 공통의 빈틈이 있음이 드러난다" }],
    crisis: [{ title: "탐정의 오독", text: "탐정 자신이 단서를 잘못 읽어 왔음이 드러나 수사가 원점으로 돌아간다" }],
  },
  "드라마": {
    midpoint: [{ title: "가족의 비밀", text: "오래 숨겨 온 가족의 비밀이 현재의 선택을 정면으로 바꾼다" }],
    hook: [{ title: "발견된 편지", text: "숨겨 왔던 편지 한 통이 발견되며 다음 화의 식탁이 예고된다", seed: "편지를 읽은 사람의 반응에서 다음 화가 시작된다" }],
  },
  "일상": {
    escalation: [{ title: "사소한 파장", text: "아무것도 아닌 줄 알았던 작은 실수가 동네의 하루를 조금씩 바꿔 놓는다" }],
    hook: [{ title: "내일의 인사", text: "내일도 오겠다는 인사를 남기는 손님이 다음 화의 중심을 예고한다", seed: "그 손님의 사연에서 다음 화가 시작된다" }],
  },
  "코미디": {
    complication: [{ title: "해결책이 키우는 사고", text: "조력자의 해결책이 일을 더 키워, 수습이 또 다른 사고를 부른다" }],
    crisis: [{ title: "공개 직전의 비밀", text: "비밀로 한 일이 전원에게 공개될 위기에서 해명은 더 큰 오해를 낳는다" }],
  },
  "학원": {
    escalation: [{ title: "존폐를 건 대회", text: "동아리의 존폐를 건 대회가 공지되고, 준비 기간이 갈등의 무대가 된다" }],
    midpoint: [{ title: "라이벌의 같은 비밀", text: "라이벌이 사실은 같은 비밀을 가졌음이 드러나 경쟁의 모양이 바뀐다" }],
  },
  "스포츠": {
    escalation: [{ title: "갑작스러운 기회", text: "에이스의 부상으로 갑작스러운 출전 기회가 오지만, 준비는 전혀 되어 있지 않다" }],
    crisis: [{ title: "팀의 내분", text: "경기를 앞두고 팀의 내분이 번져, 실력 이전에 마음이 무너진다" }],
  },
  "공포": {
    midpoint: [{ title: "먼저 온 사람의 경고", text: "먼저 이곳에 왔던 사람의 기록이 규칙 하나를 경고하고 사라진다" }],
    crisis: [{ title: "안전한 장소의 배신", text: "가장 안전하다고 믿은 장소가 사실은 규칙의 중심이었음이 드러난다" }],
  },
  "SF": {
    midpoint: [{ title: "신호의 발신지", text: "수신한 신호의 발신지가 자기 자신으로 확인되며 시간의 퍼즐이 시작된다" }],
    complication: [{ title: "조력 AI의 숨은 지령", text: "AI 조력자에게 숨겨진 지령이 있었음이 드러나 신뢰가 시험대에 오른다" }],
  },
};

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function shorten(text: string, max = 42): string {
  const flat = normalize(text);
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function fillTemplate(template: string, conflict: string): string {
  return template.replaceAll("{갈등}", conflict ? shorten(conflict, 36) : "이 갈등");
}

/**
 * 현재 단계 추론. turningPoints 개수가 기본 축이고, 마지막 비트에 후반 신호어가
 * 있으면 한 단계만 앞으로 당긴다. 빈 기획은 opening.
 */
export function inferPlotStage(turningPoints: readonly string[]): PlotDevelopmentStage {
  const count = turningPoints.map(normalize).filter(Boolean).length;
  let index = Math.min(count, PLOT_DEVELOPMENT_STAGES.length - 1);
  const last = count > 0 ? normalize(turningPoints[turningPoints.length - 1] ?? "") : "";
  if (last && index >= 2 && index < PLOT_DEVELOPMENT_STAGES.length - 1) {
    if (LATE_SIGNALS.some((signal) => last.includes(signal))) index += 1;
  }
  return PLOT_DEVELOPMENT_STAGES[index]!;
}

export interface SuggestDevelopmentsOptions {
  /** 표면에서 작가가 무시한 제안 id — 결과에서 제외하고 다음 후보로 채운다. */
  readonly dismissedIds?: readonly string[];
  /** 한 번에 보여줄 제안 수 (기본 3). */
  readonly limit?: number;
}

/**
 * 다음 전개 제안 도출. 현재 단계의 [장르 풍미 → 공통 틀] 순으로 후보를 쌓고,
 * 이미 turningPoints에 있는 문장·중복·무시한 제안은 빼고 limit개까지 돌려준다.
 * 후보가 소진되면 빈 배열 — 표면은 "모두 봤어요 + 다시 보기" 상태를 그린다.
 */
export function suggestNextDevelopments(
  input: PlotDevelopmentInput,
  options: SuggestDevelopmentsOptions = {},
): readonly PlotDevelopmentSuggestion[] {
  const stage = inferPlotStage(input.turningPoints);
  const conflict = normalize(input.coreConflict ?? "");
  const dismissed = new Set(options.dismissedIds ?? []);
  const existing = new Set(input.turningPoints.map(normalize));
  const genre = (input.genre ?? "").trim();
  const flavor = GENRE_FLAVOR[genre]?.[stage.id] ?? [];
  const pool: readonly StageTemplate[] = [...flavor, ...(STAGE_TEMPLATES[stage.id] ?? [])];

  const lastPoint = input.turningPoints.length > 0
    ? normalize(input.turningPoints[input.turningPoints.length - 1] ?? "")
    : "";
  const rationaleBase = conflict
    ? `핵심 갈등 “${shorten(conflict, 30)}”을(를) ${stage.label} 단계에서 밀어붙이는 전개예요.`
    : lastPoint
      ? `직전 사건 “${shorten(lastPoint, 30)}” 다음에 이어 붙이기 좋은 ${stage.label} 전개예요.`
      : `${stage.intent} — ${stage.label} 단계의 시작점으로 좋아요.`;

  const out: PlotDevelopmentSuggestion[] = [];
  const seenTexts = new Set<string>();
  for (const template of pool) {
    const text = fillTemplate(template.text, conflict);
    // id는 텍스트 해시 기반 — 무시 목록이 바뀌어도 같은 제안은 같은 id를 유지한다.
    let hash = 5381;
    for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
    const id = `dev-${stage.id}-${(hash >>> 0).toString(36)}`;
    if (existing.has(normalize(text)) || seenTexts.has(normalize(text))) continue;
    if (dismissed.has(id)) continue;
    seenTexts.add(normalize(text));
    out.push(Object.freeze({
      id,
      stage: stage.id,
      stageLabel: stage.label,
      title: template.title,
      text,
      rationale: rationaleBase,
      ...(template.seed ? { nextEpisodeSeed: template.seed } : {}),
    }));
    if (out.length >= (options.limit ?? 3)) break;
  }
  return Object.freeze(out);
}

/**
 * 제안 적용 — 작가가 고른 제안 하나만 turningPoints 끝에 덧붙인 새 배열을 돌려준다.
 * 이미 같은 문장이 있으면 applied=false와 함께 원본 참조를 그대로 돌려줘,
 * 표면이 "이미 들어 있어요"를 정직하게 표시할 수 있게 한다. 원본은 절대 바꾸지 않는다.
 */
export function applyDevelopmentSuggestion(
  turningPoints: readonly string[],
  suggestion: Pick<PlotDevelopmentSuggestion, "text">,
): { readonly turningPoints: readonly string[]; readonly applied: boolean } {
  const text = normalize(suggestion.text);
  if (!text || turningPoints.some((point) => normalize(point) === text)) {
    return { turningPoints, applied: false };
  }
  return { turningPoints: Object.freeze([...turningPoints, text]), applied: true };
}

/**
 * F-7 합류 지점: 적용된 hook 단계 제안(또는 기존 cliffhanger)에서 다음 회차
 * openingHook 씨앗 문장을 만든다. 씨앗이 없으면 빈 문자열 — 지어내지 않는다.
 * 다음 회차 기획이 열리면 F-7의 deriveNextEpisodeHandoff가 cliffhanger를 인용하므로,
 * 이 씨앗은 cliffhanger를 쓸 때 곁들이는 재료로만 쓴다.
 */
export function nextEpisodeSeedFromSuggestion(
  suggestion: Pick<PlotDevelopmentSuggestion, "nextEpisodeSeed"> | null | undefined,
  cliffhanger?: string,
): string {
  if (suggestion?.nextEpisodeSeed?.trim()) return normalize(suggestion.nextEpisodeSeed);
  const hook = normalize(cliffhanger ?? "");
  return hook ? `${hook} — 그 여파가 여는 첫 장면에서 다음 화가 시작된다` : "";
}

// ── 웹툰 스토리라인 & 대사·지문·스케치 통합 추천 엔진 ──────────────────────────

export type RecommendedSketchPresetId =
  | "center-focus"
  | "diagonal-action"
  | "low-horizon-hero"
  | "high-angle-isolation"
  | "two-shot-dialogue"
  | "split-reaction";

export interface StorylineRecommendedDialogueLine {
  readonly speaker: string;
  readonly text: string;
  readonly kind: "speech" | "narration";
  readonly emotion: "determination" | "shock" | "joy" | "rage" | "sorrow" | "calm";
  readonly bubbleTip: string;
}

export interface StorylineDialoguePackage {
  readonly id: string;
  readonly stage: PlotDevelopmentStageId;
  readonly stageLabel: string;
  readonly title: string;
  /** 핵심 사건(turningPoints)에 들어갈 스토리라인 전개 문장. */
  readonly storylineBeat: string;
  /** 스토리보드 디렉터에 바로 넣을 수 있는 시각 연출 지문. */
  readonly stageDirection: string;
  /** 이 비트의 의도를 가장 잘 살리는 간단 스케치 구도 프리셋. */
  readonly recommendedSketchPresetId: RecommendedSketchPresetId;
  /** 비트에 어울리는 추천 대사·나레이션 세트. */
  readonly dialogues: readonly StorylineRecommendedDialogueLine[];
  /** 예비·전문 웹툰 작가를 위한 연출·스크롤 호흡 가이드. */
  readonly creatorCoachingTip: string;
  readonly nextEpisodeSeed?: string;
}

export interface RecommendStorylineDialogueOptions extends SuggestDevelopmentsOptions {
  readonly protagonistName?: string;
  readonly partnerName?: string;
}

const STAGE_SKETCH_PRESET: Readonly<Record<PlotDevelopmentStageId, RecommendedSketchPresetId>> = {
  opening: "center-focus",
  inciting: "split-reaction",
  escalation: "two-shot-dialogue",
  midpoint: "high-angle-isolation",
  complication: "two-shot-dialogue",
  crisis: "high-angle-isolation",
  climax: "diagonal-action",
  hook: "low-horizon-hero",
};

const STAGE_DIRECTION_BY_STAGE: Readonly<Record<PlotDevelopmentStageId, string>> = {
  opening: "[미디엄샷] 조용한 공간에서 주인공의 시선이 멈추며 일상의 빈자리가 드러난다.",
  inciting: "[익스트림 클로즈업] 예상치 못한 소식에 주인공의 동공이 흔들리고 숨결이 멎는다.",
  escalation: "[미디엄샷] 마주 선 두 인물 사이로 팽팽한 침묵이 흐르고 선택의 시간이 다가온다.",
  midpoint: "[버즈아이] 숨겨져 있던 진실의 단서가 바닥에 드러나며 주인공이 홀로 서 있다.",
  complication: "[미디엄샷] 조력자가 뜻밖의 조건을 건네며 주인공의 표정이 굳어진다.",
  crisis: "[하이앵글] 물러설 곳 없는 막다른 공간에서 주인공이 주먹을 움켜쥔다.",
  climax: "[풀샷] 주인공이 분노와 결의를 담아 정면으로 검을 뽑아들고 돌진한다.",
  hook: "[웜즈아이] 어둠 너머에서 정체를 알 수 없는 인물이 모습을 드러내며 바라본다.",
};

function buildDialoguesForStage(params: {
  readonly stage: PlotDevelopmentStageId;
  readonly genre: string;
  readonly conflict: string;
  readonly protagonist: string;
  readonly partner: string;
  readonly beatText: string;
}): readonly StorylineRecommendedDialogueLine[] {
  const { stage, conflict, protagonist, partner, beatText } = params;
  const focusTopic = conflict ? shorten(conflict, 22) : shorten(beatText, 22);

  switch (stage) {
    case "opening":
      return Object.freeze([
        {
          speaker: "",
          text: `그날까지는 모든 것이 평소와 다름없을 줄 알았다.`,
          kind: "narration",
          emotion: "calm",
          bubbleTip: "도입부 사각 나레이션 박스를 컷 상단에 배치해 차분하게 호흡을 여세요.",
        },
        {
          speaker: protagonist,
          text: `왜 자꾸 그 일이 마음에 걸리는 거지…?`,
          kind: "speech",
          emotion: "calm",
          bubbleTip: "점선 말풍선(독백)으로 주인공의 내면 결핍을 자연스럽게 보여주세요.",
        },
      ]);
    case "inciting":
      return Object.freeze([
        {
          speaker: partner,
          text: `지금 당장 확인해 봐. ${focusTopic}, 우연이 아니었어!`,
          kind: "speech",
          emotion: "shock",
          bubbleTip: "강조 말풍선으로 사건 발생의 긴박감을 전달하세요.",
        },
        {
          speaker: protagonist,
          text: `말도 안 돼… 지금 그게 무슨 소리야?!`,
          kind: "speech",
          emotion: "shock",
          bubbleTip: "인물 클로즈업 위쪽에 짧은 반응 대사를 두어 스크롤 속도를 높이세요.",
        },
      ]);
    case "escalation":
    case "complication":
      return Object.freeze([
        {
          speaker: partner,
          text: `여기서 멈추면 전부 끝이야. 어느 쪽을 택할지 지금 결정해.`,
          kind: "speech",
          emotion: "determination",
          bubbleTip: "2인 대화 역샷의 좌상단→우하단 시선 흐름에 맞춰 말풍선을 배치하세요.",
        },
        {
          speaker: protagonist,
          text: `시간이 없군… 조건은 받아들이겠어.`,
          kind: "speech",
          emotion: "determination",
          bubbleTip: "짧고 단호한 문장으로 갈등의 대가를 수용하는 긴장감을 살리세요.",
        },
      ]);
    case "midpoint":
    case "crisis":
      return Object.freeze([
        {
          speaker: "",
          text: `믿어 왔던 마지막 단서마저 한순간에 뒤집혔다.`,
          kind: "narration",
          emotion: "sorrow",
          bubbleTip: "컷 위아래 여백을 넓히고 독백 나레이션을 독립 배치해 절망감을 강조하세요.",
        },
        {
          speaker: protagonist,
          text: `처음부터 전부 계산된 함정이었단 말이야…?`,
          kind: "speech",
          emotion: "shock",
          bubbleTip: "떨리는 테두리 말풍선으로 인물의 심리적 동요를 표현하세요.",
        },
      ]);
    case "climax":
      return Object.freeze([
        {
          speaker: protagonist,
          text: `더 이상 도망치지 않아. 내 손으로 직접 끝내겠어!`,
          kind: "speech",
          emotion: "rage",
          bubbleTip: "뾰족한 외침 말풍선과 굵은 폰트로 클라이맥스 타격감을 극대화하세요.",
        },
        {
          speaker: "",
          text: `망설임이 사라진 자리에 오직 단 하나의 선택만 남았다.`,
          kind: "narration",
          emotion: "determination",
          bubbleTip: "액션 컷 직후 짧은 나레이션으로 결전의 무게를 잡아주세요.",
        },
      ]);
    case "hook":
      return Object.freeze([
        {
          speaker: partner,
          text: `오랜만이네, ${protagonist}. 아직 끝난 줄 알았어?`,
          kind: "speech",
          emotion: "determination",
          bubbleTip: "회차 마지막 컷 하단에 대사를 배치해 다음 화 클릭(클리프행어)을 유도하세요.",
        },
        {
          speaker: "",
          text: `닫힌 줄 알았던 문 너머에서 진짜 이야기가 시작되고 있었다.`,
          kind: "narration",
          emotion: "shock",
          bubbleTip: "마지막 여운을 남기는 엔딩 나레이션으로 스크롤을 마무리하세요.",
        },
      ]);
  }
}

/**
 * 현재 기획 상태에서 다음 스토리라인 전개 후보와 그에 맞춘 지문·대사·스케치 구도 패키지를 추천한다.
 * 결정적(deterministic) 순수 함수이므로 오프라인에서도 즉시 동작한다.
 */
export function recommendStorylineAndDialogues(
  input: PlotDevelopmentInput,
  options: RecommendStorylineDialogueOptions = {},
): readonly StorylineDialoguePackage[] {
  const baseSuggestions = suggestNextDevelopments(input, options);
  const protagonist = options.protagonistName?.trim() || "주인공";
  const partner = options.partnerName?.trim() || "상대역";
  const genre = (input.genre ?? "").trim();
  const conflict = normalize(input.coreConflict ?? "");

  return Object.freeze(
    baseSuggestions.map((suggestion): StorylineDialoguePackage => {
      const stageDirection = `${STAGE_DIRECTION_BY_STAGE[suggestion.stage]} (${suggestion.title})`;
      const dialogues = buildDialoguesForStage({
        stage: suggestion.stage,
        genre,
        conflict,
        protagonist,
        partner,
        beatText: suggestion.text,
      });
      return Object.freeze({
        id: `pkg-${suggestion.id}`,
        stage: suggestion.stage,
        stageLabel: suggestion.stageLabel,
        title: suggestion.title,
        storylineBeat: suggestion.text,
        stageDirection,
        recommendedSketchPresetId: STAGE_SKETCH_PRESET[suggestion.stage],
        dialogues,
        creatorCoachingTip: `${suggestion.stageLabel} 단계 연출 팁: ${suggestion.rationale} 추천 스케치 구도(${STAGE_SKETCH_PRESET[suggestion.stage]})와 함께 쓰면 시선 유도가 한결 명확해집니다.`,
        ...(suggestion.nextEpisodeSeed ? { nextEpisodeSeed: suggestion.nextEpisodeSeed } : {}),
      });
    }),
  );
}

/**
 * 추천된 스토리라인·대사 패키지를 `StudioAiStoryboardDirector.direct()`가 즉시 분석할 수 있는
 * 지문+대사 콘티 대본 문자열로 변환한다.
 */
export function compileStorylinePackageToScript(pkg: StorylineDialoguePackage): string {
  const lines: string[] = [pkg.stageDirection];
  for (const item of pkg.dialogues) {
    if (item.kind === "narration") {
      lines.push(`${pkg.stageLabel} 장면 연출 계속. (나레이션: ${item.text})`);
    } else {
      lines.push(`${item.speaker || "주인공"}: "${item.text}"`);
    }
  }
  return lines.join("\n");
}

// ── 기·승·전·결 4막 회차 스토리라인 아크 & 텐션 곡선 생성기 ────────────────────

export type EpisodeStorylineActId =
  | "gi-opening"
  | "seung-development"
  | "jeon-twist"
  | "gyeol-cliffhanger";

export interface EpisodeStorylineArcAct {
  readonly actId: EpisodeStorylineActId;
  readonly actLabel: string;
  readonly stage: PlotDevelopmentStageId;
  readonly tensionScore: number;
  readonly recommendedCutCount: number;
  readonly package: StorylineDialoguePackage;
}

export interface EpisodeStorylineArc {
  readonly genre: string;
  readonly coreConflict: string;
  readonly acts: readonly EpisodeStorylineArcAct[];
  readonly totalRecommendedCuts: number;
  readonly averageTension: number;
  readonly pacingSummary: string;
  readonly nextEpisodeHook: string;
}

const EPISODE_ACT_SPECS: readonly {
  readonly actId: EpisodeStorylineActId;
  readonly actLabel: string;
  readonly stage: PlotDevelopmentStageId;
  readonly seedPoints: readonly string[];
  readonly baseTension: number;
  readonly recommendedCutCount: number;
}[] = [
  {
    actId: "gi-opening",
    actLabel: "기 (도입·결핍 제시)",
    stage: "opening",
    seedPoints: [],
    baseTension: 38,
    recommendedCutCount: 3,
  },
  {
    actId: "seung-development",
    actLabel: "승 (전개·갈등 고조)",
    stage: "escalation",
    seedPoints: ["도입 사건", "사건 촉발"],
    baseTension: 66,
    recommendedCutCount: 4,
  },
  {
    actId: "jeon-twist",
    actLabel: "전 (절정·클라이맥스)",
    stage: "climax",
    seedPoints: ["도입", "촉발", "심화", "발견", "변수", "위기"],
    baseTension: 94,
    recommendedCutCount: 4,
  },
  {
    actId: "gyeol-cliffhanger",
    actLabel: "결 (여운·클리프행어 훅)",
    stage: "hook",
    seedPoints: ["도입", "촉발", "심화", "발견", "변수", "위기", "결전"],
    baseTension: 88,
    recommendedCutCount: 3,
  },
];

/**
 * 한 회차 전체의 기·승·전·결 4막 스토리라인 아크와 대사·지문·스케치 구도·텐션 곡선을
 * 한 번에 설계한다. 예비 작가도 클릭 한 번으로 웹툰 1화 분량의 기승전결 콘티 대본을 얻을 수 있다.
 */
export function generateEpisodeStorylineArc(
  input: PlotDevelopmentInput,
  options: RecommendStorylineDialogueOptions = {},
): EpisodeStorylineArc {
  const genre = (input.genre ?? "").trim() || "판타지";
  const conflict = normalize(input.coreConflict ?? "") || "숨겨진 진실과 선택의 대가";
  const genreTensionBonus = /액션|스릴러|무협|공포/u.test(genre) ? 4 : 0;

  const acts: EpisodeStorylineArcAct[] = EPISODE_ACT_SPECS.map((spec) => {
    const packages = recommendStorylineAndDialogues(
      {
        genre,
        coreConflict: conflict,
        turningPoints: spec.seedPoints,
        logline: input.logline,
        cliffhanger: input.cliffhanger,
      },
      { ...options, limit: 1 },
    );
    const pkg = packages[0]!;
    const tensionScore = Math.min(99, spec.baseTension + genreTensionBonus);
    return Object.freeze({
      actId: spec.actId,
      actLabel: spec.actLabel,
      stage: spec.stage,
      tensionScore,
      recommendedCutCount: spec.recommendedCutCount,
      package: pkg,
    });
  });

  const totalRecommendedCuts = acts.reduce((acc, a) => acc + a.recommendedCutCount, 0);
  const averageTension = Math.round(
    acts.reduce((acc, a) => acc + a.tensionScore, 0) / Math.max(1, acts.length),
  );
  const lastAct = acts[acts.length - 1]!;
  const nextEpisodeHook =
    nextEpisodeSeedFromSuggestion(lastAct.package, input.cliffhanger) ||
    "마지막 컷의 질문에서 다음 화 첫 장면이 곧바로 이어진다";

  const pacingSummary =
    `${genre} 장르 4막 구조 · 총 권장 ${totalRecommendedCuts}컷 · 평균 텐션 ${averageTension}점 ` +
    `(기 ${acts[0]!.tensionScore} → 승 ${acts[1]!.tensionScore} → 전 ${acts[2]!.tensionScore} → 결 ${acts[3]!.tensionScore})`;

  return Object.freeze({
    genre,
    coreConflict: conflict,
    acts: Object.freeze(acts),
    totalRecommendedCuts,
    averageTension,
    pacingSummary,
    nextEpisodeHook,
  });
}

/**
 * 4막 회차 스토리라인 아크 전체를 스토리보드 디렉터 대본 문자열로 직렬화한다.
 */
export function compileEpisodeArcToScript(arc: EpisodeStorylineArc): string {
  return arc.acts.map((act) => compileStorylinePackageToScript(act.package)).join("\n");
}

export interface StorylineCliffhangerDiagnostic {
  readonly hookPowerScore: number;
  readonly scrollRetentionScore: number;
  readonly tensionContrastDelta: number;
  readonly globalSerialReadiness: "excellent" | "solid" | "needs-hook-boost";
  readonly plotDoctorNotes: readonly string[];
}

/**
 * 4막(`기·승·전·결`) 스토리라인 아크의 텐션 상승 폭, 클라이맥스·클리프행어 강도,
 * 독자 스크롤 이탈 방지 지표를 정밀 평가해 프로·지망생 작가를 위한 플롯 처방(`plotDoctorNotes`)을 반환한다.
 */
export function evaluateStorylineCliffhangerAndPacing(
  arc: EpisodeStorylineArc,
): StorylineCliffhangerDiagnostic {
  const scores = arc.acts.map((a) => a.tensionScore);
  const minTension = scores.length > 0 ? Math.min(...scores) : 70;
  const maxTension = scores.length > 0 ? Math.max(...scores) : 90;
  const tensionContrastDelta = Math.max(0, maxTension - minTension);

  const lastAct = arc.acts[arc.acts.length - 1];
  const hookBonus = /진실|정체|반전|검|눈빛|비밀|각성|충격|선언|시작/u.test(arc.nextEpisodeHook)
    ? 8
    : 3;
  const hookPowerScore = Math.min(
    100,
    Math.round((lastAct?.tensionScore ?? 85) * 0.85 + hookBonus + Math.min(10, tensionContrastDelta * 0.4)),
  );
  const scrollRetentionScore = Math.min(
    100,
    Math.round(arc.averageTension * 0.75 + Math.min(25, tensionContrastDelta * 1.1)),
  );

  const plotDoctorNotes: string[] = [];
  if (tensionContrastDelta < 15) {
    plotDoctorNotes.push(
      "기(도입)와 전(절정) 사이의 텐션 낙차가 작습니다. 2막(승)에서 일상적 호흡을 한 템포 낮추면 3막 절정의 폭발력이 2배 이상 살아납니다.",
    );
  } else {
    plotDoctorNotes.push(
      `기→전 텐션 상승 폭(${tensionContrastDelta}점)이 이상적인 K-웹툰 롤러코스터 곡선을 그리고 있습니다.`,
    );
  }
  plotDoctorNotes.push(
    `엔딩 클리프행어("${arc.nextEpisodeHook}") 직전에 180px 이상의 세로 여백(블랙/화이트 스크롤 공백)을 배치하면 다음 화 결제·열람 전환율이 높아집니다.`,
  );

  const globalSerialReadiness =
    hookPowerScore >= 88
      ? "excellent"
      : hookPowerScore >= 75
        ? "solid"
        : "needs-hook-boost";

  return Object.freeze({
    hookPowerScore,
    scrollRetentionScore,
    tensionContrastDelta,
    globalSerialReadiness,
    plotDoctorNotes: Object.freeze(plotDoctorNotes),
  });
}



