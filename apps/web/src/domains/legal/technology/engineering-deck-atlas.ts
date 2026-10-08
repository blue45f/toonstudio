import { ENGINEERING_ATLAS_ENTRIES, findAtlasEntry } from "./engineering-atlas-content";
import {
  ENGINEERING_ATLAS_CATEGORIES,
  ENGINEERING_ATLAS_LINK_KIND_LABEL,
  type EngineeringAtlasCategoryId,
  type EngineeringAtlasEntry,
  type EngineeringAtlasSample,
  type EngineeringCodeLanguage,
} from "./engineering-atlas-types";
import type { Localize } from "./engineering-deck-model";
import type { EngineeringDiagram } from "./engineering-diagram-types";
import type { EngineeringStatus, LocalizedText } from "./engineering-story-content";
import type { TalkAtlasRef } from "./engineering-talk-deck";

/**
 * 기술 도감 카드를 발표 슬라이드로 옮기는 순수 함수 모음.
 *
 * - 도감이 정본이다. 슬라이드는 카드의 도식·코드·사용처를 해석해 보여줄 뿐 내용을 복제하지 않는다.
 * - 카드마다 도식(1) → 코드(샘플 수, 최대 2) → 사용처(1) 순서로 슬라이드를 만든다.
 * - 번역은 호출자가 넘긴 `localize`가 맡는다. 코드는 번역하지 않고 로케일에 맞는 원문(`code`/`codeEn`)을 고른다.
 */

export type DeckAtlasView = TalkAtlasRef["view"];

export const DECK_ATLAS_VIEWS: readonly DeckAtlasView[] = ["diagram", "code", "usage"];

/** 카드 하나에서 코드 슬라이드로 보여줄 샘플의 최대 개수. */
export const DECK_ATLAS_MAX_CODE_SLIDES = 2;
/** 사용처 슬라이드에 올리는 참고 링크 수(카드의 앞쪽 링크가 가장 중요하다). */
export const DECK_ATLAS_MAX_LINKS = 2;

export interface DeckAtlasUsage {
  readonly feature: string;
  readonly role: string;
  readonly paths: readonly string[];
  readonly route?: string;
}

export interface DeckAtlasLink {
  readonly title: string;
  readonly url: string;
  /** 링크 종류의 사람이 읽는 이름(공식 문서·표준 등). */
  readonly kind: string;
}

export interface DeckAtlasFact {
  readonly value: string;
  readonly label: string;
  readonly source: string;
}

export interface DeckAtlasCode {
  readonly title: string;
  readonly language: EngineeringCodeLanguage;
  readonly code: string;
  readonly explain: string;
  /** `simplified` 샘플의 실제 구현 경로. */
  readonly source?: string;
  /** 0부터 시작하는 샘플 번호와 카드의 코드 슬라이드 수. */
  readonly index: number;
  readonly count: number;
}

/** 슬라이드가 해석한 도감 카드의 한 면. 화면·인쇄·오프라인 발표본이 같은 값을 쓴다. */
export interface DeckAtlas {
  readonly entryId: string;
  readonly view: DeckAtlasView;
  readonly name: string;
  readonly title: string;
  readonly tagline: string;
  readonly categoryId: EngineeringAtlasCategoryId;
  readonly categoryLabel: string;
  readonly status: EngineeringStatus;
  readonly keyPoints: readonly string[];
  readonly technologies: readonly string[];
  /** `diagram` 면: 렌더러가 그대로 그리는 도식 명세. */
  readonly diagram?: EngineeringDiagram;
  /** `code` 면. */
  readonly code?: DeckAtlasCode;
  /** `usage` 면. */
  readonly usage?: readonly DeckAtlasUsage[];
  readonly facts?: readonly DeckAtlasFact[];
  readonly links?: readonly DeckAtlasLink[];
}

/** 모델이 `DeckSlide`로 합치는, 도감 카드에서 파생된 슬라이드 조각. */
export interface DeckAtlasSlidePart {
  readonly id: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly lead: string;
  readonly points: readonly string[];
  readonly notes: string;
  readonly sectionId: string;
  readonly stack: readonly string[];
  readonly status: EngineeringStatus;
  readonly chapterId?: string;
  readonly evidence: readonly string[];
  readonly atlas: DeckAtlas;
}

