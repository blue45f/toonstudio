/**
 * 장르별 원클릭 풀세트 씬 디렉터 프리셋 카탈로그 (`viewport-scene-director-presets.ts`, Unslop 규약 준수):
 * - 로판 대관식 · 느와르 취조실 · 캠퍼스 카페 · 무협 각성 · 옥상 황혼 독대 · 괴도 달빛 예고장 · 법정/메디컬 진실 공방 · 아이돌 앙코르 무대 · 학원 코트 결승전 9대 웹툰 씬 디렉터
 */
import type { DuoPartnerSide, DuoShotDistanceKey } from "./viewport-duo-shot-guide";
import type {
  DuoPartnerExpressionPreset,
  DuoPartnerStance,
  HandPropId,
  HandPropSide,
  HeadPropId,
  SfxStampId,
  StagePropId,
} from "../../../contracts";
import type {
  WebtoonDialogueLocale,
  WebtoonManuscriptMoodId,
  WebtoonStripActingArcId,
  WebtoonStripBubbleFontScales,
  WebtoonStripBubbleShapes,
  WebtoonStripCutCameraPresets,
  WebtoonStripDialogueLines,
  WebtoonStripFxLinesKind,
  WebtoonStripGutterPaces,
  WebtoonStripScreentones,
  WebtoonStripSfxStamps,
  WebtoonStripSpeakerTargets,
} from "../../../export/webtoon-strip-composer";
import type { ShaperToonShaderId } from "../../../presets";

