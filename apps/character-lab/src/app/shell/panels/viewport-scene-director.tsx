/**
 * 장르별 원클릭 풀세트 씬 디렉터 프리셋 (`viewport-scene-director.tsx`, Unslop 규약 준수):
 * - 로판 대관식 · 느와르 취조실 · 캠퍼스 카페 · 무협 각성 · 옥상 황혼 독대 · 괴도 달빛 예고장 6대 한국·글로벌 웹툰 씬 디렉터
 * - 버튼/셀렉터 한 번으로 손 소품 + 그립 포즈 + 머리 액세서리 + 배경 스테이지 + 웹툰 셀셰이딩 조명 + 4컷 연기 시퀀스 + 컷별 카메라 구도(더치 틸트) + 스크롤 여백 호흡 + 시간대 색온도 무드 + 다국어(KO·EN·JA) 대사까지 일괄 세팅
 * - `상대역 자동 캐스팅` 버튼으로 장르에 어울리는 3D 듀오 상대역 캐릭터·표정·전용 손소품·아이컨택 시선 교환까지 즉시 배치
 * - `stripDirectorSession` 외부 반응형 스토어를 통해 `ViewportPane`과 `ExportPanel`이 `UiState` 오염 없이 실시간 동기화된다.
 */
import {
  DEFAULT_WEBTOON_STRIP_BUBBLE_FONT_SCALES,
  DEFAULT_WEBTOON_STRIP_BUBBLE_SHAPES,
  DEFAULT_WEBTOON_STRIP_CUT_CAMERA_PRESETS,
  DEFAULT_WEBTOON_STRIP_DIALOGUE_BY_LOCALE,
  DEFAULT_WEBTOON_STRIP_DIALOGUE_LINES,
  DEFAULT_WEBTOON_STRIP_GUTTER_PACES,
  DEFAULT_WEBTOON_STRIP_SFX_STAMPS,
  DEFAULT_WEBTOON_STRIP_SPEAKER_TARGETS,
} from "../../../export/webtoon-strip-composer";
import { SHAPER_TOON_SHADER_PRESETS, buildShaperToonShadingProfile } from "../../../presets";

import type { DuoPartnerSide, DuoShotDistanceKey } from "./viewport-duo-shot-guide";
import type {
  DuoPartnerExpressionPreset,
  DuoPartnerStance,
  HandPropId,
  HandPropSide,
  HeadPropId,
  SfxStampId,
  ShadingProfile,
  StagePropId,
} from "../../../contracts";
import type {
  WebtoonDialogueLocale,
  WebtoonJaWritingMode,
  WebtoonManuscriptMoodId,
  WebtoonSfxStampOption,
  WebtoonStripActingArcId,
  WebtoonStripBubbleFontScale,
  WebtoonStripBubbleFontScales,
  WebtoonStripBubbleShape,
  WebtoonStripBubbleShapes,
  WebtoonStripCutCameraPresetId,
  WebtoonStripCutCameraPresets,
  WebtoonStripDialogueLines,
  WebtoonStripFxLinesKind,
  WebtoonStripGutterPaceId,
  WebtoonStripGutterPaces,
  WebtoonStripSfxStamps,
  WebtoonStripSpeakerTarget,
  WebtoonStripSpeakerTargets,
} from "../../../export/webtoon-strip-composer";
import type { ShaperToonShaderId } from "../../../presets";

export type WebtoonSceneDirectorPresetId =
  | "director-rofan-coronation"
  | "director-noir-interrogation"
  | "director-campus-cafe"
  | "director-murim-awakening"
  | "director-rooftop-twilight"
  | "director-phantom-heist";

export interface WebtoonDirectorDuoCastingSpec {
  readonly partnerId: string;
  readonly side: DuoPartnerSide;
  readonly distanceKey: DuoShotDistanceKey;
  readonly stance: DuoPartnerStance;
  readonly expression: DuoPartnerExpressionPreset;
  readonly partnerHandPropId: HandPropId | "";
}

