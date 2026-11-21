/**
 * Tooning AI & Plotr AI 클린룸 통합 스토리·컷툰·콘티·다각도 앵커 엔진 (₩0 무과금)
 *
 * - Tooning AI: 단계별 캐릭터 카테고리/순서/리소스 클린룸 레지스트리,
 *   한 문장 → 4컷/8컷 드래그앤드롭 웹툰, 20종 한국 웹툰 표정·포즈 카드,
 *   캐릭터 페르소나 대화 로그 → 말풍선 컷 가져오기
 * - Plotr AI: 웹소설 1화 원문 파서 → 자동 컷 분할·감정 텐션 곡선·카메라 시퀀스·3D 블로킹·영상 트랜지션,
 *   6앵글 다각도 캐릭터 일관성 앵커 잠금 및 드리프트 검증,
 *   자동 컷선·여백(Gutter)·말풍선 읽기 동선(Z-flow/세로 스크롤)·선화 정리 보조기
 */

import { parseOklchString, type OklchColor } from "./figma-ai-layout-engine";

export type CharacterAuthorType = "official-preset" | "creator-custom" | "school-class" | "enterprise-team";
export type TooningStepKey = "face" | "expression" | "hair" | "outfit" | "pose" | "prop";
export type IdentityCameraAngle = "front" | "three-quarter" | "profile" | "back" | "low-angle" | "high-angle";
export type PlotrBeatKind = "establish" | "dialogue" | "action" | "reaction" | "climax" | "cliffhanger";

export interface TooningCharacterCategory {
  readonly id: string;
  readonly nameKo: string;
  readonly order: number;
  readonly authorType: CharacterAuthorType;
  readonly enabledSteps: Record<TooningStepKey, boolean>;
}

export interface TooningCharacterRecord {
  readonly id: string;
  readonly categoryId: string;
  readonly nameKo: string;
  readonly order: number;
  readonly authorType: CharacterAuthorType;
  readonly tags: readonly string[];
  readonly stepData: Record<TooningStepKey, string>;
  readonly colorSetOklch: { readonly skin: string; readonly hair: string; readonly primary: string; readonly accent: string };
}

export interface TooningRegistryState {
  readonly categories: readonly TooningCharacterCategory[];
  readonly characters: readonly TooningCharacterRecord[];
}

export interface KWebtoonExpressionPoseCard {
  readonly id: string;
  readonly labelKo: string;
  readonly emotionGroup: "기쁨·설렘" | "놀람·긴장" | "분노·결의" | "슬픔·지침" | "연출·반전";
  readonly poseCode: string;
  readonly facialCueKo: string;
  readonly bodyCueKo: string;
  readonly recommendedCamera: IdentityCameraAngle;
}

export interface TooningMagicPanel {
  readonly panelId: string;
  readonly order: number;
  readonly beatLabelKo: string;
  readonly characterId: string;
  readonly characterNameKo: string;
  readonly expressionPoseCardId: string;
  readonly backgroundHintKo: string;
  readonly dialogueKo: string;
  readonly narrationKo: string;
}

export interface PersonaChatCut {
  readonly cutIndex: number;
  readonly speakerKo: string;
  readonly bubbleTextKo: string;
  readonly splitPart: string | null;
  readonly expressionPoseCardId: string;
  readonly alignment: "left" | "right";
}

export interface PlotrStoryboardCut {
  readonly cutNumber: number;
  readonly beatKind: PlotrBeatKind;
  readonly visualBeatKo: string;
  readonly dialogueKo: string;
  readonly sfxKo: string | null;
  readonly tensionScore: number;
  readonly cameraAngle: IdentityCameraAngle;
  readonly shotSize: "EWS" | "WS" | "MS" | "MCU" | "CU" | "ECU";
  readonly lensMm: number;
  readonly blocking3d: {
    readonly cameraPos: readonly [number, number, number];
    readonly targetPos: readonly [number, number, number];
    readonly subjectPos: readonly [number, number, number];
    readonly groundY: 0;
  };
  readonly videoTransition: {
    readonly kind: "cut" | "whip-pan" | "zoom-push" | "dissolve" | "flash-cut";
    readonly durationMs: number;
    readonly motionCueKo: string;
  };
}

export interface PlotrStoryboardPlan {
  readonly episodeTitleKo: string;
  readonly scriptInsight: {
    readonly paragraphCount: number;
    readonly cutCount: number;
    readonly dialogueRatioPct: number;
    readonly peakCutNumber: number;
    readonly summaryKo: string;
  };
  readonly cuts: readonly PlotrStoryboardCut[];
  readonly tensionCurve: readonly { readonly cutNumber: number; readonly tensionScore: number; readonly emotionLabelKo: string }[];
}

export interface CharacterIdentityAnchor {
  readonly characterId: string;
  readonly nameKo: string;
  readonly faceRatio: { readonly eyeSpacingRatio: number; readonly jawRatio: number; readonly headToBodyRatio: number };
  readonly hairSilhouetteToken: string;
  readonly outfitTokens: readonly string[];
  readonly paletteOklch: { readonly hair: string; readonly eyes: string; readonly outfitPrimary: string; readonly accent: string };
}

