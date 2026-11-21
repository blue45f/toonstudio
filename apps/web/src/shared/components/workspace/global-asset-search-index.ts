/**
 * ToonStudio 전역 통합 소재 검색 인덱스 및 초성·한영 검색 엔진.
 * shared/ 내부 완결 모듈로 domains/* 정적/동적 의존성이 0이다.
 */

export type GlobalAssetCategory = "all" | "3d-hero" | "background" | "brush" | "texture" | "pose" | "sfx";
export type GlobalAssetLicenseTier = "cc0-free" | "commercial-free" | "commercial-verified";

export interface GlobalAssetCatalogEntry {
  readonly id: string;
  readonly category: Exclude<GlobalAssetCategory, "all">;
  readonly genre: "로판" | "서울·현대" | "무협" | "학원·일상" | "공용";
  readonly titleKo: string;
  readonly titleEn: string;
  readonly subtitleKo: string;
  readonly subtitleEn: string;
  readonly licenseTier: GlobalAssetLicenseTier;
  readonly licenseLabelKo: string;
  readonly licenseLabelEn: string;
  readonly formatLabel: string;
  readonly href: string;
  readonly canvasHref: string;
  readonly hubHref: string;
  readonly keywords: readonly string[];
}

export interface GlobalAssetFilterOptions {
  readonly query: string;
  readonly category: GlobalAssetCategory;
  readonly freeCommercialOnly: boolean;
}

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;
const CHOSEONG_TABLE = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
] as const;

const LICENSE_LABELS: Readonly<Record<GlobalAssetLicenseTier, readonly [ko: string, en: string]>> = {
  "cc0-free": ["CC0 상업 무료", "CC0 Commercial Free"],
  "commercial-free": ["상업 무료 허용", "Free Commercial Use"],
  "commercial-verified": ["상업 연재 검증", "Commercial Verified"],
};

/** 한글 음절 문자열에서 초성 열을 추출한다(예: "로판 황궁" -> "ㄹㅍ ㅎㄱ"). */
export function extractKoreanChoseong(text: string): string {
  let result = "";
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code >= HANGUL_START && code <= HANGUL_END) {
      result += CHOSEONG_TABLE[Math.floor((code - HANGUL_START) / 588)] ?? text[i] ?? "";
    } else {
      result += text[i] ?? "";
    }
  }
  return result.toLowerCase();
}

function isChoseongOnlyToken(token: string): boolean {
  if (!token) return false;
  for (let i = 0; i < token.length; i += 1) {
    if (!CHOSEONG_TABLE.includes((token[i] ?? "") as (typeof CHOSEONG_TABLE)[number])) return false;
  }
  return true;
}

/** 입력 요소 포커스 여부를 판별해 `/` 단축키가 텍스트 입력을 가로채지 않게 보호한다. */
export function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return target.isContentEditable || target.getAttribute("role") === "textbox";
}

/** 바로 열기 핵심 소재/작업 허브 경로 (appRoutes 등록 정본 경로만 사용). */
export const GLOBAL_ASSET_QUICK_HUBS: readonly {
  readonly id: string;
  readonly href: string;
  readonly labelKo: string;
  readonly labelEn: string;
}[] = Object.freeze([
  { id: "hub-materials", href: "/research/materials", labelKo: "통합 소재 검색", labelEn: "Unified Materials" },
  { id: "hub-market", href: "/market", labelKo: "에셋 마켓", labelEn: "Asset Market" },
  { id: "hub-bg3d", href: "/studio/bg3d", labelKo: "3D 배경 스테이지", labelEn: "3D Stage" },
  { id: "hub-studio", href: "/studio", labelKo: "스튜디오 캔버스", labelEn: "Studio Canvas" },
]);

const makeEntry = (
  id: string,
  category: Exclude<GlobalAssetCategory, "all">,
  genre: GlobalAssetCatalogEntry["genre"],
  titles: readonly [ko: string, en: string],
  subtitles: readonly [ko: string, en: string],
  licenseTier: GlobalAssetLicenseTier,
  formatLabel: string,
  routes: readonly [href: string, canvasHref: string, hubHref: string],
  keywords: readonly string[],
): GlobalAssetCatalogEntry => ({
  id,
  category,
  genre,
  titleKo: titles[0],
  titleEn: titles[1],
  subtitleKo: subtitles[0],
  subtitleEn: subtitles[1],
  licenseTier,
  licenseLabelKo: LICENSE_LABELS[licenseTier][0],
  licenseLabelEn: LICENSE_LABELS[licenseTier][1],
  formatLabel,
  href: routes[0],
  canvasHref: routes[1],
  hubHref: routes[2],
  keywords,
});

/**
 * ToonStudio 전역 통합 소재 인덱스.
 * 3D 배경 히어로 4종 · 로판/서울/무협 배경 · 브러시 · 텍스처 · 포즈 · 효과음을 즉시 탐색한다.
 */