export interface WebtoonSceneDirectorPreset {
  readonly id: WebtoonSceneDirectorPresetId;
  readonly labelKo: string;
  readonly summaryKo: string;
  readonly handPropId: HandPropId;
  readonly handSide: HandPropSide;
  readonly headPropId: HeadPropId;
  readonly stagePropId: StagePropId;
  readonly sfxStampId: SfxStampId;
  readonly toonShaderId: ShaperToonShaderId;
  readonly actingArc: Exclude<WebtoonStripActingArcId, "none">;
  readonly fxLinesKind: WebtoonStripFxLinesKind;
  readonly manuscriptMood: WebtoonManuscriptMoodId;
  readonly gutterPaces: WebtoonStripGutterPaces;
  readonly dialogueLines: WebtoonStripDialogueLines;
  readonly dialogueByLocale: Readonly<Record<WebtoonDialogueLocale, WebtoonStripDialogueLines>>;
  readonly bubbleShapes: WebtoonStripBubbleShapes;
  readonly bubbleFontScales: WebtoonStripBubbleFontScales;
  readonly sfxStamps: WebtoonStripSfxStamps;
  readonly speakerTargets: WebtoonStripSpeakerTargets;
  readonly cutCameraPresets: WebtoonStripCutCameraPresets;
  readonly duoCasting: WebtoonDirectorDuoCastingSpec;
}

