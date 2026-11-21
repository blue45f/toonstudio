import {
  Archive,
  ArrowRight,
  BookOpen,
  Clock3,
  GraduationCap,
  Library,
  PenTool,
  Telescope,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";

import { SiteLinkCard } from "@/domains/legal/public/site-link-card";
import { SiteRail } from "@/domains/legal/public/site-rail";
import { SiteTabPanel } from "@/domains/legal/public/site-section-tabs";
import { useShowMore } from "@/domains/legal/public/site-show-more";
import { useSiteTabAnchors, useSiteTabs } from "@/domains/legal/public/site-tabs";
import { PageIntro } from "@/shared/components/page-intro";
import { RevealOnScroll } from "@/shared/components/reveal-on-scroll";
import { SiteArtSurfaceSpotlight } from "@/shared/components/site-experience/SiteArtSurfaceSpotlight";
import { WorkflowIllustration } from "@/shared/components/site-experience/WorkflowIllustration";
import { useT } from "@/shared/lib/i18n";
import { defineBilingualText, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { LEARN_CURRICULUM_ROADMAP_TRACKS } from "@/shared/navigation/webtoon-platform-router-ux-model";

import { LESSONS, TERMS } from "./learning-content";
import { LearningBottleneckSprintBar } from "./LearningBottleneckSprintBar";
import { PathCard, SkillCard } from "./LearningHomeCards";
import { LEVEL_LABELS, STATUS_LABELS } from "./learning-home-constants";
import { LearningLibrarySection, LearningPlanDisclosure } from "./LearningHomePanels";
import { LearningProcessStudy } from "./LearningProcessStudy";
import { LearnUnderlineTabs, type LearnUnderlineTabItem } from "./LearnUnderlineTabs";
import { learnStatusText } from "./learn-status-i18n";
import { matchesSearch } from "./learning-model";
import { learningPathTintStyle } from "./learning-path-tints";
import {
  LEARNING_LEVELS,
  LEARNING_PATHS,
  SKILLS,
  SKILL_IDS,
  buildSessionPlan,
  getLessonMeta,
  getLessonState,
  getPathLessons,
  getPathStats,
  getSkillProgress,
  recommendLearningPath,
  type LearningLevel,
  type SkillId,
} from "./learning-paths";
import { loadLearningProfile, saveLearningProfile, type LearningProfile } from "./learning-profile";
import { useLearningProgress } from "./use-learning-progress";

import "./learning-hub.css";
import "./learning-home-classroom.css";

const NEXT_TOOLS_LABEL = defineBilingualText("learnHome", "nextTools", "배운 것을 자료와 작업으로 잇기", "Continue with references and practice");
const SINGLE_LESSON_NOTE = defineBilingualText("learnHome", "singleLesson", "오늘은 이 강좌 하나에 집중해 보세요.", "Focus on this one lesson today.");

const lessonUrl = (id: string) => `/learn/lessons/${encodeURIComponent(id)}`;
const lessonUrlInPath = (id: string, pathId: string) => `${lessonUrl(id)}?from=${encodeURIComponent(pathId)}`;
const pathUrl = (id: string) => `/learn/paths/${encodeURIComponent(id)}`;

function browserStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function updateSearchParam(params: URLSearchParams, key: string, value: string) {
  const updated = new URLSearchParams(params);
  if (!value || value === "all" || (key === "sort" && value === "recommended")) updated.delete(key);
  else updated.set(key, value);
  return updated;
}

type LearnHubTab = "today" | "paths" | "library" | "skills";
const LEARN_HUB_TABS: readonly LearnHubTab[] = ["today", "paths", "library", "skills"];
const LEARN_TAB_PREFIX = "learn-hub";
const LIBRARY_PAGE_SIZE = 6;
const LIBRARY_FILTER_KEYS = ["q", "track", "level", "duration", "status", "skill", "sort"] as const;
const LEARN_HASH_TABS: Readonly<Record<string, LearnHubTab>> = {
  "#learn-plan": "today",
  "#learning-paths": "paths",
  "#learn-library": "library",
};

const LEARN_NEXT_STEPS: readonly { href: string; icon: LucideIcon; title: string; description: string }[] = [
  { href: "/research", icon: Telescope, title: "리서치 데스크에서 자료 찾기", description: "배운 장면에 필요한 레퍼런스·3D 재료·폰트를 출처와 함께 모읍니다." },
  { href: "/learn/studio", icon: PenTool, title: "작업 화면에서 직접 해보기", description: "기존 작업을 바꾸지 않는 툰스튜디오 실습으로 이어집니다." },
  { href: "/learn/resources", icon: Library, title: "외부 강좌·공식 자료 찾기", description: "에듀코카·WEBTOON Academy 등 공식 자료를 직군별로 봅니다." },
  { href: "/learn/classroom", icon: GraduationCap, title: "교육기관용 Classroom", description: "주차별 커리큘럼에 강좌·자료·실습 과제를 묶습니다." },
  { href: "/learn/glossary", icon: BookOpen, title: "용어 사전", description: `한국어·영문·다른 이름으로 핵심 용어 ${TERMS.length}개를 찾고 저장합니다.` },
  { href: "/learn/records", icon: Archive, title: "학습 기록 백업·복원", description: "이 브라우저의 완료 기록과 메모를 파일로 지킵니다." },
];

type InkPanelStyle = CSSProperties & { "--ink-radius"?: string; "--ink-dash"?: number };

export function LearningHome() {
  useBilingualI18nRevision();
  const t = useT();
  const store = useLearningProgress();
  const [params, setParams] = useSearchParams();
  const { hash } = useLocation();
  const [profile, setProfile] = useState<LearningProfile>(() => loadLearningProfile(browserStorage()));
  const [profileWarning, setProfileWarning] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [planOpen, setPlanOpen] = useState(hash === "#learn-plan");

  useEffect(() => { document.title = "배우기 · 툰스튜디오"; }, []);

  const hasLibraryFilters = LIBRARY_FILTER_KEYS.some((key) => params.has(key));
  const { value: activeTab, select: selectTab, isMounted } = useSiteTabs({
    ids: LEARN_HUB_TABS,
    fallback: hasLibraryFilters ? "library" : "today",
    param: "view",
  });

  const recommendedPath = recommendLearningPath(profile.goal, profile.level);
  const recommendedStats = getPathStats(recommendedPath, store.progress);
  const sessionLessons = buildSessionPlan(recommendedPath, store.progress, profile.sessionMinutes);
  const nextLesson = sessionLessons[0] ?? LESSONS[0]!;
  const nextLessonState = getLessonState(store.progress, nextLesson.id);
  const completedCount = LESSONS.filter((lesson) => getLessonState(store.progress, lesson.id) === "completed").length;
  const overallPercent = Math.round((completedCount / Math.max(LESSONS.length, 1)) * 100);
  const skillProgress = getSkillProgress(store.progress);
  const maxSkillTotal = Math.max(1, ...skillProgress.map((entry) => entry.total));

  const query = (params.get("q") ?? "").slice(0, 200);
  const rawTrack = params.get("track") ?? "all";
  const track = rawTrack === "foundation" || rawTrack === "studio" ? rawTrack : "all";
  const rawLevel = params.get("level") ?? "all";
  const level = LEARNING_LEVELS.includes(rawLevel as LearningLevel) ? (rawLevel as LearningLevel) : "all";
  const rawDuration = params.get("duration") ?? "all";
  const duration = ["quick", "standard", "deep"].includes(rawDuration) ? rawDuration : "all";
  const rawStatus = params.get("status") ?? "all";
  const status = ["not-started", "in-progress", "completed"].includes(rawStatus) ? rawStatus : "all";
  const rawSkill = params.get("skill") ?? "all";
  const skill = SKILL_IDS.includes(rawSkill as SkillId) ? (rawSkill as SkillId) : "all";
  const rawSort = params.get("sort") ?? "recommended";
  const sort = ["sequence", "shortest"].includes(rawSort) ? rawSort : "recommended";
  const secondaryFilterCount = [duration, status, skill].filter((value) => value !== "all").length + (sort !== "recommended" ? 1 : 0);

  const recommendedRank = new Map(recommendedPath.lessonIds.map((id, index) => [id, index]));
  const filteredLessons = LESSONS.filter((lesson) => {
    const meta = getLessonMeta(lesson.id);
    const lessonState = getLessonState(store.progress, lesson.id);
    const termNames = lesson.terms.map((termId) => TERMS.find((term) => term.id === termId)?.name ?? termId);
    const durationMatches = duration === "all"
      || (duration === "quick" && lesson.minutes <= 12)
      || (duration === "standard" && lesson.minutes >= 13 && lesson.minutes <= 16)
      || (duration === "deep" && lesson.minutes >= 17);
    return (track === "all" || lesson.track === track)
      && (level === "all" || meta.level === level)
      && durationMatches
      && (status === "all" || lessonState === status)
      && (skill === "all" || meta.skills.includes(skill))
      && matchesSearch(query, [lesson.title, lesson.summary, meta.outcome, ...termNames]);
  });
  filteredLessons.sort((left, right) => {
    if (sort === "shortest") return left.minutes - right.minutes || LESSONS.indexOf(left) - LESSONS.indexOf(right);
    if (sort === "sequence") return LESSONS.indexOf(left) - LESSONS.indexOf(right);
    return (recommendedRank.get(left.id) ?? 100) - (recommendedRank.get(right.id) ?? 100) || LESSONS.indexOf(left) - LESSONS.indexOf(right);
  });
  const filterKey = [query, track, level, duration, status, skill, sort].join("|");
  const library = useShowMore(filteredLessons.length, LIBRARY_PAGE_SIZE, filterKey);
  const { openAnchor, revealAnchor } = useSiteTabAnchors(LEARN_HASH_TABS, activeTab, selectTab);

  function updateProfile(next: LearningProfile) {
    setProfile(next);
    setProfileWarning(saveLearningProfile(browserStorage(), next) ? "" : learnStatusText("learn.status.home.profileSaveFailed", "학습 목표를 기기에 저장하지 못했습니다. 현재 화면에서는 계속 사용할 수 있습니다."));
  }
  function setFilter(key: string, value: string, replace = false) {
    setParams(updateSearchParam(params, key, value), { replace });
  }
  function resetFilters() {
    const kept = new URLSearchParams();
    const view = params.get("view");
    if (view) kept.set("view", view);
    setParams(kept);
  }
  function browseSkill(skillId: SkillId) {
    const updated = updateSearchParam(params, "skill", skillId);
    updated.set("view", "library");
    setParams(updated);
    revealAnchor("#learn-library");
  }
  function editPlan() {
    setPlanOpen(true);
    openAnchor("#learn-plan");
  }

  const hubTabs: readonly LearnUnderlineTabItem<LearnHubTab>[] = [
    { id: "today", label: "오늘의 학습" },
    { id: "paths", label: "학습 경로", count: LEARNING_PATHS.length },
    { id: "library", label: "전체 강좌", count: LESSONS.length },
    { id: "skills", label: "역량 지도" },
  ];
  const artPanelStyle: InkPanelStyle = { "--ink-radius": "12px" };

  return (
    <PageIntro variant="chapter" className="learn-page learn-home-page" lang="ko">
      <a className="learn-skip-link" href={`#${LEARN_TAB_PREFIX}`}>학습 영역으로 건너뛰기</a>
      {store.warning && <p className="learn-caution" role="status">{store.warning}</p>}

      <header className="learn-classroom-heading">
        <div>
          <p className="learn-kicker">추천 학습 경로</p>
          <h1>{recommendedPath.title}</h1>
        </div>
        <p className="learn-small">로그인 없이 시작 · 기록은 이 브라우저에 저장</p>
      </header>

      <section id={LEARN_TAB_PREFIX} className="learn-hub-tabs" aria-label="학습 영역">
        <LearnUnderlineTabs tabs={hubTabs} value={activeTab} onChange={selectTab} label="학습 영역" idPrefix={LEARN_TAB_PREFIX} />

        <SiteTabPanel idPrefix={LEARN_TAB_PREFIX} id="today" active={activeTab === "today"} mounted={isMounted("today")} className="learn-hub-panel">
          <div className={activeTab === "today" ? "ink-cascade" : undefined}>
            <LearningBottleneckSprintBar
              profile={profile}
              progress={store.progress}
              onUpdateProfile={updateProfile}
            />
            <section className="learn-classroom-session" aria-labelledby="learn-session-title">
              <article className="learn-classroom-feature">
                <div className="learn-classroom-feature-copy">
                  <p className="learn-eyebrow">{recommendedPath.title}</p>
                  <div className="learn-classroom-meta">
                    <span className={`learn-status learn-status-${nextLessonState}`}>{STATUS_LABELS[nextLessonState]}</span>
                    <span className="tabular-nums"><Clock3 size={14} aria-hidden="true" />약 {nextLesson.minutes}분</span>
                  </div>
                  <h2 id="learn-session-title">{nextLesson.title}</h2>
                  <p className="learn-card-outcome"><strong>완성할 것</strong><span>{getLessonMeta(nextLesson.id).outcome}</span></p>
                  <div className="learn-classroom-actions">
                    <Link className="learn-primary ink-arrow" to={lessonUrlInPath(nextLesson.id, recommendedPath.id)}>
                      {nextLessonState === "completed" ? "복습하기" : nextLessonState === "in-progress" ? "계속하기" : "시작하기"}
                      <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                    <Link className="learn-classroom-path-link ink-arrow" to={pathUrl(recommendedPath.id)}>
                      경로 보기<ArrowRight size={15} aria-hidden="true" />
                    </Link>
                  </div>
                </div>
                <figure className="learn-classroom-art ink-sheen ink-cover" data-ink-enter="panel" style={artPanelStyle}>
                  <WorkflowIllustration kind="learn" priority />
                  <figcaption>ToonStudio 콘셉트 아트</figcaption>
                </figure>
              </article>

              <aside className="learn-dashboard-card learn-dashboard-overview" aria-label="내 학습 현황">
                <div className="learn-dashboard-heading">
                  <span className="learn-kicker">내 학습 현황</span>
                  <strong className="tabular-nums"><span className="sr-only">전체 강좌 </span>{overallPercent}%<span className="sr-only"> 완료</span></strong>
                </div>
                <progress className="sr-only" value={completedCount} max={Math.max(LESSONS.length, 1)} aria-label="전체 강좌 완료율" />
                <div className="learn-overview-meter" aria-hidden="true">
                  <span className="learn-overview-meter__fill ink-bar-fill" style={{ width: `${overallPercent}%` }} />
                </div>
                <dl className="learn-dashboard-stats">
                  <div><dt>완료 강좌</dt><dd className="tabular-nums">{completedCount}/{LESSONS.length}</dd></div>
                  <div><dt>저장한 용어</dt><dd className="tabular-nums">{store.progress.bookmarks.length}</dd></div>
                  <div><dt>다음 세션</dt><dd className="tabular-nums">{sessionLessons.reduce((sum, lesson) => sum + lesson.minutes, 0)}분</dd></div>
                </dl>
              </aside>

              <div className="learn-session-heading">
                <div>
                  <h3 className="tabular-nums">{profile.sessionMinutes}분 안에 이어갈 학습</h3>
                  <p className="learn-small tabular-nums">{recommendedStats.completed === recommendedStats.total ? "경로를 완료해 복습 강좌를 제안합니다" : `추천 경로의 남은 시간 약 ${recommendedStats.remainingMinutes}분`}</p>
                </div>
                <button type="button" className="learn-secondary" aria-expanded={planOpen} aria-controls="learn-plan" onClick={editPlan}>학습 설정 바꾸기</button>
              </div>
              {sessionLessons.length > 1 ? (
                <ol className="learn-session-list" start={2}>
                  {sessionLessons.slice(1).map((lesson, index) => {
                    const state = getLessonState(store.progress, lesson.id);
                    return (
                      <li key={lesson.id}>
                        <span className="learn-session-number tabular-nums">{index + 2}</span>
                        <div><span className="tabular-nums">{STATUS_LABELS[state]} · 약 {lesson.minutes}분</span><h3>{lesson.title}</h3><p>{getLessonMeta(lesson.id).outcome}</p></div>
                        <Link className="ink-arrow" to={lessonUrlInPath(lesson.id, recommendedPath.id)}>{state === "completed" ? "복습" : state === "in-progress" ? "계속" : "시작"}<ArrowRight size={14} aria-hidden="true" /></Link>
                      </li>
                    );
                  })}
                </ol>
              ) : <p className="learn-session-focus-note">{t(SINGLE_LESSON_NOTE)}</p>}
            </section>

            <LearningPlanDisclosure
              open={planOpen}
              onToggle={setPlanOpen}
              profile={profile}
              profileWarning={profileWarning}
              recommendedPath={recommendedPath}
              totalMinutes={recommendedStats.totalMinutes}
              onUpdateProfile={updateProfile}
            />
          </div>
        </SiteTabPanel>

        <SiteTabPanel idPrefix={LEARN_TAB_PREFIX} id="paths" active={activeTab === "paths"} mounted={isMounted("paths")} className="learn-hub-panel">
          <div className={activeTab === "paths" ? "ink-cascade" : undefined}>
            <RevealOnScroll>
              <section id="learning-paths" aria-labelledby="learning-paths-title">
                <div className="learn-section-heading">
                  <div><p className="learn-eyebrow">단계별 커리큘럼</p><h2 id="learning-paths-title">목표까지 길을 잃지 않는 학습 경로</h2></div>
                  <p className="learn-small">강좌를 건너뛰어도 막지 않으며, 필요한 부분만 골라 학습할 수 있습니다</p>
                </div>
                <SiteRail label="학습 경로 목록" className={activeTab === "paths" ? "learn-path-rail ink-cascade" : "learn-path-rail"} columns="sm:grid-cols-2 xl:grid-cols-3">
                  {LEARNING_PATHS.map((path) => <PathCard key={path.id} path={path} store={store} recommended={path.id === recommendedPath.id} />)}
                </SiteRail>
              </section>
            </RevealOnScroll>
            <RevealOnScroll variant="fade"><LearningProcessStudy /></RevealOnScroll>
          </div>
        </SiteTabPanel>

        <SiteTabPanel idPrefix={LEARN_TAB_PREFIX} id="library" active={activeTab === "library"} mounted={isMounted("library")} className="learn-hub-panel">
          <div className={activeTab === "library" ? "ink-cascade" : undefined}>
            <RevealOnScroll>
              <LearningLibrarySection
                active={activeTab === "library"}
                query={query}
                track={track}
                level={level}
                duration={duration}
                status={status}
                skill={skill}
                sort={sort}
                secondaryFilterCount={secondaryFilterCount}
                hasLibraryFilters={hasLibraryFilters}
                filterKey={filterKey}
                filteredLessons={filteredLessons}
                visibleCount={library.visible}
                remainingCount={library.remaining}
                emptyTitle={learnStatusText("learn.status.home.coursesEmpty", "조건에 맞는 강좌가 없습니다.")}
                store={store}
                onSetFilter={setFilter}
                onResetFilters={resetFilters}
                onShowMore={() => library.showMore()}
              />
            </RevealOnScroll>
          </div>
        </SiteTabPanel>

        <SiteTabPanel idPrefix={LEARN_TAB_PREFIX} id="skills" active={activeTab === "skills"} mounted={isMounted("skills")} className="learn-hub-panel">
          <div className={activeTab === "skills" ? "ink-cascade" : undefined}>
            <RevealOnScroll>
              <section className="learn-skill-section" aria-labelledby="learn-skills-title">
                <div className="learn-section-heading">
                  <div><p className="learn-eyebrow">역량 분포</p><h2 id="learn-skills-title">완료한 강좌로 보는 나의 제작 경험</h2></div>
                  <p className="learn-small">숙련도 평가가 아니라 관련 강좌의 완료 비율입니다.</p>
                </div>
                <div className={activeTab === "skills" ? "learn-skill-grid ink-cascade" : "learn-skill-grid"}>
                  {skillProgress.map((item, idx) => <SkillCard key={item.id} skill={item} index={idx} maxTotal={maxSkillTotal} store={store} onBrowse={browseSkill} />)}
                </div>
              </section>
            </RevealOnScroll>
          </div>
        </SiteTabPanel>
      </section>

      <details className="learn-classroom-roadmap">
        <summary>학습 경로 · 강좌·자료</summary>
        <section aria-label="직무·스킬트리별 실전 커리큘럼 로드맵" data-testid="learn-rea-curriculum-roadmap" className="mb-6 pt-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="learn-kicker">직무별 실전 스킬트리</p>
              <h2 className="mt-1 text-base font-semibold text-fg">스토리 각색 · 작화 · 3D 연출 · 데뷔 수익화 4대 실전 스킬트리 로드맵</h2>
            </div>
            <span className="rounded-md border border-line bg-canvas px-2.5 py-1 text-xs font-medium text-fg-2">학습 후 즉시 실습 스튜디오 연동</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {LEARN_CURRICULUM_ROADMAP_TRACKS.map((trackItem) => (
              <div key={trackItem.id} className="flex flex-col justify-between rounded-xl border border-line bg-panel p-4 transition-colors hover:border-accent/50">
                <div>
                  <span className="inline-block rounded bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">{trackItem.badge}</span>
                  <h3 className="mt-2.5 text-sm font-semibold text-fg">{trackItem.label}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-fg-2">{trackItem.description}</p>
                </div>
                <div className="mt-3 border-t border-line pt-2.5">
                  <Link to={trackItem.practiceHref} className="ink-arrow inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                    {trackItem.practiceLabel}<ArrowRight size={13} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
        <SiteArtSurfaceSpotlight cardId="nb-learn-academy" compact className="mt-6 pb-4" />
      </details>

      <details className="learn-classroom-roadmap">
        <summary>{t(NEXT_TOOLS_LABEL)}</summary>
        <RevealOnScroll variant="fade">
          <section className="learn-next-steps pt-2" aria-labelledby="learn-next-steps-title">
            <div className="learn-section-heading">
              <div><p className="learn-eyebrow">다음 단계</p><h2 id="learn-next-steps-title">배운 것을 자료와 작업으로 잇기</h2></div>
              <p className="learn-small">학습 → 자료 찾기 → 실제 작업 순서로 이어집니다</p>
            </div>
            <SiteRail label="학습 다음 단계" columns="sm:grid-cols-2 xl:grid-cols-3">
              {LEARN_NEXT_STEPS.map((step) => (
                <SiteLinkCard key={step.href} href={step.href === "/learn/resources" ? `/learn/resources?role=${profile.role}` : step.href} icon={step.icon} title={step.title} description={step.description} cta="열기" className="w-full" />
              ))}
            </SiteRail>
          </section>
        </RevealOnScroll>
      </details>

      <footer className="learn-local-footer">
        <p>한국어 학습 콘텐츠 · 로그인 없이 이용 가능 · 학습 기록과 목표 설정은 현재 브라우저에만 저장됩니다.</p>
        <p>완료 표시는 자기주도 점검 기록이며 공인 수료증, 작품 심사 또는 자동 품질 평가가 아닙니다.</p>
        {confirmReset ? (
          <div className="learn-actions" role="group" aria-label="학습 기록 초기화 확인">
            <p>이 브라우저의 학습 완료 기록·메모·저장한 용어를 모두 지울까요?</p>
            <button type="button" onClick={() => { store.reset(); setConfirmReset(false); }}>모두 지우기</button>
            <button type="button" onClick={() => setConfirmReset(false)}>취소</button>
          </div>
        ) : <button type="button" onClick={() => setConfirmReset(true)}>학습 기록 초기화…</button>}
      </footer>
    </PageIntro>
  );
}

export function LearningPathPage({ pathId }: { readonly pathId: string }) {
  const store = useLearningProgress();
  const path = LEARNING_PATHS.find((candidate) => candidate.id === pathId);
  const lessons = path ? getPathLessons(path) : [];
  const stats = path ? getPathStats(path, store.progress) : null;
  const nextLesson = lessons.find((lesson) => getLessonState(store.progress, lesson.id) !== "completed") ?? lessons[0];

  useEffect(() => { document.title = `${path?.title ?? "학습 경로"} · 툰스튜디오`; }, [path?.title]);

  if (!path || !stats || !nextLesson) {
    return (
      <div className="learn-page learn-path-page" lang="ko">
        <section className="learn-empty">
          <h1>{learnStatusText("learn.status.home.pathNotFound", "학습 경로를 찾을 수 없습니다.")}</h1>
          <p>주소가 변경되었거나 존재하지 않는 경로입니다.</p>
          <Link className="learn-primary" to="/learn#learning-paths">학습 경로 보기</Link>
        </section>
      </div>
    );
  }

  const spineStyle: InkPanelStyle = { "--ink-dash": 800 };

  return (
    <div className="learn-page learn-path-page" lang="ko" style={learningPathTintStyle(path.id)}>
      {store.warning && <p className="learn-caution" role="status">{store.warning}</p>}
      <header className="learn-path-hero">
        <div>
          <Link className="learn-back" to="/learn#learning-paths">← 모든 학습 경로</Link>
          <p className="learn-eyebrow">단계별 학습 경로 · {LEVEL_LABELS[path.level]}</p>
          <h1>{path.title}</h1>
          <p className="learn-intro">{path.summary}</p>
          <div className="learn-actions">
            {stats.completed === stats.total
              ? <><Link className="learn-primary ink-arrow" to="/create">배운 흐름으로 첫 회차 만들기<ArrowRight size={16} aria-hidden="true" /></Link><Link className="learn-secondary" to="/learn#learning-paths">다른 학습 경로 보기</Link></>
              : <><Link className="learn-primary ink-arrow" to={lessonUrlInPath(nextLesson.id, path.id)}>{stats.completed ? "이어서 학습하기" : "경로 시작하기"}<ArrowRight size={16} aria-hidden="true" /></Link><Link className="learn-secondary" to="/learn#learn-library">전체 강좌 보기</Link></>}
          </div>
        </div>
        <aside className="learn-path-hero-card" aria-label="경로 진행 현황">
          <span>경로 결과물</span>
          <strong>{path.outcome}</strong>
          <div className="tabular-nums"><span>완료 {stats.completed}/{stats.total}</span><span>{stats.percent}%</span></div>
          <progress className="sr-only" value={stats.completed} max={Math.max(stats.total, 1)} aria-label={`${path.title} 완료율`} />
          <div className="learn-meter-track" aria-hidden="true"><span className="learn-meter-fill ink-bar-fill" style={{ width: `${stats.percent}%` }} /></div>
          <p className="tabular-nums">총 약 {stats.totalMinutes}분 · 남은 강좌 약 {stats.remainingMinutes}분</p>
        </aside>
      </header>

      <div className="learn-path-detail-layout">
        <section aria-labelledby="learn-path-course-title">
          <div className="learn-section-heading"><div><p className="learn-eyebrow">단계별 실습 순서</p><h2 id="learn-path-course-title">결과물을 쌓는 순서</h2></div><p className="learn-small">완료 조건은 각 강좌의 실습 체크리스트와 확인 퀴즈입니다</p></div>
          <div className="learn-path-course-stage">
            <svg className="learn-path-spine" viewBox="0 0 4 800" preserveAspectRatio="none" aria-hidden="true">
              <line x1="2" y1="0" x2="2" y2="800" className="learn-path-spine__rail" />
              <line x1="2" y1="0" x2="2" y2="800" className="learn-path-spine__ink ink-stroke-draw" style={spineStyle} />
            </svg>
            <ol className="learn-path-course-list ink-cascade">
              {lessons.map((lesson, index) => {
                const meta = getLessonMeta(lesson.id);
                const state = getLessonState(store.progress, lesson.id);
                return (
                  <li key={lesson.id} className={`is-${state}${stats.completed < stats.total && lesson.id === nextLesson.id ? " is-current" : ""}`}>
                    <span className="learn-path-step tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <div className="learn-card-chips"><span>{STATUS_LABELS[state]}</span><span>{LEVEL_LABELS[meta.level]}</span><span className="tabular-nums">약 {lesson.minutes}분</span></div>
                      <h3><Link to={lessonUrlInPath(lesson.id, path.id)}>{lesson.title}</Link></h3>
                      <p>{lesson.summary}</p>
                      <strong>결과물 · {meta.outcome}</strong>
                    </div>
                    <Link className="ink-arrow" to={lessonUrlInPath(lesson.id, path.id)}>{state === "completed" ? "복습" : state === "in-progress" ? "계속" : "시작"}<ArrowRight size={14} aria-hidden="true" /></Link>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
        <aside className="learn-path-side">
          {stats.completed === stats.total
            ? <section><p className="learn-eyebrow">경로 완료</p><h2>이 경로를 모두 마쳤습니다</h2><p>결과물을 실제 작품으로 이어 가거나, 다른 경로로 실력을 넓혀 보세요.</p><Link className="learn-primary ink-arrow" to="/create">첫 회차 만들기<ArrowRight size={15} aria-hidden="true" /></Link></section>
            : <section><p className="learn-eyebrow">다음 수업</p><h2>{nextLesson.title}</h2><p>{getLessonMeta(nextLesson.id).outcome}</p><Link className="learn-primary ink-arrow" to={lessonUrlInPath(nextLesson.id, path.id)}>다음 강좌 열기<ArrowRight size={15} aria-hidden="true" /></Link></section>}
          <section><h2>이 경로가 다루는 역량</h2><div className="learn-card-skills">{[...new Set(lessons.flatMap((lesson) => getLessonMeta(lesson.id).skills))].map((skillId) => <span key={skillId}>{SKILLS.find((skill) => skill.id === skillId)?.label}</span>)}</div></section>
          <section><h2>기억할 점</h2><p>경로는 권장 순서입니다. 이미 아는 강좌는 건너뛰고, 필요한 강좌만 골라 학습해도 기록은 정상적으로 저장됩니다.</p></section>
        </aside>
      </div>

      <section className="learn-banner"><div><p className="learn-eyebrow">결과물 중심 학습</p><h2>설명보다 결과물로 확인하세요</h2><p>각 강좌의 체크리스트는 스스로 작업을 검수하기 위한 도구입니다. 자동 채점이나 작품 품질 인증으로 사용하지 않습니다.</p></div><Link className="learn-secondary ink-arrow" to="/learn/records">내 학습 기록 보기<ArrowRight size={15} aria-hidden="true" /></Link></section>
      <footer className="learn-local-footer"><p>학습 경로와 진행률은 현재 브라우저에서 계산됩니다. 계정·다른 기기로 자동 동기화되지 않습니다.</p></footer>
    </div>
  );
}
