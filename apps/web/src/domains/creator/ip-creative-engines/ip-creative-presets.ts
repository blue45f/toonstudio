/**
 * Wave 17A — IP 창작·가독성·컷재활용·텐션·오디오/트레일러·현지화·클린룸 스위트 기본 시연·검수 프리셋 데이터
 */

import type { CutReuseAssetItem, ReadabilityLayerItem } from "./a11y-reuse-tension-engine";
import type { LocalizeBalloonInput, ManuscriptScriptLine, TrailerCutCandidate } from "./audio-localize-cleanroom-engine";
import type { CleanroomAssetRecord, LoraCutSample } from "./lora-cleanroom-engine";
import type { BranchingStoryGraph, EpisodeTensionCut, SpoilerFreeStoryBible } from "./story-tension-branch-engine";

export const DEFAULT_READABILITY_LAYERS: readonly ReadabilityLayerItem[] = [
  {
    id: "layer-sfx-black",
    labelKo: "컷 외곽 검정 효과음 '쿠구궁!'",
    kind: "sfx",
    foreground: { r: 22, g: 24, b: 30 },
    surface: null,
    fontSizePx: 34,
    strokeWidthPx: 0,
    hasOuterHalo: false,
  },
  {
    id: "layer-sfx-crimson",
    labelKo: "심장 경고 적색 효과음 '두근!'",
    kind: "sfx",
    foreground: { r: 196, g: 36, b: 44 },
    surface: { r: 24, g: 76, b: 42 },
    fontSizePx: 28,
    strokeWidthPx: 0,
    hasOuterHalo: false,
  },
  {
    id: "layer-bubble-main",
    labelKo: "주인공 대사 말풍선",
    kind: "speech-bubble",
    foreground: { r: 20, g: 24, b: 32 },
    surface: { r: 248, g: 249, b: 252 },
    fontSizePx: 16,
    strokeWidthPx: 0,
    hasOuterHalo: false,
  },
  {
    id: "layer-caption-tiny",
    labelKo: "하단 주석 자막",
    kind: "caption",
    foreground: { r: 112, g: 120, b: 138 },
    surface: null,
    fontSizePx: 12,
    strokeWidthPx: 0,
    hasOuterHalo: false,
  },
];

export const DEFAULT_CUT_REUSE_BANK: readonly CutReuseAssetItem[] = [
  {
    id: "reuse-han-anger-14",
    titleKo: "한서진 이 악문 분노 클로즈업",
    characterName: "한서진",
    category: "expression",
    emotion: "anger",
    episodeNumber: 14,
    cutNumber: 38,
    tags: ["주인공", "분노", "클로즈업", "눈빛"],
    widthPx: 640,
    heightPx: 640,
    dominantToneOklch: "oklch(0.62 0.16 24)",
    usageCount: 9,
    layerPreset: "lineart-plus-flat",
  },
  {
    id: "reuse-han-shock-42",
    titleKo: "한서진 동공 축소 충격 표정",
    characterName: "한서진",
    category: "expression",
    emotion: "shock",
    episodeNumber: 42,
    cutNumber: 51,
    tags: ["주인공", "충격", "땀방울", "반전"],
    widthPx: 620,
    heightPx: 580,
    dominantToneOklch: "oklch(0.71 0.12 248)",
    usageCount: 12,
    layerPreset: "lineart-plus-flat",
  },
  {
    id: "reuse-yoon-smirk-67",
    titleKo: "윤채린 턱 괴고 비웃는 미소",
    characterName: "윤채린",
    category: "expression",
    emotion: "smirk",
    episodeNumber: 67,
    cutNumber: 19,
    tags: ["라이벌", "비웃음", "여유", "반측면"],
    widthPx: 600,
    heightPx: 640,
    dominantToneOklch: "oklch(0.68 0.14 318)",
    usageCount: 7,
    layerPreset: "full-shaded",
  },
  {
    id: "reuse-hand-sword-23",
    titleKo: "한서진 검자루 쥔 오른손 클로즈업",
    characterName: "한서진",
    category: "hand",
    emotion: "focus",
    episodeNumber: 23,
    cutNumber: 12,
    tags: ["손동작", "검", "힘줄", "전투준비"],
    widthPx: 480,
    heightPx: 420,
    dominantToneOklch: "oklch(0.76 0.08 62)",
    usageCount: 15,
    layerPreset: "lineart-only",
  },
  {
    id: "reuse-hand-phone-88",
    titleKo: "윤채린 스마트폰 알림 확인 왼손",
    characterName: "윤채린",
    category: "hand",
    emotion: "calm",
    episodeNumber: 88,
    cutNumber: 7,
    tags: ["손동작", "스마트폰", "일상", "메시지"],
    widthPx: 440,
    heightPx: 460,
    dominantToneOklch: "oklch(0.72 0.09 212)",
    usageCount: 6,
    layerPreset: "lineart-plus-flat",
  },
  {
    id: "reuse-prop-emblem-05",
    titleKo: "백야 길드 은장 엠블럼 브로치",
    characterName: "공용 소품",
    category: "prop",
    emotion: "calm",
    episodeNumber: 5,
    cutNumber: 24,
    tags: ["소품", "길드", "금속광택", "증거"],
    widthPx: 360,
    heightPx: 360,
    dominantToneOklch: "oklch(0.82 0.11 86)",
    usageCount: 19,
    layerPreset: "full-shaded",
  },
];

