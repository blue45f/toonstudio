import {
  atlasCardStartIndex,
  atlasTrackSlideCount,
  atlasTrackSlideIds,
  atlasSectionTitles,
  buildAtlasEntryParts,
  orderedAtlasEntries,
  requireAtlasEntry,
  resolveDeckAtlas,
  type DeckAtlas,
  type DeckBuildOptions,
} from "./engineering-deck-atlas";
import { DECK_POINT_MAX_WIDTH, clipForSlide } from "./engineering-deck-fit";
import type { DeckTrack } from "./engineering-deck-state";
import { findAtlasEntry } from "./engineering-atlas-content";
import type { EngineeringDiagram } from "./engineering-diagram-types";
import { SEMINAR_LESSONS } from "./engineering-seminar-curriculum";
import type { EngineeringChapter, EngineeringStatus, LocalizedText } from "./engineering-story-content";
import { PUBLISHED_ENGINEERING_CHAPTERS } from "./engineering-story-published-content";
import {
  TALK_SLIDES,
  planTalkSections,
  talkSlideStartSeconds,
  type TalkModuleIcon,
  type TalkSlide,
  type TalkSlideLayout,
} from "./engineering-talk-deck";

/**
 * 발표 트랙별 슬라이드 모델. 화면·인쇄·오프라인 발표본이 같은 모델을 사용한다.
 * 문자열 번역은 호출자가 넘긴 `localize`가 담당하므로 이 모듈은 순수 함수로 유지한다.
 */

export type Localize = (text: LocalizedText) => string;

export type { DeckBuildOptions } from "./engineering-deck-atlas";

export type DeckSlideLayout = TalkSlideLayout | "chapter";

export interface DeckModuleTile {
  readonly id: string;
  readonly icon: TalkModuleIcon;
  readonly title: string;
  readonly body: string;
  readonly href?: string;
  /** 이 작업 공간을 떠받치는 기술 이름(칩). */
  readonly stack?: readonly string[];
}

export interface DeckDemoStep {
  readonly href: string;
  readonly action: string;
  readonly expected: string;
  readonly fallback: string;
}

export interface DeckFact {
  readonly value: string;
  readonly label: string;
}

export interface DeckLink {
  readonly href: string;
  readonly label: string;
}

export interface DeckArt {
  readonly src: string;
  readonly alt: string;
}

export interface DeckStatusChip {
  readonly id: string;
  readonly title: string;
  readonly status: EngineeringStatus;
}

/** `table` 레이아웃의 표. 모든 값은 이미 번역된 문자열이다. */
export interface DeckTable {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly caption?: string;
}

/** `qa` 레이아웃의 QR 코드 대상. `href`는 사이트 경로(`/…`) 또는 https 주소다. */
export interface DeckQr {
  readonly href: string;
  readonly label: string;
}

/** 발표자 패널의 "도감 카드 열기" 단추가 되는 카드. */
export interface DeckRelatedAtlas {
  readonly id: string;
  readonly name: string;
}

export interface DeckSlide {
  readonly id: string;
  readonly layout: DeckSlideLayout;
  readonly eyebrow: string;
  readonly title: string;
  readonly lead: string;
  readonly points: readonly string[];
  readonly notes: string;
  readonly sectionId: string;
  readonly plannedSeconds: number;
  readonly plannedStartSeconds: number;
  readonly flow?: readonly string[];
  readonly stack?: readonly string[];
  readonly facts?: readonly DeckFact[];
  readonly modules?: readonly DeckModuleTile[];
  readonly demoSteps?: readonly DeckDemoStep[];
  readonly links?: readonly DeckLink[];
  readonly statusChips?: readonly DeckStatusChip[];
  readonly art?: DeckArt;
  readonly question?: string;
  readonly status?: EngineeringStatus;
  readonly chapterId?: string;
  readonly evidence?: readonly string[];
  /** `atlas` 레이아웃(또는 도감 카드를 곁들인 슬라이드)이 보여주는 카드의 한 면. */
  readonly atlas?: DeckAtlas;
  /** `diagram` 레이아웃이 기본 아키텍처 도식 대신 그리는 도식 명세. */
  readonly diagram?: EngineeringDiagram;
  readonly table?: DeckTable;
  readonly qr?: DeckQr;
  /** 이 슬라이드에서 질문이 나오면 열어볼 도감 카드(발표자 패널). */
  readonly relatedAtlas?: readonly DeckRelatedAtlas[];
}

