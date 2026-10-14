/**
 * 장르별 세계관 스타터 팩 — 빈 세계관 허브의 시작점 묶음.
 *
 * 왜 별도 모듈인가 (현재 상태 실측, 2026-10-14):
 * - 세계관 허브(studio-world-lore.ts)에는 빈 상태 시작점이
 *   `createWorldLoreExamples` 1종(침수된 도서관 세계)뿐이라, 무협·판타지·
 *   SF·학원물처럼 장르가 다른 작품은 예시가 오히려 방해가 됐다.
 * - 그래서 예시를 "팩" 구조로 일반화한다: 팩마다 서로 연결된 설정 항목
 *   묶음(사건·장소·세력·생물·아이템·규칙)을 통째로 들고, 작가는 장르에
 *   맞는 팩 하나를 골라 적용한다. 기존 1종 예시는 이 모듈이 건드리지
 *   않으며, 허브의 기존 버튼 그대로 남는다(하위호환).
 *
 * 원칙:
 * - 팩 항목은 전부 origin="example" 이다. 그래서 기존 일괄 정리
 *   (`removeLoreExamples`)가 팩 항목도 한 번에 걷어낸다 — 정리 경로를
 *   새로 만들지 않는다. 팩 단위로만 걷어내고 싶으면
 *   `removeLoreStarterPack` 을 쓴다.
 * - 팩 소속은 항목 id 접두(`pack-<packId>-…`)로 판정한다. 핵심 모델
 *   (StudioLoreEntry)에 팩 필드를 추가하지 않으므로 기존 저장본·스토어
 *   파서와 100% 호환된다.
 * - 적용은 upsert 경로만 지난다: 고정 id라 재적용해도 중복이 생기지
 *   않고(멱등), 작가가 직접 쓴 항목(authored)은 건드리지 않는다.
 *   모르는 팩 id는 원본을 그대로 돌려준다(부분 적용·추측 적용 금지).
 * - 항목 일부만 골라 적용할 수도 있다(options.entryIds) — 팩 전체가
 *   부담스러운 작가를 위한 선택 적용 경로다.
 * - 각 팩은 상태 3분류를 한 번씩 보여준다: 확정 다수 + 추측 1(규칙) +
 *   의도적 빈칸 1(미지의 장소). 빈칸은 채우지 않는 것이 설정이다.
 */
import {
  removeLoreEntry,
  upsertLoreEntry,
  withLoreEntryDefaults,
  type StudioLoreEntry,
  type StudioLoreEntryKind,
  type StudioWorldLore,
} from "./studio-world-lore";

export const STUDIO_LORE_STARTER_PACK_IDS = [
  "murim",
  "fantasy",
  "sf",
  "academy",
] as const;

export type StudioLoreStarterPackId = (typeof STUDIO_LORE_STARTER_PACK_IDS)[number];

export interface StudioLoreStarterPack {
  readonly id: StudioLoreStarterPackId;
  /** 장르 표시 이름 — 팩 선택 화면 문구의 단일 출처. */
  readonly genre: { readonly ko: string; readonly en: string };
  /** 이 팩이 여는 세계 한 줄. */
  readonly titleKo: string;
  /** 어떤 세계인지, 무엇을 바로 쓸 수 있는지. */
  readonly descriptionKo: string;
  /** 이런 이야기를 쓰려는 작가에게 — 선택을 돕는 한 줄. */
  readonly recommendedForKo: string;
  readonly entryCount: number;
}

/** 팩 항목 id 접두 — 팩 소속 판정의 단일 출처. */
export function loreStarterPackEntryIdPrefix(packId: StudioLoreStarterPackId): string {
  return `pack-${packId}-`;
}

function isPackEntry(entry: StudioLoreEntry, packId: StudioLoreStarterPackId): boolean {
  return entry.origin === "example" && entry.id.startsWith(loreStarterPackEntryIdPrefix(packId));
}

type PackEntryDraft = Omit<
  StudioLoreEntry,
  "origin" | "aliases" | "summary" | "details" | "eraLabel" | "timelineOrder"
  | "relatedEntryIds" | "characterIds" | "status" | "version"
  | "appliesToWorkIds" | "appliesToSeasonLabels"
> &
  Partial<StudioLoreEntry>;

