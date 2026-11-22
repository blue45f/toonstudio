import {
  Compass,
  GitCompareArrows,
  Layers3,
  Presentation,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import { engineeringDeckHref } from "./engineering-deck-state";
import type { LocalizedText } from "./engineering-story-content";
import {
  ENGINEERING_PAGES,
  findEngineeringPage,
  type EngineeringPageEntry,
  type EngineeringPageId,
} from "./engineering-tech-pages";
import { trimTrailingSlashes } from "@/shared/lib/trim-trailing-slashes";

/**
 * 12개 기술 페이지와 경쟁 비교(`/about/compare`)를 4개 직관적 트랙으로 묶는 통합 허브 데이터.
 *
 * 기존 라우트·레지스트리(`engineering-tech-pages.ts`)와 발표 동선 계약을 깨뜨리지 않으면서
 * 독자가 목적과 시간에 맞춰 1클릭으로 진입할 수 있도록 가벼운 메타데이터만 조합한다.
 * 허브 초기 번들을 키우지 않도록 대형 콘텐츠 모듈(도감·스토리·덱 모델·용어집)은 불러오지 않는다.
 */

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

export type EngineeringHubTrackId =
  | "glance"
  | "architecture-code"
  | "seminar"
  | "trust-reference";

export type EngineeringQuickCourseId =
  | "quick-3m"
  | "seminar-15m"
  | "architecture-30m";

export type EngineeringReaderRoleId =
  | "all"
  | "overview"
  | "engineer"
  | "presenter"
  | "reviewer";

export interface EngineeringHubRegistryItem {
  readonly kind: "page";
  readonly pageId: EngineeringPageId;
  /** 트랙 안에서 이 페이지가 맡은 짧은 역할. */
  readonly roleSummary: LocalizedText;
}

export interface EngineeringHubCompanionItem {
  readonly kind: "companion";
  readonly id: "compare";
  readonly href: "/about/compare";
  readonly icon: LucideIcon;
  readonly label: LocalizedText;
  readonly roleSummary: LocalizedText;
  readonly badge: LocalizedText;
}

export type EngineeringHubTrackItem =
  | EngineeringHubRegistryItem
  | EngineeringHubCompanionItem;

export interface EngineeringHubTrack {
  readonly id: EngineeringHubTrackId;
  readonly number: 1 | 2 | 3 | 4;
  readonly icon: LucideIcon;
  readonly label: LocalizedText;
  readonly summary: LocalizedText;
  readonly audience: LocalizedText;
  readonly items: readonly EngineeringHubTrackItem[];
}

export interface EngineeringQuickCourseLink {
  readonly href: string;
  readonly label: LocalizedText;
}

export interface EngineeringQuickCourse {
  readonly id: EngineeringQuickCourseId;
  readonly minutes: 3 | 15 | 30;
  readonly durationBadge: LocalizedText;
  readonly title: LocalizedText;
  readonly audience: LocalizedText;
  readonly summary: LocalizedText;
  /** 실제 읽기·발표 분량에 대한 솔직한 범위 안내. */
  readonly scopeNote: LocalizedText;
  readonly trackId: EngineeringHubTrackId;
  readonly primaryHref: string;
  readonly primaryLabel: LocalizedText;
  readonly companionLinks: readonly EngineeringQuickCourseLink[];
}

export interface EngineeringReaderRole {
  readonly id: Exclude<EngineeringReaderRoleId, "all">;
  readonly label: LocalizedText;
  readonly question: LocalizedText;
  readonly trackId: EngineeringHubTrackId;
  readonly courseId: EngineeringQuickCourseId;
  readonly quickLinks: readonly EngineeringQuickCourseLink[];
}

/** 12개 기술 페이지 + 경쟁 비교(`/about/compare`)를 겹침 없이 배정한 4개 통합 트랙. */
export const ENGINEERING_HUB_TRACKS: readonly EngineeringHubTrack[] = [
  {
    id: "glance",
    number: 1,
    icon: Compass,
    label: t("한눈에 보기", "At a glance"),
    summary: t(
      "왜 브라우저 스튜디오를 만들었는지, 영상과 경쟁 툴 비교로 빠르게 파악합니다.",
      "See why we built a browser studio through the story, film and tool comparison.",
    ),
    audience: t("처음 오신 분 · 투자자 · 기획자", "First-time visitors, investors & planners"),
    items: [
      {
        kind: "page",
        pageId: "story",
        roleSummary: t("문제·선택·대가를 40개 챕터 서사로", "40 chapters of problems, choices and trade-offs"),
      },
      {
        kind: "page",
        pageId: "videos",
        roleSummary: t("장면 JSON 기반 기술 영상·스토리보드", "Scene-JSON film pipeline and storyboard"),
      },
      {
        kind: "companion",
        id: "compare",
        href: "/about/compare",
        icon: GitCompareArrows,
        label: t("경쟁 비교", "Compare tools"),
        roleSummary: t("CSP·Procreate·Photoshop·Blender 등과 기능·비용 비교", "Compare features, UX and ₩0 cost against major tools"),
        badge: t("비교표", "Matrix"),
      },
    ],
  },
  {
    id: "architecture-code",
    number: 2,
    icon: Layers3,
    label: t("아키텍처 & 실무 코드", "Architecture & code"),
    summary: t(
      "전체 구조 도식부터 개별 기술 도감, 재사용 원칙, 단계별 적용 가이드까지 이어집니다.",
      "Move from system diagrams to the tech atlas, reusable principles and adoption steps.",
    ),
    audience: t("실무 개발자 · 아키텍트 · 기술 검토자", "Engineers, architects & technical reviewers"),
    items: [
      {
        kind: "page",
        pageId: "architecture",
        roleSummary: t("12개 구간 도식과 데이터 권위 해설", "12-section system map and data-authority guide"),
      },
      {
        kind: "page",
        pageId: "atlas",
        roleSummary: t("기술 카드·샘플 코드·5종 비교 지도 검색", "Searchable tech cards, code samples and 5 maps"),
      },
      {
        kind: "page",
        pageId: "guides",
        roleSummary: t("재사용 청사진과 기능별 도입 체크리스트", "Reuse blueprints and step-by-step checklists"),
      },
      {
        kind: "page",
        pageId: "playbook",
        roleSummary: t("설계 원칙 5가지와 핵심 결정 10선", "5 design principles and 10 architecture dossiers"),
      },
    ],
  },
  {
    id: "seminar",
    number: 3,
    icon: Presentation,
    label: t("기술 세미나 발표", "Tech seminar"),
    summary: t(
      "현장 발표용 슬라이드·발표자 노트와 실제 장애 복구 기록을 한 트랙에 모았습니다.",
      "Live presentation slides, speaker tools and real incident recovery notes in one track.",
    ),
    audience: t("발표자 · 세미나 청중 · 스터디 운영자", "Presenters, seminar attendees & study leads"),
    items: [
      {
        kind: "page",
        pageId: "deck",
        roleSummary: t("요약·세미나·강의·도감 4트랙 발표 모드", "4-track slides with speaker notes and offline export"),
      },
      {
        kind: "page",
        pageId: "field-notes",
        roleSummary: t("Worker·PWA·3D 심화 노트와 장애·교훈 기록", "Deep Worker/PWA/3D notes and incident log"),
      },
    ],
  },
  {
    id: "trust-reference",
    number: 4,
    icon: ShieldCheck,
    label: t("신뢰·라이브러리·용어", "Trust, libraries & terms"),
    summary: t(
      "채택 라이브러리 근거, 상용 라이선스 권리, 쉬운 용어집, 참고 자료 경계를 확인합니다.",
      "Inspect library choices, commercial license rights, plain terms and reference boundaries.",
    ),
    audience: t("보안·법무 검토자 · 비전문가 · 기술 도입 팀", "Security/rights reviewers, newcomers & teams"),
    items: [
      {
        kind: "page",
        pageId: "libraries",
        roleSummary: t("8개 영역 핵심 라이브러리와 대안 비교", "Core libraries across 8 areas with alternatives"),
      },
      {
        kind: "page",
        pageId: "licenses",
        roleSummary: t("코드·폰트·3D·AI 권리 계층과 고지 현황", "Code, asset and AI rights layers with inventory"),
      },
      {
        kind: "page",
        pageId: "glossary",
        roleSummary: t("낯선 기술 용어를 일상 비유로 바로 검색", "Plain analogies for technical terms in the talk"),
      },
      {
        kind: "page",
        pageId: "references",
        roleSummary: t("사용·평가·참고 기술과 제품 경계 구분", "Clear boundary between used, evaluated and inspired"),
      },
    ],
  },
];

/** 목적별 1클릭 읽기 코스 3종: 3분 파악 / 15분 세미나 / 30분 아키텍처 심화. */
export const ENGINEERING_QUICK_COURSES: readonly EngineeringQuickCourse[] = [
  {
    id: "quick-3m",
    minutes: 3,
    durationBadge: t("3분 파악", "3-min scan"),
    title: t("핵심 가치와 차별점만 빠르게", "Core value and differences first"),
    audience: t("처음 오신 분 · 투자자", "First-time visitors & investors"),
    summary: t(
      "요약 슬라이드 앞부분과 경쟁 비교표로 ToonStudio가 어떤 문제를 어떻게 푸는지 바로 확인합니다.",
      "Scan the opening brief slides and tool comparison matrix to grasp the product fast.",
    ),
    scopeNote: t(
      "요약 슬라이드 전체는 약 11분 분량이며, 초반 핵심 장표와 비교표만 3분 코스로 묶었습니다.",
      "The full brief track runs ~11 min; this 3-min scan focuses on the opening summary and matrix.",
    ),
    trackId: "glance",
    primaryHref: engineeringDeckHref({ track: "brief", index: 0 }),
    primaryLabel: t("3분 핵심 요약 열기", "Open 3-min summary"),
    companionLinks: [
      { href: "/about/compare", label: t("경쟁 비교표", "Compare tools") },
      { href: "/about/technology/videos", label: t("기술 영상", "Engineering film") },
    ],
  },
  {
    id: "seminar-15m",
    minutes: 15,
    durationBadge: t("15분 세미나", "15-min seminar"),
    title: t("발표 슬라이드와 현장 사례 중심", "Seminar slides and real incidents"),
    audience: t("세미나 청중 · 발표자", "Seminar attendees & presenters"),
    summary: t(
      "세미나 발표 모드로 핵심 판단을 훑고, 청중 질문이 많은 장애 복구와 용어집으로 바로 이어집니다.",
      "Walk through the seminar deck and jump straight to incident lessons and the glossary for Q&A.",
    ),
    scopeNote: t(
      "발표 모드 기본 세미나 트랙은 30분이며, 핵심 구간 선별 발표와 장애 사례 15분 흐름에 맞췄습니다.",
      "The full seminar track is 30 min; pick core sections plus incident cases for a 15-min session.",
    ),
    trackId: "seminar",
    primaryHref: engineeringDeckHref({ track: "talk", index: 0 }),
    primaryLabel: t("15분 세미나 발표 열기", "Open seminar deck"),
    companionLinks: [
      { href: "/about/technology/field-notes#incidents", label: t("장애·교훈", "Incidents") },
      { href: "/about/technology/glossary", label: t("용어집", "Glossary") },
    ],
  },
  {
    id: "architecture-30m",
    minutes: 30,
    durationBadge: t("30분 아키텍처 심화", "30-min architecture"),
    title: t("구조 도식에서 실무 재사용까지", "From system map to reusable code"),
    audience: t("실무 개발자 · 설계 검토자", "Engineers & architects"),
    summary: t(
      "한 장 아키텍처 지도에서 데이터 권위를 잡은 뒤, 재사용 청사진과 기술 도감 코드로 내려갑니다.",
      "Anchor data authority on the architecture map, then move to reuse blueprints and atlas samples.",
    ),
    scopeNote: t(
      "아키텍처 해설 전체는 약 43분이며, 핵심 지도·청사진·관심 기술 카드 30분 집중 코스로 구성했습니다.",
      "The full guide takes ~43 min; this 30-min focus pairs the overview map, blueprints and key cards.",
    ),
    trackId: "architecture-code",
    primaryHref: "/about/technology/architecture",
    primaryLabel: t("30분 아키텍처 시작", "Start architecture dive"),
    companionLinks: [
      { href: "/about/technology/guides#blueprints", label: t("재사용 청사진", "Reuse blueprints") },
      { href: "/about/technology/atlas", label: t("기술 도감", "Tech atlas") },
    ],
  },
];

/** 독자 역할별 빠른 점프. */
export const ENGINEERING_READER_ROLES: readonly EngineeringReaderRole[] = [
  {
    id: "overview",
    label: t("투자자 · 처음 방문", "Investors & newcomers"),
    question: t("무엇이 다르고 왜 브라우저인가요?", "What is different and why the browser?"),
    trackId: "glance",
    courseId: "quick-3m",
    quickLinks: [
      { href: engineeringDeckHref({ track: "brief", index: 0 }), label: t("핵심 요약 슬라이드", "Brief slides") },
      { href: "/about/compare", label: t("경쟁 툴 비교", "Compare tools") },
      { href: "/about/technology/story", label: t("제작 스토리", "Engineering story") },
    ],
  },
  {
    id: "engineer",
    label: t("실무 개발자", "Engineers"),
    question: t("구조와 재사용 코드를 바로 보고 싶어요", "Show me architecture and reusable code"),
    trackId: "architecture-code",
    courseId: "architecture-30m",
    quickLinks: [
      { href: "/about/technology/architecture", label: t("아키텍처 해설", "Architecture") },
      { href: "/about/technology/guides#blueprints", label: t("적용 가이드", "Guides") },
      { href: "/about/technology/atlas", label: t("기술 도감", "Tech atlas") },
    ],
  },
  {
    id: "presenter",
    label: t("세미나 발표자", "Presenters"),
    question: t("발표 자료와 예상 질문 답변이 필요해요", "I need slides and Q&A backup"),
    trackId: "seminar",
    courseId: "seminar-15m",
    quickLinks: [
      { href: engineeringDeckHref({ track: "talk", index: 0 }), label: t("발표 모드", "Presentation deck") },
      { href: "/about/technology/field-notes", label: t("심화 노트·장애", "Field notes") },
      { href: "/about/technology/glossary", label: t("용어집", "Glossary") },
    ],
  },
  {
    id: "reviewer",
    label: t("보안 · 라이선스 검토", "Security & rights"),
    question: t("오픈소스 권리와 기술 근거를 검증할래요", "Verify open-source rights and evidence"),
    trackId: "trust-reference",
    courseId: "architecture-30m",
    quickLinks: [
      { href: "/about/technology/licenses", label: t("라이선스·권리", "Licenses & rights") },
      { href: "/about/technology/libraries", label: t("라이브러리 선택 이유", "Library choices") },
      { href: "/about/technology/references", label: t("참고 자료 경계", "References") },
    ],
  },
];

export function hubTrackItemHref(item: EngineeringHubTrackItem): string {
  return item.kind === "page" ? findEngineeringPage(item.pageId).href : item.href;
}

export function hubTrackItemLabel(item: EngineeringHubTrackItem): LocalizedText {
  return item.kind === "page" ? findEngineeringPage(item.pageId).label : item.label;
}

export function hubTrackItemIcon(item: EngineeringHubTrackItem): LucideIcon {
  return item.kind === "page" ? findEngineeringPage(item.pageId).icon : item.icon;
}

export function hubTrackRegistryPages(track: EngineeringHubTrack): readonly EngineeringPageEntry[] {
  return track.items
    .filter((item): item is EngineeringHubRegistryItem => item.kind === "page")
    .map((item) => findEngineeringPage(item.pageId));
}

export function hubTrackForPageId(pageId: EngineeringPageId): EngineeringHubTrack {
  const found = ENGINEERING_HUB_TRACKS.find((track) =>
    track.items.some((item) => item.kind === "page" && item.pageId === pageId),
  );
  if (!found) throw new Error(`Engineering page is not assigned to a hub track: ${pageId}`);
  return found;
}

export function hubTrackForPath(pathname: string): EngineeringHubTrack | undefined {
  const normalized = trimTrailingSlashes(pathname);
  return ENGINEERING_HUB_TRACKS.find((track) =>
    track.items.some((item) => {
      const href = hubTrackItemHref(item);
      return normalized === href || normalized.startsWith(`${href}/`);
    }),
  );
}

/** 12개 레지스트리 페이지 중 아직 트랙에 배정되지 않은 항목이 없는지 검증용 목록. */
export const HUB_TRACK_COVERED_PAGE_IDS: readonly EngineeringPageId[] = ENGINEERING_HUB_TRACKS.flatMap((track) =>
  track.items
    .filter((item): item is EngineeringHubRegistryItem => item.kind === "page")
    .map((item) => item.pageId),
);

export const HUB_TRACK_TOTAL_PAGES = ENGINEERING_PAGES.length;