export const DEFAULT_STORY_BIBLE: SpoilerFreeStoryBible = {
  characters: [
    { id: "char-han", nameKo: "한서진", roleKo: "기록 복원사(주인공)", firstAppearanceEpisode: 1, toneOklch: "oklch(0.74 0.13 240)" },
    { id: "char-yoon", nameKo: "윤채린", roleKo: "백야 길드 수석 감찰관", firstAppearanceEpisode: 3, toneOklch: "oklch(0.72 0.15 330)" },
    { id: "char-kang", nameKo: "강도현", roleKo: "지하 문서고 관리자", firstAppearanceEpisode: 12, toneOklch: "oklch(0.77 0.12 150)" },
    { id: "char-archivist", nameKo: "가면의 서기관", roleKo: "봉인된 1세대 길드장", firstAppearanceEpisode: 25, toneOklch: "oklch(0.78 0.14 68)" },
  ],
  relationships: [
    {
      id: "rel-1",
      fromCharacterId: "char-han",
      toCharacterId: "char-yoon",
      relationType: "rival",
      labelKo: "감시 대상과 감찰관",
      summaryKo: "윤채린이 한서진의 금지된 복원 능력을 의심하며 밀착 감시한다.",
      revealedEpisode: 4,
      supersededEpisode: 18,
    },
    {
      id: "rel-2",
      fromCharacterId: "char-han",
      toCharacterId: "char-yoon",
      relationType: "ally",
      labelKo: "비밀 공조 파트너",
      summaryKo: "길드 내부 배신자를 찾기 위해 두 사람이 비밀리에 손을 잡았다.",
      revealedEpisode: 18,
    },
    {
      id: "rel-3",
      fromCharacterId: "char-han",
      toCharacterId: "char-kang",
      relationType: "mentor",
      labelKo: "문서 복원 스승",
      summaryKo: "강도현이 지하 문서고의 진짜 열쇠를 한서진에게 맡겼다.",
      revealedEpisode: 14,
    },
    {
      id: "rel-4",
      fromCharacterId: "char-yoon",
      toCharacterId: "char-archivist",
      relationType: "secret",
      labelKo: "친부이자 흑막",
      summaryKo: "가면의 서기관이 사실 10년 전 실종된 윤채린의 아버지다.",
      revealedEpisode: 28,
    },
  ],
  episodeBeats: [
    { episodeNumber: 10, headlineKo: "10화 · 금지된 잉크 발견", keyTurnKo: "한서진이 찢긴 계약서에서 삭제된 서명을 복원했다.", cliffhangerKo: "그 직후 문서고 경보가 울렸다." },
    { episodeNumber: 14, headlineKo: "14화 · 지하 문서고의 열쇠", keyTurnKo: "강도현이 원본 봉인실의 열쇠를 넘겨주며 배신자의 흔적을 경고했다.", cliffhangerKo: "윤채린이 문 밖에서 대화를 엿들었다." },
    { episodeNumber: 18, headlineKo: "18화 · 빗속의 비밀 공조", keyTurnKo: "윤채린이 체포 대신 협력을 택하며 배신자 명단을 공유했다.", cliffhangerKo: "명단 첫 줄에 길드장 인장이 찍혀 있었다." },
    { episodeNumber: 28, headlineKo: "28화 · 가면 아래의 진실", keyTurnKo: "가면의 서기관이 정체를 드러내며 윤채린의 이름을 불렀다.", cliffhangerKo: "봉인실 천장이 무너지기 시작했다." },
  ],
};