/** 모델 생성 옵션. 코드는 번역하지 않으므로 어느 쪽 원문을 쓸지 알아야 한다. */
export interface DeckBuildOptions {
  /** 활성 로케일(예: `ko`, `en-US`). 없으면 한국어 원문을 쓴다. */
  readonly locale?: string;
}

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

const LABELS = {
  usage: t("서비스에서 쓰인 곳", "Where it is used"),
  code: t("코드", "Code"),
  pitch: t("30초 설명", "30-second pitch"),
  analogy: t("쉬운 비유", "Plain analogy"),
  pitfall: t("흔한 오해", "Common misconception"),
  questions: t("자주 받는 질문", "Frequent questions"),
  source: t("단순화 전 원본", "Simplified from"),
  teaching: t("교육용 최소 예제입니다.", "A minimal teaching example."),
  simplified: t("실제 구현을 줄여 옮긴 예제입니다.", "A simplified copy of the real implementation."),
} as const;

export function isKoreanLocale(locale: string | undefined): boolean {
  return locale === undefined || locale.toLowerCase().startsWith("ko");
}

/** 카드가 만드는 슬라이드 id. 주소의 `#slide-<id>` 와 같은 값이라 한 번 정하면 바꾸지 않는다. */
export function atlasSlideId(entryId: string, view: DeckAtlasView, sampleIndex = 0): string {
  return view === "code" ? `atlas-${entryId}-code-${sampleIndex + 1}` : `atlas-${entryId}-${view}`;
}

export function atlasCodeSlideCount(entry: Pick<EngineeringAtlasEntry, "samples">): number {
  return Math.min(entry.samples.length, DECK_ATLAS_MAX_CODE_SLIDES);
}

/** 카드 한 장이 만드는 슬라이드 id 목록(도식 → 코드 → 사용처). 번역 없이 계산한다. */
export function atlasEntrySlideIds(entry: Pick<EngineeringAtlasEntry, "id" | "samples">): readonly string[] {
  const ids = [atlasSlideId(entry.id, "diagram")];
  for (let index = 0; index < atlasCodeSlideCount(entry); index += 1) ids.push(atlasSlideId(entry.id, "code", index));
  ids.push(atlasSlideId(entry.id, "usage"));
  return ids;
}

export function atlasEntrySlideCount(entry: Pick<EngineeringAtlasEntry, "samples">): number {
  return atlasCodeSlideCount(entry) + 2;
}

/**
 * 부록 트랙의 카드 순서: 카테고리 순서대로, 같은 카테고리 안에서는 원래 순서를 지킨다.
 * 도감 집계 모듈도 같은 순서로 정렬하지만, 카테고리가 흩어져도 구간이 갈라지지 않도록 여기서 한 번 더 보장한다.
 */
export function orderedAtlasEntries(entries: readonly EngineeringAtlasEntry[] = ENGINEERING_ATLAS_ENTRIES): readonly EngineeringAtlasEntry[] {
  const order = new Map<EngineeringAtlasCategoryId, number>(ENGINEERING_ATLAS_CATEGORIES.map((category, index) => [category.id, index]));
  return entries
    .map((entry, position) => ({ entry, position }))
    .sort((a, b) => (order.get(a.entry.category) ?? 0) - (order.get(b.entry.category) ?? 0) || a.position - b.position)
    .map(({ entry }) => entry);
}

export function atlasTrackSlideIds(entries: readonly EngineeringAtlasEntry[] = ENGINEERING_ATLAS_ENTRIES): readonly string[] {
  return orderedAtlasEntries(entries).flatMap(atlasEntrySlideIds);
}

export function atlasTrackSlideCount(entries: readonly EngineeringAtlasEntry[] = ENGINEERING_ATLAS_ENTRIES): number {
  return entries.reduce((sum, entry) => sum + atlasEntrySlideCount(entry), 0);
}