export interface DeckSectionPlan {
  readonly id: string;
  readonly title: string;
  readonly order: number;
  readonly seconds: number;
  readonly startSeconds: number;
  readonly firstSlideIndex: number;
  readonly slideCount: number;
}

/** 부록 트랙에서 카드 단위로 이동하기 위한 카드 목록의 한 항목. */
export interface DeckCard {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly sectionId: string;
  readonly firstSlideIndex: number;
  readonly slideCount: number;
}

export interface DeckTrackModel {
  readonly track: DeckTrack;
  readonly slides: readonly DeckSlide[];
  readonly sections: readonly DeckSectionPlan[];
  /** 시간 배정이 없는 트랙(도감 부록)은 0이다. 그때는 페이스·시간표 대신 경과 시간만 보여준다. */
  readonly totalSeconds: number;
  /** 부록 트랙에서만 있다. */
  readonly cards?: readonly DeckCard[];
}

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

export const DECK_TRACK_META: Record<DeckTrack, { readonly label: LocalizedText; readonly description: LocalizedText }> = {
  talk: {
    label: t("세미나 발표", "Seminar talk"),
    description: t(
      "문제 → 제품·데모 → 아키텍처 → 핵심 기술 → 품질 → 운영 → 한계 → 질의응답",
      "Problem → product and demo → architecture → core technology → quality → operations → limits → Q&A",
    ),
  },
  brief: {
    label: t("핵심 요약", "Executive brief"),
    description: t(
      "제품 문제, 기술 방어력, 비용과 권리 통제를 짧게 공유합니다.",
      "A short pass through the product problem, defensibility, cost and rights controls.",
    ),
  },
  lecture: {
    label: t("심화 강의", "Deep lecture"),
    description: t(
      "한 컷을 따라 입력·렌더링·저장·3D·협업·AI를 레슨 단위로 깊게 다룹니다.",
      "Follows one panel through input, rendering, storage, 3D, collaboration and AI lesson by lesson.",
    ),
  },
  atlas: {
    label: t("기술 도감 부록", "Tech atlas appendix"),
    description: t(
      "질의응답 대비용 부록입니다. 도감 카드마다 도식 → 코드 → 쓰인 곳 순서로 보여 주며 시간 배정은 없습니다. [ ] 키로 카드 단위로 이동합니다.",
      "A Q&A backup. Each atlas card shows its diagram, then code, then where it is used, with no time budget. Use [ ] to move card by card.",
    ),
  },
};

