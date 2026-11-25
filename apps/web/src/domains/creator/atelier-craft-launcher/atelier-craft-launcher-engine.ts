import { CRAFT_STATION_CATALOG } from "./atelier-craft-catalog";
import { assertCount, assertPinState } from "./launcher-input-contract";

export { CRAFT_STATION_CATALOG } from "./atelier-craft-catalog";

/**
 * Wave 43D — 아틀리에 프로 도구 퀵 런처 (Atelier Craft Quick-Jump Showcase) 순수 엔진.
 *
 * - 계산 예제·관련 도구의 정적 설명과 사전 제작 참고 그림을 8대 경로로 정리한다.
 *   엔진 수·장치 지원·원고 저장·출력의 실제 실행 상태를 검증하지 않는다.
 * - 브라우저 전역·Web Storage에 의존하지 않는 100% 결정론 순수 함수만 제공한다.
 */

export type CraftWorkflowStageId = "conti" | "drawing" | "3d" | "collab" | "delivery";

export type CraftStageFilterId = "all" | "pinned" | CraftWorkflowStageId;

export type CraftStationId =
  | "drawing-physical-ink"
  | "character-3d-hair"
  | "bg3d-solar-lighting"
  | "virtual-studio-collab"
  | "webtoon-cut-lettering-cinema"
  | "color-script-p3"
  | "movingtoon-reels-delivery"
  | "offline-resilience-settlement";

export type CraftRouteHref =
  | "/studio/canvas"
  | "/studio/character"
  | "/studio/bg3d"
  | "/studio/space"
  | "/studio/comic"
  | "/tech"
  | "/compare/studio"
  | "/production";

export type CraftAtelierAssetPath =
  | `/assets/atelier/studio-craft/${string}.webp`
  | `/assets/atelier/cinema-ergo/${string}.webp`;

export interface CraftStageSpec {
  readonly id: CraftWorkflowStageId;
  readonly labelKo: "콘티" | "작화" | "3D" | "협업" | "출고";
  readonly labelEn: string;
  readonly order: number;
  readonly nextStageId: CraftWorkflowStageId;
  readonly summaryKo: string;
  readonly summaryEn: string;
}

export interface CraftStationSpec {
  readonly id: CraftStationId;
  readonly scope: "catalog-reference";
  readonly order: number;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly subtitleKo: string;
  readonly subtitleEn: string;
  readonly stageId: CraftWorkflowStageId;
  readonly stageLabelKo: "콘티" | "작화" | "3D" | "협업" | "출고";
  readonly stageLabelEn: string;
  readonly secondaryStageIds: readonly CraftWorkflowStageId[];
  readonly href: CraftRouteHref;
  readonly routeMeaningKo: string;
  readonly routeMeaningEn: string;
  readonly thumbnailSrc: CraftAtelierAssetPath;
  readonly secondaryPreviewSrc: CraftAtelierAssetPath;
  readonly thumbnailAltKo: string;
  readonly thumbnailAltEn: string;
  readonly secondaryAltKo: string;
  readonly secondaryAltEn: string;
  readonly shortcutHint: string;
  readonly shortcutKey: string;
  readonly waveRange: string;
  readonly engineCount: number;
  readonly highlightsKo: readonly [string, string, string];
  readonly highlightsEn: readonly [string, string, string];
  readonly keywords: readonly string[];
}

export interface FilterCraftStationsOptions {
  readonly pinnedIds?: readonly CraftStationId[];
  readonly includeSecondary?: boolean;
}

export interface SearchCraftStationsOptions {
  readonly pinnedIds?: readonly CraftStationId[];
}

export interface CraftRecommendationItem {
  readonly station: CraftStationSpec;
  readonly priority: "next-step" | "companion" | "finish-check";
  readonly reasonKo: string;
  readonly reasonEn: string;
}

export interface RecommendCraftStationsOptions {
  readonly activeStationId?: CraftStationId | null;
  readonly pinnedIds?: readonly CraftStationId[];
  readonly limit?: number;
  readonly catalog?: readonly CraftStationSpec[];
}

export interface CraftLauncherPinState {
  readonly storageKind: "in-memory-preferences";
  readonly persistent: false;
  readonly pinnedIds: readonly CraftStationId[];
  readonly maxPinned: number;
  readonly lastToggledId: CraftStationId | null;
  readonly lastAction: "init" | "pinned" | "unpinned" | "limit-reached";
}

