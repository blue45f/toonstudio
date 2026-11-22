/**
 * 한국어→영어/일본어 의성어·의태어 문화권 대체 사전 (36개 핵심 웹툰 표현 · ₩0 온디바이스).
 */

export type SfxCategory =
  | "emotion"
  | "impact"
  | "motion"
  | "ambient"
  | "comedy"
  | "horror"
  | "footstep"
  | "device";

export interface SfxCulturalEntry {
  readonly id: string;
  readonly korean: string;
  readonly koreanVariants: readonly string[];
  readonly category: SfxCategory;
  readonly meaningKo: string;
  readonly english: string;
  readonly englishAlternatives: readonly string[];
  readonly japanese: string;
  readonly japaneseAlternatives: readonly string[];
  readonly romaji: string;
  readonly visualEnergy: "quiet" | "medium" | "explosive";
}

export interface SfxCulturalMatch {
  readonly query: string;
  readonly entry: SfxCulturalEntry;
  readonly matchMode: "exact" | "variant" | "substring";
}

export interface SfxInlineAdaptation {
  readonly matchedKorean: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly entry: SfxCulturalEntry;
  readonly english: string;
  readonly japanese: string;
}

export const SFX_CULTURAL_DICTIONARY: readonly SfxCulturalEntry[] = Object.freeze([
  {
    id: "sfx-dugeun",
    korean: "두근",
    koreanVariants: ["두근", "두근두근", "두근거려"],
    category: "emotion",
    meaningKo: "심장 박동·설렘·긴장",
    english: "ba-dump",
    englishAlternatives: ["thump-thump", "badump"],
    japanese: "ドキッ",
    japaneseAlternatives: ["ドキドキ"],
    romaji: "doki",
    visualEnergy: "medium",
  },
  {
    id: "sfx-kung",
    korean: "쿵",
    koreanVariants: ["쿵", "쿠웅", "쿵쿵"],
    category: "impact",
    meaningKo: "무거운 충격·바닥 울림",
    english: "THUD",
    englishAlternatives: ["BOOM", "WHAM"],
    japanese: "ドンッ",
    japaneseAlternatives: ["ドスン"],
    romaji: "don",
    visualEnergy: "explosive",
  },
  {
    id: "sfx-kwang",
    korean: "쾅",
    koreanVariants: ["쾅", "쿠앙", "콰앙"],
    category: "impact",
    meaningKo: "문 닫힘·강한 타격·폭발",
    english: "SLAM",
    englishAlternatives: ["BANG", "CRASH"],
    japanese: "バンッ",
    japaneseAlternatives: ["バタンッ"],
    romaji: "ban",
    visualEnergy: "explosive",
  },
  {
    id: "sfx-peok",
    korean: "퍽",
    koreanVariants: ["퍽", "퍼억"],
    category: "impact",
    meaningKo: "둔탁한 가격·주먹 타격",
    english: "WHACK",
    englishAlternatives: ["POW", "SMACK"],
    japanese: "ボカッ",
    japaneseAlternatives: ["ゴツッ"],
    romaji: "boka",
    visualEnergy: "explosive",
  },
  {
    id: "sfx-jjak",
    korean: "짝",
    koreanVariants: ["짝", "찰싹", "짝!"],
    category: "impact",
    meaningKo: "손바닥 타격·박수",
    english: "SLAP",
    englishAlternatives: ["CLAP", "SMACK"],
    japanese: "パチン",
    japaneseAlternatives: ["ピシャッ"],
    romaji: "pachin",
    visualEnergy: "explosive",
  },
  {
    id: "sfx-cheolkeok",
    korean: "철컥",
    koreanVariants: ["철컥", "달칵", "찰칵"],
    category: "device",
    meaningKo: "잠금장치·총기·카메라 기계음",
    english: "CLICK",
    englishAlternatives: ["CLACK", "SNAP"],
    japanese: "カチャッ",
    japaneseAlternatives: ["ガチャッ"],
    romaji: "kacha",
    visualEnergy: "medium",
  },
  {
    id: "sfx-kkiiik",
    korean: "끼이익",
    koreanVariants: ["끼이익", "끼익", "삐걱"],
    category: "horror",
    meaningKo: "녹슨 문·경첩 삐걱거림",
    english: "CREAK",
    englishAlternatives: ["SCREECH", "GROAN"],
    japanese: "ギィィ…",
    japaneseAlternatives: ["キィィ"],
    romaji: "giii",
    visualEnergy: "quiet",
  },
  {
    id: "sfx-ureureung",
    korean: "우르릉",
    koreanVariants: ["우르릉", "쿠르릉", "우르르"],
    category: "ambient",
    meaningKo: "천둥·지진·원거리 진동",
    english: "RUMBLE",
    englishAlternatives: ["KRAAKOOM", "GRUMBLE"],
    japanese: "ゴロゴロ",
    japaneseAlternatives: ["ゴゴゴ"],
    romaji: "gorogoro",
    visualEnergy: "explosive",
  },
  {
    id: "sfx-beonjjeok",
    korean: "번쩍",
    koreanVariants: ["번쩍", "번뜩"],
    category: "motion",
    meaningKo: "섬광·번개·눈빛 번뜩임",
    english: "FLASH",
    englishAlternatives: ["GLINT", "ZAP"],
    japanese: "ピカッ",
    japaneseAlternatives: ["ギラッ"],
    romaji: "pika",
    visualEnergy: "explosive",
  },
  {
    id: "sfx-hwiing",
    korean: "휘잉",
    koreanVariants: ["휘잉", "휘이잉", "쌩"],
    category: "ambient",
    meaningKo: "찬 바람·공허한 기류",
    english: "WHOOSH",
    englishAlternatives: ["HWOOO", "GUST"],
    japanese: "ヒューッ",
    japaneseAlternatives: ["ビューッ"],
    romaji: "hyuu",
    visualEnergy: "medium",
  },
  {
    id: "sfx-jureureuk",
    korean: "주르륵",
    koreanVariants: ["주르륵", "주륵", "줄줄"],
    category: "emotion",
    meaningKo: "눈물·땀·물방울 흘러내림",
    english: "DRIP",
    englishAlternatives: ["TRICKLE", "STREAM"],
    japanese: "タラッ",
    japaneseAlternatives: ["ポロポロ"],
    romaji: "tara",
    visualEnergy: "quiet",
  },
  {
    id: "sfx-ttukttuk",
    korean: "뚝뚝",
    koreanVariants: ["뚝뚝", "똑똑"],
    category: "ambient",
    meaningKo: "물방울 낙하·눈물 떨어짐",
    english: "PLIP-PLOP",
    englishAlternatives: ["DRIP-DROP", "PLOP"],
    japanese: "ポタポタ",
    japaneseAlternatives: ["ポツン"],
    romaji: "potapota",
    visualEnergy: "quiet",
  },
  {
    id: "sfx-sswaa",
    korean: "쏴아",
    koreanVariants: ["쏴아", "쏴아아", "주룩주룩"],
    category: "ambient",
    meaningKo: "폭우·소나기·파도 소리",
    english: "POUR",
    englishAlternatives: ["SHHHH", "SPLASH"],
    japanese: "ザーッ",
    japaneseAlternatives: ["ザァァ"],
    romaji: "zaaa",
    visualEnergy: "medium",
  },
  {
    id: "sfx-hwareureuk",
    korean: "화르륵",
    koreanVariants: ["화르륵", "활활", "후욱"],
    category: "impact",
    meaningKo: "불길이 솟구치는 소리",
    english: "FWOOSH",
    englishAlternatives: ["ROAR", "WHOOSH"],
    japanese: "ボワッ",
    japaneseAlternatives: ["ゴォォ"],
    romaji: "bowa",
    visualEnergy: "explosive",
  },
  {
    id: "sfx-chiiik",
    korean: "치이익",
    koreanVariants: ["치이익", "치익", "지글지글"],
    category: "ambient",
    meaningKo: "뜨거운 철판·증기·요리 지글거림",
    english: "SIZZLE",
    englishAlternatives: ["HISS", "PSSSH"],
    japanese: "ジュワッ",
    japaneseAlternatives: ["シューッ"],
    romaji: "juwa",
    visualEnergy: "medium",
  },
  {
    id: "sfx-wajangchang",
    korean: "와장창",
    koreanVariants: ["와장창", "쨍그랑", "와르르"],
    category: "impact",
    meaningKo: "유리·접시 파손",
    english: "CRASH",
    englishAlternatives: ["SHATTER", "SMASH"],
    japanese: "ガシャンッ",
    japaneseAlternatives: ["パリーン"],
    romaji: "gashan",
    visualEnergy: "explosive",
  },
  {
    id: "sfx-baseurak",
    korean: "바스락",
    koreanVariants: ["바스락", "부스럭", "사락"],
    category: "ambient",
    meaningKo: "낙엽·옷깃·종이 스치는 소리",
    english: "RUSTLE",
    englishAlternatives: ["SHUFFLE", "CRINKLE"],
    japanese: "カサッ",
    japaneseAlternatives: ["ガサゴソ"],
    romaji: "kasa",
    visualEnergy: "quiet",
  },
  {
    id: "sfx-sagaksagak",
    korean: "사각사각",
    koreanVariants: ["사각사각", "사각", "쓰윽쓰윽"],
    category: "ambient",
    meaningKo: "연필·펜선 필기 소리",
    english: "SCRATCH-SCRATCH",
    englishAlternatives: ["SCRIBBLE", "SHK-SHK"],
    japanese: "サラサラ",
    japaneseAlternatives: ["カリカリ"],
    romaji: "sarasara",
    visualEnergy: "quiet",
  },
  {
    id: "sfx-teobeok",
    korean: "터벅터벅",
    koreanVariants: ["터벅터벅", "터벅", "뚜벅뚜벅"],
    category: "footstep",
    meaningKo: "무겁거나 지친 발걸음",
    english: "TRUDGE",
    englishAlternatives: ["CLOMP-CLOMP", "STEP-STEP"],
    japanese: "トボトボ",
    japaneseAlternatives: ["コツコツ"],
    romaji: "tobotobo",
    visualEnergy: "quiet",
  },
  {
    id: "sfx-tadak",
    korean: "타닥타닥",
    koreanVariants: ["타닥타닥", "다다닥", "타다닥"],
    category: "footstep",
    meaningKo: "빠른 달리기·키보드 연타",
    english: "PATTER",
    englishAlternatives: ["TAP-TAP-TAP", "DASH"],
    japanese: "タタタッ",
    japaneseAlternatives: ["ダダダッ"],
    romaji: "tatata",
    visualEnergy: "medium",
  },
  {
    id: "sfx-hwicheong",
    korean: "휘청",
    koreanVariants: ["휘청", "비틀", "휘청휘청"],
    category: "motion",
    meaningKo: "몸의 중심을 잃고 비틀거림",
    english: "STAGGER",
    englishAlternatives: ["WOBBLE", "SWAY"],
    japanese: "フラッ",
    japaneseAlternatives: ["よろっ"],
    romaji: "fura",
    visualEnergy: "medium",
  },
  {
    id: "sfx-beoltteok",
    korean: "벌떡",
    koreanVariants: ["벌떡", "화들짝"],
    category: "motion",
    meaningKo: "자리에서 급히 일어남",
    english: "SPRING UP",
    englishAlternatives: ["JOLT", "SHOOT UP"],
    japanese: "ガバッ",
    japaneseAlternatives: ["バッ"],
    romaji: "gaba",
    visualEnergy: "explosive",
  },
  {
    id: "sfx-umjjil",
    korean: "움찔",
    koreanVariants: ["움찔", "흠칫", "깜짝"],
    category: "emotion",
    meaningKo: "놀라서 몸이 굳거나 움츠러듦",
    english: "FLINCH",
    englishAlternatives: ["TWITCH", "JOLT"],
    japanese: "ビクッ",
    japaneseAlternatives: ["ギクッ"],
    romaji: "biku",
    visualEnergy: "medium",
  },
  {
    id: "sfx-bureureu",
    korean: "부르르",
    koreanVariants: ["부르르", "바르르"],
    category: "emotion",
    meaningKo: "분노·추위·긴장으로 떨림",
    english: "SHIVER",
    englishAlternatives: ["QUIVER", "TREMBLE"],
    japanese: "ブルブル",
    japaneseAlternatives: ["プルプル"],
    romaji: "buruburu",
    visualEnergy: "medium",
  },
  {
    id: "sfx-deoldeol",
    korean: "덜덜",
    koreanVariants: ["덜덜", "덜덜덜", "후들후들"],
    category: "horror",
    meaningKo: "공포·오한으로 극심하게 떨림",
    english: "TREMBLE",
    englishAlternatives: ["SHAKE-SHAKE", "CHATTER"],
    japanese: "ガタガタ",
    japaneseAlternatives: ["ガクブル"],
    romaji: "gatagata",
    visualEnergy: "medium",
  },
  {
    id: "sfx-ssik",
    korean: "씨익",
    koreanVariants: ["씨익", "씩", "피식"],
    category: "comedy",
    meaningKo: "비웃음·자신감 있는 미소",
    english: "SMIRK",
    englishAlternatives: ["GRIN", "HEH"],
    japanese: "ニヤッ",
    japaneseAlternatives: ["フッ"],
    romaji: "niya",
    visualEnergy: "quiet",
  },
  {
    id: "sfx-puheup",
    korean: "푸흡",
    koreanVariants: ["푸흡", "풉", "푸핫"],
    category: "comedy",
    meaningKo: "웃음을 참다 터뜨림",
    english: "PFFT",
    englishAlternatives: ["SNORT", "BWAHA"],
    japanese: "プッ",
    japaneseAlternatives: ["ブフォッ"],
    romaji: "pu",
    visualEnergy: "medium",
  },
  {
    id: "sfx-haa",
    korean: "하아",
    koreanVariants: ["하아", "후우", "휴우"],
    category: "emotion",
    meaningKo: "깊은 한숨·안도",
    english: "SIGH",
    englishAlternatives: ["PHEW", "EXHALE"],
    japanese: "ハァ…",
    japaneseAlternatives: ["フゥ…"],
    romaji: "haa",
    visualEnergy: "quiet",
  },
  {
    id: "sfx-kkulkkeok",
    korean: "꿀꺽",
    koreanVariants: ["꿀꺽", "꼴깍"],
    category: "emotion",
    meaningKo: "긴장해 마른침을 삼킴",
    english: "GULP",
    englishAlternatives: ["SWALLOW"],
    japanese: "ゴクッ",
    japaneseAlternatives: ["ゴクリ"],
    romaji: "goku",
    visualEnergy: "quiet",
  },
  {
    id: "sfx-kkoreureuk",
    korean: "꼬르륵",
    koreanVariants: ["꼬르륵", "꾸르륵"],
    category: "comedy",
    meaningKo: "배고파서 배에서 나는 소리",
    english: "GROWL",
    englishAlternatives: ["GRUMBLE", "RUMBLE"],
    japanese: "グゥー",
    japaneseAlternatives: ["ギュルル"],
    romaji: "guuu",
    visualEnergy: "quiet",
  },
  {
    id: "sfx-ttiring",
    korean: "띠링",
    koreanVariants: ["띠링", "까톡", "딩동"],
    category: "device",
    meaningKo: "스마트폰 메시지·상태창 알림",
    english: "DING",
    englishAlternatives: ["PING", "CHIME"],
    japanese: "ピロン",
    japaneseAlternatives: ["ピンポーン"],
    romaji: "piron",
    visualEnergy: "medium",
  },
  {
    id: "sfx-jiing",
    korean: "지잉",
    koreanVariants: ["지잉", "부우웅", "위잉"],
    category: "device",
    meaningKo: "휴대폰 진동·이명·기계 작동음",
    english: "BZZZT",
    englishAlternatives: ["VRRR", "HUMMM"],
    japanese: "ブブッ",
    japaneseAlternatives: ["ジィィ"],
    romaji: "bubu",
    visualEnergy: "medium",
  },
  {
    id: "sfx-sseuk",
    korean: "스윽",
    koreanVariants: ["스윽", "쓱", "스르륵"],
    category: "motion",
    meaningKo: "소리 없이 다가서거나 꺼내는 움직임",
    english: "SLIDE",
    englishAlternatives: ["GLIDE", "SLIP"],
    japanese: "スッ",
    japaneseAlternatives: ["スーッ"],
    romaji: "su",
    visualEnergy: "quiet",
  },
  {
    id: "sfx-hwik",
    korean: "휙",
    koreanVariants: ["휙", "휘익", "쉭"],
    category: "motion",
    meaningKo: "칼·물체·고개를 재빠르게 돌림",
    english: "SWISH",
    englishAlternatives: ["WHIP", "FWIP"],
    japanese: "シュッ",
    japaneseAlternatives: ["ビュッ"],
    romaji: "shu",
    visualEnergy: "explosive",
  },
  {
    id: "sfx-banjjak",
    korean: "반짝",
    koreanVariants: ["반짝", "반짝반짝", "샤방"],
    category: "emotion",
    meaningKo: "눈빛·보석·마법 반짝임",
    english: "SPARKLE",
    englishAlternatives: ["TWINKLE", "GLITTER"],
    japanese: "キラキラ",
    japaneseAlternatives: ["キラッ"],
    romaji: "kirakira",
    visualEnergy: "medium",
  },
  {
    id: "sfx-ssaneul",
    korean: "싸늘",
    koreanVariants: ["싸늘", "서늘", "오싹"],
    category: "horror",
    meaningKo: "등골이 서늘한 공포·살기",
    english: "CHILL",
    englishAlternatives: ["SHUDDER", "CREEP"],
    japanese: "ゾクッ",
    japaneseAlternatives: ["ヒヤッ"],
    romaji: "zoku",
    visualEnergy: "quiet",
  },
]);