export const GLOBAL_ASSET_CATALOG: readonly GlobalAssetCatalogEntry[] = Object.freeze([
  // 3D 배경 히어로 4종
  makeEntry("hero-3d-rofan-palace", "3d-hero", "로판",
    ["로판 황궁 대연회장 3D 히어로 스테이지", "Rofan Imperial Ballroom 3D Hero Stage"],
    ["샹들리에·대리석 계단·2단 셀 잉크선 프리셋 내장 3D 배경", "Chandeliers, marble stairs and 2-tone cel-ink preset 3D scene"],
    "cc0-free", "3D HERO · GLB",
    ["/studio/bg3d?preset=rofan-ballroom", "/studio/bg3d?preset=rofan-ballroom", "/research/materials?q=rofan"],
    ["로판", "황궁", "연회장", "궁전", "3d", "히어로", "rofan", "palace", "ballroom", "creator-resources"]),
  makeEntry("hero-3d-seoul-alley", "3d-hero", "서울·현대",
    ["서울 홍대 야경 골목 3D 히어로 스테이지", "Seoul Hongdae Night Alley 3D Hero Stage"],
    ["젖은 아스팔트 반사·간판 투시·가로등 조명 카메라 6각도", "Wet asphalt reflections, neon signage perspective and 6 camera angles"],
    "cc0-free", "3D HERO · GLB",
    ["/studio/bg3d?preset=seoul-night-alley", "/studio/bg3d?preset=seoul-night-alley", "/research/materials?q=seoul"],
    ["서울", "홍대", "야경", "골목", "현대", "도시", "3d", "히어로", "seoul", "alley", "urban"]),
  makeEntry("hero-3d-wuxia-cliff", "3d-hero", "무협",
    ["무협 천마산 절벽 정자 3D 히어로 스테이지", "Wuxia Cliffside Pavilion 3D Hero Stage"],
    ["운해 안개 볼륨·기와 지붕·수묵 외곽선 셰이더 1클릭 적용", "Cloud-sea fog, tiled roof and ink-wash contour shader"],
    "cc0-free", "3D HERO · GLB",
    ["/studio/bg3d?preset=wuxia-cliff-pavilion", "/studio/bg3d?preset=wuxia-cliff-pavilion", "/research/materials?q=wuxia"],
    ["무협", "천마산", "절벽", "정자", "동양풍", "3d", "히어로", "wuxia", "pavilion", "cliff"]),
  makeEntry("hero-3d-school-rooftop", "3d-hero", "학원·일상",
    ["학원물 석양 옥상 3D 히어로 스테이지", "Sunset School Rooftop 3D Hero Stage"],
    ["철조망·급수탑·노을 리밍 라이트 투시 가이드 포함", "Chain-link fence, water tower and golden-hour rim light rig"],
    "cc0-free", "3D HERO · GLB",
    ["/studio/bg3d?preset=school-rooftop", "/studio/bg3d?preset=school-rooftop", "/research/materials?q=rooftop"],
    ["학원", "옥상", "학교", "석양", "일상", "3d", "히어로", "school", "rooftop", "sunset"]),
  // 로판 / 서울 / 무협 배경
  makeEntry("bg-rofan-conservatory", "background", "로판",
    ["로판 대공저 유리온실 정원 배경 세트", "Rofan Grand Duke Glass Conservatory Set"],
    ["아치형 창틀·티테이블·낮/밤 조명 전환 레이어 분리", "Arched glass frames, tea table and day/night lighting layers"],
    "commercial-verified", "BG · 3D+2D",
    ["/market?q=rofan-conservatory", "/studio/bg3d?preset=rofan-conservatory", "/market?q=rofan-conservatory"],
    ["로판", "대공저", "유리온실", "정원", "배경", "rofan", "garden", "conservatory", "background"]),
  makeEntry("bg-seoul-office-subway", "background", "서울·현대",
    ["서울 강남 오피스 · 지하철 2호선 출근길 배경", "Seoul Office & Subway Line 2 Background Pack"],
    ["회의실 통유리·전동차 내부 좌석·현실 소품 투시 완비", "Glass boardroom and commuter train interior with perspective guides"],
    "commercial-free", "BG · LAYER",
    ["/research/materials?q=seoul-office", "/studio?asset=bg-seoul-office-subway", "/research/materials?q=seoul-office"],
    ["서울", "강남", "오피스", "회사", "지하철", "현대", "배경", "seoul", "office", "subway"]),
  makeEntry("bg-wuxia-inn-bamboo", "background", "무협",
    ["무협 객잔 2층 · 대나무숲 결투장 배경", "Wuxia Two-Story Inn & Bamboo Forest Backdrop"],
    ["목재 난간·등불·대나무 원근 안개 분리 레이어", "Timber balconies, lanterns and multi-depth bamboo fog layers"],
    "commercial-verified", "BG · 3D+2D",
    ["/market?q=wuxia-inn", "/studio/bg3d?preset=wuxia-inn", "/market?q=wuxia-inn"],
    ["무협", "객잔", "대나무숲", "결투", "배경", "wuxia", "inn", "bamboo", "background"]),
  // 브러시
  makeEntry("brush-webtoon-gpen", "brush", "공용",
    ["웹툰 선화 G펜 · 마루펜 프로 브러시 8종", "Webtoon Inking G-Pen & Maru-Pen Brush Pack"],
    ["필압 보정·끝단 뾰족함·800px 세로 원고 안티앨리어싱 최적화", "Pressure-stabilized sharp-tip inking brushes tuned for 800px webtoons"],
    "cc0-free", "BRUSH · PEN",
    ["/studio/assets/brushes/new?preset=gpen", "/studio?asset=brush-webtoon-gpen", "/studio/assets/brushes/new"],
    ["브러시", "펜", "선화", "g펜", "마루펜", "잉크", "brush", "gpen", "inking"]),
  makeEntry("brush-rofan-lace-rose", "brush", "로판",
    ["로판 프릴·레이스·장미 덩굴 데코 브러시", "Rofan Frill, Lace & Rose Vine Ribbon Brushes"],
    ["드레스 밑단·금장 문양을 스트로크 한 번에 자동 반복", "Single-stroke repeating dress lace, gold trim and rose ribbons"],
    "commercial-free", "BRUSH · DECO",
    ["/market?q=rofan-lace-brush", "/studio?asset=brush-rofan-lace-rose", "/market?q=rofan-lace-brush"],
    ["로판", "브러시", "레이스", "프릴", "장미", "드레스", "brush", "lace", "rose", "rofan"]),
  makeEntry("brush-wuxia-ink-wash", "brush", "무협",
    ["무협 검기 · 먹 번짐 수묵 붓 브러시", "Wuxia Sword Aura & Ink-Wash Splatter Brushes"],
    ["갈필 텍스처와 먹물 비산 효과를 60fps 실시간 스트로크로 표현", "Dry-brush bristle texture and ink splatter strokes at 60fps"],
    "cc0-free", "BRUSH · INK",
    ["/studio/assets/brushes/new?preset=wuxia-ink", "/studio?asset=brush-wuxia-ink-wash", "/studio/assets/brushes/new"],
    ["무협", "검기", "먹", "수묵", "붓", "브러시", "wuxia", "ink", "brush", "sword"]),
  // 텍스처
  makeEntry("tex-cc0-marble-stone", "texture", "로판",
    ["CC0 대리석 · 고성 석재 2K 심리스 PBR 텍스처", "CC0 Marble & Castle Stone 2K Seamless PBR Texture"],
    ["알베도·노멀·러프니스 포함 · 2단 셀 음영 자동 양자화 지원", "Albedo, normal and roughness maps with automatic 2-tone cel pass"],
    "cc0-free", "TEXTURE · 2K",
    ["/research/materials?q=marble", "/studio?asset=tex-cc0-marble-stone", "/research/materials?q=marble"],
    ["텍스처", "재질", "대리석", "석재", "pbr", "cc0", "texture", "marble", "stone", "creator-resources"]),
  makeEntry("tex-halftone-screentone", "texture", "공용",
    ["만화 60선 망점 · 종이 질감 스크린톤 팩", "60-LPI Halftone & Paper Grain Screentone Pack"],
    ["모아레 방지 해상도 매칭 · 감정 컷 음영 레이어 즉시 적용", "Moire-free halftone screens and subtle paper grain overlays"],
    "cc0-free", "TEXTURE · TONE",
    ["/research/materials?q=screentone", "/studio?asset=tex-halftone-screentone", "/research/materials?q=screentone"],
    ["텍스처", "스크린톤", "망점", "종이", "질감", "texture", "screentone", "halftone"]),
  // 포즈
  makeEntry("pose-action-sword-kick", "pose", "무협",
    ["액션 발차기 · 검술 3D 마네킹 포즈 24종", "Action Kick & Swordsmanship 3D Mannequin 24 Poses"],
    ["투시 왜곡 슬라이더 연동 · 관절 잠금으로 컷 구도 10초 완성", "Perspective exaggeration slider and joint-locked dynamic poses"],
    "commercial-free", "POSE · 3D RIG",
    ["/studio/assets/characters/new?pose=action-24", "/studio/assets/characters/new?pose=action-24", "/studio/assets"],
    ["포즈", "액션", "검술", "발차기", "마네킹", "인체", "pose", "action", "sword", "rig"]),
  makeEntry("pose-rofan-waltz-couple", "pose", "로판",
    ["로판 무도회 왈츠 · 손 잡기 2인 포즈 세트", "Rofan Ballroom Waltz & Hand-Holding Duo Poses"],
    ["키 차이 자동 보정·시선 추적 리그 적용 2인 구도", "Height-adjusted two-character poses with gaze-target rigging"],
    "commercial-verified", "POSE · DUO",
    ["/studio/assets/characters/new?pose=rofan-duo", "/studio/assets/characters/new?pose=rofan-duo", "/market?q=rofan-pose"],
    ["포즈", "로판", "커플", "왈츠", "2인", "손", "pose", "duo", "waltz", "rofan"]),
  // 효과음 (SFX)
  makeEntry("sfx-combat-impact", "sfx", "무협",
    ["전투 타격 · 검기 파열 의성어 + 오디오 SFX 팩", "Combat Impact & Blade Slash Visual + Audio SFX Pack"],
    ["한/일/영 벡터 효과음 글자(콰앙·스릉)와 모션웹툰 WAV 동시 제공", "Vector KO/JA/EN onomatopoeia lettering paired with motion-webtoon WAV"],
    "cc0-free", "SFX · SVG+WAV",
    ["/studio/assets/audio?pack=combat-sfx", "/studio?asset=sfx-combat-impact", "/studio/assets/audio"],
    ["효과음", "의성어", "전투", "타격", "검기", "sfx", "sound", "audio", "combat"]),
  makeEntry("sfx-romance-heartbeat", "sfx", "로판",
    ["두근두근 심장박동 · 로맨스 앰비언스 SFX 팩", "Heartbeat & Romance Ambience SFX Pack"],
    ["감정선 클로즈업 컷용 타이포 SFX와 상업 무료 빗소리·종소리", "Emotional close-up lettering SFX plus commercial-free rain & chimes"],
    "commercial-free", "SFX · SVG+WAV",
    ["/studio/assets/audio?pack=romance-sfx", "/studio?asset=sfx-romance-heartbeat", "/studio/assets/audio"],
    ["효과음", "로맨스", "심장", "두근두근", "빗소리", "sfx", "romance", "heartbeat", "audio"]),
]);