export type WebtoonSceneDirectorPresetId =
  | "director-rofan-coronation"
  | "director-noir-interrogation"
  | "director-campus-cafe"
  | "director-murim-awakening"
  | "director-rooftop-twilight"
  | "director-phantom-heist"
  | "director-legal-medical-tribunal"
  | "director-idol-encore-stage"
  | "director-varsity-court-rival";

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
  readonly screentones: WebtoonStripScreentones;
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
    screentones: ["rose-duotone-dots", "none", "rose-duotone-dots", "classic-ink-45"],
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
    screentones: ["shadow-fade-mono", "classic-ink-45", "cyan-noir-dots", "shadow-fade-mono"],
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
    screentones: ["none", "rose-duotone-dots", "rose-duotone-dots", "none"],
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
    screentones: ["cyan-noir-dots", "classic-ink-45", "cyan-noir-dots", "shadow-fade-mono"],
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
    screentones: ["rose-duotone-dots", "classic-ink-45", "shadow-fade-mono", "rose-duotone-dots"],
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
    screentones: ["cyan-noir-dots", "shadow-fade-mono", "classic-ink-45", "cyan-noir-dots"],
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
  {
    id: "director-legal-medical-tribunal",
    labelKo: "법정·메디컬 진실 공방 (안경·진단차트·의사봉 연단)",
    summaryKo: "메탈 라운드 안경 + 메디컬 진단 차트 + 법정 의사봉·증인석 연단 + 45° 정통 망점 스크린톤 + 진실 반박 4컷 연기",
    handPropId: "medical-chart-clipboard",
    handSide: "leftHand",
    headPropId: "wire-glasses",
    stagePropId: "courtroom-gavel-podium",
    sfxStampId: "kugugung",
    toonShaderId: "action-hard-cel3",
    actingArc: "arc-thriller-shock",
    fxLinesKind: "focus-radial",
    manuscriptMood: "daylight-paper",
    gutterPaces: ["compact", "dramatic-pause", "cliffhanger"],
    screentones: ["classic-ink-45", "shadow-fade-mono", "cyan-noir-dots", "classic-ink-45"],
    dialogueLines: [
      "재판장님, 수술실 활력징후 원본 차트를 제출합니다.",
      "이의 있습니다, 그 기록은 사전 승인되지 않았소.",
      "심전도 파형 3분 공백이 의료 과실의 결정적 증거입니다.",
      "의사봉이 내려치기 전에 진실부터 답하시죠.",
    ],
    dialogueByLocale: {
      ko: [
        "재판장님, 수술실 활력징후 원본 차트를 제출합니다.",
        "이의 있습니다, 그 기록은 사전 승인되지 않았소.",
        "심전도 파형 3분 공백이 의료 과실의 결정적 증거입니다.",
        "의사봉이 내려치기 전에 진실부터 답하시죠.",
      ],
      en: [
        "Your Honor, I submit the raw OR vitals chart.",
        "Objection. That record was never cleared.",
        "The three-minute ECG gap proves malpractice.",
        "Answer the truth before the gavel falls.",
      ],
      ja: [
        "裁判長、手術室の生体記録原本を提出します。",
        "異議あり、そのカルテは事前承認されていない。",
        "心電図の三分間の空白が決定的な証拠です。",
        "木槌が鳴る前に、真実をお答えください。",
      ],
    },
    bubbleShapes: ["monologue-box", "shout-burst", "shout-burst", "oval"],
    bubbleFontScales: ["md", "lg", "lg", "md"],
    sfxStamps: ["pat", "kugugung", "beonjjeok", "ssaa"],
    speakerTargets: ["protagonist", "partner", "protagonist", "protagonist"],
    cutCameraPresets: ["low-full", "duo-wide", "dutch-left-bust", "front-face"],
    duoCasting: {
      partnerId: "shaper-office-ceo",
      side: "right",
      distanceKey: "talk",
      stance: "arms-crossed",
      expression: "stern-glare",
      partnerHandPropId: "case-folder",
    },
  },
  {
    id: "director-idol-encore-stage",
    labelKo: "아이돌 앙코르 무대 (이어링·응원봉·스탠드마이크)",
    summaryKo: "진주 드롭 귀걸이 + 아이돌 프리즘 응원봉 + 콘서트 스탠드마이크·네온 링 + 역광 각성 무드 + 설렘 4컷 연기",
    handPropId: "idol-prism-lightstick",
    handSide: "rightHand",
    headPropId: "pearl-earrings-pin",
    stagePropId: "concert-spotlight-mic-stand",
    sfxStampId: "dugeun",
    toonShaderId: "illumination-rim",
    actingArc: "arc-romance-flutter",
    fxLinesKind: "romance-sparkle",
    manuscriptMood: "backlit-awakening",
    gutterPaces: ["compact", "dramatic-pause", "cliffhanger"],
    screentones: ["rose-duotone-dots", "none", "rose-duotone-dots", "cyan-noir-dots"],
    dialogueLines: [
      "조명이 꺼진 뒤에도 객석의 별빛은 멈추지 않아.",
      "마지막 곡, 센터 마이크는 네 자리야.",
      "이 무대를 위해 수천 번을 다시 불렀어.",
      "들리니? 우리 이름을 부르는 함성이.",
    ],
    dialogueByLocale: {
      ko: [
        "조명이 꺼진 뒤에도 객석의 별빛은 멈추지 않아.",
        "마지막 곡, 센터 마이크는 네 자리야.",
        "이 무대를 위해 수천 번을 다시 불렀어.",
        "들리니? 우리 이름을 부르는 함성이.",
      ],
      en: [
        "Even after blackout, the sea of lights shines on.",
        "Final encore. Center mic belongs to you tonight.",
        "I sang this bridge a thousand times for this moment.",
        "Can you hear the arena calling our name?",
      ],
      ja: [
        "照明が落ちても、客席の星明かりは消えない。",
        "最後のアンコール、センターマイクは君の場所よ。",
        "この舞台のために何千回も歌い直したんだ。",
        "聞こえる？私たちの名前を呼ぶ歓声が。",
      ],
    },
    bubbleShapes: ["monologue-box", "oval", "shout-burst", "oval"],
    bubbleFontScales: ["md", "md", "lg", "md"],
    sfxStamps: ["pat", "dugeun", "beonjjeok", "dugeun"],
    speakerTargets: ["protagonist", "partner", "protagonist", "protagonist"],
    cutCameraPresets: ["low-full", "duo-wide", "dutch-right-face", "front-face"],
    duoCasting: {
      partnerId: "shaper-cyber-idol",
      side: "right",
      distanceKey: "close",
      stance: "conversational",
      expression: "warm-smile",
      partnerHandPropId: "idol-prism-lightstick",
    },
  },
  {
    id: "director-varsity-court-rival",
    labelKo: "학원 코트 결승 라이벌전 (헤드폰·농구공·농구골대)",
    summaryKo: "청춘 무선 헤드폰 + 체전 에이스 농구공 + 체육관 농구 골대 + 하드 셀 3단 + 결승 버저비터 4컷 연기",
    handPropId: "varsity-basketball",
    handSide: "rightHand",
    headPropId: "studio-headphones",
    stagePropId: "court-hoop-stanchion",
    sfxStampId: "kugugung",
    toonShaderId: "action-hard-cel3",
    actingArc: "arc-awakening-climax",
    fxLinesKind: "speed-diagonal",
    manuscriptMood: "twilight-amber",
    gutterPaces: ["compact", "compact", "cliffhanger"],
    screentones: ["classic-ink-45", "none", "cyan-noir-dots", "shadow-fade-mono"],
    dialogueLines: [
      "4쿼터 종료 3초 전, 점수 차는 단 2점.",
      "더블팀 수비야, 여기서 슛을 던진다고?",
      "림 끝까지 궤적은 이미 머릿속에 그렸어.",
      "버저가 울리기 전에 승부를 뒤집는다.",
    ],
    dialogueByLocale: {
      ko: [
        "4쿼터 종료 3초 전, 점수 차는 단 2점.",
        "더블팀 수비야, 여기서 슛을 던진다고?",
        "림 끝까지 궤적은 이미 머릿속에 그렸어.",
        "버저가 울리기 전에 승부를 뒤집는다.",
      ],
      en: [
        "Three seconds left in the fourth, down by two.",
        "Through a double team? You are shooting from here?",
        "The arc to the rim is already locked in.",
        "Before the buzzer sounds, we flip this game.",
      ],
      ja: [
        "第4クォーター残り3秒、点差はわずか2点。",
        "ダブルチームの上から、ここで撃つ気か？",
        "リングまでの軌道はもう頭の中に描けている。",
        "ブザーが鳴る前に、勝負をひっくり返す。",
      ],
    },
    bubbleShapes: ["monologue-box", "shout-burst", "oval", "shout-burst"],
    bubbleFontScales: ["md", "lg", "md", "lg"],
    sfxStamps: ["ssaa", "pat", "beonjjeok", "kugugung"],
    speakerTargets: ["protagonist", "partner", "protagonist", "protagonist"],
    cutCameraPresets: ["low-full", "duo-wide", "dutch-right-face", "dutch-left-bust"],
    duoCasting: {
      partnerId: "shaper-atelier-male-lead",
      side: "right",
      distanceKey: "wide",
      stance: "attentive",
      expression: "cold-smirk",
      partnerHandPropId: "varsity-basketball",
    },
  },
]);