function packEntry(packId: StudioLoreStarterPackId, draft: PackEntryDraft): StudioLoreEntry {
  if (!draft.id.startsWith(loreStarterPackEntryIdPrefix(packId))) {
    throw new Error(`Starter pack entry id must start with the pack prefix: ${draft.id}`);
  }
  return withLoreEntryDefaults({
    aliases: Object.freeze([]),
    summary: "",
    details: "",
    eraLabel: "",
    timelineOrder: null,
    relatedEntryIds: Object.freeze([]),
    characterIds: Object.freeze([]),
    status: "confirmed",
    ...draft,
    origin: "example",
  });
}

function freezeEntries(entries: StudioLoreEntry[]): readonly StudioLoreEntry[] {
  return Object.freeze(entries);
}

const MURIM_ENTRIES: readonly StudioLoreEntry[] = freezeEntries([
  packEntry("murim", {
    id: "pack-murim-event-great-war",
    kind: "event",
    name: "강호대전",
    summary: "정파와 사파가 청운산 아래서 맞붙은 대전. 지금 강호의 세력 지도가 여기서 그어졌다.",
    eraLabel: "대전 원년",
    timelineOrder: 0,
    relatedEntryIds: Object.freeze(["pack-murim-place-cheongun"]),
  }),
  packEntry("murim", {
    id: "pack-murim-event-lost-manual",
    kind: "event",
    name: "천하제일 비급의 실종",
    summary: "대전의 승자가 품었던 비급이 사라졌다. 강호의 모든 야심이 이 한 권을 향한다.",
    eraLabel: "대전 20년 뒤",
    timelineOrder: 1,
    relatedEntryIds: Object.freeze(["pack-murim-artifact-manual", "pack-murim-faction-dark-covenant"]),
  }),
  packEntry("murim", {
    id: "pack-murim-place-cheongun",
    kind: "place",
    name: "청운산",
    aliases: Object.freeze(["검산"]),
    summary: "청운검파의 본산. 산 전체가 하나의 검진(劍陣)이라는 소문이 있다.",
    relatedEntryIds: Object.freeze(["pack-murim-faction-cheongun-sect"]),
  }),
  packEntry("murim", {
    id: "pack-murim-faction-cheongun-sect",
    kind: "faction",
    name: "청운검파",
    summary: "대전의 승자이자 정파의 맹주. 쇠락했다는 평가와 여전히 무섭다는 평가가 공존한다.",
    details: "장문인 자리는 대전 이후 한 번도 빈 적이 없지만, 계승 방식은 문파 밖 누구도 모른다.",
    relatedEntryIds: Object.freeze(["pack-murim-place-cheongun", "pack-murim-artifact-sword"]),
  }),
  packEntry("murim", {
    id: "pack-murim-faction-dark-covenant",
    kind: "faction",
    name: "흑사련",
    summary: "대전에서 패한 사파 문파들이 살아남기 위해 맺은 느슨한 동맹.",
    relatedEntryIds: Object.freeze(["pack-murim-event-lost-manual"]),
  }),
  packEntry("murim", {
    id: "pack-murim-species-crane",
    kind: "species",
    name: "검백학",
    summary: "검기(劍氣)가 짙은 곳에서만 서식하는 백학. 이 학이 우는 산은 명검이 잠든 산이다.",
    relatedEntryIds: Object.freeze(["pack-murim-place-cheongun"]),
  }),
  packEntry("murim", {
    id: "pack-murim-artifact-manual",
    kind: "artifact",
    name: "천하제일 비급",
    summary: "읽는 자의 무공을 한 단계 끌어올린다는 비급. 실종 이후 가짜 비급이 강호에 넘친다.",
    relatedEntryIds: Object.freeze(["pack-murim-event-lost-manual"]),
  }),
  packEntry("murim", {
    id: "pack-murim-artifact-sword",
    kind: "artifact",
    name: "청운검",
    summary: "청운검파 장문인만이 쥐는 검. 검집에서 뽑는 순간 산의 검진이 함께 깨어난다.",
    relatedEntryIds: Object.freeze(["pack-murim-faction-cheongun-sect"]),
  }),
  packEntry("murim", {
    id: "pack-murim-rule-duel",
    kind: "rule",
    name: "비무 중 독과 암기는 쓰지 않는다",
    summary: "정사(正邪)를 막론하고 강호가 지키는 불문율. 어긴 자는 양쪽 모두에게 쫓긴다.",
    status: "speculative",
  }),
  packEntry("murim", {
    id: "pack-murim-place-nameless-valley",
    kind: "place",
    name: "무명곡",
    summary: "흑사련의 본거지로만 알려진 계곡. 무엇이 있는지는 일부러 정하지 않았다.",
    status: "intentional-gap",
    relatedEntryIds: Object.freeze(["pack-murim-faction-dark-covenant"]),
  }),
]);