/** 카드의 첫 슬라이드(도식) 위치. 모델을 만들지 않고 계산한다. 도감에 없으면 null. */
export function atlasCardStartIndex(entryId: string, entries: readonly EngineeringAtlasEntry[] = ENGINEERING_ATLAS_ENTRIES): number | null {
  let start = 0;
  for (const entry of orderedAtlasEntries(entries)) {
    if (entry.id === entryId) return start;
    start += atlasEntrySlideCount(entry);
  }
  return null;
}

/** 도감에 없는 카드를 가리키면 조용히 넘어가지 않고 어느 슬라이드인지 밝혀 던진다(테스트가 잡는다). */
export function requireAtlasEntry(entryId: string, context: string): EngineeringAtlasEntry {
  const entry = findAtlasEntry(entryId);
  if (!entry) throw new Error(`Unknown atlas entry "${entryId}" referenced by ${context}`);
  return entry;
}

function categoryLabelOf(categoryId: EngineeringAtlasCategoryId, localize: Localize): string {
  const meta = ENGINEERING_ATLAS_CATEGORIES.find((category) => category.id === categoryId);
  return meta ? localize(meta.label) : categoryId;
}

function uniqueUsagePaths(entry: EngineeringAtlasEntry): readonly string[] {
  return [...new Set(entry.usage.flatMap((usage) => usage.paths))];
}

function joinNotes(parts: readonly (string | false | undefined)[]): string {
  return parts.filter((part): part is string => typeof part === "string" && part.length > 0).join("\n\n");
}

function pluralPlaces(count: number, localize: Localize): string {
  return localize(t(`서비스의 ${count}곳에서 쓰입니다`, `Used in ${count} ${count === 1 ? "place" : "places"} of the service`));
}

function codeOf(sample: EngineeringAtlasSample, options: DeckBuildOptions | undefined): string {
  return isKoreanLocale(options?.locale) ? sample.code : (sample.codeEn ?? sample.code);
}

/** 카드의 한 면을 해석한다. 슬라이드 조각과 talk 슬라이드의 `atlas` 참조가 같은 함수를 쓴다. */
export function resolveDeckAtlas(
  entry: EngineeringAtlasEntry,
  view: DeckAtlasView,
  sampleIndex: number,
  localize: Localize,
  options?: DeckBuildOptions,
): DeckAtlas {
  const base = {
    entryId: entry.id,
    view,
    name: entry.name,
    title: localize(entry.title),
    tagline: localize(entry.tagline),
    categoryId: entry.category,
    categoryLabel: categoryLabelOf(entry.category, localize),
    status: entry.status,
    keyPoints: entry.keyPoints.map(localize),
    technologies: entry.technologies,
  } as const;

  if (view === "diagram") return { ...base, diagram: entry.diagram };

  if (view === "code") {
    const count = atlasCodeSlideCount(entry);
    const index = Math.min(Math.max(0, Math.floor(sampleIndex)), Math.max(0, count - 1));
    const sample = entry.samples[index];
    if (!sample) throw new Error(`Atlas entry "${entry.id}" has no code sample for the code view`);
    return {
      ...base,
      code: {
        title: localize(sample.title),
        language: sample.language,
        code: codeOf(sample, options),
        explain: localize(sample.explain),
        source: sample.source,
        index,
        count,
      },
    };
  }

  return {
    ...base,
    usage: entry.usage.map((usage) => ({
      feature: localize(usage.feature),
      role: localize(usage.role),
      paths: usage.paths,
      route: usage.route,
    })),
    facts: entry.facts?.map((fact) => ({ value: fact.value, label: localize(fact.label), source: fact.source })),
    links: entry.links.slice(0, DECK_ATLAS_MAX_LINKS).map((link) => ({
      title: link.title,
      url: link.url,
      kind: localize(ENGINEERING_ATLAS_LINK_KIND_LABEL[link.kind]),
    })),
  };
}

