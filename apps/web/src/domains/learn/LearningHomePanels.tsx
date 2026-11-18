import { Link } from "react-router-dom";

import { SiteShowMoreButton } from "@/domains/legal/public/site-rail";

import { LESSONS } from "./learning-content";
import { GOAL_OPTIONS, LEVEL_LABELS } from "./learning-home-constants";
import { LessonLibraryCard } from "./LearningHomeCards";
import type { Lesson } from "./learning-model";
import { LEARNING_GOALS, LEARNING_LEVELS, SKILLS, type LearningLevel, type LearningPath, type SkillId } from "./learning-paths";
import { DEFAULT_LEARNING_PROFILE, SESSION_MINUTES, type LearningProfile } from "./learning-profile";
import { LEARNING_ROLES, ROLE_LABELS } from "./learning-resources";
import type { LearningStore } from "./use-learning-progress";

const pathUrl = (id: string) => `/learn/paths/${encodeURIComponent(id)}`;

interface LearningPlanDisclosureProps {
  readonly open: boolean;
  readonly onToggle: (open: boolean) => void;
  readonly profile: LearningProfile;
  readonly profileWarning: string;
  readonly recommendedPath: LearningPath;
  readonly totalMinutes: number;
  readonly onUpdateProfile: (profile: LearningProfile) => void;
}