export const DEFAULT_TENSION_CUTS: readonly EpisodeTensionCut[] = [
  { cutIndex: 1, labelKo: "도입 야경 전경", emotionIntensity: 26, actionIntensity: 18, dialogueDensity: 22, hasCliffhanger: false },
  { cutIndex: 2, labelKo: "단서 브리핑 대화", emotionIntensity: 34, actionIntensity: 16, dialogueDensity: 86, hasCliffhanger: false },
  { cutIndex: 3, labelKo: "복도 발소리 감지", emotionIntensity: 52, actionIntensity: 38, dialogueDensity: 28, hasCliffhanger: false },
  { cutIndex: 4, labelKo: "추격전 진입", emotionIntensity: 68, actionIntensity: 78, dialogueDensity: 32, hasCliffhanger: false },
  { cutIndex: 5, labelKo: "배신자 정체 폭로", emotionIntensity: 91, actionIntensity: 84, dialogueDensity: 54, hasCliffhanger: false },
  { cutIndex: 6, labelKo: "칼날 대치 엔딩 훅", emotionIntensity: 94, actionIntensity: 88, dialogueDensity: 24, hasCliffhanger: true },
];

export const DEFAULT_BRANCHING_GRAPH: BranchingStoryGraph = {
  startNodeId: "cut-start",
  nodes: [
    {
      id: "cut-start",
      titleKo: "1분기 · 지하 문서고 갈림길",
      isEnding: false,
      choices: [
        { id: "c-left", labelKo: "윤채린을 믿고 열쇠를 건넨다", targetNodeId: "cut-ally" },
        { id: "c-right", labelKo: "단독으로 봉인실로 잠입한다", targetNodeId: "cut-solo" },
      ],
    },
    {
      id: "cut-ally",
      titleKo: "2A · 비밀 공조 루트",
      isEnding: false,
      choices: [{ id: "c-ally-end", labelKo: "배신자 증거를 공개한다", targetNodeId: "ending-truth" }],
    },
    {
      id: "cut-solo",
      titleKo: "2B · 단독 잠입 루트",
      isEnding: false,
      choices: [{ id: "c-solo-end", labelKo: "비상 통로로 탈출한다", targetNodeId: "ending-escape" }],
    },
    { id: "ending-truth", titleKo: "진실 엔딩 · 길드 청문회", isEnding: true, choices: [] },
    { id: "ending-escape", titleKo: "도주 엔딩 · 밤안개 속으로", isEnding: true, choices: [] },
  ],
};

export const DEFAULT_AUDIO_SCRIPT_LINES: readonly ManuscriptScriptLine[] = [
  { id: "line-1", cutNumber: 1, speaker: "내레이션", textKo: "자정을 넘긴 지하 문서고에는 빗소리만 낮게 울렸다.", bgmCue: "미스터리 첼로 앰비언스", sfxHint: "빗방울 잔향" },
  { id: "line-2", cutNumber: 2, speaker: "윤채린", textKo: "쉿, 발소리 들려? 지금 당장 등불부터 꺼.", emotionHint: "속삭임", sfxHint: "구두 발소리 접근" },
  { id: "line-3", cutNumber: 4, speaker: "한서진", textKo: "그만! 그 계약서는 내가 직접 복원한 원본이라고!!", bgmCue: "추격 퍼커션 빌드업", sfxHint: "금속 잠금 해제음" },
  { id: "line-4", cutNumber: 6, speaker: "윤채린", textKo: "미안해... 나도 그 이름을 보고 믿을 수가 없었어.", emotionHint: "슬픔", pauseAfterSec: 0.9 },
];