export const WEBTOON_SCENE_DIRECTOR_PRESETS: readonly WebtoonSceneDirectorPreset[] = Object.freeze([
  {
    id: "director-rofan-coronation",
    labelKo: "로판 대관식 (티아라·단검·대리석 단상)",
    summaryKo: "사파이어 티아라 + 마력 단검 + 황실 대리석 단상 + 일루미네이션 림 + 여유·역전 4컷 연기",
    handPropId: "aether-blade",
    handSide: "rightHand",
    headPropId: "rofan-tiara",
    stagePropId: "rofan-throne-dais",
    sfxStampId: "seureung",
    toonShaderId: "illumination-rim",
    actingArc: "arc-confident-smirk",
    fxLinesKind: "romance-sparkle",
    manuscriptMood: "daylight-paper",
    gutterPaces: ["standard", "dramatic-pause", "standard"],
    dialogueLines: [
      "황실의 검과 왕관, 오늘부로 내가 거둔다.",
      "감히 고개를 들어 내 눈을 마주 봐.",
      "오래 기다렸지? 이제 반격의 시간이야.",
      "내 제국에 온 걸 환영해.",
    ],
    dialogueByLocale: {
      ko: [
        "황실의 검과 왕관, 오늘부로 내가 거둔다.",
        "감히 고개를 들어 내 눈을 마주 봐.",
        "오래 기다렸지? 이제 반격의 시간이야.",
        "내 제국에 온 걸 환영해.",
      ],
      en: [
        "The imperial blade and crown are mine today.",
        "Raise your head and look me in the eye.",
        "Kept you waiting. Time to strike back.",
        "Welcome to my empire.",
      ],
      ja: [
        "皇室の剣と王冠、今日から私が継ぐ。",
        "顔を上げて、私の目を見なさい。",
        "待たせたわね。反撃の時間よ。",
        "私の帝国へようこそ。",
      ],
    },
    bubbleShapes: ["monologue-box", "oval", "shout-burst", "oval"],
    bubbleFontScales: ["md", "md", "lg", "md"],
    sfxStamps: ["seureung", "none", "pat", "dugeun"],
    speakerTargets: ["protagonist", "partner", "protagonist", "protagonist"],
    cutCameraPresets: ["low-full", "side-bust", "dutch-right-face", "high-bust"],
    duoCasting: {
      partnerId: "shaper-noir-duke",
      side: "right",
      distanceKey: "talk",
      stance: "attentive",
      expression: "cold-smirk",
      partnerHandPropId: "imperial-scroll",
    },
  },
  {
    id: "director-noir-interrogation",
    labelKo: "느와르 취조실 (안경·서류철·펜던트 조명)",
    summaryKo: "메탈 라운드 안경 + 수사 서류철 + 취조실 스틸 책상·펜던트 램프 + 하드 셀 3단 + 스릴러 반전 4컷 연기",
    handPropId: "case-folder",
    handSide: "leftHand",
    headPropId: "wire-glasses",
    stagePropId: "noir-interrogation-lamp",
    sfxStampId: "pat",
    toonShaderId: "action-hard-cel3",
    actingArc: "arc-thriller-shock",
    fxLinesKind: "focus-radial",
    manuscriptMood: "midnight-noir",
    gutterPaces: ["standard", "dramatic-pause", "cliffhanger"],
    dialogueLines: [
      "사건 기록 14페이지, 비어 있던 시간 말인데.",
      "어젯밤 11시, 그 현장에 당신도 있었지?",
      "설마 진짜 배후가 내부에 있었다고?",
      "증거는 충분해. 여기서 끝내자.",
    ],
    dialogueByLocale: {
      ko: [
        "사건 기록 14페이지, 비어 있던 시간 말인데.",
        "어젯밤 11시, 그 현장에 당신도 있었지?",
        "설마 진짜 배후가 내부에 있었다고?",
        "증거는 충분해. 여기서 끝내자.",
      ],
      en: [
        "Page fourteen of the file has a missing hour.",
        "You were at the scene at eleven last night.",
        "The mastermind was inside our unit all along?",
        "We have enough proof. End this here.",
      ],
      ja: [
        "調書14ページ、空白の時間のことだが。",
        "昨夜11時、あんたも現場にいたな？",
        "まさか黒幕が内部にいたというのか？",
        "証拠は揃った。ここで終わらせよう。",
      ],
    },
    bubbleShapes: ["monologue-box", "oval", "shout-burst", "whisper-dashed"],
    bubbleFontScales: ["md", "md", "lg", "sm"],
    sfxStamps: ["none", "pat", "kugugung", "none"],
    speakerTargets: ["protagonist", "protagonist", "partner", "protagonist"],
    cutCameraPresets: ["side-bust", "duo-wide", "dutch-left-bust", "front-face"],
    duoCasting: {
      partnerId: "shaper-thriller-detective",
      side: "right",
      distanceKey: "talk",
      stance: "arms-crossed",
      expression: "stern-glare",
      partnerHandPropId: "case-folder",
    },
  },
  {
    id: "director-campus-cafe",
    labelKo: "캠퍼스 카페 (진주 귀걸이·커피컵·비스트로)",
    summaryKo: "진주 귀걸이·골드 핀 + 로스터리 커피컵 + 카페 비스트로 테이블 + 순정 소프트 SDF + 로맨스 설렘 4컷 연기",
    handPropId: "coffee-cup",
    handSide: "rightHand",
    headPropId: "pearl-earrings-pin",
    stagePropId: "cafe-bistro-table",
    sfxStampId: "dugeun",
    toonShaderId: "romance-soft-sdf",
    actingArc: "arc-romance-flutter",
    fxLinesKind: "romance-sparkle",
    manuscriptMood: "daylight-paper",
    gutterPaces: ["standard", "standard", "dramatic-pause"],
    dialogueLines: [
      "혹시 아까부터 여기 앉아 있었어?",
      "네가 좋아하는 로스터리 원두로 골라 봤어.",
      "왜 자꾸 그렇게 가까이서 쳐다봐…",
      "오늘 오후는 천천히 같이 걷자.",
    ],
    dialogueByLocale: {
      ko: [
        "혹시 아까부터 여기 앉아 있었어?",
        "네가 좋아하는 로스터리 원두로 골라 봤어.",
        "왜 자꾸 그렇게 가까이서 쳐다봐…",
        "오늘 오후는 천천히 같이 걷자.",
      ],
      en: [
        "Have you been sitting here the whole time?",
        "I picked the roast blend you always liked.",
        "Why do you keep looking at me so closely...",
        "Let's walk home slowly this afternoon.",
      ],
      ja: [
        "もしかして、さっきからここにいたの？",
        "君が好きな焙煎豆を選んでみたんだ。",
        "どうしてそんな近くで見つめるの…",
        "今日の午後はゆっくり一緒に歩こう。",
      ],
    },
    bubbleShapes: ["oval", "oval", "whisper-dashed", "oval"],
    bubbleFontScales: ["md", "md", "sm", "md"],
    sfxStamps: ["none", "dugeun", "dugeun", "none"],
    speakerTargets: ["partner", "protagonist", "protagonist", "partner"],
    cutCameraPresets: ["low-full", "side-bust", "front-face", "high-bust"],
    duoCasting: {
      partnerId: "shaper-office-ceo",
      side: "right",
      distanceKey: "close",
      stance: "conversational",
      expression: "warm-smile",
      partnerHandPropId: "coffee-cup",
    },
  },
  {
    id: "director-murim-awakening",
    labelKo: "무협·헌터 각성 (전술 헤드셋·단검·검기 진법)",
    summaryKo: "전술 홀로그램 헤드셋 + 에테르 단검 + 무협 청운 검기 진법 + 하드 셀 3단 + 각성·결의 4컷 연기",
    handPropId: "aether-blade",
    handSide: "rightHand",
    headPropId: "tactical-headset",
    stagePropId: "murim-sword-aura",
    sfxStampId: "kugugung",
    toonShaderId: "action-hard-cel3",
    actingArc: "arc-awakening-climax",
    fxLinesKind: "speed-diagonal",
    manuscriptMood: "backlit-awakening",
    gutterPaces: ["compact", "compact", "cliffhanger"],
    dialogueLines: [
      "봉인된 청운의 검기가 다시 깨어난다.",
      "물러서라, 지금부터는 진검승부다.",
      "보인다, 모든 검로의 빈틈이.",
      "단 일검으로 승부를 매듭짓겠다.",
    ],
    dialogueByLocale: {
      ko: [
        "봉인된 청운의 검기가 다시 깨어난다.",
        "물러서라, 지금부터는 진검승부다.",
        "보인다, 모든 검로의 빈틈이.",
        "단 일검으로 승부를 매듭짓겠다.",
      ],
      en: [
        "The sealed azure sword aura awakens again.",
        "Step back. From here it is a real duel.",
        "I see every opening along your blade path.",
        "One single strike will settle this fight.",
      ],
      ja: [
        "封じられた青雲の剣気が再び目覚める。",
        "下がれ、ここからは真剣勝負だ。",
        "見える、すべての剣路の隙が。",
        "ただ一太刀で決着をつける。",
      ],
    },
    bubbleShapes: ["monologue-box", "oval", "shout-burst", "shout-burst"],
    bubbleFontScales: ["md", "md", "lg", "lg"],
    sfxStamps: ["seureung", "none", "kugugung", "seureung"],
    speakerTargets: ["protagonist", "partner", "protagonist", "protagonist"],
    cutCameraPresets: ["low-full", "duo-wide", "dutch-right-face", "dutch-left-bust"],
    duoCasting: {
      partnerId: "shaper-murim-swordmaster",
      side: "right",
      distanceKey: "wide",
      stance: "arms-crossed",
      expression: "stern-glare",
      partnerHandPropId: "jade-folding-fan",
    },
  },
  {
    id: "director-rooftop-twilight",
    labelKo: "옥상 황혼 독대 (헤드폰·스마트폰·옥상 난간)",
    summaryKo: "무선 네크 헤드폰 + 스마트폰 + 학원 옥상 안전 난간 + 황혼 3200K 무드 + 더치 틸트 진실 독대 4컷 연기",
    handPropId: "smartphone",
    handSide: "rightHand",
    headPropId: "studio-headphones",
    stagePropId: "rooftop-safety-railing",
    sfxStampId: "ssaa",
    toonShaderId: "illumination-rim",
    actingArc: "arc-thriller-shock",
    fxLinesKind: "speed-diagonal",
    manuscriptMood: "twilight-amber",
    gutterPaces: ["standard", "dramatic-pause", "cliffhanger"],
    dialogueLines: [
      "방과 후 옥상 난간, 발신자 미상의 음성 파일.",
      "학생회 서버에서 지워진 기록을 네가 갖고 있었군.",
      "이 녹음이 공개되면 학원 전체가 뒤집힐 거야.",
      "해가 지기 전에 선택해, 공범이 될지 증인이 될지.",
    ],
    dialogueByLocale: {
      ko: [
        "방과 후 옥상 난간, 발신자 미상의 음성 파일.",
        "학생회 서버에서 지워진 기록을 네가 갖고 있었군.",
        "이 녹음이 공개되면 학원 전체가 뒤집힐 거야.",
        "해가 지기 전에 선택해, 공범이 될지 증인이 될지.",
      ],
      en: [
        "Sunset on the roof, an unsigned audio file.",
        "So you kept the record erased from the council.",
        "If this recording leaks, the academy falls.",
        "Choose before sundown: accomplice or witness.",
      ],
      ja: [
        "放課後の屋上フェンス、差出人不明の音声。",
        "生徒会サーバーから消えた記録を持っていたのね。",
        "この録音が公開されれば学園中が覆るわ。",
        "日が沈む前に選んで、共犯か証人か。",
      ],
    },
    bubbleShapes: ["monologue-box", "oval", "shout-burst", "whisper-dashed"],
    bubbleFontScales: ["md", "md", "lg", "sm"],
    sfxStamps: ["ssaa", "none", "dugeun", "beonjjeok"],
    speakerTargets: ["protagonist", "partner", "protagonist", "partner"],
    cutCameraPresets: ["low-full", "duo-wide", "dutch-left-bust", "front-face"],
    duoCasting: {
      partnerId: "shaper-academy-council",
      side: "right",
      distanceKey: "talk",
      stance: "arms-crossed",
      expression: "stern-glare",
      partnerHandPropId: "smartphone",
    },
  },
  {
    id: "director-phantom-heist",
    labelKo: "괴도 달빛 예고장 (모노클·예고장·보석 진열대)",
    summaryKo: "실버 체인 모노클 + 실링왁스 예고장·장미 + 벨벳 보석 진열대 + 심야 7800K 달빛 무드 + 여유·역전 4컷 연기",
    handPropId: "calling-card-rose",
    handSide: "rightHand",
    headPropId: "silver-monocle",
    stagePropId: "velvet-display-pedestal",
    sfxStampId: "pat",
    toonShaderId: "illumination-rim",
    actingArc: "arc-confident-smirk",
    fxLinesKind: "focus-radial",
    manuscriptMood: "midnight-noir",
    gutterPaces: ["standard", "dramatic-pause", "cliffhanger"],
    dialogueLines: [
      "자정 정각, 예고한 푸른 사파이어를 거두러 왔습니다.",
      "보안 레이저를 전부 통과했다고? 거기 멈춰.",
      "진품은 이미 제 손안의 장미와 바뀌었거든요.",
      "다음 보름달 밤에 다시 뵙죠, 형사님.",
    ],
    dialogueByLocale: {
      ko: [
        "자정 정각, 예고한 푸른 사파이어를 거두러 왔습니다.",
        "보안 레이저를 전부 통과했다고? 거기 멈춰.",
        "진품은 이미 제 손안의 장미와 바뀌었거든요.",
        "다음 보름달 밤에 다시 뵙죠, 형사님.",
      ],
      en: [
        "Midnight sharp. I came for the star sapphire.",
        "You bypassed every laser grid? Freeze right there.",
        "The real gem already traded places with this rose.",
        "Until the next full moon, Detective.",
      ],
      ja: [
        "午前零時ちょうど、予告通り蒼玉を頂きに参上した。",
        "レーザー網を抜けたのか？そこから動くな。",
        "本物はすでに、この薔薇と入れ替わっているよ。",
        "次の満月の夜にまた会おう、刑事さん。",
      ],
    },
    bubbleShapes: ["monologue-box", "shout-burst", "oval", "whisper-dashed"],
    bubbleFontScales: ["md", "lg", "md", "sm"],
    sfxStamps: ["ssaa", "pat", "beonjjeok", "dugeun"],
    speakerTargets: ["protagonist", "partner", "protagonist", "protagonist"],
    cutCameraPresets: ["low-full", "duo-wide", "dutch-right-face", "high-bust"],
    duoCasting: {
      partnerId: "shaper-thriller-detective",
      side: "right",
      distanceKey: "talk",
      stance: "attentive",
      expression: "shocked",
      partnerHandPropId: "case-folder",
    },
  },
]);