/** 한국어 의성어·의태어를 영어/일본어 문화권 SFX로 조회한다. */
export function lookupSfxCulturalAdaptation(koreanExpr: string): SfxCulturalMatch | null {
  const cleaned = koreanExpr.trim().replace(/[!?.…~]+$/gu, "");
  if (!cleaned) return null;

  for (const entry of SFX_CULTURAL_DICTIONARY) {
    if (entry.korean === cleaned) {
      return Object.freeze({ query: koreanExpr, entry, matchMode: "exact" });
    }
  }
  for (const entry of SFX_CULTURAL_DICTIONARY) {
    if (entry.koreanVariants.includes(cleaned)) {
      return Object.freeze({ query: koreanExpr, entry, matchMode: "variant" });
    }
  }
  let bestEntry: SfxCulturalEntry | null = null;
  let bestLen = 0;
  for (const entry of SFX_CULTURAL_DICTIONARY) {
    for (const variant of entry.koreanVariants) {
      if (variant.length >= 2 && cleaned.includes(variant) && variant.length > bestLen) {
        bestLen = variant.length;
        bestEntry = entry;
      }
    }
  }
  return bestEntry
    ? Object.freeze({ query: koreanExpr, entry: bestEntry, matchMode: "substring" })
    : null;
}

/** 본문/대본 텍스트에 포함된 한국어 의성어·의태어를 탐지해 영어/일본어 문화권 대체안을 반환한다. */
export function extractAndTranslateSfxInText(text: string): readonly SfxInlineAdaptation[] {
  if (!text.trim()) return Object.freeze([]);
  const candidates: SfxInlineAdaptation[] = [];

  for (const entry of SFX_CULTURAL_DICTIONARY) {
    const variants = [...entry.koreanVariants].sort((a, b) => b.length - a.length);
    for (const variant of variants) {
      if (variant.length < 2) continue;
      let cursor = 0;
      while (cursor < text.length) {
        const idx = text.indexOf(variant, cursor);
        if (idx < 0) break;
        candidates.push(
          Object.freeze({
            matchedKorean: variant,
            startOffset: idx,
            endOffset: idx + variant.length,
            entry,
            english: entry.english,
            japanese: entry.japanese,
          }),
        );
        cursor = idx + variant.length;
      }
    }
  }

  candidates.sort(
    (a, b) =>
      a.startOffset - b.startOffset ||
      b.endOffset - b.startOffset - (a.endOffset - a.startOffset),
  );
  const resolved: SfxInlineAdaptation[] = [];
  let lastEnd = -1;
  for (const item of candidates) {
    if (item.startOffset >= lastEnd) {
      resolved.push(item);
      lastEnd = item.endOffset;
    }
  }
  return Object.freeze(resolved);
}