export interface AngleObservationInput {
  readonly angle: IdentityCameraAngle;
  readonly observedFaceRatio: CharacterIdentityAnchor["faceRatio"];
  readonly observedHairSilhouetteToken: string;
  readonly observedOutfitTokens: readonly string[];
  readonly observedPaletteOklch: CharacterIdentityAnchor["paletteOklch"];
}

export interface SixAngleConsistencyReport {
  readonly characterId: string;
  readonly nameKo: string;
  readonly overallConsistencyScore: number;
  readonly allAnglesPassed: boolean;
  readonly angleResults: readonly {
    readonly angle: IdentityCameraAngle;
    readonly labelKo: string;
    readonly passed: boolean;
    readonly driftScore: number;
    readonly consistencyScore: number;
    readonly paletteDelta: number;
    readonly fixHintsKo: readonly string[];
  }[];
}

export interface PlotrLayoutAndLineCleanupPlan {
  readonly readingMode: "vertical-scroll" | "page-z-flow";
  readonly canvasWidthPx: number;
  readonly totalHeightPx: number;
  readonly panelBoxes: readonly {
    readonly cutNumber: number;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly borderPx: number;
    readonly gutterAfterPx: number;
    readonly bubbleReadingOrder: number;
    readonly bubblePoint: { readonly x: number; readonly y: number };
  }[];
  readonly lineCleanup: {
    readonly closeGapPx: number;
    readonly removeSpeckleMaxPx2: number;
    readonly strokeTaperSmoothPct: number;
    readonly nonDestructiveBackup: true;
    readonly summaryKo: string;
  };
}

export const IDENTITY_LOCK_ANGLES: readonly { readonly angle: IdentityCameraAngle; readonly labelKo: string; readonly lensMm: number }[] = Object.freeze([
  { angle: "front", labelKo: "정면", lensMm: 50 },
  { angle: "three-quarter", labelKo: "반측면", lensMm: 50 },
  { angle: "profile", labelKo: "측면", lensMm: 85 },
  { angle: "back", labelKo: "후면", lensMm: 35 },
  { angle: "low-angle", labelKo: "로우 앵글", lensMm: 28 },
  { angle: "high-angle", labelKo: "하이 앵글", lensMm: 35 },
]);