function scoreEntry(entry: GlobalAssetCatalogEntry, tokens: readonly string[]): number {
  if (tokens.length === 0) return 10;

  const titleKo = entry.titleKo.toLowerCase();
  const titleEn = entry.titleEn.toLowerCase();
  const subKo = entry.subtitleKo.toLowerCase();
  const subEn = entry.subtitleEn.toLowerCase();
  const genre = entry.genre.toLowerCase();
  const format = entry.formatLabel.toLowerCase();
  const keywords = entry.keywords.map((kw) => kw.toLowerCase());

  const titleChoseong = extractKoreanChoseong(entry.titleKo).replace(/\s+/gu, "");
  const genreChoseong = extractKoreanChoseong(entry.genre).replace(/\s+/gu, "");
  const keywordChoseong = entry.keywords.map((kw) => extractKoreanChoseong(kw).replace(/\s+/gu, ""));

  let totalScore = 0;
  for (const token of tokens) {
    const clean = token.replace(/\s+/gu, "");
    let tokenScore = 0;
    if (titleKo.includes(token) || titleEn.includes(token)) {
      tokenScore = titleKo.startsWith(token) || titleEn.startsWith(token) ? 100 : 80;
    } else if (genre.includes(token) || keywords.some((kw) => kw.includes(token))) {
      tokenScore = 65;
    } else if (subKo.includes(token) || subEn.includes(token) || format.includes(token)) {
      tokenScore = 40;
    } else if (
      isChoseongOnlyToken(clean) &&
      (titleChoseong.includes(clean) ||
        genreChoseong.includes(clean) ||
        keywordChoseong.some((kw) => kw.includes(clean)))
    ) {
      tokenScore = titleChoseong.startsWith(clean) || genreChoseong.startsWith(clean) ? 75 : 55;
    }
    if (tokenScore === 0) return 0;
    totalScore += tokenScore;
  }
  return totalScore;
}

/** 초성·한영 다중 키워드 + 카테고리 + 상업 무료 라이선스 필터로 통합 소재 인덱스를 검색한다. */
export function filterGlobalAssetCatalog(
  entries: readonly GlobalAssetCatalogEntry[],
  options: GlobalAssetFilterOptions,
): readonly GlobalAssetCatalogEntry[] {
  const tokens = options.query.trim().toLowerCase().split(/\s+/u).filter(Boolean);
  const scored: { readonly entry: GlobalAssetCatalogEntry; readonly score: number }[] = [];

  for (const entry of entries) {
    if (options.category !== "all" && entry.category !== options.category) continue;
    if (options.freeCommercialOnly && entry.licenseTier === "commercial-verified") continue;
    const score = scoreEntry(entry, tokens);
    if (score > 0) scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((item) => item.entry);
}
