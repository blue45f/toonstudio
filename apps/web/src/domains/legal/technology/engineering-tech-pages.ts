import {
  BookMarked,
  BookOpen,
  Boxes,
  Film,
  GraduationCap,
  LayoutGrid,
  LibraryBig,
  Network,
  NotebookTabs,
  Presentation,
  Scale,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import type { LocalizedText } from "./engineering-story-content";
import type { WorkflowVisual } from "@/shared/components/site-experience/workflow-illustration";

/**
 * 기술 소개 하위 페이지의 단일 목록. 탭 메뉴·허브의 발표 동선·하단 이어보기가 모두 이 목록을 쓴다.
 *
 * 페이지별 목적(중복 없이):
 * - 아키텍처: 전체 구조와 배경 지식을 도식으로 한눈에(발표 동선 앞의 "큰 그림", 단계 번호 없음)
 * - 라이브러리: 쓰인 주요 라이브러리(브러시 엔진·VRM·3D·협업 등)와 그 라이브러리·설계를 고른 이유("큰 그림"의 재료 편)
 * - 제작 스토리: 왜·어떻게 만들었나(문제 → 선택 → 대가 서사)
 * - 플레이북: 재사용 가능한 설계 원칙과 아키텍처 결정
 * - 적용 가이드: 다른 서비스에 단계별로 옮기는 방법
 * - 심화 노트: 깊은 기술 노트와 장애·교훈
 * - 발표 모드: 세미나(30분)·요약·강의 슬라이드, 도감 부록과 발표자 도구
 *
 * 읽기 시간은 콘텐츠 원본으로 계산한 값을 고정해 두고, 테스트가 실제 콘텐츠와 일치하는지 확인한다
 * (허브가 대형 콘텐츠 모듈을 불러오지 않게 하기 위함).
 */

export type EngineeringPageId =
  | "architecture"
  | "libraries"
  | "story"
  | "playbook"
  | "guides"
  | "field-notes"
  | "deck"
  | "videos"
  | "references"
  | "atlas"
  | "glossary"
  | "licenses";

export type EngineeringPageGroup = "overview" | "path" | "present" | "resources";

export interface EngineeringPageEntry {
  readonly id: EngineeringPageId;
  readonly href: string;
  readonly group: EngineeringPageGroup;
  /** 발표 동선 순서(1~5). 자료 페이지에는 없다. */
  readonly step?: number;
  readonly icon: LucideIcon;
  /** 한 줄로 끝나는 짧은 메뉴 이름. */
  readonly label: LocalizedText;
  /** 허브 카드와 하단 이어보기에 쓰는 한 줄 목적. */
  readonly purpose: LocalizedText;
  /** 머리말 대표 이미지. 기존 브랜드 아트(workflow-20260928) 중 페이지 주제와 맞는 종류. */
  readonly art: WorkflowVisual;
  /** 이 페이지가 답하는 질문 한 문장. 머리말의 "이 페이지가 답하는 질문" 줄에 보인다. */
  readonly question?: LocalizedText;
  /** 누구를 위한 페이지인가. 머리말의 "이런 분께" 줄에 보인다. */
  readonly audience?: LocalizedText;
  /** 한국어 기준 예상 읽기 시간(분). */
  readonly readingMinutes?: number;
  /** 발표 시간(분). */
  readonly talkMinutes?: number;
}

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

/**
 * 공개 제작 스토리의 챕터 수. 사이트맵처럼 가벼워야 하는 곳이 챕터 콘텐츠 모듈(소스 합계 약 270KB)을
 * 불러오지 않고도 같은 수를 쓰도록 값을 고정해 둔다. `engineering-tech-pages.test.ts`가
 * `PUBLISHED_ENGINEERING_CHAPTERS.length`와 같은지 확인하므로 챕터를 더하거나 빼면 테스트가 먼저 실패한다.
 */
export const ENGINEERING_CHAPTER_COUNT = 40;

export const ENGINEERING_PAGE_GROUPS: readonly { readonly id: EngineeringPageGroup; readonly label: LocalizedText }[] = [
  { id: "overview", label: t("큰 그림", "Big picture") },
  { id: "path", label: t("핵심", "Core") },
  { id: "present", label: t("발표", "Present") },
  { id: "resources", label: t("자료", "Resources") },
];

export const ENGINEERING_PAGES = [
  {
    id: "architecture",
    href: "/about/technology/architecture",
    group: "overview",
    icon: Network,
    label: t("아키텍처", "Architecture"),
    purpose: t("전체 구조를 도식과 쉬운 해설로 한눈에", "The whole structure at a glance, with diagrams and plain explanations"),
    art: "collaborate",
    readingMinutes: 43,
    question: t("브라우저·엣지·서버·데이터는 어떻게 맞물려 돌아가나요?", "How do the browser, edge, server and data fit together?"),
    audience: t("처음 오신 모든 분: 투자자·개발자·스터디 참가자", "Everyone new here: investors, developers and study groups"),
  },
  {
    id: "libraries",
    href: "/about/technology/libraries",
    group: "overview",
    icon: Boxes,
    label: t("라이브러리", "Libraries"),
    purpose: t("쓰인 주요 라이브러리와 고른 이유를 영역별로", "Main libraries and why we chose them, by area"),
    art: "create",
    question: t("무엇으로 만들었고, 왜 그것을 골랐나요?", "What is it built with, and why did we choose it?"),
    audience: t("개발자·스터디 참가자, 기술 선택의 이유가 궁금한 분", "Developers and study groups curious about the reasons behind each choice"),
    readingMinutes: 49,
  },
  {
    id: "story",
    href: "/about/technology/story",
    group: "path",
    step: 1,
    icon: BookOpen,
    label: t("제작 스토리", "Story"),
    purpose: t("왜·어떻게 만들었나: 문제, 선택, 대가와 근거", "Why and how it was built: problems, choices, trade-offs, evidence"),
    art: "create",
    question: t("왜 이렇게 만들었고, 무엇을 포기했나요?", "Why was it built this way, and what was given up?"),
    audience: t("배경을 순서대로 이해하고 싶은 분", "Readers who want the background in order"),
    readingMinutes: 51,
  },
  {
    id: "playbook",
    href: "/about/technology/playbook",
    group: "path",
    step: 2,
    icon: GraduationCap,
    label: t("플레이북", "Playbook"),
    purpose: t("재사용할 설계 원칙과 아키텍처 결정", "Reusable design principles and architecture decisions"),
    art: "plan",
    question: t("다른 서비스에도 쓸 설계 원칙은 무엇인가요?", "Which design principles carry over to other products?"),
    audience: t("설계를 맡는 개발자·기획자", "Engineers and planners who own design decisions"),
    readingMinutes: 25,
  },
  {
    id: "guides",
    href: "/about/technology/guides",
    group: "path",
    step: 3,
    icon: Wrench,
    label: t("적용 가이드", "Guides"),
    purpose: t("다른 서비스에 단계별로 옮기는 방법", "Step-by-step adoption in another product"),
    art: "learn",
    question: t("내 서비스에 옮기려면 어디서 시작하나요?", "Where do I start if I adopt this in my own product?"),
    audience: t("적용을 검토하는 개발자", "Engineers evaluating adoption"),
    readingMinutes: 27,
  },
  {
    id: "field-notes",
    href: "/about/technology/field-notes",
    group: "path",
    step: 4,
    icon: NotebookTabs,
    label: t("심화 노트", "Field notes"),
    purpose: t("깊은 기술 노트와 장애·교훈 기록", "Deep technical notes, incidents and lessons"),
    art: "recovery",
    question: t("실제 구현에서 무엇이 깨졌고 어떻게 고쳤나요?", "What actually broke during implementation, and how was it fixed?"),
    audience: t("깊은 구현 판단과 장애 사례가 궁금한 개발자", "Engineers who want deep implementation calls and incident cases"),
    readingMinutes: 32,
  },
  {
    id: "deck",
    href: "/about/technology/deck",
    group: "present",
    step: 5,
    icon: Presentation,
    label: t("발표 모드", "Deck"),
    purpose: t("세미나·요약·강의 슬라이드, 도감 부록과 발표자 도구", "Seminar, brief and lecture slides, a tech-atlas appendix and presenter tools"),
    art: "publish",
    question: t("발표 시간에 맞춰 같은 내용을 어떻게 말하나요?", "How do I present the same story for a given time slot?"),
    audience: t("발표자와 발표를 듣는 분", "Presenters and their audience"),
    talkMinutes: 30,
  },
  {
    id: "videos",
    href: "/about/technology/videos",
    group: "present",
    icon: Film,
    label: t("영상", "Video"),
    purpose: t("같은 원본으로 만드는 기술 소개 영상", "Engineering film rendered from the same source"),
    art: "storyboard",
    question: t("같은 원본으로 영상을 어떻게 만들고 검수하나요?", "How is a film built and reviewed from the same source?"),
    audience: t("소개·교육 영상을 만드는 분", "People producing intro or training films"),
  },
  {
    id: "atlas",
    href: "/about/technology/atlas",
    group: "resources",
    icon: LayoutGrid,
    label: t("기술 도감", "Tech atlas"),
    purpose: t("배경·도식·샘플 코드·쓰인 기능을 기술별로", "Background, diagrams, code and where each technology is used"),
    art: "assets",
    question: t("이 기술은 무엇이고 서비스 어디에 쓰였나요?", "What is this technology, and where does the service use it?"),
    audience: t("질문에 바로 답하거나 기술 하나를 깊이 보려는 분", "Anyone answering a question on the spot or studying one technology"),
  },
  {
    id: "references",
    href: "/about/technology/references",
    group: "resources",
    icon: LibraryBig,
    label: t("참고 자료", "References"),
    purpose: t("사용·평가·참고한 기술과 제품 구분", "Used, evaluated and referenced technology and products"),
    art: "review",
    question: t("무엇을 쓰고, 무엇은 검토만 하고 참고했나요?", "What is used, what was only evaluated, and what was just inspiration?"),
    audience: t("기술 선택과 비교의 근거를 보려는 분", "Readers checking the evidence behind choices and comparisons"),
  },
  {
    id: "glossary",
    href: "/about/technology/glossary",
    group: "resources",
    icon: BookMarked,
    label: t("용어집", "Glossary"),
    purpose: t("발표 용어를 쉬운 비유로 설명", "Talk terms explained with plain analogies"),
    art: "learn",
    question: t("발표에 나온 낯선 말은 무슨 뜻인가요?", "What do the unfamiliar terms in the talk mean?"),
    audience: t("비전문가와 처음 듣는 분", "Non-specialists and first-time listeners"),
  },
  {
    id: "licenses",
    href: "/about/technology/licenses",
    group: "resources",
    icon: Scale,
    label: t("라이선스", "Licenses"),
    purpose: t("코드·폰트·에셋·AI 결과물의 권리", "Rights for code, fonts, assets and AI output"),
    art: "rights",
    question: t("쓰인 코드·에셋·AI 결과물의 권리는 어떻게 다루나요?", "How are rights for code, assets and AI output handled?"),
    audience: t("배포와 권리를 검토하는 분", "People reviewing distribution and rights"),
  },
] as const satisfies readonly EngineeringPageEntry[];

export const ENGINEERING_PATH_PAGES: readonly EngineeringPageEntry[] = ENGINEERING_PAGES
  .filter((page): page is Extract<(typeof ENGINEERING_PAGES)[number], { readonly step: number }> => "step" in page)
  .sort((a, b) => a.step - b.step);

export function findEngineeringPage(id: EngineeringPageId): EngineeringPageEntry {
  const page = ENGINEERING_PAGES.find((entry) => entry.id === id);
  if (!page) throw new Error(`Unknown engineering page: ${id}`);
  return page;
}

/** 현재 경로에 해당하는 페이지. 하위 경로·끝 슬래시도 같은 페이지로 본다. */
export function engineeringPageForPath(pathname: string): EngineeringPageEntry | undefined {
  const normalized = pathname.replace(/\/+$/u, "");
  return ENGINEERING_PAGES.find((page) => normalized === page.href || normalized.startsWith(`${page.href}/`));
}

/** 한국어 본문 읽기 속도(공백 제외 글자/분)와 영어 읽기 속도(단어/분). 안내용 근사치다. */
const KOREAN_CHARACTERS_PER_MINUTE = 500;
const ENGLISH_WORDS_PER_MINUTE = 230;

export function estimateReadingMinutes(texts: readonly string[], locale: "ko" | "en" = "ko"): number {
  const joined = texts.join(" ");
  if (locale === "en") {
    const words = joined.split(/\s+/u).filter(Boolean).length;
    return Math.max(1, Math.round(words / ENGLISH_WORDS_PER_MINUTE));
  }
  const characters = joined.replace(/\s+/gu, "").length;
  return Math.max(1, Math.round(characters / KOREAN_CHARACTERS_PER_MINUTE));
}

type TextSource = LocalizedText | readonly LocalizedText[] | undefined;

function isTextList(value: LocalizedText | readonly LocalizedText[]): value is readonly LocalizedText[] {
  return Array.isArray(value);
}

/** LocalizedText 묶음에서 한국어 문장만 모은다(읽기 시간 계산용). */
export function koreanTexts(values: readonly TextSource[]): string[] {
  const texts: string[] = [];
  for (const value of values) {
    if (!value) continue;
    if (isTextList(value)) texts.push(...value.map((item) => item.ko));
    else texts.push(value.ko);
  }
  return texts;
}