export function LearningPlanDisclosure({
  open: planOpen,
  onToggle: setPlanOpen,
  profile,
  profileWarning,
  recommendedPath,
  totalMinutes,
  onUpdateProfile: updateProfile,
}: LearningPlanDisclosureProps) {
  return (
    <details id="learn-plan" className="learn-plan-section learn-plan-disclosure" open={planOpen} onToggle={(event) => setPlanOpen(event.currentTarget.open)}>
      <summary>
        <span><span className="learn-eyebrow">PERSONAL LEARNING PLAN</span><strong id="learn-plan-title">학습 목표·시간 설정</strong></span>
        <span className="learn-plan-summary">{GOAL_OPTIONS.find((option) => option.value === profile.goal)?.label} · {LEVEL_LABELS[profile.level]} · {profile.sessionMinutes}분</span>
      </summary>
    <div className="learn-quick-goals" role="group" aria-label="빠른 학습 목표 선택">
      <span className="learn-eyebrow">처음 오셨나요? 목표를 고르면 아래 추천 수업이 즉시 바뀝니다</span>
      <div className="learn-card-chips">
        {(
          [
            { goal: "first-episode", level: "starter", label: "첫 3컷·첫 회차 완성" },
            { goal: "story", level: "starter", label: "스토리·컷 연출 강화" },
            { goal: "visual", level: "growing", label: "선화·채색 완성도" },
            { goal: "studio", level: "starter", label: "툰스튜디오 빠른 적응" },
            { goal: "publish", level: "advanced", label: "연재 전 원고 검수" },
          ] as const
        ).map((preset) => {
          const isSelected = profile.goal === preset.goal;
          return (
            <button
              key={preset.goal}
              type="button"
              aria-pressed={isSelected}
              onClick={() => updateProfile({ ...profile, goal: preset.goal, level: preset.level })}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
      <div className="learn-plan-layout">
        <div className="learn-plan-controls">
          <label htmlFor="learn-role">나의 역할
            <select id="learn-role" value={profile.role} onChange={(event) => {
              const value = LEARNING_ROLES.find((role) => role === event.currentTarget.value);
              updateProfile({ ...profile, role: value ?? DEFAULT_LEARNING_PROFILE.role });
            }}>
              {LEARNING_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
            </select>
          </label>
          <label htmlFor="learn-goal">지금 가장 중요한 목표
            <select id="learn-goal" value={profile.goal} onChange={(event) => {
              const value = LEARNING_GOALS.find((goal) => goal === event.currentTarget.value);
              updateProfile({ ...profile, goal: value ?? DEFAULT_LEARNING_PROFILE.goal });
            }}>
              {GOAL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label htmlFor="learn-level">현재 경험
            <select id="learn-level" value={profile.level} onChange={(event) => {
              const value = LEARNING_LEVELS.find((level) => level === event.currentTarget.value);
              updateProfile({ ...profile, level: value ?? DEFAULT_LEARNING_PROFILE.level });
            }}>
              <option value="starter">처음 시작하거나 기본부터 다시</option>
              <option value="growing">기초 제작 경험이 있음</option>
              <option value="advanced">한 회차를 완성·게시해 본 적 있음</option>
            </select>
          </label>
          <label htmlFor="learn-session-minutes">한 번에 집중할 시간
            <select id="learn-session-minutes" value={profile.sessionMinutes} onChange={(event) => {
              const value = SESSION_MINUTES.find((minutes) => minutes === Number(event.currentTarget.value));
              updateProfile({ ...profile, sessionMinutes: value ?? DEFAULT_LEARNING_PROFILE.sessionMinutes });
            }}>
              {SESSION_MINUTES.map((minutes) => <option key={minutes} value={minutes}>{minutes}분</option>)}
            </select>
          </label>
          {profileWarning && <p className="learn-caption" role="status">{profileWarning}</p>}
          <p className="learn-small">설정은 이 브라우저에만 저장되며 언제든 바꿀 수 있습니다.</p>
        </div>
        <article className="learn-plan-result">
          <span className="learn-recommended-label">추천 경로</span>
          <h3>{recommendedPath.title}</h3>
          <p>{recommendedPath.summary}</p>
          <div className="learn-plan-result-meta">
            <span>{recommendedPath.lessonIds.length}개 강좌</span>
            <span>총 약 {totalMinutes}분</span>
            <span>{LEVEL_LABELS[recommendedPath.level]}</span>
          </div>
          <p><strong>완성 목표</strong><br />{recommendedPath.outcome}</p>
          <Link className="learn-secondary" to={pathUrl(recommendedPath.id)}>추천 경로 자세히 보기 →</Link>
        </article>
      </div>
    </details>
  );
}

interface LearningLibrarySectionProps {
  readonly active: boolean;
  readonly query: string;
  readonly track: "all" | "foundation" | "studio";
  readonly level: "all" | LearningLevel;
  readonly duration: string;
  readonly status: string;
  readonly skill: "all" | SkillId;
  readonly sort: string;
  readonly secondaryFilterCount: number;
  readonly hasLibraryFilters: boolean;
  readonly filterKey: string;
  readonly filteredLessons: readonly Lesson[];
  readonly visibleCount: number;
  readonly remainingCount: number;
  readonly emptyTitle: string;
  readonly store: LearningStore;
  readonly onSetFilter: (key: string, value: string, replace?: boolean) => void;
  readonly onResetFilters: () => void;
  readonly onShowMore: () => void;
}

export function LearningLibrarySection({
  active,
  query,
  track,
  level,
  duration,
  status,
  skill,
  sort,
  secondaryFilterCount,
  hasLibraryFilters,
  filterKey,
  filteredLessons,
  visibleCount,
  remainingCount,
  emptyTitle,
  store,
  onSetFilter: setFilter,
  onResetFilters: resetFilters,
  onShowMore,
}: LearningLibrarySectionProps) {
  return (
    <section id="learn-library" className="learn-library-section" aria-labelledby="learn-library-title">
      <div className="learn-section-heading">
        <div><p className="learn-eyebrow">COURSE LIBRARY</p><h2 id="learn-library-title">필요한 수업을 바로 찾는 전체 강좌</h2></div>
        <p className="learn-small">추천 순서는 선택한 목표를 반영합니다.</p>
      </div>
      <div className="learn-library-filters">
        <label className="learn-search-label" htmlFor="learn-course-search">강좌 검색
          <input id="learn-course-search" type="search" maxLength={200} value={query} placeholder="콘티, 채색, 말풍선…" onChange={(event) => setFilter("q", event.currentTarget.value, true)} />
        </label>
        <label htmlFor="learn-track-filter">학습 과정
          <select id="learn-track-filter" value={track} onChange={(event) => setFilter("track", event.currentTarget.value)}>
            <option value="all">전체 과정</option><option value="foundation">제작 기초</option><option value="studio">툰스튜디오 실습</option>
          </select>
        </label>
        <label htmlFor="learn-level-filter">난이도
          <select id="learn-level-filter" value={level} onChange={(event) => setFilter("level", event.currentTarget.value)}>
            <option value="all">전체 난이도</option><option value="starter">처음 시작</option><option value="growing">기초를 익힌 뒤</option><option value="advanced">완성·게시 단계</option>
          </select>
        </label>
        <details className="learn-filter-more" open={secondaryFilterCount > 0 || undefined}>
          <summary>필터 더 보기{secondaryFilterCount > 0 ? ` · ${secondaryFilterCount}개 적용` : ""}</summary>
          <div className="learn-filter-more-grid">
            <label htmlFor="learn-duration-filter">소요 시간
              <select id="learn-duration-filter" value={duration} onChange={(event) => setFilter("duration", event.currentTarget.value)}>
                <option value="all">전체 시간</option><option value="quick">12분 이하</option><option value="standard">13–16분</option><option value="deep">17분 이상</option>
              </select>
            </label>
            <label htmlFor="learn-status-filter">진행 상태
              <select id="learn-status-filter" value={status} onChange={(event) => setFilter("status", event.currentTarget.value)}>
                <option value="all">전체 상태</option><option value="not-started">시작 전</option><option value="in-progress">학습 중</option><option value="completed">완료</option>
              </select>
            </label>
            <label htmlFor="learn-skill-filter">핵심 역량
              <select id="learn-skill-filter" value={skill} onChange={(event) => setFilter("skill", event.currentTarget.value)}>
                <option value="all">전체 역량</option>{SKILLS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label htmlFor="learn-sort">정렬
              <select id="learn-sort" value={sort} onChange={(event) => setFilter("sort", event.currentTarget.value)}>
                <option value="recommended">내 목표 추천순</option><option value="sequence">제작 순서</option><option value="shortest">짧은 강좌순</option>
              </select>
            </label>
          </div>
        </details>
      </div>
      <div className="learn-card-chips" role="group" aria-label="인기 학습 주제">
        {(["전체", "콘티", "선화", "채색", "말풍선"] as const).map((topic) => {
          const value = topic === "전체" ? "" : topic;
          const active = query === value;
          return (
            <button
              key={topic}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter("q", value, true)}
            >
              #{topic}
            </button>
          );
        })}
      </div>
      <div className="learn-library-result-row">
        <p className="learn-small" role="status">검색 결과 {filteredLessons.length}개</p>
        {hasLibraryFilters && <button type="button" onClick={resetFilters}>필터 초기화</button>}
      </div>
      {filteredLessons.length ? (
        <>
          <div key={filterKey} className={active ? "learn-card-grid ink-cascade" : "learn-card-grid"}>
            {filteredLessons.slice(0, visibleCount).map((lesson) => <LessonLibraryCard key={lesson.id} lesson={lesson} store={store} index={LESSONS.indexOf(lesson)} />)}
          </div>
          <SiteShowMoreButton remaining={remainingCount} onClick={onShowMore} label={`강좌 더 보기 · ${remainingCount}개 남음`} />
        </>
      ) : (
        <div className="learn-empty"><h3>{emptyTitle}</h3><p>검색어나 필터를 바꾸어 보세요.</p><button type="button" onClick={resetFilters}>전체 강좌 보기</button></div>
      )}
    </section>
  );
}