/** 트랙 이름과 설명을 페이지 제목·소개 문구에 쓴다. 30분 세미나 문구를 모든 트랙에 고정하지 않는다. */
export const DECK_TRACK_PAGE_COPY: Record<DeckTrack, { readonly title: LocalizedText; readonly description: LocalizedText }> = {
  talk: {
    title: t("ToonStudio 기술 발표 모드 · 30분 세미나", "ToonStudio engineering presentation · 30-minute seminar"),
    description: t(
      "30분 세미나 슬라이드와 발표자 도구입니다. 슬라이드는 화면 크기에 맞춰 16:9로 맞춰지고, 키보드로 전체 화면(F)·발표자 노트(N)·개요(O)·블랙아웃(B)을 조작합니다.",
      "Slides and presenter tools for a 30-minute seminar. Slides scale to fit at 16:9, and the keyboard controls fullscreen (F), speaker notes (N), overview (O) and blackout (B).",
    ),
  },
  brief: {
    title: t("ToonStudio 기술 발표 모드 · 핵심 요약", "ToonStudio engineering presentation · executive brief"),
    description: t(
      "11분 안팎으로 제품 문제, 기술 방어력, 비용과 권리 통제를 공유하는 핵심 요약 슬라이드입니다. 슬라이드는 16:9로 맞춰지고, 키보드로 전체 화면(F)·발표자 노트(N)·개요(O)·블랙아웃(B)을 조작합니다.",
      "A brief of about eleven minutes covering the product problem, defensibility, cost and rights controls. Slides scale to fit at 16:9, and the keyboard controls fullscreen (F), speaker notes (N), overview (O) and blackout (B).",
    ),
  },
  lecture: {
    title: t("ToonStudio 기술 발표 모드 · 심화 강의", "ToonStudio engineering presentation · deep lecture"),
    description: t(
      "한 컷을 따라 입력·렌더링·저장·3D·협업·AI를 레슨 단위로 다루는 심화 강의 슬라이드입니다. 슬라이드는 16:9로 맞춰지고, 키보드로 전체 화면(F)·발표자 노트(N)·개요(O)·블랙아웃(B)을 조작합니다.",
      "Deep-lecture slides that follow one panel through input, rendering, storage, 3D, collaboration and AI lesson by lesson. Slides scale to fit at 16:9, and the keyboard controls fullscreen (F), speaker notes (N), overview (O) and blackout (B).",
    ),
  },
  atlas: {
    title: t("ToonStudio 기술 발표 모드 · 기술 도감 부록", "ToonStudio engineering presentation · tech atlas appendix"),
    description: t(
      "질의응답에서 꺼내 쓰는 기술 도감 부록입니다. 카드마다 도식 → 코드 → 쓰인 곳을 보여 주며 시간 배정은 없습니다. [ ] 키로 카드 단위 이동, 키보드로 전체 화면(F)·발표자 노트(N)·개요(O)·블랙아웃(B)을 조작합니다.",
      "A tech-atlas appendix for Q&A. Each card shows its diagram, code and where it is used, with no time budget. Use [ ] to move card by card, and the keyboard for fullscreen (F), speaker notes (N), overview (O) and blackout (B).",
    ),
  },
};

/** 요약·강의 트랙은 원본에 개별 시간이 없어 균등 배분한다(발표자 페이스 안내용). */
const BRIEF_SECONDS_PER_SLIDE = 60;
const LECTURE_SECONDS_PER_SLIDE = 90;

/** `table` 레이아웃이 한 슬라이드에서 읽히는 최대 규모. 더 크면 슬라이드를 나눠야 한다. */
export const DECK_TABLE_MAX_ROWS = 8;
export const DECK_TABLE_MAX_COLUMNS = 4;

const chapterById = new Map<string, EngineeringChapter>(
  PUBLISHED_ENGINEERING_CHAPTERS.map((chapter) => [chapter.id, chapter]),
);

function findEngineeringChapter(chapterId: string | undefined): EngineeringChapter | undefined {
  return chapterId ? chapterById.get(chapterId) : undefined;
}

function requireChapter(chapterId: string): EngineeringChapter {
  const chapter = chapterById.get(chapterId);
  if (!chapter) throw new Error(`Unknown engineering chapter: ${chapterId}`);
  return chapter;
}

function withSchedule<T extends Omit<DeckSlide, "plannedStartSeconds">>(slides: readonly T[]): readonly DeckSlide[] {
  let elapsed = 0;
  return slides.map((slide) => {
    const scheduled: DeckSlide = { ...slide, plannedStartSeconds: elapsed };
    elapsed += slide.plannedSeconds;
    return scheduled;
  });
}

function sectionsFromSlides(
  slides: readonly DeckSlide[],
  titles: ReadonlyMap<string, string>,
): readonly DeckSectionPlan[] {
  const plans: DeckSectionPlan[] = [];
  slides.forEach((slide, index) => {
    const last = plans.at(-1);
    if (last && last.id === slide.sectionId) {
      plans[plans.length - 1] = { ...last, seconds: last.seconds + slide.plannedSeconds, slideCount: last.slideCount + 1 };
      return;
    }
    plans.push({
      id: slide.sectionId,
      title: titles.get(slide.sectionId) ?? slide.sectionId,
      order: plans.length + 1,
      seconds: slide.plannedSeconds,
      startSeconds: slide.plannedStartSeconds,
      firstSlideIndex: index,
      slideCount: 1,
    });
  });
  return plans;
}