export const KWEBTOON_EXPRESSION_POSE_CARDS: readonly KWebtoonExpressionPoseCard[] = Object.freeze([
  { id: "card-01-flutter", labelKo: "설렘 미소", emotionGroup: "기쁨·설렘", poseCode: "hand-cheek-tilt", facialCueKo: "살짝 휘어진 눈꼬리와 부드러운 미소", bodyCueKo: "고개를 10도 기울이고 어깨 힘을 뺌", recommendedCamera: "three-quarter" },
  { id: "card-02-sweat", labelKo: "당황 식은땀", emotionGroup: "놀람·긴장", poseCode: "hands-up-stepback", facialCueKo: "커진 눈과 관자놀이 땀방울", bodyCueKo: "양손을 가슴 앞으로 들고 반 발짝 물러남", recommendedCamera: "front" },
  { id: "card-03-glare", labelKo: "분노 노려봄", emotionGroup: "분노·결의", poseCode: "lean-forward-glare", facialCueKo: "내려앉은 눈썹과 날카로운 시선", bodyCueKo: "상체를 앞으로 기울여 압박감 형성", recommendedCamera: "low-angle" },
  { id: "card-04-shock", labelKo: "충격 동공지진", emotionGroup: "놀람·긴장", poseCode: "frozen-wide-eyes", facialCueKo: "작아진 동공과 미세하게 벌어진 입", bodyCueKo: "어깨가 굳고 배경 집중선 배치", recommendedCamera: "front" },
  { id: "card-05-hold-tears", labelKo: "눈물 참기", emotionGroup: "슬픔·지침", poseCode: "clench-collar", facialCueKo: "고인 눈물과 꾹 다문 입술", bodyCueKo: "고개를 살짝 숙이고 옷깃을 쥠", recommendedCamera: "three-quarter" },
  { id: "card-06-wink", labelKo: "능글 윙크", emotionGroup: "기쁨·설렘", poseCode: "finger-point-wink", facialCueKo: "한쪽 눈을 감고 올라간 입꼬리", bodyCueKo: "한 손으로 상대를 가리키며 여유 표현", recommendedCamera: "three-quarter" },
  { id: "card-07-resolve", labelKo: "결연한 주먹", emotionGroup: "분노·결의", poseCode: "fist-chest-ready", facialCueKo: "흔들림 없는 정면 응시", bodyCueKo: "오른손 주먹을 쥐고 중심을 낮춤", recommendedCamera: "low-angle" },
  { id: "card-08-drained", labelKo: "지침 방전", emotionGroup: "슬픔·지침", poseCode: "slump-desk-drop", facialCueKo: "초점 없는 눈과 내려간 눈꺼풀", bodyCueKo: "어깨가 축 처지며 테이블에 기댐", recommendedCamera: "high-angle" },
  { id: "card-09-blush", labelKo: "수줍은 볼붉힘", emotionGroup: "기쁨·설렘", poseCode: "look-away-collar", facialCueKo: "시선을 피하며 붉어진 볼", bodyCueKo: "두 손으로 머리카락 끝을 만지작거림", recommendedCamera: "three-quarter" },
  { id: "card-10-guard", labelKo: "경계 뒤돌아봄", emotionGroup: "놀람·긴장", poseCode: "over-shoulder-turn", facialCueKo: "어깨 너머로 좁혀진 눈빛", bodyCueKo: "등진 자세에서 고개만 빠르게 회전", recommendedCamera: "back" },
  { id: "card-11-cheer", labelKo: "환호 만세", emotionGroup: "기쁨·설렘", poseCode: "arms-up-jump", facialCueKo: "크게 웃는 입과 반짝이는 하이라이트", bodyCueKo: "양팔을 위로 번쩍 들며 가볍게 도약", recommendedCamera: "low-angle" },
  { id: "card-12-suspect", labelKo: "의심 실눈", emotionGroup: "연출·반전", poseCode: "arms-crossed-squint", facialCueKo: "가늘게 뜬 눈과 비대칭 눈썹", bodyCueKo: "팔짱을 끼고 반측면으로 관찰", recommendedCamera: "profile" },
  { id: "card-13-comfort", labelKo: "위로 어깨토닥", emotionGroup: "기쁨·설렘", poseCode: "gentle-shoulder-pat", facialCueKo: "온화한 눈매와 차분한 미소", bodyCueKo: "상대 어깨에 손을 올리며 시선 맞춤", recommendedCamera: "three-quarter" },
  { id: "card-14-sprint", labelKo: "전속력 질주", emotionGroup: "분노·결의", poseCode: "forward-dash-lean", facialCueKo: "바람을 가르는 집중 표정", bodyCueKo: "깊은 전경 기울기와 역동적 팔 스윙", recommendedCamera: "low-angle" },
  { id: "card-15-think", labelKo: "깊은 생각 턱굄", emotionGroup: "연출·반전", poseCode: "chin-rest-side", facialCueKo: "옆을 바라보는 차분한 눈빛", bodyCueKo: "한 손으로 턱을 괴고 추리 구도", recommendedCamera: "profile" },
  { id: "card-16-roar", labelKo: "절규 포효", emotionGroup: "분노·결의", poseCode: "wide-shout-burst", facialCueKo: "크게 벌린 입과 힘준 목선", bodyCueKo: "상체를 젖히며 강한 대사 폭발", recommendedCamera: "low-angle" },
  { id: "card-17-sigh", labelKo: "체념 한숨", emotionGroup: "슬픔·지침", poseCode: "hand-forehead-sigh", facialCueKo: "감은 눈과 이마 주름", bodyCueKo: "한 손으로 이마를 짚고 숨을 내쉼", recommendedCamera: "high-angle" },
  { id: "card-18-sparkle", labelKo: "기대 반짝눈", emotionGroup: "기쁨·설렘", poseCode: "hands-clasped-bright", facialCueKo: "별빛 하이라이트가 맺힌 눈동자", bodyCueKo: "두 손을 모아 가슴 앞에 대고 기대", recommendedCamera: "front" },
  { id: "card-19-smirk", labelKo: "냉소 비웃음", emotionGroup: "연출·반전", poseCode: "chin-up-smirk", facialCueKo: "한쪽 입꼬리만 올린 차가운 미소", bodyCueKo: "턱을 살짝 들어 상대를 내려다봄", recommendedCamera: "low-angle" },
  { id: "card-20-shadow-twist", labelKo: "반전 그림자 눈빛", emotionGroup: "연출·반전", poseCode: "half-shadow-reveal", facialCueKo: "이마 그림자 아래 빛나는 한쪽 눈", bodyCueKo: "정적인 정면 클로즈업으로 서늘한 반전", recommendedCamera: "front" },
]);

const ALL_STEPS_ON: Record<TooningStepKey, boolean> = { face: true, expression: true, hair: true, outfit: true, pose: true, prop: true };

export function createInitialTooningRegistry(): TooningRegistryState {
  return {
    categories: [
      { id: "cat-school-lead", nameKo: "학원·일상 주연", order: 0, authorType: "official-preset", enabledSteps: { ...ALL_STEPS_ON } },
      { id: "cat-office-drama", nameKo: "직장·로맨스 인물", order: 1, authorType: "creator-custom", enabledSteps: { ...ALL_STEPS_ON, prop: false } },
      { id: "cat-action-hero", nameKo: "액션·판타지 주인공", order: 2, authorType: "enterprise-team", enabledSteps: { ...ALL_STEPS_ON } },
    ],
    characters: [
      {
        id: "char-seoyeon",
        categoryId: "cat-school-lead",
        nameKo: "한서연",
        order: 0,
        authorType: "official-preset",
        tags: ["주인공", "로맨스", "단발", "우산"],
        stepData: { face: "부드러운 계란형", expression: "card-01-flutter", hair: "어깨선 흑발 단발", outfit: "베이지 트렌치 코트", pose: "hand-cheek-tilt", prop: "노란 장우산" },
        colorSetOklch: { skin: "oklch(0.91 0.035 58)", hair: "oklch(0.24 0.02 260)", primary: "oklch(0.76 0.06 78)", accent: "oklch(0.84 0.16 92)" },
      },
      {
        id: "char-dojin",
        categoryId: "cat-action-hero",
        nameKo: "강도진",
        order: 1,
        authorType: "creator-custom",
        tags: ["조력자", "수사관", "액션", "시계"],
        stepData: { face: "선명한 각진 턱선", expression: "card-07-resolve", hair: "다크 네이비 쉼표 머리", outfit: "차콜 롱 재킷", pose: "fist-chest-ready", prop: "왼손 낡은 손목시계" },
        colorSetOklch: { skin: "oklch(0.87 0.04 56)", hair: "oklch(0.26 0.045 258)", primary: "oklch(0.32 0.03 255)", accent: "oklch(0.64 0.19 28)" },
      },
    ],
  };
}

