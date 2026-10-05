/**
 * Bounded Korean vocabulary shared by the browser and the Met adapter.
 * Not a general-purpose translator: unknown words and names are preserved.
 */
export const REFERENCE_QUERY_LANGUAGE_VERSION = 3;
export const REFERENCE_QUERY_MAX_LENGTH = 80;

const TERMS: Readonly<Record<string, string>> = Object.freeze({
  "비 오는 골목": "rain alley", "비오는 골목": "rain alley",
  "비 오는 거리": "rain street", "전통 의상": "traditional costume",
  "한국 전통 의상": "Korean costume", "조선 시대": "Joseon",
  "중세 갑옷": "medieval armor", "서양 갑옷": "European armor",
  "동양 건축": "Asian architecture", "일본 정원": "Japanese garden",
  "고양이": "cat", "강아지": "dog", "개": "dog", "새": "bird",
  "말": "horse", "호랑이": "tiger", "용": "dragon", "나비": "butterfly",
  "꽃": "flowers", "나무": "tree", "숲": "forest", "산": "mountain",
  "바다": "sea", "파도": "waves", "강": "river", "호수": "lake",
  "비": "rain", "눈": "snow", "달": "moon", "밤": "night", "구름": "clouds",
  "골목": "alley", "거리": "street", "도시": "city", "마을": "village",
  "건축": "architecture", "건물": "building", "성": "castle", "궁전": "palace",
  "궁궐": "Korean palace", "한옥": "Korean house", "기와": "roof tiles",
  "문": "door", "창문": "window", "계단": "stairs", "다리": "bridge",
  "실내": "interior", "방": "room", "정원": "garden", "배경": "landscape",
  "가구": "furniture", "의자": "chair", "책상": "desk", "침대": "bed",
  "거울": "mirror", "등불": "lantern", "촛대": "candlestick", "책": "book",
  "그릇": "bowl", "도자기": "ceramics", "항아리": "jar", "꽃병": "vase",
  "주전자": "teapot", "잔": "cup", "부채": "fan", "악기": "musical instrument",
  "복식": "costume", "의상": "costume", "옷": "clothing", "드레스": "dress",
  "한복": "Korean costume", "도포": "Korean robe", "기모노": "kimono",
  "모자": "hat", "신발": "shoes", "장신구": "jewelry", "목걸이": "necklace",
  "갑옷": "armor", "갑주": "armor", "무기": "weapons", "검": "sword",
  "칼": "sword", "방패": "shield", "투구": "helmet", "활": "bow",
  "인물": "figure", "초상화": "portrait", "자세": "pose", "포즈": "pose",
  "동세": "figure drawing", "손": "hand", "얼굴": "face", "춤": "dance",
  "문양": "pattern", "패턴": "pattern", "장식": "ornament", "자수": "embroidery",
  "회화": "painting", "그림": "painting", "선화": "drawing", "드로잉": "drawing",
  "수채화": "watercolor", "유화": "oil painting", "판화": "print", "조각": "sculpture",
  "사진": "photograph", "금속": "metalwork", "직물": "textiles", "목재": "wood",
  "한국": "Korea", "조선": "Joseon", "일본": "Japan", "중국": "China",
  "유럽": "Europe", "이집트": "Egypt", "그리스": "Greece", "로마": "Rome",
  "중세": "medieval", "르네상스": "Renaissance", "전통": "traditional",
  "수묵화": "ink painting", "민화": "Korean folk painting",
  "백자": "white porcelain", "청자": "celadon", "분청사기": "buncheong",
  "저고리": "Korean jacket", "치마": "skirt", "바지": "trousers", "두루마기": "Korean coat",
  "왕관": "crown", "귀걸이": "earrings", "반지": "ring", "비녀": "hairpin",
  "신전": "temple", "사원": "temple", "성당": "cathedral", "탑": "tower",
  "기둥": "column", "회랑": "corridor", "천장": "ceiling", "분수": "fountain",
  "마차": "carriage", "기차": "train", "배": "boat", "돛단배": "sailboat",
  "벚꽃": "cherry blossom", "대나무": "bamboo", "소나무": "pine tree", "연꽃": "lotus",
  "폭포": "waterfall", "해변": "beach", "사막": "desert", "일몰": "sunset",
  "인체": "human figure", "해부학": "anatomy", "근육": "muscles", "손가락": "fingers",
  "눈동자": "eyes", "눈썹": "eyebrows", "입술": "lips", "머리카락": "hair",
  "옆모습": "profile", "뒷모습": "back view", "전신": "full length figure",
  "달리는 사람": "running figure", "걷는 사람": "walking figure",
  "앉은 자세": "seated figure", "누운 자세": "reclining figure",
  "손 포즈": "hand gesture", "두 손": "hands", "인물 눈": "human eyes",
  "옷 주름": "drapery", "천 주름": "drapery", "무도회": "ballroom",
  "로코코": "Rococo", "바로크": "Baroque", "빅토리아": "Victorian",
  // Research-desk vocabulary added 2026-10-06: places, materials, weather,
  // mood, creatures, props and styles that webtoon material searches use most.
  // Additive only — existing mappings above keep their established meaning.
  "오두막": "cabin", "등대": "lighthouse", "항구": "harbor", "시장": "market",
  "광장": "plaza", "지하실": "basement", "옥상": "rooftop", "온실": "greenhouse",
  "병원": "hospital", "카페": "cafe", "식당": "restaurant", "호텔": "hotel",
  "공항": "airport", "학교": "school", "도서관": "library", "박물관": "museum",
  "미술관": "art museum", "극장": "theater", "교회": "church", "절": "temple",
  "터널": "tunnel", "동굴": "cave", "화산": "volcano", "정글": "jungle",
  "초원": "grassland", "절벽": "cliff", "계곡": "valley", "협곡": "canyon",
  "숲속": "forest", "바닷가": "seaside", "들판": "field", "언덕": "hill",
  "빙하": "glacier", "섬": "island", "연못": "pond", "늪": "swamp",
  "이끼": "moss", "덩굴": "vines", "갈대": "reeds", "풀": "grass",
  "안개": "fog", "황혼": "dusk", "새벽": "dawn", "노을": "sunset glow",
  "일출": "sunrise", "무지개": "rainbow", "번개": "lightning", "천둥": "thunder",
  "홍수": "flood", "눈보라": "blizzard", "서리": "frost", "그림자": "shadow",
  "어둠": "darkness", "달빛": "moonlight", "햇빛": "sunlight", "밤하늘": "night sky",
  "별": "star", "은하": "galaxy", "우주": "space", "행성": "planet",
  "아늑한": "cozy", "신비로운": "mysterious", "음산한": "gloomy", "웅장한": "majestic",
  "평화로운": "peaceful", "화려한": "ornate", "몽환적인": "dreamlike", "고요한": "quiet",
  "벽돌": "brick", "콘크리트": "concrete", "대리석": "marble", "타일": "tile",
  "천": "fabric", "가죽": "leather", "유리": "glass", "종이": "paper",
  "돌": "stone", "흙": "soil", "모래": "sand", "연기": "smoke",
  "원목": "wood", "통나무": "log", "줄무늬": "striped", "체크무늬": "checkered",
  "꽃무늬": "floral", "기하학": "geometric", "추상": "abstract",
  "램프": "lamp", "양초": "candle", "촛불": "candlelight", "횃불": "torch",
  "화살": "arrow", "총": "gun", "대포": "cannon", "보석": "gem",
  "지도": "map", "나침반": "compass", "열쇠": "key", "자물쇠": "lock",
  "상자": "box", "병": "bottle", "접시": "plate", "우산": "umbrella",
  "장갑": "gloves", "목도리": "scarf", "부츠": "boots", "망토": "cloak",
  "가면": "mask", "인형": "doll", "피아노": "piano", "바이올린": "violin",
  "기타": "guitar", "종": "bell", "시계": "clock", "조각상": "statue",
  "깃발": "flag", "돛": "sail", "닻": "anchor", "바퀴": "wheel",
  "날개": "wings", "뿔": "horn", "발톱": "claw", "비늘": "scales",
  "깃털": "feather", "털": "fur", "무덤": "tomb", "왕좌": "throne",
  "여우": "fox", "늑대": "wolf", "사자": "lion", "곰": "bear",
  "토끼": "rabbit", "사슴": "deer", "돼지": "pig", "소": "cow",
  "양": "sheep", "염소": "goat", "닭": "chicken", "오리": "duck",
  "독수리": "eagle", "부엉이": "owl", "까마귀": "crow", "갈매기": "seagull",
  "벌": "bee", "개미": "ant", "거미": "spider", "뱀": "snake",
  "개구리": "frog", "물고기": "fish", "상어": "shark", "고래": "whale",
  "돌고래": "dolphin", "문어": "octopus", "해파리": "jellyfish",
  "장미": "rose", "튤립": "tulip", "해바라기": "sunflower", "단풍": "autumn leaves",
  "은행나무": "ginkgo", "고딕": "gothic", "아르누보": "art nouveau", "아르데코": "art deco",
  "모던": "modern", "레트로": "retro", "빈티지": "vintage", "사이버펑크": "cyberpunk",
  "스팀펑크": "steampunk", "판타지": "fantasy", "공포": "horror", "미니멀": "minimalist",
  "미래": "futuristic", "전투": "battle", "전쟁": "war", "축제": "festival",
  "결혼식": "wedding", "연회장": "banquet hall", "지하": "underground",
});