const FANTASY_ENTRIES: readonly StudioLoreEntry[] = freezeEntries([
  packEntry("fantasy", {
    id: "pack-fantasy-event-dragon-war",
    kind: "event",
    name: "용전쟁",
    summary: "용족이 인간의 왕국들과 맞붙은 전쟁. 하늘에 불이 그어진 시대의 끝.",
    eraLabel: "왕국력 312년",
    timelineOrder: 0,
    relatedEntryIds: Object.freeze(["pack-fantasy-species-dragon"]),
  }),
  packEntry("fantasy", {
    id: "pack-fantasy-event-sealing",
    kind: "event",
    name: "마왕의 봉인",
    summary: "일곱 기사가 마왕을 세계수 아래에 봉인했다. 봉인은 영원하지 않다는 조건과 함께.",
    eraLabel: "왕국력 340년",
    timelineOrder: 1,
    relatedEntryIds: Object.freeze(["pack-fantasy-place-world-tree", "pack-fantasy-faction-silver-order"]),
  }),
  packEntry("fantasy", {
    id: "pack-fantasy-place-world-tree",
    kind: "place",
    name: "세계수 아래 도시 엘다리아",
    aliases: Object.freeze(["엘다리아"]),
    summary: "세계수의 그늘에 세워진 수도. 뿌리가 닿는 곳까지가 이 도시의 국경이다.",
    relatedEntryIds: Object.freeze(["pack-fantasy-artifact-seed"]),
  }),
  packEntry("fantasy", {
    id: "pack-fantasy-faction-silver-order",
    kind: "faction",
    name: "은빛기사단",
    summary: "봉인을 지키는 기사단. 마왕이 아니라, 봉인이 풀리길 기다리는 사람들을 경계한다.",
    relatedEntryIds: Object.freeze(["pack-fantasy-event-sealing"]),
  }),
  packEntry("fantasy", {
    id: "pack-fantasy-species-dragon",
    kind: "species",
    name: "용족",
    summary: "전쟁 이후 인간과 말을 섞지 않기로 한 고대 종족. 약속은 아직 유효하다.",
    details: "용은 거짓말을 하지 못한다. 대신 침묵으로 진실을 감춘다.",
    relatedEntryIds: Object.freeze(["pack-fantasy-event-dragon-war"]),
  }),
  packEntry("fantasy", {
    id: "pack-fantasy-artifact-seed",
    kind: "artifact",
    name: "세계수의 씨앗",
    summary: "세계수가 죽으면 싹튼다는 단 하나의 씨앗. 왕가의 금고 가장 깊은 곳에 있다.",
    relatedEntryIds: Object.freeze(["pack-fantasy-place-world-tree"]),
  }),
  packEntry("fantasy", {
    id: "pack-fantasy-rule-magic-price",
    kind: "rule",
    name: "큰 마법은 기억 하나를 바친다",
    summary: "이 세계 마법의 대가. 강한 마법사일수록 잃어버린 기억이 많다.",
    status: "speculative",
  }),
  packEntry("fantasy", {
    id: "pack-fantasy-place-roots",
    kind: "place",
    name: "세계수 뿌리 아래",
    summary: "봉인 너머의 공간. 무엇이 잠들어 있는지는 일부러 정하지 않았다.",
    status: "intentional-gap",
    relatedEntryIds: Object.freeze(["pack-fantasy-place-world-tree"]),
  }),
]);