/** 발표 원본 슬라이드 하나를 화면 모델로 옮긴다(번역은 `localize`). 도감 참조가 틀리면 던진다. */
export function talkSlideToDeck(slide: TalkSlide, localize: Localize, startSeconds: number, options?: DeckBuildOptions): DeckSlide {
  const chapter = findEngineeringChapter(slide.chapterId);
  // 도감 카드를 가리키는 슬라이드가 카드를 못 찾으면 본문을 그릴 수 없으므로 어느 슬라이드인지 밝혀 던진다.
  const atlas = slide.atlas
    ? resolveDeckAtlas(
        requireAtlasEntry(slide.atlas.id, `talk slide "${slide.id}"`),
        slide.atlas.view,
        slide.atlas.sample ?? 0,
        localize,
        options,
      )
    : undefined;
  // 발표자 패널의 보조 단추일 뿐이라 없는 카드는 단추만 생략한다(없는 id 는 테스트가 잡는다).
  const relatedAtlas = slide.relatedAtlasIds?.flatMap((id) => {
    const entry = findAtlasEntry(id);
    return entry ? [{ id: entry.id, name: entry.name }] : [];
  });
  return {
    id: slide.id,
    layout: slide.layout,
    eyebrow: localize(slide.eyebrow),
    title: localize(slide.title),
    lead: localize(slide.lead),
    points: slide.points.map(localize),
    notes: localize(slide.notes),
    sectionId: slide.section,
    plannedSeconds: slide.seconds,
    plannedStartSeconds: startSeconds,
    flow: slide.flow?.map(localize),
    stack: slide.stack ?? atlas?.technologies,
    facts: slide.facts?.map((fact) => ({ value: typeof fact.value === "string" ? fact.value : localize(fact.value), label: localize(fact.label) })),
    modules: slide.modules?.map((module) => ({
      id: module.id,
      icon: module.icon,
      title: localize(module.title),
      body: localize(module.body),
      href: module.href,
      stack: module.stack,
    })),
    demoSteps: slide.demoSteps?.map((step) => ({
      href: step.href,
      action: localize(step.action),
      expected: localize(step.expected),
      fallback: localize(step.fallback),
    })),
    links: slide.links?.map((link) => ({ href: link.href, label: localize(link.label) })),
    statusChips: slide.statusChapterIds?.map((chapterId) => {
      const related = requireChapter(chapterId);
      return { id: related.id, title: localize(related.title), status: related.status };
    }),
    art: slide.art ? { src: slide.art.src, alt: localize(slide.art.alt) } : undefined,
    question: slide.question ? localize(slide.question) : undefined,
    status: chapter?.status ?? atlas?.status,
    chapterId: chapter?.id,
    evidence: slide.evidence,
    atlas,
    diagram: slide.diagram,
    table: slide.table
      ? {
          columns: slide.table.columns.map(localize),
          rows: slide.table.rows.map((row) => row.map(localize)),
          caption: slide.table.caption ? localize(slide.table.caption) : undefined,
        }
      : undefined,
    qr: slide.qr ? { href: slide.qr.href, label: localize(slide.qr.label) } : undefined,
    relatedAtlas: relatedAtlas?.length ? relatedAtlas : undefined,
  };
}

function buildTalkTrack(localize: Localize, options?: DeckBuildOptions): DeckTrackModel {
  const starts = talkSlideStartSeconds();
  const slides = TALK_SLIDES.map((slide, index) => talkSlideToDeck(slide, localize, starts[index] ?? 0, options));
  const sections = planTalkSections().map((section) => ({ ...section, title: localize(section.title) }));
  return {
    track: "talk",
    slides,
    sections,
    totalSeconds: slides.reduce((sum, slide) => sum + slide.plannedSeconds, 0),
  };
}

const CHAPTER_FULL_TEXT_LABEL = t("슬라이드에서 줄인 문단의 전문", "Full text of paragraphs shortened on the slide");