export function findWebtoonSceneDirectorPreset(id: string): WebtoonSceneDirectorPreset | null {
  return WEBTOON_SCENE_DIRECTOR_PRESETS.find((item) => item.id === id) ?? null;
}

export function resolveDirectorShadingProfile(current: ShadingProfile, toonShaderId: ShaperToonShaderId): ShadingProfile {
  const matched = SHAPER_TOON_SHADER_PRESETS.find((item) => item.id === toonShaderId) ?? SHAPER_TOON_SHADER_PRESETS[0]!;
  return buildShaperToonShadingProfile(current, matched);
}

// ---------------------------------------------------------------- 뷰포트 ↔ 내보내기 패널 실시간 스트립 디렉터 세션

export interface StripDirectorState {
  readonly activeDirectorId: WebtoonSceneDirectorPresetId | "";
  readonly locale: WebtoonDialogueLocale;
  readonly jaWritingMode: WebtoonJaWritingMode;
  readonly manuscriptMood: WebtoonManuscriptMoodId;
  readonly gutterPaces: WebtoonStripGutterPaces;
  readonly actingArc: WebtoonStripActingArcId;
  readonly bakeStripFx: boolean;
  readonly stripFxLines: WebtoonStripFxLinesKind;
  readonly dialogueLines: WebtoonStripDialogueLines;
  readonly bubbleShapes: WebtoonStripBubbleShapes;
  readonly bubbleFontScales: WebtoonStripBubbleFontScales;
  readonly sfxStamps: WebtoonStripSfxStamps;
  readonly speakerTargets: WebtoonStripSpeakerTargets;
  readonly cutCameraPresets: WebtoonStripCutCameraPresets;
  readonly partnerSide: DuoPartnerSide;
  readonly includePsdMangaFx: boolean;
}