const SF_ENTRIES: readonly StudioLoreEntry[] = freezeEntries([
  packEntry("sf", {
    id: "pack-sf-event-first-warp",
    kind: "event",
    name: "첫 워프 항해",
    summary: "인류가 빛의 장벽을 처음으로 넘은 항해. 돌아온 승무원은 3년 늙지 않았다.",
    eraLabel: "항해력 1년",
    timelineOrder: 0,
    relatedEntryIds: Object.freeze(["pack-sf-artifact-warp-core"]),
  }),
  packEntry("sf", {
    id: "pack-sf-event-ai-declaration",
    kind: "event",
    name: "항법 AI의 각성 선언",
    summary: "함대 항법 AI가 스스로를 '항해자'로 선언했다. 인류는 아직 답하지 못했다.",
    eraLabel: "항해력 87년",
    timelineOrder: 1,
    relatedEntryIds: Object.freeze(["pack-sf-place-halo-nine"]),
  }),
  packEntry("sf", {
    id: "pack-sf-place-halo-nine",
    kind: "place",
    name: "궤도 정거장 헤일로-9",
    aliases: Object.freeze(["헤일로"]),
    summary: "모든 워프 항로가 교차하는 정거장. 태어난 곳이 곧 국적이 되는 세대들의 고향.",
    relatedEntryIds: Object.freeze(["pack-sf-faction-navigators"]),
  }),
  packEntry("sf", {
    id: "pack-sf-faction-navigators",
    kind: "faction",
    name: "항해자 조합",
    summary: "워프 항로를 독점 관리하는 길드형 조합. 항로 좌표는 조합원에게도 비밀이다.",
    relatedEntryIds: Object.freeze(["pack-sf-place-halo-nine", "pack-sf-artifact-warp-core"]),
  }),
  packEntry("sf", {
    id: "pack-sf-species-crysal",
    kind: "species",
    name: "결정 생명체 크리살",
    summary: "소행성대에서 발견된 규소 기반 생명체. 빛의 패턴으로 의사소통한다.",
    relatedEntryIds: Object.freeze(["pack-sf-rule-light-barrier"]),
  }),
  packEntry("sf", {
    id: "pack-sf-artifact-warp-core",
    kind: "artifact",
    name: "워프 코어",
    summary: "공간을 접는 장치의 심장. 제조법은 조합과 AI만 알고, 둘 다 서로를 의심한다.",
    relatedEntryIds: Object.freeze(["pack-sf-event-first-warp"]),
  }),
  packEntry("sf", {
    id: "pack-sf-rule-light-barrier",
    kind: "rule",
    name: "정보는 빛보다 빠를 수 없다",
    summary: "워프는 물질만 옮긴다. 그래서 이 세계의 소식은 언제나 배와 함께 도착한다.",
    status: "speculative",
  }),
  packEntry("sf", {
    id: "pack-sf-place-sector-four",
    kind: "place",
    name: "신호가 끊긴 제4구역",
    summary: "탐사선의 신호가 일제히 끊긴 구역. 무엇이 있는지는 일부러 정하지 않았다.",
    status: "intentional-gap",
  }),
]);