/**
 * 챕터 원문(문제·결정·가치)을 슬라이드 문단으로 쓴다. 한 문단이 슬라이드에 읽히는 길이를 넘으면
 * 문장 단위로 줄이고, 줄인 문단의 전문은 발표자 노트에 둔다. 원문 데이터는 바꾸지 않는다.
 */
function chapterSlide(chapterId: string, localize: Localize, sectionId: string): Omit<DeckSlide, "plannedStartSeconds"> {
  const chapter = requireChapter(chapterId);
  const full = [localize(chapter.problem), localize(chapter.decision), localize(chapter.userValue)];
  const clipped = full.map((text) => clipForSlide(text, DECK_POINT_MAX_WIDTH));
  const dropped = full.filter((_, index) => clipped[index]?.clipped);
  const tradeoff = localize(chapter.tradeoff);
  return {
    id: chapter.id,
    layout: "chapter",
    eyebrow: chapter.eyebrow,
    title: localize(chapter.title),
    lead: localize(chapter.thesis),
    points: clipped.map((item) => item.text),
    notes: dropped.length > 0 ? `${tradeoff}\n\n${localize(CHAPTER_FULL_TEXT_LABEL)}\n${dropped.join("\n\n")}` : tradeoff,
    sectionId,
    plannedSeconds: BRIEF_SECONDS_PER_SLIDE,
    stack: chapter.technologies,
    status: chapter.status,
    chapterId: chapter.id,
    evidence: chapter.evidence.map((item) => item.path),
  };
}

const BRIEF_OPENING_ID = "brief-opening";
const BRIEF_CLOSE_ID = "brief-close";

const BRIEF_CHAPTER_IDS = [
  "product-intent",
  "architecture",
  "pwa-continuity",
  "webrtc-media-authority",
  "web-3d-engine",
  "free-ai-routing",
  "cost-engineering",
  "quality",
  "licenses",
] as const;

function buildBriefTrack(localize: Localize): DeckTrackModel {
  const sectionId = "brief";
  const slides = withSchedule([
    {
      id: BRIEF_OPENING_ID,
      layout: "cover",
      eyebrow: "TOONSTUDIO ENGINEERING BRIEF",
      title: localize(t("브라우저에서 웹툰 제작 스튜디오를 만들기까지", "Building a webtoon production studio in the browser")),
      lead: localize(t(
        "기획, 드로잉, 3D, 저장, 협업, AI와 연재 운영을 하나의 제작 맥락으로 연결한 기술 이야기입니다.",
        "An engineering story connecting planning, drawing, 3D, storage, collaboration, AI and serialization into one production context.",
      )),
      points: [
        localize(t("제품 문제부터 시작", "Start with the product problem")),
        localize(t("실제 상태와 설계 상태 구분", "Separate live and designed scope")),
        localize(t("코드·테스트·워크플로 근거 연결", "Connect code, tests and workflow evidence")),
      ],
      notes: localize(t(
        "기술 목록을 읽는 발표가 아니라 왜 이 경계를 선택했는지 설명하는 발표입니다.",
        "This presentation explains why boundaries were chosen instead of reading a technology list.",
      )),
      sectionId,
      plannedSeconds: BRIEF_SECONDS_PER_SLIDE,
    },
    ...BRIEF_CHAPTER_IDS.map((chapterId) => chapterSlide(chapterId, localize, sectionId)),
    {
      id: BRIEF_CLOSE_ID,
      layout: "lessons",
      eyebrow: "DEFENSIBILITY · SCALE · TRUST",
      title: localize(t("기술은 기능 수가 아니라 연결된 제작 맥락을 지킵니다.", "The defensible asset is connected production context, not a feature count.")),
      lead: localize(t(
        "도메인 계약, 로컬 우선 데이터, 전문 엔진 경계와 검증 증거를 유지하면 기능을 추가해도 프로젝트의 맥락이 분해되지 않습니다.",
        "Domain contracts, local-first data, specialist engine boundaries and verification evidence keep project context intact as capability grows.",
      )),
      points: [
        localize(t("단계적 전문 기능 확장", "Incremental specialist capability")),
        localize(t("무료 우선에서 승인된 유료 승격", "Approved promotion from free-first infrastructure")),
        localize(t("권리와 provenance를 기능과 함께 관리", "Rights and provenance managed with features")),
      ],
      notes: localize(t(
        "과장된 완성도 주장보다 검증 가능한 현재 상태와 확장 경로를 강조합니다.",
        "Emphasize verifiable present state and expansion path instead of exaggerated completeness claims.",
      )),
      sectionId,
      plannedSeconds: BRIEF_SECONDS_PER_SLIDE,
    },
  ]);
  const titles = new Map([[sectionId, localize(t("핵심 요약", "Executive brief"))]]);
  return {
    track: "brief",
    slides,
    sections: sectionsFromSlides(slides, titles),
    totalSeconds: slides.reduce((sum, slide) => sum + slide.plannedSeconds, 0),
  };
}