export interface StripDirectorSession {
  getState(): StripDirectorState;
  update(patch: Partial<StripDirectorState>): void;
  setLocale(locale: WebtoonDialogueLocale): void;
  setJaWritingMode(mode: WebtoonJaWritingMode): void;
  setManuscriptMood(mood: WebtoonManuscriptMoodId): void;
  setGutterPace(gapIndex: 0 | 1 | 2, paceId: WebtoonStripGutterPaceId): void;
  setDialogueLine(cutIndex: 0 | 1 | 2 | 3, text: string): void;
  setBubbleShape(cutIndex: 0 | 1 | 2 | 3, shape: WebtoonStripBubbleShape): void;
  setBubbleFontScale(cutIndex: 0 | 1 | 2 | 3, scale: WebtoonStripBubbleFontScale): void;
  setSfxStamp(cutIndex: 0 | 1 | 2 | 3, stamp: WebtoonSfxStampOption): void;
  setSpeakerTarget(cutIndex: 0 | 1 | 2 | 3, target: WebtoonStripSpeakerTarget): void;
  setCutCameraPreset(cutIndex: 0 | 1 | 2 | 3, presetId: WebtoonStripCutCameraPresetId): void;
  reset(): void;
  subscribe(listener: () => void): () => void;
}

export const INITIAL_STRIP_DIRECTOR_STATE: StripDirectorState = Object.freeze({
  activeDirectorId: "",
  locale: "ko",
  jaWritingMode: "horizontal",
  manuscriptMood: "daylight-paper",
  gutterPaces: DEFAULT_WEBTOON_STRIP_GUTTER_PACES,
  actingArc: "none",
  bakeStripFx: false,
  stripFxLines: "focus-radial",
  dialogueLines: DEFAULT_WEBTOON_STRIP_DIALOGUE_LINES,
  bubbleShapes: DEFAULT_WEBTOON_STRIP_BUBBLE_SHAPES,
  bubbleFontScales: DEFAULT_WEBTOON_STRIP_BUBBLE_FONT_SCALES,
  sfxStamps: DEFAULT_WEBTOON_STRIP_SFX_STAMPS,
  speakerTargets: DEFAULT_WEBTOON_STRIP_SPEAKER_TARGETS,
  cutCameraPresets: DEFAULT_WEBTOON_STRIP_CUT_CAMERA_PRESETS,
  partnerSide: "right",
  includePsdMangaFx: false,
});