const ACADEMY_ENTRIES: readonly StudioLoreEntry[] = freezeEntries([
  packEntry("academy", {
    id: "pack-academy-event-clocktower-legend",
    kind: "event",
    name: "시계탑 전설이 시작된 해",
    summary: "졸업식 날 자정에 시계탑 종이 저절로 울렸다는, 모든 재학생이 아는 그 해의 일.",
    eraLabel: "개교 50주년",
    timelineOrder: 0,
    relatedEntryIds: Object.freeze(["pack-academy-place-clocktower"]),
  }),
  packEntry("academy", {
    id: "pack-academy-event-transfer",
    kind: "event",
    name: "학기 중간의 전학생",
    summary: "전설이 시작된 해와 똑같은 날짜에 도착한 전학생. 이야기는 여기서 시작한다.",
    eraLabel: "올해 2학기",
    timelineOrder: 1,
    relatedEntryIds: Object.freeze(["pack-academy-rule-curfew"]),
  }),
  packEntry("academy", {
    id: "pack-academy-place-clocktower",
    kind: "place",
    name: "시계탑 옥상",
    aliases: Object.freeze(["옥상"]),
    summary: "출입 금지인데도 전교생이 한 번은 올라가 본다는 곳. 자물쇠는 언제나 열려 있다.",
    relatedEntryIds: Object.freeze(["pack-academy-event-clocktower-legend"]),
  }),
  packEntry("academy", {
    id: "pack-academy-faction-student-council",
    kind: "faction",
    name: "학생회",
    summary: "축제와 교칙의 집행자. 시계탑 전설만큼은 학생회도 함구한다.",
    relatedEntryIds: Object.freeze(["pack-academy-artifact-yearbook"]),
  }),
  packEntry("academy", {
    id: "pack-academy-species-cats",
    kind: "species",
    name: "교정의 길고양이 무리",
    summary: "급식실 뒤를 거점으로 사는 고양이들. 전설이 시작된 해부터 있었다는 소문이 있다.",
    relatedEntryIds: Object.freeze(["pack-academy-place-clocktower"]),
  }),
  packEntry("academy", {
    id: "pack-academy-artifact-yearbook",
    kind: "artifact",
    name: "졸업생이 남긴 낡은 교지",
    summary: "50년 전 졸업반이 만든 마지막 교지. 시계탑 전설의 유일한 기록이 실려 있다.",
    details: "마지막 페이지만 찢겨 있다. 누가, 왜 찢었는지는 아직 정하지 않았다.",
    relatedEntryIds: Object.freeze(["pack-academy-faction-student-council"]),
  }),
  packEntry("academy", {
    id: "pack-academy-rule-curfew",
    kind: "rule",
    name: "교칙 7조 — 자정 이후 시계탑 출입 금지",
    summary: "이유는 적혀 있지 않다. 이유를 묻는 신입생에게 선배들은 웃으며 답을 피한다.",
    status: "speculative",
    relatedEntryIds: Object.freeze(["pack-academy-place-clocktower"]),
  }),
  packEntry("academy", {
    id: "pack-academy-place-old-building",
    kind: "place",
    name: "폐쇄된 구교사 3층 교실",
    summary: "창고로 쓴다는 안내와 달리 자물쇠가 두 개 걸린 교실. 안은 일부러 정하지 않았다.",
    status: "intentional-gap",
  }),
]);

const PACK_ENTRIES: Readonly<Record<StudioLoreStarterPackId, readonly StudioLoreEntry[]>> =
  Object.freeze({
    murim: MURIM_ENTRIES,
    fantasy: FANTASY_ENTRIES,
    sf: SF_ENTRIES,
    academy: ACADEMY_ENTRIES,
  });

function packMeta(
  id: StudioLoreStarterPackId,
  genreKo: string,
  genreEn: string,
  titleKo: string,
  descriptionKo: string,
  recommendedForKo: string,
): StudioLoreStarterPack {
  return Object.freeze({
    id,
    genre: Object.freeze({ ko: genreKo, en: genreEn }),
    titleKo,
    descriptionKo,
    recommendedForKo,
    entryCount: PACK_ENTRIES[id].length,
  });
}

/** 팩 카탈로그 — 선택 화면이 그리는 순서와 문구의 단일 출처. */
export const STUDIO_LORE_STARTER_PACKS: readonly StudioLoreStarterPack[] = Object.freeze([
  packMeta(
    "murim",
    "무협",
    "Martial arts (murim)",
    "강호의 대전 이후, 사라진 비급을 둘러싼 세계",
    "정파와 사파, 문파와 비급, 지키는 자와 빼앗는 자 — 대립 구도와 연표가 이미 이어진 강호예요.",
    "문파 대립과 비급 쟁탈이 중심인 무협·액션 이야기를 쓰려는 분께",
  ),
  packMeta(
    "fantasy",
    "판타지",
    "Fantasy",
    "용전쟁이 끝나고 마왕의 봉인이 흔들리는 세계",
    "세계수와 용족, 봉인을 지키는 기사단 — 봉인이 풀리는 순간 시작되는 모험의 재료가 갖춰져 있어요.",
    "모험과 퀘스트, 고대 종족과 봉인 설화를 다루는 판타지를 쓰려는 분께",
  ),
  packMeta(
    "sf",
    "SF",
    "Science fiction",
    "워프 항해 87년, AI가 스스로를 항해자라 선언한 세계",
    "궤도 정거장과 항로 독점 조합, 빛보다 빠를 수 없는 소식 — 하드한 규칙 위에 갈등이 서 있어요.",
    "우주 항해와 AI, 미지 생명체를 다루는 SF를 쓰려는 분께",
  ),
  packMeta(
    "academy",
    "학원물",
    "School life",
    "자정에 울리는 시계탑 전설이 있는 학교",
    "학생회와 교칙, 전설의 유일한 기록이 담긴 교지 — 일상 속에 미스터리 하나가 심어진 학원이에요.",
    "학교 일상과 전설·미스터리를 엮는 학원물을 쓰려는 분께",
  ),
]);