function buildLectureTrack(localize: Localize): DeckTrackModel {
  const titles = new Map<string, string>();
  const slides = withSchedule(SEMINAR_LESSONS.map((lesson): Omit<DeckSlide, "plannedStartSeconds"> => {
    const sectionTitle = localize(lesson.section);
    const sectionId = lesson.section.en;
    titles.set(sectionId, sectionTitle);
    return {
      id: lesson.id,
      layout: "chapter",
      eyebrow: sectionTitle,
      title: localize(lesson.title),
      lead: localize(lesson.takeaway),
      points: lesson.points.map(localize),
      flow: lesson.flow.map(localize),
      notes: localize(lesson.script),
      question: localize(lesson.question),
      sectionId,
      plannedSeconds: LECTURE_SECONDS_PER_SLIDE,
      stack: lesson.technologies,
      status: findEngineeringChapter(lesson.chapterId)?.status,
      chapterId: lesson.chapterId,
      demoSteps: "demo" in lesson && lesson.demo
        ? [{
            href: lesson.demo.href,
            action: localize(lesson.demo.action),
            expected: localize(lesson.demo.expected),
            fallback: localize(lesson.demo.fallback),
          }]
        : undefined,
      evidence: findEngineeringChapter(lesson.chapterId)?.evidence.map((item) => item.path),
    };
  }));
  return {
    track: "lecture",
    slides,
    sections: sectionsFromSlides(slides, titles),
    totalSeconds: slides.reduce((sum, slide) => sum + slide.plannedSeconds, 0),
  };
}

/**
 * 기술 도감 부록. 시간 배정이 없는 Q&A 대비 트랙이라 모든 슬라이드의 계획 시간이 0이다.
 * 구간은 도감 카테고리, 카드마다 도식 → 코드(최대 2) → 사용처 슬라이드가 이어진다.
 * 도감이 비어 있으면 슬라이드가 0장인 모델을 돌려준다(화면이 빈 상태를 안내한다).
 */
function buildAtlasTrack(localize: Localize, options?: DeckBuildOptions): DeckTrackModel {
  const entries = orderedAtlasEntries();
  const slides: DeckSlide[] = [];
  const cards: DeckCard[] = [];
  for (const entry of entries) {
    const firstSlideIndex = slides.length;
    for (const part of buildAtlasEntryParts(entry, localize, options)) {
      slides.push({ ...part, layout: "atlas", plannedSeconds: 0, plannedStartSeconds: 0 });
    }
    cards.push({
      id: entry.id,
      name: entry.name,
      title: localize(entry.title),
      sectionId: entry.category,
      firstSlideIndex,
      slideCount: slides.length - firstSlideIndex,
    });
  }
  return {
    track: "atlas",
    slides,
    sections: sectionsFromSlides(slides, atlasSectionTitles(localize, entries)),
    totalSeconds: 0,
    cards,
  };
}

/** 번역 없이 트랙별 슬라이드 수만 계산한다(URL 위치 범위 제한용). */
export function deckTrackSlideCount(track: DeckTrack): number {
  if (track === "brief") return BRIEF_CHAPTER_IDS.length + 2;
  if (track === "lecture") return SEMINAR_LESSONS.length;
  if (track === "atlas") return atlasTrackSlideCount();
  return TALK_SLIDES.length;
}