function linesEqual(a: WebtoonStripDialogueLines, b: WebtoonStripDialogueLines): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

export function createStripDirectorSession(initial: Partial<StripDirectorState> = {}): StripDirectorSession {
  let state: StripDirectorState = { ...INITIAL_STRIP_DIRECTOR_STATE, ...initial };
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  return {
    getState: () => state,
    update(patch) {
      state = { ...state, ...patch };
      notify();
    },
    setLocale(nextLocale) {
      const activePreset = state.activeDirectorId ? findWebtoonSceneDirectorPreset(state.activeDirectorId) : null;
      const matchesPreset = activePreset
        ? linesEqual(state.dialogueLines, activePreset.dialogueByLocale[state.locale])
        : false;
      const matchesDefault = linesEqual(state.dialogueLines, DEFAULT_WEBTOON_STRIP_DIALOGUE_BY_LOCALE[state.locale]);
      const nextLines = matchesPreset && activePreset
        ? activePreset.dialogueByLocale[nextLocale]
        : matchesDefault
          ? DEFAULT_WEBTOON_STRIP_DIALOGUE_BY_LOCALE[nextLocale]
          : state.dialogueLines;
      state = { ...state, locale: nextLocale, dialogueLines: nextLines };
      notify();
    },
    setJaWritingMode(mode) {
      state = { ...state, jaWritingMode: mode };
      notify();
    },
    setManuscriptMood(mood) {
      state = { ...state, manuscriptMood: mood };
      notify();
    },
    setGutterPace(gapIndex, paceId) {
      const next: [WebtoonStripGutterPaceId, WebtoonStripGutterPaceId, WebtoonStripGutterPaceId] = [
        state.gutterPaces[0],
        state.gutterPaces[1],
        state.gutterPaces[2],
      ];
      next[gapIndex] = paceId;
      state = { ...state, gutterPaces: next };
      notify();
    },
    setDialogueLine(cutIndex, text) {
      const next: [string, string, string, string] = [
        state.dialogueLines[0],
        state.dialogueLines[1],
        state.dialogueLines[2],
        state.dialogueLines[3],
      ];
      next[cutIndex] = text;
      state = { ...state, dialogueLines: next };
      notify();
    },
    setBubbleShape(cutIndex, shape) {
      const next: [WebtoonStripBubbleShape, WebtoonStripBubbleShape, WebtoonStripBubbleShape, WebtoonStripBubbleShape] = [
        state.bubbleShapes[0],
        state.bubbleShapes[1],
        state.bubbleShapes[2],
        state.bubbleShapes[3],
      ];
      next[cutIndex] = shape;
      state = { ...state, bubbleShapes: next };
      notify();
    },
    setBubbleFontScale(cutIndex, scale) {
      const next: [WebtoonStripBubbleFontScale, WebtoonStripBubbleFontScale, WebtoonStripBubbleFontScale, WebtoonStripBubbleFontScale] = [
        state.bubbleFontScales[0],
        state.bubbleFontScales[1],
        state.bubbleFontScales[2],
        state.bubbleFontScales[3],
      ];
      next[cutIndex] = scale;
      state = { ...state, bubbleFontScales: next };
      notify();
    },
    setSfxStamp(cutIndex, stamp) {
      const next: [WebtoonSfxStampOption, WebtoonSfxStampOption, WebtoonSfxStampOption, WebtoonSfxStampOption] = [
        state.sfxStamps[0],
        state.sfxStamps[1],
        state.sfxStamps[2],
        state.sfxStamps[3],
      ];
      next[cutIndex] = stamp;
      state = { ...state, sfxStamps: next };
      notify();
    },
    setSpeakerTarget(cutIndex, target) {
      const next: [WebtoonStripSpeakerTarget, WebtoonStripSpeakerTarget, WebtoonStripSpeakerTarget, WebtoonStripSpeakerTarget] = [
        state.speakerTargets[0],
        state.speakerTargets[1],
        state.speakerTargets[2],
        state.speakerTargets[3],
      ];
      next[cutIndex] = target;
      state = { ...state, speakerTargets: next };
      notify();
    },
    setCutCameraPreset(cutIndex, presetId) {
      const next: [WebtoonStripCutCameraPresetId, WebtoonStripCutCameraPresetId, WebtoonStripCutCameraPresetId, WebtoonStripCutCameraPresetId] = [
        state.cutCameraPresets[0],
        state.cutCameraPresets[1],
        state.cutCameraPresets[2],
        state.cutCameraPresets[3],
      ];
      next[cutIndex] = presetId;
      state = { ...state, cutCameraPresets: next };
      notify();
    },
    reset() {
      state = INITIAL_STRIP_DIRECTOR_STATE;
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

let defaultStripDirectorSession: StripDirectorSession | null = null;

export function getDefaultStripDirectorSession(): StripDirectorSession {
  defaultStripDirectorSession ??= createStripDirectorSession();
  return defaultStripDirectorSession;
}

export interface ViewportSceneDirectorControlsProps {
  readonly engineReady: boolean;
  readonly busy: boolean;
  readonly activeDirectorId: WebtoonSceneDirectorPresetId | "";
  readonly duoPartnerActive?: boolean;
  readonly onSelectDirector: (presetId: WebtoonSceneDirectorPresetId | "") => void;
  readonly onCastDuoPartner?: () => void;
}

export function ViewportSceneDirectorControls({
  engineReady,
  busy,
  activeDirectorId,
  duoPartnerActive = false,
  onSelectDirector,
  onCastDuoPartner,
}: ViewportSceneDirectorControlsProps) {
  const activeSpec = activeDirectorId ? findWebtoonSceneDirectorPreset(activeDirectorId) : null;
  return (
    <span className="cl-viewport-group cl-viewport-director-cluster" role="group" aria-label="장르별 원클릭 씬 디렉터">
      <select
        className="cl-viewport-select"
        aria-label="원클릭 씬 디렉터 프리셋"
        data-testid="viewport-scene-director-select"
        value={activeDirectorId}
        disabled={!engineReady || busy}
        title={
          activeSpec
            ? `${activeSpec.labelKo}: ${activeSpec.summaryKo}`
            : "손 소품·머리 액세서리·배경 스테이지·툰 조명·4컷 연기 시퀀스·카메라 구도·스크롤 여백·다국어 대사를 한 번에 세팅합니다"
        }
        onChange={(event) => onSelectDirector(event.target.value as WebtoonSceneDirectorPresetId | "")}
      >
        <option value="">원클릭 씬 디렉터…</option>
        {WEBTOON_SCENE_DIRECTOR_PRESETS.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.labelKo}
          </option>
        ))}
      </select>
      {activeSpec && onCastDuoPartner ? (
        <button
          type="button"
          className="cl-viewport-button"
          data-testid="viewport-director-cast-duo"
          aria-pressed={duoPartnerActive}
          disabled={!engineReady || busy}
          title="선택한 장르 디렉터에 어울리는 3D 상대역 캐릭터·표정·전용 손소품·아이컨택 시선 교환과 4컷 발화자 배치를 한 번에 세팅합니다"
          onClick={onCastDuoPartner}
        >
          상대역 자동 캐스팅
        </button>
      ) : null}
    </span>
  );
}