/** 도감 부록 트랙의 슬라이드 조각 하나. 시간·순서는 모델이 붙인다. */
export function buildAtlasSlidePart(
  entry: EngineeringAtlasEntry,
  view: DeckAtlasView,
  sampleIndex: number,
  localize: Localize,
  options?: DeckBuildOptions,
): DeckAtlasSlidePart {
  const atlas = resolveDeckAtlas(entry, view, sampleIndex, localize, options);
  const category = atlas.categoryLabel;
  const common = {
    id: atlasSlideId(entry.id, view, atlas.code?.index ?? 0),
    sectionId: entry.category,
    stack: entry.technologies,
    status: entry.status,
    chapterId: entry.chapterIds[0],
  } as const;

  if (view === "diagram") {
    return {
      ...common,
      eyebrow: `${category} · ${entry.name}`,
      title: `${entry.name} · ${atlas.title}`,
      lead: atlas.tagline,
      points: atlas.keyPoints,
      notes: joinNotes([
        entry.talk.pitch && `${localize(LABELS.pitch)}\n${localize(entry.talk.pitch)}`,
        entry.talk.analogy && `${localize(LABELS.analogy)}\n${localize(entry.talk.analogy)}`,
        entry.talk.pitfall && `${localize(LABELS.pitfall)}\n${localize(entry.talk.pitfall)}`,
      ]) || atlas.tagline,
      evidence: uniqueUsagePaths(entry),
      atlas,
    };
  }

  if (view === "code") {
    const code = atlas.code;
    const sample = entry.samples[code?.index ?? 0];
    const sourceNote = code?.source ? `${localize(LABELS.source)}: ${code.source}` : undefined;
    return {
      ...common,
      eyebrow: `${category} · ${entry.name} · ${localize(LABELS.code)} ${(code?.index ?? 0) + 1}/${code?.count ?? 1}`,
      title: `${entry.name} · ${code?.title ?? ""}`,
      lead: code?.explain ?? atlas.tagline,
      points: [],
      notes: joinNotes([
        code?.explain,
        sample && localize(sample.kind === "teaching" ? LABELS.teaching : LABELS.simplified),
        sourceNote,
      ]) || atlas.tagline,
      evidence: code?.source ? [code.source] : [],
      atlas,
    };
  }

  const questions = entry.talk.questions.map((item) => `Q. ${localize(item.question)}\nA. ${localize(item.answer)}`);
  return {
    ...common,
    eyebrow: `${category} · ${entry.name} · ${localize(LABELS.usage)}`,
    title: `${entry.name} · ${localize(LABELS.usage)}`,
    lead: pluralPlaces(entry.usage.length, localize),
    points: [],
    notes: joinNotes([
      questions.length > 0 && `${localize(LABELS.questions)}\n${questions.join("\n\n")}`,
    ]) || atlas.tagline,
    evidence: uniqueUsagePaths(entry),
    atlas,
  };
}

/** 한 카드의 모든 슬라이드 조각(도식 → 코드 → 사용처). */
export function buildAtlasEntryParts(
  entry: EngineeringAtlasEntry,
  localize: Localize,
  options?: DeckBuildOptions,
): readonly DeckAtlasSlidePart[] {
  const parts: DeckAtlasSlidePart[] = [buildAtlasSlidePart(entry, "diagram", 0, localize, options)];
  for (let index = 0; index < atlasCodeSlideCount(entry); index += 1) {
    parts.push(buildAtlasSlidePart(entry, "code", index, localize, options));
  }
  parts.push(buildAtlasSlidePart(entry, "usage", 0, localize, options));
  return parts;
}

/** 카테고리 순서대로 등장하는 카테고리 id(카드가 있는 것만). */
export function atlasSectionOrder(entries: readonly EngineeringAtlasEntry[] = ENGINEERING_ATLAS_ENTRIES): readonly EngineeringAtlasCategoryId[] {
  const present = new Set(entries.map((entry) => entry.category));
  return ENGINEERING_ATLAS_CATEGORIES.map((category) => category.id).filter((id) => present.has(id));
}

export function atlasSectionTitles(localize: Localize, entries: readonly EngineeringAtlasEntry[] = ENGINEERING_ATLAS_ENTRIES): ReadonlyMap<string, string> {
  return new Map(atlasSectionOrder(entries).map((id) => [id, categoryLabelOf(id, localize)]));
}