export function createCharacterCategory(
  state: TooningRegistryState,
  input: { readonly id: string; readonly nameKo: string; readonly authorType?: CharacterAuthorType },
): TooningRegistryState {
  const next: TooningCharacterCategory = {
    id: input.id,
    nameKo: input.nameKo.trim() || "새 캐릭터 분류",
    order: state.categories.length,
    authorType: input.authorType ?? "creator-custom",
    enabledSteps: { ...ALL_STEPS_ON },
  };
  return { ...state, categories: [...state.categories, next] };
}

export function updateCharacterCategory(
  state: TooningRegistryState,
  categoryId: string,
  patch: Partial<Pick<TooningCharacterCategory, "nameKo" | "enabledSteps">>,
): TooningRegistryState {
  return {
    ...state,
    categories: state.categories.map((cat) =>
      cat.id === categoryId
        ? { ...cat, nameKo: patch.nameKo?.trim() || cat.nameKo, enabledSteps: patch.enabledSteps ? { ...cat.enabledSteps, ...patch.enabledSteps } : cat.enabledSteps }
        : cat,
    ),
  };
}

export function reorderCharacterCategories(state: TooningRegistryState, orderedIds: readonly string[]): TooningRegistryState {
  const rank = new Map(orderedIds.map((id, idx) => [id, idx]));
  const sorted = [...state.categories]
    .sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999))
    .map((cat, idx) => ({ ...cat, order: idx }));
  return { ...state, categories: sorted };
}

export function updateCharacterAuthorType(
  state: TooningRegistryState,
  characterId: string,
  authorType: CharacterAuthorType,
): TooningRegistryState {
  return { ...state, characters: state.characters.map((ch) => (ch.id === characterId ? { ...ch, authorType } : ch)) };
}

export function updateCharacterResource(
  state: TooningRegistryState,
  characterId: string,
  patch: { readonly stepKey?: TooningStepKey; readonly stepValue?: string; readonly colorSetOklch?: Partial<TooningCharacterRecord["colorSetOklch"]> },
): TooningRegistryState {
  return {
    ...state,
    characters: state.characters.map((ch) => {
      if (ch.id !== characterId) return ch;
      return {
        ...ch,
        stepData: patch.stepKey && patch.stepValue !== undefined ? { ...ch.stepData, [patch.stepKey]: patch.stepValue } : ch.stepData,
        colorSetOklch: patch.colorSetOklch ? { ...ch.colorSetOklch, ...patch.colorSetOklch } : ch.colorSetOklch,
      };
    }),
  };
}

export function searchCharactersByTag(state: TooningRegistryState, query: string): readonly TooningCharacterRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return state.characters;
  return state.characters.filter((ch) => ch.nameKo.toLowerCase().includes(q) || ch.tags.some((t) => t.toLowerCase().includes(q)));
}