export const ATELIER_TOTAL_BAKED_WEBP_COUNT = 46;
export const DEFAULT_MAX_PINNED_CRAFT_STATIONS = 4;

const HANGUL_SYLLABLE_START = 0xac00;
const HANGUL_SYLLABLE_END = 0xd7a3;
const CHOSEONG_CYCLE = 588;

const KOREAN_CHOSEONG_TABLE = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
] as const;

const KOREAN_CHOSEONG_SET = new Set<string>(KOREAN_CHOSEONG_TABLE);

export const CRAFT_WORKFLOW_STAGES: readonly CraftStageSpec[] = [
  {
    id: "conti", labelKo: "콘티", labelEn: "Storyboard", order: 1, nextStageId: "3d",
    summaryKo: "컷 배치·시선 동선·말풍선 호흡을 먼저 잡는 단계",
    summaryEn: "Block panels, eye flow, and speech-balloon rhythm first",
  },
  {
    id: "drawing", labelKo: "작화", labelEn: "Drawing", order: 2, nextStageId: "collab",
    summaryKo: "물리 잉크 펜선·채색·4막 색채 톤을 완성하는 단계",
    summaryEn: "Ink with physical brushes and lock 4-act P3 color scripts",
  },
  {
    id: "3d", labelKo: "3D", labelEn: "3D Stage", order: 3, nextStageId: "drawing",
    summaryKo: "인물 신장·포즈와 서울 태양광 배경을 맞춰두는 단계",
    summaryEn: "Set character proportions, poses, and Seoul solar lighting",
  },
  {
    id: "collab", labelKo: "협업", labelEn: "Collab", order: 4, nextStageId: "delivery",
    summaryKo: "어시스턴트·편집자와 실시간 피드백을 주고받는 단계",
    summaryEn: "Review pages together with live cursors and pin notes",
  },
  {
    id: "delivery", labelKo: "출고", labelEn: "Delivery", order: 5, nextStageId: "conti",
    summaryKo: "릴스 렌더링·권리 BOM·패리티 백업·정산을 마감하는 단계",
    summaryEn: "Render reels, verify rights BOM, back up OPFS, and settle payouts",
  },
] as const;


export const ATELIER_TOTAL_EXPERT_ENGINE_COUNT: number = CRAFT_STATION_CATALOG.reduce(
  (sum, station) => sum + station.engineCount,
  0,
);

/** 엔진 카탈로그가 참조하는 모든 사전 베이크 `/assets/atelier/*.webp` 경로를 중복 없이 반환한다. */
export function collectAllLauncherAtelierAssetPaths(): readonly CraftAtelierAssetPath[] {
  const seen = new Set<CraftAtelierAssetPath>();
  for (const station of CRAFT_STATION_CATALOG) {
    seen.add(station.thumbnailSrc);
    seen.add(station.secondaryPreviewSrc);
  }
  return Array.from(seen).sort();
}

export function getCraftStageById(stageId: CraftWorkflowStageId): CraftStageSpec {
  const found = CRAFT_WORKFLOW_STAGES.find((stage) => stage.id === stageId);
  if (!found) throw new Error(`알 수 없는 창작 워크플로우 단계: ${stageId}`);
  return found;
}

export function getCraftStationById(
  stationId: CraftStationId,
  catalog: readonly CraftStationSpec[] = CRAFT_STATION_CATALOG,
): CraftStationSpec {
  const found = catalog.find((station) => station.id === stationId);
  if (!found) throw new Error(`알 수 없는 아틀리에 스테이션: ${stationId}`);
  return found;
}

/** 문자열에서 한글 음절을 초성 자모로 변환하고 영문·숫자는 소문자로 정규화한다. */
export function extractKoreanChoseong(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= HANGUL_SYLLABLE_START && code <= HANGUL_SYLLABLE_END) {
      const consonant = KOREAN_CHOSEONG_TABLE[Math.floor((code - HANGUL_SYLLABLE_START) / CHOSEONG_CYCLE)];
      if (consonant) out += consonant;
      continue;
    }
    if (KOREAN_CHOSEONG_SET.has(ch)) {
      out += ch;
      continue;
    }
    if (/[a-zA-Z0-9]/u.test(ch)) {
      out += ch.toLowerCase();
    }
  }
  return out;
}