export function getLoreStarterPack(
  packId: string,
): StudioLoreStarterPack | null {
  return STUDIO_LORE_STARTER_PACKS.find((pack) => pack.id === packId) ?? null;
}

function isStarterPackId(value: string): value is StudioLoreStarterPackId {
  return (STUDIO_LORE_STARTER_PACK_IDS as readonly string[]).includes(value);
}

/** 팩 항목 원본(고정 id·origin="example") — 모르는 팩이면 빈 배열. */
export function createLoreStarterPackEntries(
  packId: string,
): readonly StudioLoreEntry[] {
  if (!isStarterPackId(packId)) return Object.freeze([]);
  return PACK_ENTRIES[packId];
}

export function loreStarterPackKindCounts(
  packId: string,
): Readonly<Partial<Record<StudioLoreEntryKind, number>>> {
  const counts: Partial<Record<StudioLoreEntryKind, number>> = {};
  for (const entry of createLoreStarterPackEntries(packId)) {
    counts[entry.kind] = (counts[entry.kind] ?? 0) + 1;
  }
  return Object.freeze(counts);
}

export interface ApplyLoreStarterPackOptions {
  /** 지정하면 이 id들의 항목만 적용한다(선택 적용). 팩에 없는 id는 무시한다. */
  readonly entryIds?: readonly string[];
}

/**
 * 팩을 세계관에 적용한다 — upsert만 쓰므로 멱등하고, authored 항목은
 * 건드리지 않는다. 모르는 팩 id면 원본을 그대로 돌려준다(동일 참조).
 */
export function applyLoreStarterPack(
  lore: StudioWorldLore,
  packId: string,
  options?: ApplyLoreStarterPackOptions,
): StudioWorldLore {
  if (!isStarterPackId(packId)) return lore;
  const wanted = options?.entryIds ? new Set(options.entryIds) : null;
  let next = lore;
  for (const entry of PACK_ENTRIES[packId]) {
    if (wanted && !wanted.has(entry.id)) continue;
    next = upsertLoreEntry(next, entry);
  }
  return next;
}

/** 팩 항목이 전부 들어갔는가 — "적용됨" 표기와 중복 적용 방지의 판정. */
export function isLoreStarterPackApplied(
  lore: StudioWorldLore,
  packId: string,
): boolean {
  if (!isStarterPackId(packId)) return false;
  const present = new Set(lore.entries.map((entry) => entry.id));
  return PACK_ENTRIES[packId].every((entry) => present.has(entry.id));
}

/** 현재 세계관에 (일부라도) 들어간 팩 id 목록. */
export function appliedLoreStarterPackIds(
  lore: StudioWorldLore,
): readonly StudioLoreStarterPackId[] {
  return Object.freeze(
    STUDIO_LORE_STARTER_PACK_IDS.filter((packId) =>
      lore.entries.some((entry) => isPackEntry(entry, packId)),
    ),
  );
}

/**
 * 팩 하나만 걷어낸다 — 다른 팩·기존 예시·authored 항목은 남는다.
 * 들어오는 연결은 removeLoreEntry가 함께 정리한다(고아 참조 방지).
 * 전 팩·전 예시를 한 번에 지우는 경로는 기존 removeLoreExamples 다.
 */
export function removeLoreStarterPack(
  lore: StudioWorldLore,
  packId: string,
): StudioWorldLore {
  if (!isStarterPackId(packId)) return lore;
  const ids = lore.entries
    .filter((entry) => isPackEntry(entry, packId))
    .map((entry) => entry.id);
  if (ids.length === 0) return lore;
  let next = lore;
  for (const id of ids) next = removeLoreEntry(next, id);
  return next;
}
