import type { CSSProperties } from "react";
import { Link } from "react-router-dom";

import { LESSONS } from "./learning-content";
import { LEVEL_LABELS, STATUS_LABELS } from "./learning-home-constants";
import type { Lesson } from "./learning-model";
import { learningPathTintStyle } from "./learning-path-tints";
import {
  LEARNING_PATHS,
  SKILLS,
  getLessonMeta,
  getLessonRequirementProgress,
  getLessonState,
  getPathStats,
  type getSkillProgress,
  type LearningPath,
  type SkillId,
} from "./learning-paths";
import { SKILL_ICONS } from "./learning-skill-icons";
import type { LearningStore } from "./use-learning-progress";

const lessonUrl = (id: string) => `/learn/lessons/${encodeURIComponent(id)}`;
const pathUrl = (id: string) => `/learn/paths/${encodeURIComponent(id)}`;

export function LessonLibraryCard({ lesson, store, index }: { lesson: Lesson; store: LearningStore; index: number }) {
  const meta = getLessonMeta(lesson.id);
  const state = getLessonState(store.progress, lesson.id);
  // 진도율은 강좌 상세와 같은 정본 계산(유효·중복 제거된 체크 기준)을 쓴다.
  // 지역 사본이 raw checks.length로 계산하면 같은 강좌가 화면마다 다른 %를 보인다.
  const progress = getLessonRequirementProgress(lesson, store.progress);
  return (
    <article className={`learn-card learn-library-card${state === "completed" ? " is-complete" : ""}`}>
      <div className="learn-card-top">
        <span className="learn-number">{String(index + 1).padStart(2, "0")}</span>
        <span className={`learn-status learn-status-${state}`}>{STATUS_LABELS[state]}</span>
      </div>
      <div className="learn-card-chips" aria-label="강좌 정보">
        <span>{lesson.track === "studio" ? "툰스튜디오 실습" : "제작 기초"}</span>
        <span>{LEVEL_LABELS[meta.level]}</span>
        <span>약 {lesson.minutes}분</span>
      </div>
      <h3><Link to={lessonUrl(lesson.id)}>{lesson.title}</Link></h3>
      <p>{lesson.summary}</p>
      <div className="learn-card-outcome"><strong>완성할 것</strong><span>{meta.outcome}</span></div>
      <div className="learn-card-skills" aria-label="관련 역량">
        {meta.skills.map((skillId) => {
          const SkillIcon = SKILL_ICONS[skillId];
          return <span key={skillId}><SkillIcon size={13} aria-hidden="true" />{SKILLS.find((skill) => skill.id === skillId)?.label}</span>;
        })}
      </div>
      {state !== "not-started" && (
        <div className="learn-card-progress">
          <span>자가 점검 진행 {progress}%</span>
          <progress value={progress} max={100} aria-label={`${lesson.title} 자가 점검 진행률`} />
        </div>
      )}
      <div className="learn-card-bottom">
        <span>{meta.format === "studio-practice" ? "작업 화면에서 따라 하기" : "설명 · 조작형 예제 · 실습"}</span>
        <Link to={lessonUrl(lesson.id)} aria-label={`${lesson.title} ${state === "completed" ? "복습" : state === "in-progress" ? "계속 학습" : "시작"}`}>
          {state === "completed" ? "복습하기" : state === "in-progress" ? "계속하기" : "배우기"} <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}

type SkillProgress = ReturnType<typeof getSkillProgress>[number];

/** 스킬 카드 — 완료율과 함께 해당 역량의 다음 추천 강좌를 바로 보여준다. */
export function SkillCard({ skill, store, onBrowse, index, maxTotal }: {
  readonly skill: SkillProgress;
  readonly store: LearningStore;
  readonly onBrowse: (skillId: SkillId) => void;
  readonly index: number;
  readonly maxTotal: number;
}) {
  const skillLessons = LESSONS.filter((lesson) => getLessonMeta(lesson.id).skills.includes(skill.id));
  const nextLesson = skillLessons.find((lesson) => getLessonState(store.progress, lesson.id) !== "completed");
  const SkillIcon = SKILL_ICONS[skill.id];
  const inkStyle: CSSProperties & { "--ink-i": number } = { "--ink-i": Math.min(index, 8) };
  return (
    <article style={inkStyle}>
      <div><h3><SkillIcon size={17} aria-hidden="true" className="learn-skill-icon" />{skill.label}</h3><strong>{skill.completed}/{skill.total}</strong></div>
      <p>{skill.description}</p>
      <progress className="sr-only" value={skill.completed} max={Math.max(skill.total, 1)} aria-label={`${skill.label} 관련 강좌 완료율`} />
      <div className="learn-skill-meter" aria-hidden="true">
        <span className="learn-skill-meter__scope ink-bar-fill" style={{ width: `${(skill.total / Math.max(maxTotal, 1)) * 100}%` }} />
        <span className="learn-skill-meter__done ink-bar-fill" style={{ width: `${(skill.completed / Math.max(maxTotal, 1)) * 100}%` }} />
      </div>
      {nextLesson ? (
        <p className="learn-skill-next">
          <span>다음에 추천</span>
          <Link to={lessonUrl(nextLesson.id)}>{nextLesson.title} <span aria-hidden="true">→</span></Link>
        </p>
      ) : (
        <p className="learn-skill-next"><span>이 역량의 모든 강좌를 완료했어요.</span></p>
      )}
      <button type="button" onClick={() => onBrowse(skill.id)}>{skill.label} 강좌 보기</button>
    </article>
  );
}

export function PathCard({ path, store, recommended }: { path: LearningPath; store: LearningStore; recommended: boolean }) {
  const stats = getPathStats(path, store.progress);
  return (
    <article className={`learn-path-card${recommended ? " is-recommended" : ""}`} style={learningPathTintStyle(path.id)}>
      <div className="learn-path-card-top">
        <span className="learn-path-index">{String(LEARNING_PATHS.indexOf(path) + 1).padStart(2, "0")}</span>
        {recommended && <span className="learn-recommended-label">내 추천 경로</span>}
        {stats.percent === 100 && <span className="learn-status learn-status-completed">완료한 경로</span>}
      </div>
      <p className="learn-eyebrow">{LEVEL_LABELS[path.level]} · {path.lessonIds.length}개 강좌</p>
      <h3><Link to={pathUrl(path.id)}>{path.title}</Link></h3>
      <p>{path.summary}</p>
      <div className="learn-path-outcome"><strong>경로 결과물</strong><span>{path.outcome}</span></div>
      <div className="learn-path-progress">
        <div><span>완료 {stats.completed}/{stats.total}</span><span>{stats.percent}%</span></div>
        <progress value={stats.completed} max={Math.max(stats.total, 1)} aria-label={`${path.title} 완료율`} />
      </div>
      <div className="learn-path-card-bottom">
        <span>총 약 {stats.totalMinutes}분{stats.remainingMinutes < stats.totalMinutes ? ` · 남은 ${stats.remainingMinutes}분` : ""}</span>
        <Link to={pathUrl(path.id)}>경로 보기 →</Link>
      </div>
    </article>
  );
}