/** 공백을 제외한 쿼리가 한글 초성 자모만으로 구성되었는지 판별한다. */
export function isChoseongQuery(query: string): boolean {
  const compact = query.replace(/\s+/gu, "");
  if (compact.length === 0) return false;
  for (const ch of compact) {
    if (!KOREAN_CHOSEONG_SET.has(ch)) return false;
  }
  return true;
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeCompactText(value: string): string {
  return value.toLowerCase().replace(/[\s·\-_/]+/gu, "");
}

function scoreOrderedSubsequence(needle: string, haystack: string): number {
  if (needle.length < 2 || haystack.length === 0 || needle.length > haystack.length) return 0;
  let ni = 0;
  let firstIdx = -1;
  let lastIdx = -1;
  for (let hi = 0; hi < haystack.length && ni < needle.length; hi += 1) {
    if (haystack[hi] === needle[ni]) {
      if (firstIdx === -1) firstIdx = hi;
      lastIdx = hi;
      ni += 1;
    }
  }
  if (ni !== needle.length || firstIdx === -1) return 0;
  const span = lastIdx - firstIdx + 1;
  if (span > Math.ceil(needle.length * 2.5)) return 0;
  return span === needle.length ? 36 : 24;
}

function scoreTokenAgainstStation(token: string, station: CraftStationSpec): number {
  const normalizedToken = normalizeSearchText(token);
  const compactToken = normalizeCompactText(token);
  if (compactToken.length === 0) return 0;

  const titleKo = normalizeSearchText(station.titleKo);
  const titleEn = normalizeSearchText(station.titleEn);
  const titleKoCompact = normalizeCompactText(station.titleKo);
  const titleEnCompact = normalizeCompactText(station.titleEn);
  const hrefLower = station.href.toLowerCase();
  const shortcutLower = station.shortcutHint.toLowerCase();

  if (
    titleKo === normalizedToken || titleEn === normalizedToken ||
    hrefLower === normalizedToken || shortcutLower === normalizedToken
  ) {
    return 120;
  }

  let best = 0;
  if (
    titleKoCompact.startsWith(compactToken) || titleEnCompact.startsWith(compactToken) ||
    hrefLower.includes(normalizedToken) || shortcutLower.includes(normalizedToken)
  ) {
    best = Math.max(best, 95);
  }
  if (titleKo.includes(normalizedToken) || titleEn.includes(normalizedToken)) {
    best = Math.max(best, 82);
  }
  if (
    normalizeSearchText(station.stageLabelKo).includes(normalizedToken) ||
    normalizeSearchText(station.stageLabelEn).includes(normalizedToken) ||
    station.stageId.includes(normalizedToken)
  ) {
    best = Math.max(best, 72);
  }
  if (station.keywords.some((kw) => normalizeSearchText(kw).includes(normalizedToken))) {
    best = Math.max(best, 68);
  }

  const bodyFields = [station.subtitleKo, station.subtitleEn, ...station.highlightsKo, ...station.highlightsEn];
  if (bodyFields.some((field) => normalizeSearchText(field).includes(normalizedToken))) {
    best = Math.max(best, 54);
  }

  if (isChoseongQuery(compactToken)) {
    const titleChoseong = extractKoreanChoseong(station.titleKo);
    if (titleChoseong.startsWith(compactToken)) best = Math.max(best, 90);
    else if (titleChoseong.includes(compactToken)) best = Math.max(best, 76);
    else if (scoreOrderedSubsequence(compactToken, titleChoseong) > 0) best = Math.max(best, 52);

    if (extractKoreanChoseong(station.stageLabelKo).includes(compactToken)) best = Math.max(best, 70);
    if (station.keywords.some((kw) => extractKoreanChoseong(kw).includes(compactToken))) best = Math.max(best, 62);
    if (bodyFields.some((field) => extractKoreanChoseong(field).includes(compactToken))) best = Math.max(best, 46);
  } else if (best === 0 && compactToken.length >= 2) {
    const candidates = [
      titleEnCompact, titleKoCompact, normalizeCompactText(station.href),
      ...station.keywords.map((kw) => normalizeCompactText(kw)),
    ];
    for (const candidate of candidates) {
      best = Math.max(best, scoreOrderedSubsequence(compactToken, candidate));
    }
  }

  return best;
}

/** 카테고리(작업 단계 또는 핀 목록)로 스테이션을 필터링한다. */
export function filterCraftStations(
  stations: readonly CraftStationSpec[],
  filter: CraftStageFilterId,
  options?: FilterCraftStationsOptions,
): readonly CraftStationSpec[] {
  if (filter === "all") return [...stations];
  if (filter === "pinned") {
    const pinnedSet = new Set(options?.pinnedIds ?? []);
    return stations.filter((station) => pinnedSet.has(station.id));
  }
  const primary = stations.filter((station) => station.stageId === filter);
  if (!options?.includeSecondary) return primary;
  const secondary = stations.filter(
    (station) => station.stageId !== filter && station.secondaryStageIds.includes(filter),
  );
  return [...primary, ...secondary];
}

/** 한국어·영문 키워드·라우트·단축키·초성 유사 검색으로 스테이션을 랭킹한다. */
export function searchCraftStations(
  stations: readonly CraftStationSpec[],
  query: string,
  options?: SearchCraftStationsOptions,
): readonly CraftStationSpec[] {
  const trimmed = query.trim();
  const pinnedSet = new Set(options?.pinnedIds ?? []);
  if (trimmed.length === 0) return [...stations];

  const tokens = trimmed.split(/\s+/u).filter((token) => token.length > 0);
  const scored: { readonly station: CraftStationSpec; readonly score: number }[] = [];

  for (const station of stations) {
    let totalScore = 0;
    let allMatched = true;
    for (const token of tokens) {
      const tokenScore = scoreTokenAgainstStation(token, station);
      if (tokenScore <= 0) {
        allMatched = false;
        break;
      }
      totalScore += tokenScore;
    }
    if (allMatched) {
      scored.push({ station, score: totalScore + (pinnedSet.has(station.id) ? 4 : 0) });
    }
  }

  scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.station.order - b.station.order));
  return scored.map((entry) => entry.station);
}