/** 트랙별 예정 발표 시간(초). 번역 없이 계산한다. 부록 트랙은 시간 배정이 없어 0이다. */
export function deckTrackTotalSeconds(track: DeckTrack): number {
  if (track === "brief") return deckTrackSlideCount("brief") * BRIEF_SECONDS_PER_SLIDE;
  if (track === "lecture") return deckTrackSlideCount("lecture") * LECTURE_SECONDS_PER_SLIDE;
  if (track === "atlas") return 0;
  return TALK_SLIDES.reduce((sum, slide) => sum + slide.seconds, 0);
}

/** 트랙의 슬라이드 id 순서. 모델의 `slides` 와 같아야 하며(테스트가 확인한다) 주소의 `#slide-<id>` 를 위치로 바꾸는 데 쓴다. */
export function deckTrackSlideIds(track: DeckTrack): readonly string[] {
  if (track === "brief") return [BRIEF_OPENING_ID, ...BRIEF_CHAPTER_IDS, BRIEF_CLOSE_ID];
  if (track === "lecture") return SEMINAR_LESSONS.map((lesson) => lesson.id);
  if (track === "atlas") return atlasTrackSlideIds();
  return TALK_SLIDES.map((slide) => slide.id);
}

export function buildDeckTrack(track: DeckTrack, localize: Localize, options?: DeckBuildOptions): DeckTrackModel {
  if (track === "brief") return buildBriefTrack(localize);
  if (track === "lecture") return buildLectureTrack(localize);
  if (track === "atlas") return buildAtlasTrack(localize, options);
  return buildTalkTrack(localize, options);
}

/** 시간이 배정된 트랙인지. 아니면 페이스·구간 시간표·예산을 숨기고 경과 시간만 보여준다. */
export function isTimedDeck(model: Pick<DeckTrackModel, "totalSeconds">): boolean {
  return model.totalSeconds > 0;
}

/* ── 카드 단위 이동(부록 트랙) ──────────────────────────────── */

export function deckCardIndexAt(model: Pick<DeckTrackModel, "cards">, slideIndex: number): number {
  return model.cards?.findIndex((card) => slideIndex >= card.firstSlideIndex && slideIndex < card.firstSlideIndex + card.slideCount) ?? -1;
}

/** 이전·다음 카드의 첫 슬라이드 위치. 더 갈 곳이 없으면 null 이다. */
export function deckAdjacentCardStart(
  model: Pick<DeckTrackModel, "cards">,
  slideIndex: number,
  direction: 1 | -1,
): number | null {
  const current = deckCardIndexAt(model, slideIndex);
  if (current < 0) return null;
  return model.cards?.[current + direction]?.firstSlideIndex ?? null;
}

/** 모델 안에서 카드의 첫 슬라이드 위치(없으면 null). 모델 없이 계산하려면 `deckAtlasCardStart`. */
export function deckCardStartById(model: Pick<DeckTrackModel, "cards">, cardId: string): number | null {
  return model.cards?.find((card) => card.id === cardId)?.firstSlideIndex ?? null;
}

/** 부록 트랙을 만들지 않고 도감 카드의 첫 슬라이드 위치를 계산한다. */
export function deckAtlasCardStart(cardId: string): number | null {
  return atlasCardStartIndex(cardId);
}

export interface DeckScope {
  readonly slides: readonly DeckSlide[];
  /** 대상의 첫 슬라이드가 트랙 안에서 갖는 위치. */
  readonly firstIndex: number;
  /** 부록 트랙에서 대상이 된 구간(그 밖의 트랙은 undefined). */
  readonly section: DeckSectionPlan | undefined;
}

// 같은 모델·같은 구간이면 같은 객체를 돌려줘 인쇄 영역 같은 메모 컴포넌트가 다시 그려지지 않게 한다.
const scopeCache = new WeakMap<DeckTrackModel, Map<string, DeckScope>>();

/**
 * 인쇄·오프라인 내보내기 대상. 부록 트랙은 슬라이드가 수백 장일 수 있어 현재 구간(카테고리)만,
 * 나머지 트랙은 전체다.
 */