export type ReferenceQueryResolution = Readonly<{
  original: string;
  providerQuery: string;
  status: "unchanged" | "translated" | "partial" | "unsupported" | "invalid";
  matched: readonly string[];
  unresolved: readonly string[];
}>;

const HANGUL = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/u;
const PARTICLES = ["에서", "으로", "에게", "까지", "부터", "처럼", "보다", "의", "을", "를", "은", "는", "이", "가", "에", "와", "과", "도", "로"] as const;
// Only compact known phrases. Never segment an arbitrary Korean name into substrings.
const COMPACT_TERMS = new Map(Object.entries(TERMS)
  .filter(([term]) => term.includes(" "))
  .map(([term, translation]) => [term.replace(/ /gu, ""), translation]));

function lookupTerm(term: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(TERMS, term)) return TERMS[term];
  return COMPACT_TERMS.get(term);
}

function lookupPhrase(phrase: string): string | undefined {
  const direct = lookupTerm(phrase);
  if (direct) return direct;
  for (const particle of PARTICLES) {
    if (!phrase.endsWith(particle)) continue;
    const stem = phrase.slice(0, -particle.length);
    const translated = lookupTerm(stem);
    if (translated) return translated;
  }
  return undefined;
}

function containsControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

export function resolveReferenceQuery(input: string): ReferenceQueryResolution {
  const original = input.normalize("NFC").trim().replace(/ +/gu, " ");
  const base = { original, providerQuery: input, matched: [] as string[], unresolved: [] as string[] };
  const exact = lookupPhrase(original);
  // A single known Korean noun (숲, 손, 검...) is a useful complete search.
  if (input.length > REFERENCE_QUERY_MAX_LENGTH || containsControlCharacter(input)
    || !original || (original.length < 2 && !exact)) {
    return { ...base, status: "invalid" };
  }
  if (!HANGUL.test(original)) return { ...base, providerQuery: original, status: "unchanged" };
  if (exact) return { ...base, providerQuery: exact, matched: [original], status: "translated" };

  const tokens = original.split(/[\s,，、;；]+/u).filter(Boolean);
  const matched: string[] = [];
  const unresolved: string[] = [];
  const translated: string[] = [];
  for (let i = 0; i < tokens.length;) {
    let found = false;
    for (let length = Math.min(4, tokens.length - i); length >= 1; length--) {
      const phrase = tokens.slice(i, i + length).join(" ");
      const translation = lookupPhrase(phrase);
      if (translation) {
        translated.push(translation);
        matched.push(phrase);
        i += length;
        found = true;
        break;
      }
    }
    if (!found) {
      const token = tokens[i++];
      if (token === undefined) break;
      translated.push(token);
      if (HANGUL.test(token)) unresolved.push(token);
    }
  }
  const providerQuery = translated.join(" ");
  if (providerQuery.length > REFERENCE_QUERY_MAX_LENGTH) {
    return { ...base, providerQuery: original, unresolved: tokens.filter((token) => HANGUL.test(token)), status: "unsupported" };
  }
  return {
    original, providerQuery: matched.length ? providerQuery : original, matched, unresolved,
    status: matched.length === 0 ? "unsupported" : unresolved.length ? "partial" : "translated",
  };
}

/** Museum adapters share bounded vocabulary expansion; books keep their contract. */
export function localizeReferenceProviderQuery(query: Record<string, unknown>): Record<string, unknown> {
  if (typeof query.provider !== "string" || !["met", "aic", "cleveland", "nasa", "vam", "rijksmuseum"].includes(query.provider) || typeof query.q !== "string") return query;
  const resolution = resolveReferenceQuery(query.q);
  return resolution.status === "translated" || resolution.status === "partial"
    ? { ...query, q: resolution.providerQuery }
    : query;
}