interface StageRecommendationRule {
  readonly stationId: CraftStationId;
  readonly priority: CraftRecommendationItem["priority"];
  readonly reasonKo: string;
  readonly reasonEn: string;
}

const rec = (
  stationId: CraftStationId,
  priority: CraftRecommendationItem["priority"],
  reasonKo: string,
  reasonEn: string,
): StageRecommendationRule => ({ stationId, priority, reasonKo, reasonEn });

const STAGE_RECOMMENDATION_RULES: Readonly<Record<CraftWorkflowStageId, readonly StageRecommendationRule[]>> = {
  conti: [
    rec("bg3d-solar-lighting", "next-step", "콘티 구도를 잡았다면 서울 태양광과 3D 배경 앵글을 먼저 고정하세요.", "Lock 3D background angles and Seoul solar direction right after blocking."),
    rec("character-3d-hair", "next-step", "주요 인물 신장·포즈 턴테이블을 맞춰두면 작화 흔들림이 줄어듭니다.", "Fix lead character proportions and poses before starting line art."),
    rec("drawing-physical-ink", "companion", "배경 없이 빠르게 펜선부터 들어가려면 물리잉크 캔버스로 바로 이동하세요.", "Jump straight to physical ink canvas if you prefer freehand line work."),
    rec("virtual-studio-collab", "finish-check", "콘티 단계에서 편집자·어시스턴트와 컷 호흡을 함께 검토하세요.", "Review panel pacing early with editors in a shared room."),
  ],
  "3d": [
    rec("drawing-physical-ink", "next-step", "추출한 LT 선화·포즈 위에 물리잉크 펜선과 액션 벡터 FX를 얹으세요.", "Ink over extracted LT lines and poses with physical brushes and FX."),
    rec("color-script-p3", "companion", "3D 조명 릭 색온도를 회차 4막 OKLCH 컬러 스크립트와 맞춰두세요.", "Sync your 3D rig color temperature with the 4-act OKLCH color script."),
    rec("webtoon-cut-lettering-cinema", "finish-check", "카메라 화각이 180도 시선 법칙과 세로 스크롤 리듬에 맞는지 확인하세요.", "Audit 3D camera cuts against the 180-degree rule and scroll rhythm."),
    rec("bg3d-solar-lighting", "companion", "캐릭터 포즈가 끝났다면 배경 태양광 리라이트 트립틱을 연결하세요.", "Pair character poses with the Seoul solar relight triptych."),
  ],
  drawing: [
    rec("color-script-p3", "next-step", "펜선과 밑색 뒤 4막 색채 흐름과 LMS 색각 대비를 검수하세요.", "Verify 4-act palette rhythm and LMS color-vision contrast after flats."),
    rec("virtual-studio-collab", "next-step", "채색·배경 어시스턴트를 가상 공방에 초대해 컷별 수정 핀을 모으세요.", "Invite assistants to the studio room for live pin-based page review."),
    rec("webtoon-cut-lettering-cinema", "companion", "완성 컷에 한국어 어절 광학 말풍선과 감정 SFX를 얹어 마감하세요.", "Place Korean optical speech balloons and expressive SFX onto finished cuts."),
    rec("offline-resilience-settlement", "finish-check", "장시간 작화 직후 OPFS 패리티 백업과 120Hz 성능을 점검하세요.", "Run OPFS parity backup and 120Hz frame diagnostics after heavy drawing."),
  ],
  collab: [
    rec("movingtoon-reels-delivery", "next-step", "검수가 끝난 회차를 4K 릴스·플랫폼 출고 패키지와 권리 BOM으로 묶으세요.", "Export approved episodes to 4K reels, platform reflow, and Rights BOM."),
    rec("offline-resilience-settlement", "next-step", "협업 기기 간 CRDT 로그를 압축하고 원고료·3.3% 정산을 마감하세요.", "Compact multi-device CRDT logs and finalize 3.3% payout math."),
    rec("color-script-p3", "finish-check", "출고 직전 다크·라이트 뷰어 경계와 색각 안전 대비를 최종 확인하세요.", "Run final dark/light viewer boundary and color-safety checks."),
    rec("webtoon-cut-lettering-cinema", "companion", "편집자 수정 코멘트를 반영해 말풍선 줄바꿈을 다듬으세요.", "Polish speech-balloon line breaks based on review pin notes."),
  ],
  delivery: [
    rec("offline-resilience-settlement", "next-step", "출고 완료 원고를 OPFS 패리티로 이중 보관하고 정산·번아웃 지표를 점검하세요.", "Archive final cuts with OPFS parity and check payout/burnout metrics."),
    rec("movingtoon-reels-delivery", "companion", "연재 홍보용 4K 무빙툰 릴스와 굿즈 시안을 원고에서 바로 추출하세요.", "Generate 4K promotional movingtoon reels and goods proofs from final cuts."),
    rec("webtoon-cut-lettering-cinema", "finish-check", "이번 화를 마쳤다면 다음 화 콘티와 컷 리듬 설계를 바로 열어보세요.", "Open the next episode storyboard and panel-pacing workspace."),
    rec("drawing-physical-ink", "companion", "보너스 일러스트나 후기 컷을 물리잉크 캔버스에서 빠르게 그려보세요.", "Sketch bonus art or afterword panels in the physical ink studio."),
  ],
};

