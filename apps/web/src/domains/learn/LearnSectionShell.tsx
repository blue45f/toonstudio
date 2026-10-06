import { Link, useLocation } from "react-router-dom";
import {
  BookMarked,
  BookOpen,
  Briefcase,
  GraduationCap,
  History,
  LibraryBig,
  PenTool,
  Presentation,
  Route,
  School,
  Shapes,
  Telescope,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { SectionNav, type SectionNavGroup } from "@/shared/components/section-nav";
import { defineBilingualText, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { useT } from "@/shared/lib/i18n";
import { SectionArt } from "@/shared/components/section-art";

import { LESSONS } from "./learning-content";
import { useLearningProgress } from "./use-learning-progress";

import "./learning-enhancements.css";

type LearnNavLabel = ReturnType<typeof defineBilingualText>;

interface LearnNavItemSpec {
  readonly id: string;
  readonly path: string;
  readonly icon: LucideIcon;
  readonly label: LearnNavLabel;
}

interface LearnNavGroupSpec {
  readonly id: string;
  readonly label: LearnNavLabel;
  readonly items: readonly LearnNavItemSpec[];
}

/**
 * 학습 섹션 목적지 — 단일 지도(SITE_NAVIGATION_GROUPS)의 "배우기" 구간 아래 목적지들이다.
 * 이름은 다른 표면이 이미 쓰는 정본과 맞춘다: 클래스룸(사이트 헤더), 교육 안내·Studio 실습 과정
 * (사이트 디렉터리), 리서치 데스크(사이트 헤더). 목적지 자체는 기존 학습 내비가 보존하던
 * 13곳 그대로이며, 여기서 지우거나 늘리지 않는다.
 */
const NAV_GROUPS: readonly LearnNavGroupSpec[] = [
  {
    id: "learn",
    label: defineBilingualText("learnPageNavGroup", "learn", "배우기", "Learn"),
    items: [
      { id: "home", path: "/learn", icon: BookOpen, label: defineBilingualText("learnPageNav", "home", "학습 홈", "Learn home") },
      { id: "resources", path: "/learn/resources", icon: LibraryBig, label: defineBilingualText("learnPageNav", "resources", "강좌·자료", "Courses & resources") },
      { id: "classroom", path: "/learn/classroom", icon: GraduationCap, label: defineBilingualText("learnPageNav", "classroom", "클래스룸", "Classroom") },
      { id: "classes", path: "/learn/classes", icon: Presentation, label: defineBilingualText("learnPageNav", "classes", "클래스", "Classes") },
      { id: "paths", path: "/learn#learning-paths", icon: Route, label: defineBilingualText("learnPageNav", "paths", "학습 경로", "Learning paths") },
    ],
  },
  {
    id: "practice",
    label: defineBilingualText("learnPageNavGroup", "practice", "실습·참고", "Practice & references"),
    items: [
      { id: "trace", path: "/learn/trace", icon: PenTool, label: defineBilingualText("learnPageNav", "trace", "따라 그리기", "Trace practice") },
      { id: "studio", path: "/learn/studio", icon: Shapes, label: defineBilingualText("learnPageNav", "studio", "Studio 실습 과정", "Studio practice") },
      { id: "glossary", path: "/learn/glossary", icon: BookMarked, label: defineBilingualText("learnPageNav", "glossary", "용어 사전", "Glossary") },
      { id: "process", path: "/learn/process", icon: Workflow, label: defineBilingualText("learnPageNav", "process", "웹툰 제작 과정", "Webtoon production process") },
      { id: "careers", path: "/learn/careers", icon: Briefcase, label: defineBilingualText("learnPageNav", "careers", "진로·직무 안내", "Careers & roles") },
      { id: "education", path: "/learn/education", icon: School, label: defineBilingualText("learnPageNav", "education", "교육 안내", "Education") },
    ],
  },
  {
    id: "personal",
    label: defineBilingualText("learnPageNavGroup", "personal", "내 학습", "My learning"),
    items: [
      { id: "records", path: "/learn/records", icon: History, label: defineBilingualText("learnPageNav", "records", "내 학습 기록", "My records") },
      // 배운 뒤 장면에 필요한 자료를 찾는 다음 단계 — 학습 → 리서치 → 제작 동선의 가운데 고리.
      { id: "research", path: "/research", icon: Telescope, label: defineBilingualText("learnPageNav", "research", "리서치 데스크", "Research desk") },
    ],
  },
];

const NAV_ARIA_LABEL = defineBilingualText("learnPageNav", "ariaLabel", "배우기 영역", "Learn area");

const STRIP_LABEL = defineBilingualText("learnProgressStrip", "label", "내 학습 진행", "My learning progress");
const STRIP_DONE = defineBilingualText("learnProgressStrip", "done", "레슨 완료", "lessons completed");
const STRIP_RECORDS = defineBilingualText("learnProgressStrip", "records", "내 학습 기록", "My records");

/**
 * 자체 진행 표시가 없는 하위 화면(자료·트레이스·레퍼런스) 전용 진행 스트립.
 * 홈·경로·클래스·교실·레슨 화면은 이미 진행률을 보여줘서 얹지 않는다.
 * 내비가 아니라 내 진행 정보를 보여 주는 콘텐츠 보조다(역할 분리는 LearnSectionShell 주석 참조).
 */
function LearningProgressStrip() {
  useBilingualI18nRevision();
  const t = useT();
  const { progress } = useLearningProgress();
  const completed = LESSONS.filter((lesson) => progress.lessons[lesson.id]?.completed).length;
  return (
    <section className="learn-progress-strip" aria-label={t(STRIP_LABEL)}>
      <span className="learn-progress-strip__label">{t(STRIP_LABEL)}</span>
      <progress
        className="learn-progress-strip__bar"
        value={completed}
        max={Math.max(LESSONS.length, 1)}
        aria-label={t(STRIP_LABEL)}
      />
      <span className="learn-progress-strip__count">
        <strong>{completed} / {LESSONS.length}</strong> {t(STRIP_DONE)}
      </span>
      <Link className="learn-progress-strip__link" to="/learn/records">
        {t(STRIP_RECORDS)}
      </Link>
    </section>
  );
}

/**
 * 자체 아트 히어로가 없는 정보형 하위 화면(자료) 전용 셸 배너.
 * 레퍼런스 화면(제작 과정·진로·교육기관)은 LearningReferenceLayout이 아트 히어로를 갖고 있어
 * 얹지 않는다 — 배너 아트와 히어로 아트가 두 겹으로 쌓이면 첫 화면이 무거워진다.
 * 학습 홈·클래스·교실처럼 자체 비주얼을 가진 화면과, 손으로 직접 그리는 실습(트레이스)처럼
 * 작업 표면이 바로 시작돼야 하는 화면에도 얹지 않는다.
 */
function LearningArtBanner() {
  return (
    <div className="learn-art-banner">
      <SectionArt image="learn" className="learn-art-banner__image" />
    </div>
  );
}

/** 자체 히어로를 가진 레퍼런스 화면군 — 진행 스트립을 본문 아래로 내리는 대상이다. */
const REFERENCE_PATHS: readonly string[] = ["/learn/process", "/learn/careers", "/learn/education"];

/**
 * 학습 셸의 역할 분리 (표준 문서 nav-standard.md의 S-1·S-2):
 * - 전역 크롬(헤더·푸터·단일 지도)은 AppShell이 소유한다. /learn은 몰입 예외가 아니므로
 *   학습 화면은 항상 전역 셸 안에서 렌더링된다.
 * - 섹션 내비는 공용 SectionNav(링크 모드) 하나뿐이다. 넓은 화면에서는 좌측 레일,
 *   좁은 화면에서는 같은 DOM이 상단 칩 줄이 된다. 학습 전용 내비 바를 따로 만들지 않는다.
 * - 아트 배너와 진행 스트립은 내비가 아니라 콘텐츠 보조다(배너=자체 아트 히어로가 없는
 *   화면의 섹션 아트, 스트립=내 진행 정보). 본문 열 안에서만 놓인다.
 *
 * 본문은 자식으로 받는다 — LearnPage가 경로별 화면을 골라 넣고, /learn 아래에 살지만
 * LearnPage 밖 라우트로 렌더링되는 화면(제작 레시피)도 라우트 레이어가 같은 셸로 감싼다.
 */
export function LearnSectionShell({ children }: { readonly children: ReactNode }) {
  useBilingualI18nRevision();
  const t = useT();
  const { pathname, hash } = useLocation();
  const normalizedPath = pathname.replace(/\/+$/u, "") || "/";

  const showArtBanner = normalizedPath === "/learn/resources";
  const isReferencePath = REFERENCE_PATHS.includes(normalizedPath);
  const showProgressStrip =
    normalizedPath === "/learn/resources" ||
    normalizedPath === "/learn/trace" ||
    isReferencePath;
  // 레퍼런스 화면(제작 과정·진로·교육기관)은 자체 히어로가 첫 화면의 주인공이다.
  // 진행 스트립을 히어로 위에 얹으면 안내 바·탭·배너와 겹쳐 첫 화면이 무거워지므로,
  // 이 화면군에서는 스트립을 본문 아래로 내린다(기능·목적지는 그대로 유지).
  const stripBelowContent = isReferencePath;

  // 현재 위치는 목적지당 하나만 표시한다. 학습 홈은 정확히 일치할 때만,
  // 학습 경로는 경로 상세(/learn/paths/*)와 홈의 앵커(#learning-paths)를 함께 본다.
  const isCurrent = (path: string) => path === "/learn#learning-paths"
    ? normalizedPath.startsWith("/learn/paths/") || (normalizedPath === "/learn" && hash === "#learning-paths")
    : path === "/learn"
      ? normalizedPath === "/learn" && hash !== "#learning-paths"
      : normalizedPath === path || normalizedPath.startsWith(`${path}/`);
  const navGroups: readonly SectionNavGroup[] = NAV_GROUPS.map((group) => ({
    id: group.id,
    label: t(group.label),
    items: group.items.map((item) => ({
      id: item.id,
      href: item.path,
      icon: item.icon,
      label: t(item.label),
      current: isCurrent(item.path),
    })),
  }));

  return (
    <div className="lg:mx-auto lg:grid lg:w-full lg:max-w-[var(--site-content-max,82.5rem)] lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:items-start lg:gap-6 lg:px-[var(--site-page-gutter,1.5rem)] lg:pt-6">
      <div className="px-[var(--site-page-gutter,1.5rem)] pt-5 lg:p-0">
        <SectionNav mode="links" label={t(NAV_ARIA_LABEL)} groups={navGroups} className="mb-6 lg:mb-0" />
      </div>
      <div className="min-w-0">
        {showArtBanner ? <LearningArtBanner /> : null}
        {showProgressStrip && !stripBelowContent ? <LearningProgressStrip /> : null}
        {children}
        {showProgressStrip && stripBelowContent ? <LearningProgressStrip /> : null}
      </div>
    </div>
  );
}