export function deckScopeSlides(model: DeckTrackModel, index: number): DeckScope {
  const section = model.track === "atlas"
    ? model.sections.find((item) => index >= item.firstSlideIndex && index < item.firstSlideIndex + item.slideCount)
    : undefined;
  const key = model.track === "atlas" ? (section?.id ?? "none") : "all";
  const byKey = scopeCache.get(model) ?? new Map<string, DeckScope>();
  scopeCache.set(model, byKey);
  const cached = byKey.get(key);
  if (cached) return cached;
  const scope: DeckScope = model.track !== "atlas"
    ? { slides: model.slides, firstIndex: 0, section: undefined }
    : section
      ? { slides: model.slides.slice(section.firstSlideIndex, section.firstSlideIndex + section.slideCount), firstIndex: section.firstSlideIndex, section }
      : { slides: [], firstIndex: 0, section: undefined };
  byKey.set(key, scope);
  return scope;
}

/* ── 검증(콘텐츠 테스트가 쓴다) ─────────────────────────────── */

/** 레이아웃이 요구하는 데이터가 빠졌거나 한 슬라이드에 읽히는 규모를 넘으면 사람이 읽을 수 있는 문제 목록을 돌려준다. */
export function deckSlideProblems(slide: DeckSlide): readonly string[] {
  const problems: string[] = [];
  const at = (message: string): void => {
    problems.push(`${slide.id}: ${message}`);
  };
  if (slide.layout === "atlas" && !slide.atlas) at("atlas 레이아웃인데 atlas 데이터가 없음");
  if (slide.layout === "table") {
    const table = slide.table;
    if (!table || table.columns.length === 0 || table.rows.length === 0) at("table 레이아웃인데 표가 비어 있음");
    if (table) {
      if (table.columns.length > DECK_TABLE_MAX_COLUMNS) at(`표 열이 ${table.columns.length}개 > ${DECK_TABLE_MAX_COLUMNS}`);
      if (table.rows.length > DECK_TABLE_MAX_ROWS) at(`표 행이 ${table.rows.length}개 > ${DECK_TABLE_MAX_ROWS}`);
      table.rows.forEach((row, rowIndex) => {
        if (row.length !== table.columns.length) at(`표 ${rowIndex + 1}행의 칸 수(${row.length})가 열 수(${table.columns.length})와 다름`);
      });
    }
  }
  if (slide.layout === "modules" && !slide.modules?.length) at("modules 레이아웃인데 타일이 없음");
  if (slide.layout === "demo" && !slide.demoSteps?.length) at("demo 레이아웃인데 단계가 없음");
  if (slide.layout === "qa" && !slide.links?.length && !slide.qr) at("qa 레이아웃인데 링크와 QR 이 모두 없음");
  if (slide.qr && !/^(?:\/|https:\/\/)/u.test(slide.qr.href)) at(`QR 대상은 / 로 시작하는 사이트 경로 또는 https 주소여야 함: ${slide.qr.href}`);
  return problems;
}

/** 도감 카드 이름 목록(발표자 패널의 카드 선택). */
export function deckCardOptions(model: Pick<DeckTrackModel, "cards" | "sections">): readonly {
  readonly section: DeckSectionPlan;
  readonly cards: readonly DeckCard[];
}[] {
  const cards = model.cards ?? [];
  return model.sections
    .map((section) => ({ section, cards: cards.filter((card) => card.sectionId === section.id) }))
    .filter((group) => group.cards.length > 0);
}

export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(Math.abs(totalSeconds)));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** 예정 시각 대비 진행 차이(초). 양수면 늦음, 음수면 여유. */
export function paceDeltaSeconds(elapsedSeconds: number, slide: Pick<DeckSlide, "plannedStartSeconds" | "plannedSeconds">): number {
  if (elapsedSeconds < slide.plannedStartSeconds) return elapsedSeconds - slide.plannedStartSeconds;
  const slideEnd = slide.plannedStartSeconds + slide.plannedSeconds;
  return elapsedSeconds > slideEnd ? elapsedSeconds - slideEnd : 0;
}