/** 창작자의 현재 작업 단계에 맞춰 다음으로 실행할 스테이션을 결정론적으로 추천한다. */
export function recommendNextCraftStations(
  currentStageId: CraftWorkflowStageId,
  options?: RecommendCraftStationsOptions,
): readonly CraftRecommendationItem[] {
  const catalog = options?.catalog ?? CRAFT_STATION_CATALOG;
  const activeStationId = options?.activeStationId ?? null;
  const pinnedSet = new Set(options?.pinnedIds ?? []);
  const limit = options?.limit ?? 3;
  assertCount(limit, CRAFT_STATION_CATALOG.length, "추천 한도");
  const rules = STAGE_RECOMMENDATION_RULES[currentStageId];

  const items: { readonly item: CraftRecommendationItem; readonly ruleIndex: number }[] = [];
  rules.forEach((rule, ruleIndex) => {
    if (rule.stationId === activeStationId) return;
    const station = catalog.find((candidate) => candidate.id === rule.stationId);
    if (!station) return;
    items.push({
      ruleIndex,
      item: { station, priority: rule.priority, reasonKo: rule.reasonKo, reasonEn: rule.reasonEn },
    });
  });

  const priorityWeight: Readonly<Record<CraftRecommendationItem["priority"], number>> = {
    "next-step": 3,
    companion: 2,
    "finish-check": 1,
  };

  items.sort((a, b) => {
    const pDiff = priorityWeight[b.item.priority] - priorityWeight[a.item.priority];
    if (pDiff !== 0) return pDiff;
    const pinDiff = Number(pinnedSet.has(b.item.station.id)) - Number(pinnedSet.has(a.item.station.id));
    if (pinDiff !== 0) return pinDiff;
    return a.ruleIndex - b.ruleIndex;
  });

  return items.slice(0, limit).map((entry) => entry.item);
}

