/**
 * @캐릭터 바이블 기본 카탈로그 + 글로벌 20개국 원클릭 SFX 로컬라이징 프로필 카탈로그.
 */

export const GLOBAL_OST_PREMIERE_SPRITE_PATHS = {
  community: "/assets/studio/vibrant-sprites/emblem-community.webp",
  bubbleSfx: "/assets/studio/vibrant-sprites/tool-bubble-sfx.webp",
  gpen: "/assets/studio/vibrant-sprites/tool-gpen.webp",
  discover: "/assets/studio/vibrant-sprites/emblem-discover.webp",
} as const;

export type PaletteSwatchTokenId =
  | "indigo-night"
  | "crimson-cloak"
  | "ivory-lace"
  | "amber-gold"
  | "emerald-jade"
  | "slate-coat"
  | "rose-quartz"
  | "obsidian-ink";

export interface CharacterSignatureSwatch {
  readonly tokenId: PaletteSwatchTokenId;
  readonly roleKo: string;
  readonly colorNameKo: string;
  readonly oklchToken: string;
}

export interface CharacterProportionLock {
  readonly headToBodyRatio: number;
  readonly heightCm: number;
  readonly shoulderScale: number;
  readonly eyeSizeScale: number;
  readonly lockSummaryKo: string;
}

export interface CharacterBibleEntry {
  readonly id: string;
  readonly mentionHandle: string;
  readonly aliases: readonly string[];
  readonly displayNameKo: string;
  readonly roleKo: string;
  readonly hairColorKo: string;
  readonly hairStyleKo: string;
  readonly outfitSummaryKo: string;
  readonly signaturePalette: readonly CharacterSignatureSwatch[];
  readonly vrmAssetId: string;
  readonly proportionLock: CharacterProportionLock;
  readonly expressionGuardKo: string;
}

export type WritingDirection = "ltr" | "rtl";
export type WritingModeSpec = "horizontal-tb" | "vertical-rl";

export type GlobalLocaleCode =
  | "ko-KR"
  | "en-US"
  | "ja-JP"
  | "ar-SA"
  | "es-ES"
  | "fr-FR"
  | "de-DE"
  | "pt-BR"
  | "zh-TW"
  | "zh-CN"
  | "th-TH"
  | "id-ID"
  | "vi-VN"
  | "it-IT"
  | "tr-TR"
  | "pl-PL"
  | "ru-RU"
  | "hi-IN"
  | "ms-MY"
  | "he-IL";

export type SfxSoundCategory = "impact" | "whoosh" | "heartbeat" | "whisper";

export interface GlobalLocaleSfxProfile {
  readonly code: GlobalLocaleCode;
  readonly countryKo: string;
  readonly languageKo: string;
  readonly nativeName: string;
  readonly direction: WritingDirection;
  readonly writingMode: WritingModeSpec;
  readonly mirrorReadingOrder: boolean;
  readonly textExpansionFactor: number;
  readonly lineHeightMultiplier: number;
  readonly recommendedFontStackKo: string;
  readonly sfxStyleNoteKo: string;
  readonly sampleSfxMap: Readonly<Record<SfxSoundCategory, string>>;
}