export function generateTooningMagicPanels(params: {
  readonly oneSentenceStoryKo: string;
  readonly cutCount: 4 | 8;
  readonly characters?: readonly TooningCharacterRecord[];
}): readonly TooningMagicPanel[] {
  const story = params.oneSentenceStoryKo.trim() || "비 오는 날 편의점 앞에서 우연히 전학 온 동창을 다시 만났다.";
  const roster = params.characters && params.characters.length > 0 ? params.characters : createInitialTooningRegistry().characters;
  const lead = roster[0];
  const partner = roster[1] ?? roster[0];

  const base = [
    { beatLabelKo: "기 · 상황 열기", actor: lead, cardId: "card-08-drained", bgHintKo: "장면 배경 와이드 샷", dialogueKo: "하… 오늘따라 일이 왜 이렇게 꼬이지?", narrationKo: story.slice(0, 34) },
    { beatLabelKo: "승 · 사건 발생", actor: partner, cardId: "card-02-sweat", bgHintKo: "인물 등장 미디엄 샷", dialogueKo: "잠깐, 혹시 그때 그 사람 맞지 않아?", narrationKo: "예상치 못한 목소리가 등을 붙잡았다." },
    { beatLabelKo: "전 · 감정 반전", actor: lead, cardId: "card-04-shock", bgHintKo: "표정 집중 클로즈업", dialogueKo: "너… 여긴 어떻게 알고 온 거야?!", narrationKo: "멈춰 있던 기억이 단숨에 되살아났다." },
    { beatLabelKo: "결 · 여운과 훅", actor: partner, cardId: "card-01-flutter", bgHintKo: "따뜻한 역광 투샷", dialogueKo: "우산 같이 쓰고 걸을까? 할 말이 많아.", narrationKo: "그렇게 두 사람의 이야기가 다시 시작됐다." },
  ];

  const chosen = params.cutCount === 4
    ? base
    : [
        base[0],
        { beatLabelKo: "일상 · 작은 단서", actor: lead, cardId: "card-15-think", bgHintKo: "소품 클로즈업", dialogueKo: "어? 이 물건, 어디서 본 것 같은데.", narrationKo: "스쳐 지나갈 뻔한 단서가 눈에 걸렸다." },
        base[1],
        { beatLabelKo: "갈등 · 엇갈린 반응", actor: lead, cardId: "card-12-suspect", bgHintKo: "시선 대립 반측면", dialogueKo: "우연이라고 하기엔 너무 정확하잖아.", narrationKo: "미묘한 경계심이 공기 속에 번졌다." },
        base[2],
        { beatLabelKo: "고조 · 진심 고백", actor: partner, cardId: "card-07-resolve", bgHintKo: "강조 로우 앵글", dialogueKo: "숨기지 않을게. 널 찾으려고 여기까지 왔어.", narrationKo: "단호한 어조가 망설임을 끊어냈다." },
        { beatLabelKo: "클라이맥스 · 반전 눈빛", actor: lead, cardId: "card-20-shadow-twist", bgHintKo: "극적 클로즈업", dialogueKo: "그렇다면… 나도 숨겨 둔 걸 보여 줄 차례네.", narrationKo: "장면의 공기가 완전히 뒤집혔다." },
        base[3],
      ];

  return chosen.map((tpl, idx) => ({
    panelId: `tooning-cut-${idx + 1}`,
    order: idx,
    beatLabelKo: tpl.beatLabelKo,
    characterId: tpl.actor.id,
    characterNameKo: tpl.actor.nameKo,
    expressionPoseCardId: tpl.cardId,
    backgroundHintKo: tpl.bgHintKo,
    dialogueKo: tpl.dialogueKo,
    narrationKo: tpl.narrationKo,
  }));
}

export function swapExpressionPoseCard(
  panels: readonly TooningMagicPanel[],
  panelId: string,
  nextCardId: string,
): readonly TooningMagicPanel[] {
  if (!KWEBTOON_EXPRESSION_POSE_CARDS.some((card) => card.id === nextCardId)) return panels;
  return panels.map((panel) => (panel.panelId === panelId ? { ...panel, expressionPoseCardId: nextCardId } : panel));
}

export function reorderTooningPanels(
  panels: readonly TooningMagicPanel[],
  fromIndex: number,
  toIndex: number,
): readonly TooningMagicPanel[] {
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= panels.length || toIndex >= panels.length || fromIndex === toIndex) {
    return panels;
  }
  const copy = [...panels];
  const [moved] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, moved);
  return copy.map((item, idx) => ({ ...item, order: idx }));
}

function pickCardIdFromDialogue(line: string): string {
  if (/!{2,}|\?!|어떻게|설마/u.test(line)) return "card-04-shock";
  if (/!|당장|절대|그만/u.test(line)) return "card-03-glare";
  if (/\?|진짜|혹시/u.test(line)) return "card-12-suspect";
  if (/ㅠ|ㅜ|미안|눈물|슬퍼/u.test(line)) return "card-05-hold-tears";
  if (/하하|ㅋㅋ|고마워|좋아/u.test(line)) return "card-01-flutter";
  if (/…|\.\.\./u.test(line)) return "card-15-think";
  return "card-13-comfort";
}

function splitLongBubbleLine(text: string, maxChars = 34): readonly string[] {
  const clean = text.trim();
  if (clean.length <= maxChars) return [clean];
  const mid = Math.floor(clean.length / 2);
  const spaceAfter = clean.indexOf(" ", mid);
  const spaceBefore = clean.lastIndexOf(" ", mid);
  const splitAt = spaceAfter !== -1 && spaceAfter - mid <= 8 ? spaceAfter : spaceBefore > 8 ? spaceBefore : mid;
  return [clean.slice(0, splitAt).trim(), clean.slice(splitAt).trim()].filter(Boolean);
}

export function importPersonaChatLogToCuts(chatLogText: string): readonly PersonaChatCut[] {
  const lines = chatLogText.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const speakerOrder: string[] = [];
  const cuts: PersonaChatCut[] = [];

  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    const speakerKo = colonIdx > 0 ? line.slice(0, colonIdx).trim() : "화자";
    const speech = (colonIdx > 0 ? line.slice(colonIdx + 1) : line).trim();
    if (!speech) continue;
    if (!speakerOrder.includes(speakerKo)) speakerOrder.push(speakerKo);
    const alignment: "left" | "right" = speakerOrder.indexOf(speakerKo) % 2 === 0 ? "left" : "right";
    const chunks = splitLongBubbleLine(speech);
    const cardId = pickCardIdFromDialogue(speech);
    chunks.forEach((chunk, idx) => {
      cuts.push({ cutIndex: cuts.length + 1, speakerKo, bubbleTextKo: chunk, splitPart: chunks.length > 1 ? `${idx + 1}/${chunks.length}` : null, expressionPoseCardId: cardId, alignment });
    });
  }
  return cuts;
}