/** 즐겨찾기 핀 초기 상태를 불변 객체로 생성한다(Web Storage 미사용). */
export function createInitialPinState(
  initialPinnedIds: readonly CraftStationId[] = [],
  maxPinned: number = DEFAULT_MAX_PINNED_CRAFT_STATIONS,
): CraftLauncherPinState {
  assertCount(maxPinned, CRAFT_STATION_CATALOG.length, "핀 한도");
  const safeMax = maxPinned;
  const validIds = new Set<CraftStationId>(CRAFT_STATION_CATALOG.map((s) => s.id));
  const deduped: CraftStationId[] = [];
  for (const id of initialPinnedIds) {
    if (!validIds.has(id) || deduped.includes(id)) continue;
    if (deduped.length >= safeMax) throw new RangeError("초기 핀 목록이 한도를 넘습니다. 원본 목록은 유지됩니다.");
    deduped.push(id);
  }
  return { storageKind: "in-memory-preferences", persistent: false, pinnedIds: deduped, maxPinned: safeMax, lastToggledId: null, lastAction: "init" };
}

/** 스테이션 즐겨찾기 핀을 순수 불변 방식으로 토글한다. */
export function togglePinnedCraftStation(
  state: CraftLauncherPinState,
  stationId: CraftStationId,
): CraftLauncherPinState {
  assertPinState(state, CRAFT_STATION_CATALOG);
  getCraftStationById(stationId);
  if (state.pinnedIds.includes(stationId)) {
    return {
      ...state,
      pinnedIds: state.pinnedIds.filter((id) => id !== stationId),
      maxPinned: state.maxPinned,
      lastToggledId: stationId,
      lastAction: "unpinned",
    };
  }
  if (state.pinnedIds.length >= state.maxPinned) {
    return {
      ...state,
      pinnedIds: [...state.pinnedIds],
      maxPinned: state.maxPinned,
      lastToggledId: stationId,
      lastAction: "limit-reached",
    };
  }
  return {
    ...state,
    pinnedIds: [...state.pinnedIds, stationId],
    maxPinned: state.maxPinned,
    lastToggledId: stationId,
    lastAction: "pinned",
  };
}

export function isCraftStationPinned(
  state: CraftLauncherPinState,
  stationId: CraftStationId,
): boolean {
  return state.pinnedIds.includes(stationId);
}

/** 핀된 스테이션을 앞쪽으로 배치하되 기존 카탈로그 순서를 보존한다. */
export function orderStationsWithPins(
  stations: readonly CraftStationSpec[],
  pinnedIds: readonly CraftStationId[],
): readonly CraftStationSpec[] {
  if (pinnedIds.length === 0) return [...stations];
  const pinnedRank = new Map<CraftStationId, number>();
  pinnedIds.forEach((id, index) => {
    pinnedRank.set(id, index);
  });

  return [...stations].sort((a, b) => {
    const rankA = pinnedRank.get(a.id);
    const rankB = pinnedRank.get(b.id);
    if (rankA !== undefined && rankB !== undefined) return rankA - rankB;
    if (rankA !== undefined) return -1;
    if (rankB !== undefined) return 1;
    return a.order - b.order;
  });
}

/** 단계별 및 핀 필터 배지용 개수를 계산한다. */
export function computeCraftCatalogCounts(
  stations: readonly CraftStationSpec[],
  pinnedIds: readonly CraftStationId[],
): Readonly<Record<CraftStageFilterId, number>> {
  const pinnedSet = new Set(pinnedIds);
  const counts: Record<CraftStageFilterId, number> = {
    all: stations.length,
    pinned: stations.filter((station) => pinnedSet.has(station.id)).length,
    conti: 0,
    drawing: 0,
    "3d": 0,
    collab: 0,
    delivery: 0,
  };
  for (const station of stations) counts[station.stageId] += 1;
  return counts;
}
