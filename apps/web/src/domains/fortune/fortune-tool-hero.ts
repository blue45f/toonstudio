import { FORTUNE_TAB_ORDER, type FortuneTab } from "./fortune-page-data";

// 도구 하위 라우트(/fortune/<tool>)의 첫 장면(히어로) 콘텐츠.
// 도구의 이름·영문 제목·한 줄 설명은 FORTUNE_TAB_META가 정본이라 여기서 다시
// 정의하지 않고, 히어로 전용 말풍선·CTA·비주얼 종류만 도구별로 둔다.
// 착지 히어로(FortuneLunaHero)와 같은 루나 패널 문법을 쓰되, 이 파일의 값은
// 하위 라우트 전용이다.
export type FortuneToolVisualKind =
  | "today-sun"
  | "moon-phases"
  | "year-grid"
  | "zodiac-glyphs"
  | "five-elements"
  | "pair-rings"
  | "book-shelf"
  | "tarot-card";

export interface FortuneToolHeroContent {
  /** 루나 말풍선 — 이 도구가 무엇이고 어떻게 시작하는지 한두 문장. */
  readonly bubble: string;
  /** 캐릭터 선택 영역으로 이어지는 시작 CTA 문구. */
  readonly ctaLabel: string;
  /** 시작에 생년월일 입력이 필요한 도구인지 — 로컬 전용 고지와 저장 칩 표시에 쓴다. */
  readonly needsBirth: boolean;
  /** 상대 생년월일까지 필요한 도구인지(궁합). */
  readonly needsPartnerBirth: boolean;
  readonly visual: FortuneToolVisualKind;
}

export const FORTUNE_TOOL_HERO: Record<FortuneTab, FortuneToolHeroContent> = {
  today: {
    bubble: "오늘 하루의 기운을 캐릭터와 함께 먼저 엿봐요. 캐릭터를 고르면 바로 오늘의 컷을 펼쳐줄게요.",
    ctaLabel: "캐릭터 고르고 오늘 운세 보기",
    needsBirth: false,
    needsPartnerBirth: false,
    visual: "today-sun",
  },
  monthly: {
    bubble: "이번 달의 흐름과 테마를 읽는 운세예요. 캐릭터를 고른 뒤 생년월일을 알려주면 이달의 결을 펼쳐줄게요.",
    ctaLabel: "캐릭터 고르고 월간 운세 보기",
    needsBirth: true,
    needsPartnerBirth: false,
    visual: "moon-phases",
  },
  yearly: {
    bubble: "올해의 큰 흐름을 월별로 펼쳐 봐요. 캐릭터를 고른 뒤 생년월일을 알려주면 열두 달의 운세를 읽어줄게요.",
    ctaLabel: "캐릭터 고르고 연간 운세 보기",
    needsBirth: true,
    needsPartnerBirth: false,
    visual: "year-grid",
  },
  zodiac: {
    bubble: "생일만으로 정해지는 별자리 운세예요. 캐릭터를 고른 뒤 태어난 날을 알려주면 오늘의 별자리 기운을 읽어줄게요.",
    ctaLabel: "캐릭터 고르고 별자리 운세 보기",
    needsBirth: true,
    needsPartnerBirth: false,
    visual: "zodiac-glyphs",
  },
  saju: {
    bubble: "태어난 순간의 오행 균형으로 읽는 사주팔자예요. 캐릭터를 고른 뒤 생년월일을 알려주면 오행의 결을 펼쳐줄게요.",
    ctaLabel: "캐릭터 고르고 사주 보기",
    needsBirth: true,
    needsPartnerBirth: false,
    visual: "five-elements",
  },
  compatibility: {
    bubble: "두 사람의 기운이 얼마나 잘 맞는지 읽는 궁합이에요. 캐릭터를 고른 뒤 두 사람의 생년월일을 알려주세요.",
    ctaLabel: "캐릭터 고르고 궁합 보기",
    needsBirth: true,
    needsPartnerBirth: true,
    visual: "pair-rings",
  },
  prescription: {
    bubble: "요즘 마음에 걸리는 고민이 있나요? 캐릭터를 고르면 고민을 듣고, 지금의 나에게 어울리는 책을 처방해줘요.",
    ctaLabel: "캐릭터 고르고 처방 받기",
    needsBirth: false,
    needsPartnerBirth: false,
    visual: "book-shelf",
  },
  tarot: {
    bubble: "질문을 마음에 품고 카드를 고르는 타로 리딩이에요. 캐릭터를 고르면 바로 오늘의 카드를 펼칠 수 있어요.",
    ctaLabel: "캐릭터 고르고 타로 펼치기",
    needsBirth: false,
    needsPartnerBirth: false,
    visual: "tarot-card",
  },
};

// 별자리 비주얼용 글리프·이름 — core의 ZodiacSign.glyph와 같은 유니코드 기호를
// 장식 그리드로만 쓰고, 별자리 판정 자체는 core getZodiacSign이 담당한다.
export const FORTUNE_ZODIAC_GLYPHS: readonly { glyph: string; ko: string }[] = [
  { glyph: "♈", ko: "양자리" },
  { glyph: "♉", ko: "황소자리" },
  { glyph: "♊", ko: "쌍둥이자리" },
  { glyph: "♋", ko: "게자리" },
  { glyph: "♌", ko: "사자자리" },
  { glyph: "♍", ko: "처녀자리" },
  { glyph: "♎", ko: "천칭자리" },
  { glyph: "♏", ko: "전갈자리" },
  { glyph: "♐", ko: "사수자리" },
  { glyph: "♑", ko: "염소자리" },
  { glyph: "♒", ko: "물병자리" },
  { glyph: "♓", ko: "물고기자리" },
];

const FORTUNE_TOOL_TAB_SET: ReadonlySet<string> = new Set(FORTUNE_TAB_ORDER);

/**
 * /fortune/<tool> 경로에서 도구를 도출한다. 착지(/fortune)와 알 수 없는
 * 하위 경로는 null — 히어로를 붙이지 않는다는 뜻이다.
 */
export function fortuneToolFromPathname(pathname: string): FortuneTab | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 2 || segments[0] !== "fortune") return null;
  return FORTUNE_TOOL_TAB_SET.has(segments[1]) ? (segments[1] as FortuneTab) : null;
}