export interface SfxBoundsPx {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SfxBubbleSourceItem {
  readonly id: string;
  readonly kind: "dialogue" | "handwritten-sfx";
  readonly sfxCategory?: SfxSoundCategory;
  readonly sourceTextKo: string;
  readonly boundsPx: SfxBoundsPx;
  readonly strokeOverlapRatio: number;
}

export const DEFAULT_CHARACTER_BIBLE_ENTRIES: readonly CharacterBibleEntry[] = [
  {
    id: "char-yujin",
    mentionHandle: "유진",
    aliases: ["이유진", "Yujin"],
    displayNameKo: "이유진",
    roleKo: "주인공 · 도시 이능력 수사관",
    hairColorKo: "딥 인디고 네이비",
    hairStyleKo: "눈썹 살짝 가리는 비대칭 레이어드 숏컷",
    outfitSummaryKo: "슬레이트 롱 트렌치코트 + 앰버 브로치 칼라 + 블랙 핑거리스 글러브",
    signaturePalette: [
      { tokenId: "indigo-night", roleKo: "머리카락", colorNameKo: "심야 남색", oklchToken: "oklch(0.36 0.11 264)" },
      { tokenId: "slate-coat", roleKo: "외투", colorNameKo: "먹회색 트렌치", oklchToken: "oklch(0.42 0.03 250)" },
      { tokenId: "amber-gold", roleKo: "포인트", colorNameKo: "호박 금장", oklchToken: "oklch(0.75 0.15 78)" },
    ],
    vrmAssetId: "vrm-hero-yujin-v2",
    proportionLock: {
      headToBodyRatio: 7.4,
      heightCm: 179,
      shoulderScale: 1.04,
      eyeSizeScale: 0.96,
      lockSummaryKo: "7.4등신 · 신장 179cm · 어깨 1.04x · 눈매 0.96x 고정",
    },
    expressionGuardKo: "냉정한 삼백안 각도 유지, 과장된 SD 변형 금지",
  },
  {
    id: "char-sera",
    mentionHandle: "세라",
    aliases: ["서세라", "Sera"],
    displayNameKo: "서세라",
    roleKo: "히로인 · 고문서 복원술사",
    hairColorKo: "로즈 쿼츠 실버",
    hairStyleKo: "허리까지 내려오는 하프업 웨이브 + 진주 리본",
    outfitSummaryKo: "아이보리 레이스 블라우스 + 크림슨 숏 케이프 + 금실 허리끈",
    signaturePalette: [
      { tokenId: "rose-quartz", roleKo: "머리카락", colorNameKo: "장미빛 은발", oklchToken: "oklch(0.78 0.09 10)" },
      { tokenId: "crimson-cloak", roleKo: "케이프", colorNameKo: "심홍 망토", oklchToken: "oklch(0.5 0.19 22)" },
      { tokenId: "ivory-lace", roleKo: "블라우스", colorNameKo: "상아 레이스", oklchToken: "oklch(0.93 0.02 88)" },
    ],
    vrmAssetId: "vrm-archivist-sera-v3",
    proportionLock: {
      headToBodyRatio: 7.0,
      heightCm: 164,
      shoulderScale: 0.92,
      eyeSizeScale: 1.08,
      lockSummaryKo: "7.0등신 · 신장 164cm · 어깨 0.92x · 눈매 1.08x 고정",
    },
    expressionGuardKo: "홍채 하이라이트 2점 고정, 진주 리본 좌측 위치 유지",
  },
  {
    id: "char-kai",
    mentionHandle: "카이",
    aliases: ["카이렌", "Kai"],
    displayNameKo: "카이렌",
    roleKo: "라이벌 · 길드 집행관",
    hairColorKo: "옵시디언 흑발 + 에메랄드 브릿지",
    hairStyleKo: "뒤로 넘긴 올백 + 한 가닥 앞머리",
    outfitSummaryKo: "에메랄드 안감 제복 코트 + 흑요석 견장 + 은빛 체인",
    signaturePalette: [
      { tokenId: "obsidian-ink", roleKo: "머리카락", colorNameKo: "흑요석 먹색", oklchToken: "oklch(0.24 0.02 260)" },
      { tokenId: "emerald-jade", roleKo: "안감·포인트", colorNameKo: "비취 에메랄드", oklchToken: "oklch(0.62 0.15 158)" },
      { tokenId: "amber-gold", roleKo: "견장", colorNameKo: "금속 브라스", oklchToken: "oklch(0.75 0.15 78)" },
    ],
    vrmAssetId: "vrm-rival-kai-v2",
    proportionLock: {
      headToBodyRatio: 7.8,
      heightCm: 186,
      shoulderScale: 1.12,
      eyeSizeScale: 0.9,
      lockSummaryKo: "7.8등신 · 신장 186cm · 어깨 1.12x · 눈매 0.90x 고정",
    },
    expressionGuardKo: "우측 눈썹 흉터 1.2cm 항상 보존, 턱선 각도 고정",
  },
  {
    id: "char-miho",
    mentionHandle: "미호",
    aliases: ["한미호", "Miho"],
    displayNameKo: "한미호",
    roleKo: "조력자 · 음향 엔지니어",
    hairColorKo: "앰버 허니 브라운",
    hairStyleKo: "짧은 보브컷 + 오버이어 헤드셋 상시 착용",
    outfitSummaryKo: "아이보리 후드 집업 + 인디고 카고 팬츠 + 스튜디오 목걸이 패스",
    signaturePalette: [
      { tokenId: "amber-gold", roleKo: "머리카락", colorNameKo: "꿀빛 갈색", oklchToken: "oklch(0.75 0.15 78)" },
      { tokenId: "ivory-lace", roleKo: "상의", colorNameKo: "크림 후드", oklchToken: "oklch(0.93 0.02 88)" },
      { tokenId: "indigo-night", roleKo: "하의", colorNameKo: "인디고 데님", oklchToken: "oklch(0.36 0.11 264)" },
    ],
    vrmAssetId: "vrm-sound-miho-v1",
    proportionLock: {
      headToBodyRatio: 6.6,
      heightCm: 158,
      shoulderScale: 0.9,
      eyeSizeScale: 1.12,
      lockSummaryKo: "6.6등신 · 신장 158cm · 어깨 0.90x · 눈매 1.12x 고정",
    },
    expressionGuardKo: "목에 건 헤드셋 실루엣 유지, 밝은 표정선 보존",
  },
];

export const GLOBAL_20_LOCALIZATION_LOCALES: readonly GlobalLocaleSfxProfile[] = [
  {
    code: "ko-KR", countryKo: "대한민국", languageKo: "한국어", nativeName: "한국어",
    direction: "ltr", writingMode: "horizontal-tb", mirrorReadingOrder: false,
    textExpansionFactor: 1.0, lineHeightMultiplier: 1.32,
    recommendedFontStackKo: "웹툰 원문 고딕·손글씨 브러시", sfxStyleNoteKo: "원본 기준선 유지",
    sampleSfxMap: { impact: "콰아앙!!", whoosh: "쉬이익—", heartbeat: "두근... 두근", whisper: "속닥..." },
  },
  {
    code: "en-US", countryKo: "미국·영미권", languageKo: "영어", nativeName: "English",
    direction: "ltr", writingMode: "horizontal-tb", mirrorReadingOrder: false,
    textExpansionFactor: 1.18, lineHeightMultiplier: 1.24,
    recommendedFontStackKo: "코믹 올캡스 세미볼드 · 다이내믹 브러시 SFX", sfxStyleNoteKo: "대문자 외곽선+하프톤 음영 조합",
    sampleSfxMap: { impact: "KRA-KOOM!!", whoosh: "FWOOSH—", heartbeat: "BA-DUMP...", whisper: "psst..." },
  },
  {
    code: "ja-JP", countryKo: "일본", languageKo: "일본어", nativeName: "日本語",
    direction: "ltr", writingMode: "vertical-rl", mirrorReadingOrder: false,
    textExpansionFactor: 0.92, lineHeightMultiplier: 1.38,
    recommendedFontStackKo: "안티크 세로쓰기(한자 고딕+가나 명조) · 가타카나 필압 SFX", sfxStyleNoteKo: "세로쓰기(vertical-rl) 말풍선 폭 축소·세로 신장",
    sampleSfxMap: { impact: "ドゴォォン!!", whoosh: "シュッ—", heartbeat: "ドクン…", whisper: "ヒソヒソ…" },
  },
  {
    code: "ar-SA", countryKo: "사우디·아랍권", languageKo: "아랍어", nativeName: "العربية",
    direction: "rtl", writingMode: "horizontal-tb", mirrorReadingOrder: true,
    textExpansionFactor: 1.15, lineHeightMultiplier: 1.42,
    recommendedFontStackKo: "아랍 모던 캘리그래피(연결형 보존) · 강약 붓글씨 SFX", sfxStyleNoteKo: "RTL 우→좌 읽기 순서 반전 및 말풍선 꼬리 미러링 필수",
    sampleSfxMap: { impact: "بوووم!!", whoosh: "وووش—", heartbeat: "دق... دق", whisper: "همس..." },
  },
  {
    code: "es-ES", countryKo: "스페인·중남미", languageKo: "스페인어", nativeName: "Español",
    direction: "ltr", writingMode: "horizontal-tb", mirrorReadingOrder: false,
    textExpansionFactor: 1.28, lineHeightMultiplier: 1.26,
    recommendedFontStackKo: "라틴 코믹 레터링(¡ ¿ 문장부호 대응)", sfxStyleNoteKo: "평균 문장 길이 +28% 확장으로 말풍선 폭 여유 확보",
    sampleSfxMap: { impact: "¡BUUUM!!", whoosh: "¡FUUUSH!", heartbeat: "BUM-BUM...", whisper: "shhh..." },
  },
  {
    code: "fr-FR", countryKo: "프랑스", languageKo: "프랑스어", nativeName: "Français",
    direction: "ltr", writingMode: "horizontal-tb", mirrorReadingOrder: false,
    textExpansionFactor: 1.26, lineHeightMultiplier: 1.28,
    recommendedFontStackKo: "방드데시네 손글씨 레터링(악상 기호 여유)", sfxStyleNoteKo: "느낌표 앞 좁은 공백·악상 상단 여백 확보",
    sampleSfxMap: { impact: "BRAOUM !!", whoosh: "FSHHH—", heartbeat: "BA-BOUM...", whisper: "chut..." },
  },
  {
    code: "de-DE", countryKo: "독일", languageKo: "독일어", nativeName: "Deutsch",
    direction: "ltr", writingMode: "horizontal-tb", mirrorReadingOrder: false,
    textExpansionFactor: 1.32, lineHeightMultiplier: 1.26,
    recommendedFontStackKo: "코믹 산스-프리 하이픈 대응 볼드", sfxStyleNoteKo: "장문 복합어 줄바꿈과 말풍선 +32% 가로 확장",
    sampleSfxMap: { impact: "KRACH-BUMM!!", whoosh: "ZISCH—", heartbeat: "POCH... POCH", whisper: "flüster..." },
  },
  {
    code: "pt-BR", countryKo: "브라질", languageKo: "포르투갈어", nativeName: "Português",
    direction: "ltr", writingMode: "horizontal-tb", mirrorReadingOrder: false,
    textExpansionFactor: 1.24, lineHeightMultiplier: 1.26,
    recommendedFontStackKo: "브라질 웹툰 라운드 볼드", sfxStyleNoteKo: "틸드·세디유 기호 잘림 방지 여백 적용",
    sampleSfxMap: { impact: "KABUUM!!", whoosh: "VUUUSH—", heartbeat: "TUM-TUM...", whisper: "psiu..." },
  },
  {
    code: "zh-TW", countryKo: "대만", languageKo: "중국어 번체", nativeName: "繁體中文",
    direction: "ltr", writingMode: "vertical-rl", mirrorReadingOrder: false,
    textExpansionFactor: 0.85, lineHeightMultiplier: 1.36,
    recommendedFontStackKo: "번체 흑체 세로쓰기 · 강필 효과음", sfxStyleNoteKo: "세로쓰기 기본, 문장부호 중앙 정렬 보정",
    sampleSfxMap: { impact: "轟隆隆!!", whoosh: "刷——", heartbeat: "撲通…", whisper: "窸窣…" },
  },
  {
    code: "zh-CN", countryKo: "중국", languageKo: "중국어 간체", nativeName: "简体中文",
    direction: "ltr", writingMode: "horizontal-tb", mirrorReadingOrder: false,
    textExpansionFactor: 0.84, lineHeightMultiplier: 1.32,
    recommendedFontStackKo: "간체 웹툰 헤이라운드 · 두꺼운 외곽선 SFX", sfxStyleNoteKo: "정보 밀도가 높아 말풍선 내부 여백을 균형 축소",
    sampleSfxMap: { impact: "轰隆!!", whoosh: "唰——", heartbeat: "扑通…", whisper: "嘀咕…" },
  },
  {
    code: "th-TH", countryKo: "태국", languageKo: "태국어", nativeName: "ไทย",
    direction: "ltr", writingMode: "horizontal-tb", mirrorReadingOrder: false,
    textExpansionFactor: 1.16, lineHeightMultiplier: 1.46,
    recommendedFontStackKo: "태국어 웹툰 라운드(3단 성조 부호 보호)", sfxStyleNoteKo: "상하 성조 결합으로 행간 1.46배 확장 필수",
    sampleSfxMap: { impact: "ตูมมม!!", whoosh: "ฟุ่บ—", heartbeat: "ตึกตัก...", whisper: "ซุบซิบ..." },
  },
  {
    code: "id-ID", countryKo: "인도네시아", languageKo: "인도네시아어", nativeName: "Bahasa Indonesia",
    direction: "ltr", writingMode: "horizontal-tb", mirrorReadingOrder: false,
    textExpansionFactor: 1.2, lineHeightMultiplier: 1.25,
    recommendedFontStackKo: "모바일 친화 코믹 고딕", sfxStyleNoteKo: "반복 의성어 강조 스트로크",
    sampleSfxMap: { impact: "DUAAAR!!", whoosh: "WUUUSH—", heartbeat: "DEG-DEG...", whisper: "bisik..." },
  },
  {
    code: "vi-VN", countryKo: "베트남", languageKo: "베트남어", nativeName: "Tiếng Việt",
    direction: "ltr", writingMode: "horizontal-tb", mirrorReadingOrder: false,
    textExpansionFactor: 1.19, lineHeightMultiplier: 1.38,
    recommendedFontStackKo: "베트남어 이중 성조 대응 웹툰 볼드", sfxStyleNoteKo: "이중 발음구별기호 상단 크롭 방지",
    sampleSfxMap: { impact: "ẦM ẦM!!", whoosh: "VÙUU—", heartbeat: "THÌNH THỊCH...", whisper: "xì xào..." },
  },
  {
    code: "it-IT", countryKo: "이탈리아", languageKo: "이탈리아어", nativeName: "Italiano",
    direction: "ltr", writingMode: "horizontal-tb", mirrorReadingOrder: false,
    textExpansionFactor: 1.22, lineHeightMultiplier: 1.26,
    recommendedFontStackKo: "유럽 코믹 레터링 볼드", sfxStyleNoteKo: "말풍선 좌우 패딩 확대",
    sampleSfxMap: { impact: "SBAAAM!!", whoosh: "SWOOSH—", heartbeat: "TU-TUM...", whisper: "bisbiglio..." },
  },
  {
    code: "tr-TR", countryKo: "튀르키예", languageKo: "튀르키예어", nativeName: "Türkçe",
    direction: "ltr", writingMode: "horizontal-tb", mirrorReadingOrder: false,
    textExpansionFactor: 1.18, lineHeightMultiplier: 1.28,
    recommendedFontStackKo: "라틴 확장(İ/ı/Ğ/Ş) 코믹 서체", sfxStyleNoteKo: "점 있는 대문자 İ 정확도 검수",
    sampleSfxMap: { impact: "GÜÜÜM!!", whoosh: "VUUUŞ—", heartbeat: "GÜM-GÜM...", whisper: "fısıltı..." },
  },
  {
    code: "pl-PL", countryKo: "폴란드", languageKo: "폴란드어", nativeName: "Polski",
    direction: "ltr", writingMode: "horizontal-tb", mirrorReadingOrder: false,
    textExpansionFactor: 1.25, lineHeightMultiplier: 1.28,
    recommendedFontStackKo: "중유럽 코믹 서체(Ł/Ż/Ć 지원)", sfxStyleNoteKo: "자음군 가독성 확보 위해 자간 +0.02em",
    sampleSfxMap: { impact: "ŁUBUDU!!", whoosh: "ŚWIST—", heartbeat: "ŁUP-ŁUP...", whisper: "szept..." },
  },
  {
    code: "ru-RU", countryKo: "러시아·CIS", languageKo: "러시아어", nativeName: "Русский",
    direction: "ltr", writingMode: "horizontal-tb", mirrorReadingOrder: false,
    textExpansionFactor: 1.24, lineHeightMultiplier: 1.3,
    recommendedFontStackKo: "키릴 웹툰 컴팩트 볼드", sfxStyleNoteKo: "키릴 대문자 폭이 넓어 말풍선 가로 +24% 보정",
    sampleSfxMap: { impact: "БА-БАХ!!", whoosh: "ВЖУХ—", heartbeat: "ТУК-ТУК...", whisper: "шёпот..." },
  },
  {
    code: "hi-IN", countryKo: "인도", languageKo: "힌디어", nativeName: "हिन्दी",
    direction: "ltr", writingMode: "horizontal-tb", mirrorReadingOrder: false,
    textExpansionFactor: 1.17, lineHeightMultiplier: 1.4,
    recommendedFontStackKo: "데바나가리 웹툰 볼드(시로레카 연결선 유지)", sfxStyleNoteKo: "상단 수평선과 모음 기호 행간 1.4x 보장",
    sampleSfxMap: { impact: "धड़ााम!!", whoosh: "सन्न—", heartbeat: "धक-धक...", whisper: "फुसफुसाहट..." },
  },
  {
    code: "ms-MY", countryKo: "말레이시아", languageKo: "말레이어", nativeName: "Bahasa Melayu",
    direction: "ltr", writingMode: "horizontal-tb", mirrorReadingOrder: false,
    textExpansionFactor: 1.19, lineHeightMultiplier: 1.25,
    recommendedFontStackKo: "동남아 라틴 코믹 볼드", sfxStyleNoteKo: "말풍선 중앙 균형 조판",
    sampleSfxMap: { impact: "DENTUM!!", whoosh: "DESIR—", heartbeat: "DUP-DAP...", whisper: "bisik..." },
  },
  {
    code: "he-IL", countryKo: "이스라엘", languageKo: "히브리어", nativeName: "עברית",
    direction: "rtl", writingMode: "horizontal-tb", mirrorReadingOrder: true,
    textExpansionFactor: 1.08, lineHeightMultiplier: 1.34,
    recommendedFontStackKo: "히브리 모던 코믹 볼드", sfxStyleNoteKo: "RTL 우→좌 컷 순서 반전 및 말풍선 좌표 미러링",
    sampleSfxMap: { impact: "בווום!!", whoosh: "וווש—", heartbeat: "דופק...", whisper: "לחישה..." },
  },
];

export const DEFAULT_SFX_REPAINT_SOURCES: readonly SfxBubbleSourceItem[] = [
  {
    id: "sfx-1",
    kind: "handwritten-sfx",
    sfxCategory: "impact",
    sourceTextKo: "콰아앙!!",
    boundsPx: { x: 110, y: 240, width: 320, height: 150 },
    strokeOverlapRatio: 0.62,
  },
  {
    id: "dlg-1",
    kind: "dialogue",
    sourceTextKo: "지금 당장 물러서, @유진! 방어막이 버티지 못해!",
    boundsPx: { x: 420, y: 460, width: 280, height: 140 },
    strokeOverlapRatio: 0.08,
  },
  {
    id: "sfx-2",
    kind: "handwritten-sfx",
    sfxCategory: "heartbeat",
    sourceTextKo: "두근... 두근",
    boundsPx: { x: 80, y: 780, width: 220, height: 96 },
    strokeOverlapRatio: 0.34,
  },
];