export const DEFAULT_TRAILER_CANDIDATES: readonly TrailerCutCandidate[] = [
  { id: "tr-1", cutNumber: 2, captionKo: "삭제된 계약서의 숨은 서명", hookScore: 76, emotion: "긴장", focalPoint: { x: 0.5, y: 0.42 }, hasSpoiler: false },
  { id: "tr-2", cutNumber: 5, captionKo: "빗속에서 마주한 감찰관의 칼날", hookScore: 94, emotion: "분노", focalPoint: { x: 0.46, y: 0.38 }, hasSpoiler: false },
  { id: "tr-3", cutNumber: 8, captionKo: "단 30초, 봉인실의 문이 열린다", hookScore: 86, emotion: "긴장", focalPoint: { x: 0.55, y: 0.5 }, hasSpoiler: false },
  { id: "tr-4", cutNumber: 11, captionKo: "그가 사실 길드장의 친부였다", hookScore: 99, emotion: "슬픔", focalPoint: { x: 0.5, y: 0.35 }, hasSpoiler: true },
  { id: "tr-5", cutNumber: 12, captionKo: "이번 주 금요일 밤, 진실이 깨어난다", hookScore: 82, emotion: "환희", focalPoint: { x: 0.5, y: 0.46 }, hasSpoiler: false },
];

export const DEFAULT_LOCALIZE_INPUT: LocalizeBalloonInput = {
  sourceTextKo: "두근두근... 이 정도 복원은 식은 죽 먹기지! 하늘이 무너져도 끝낸다!",
  targetLocale: "ja",
  originalBalloonWidthPx: 220,
  originalBalloonHeightPx: 128,
  baseFontSizePx: 16,
};

export const DEFAULT_LORA_SAMPLES: readonly LoraCutSample[] = [
  { id: "cut-01", episodeNumber: 12, widthPx: 1280, heightPx: 1280, perceptualHash: "a1b2c3d4e5f60718", authorOwned: true, consentSigned: true, rawCaptionKo: "빗속 측면 조명 클로즈업", styleTags: ["noir_ink", "rain_rimlight", "sharp_eyelash"], hasTextBubble: false },
  { id: "cut-02", episodeNumber: 15, widthPx: 1440, heightPx: 1440, perceptualHash: "00ff22cc44aa6688", authorOwned: true, consentSigned: true, rawCaptionKo: "지하 문서고 석조 질감", styleTags: ["crosshatch_shadow", "warm_lantern", "painterly_bg"], hasTextBubble: false },
  { id: "cut-03", episodeNumber: 15, widthPx: 1440, heightPx: 1440, perceptualHash: "00ff22cc44aa6689", authorOwned: true, consentSigned: true, rawCaptionKo: "연속 중복 프레임", styleTags: ["crosshatch_shadow"], hasTextBubble: false },
  { id: "cut-04", episodeNumber: 19, widthPx: 640, heightPx: 640, perceptualHash: "9988776655443322", authorOwned: true, consentSigned: true, rawCaptionKo: "저해상도 썸네일 컷", styleTags: ["thumbnail"], hasTextBubble: false },
  { id: "cut-05", episodeNumber: 22, widthPx: 1200, heightPx: 1200, perceptualHash: "13579bdf2468ace0", authorOwned: false, consentSigned: false, rawCaptionKo: "외부 참고 이미지", styleTags: ["external_ref"], hasTextBubble: false },
  { id: "cut-06", episodeNumber: 24, widthPx: 1280, heightPx: 1280, perceptualHash: "fedcba9876543210", authorOwned: true, consentSigned: true, rawCaptionKo: "말풍선 가득한 대화 컷", styleTags: ["dialogue"], hasTextBubble: true },
];

export const DEFAULT_CLEANROOM_ASSETS: readonly CleanroomAssetRecord[] = [
  { id: "cr-font", nameKo: "코펍 바탕 웹툰 폰트", kind: "font", license: "cc0", attributionProvided: true, sourceProof: "KOPUB-OPEN-LICENSE", similarityScore: 0 },
  { id: "cr-3d", nameKo: "지하 문서고 3D 배경 키트", kind: "3d-asset", license: "commercial-paid", attributionProvided: true, sourceProof: "ORDER-TS-2026-0912", similarityScore: 14 },
  { id: "cr-brush", nameKo: "수묵 거친 펜 브러시", kind: "brush", license: "commercial-free-attribution", attributionProvided: false, sourceProof: "CREATOR-CCBY-LINK", similarityScore: 8 },
  { id: "cr-ref", nameKo: "추격 구도 외부 참고 사진", kind: "reference", license: "author-original", attributionProvided: true, sourceProof: "AUTHOR-SKETCH-LOG", similarityScore: 84 },
];