const ANGLE_BLOCKING_PRESETS: Record<IdentityCameraAngle, { readonly cam: readonly [number, number, number]; readonly target: readonly [number, number, number] }> = {
  front: { cam: [0, 1.5, 3.2], target: [0, 1.45, 0] },
  "three-quarter": { cam: [1.8, 1.52, 2.8], target: [0, 1.42, 0] },
  profile: { cam: [2.9, 1.5, 0.2], target: [0, 1.45, 0] },
  back: { cam: [0.4, 1.6, -2.9], target: [0, 1.4, 0.4] },
  "low-angle": { cam: [1.4, 0.72, 2.6], target: [0, 1.62, 0] },
  "high-angle": { cam: [2.4, 3.1, 3.4], target: [0, 1.1, 0] },
};

function classifyScriptLine(line: string, index: number, total: number): {
  readonly beatKind: PlotrBeatKind;
  readonly tensionBase: number;
  readonly cameraAngle: IdentityCameraAngle;
  readonly shotSize: PlotrStoryboardCut["shotSize"];
  readonly lensMm: number;
  readonly sfxKo: string | null;
  readonly emotionLabelKo: string;
} {
  if (index === total - 1 && total >= 3) {
    return { beatKind: "cliffhanger", tensionBase: 92, cameraAngle: "low-angle", shotSize: "ECU", lensMm: 85, sfxKo: "두근—!", emotionLabelKo: "엔딩 반전 훅" };
  }
  if (index === 0) {
    return { beatKind: "establish", tensionBase: 38, cameraAngle: "high-angle", shotSize: "EWS", lensMm: 28, sfxKo: null, emotionLabelKo: "공간 몰입" };
  }
  if (/순간|반전|정체|비밀|멈췄|사라졌|충격|뒤에서/u.test(line)) {
    return { beatKind: "climax", tensionBase: 86, cameraAngle: "front", shotSize: "CU", lensMm: 85, sfxKo: "탁—!", emotionLabelKo: "긴장 고조" };
  }
  if (/달렸|뛰어|부딪|열렸|잡았|휘둘|넘어|닫혔|비명|추격/u.test(line)) {
    return { beatKind: "action", tensionBase: 76, cameraAngle: "low-angle", shotSize: "MS", lensMm: 35, sfxKo: "휙—!", emotionLabelKo: "역동 전개" };
  }
  if (/["“”'‘’]|:/u.test(line)) {
    return { beatKind: "dialogue", tensionBase: 58, cameraAngle: index % 2 === 0 ? "three-quarter" : "profile", shotSize: "MCU", lensMm: 50, sfxKo: null, emotionLabelKo: "감정 교류" };
  }
  return { beatKind: "reaction", tensionBase: 64, cameraAngle: "back", shotSize: "MS", lensMm: 50, sfxKo: null, emotionLabelKo: "시선 여운" };
}

function transitionForBeat(beatKind: PlotrBeatKind): PlotrStoryboardCut["videoTransition"] {
  if (beatKind === "action") return { kind: "whip-pan", durationMs: 220, motionCueKo: "빠른 수평 패닝으로 속도감 연결" };
  if (beatKind === "climax" || beatKind === "cliffhanger") return { kind: "zoom-push", durationMs: 420, motionCueKo: "인물 눈빛으로 서서히 줌인하며 정적 강조" };
  if (beatKind === "establish") return { kind: "dissolve", durationMs: 500, motionCueKo: "배경 분위기에서 인물로 부드럽게 진입" };
  return { kind: "cut", durationMs: 160, motionCueKo: "대사 리듬에 맞춘 간결한 컷 전환" };
}

export function compilePlotrStoryboardFromScript(scriptText: string, episodeTitleKo = "1화 콘티 초안"): PlotrStoryboardPlan {
  const rawUnits = scriptText
    .split(/\r?\n+/u)
    .flatMap((paragraph) => paragraph.split(/(?<=[.!?…”"])\s+/u))
    .map((segment) => segment.trim())
    .filter((segment) => segment.length >= 4);

  const units = rawUnits.length > 0
    ? rawUnits.slice(0, 12)
    : [
        "비가 쏟아지는 서울 옥상 위, 네온 불빛이 젖은 바닥에 번졌다.",
        "서연은 난간 너머에서 익숙한 낡은 시계를 발견하고 걸음을 멈췄다.",
        "\"잠깐, 그 시계… 분명 3년 전에 사라졌을 텐데.\"",
        "바로 그때 등 뒤 철문이 세게 열리며 그림자가 다가왔다.",
      ];

  let dialogueUnits = 0;
  const cuts: PlotrStoryboardCut[] = [];
  const tensionCurve: { readonly cutNumber: number; readonly tensionScore: number; readonly emotionLabelKo: string }[] = [];

  units.forEach((line, idx) => {
    const meta = classifyScriptLine(line, idx, units.length);
    const quoteMatch = line.match(/["“]([^"”]+)["”]/u);
    const dialogueKo = quoteMatch ? quoteMatch[1].trim() : line.includes(":") ? line.split(":").slice(1).join(":").trim() : "";
    if (dialogueKo.length > 0) dialogueUnits += 1;

    const progressBoost = Math.round((idx / Math.max(1, units.length - 1)) * 12);
    const tensionScore = Math.min(100, meta.tensionBase + (meta.beatKind === "establish" ? 0 : progressBoost));
    const preset = ANGLE_BLOCKING_PRESETS[meta.cameraAngle];
    const cutNumber = idx + 1;

    cuts.push({
      cutNumber,
      beatKind: meta.beatKind,
      visualBeatKo: line.length > 56 ? `${line.slice(0, 55)}…` : line,
      dialogueKo,
      sfxKo: meta.sfxKo,
      tensionScore,
      cameraAngle: meta.cameraAngle,
      shotSize: meta.shotSize,
      lensMm: meta.lensMm,
      blocking3d: { cameraPos: preset.cam, targetPos: preset.target, subjectPos: [0, 0, 0], groundY: 0 },
      videoTransition: transitionForBeat(meta.beatKind),
    });
    tensionCurve.push({ cutNumber, tensionScore, emotionLabelKo: meta.emotionLabelKo });
  });

  const peakCut = cuts.reduce((best, cur) => (cur.tensionScore > best.tensionScore ? cur : best), cuts[0]);
  return {
    episodeTitleKo: episodeTitleKo.trim() || "1화 콘티 초안",
    scriptInsight: {
      paragraphCount: scriptText.split(/\r?\n+/u).filter((item) => item.trim().length > 0).length || 1,
      cutCount: cuts.length,
      dialogueRatioPct: Math.round((dialogueUnits / Math.max(1, cuts.length)) * 100),
      peakCutNumber: peakCut.cutNumber,
      summaryKo: `총 ${cuts.length}컷 콘티와 영상 전환 흐름을 구성했습니다. 최고 긴장 지점은 ${peakCut.cutNumber}컷(${peakCut.tensionScore}점)입니다.`,
    },
    cuts,
    tensionCurve,
  };
}

export function createCharacterIdentityAnchor(params: {
  readonly characterId: string;
  readonly nameKo: string;
  readonly hairSilhouetteToken?: string;
  readonly outfitTokens?: readonly string[];
}): CharacterIdentityAnchor {
  return {
    characterId: params.characterId,
    nameKo: params.nameKo.trim() || "주연 캐릭터",
    faceRatio: { eyeSpacingRatio: 0.44, jawRatio: 0.62, headToBodyRatio: 7.2 },
    hairSilhouetteToken: params.hairSilhouetteToken ?? "shoulder-bob-left-part",
    outfitTokens: params.outfitTokens ?? ["beige-trench", "navy-collar", "left-wrist-watch"],
    paletteOklch: {
      hair: "oklch(0.24 0.02 260)",
      eyes: "oklch(0.36 0.08 48)",
      outfitPrimary: "oklch(0.76 0.06 78)",
      accent: "oklch(0.64 0.19 28)",
    },
  };
}

function oklchDistance(aCss: string, bCss: string): number {
  const fallback: OklchColor = { l: 0.5, c: 0.05, h: 200 };
  const a = parseOklchString(aCss) ?? fallback;
  const b = parseOklchString(bCss) ?? fallback;
  const dL = (a.l - b.l) * 100;
  const dC = (a.c - b.c) * 100;
  const rawHueDiff = Math.abs(a.h - b.h);
  const dH = Math.min(rawHueDiff, 360 - rawHueDiff) / 3.6;
  return Math.round(Math.sqrt(dL * dL + dC * dC + dH * dH) * 10) / 10;
}

export function verifySixAngleIdentityConsistency(
  anchor: CharacterIdentityAnchor,
  observations: readonly AngleObservationInput[],
): SixAngleConsistencyReport {
  const byAngle = new Map(observations.map((item) => [item.angle, item]));
  const angleResults = IDENTITY_LOCK_ANGLES.map((spec) => {
    const obs = byAngle.get(spec.angle);
    if (!obs) {
      return { angle: spec.angle, labelKo: spec.labelKo, passed: false, driftScore: 100, consistencyScore: 0, paletteDelta: 100, fixHintsKo: [`${spec.labelKo} 앵글 참조 시트가 아직 등록되지 않았습니다.`] };
    }
    const fixHintsKo: string[] = [];
    const ratioPenalty = Math.min(
      40,
      Math.round(
        Math.abs(obs.observedFaceRatio.eyeSpacingRatio - anchor.faceRatio.eyeSpacingRatio) * 180 +
          Math.abs(obs.observedFaceRatio.jawRatio - anchor.faceRatio.jawRatio) * 140 +
          Math.abs(obs.observedFaceRatio.headToBodyRatio - anchor.faceRatio.headToBodyRatio) * 18,
      ),
    );
    if (ratioPenalty >= 12) fixHintsKo.push("눈 간격·턱선·등신 비율을 기준 앵커 값으로 고정해 주세요.");

    const hairMismatch = obs.observedHairSilhouetteToken !== anchor.hairSilhouetteToken;
    if (hairMismatch) fixHintsKo.push(`헤어 실루엣(${obs.observedHairSilhouetteToken})을 기준(${anchor.hairSilhouetteToken})으로 맞추세요.`);

    const missingOutfit = anchor.outfitTokens.filter((token) => !obs.observedOutfitTokens.includes(token));
    if (missingOutfit.length > 0) fixHintsKo.push(`누락된 의상·소품 포인트(${missingOutfit.join(", ")})를 다시 배치하세요.`);

    const paletteDelta =
      Math.round(
        ((oklchDistance(anchor.paletteOklch.hair, obs.observedPaletteOklch.hair) +
          oklchDistance(anchor.paletteOklch.eyes, obs.observedPaletteOklch.eyes) +
          oklchDistance(anchor.paletteOklch.outfitPrimary, obs.observedPaletteOklch.outfitPrimary) +
          oklchDistance(anchor.paletteOklch.accent, obs.observedPaletteOklch.accent)) /
          4) *
          10,
      ) / 10;
    if (paletteDelta > 8) fixHintsKo.push(`고유 색감 편차(${paletteDelta})가 커졌습니다. 기준 팔레트 잠금을 켜세요.`);

    const driftScore = Math.min(100, ratioPenalty + (hairMismatch ? 22 : 0) + missingOutfit.length * 14 + Math.min(35, Math.round(paletteDelta * 1.4)));
    return {
      angle: spec.angle,
      labelKo: spec.labelKo,
      passed: driftScore <= 18 && !hairMismatch && missingOutfit.length === 0,
      driftScore,
      consistencyScore: Math.max(0, 100 - driftScore),
      paletteDelta,
      fixHintsKo,
    };
  });

  return {
    characterId: anchor.characterId,
    nameKo: anchor.nameKo,
    overallConsistencyScore: Math.round(angleResults.reduce((s, r) => s + r.consistencyScore, 0) / angleResults.length),
    allAnglesPassed: angleResults.every((item) => item.passed),
    angleResults,
  };
}

export function buildPlotrLayoutAndLineCleanupPlan(
  storyboard: PlotrStoryboardPlan,
  readingMode: "vertical-scroll" | "page-z-flow" = "vertical-scroll",
): PlotrLayoutAndLineCleanupPlan {
  const isVertical = readingMode === "vertical-scroll";
  const canvasWidthPx = isVertical ? 800 : 1480;
  const marginX = isVertical ? 40 : 60;
  const innerW = canvasWidthPx - marginX * 2;
  const panelBoxes: PlotrLayoutAndLineCleanupPlan["panelBoxes"][number][] = [];

  if (isVertical) {
    let cursorY = 56;
    storyboard.cuts.forEach((cut, idx) => {
      const height = cut.beatKind === "cliffhanger" ? 560 : cut.beatKind === "establish" ? 480 : 380;
      const gutterAfterPx = cut.beatKind === "cliffhanger" || cut.beatKind === "climax" ? 360 : cut.beatKind === "dialogue" ? 120 : 220;
      panelBoxes.push({
        cutNumber: cut.cutNumber,
        x: marginX,
        y: cursorY,
        width: innerW,
        height,
        borderPx: cut.tensionScore >= 80 ? 4 : 2,
        gutterAfterPx,
        bubbleReadingOrder: idx + 1,
        bubblePoint: { x: idx % 2 === 0 ? marginX + 72 : marginX + innerW - 220, y: cursorY + 48 },
      });
      cursorY += height + gutterAfterPx;
    });
    return {
      readingMode,
      canvasWidthPx,
      totalHeightPx: cursorY + 64,
      panelBoxes,
      lineCleanup: {
        closeGapPx: 4,
        removeSpeckleMaxPx2: 6,
        strokeTaperSmoothPct: 35,
        nonDestructiveBackup: true,
        summaryKo: "열린 선 4px 자동 닫기 · 먼지 점(6px² 이하) 제거 · 펜 끝 35% 매끄럽게 보정 (원본 레이어 보존)",
      },
    };
  }

  const colGap = 36;
  const colW = Math.floor((innerW - colGap) / 2);
  let rowY = 64;
  storyboard.cuts.forEach((cut, idx) => {
    const col = idx % 2;
    const x = marginX + col * (colW + colGap);
    panelBoxes.push({
      cutNumber: cut.cutNumber,
      x,
      y: rowY,
      width: colW,
      height: 420,
      borderPx: cut.tensionScore >= 80 ? 4 : 2,
      gutterAfterPx: 44,
      bubbleReadingOrder: idx + 1,
      bubblePoint: { x: x + (col === 0 ? 56 : colW - 180), y: rowY + 44 },
    });
    if (col === 1 || idx === storyboard.cuts.length - 1) rowY += 464;
  });

  return {
    readingMode,
    canvasWidthPx,
    totalHeightPx: rowY + 64,
    panelBoxes,
    lineCleanup: {
      closeGapPx: 4,
      removeSpeckleMaxPx2: 6,
      strokeTaperSmoothPct: 35,
      nonDestructiveBackup: true,
      summaryKo: "단행본 Z-동선 좌→우·상→하 말풍선 순서를 잠그고 4px 열린 선·미세 먼지를 비파괴로 정리합니다.",
    },
  };
}
