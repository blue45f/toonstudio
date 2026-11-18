import { ArrowRight } from "lucide-react";
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
  getSkillProgress,
  type LearningPath,
  type SkillId,
} from "./learning-paths";
import { SKILL_ICONS } from "./learning-skill-icons";
import type { LearningStore } from "./use-learning-progress";

const lessonUrl = (id: string) => `/learn/lessons/${encodeURIComponent(id)}`;
const pathUrl = (id: string) => `/learn/paths/${encodeURIComponent(id)}`;

type InkVarStyle = CSSProperties & {
  "--ink-i"?: number;
  "--ink-dash"?: number;
};

export function LessonLibraryCard({
  lesson,
  store,
  index,
}: {
  readonly lesson: Lesson;
  readonly store: LearningStore;
  readonly index: number;
}) {
  const meta = getLessonMeta(lesson.id);
  const state = getLessonState(store.progress, lesson.id);
  const progress = getLessonRequirementProgress(lesson, store.progress);
  const inkStyle: InkVarStyle = { "--ink-i": index % 8 };

  return (
    <article
      className={`learn-card learn-library-card ink-frame${state === "completed" ? " is-complete" : ""}`}
    >
      <div className="learn-card-top">
        <span className="learn-number">{String(index + 1).padStart(2, "0")}</span>
        <span className={`learn-status learn-status-${state}`}>
          {STATUS_LABELS[state]}
        </span>
      </div>
      <div className="learn-card-chips" aria-label="강좌 정보">
        <span>{lesson.track === "studio" ? "툰스튜디오 실습" : "제작 기초"}</span>
        <span>{LEVEL_LABELS[meta.level]}</span>
        <span className="tabular-nums">약 {lesson.minutes}분</span>
      </div>
      <h3>
        <Link to={lessonUrl(lesson.id)}>{lesson.title}</Link>
      </h3>
      <p>{lesson.summary}</p>
      <div className="learn-card-outcome">
        <strong>완성할 것</strong>
        <span>{meta.outcome}</span>
      </div>
      <div className="learn-card-skills" aria-label="관련 역량">
        {meta.skills.map((skillId) => {
          const SkillIcon = SKILL_ICONS[skillId];
          return (
            <span key={skillId}>
              <SkillIcon size={13} aria-hidden="true" />
              {SKILLS.find((skill) => skill.id === skillId)?.label}
            </span>
          );
        })}
      </div>
      {state !== "not-started" && (
        <div className="learn-card-progress">
          <span className="tabular-nums">자가 점검 진행 {progress}%</span>
          <progress
            className="sr-only"
            value={progress}
            max={100}
            aria-label={`${lesson.title} 자가 점검 진행률`}
          />
          <div className="learn-meter-track" aria-hidden="true">
            <span
              className="learn-meter-fill ink-bar-fill"
              style={{ ...inkStyle, width: `${progress}%` }}
            />
          </div>
        </div>
      )}
      <div className="learn-card-bottom">
        <span>
          {meta.format === "studio-practice"
            ? "작업 화면에서 따라 하기"
            : "설명 · 조작형 예제 · 실습"}
        </span>
        <Link
          className="ink-arrow"
          to={lessonUrl(lesson.id)}
          aria-label={`${lesson.title} ${state === "completed" ? "복습" : state === "in-progress" ? "계속 학습" : "시작"}`}
        >
          {state === "completed"
            ? "복습하기"
            : state === "in-progress"
              ? "계속하기"
              : "배우기"}
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

type SkillProgress = ReturnType<typeof getSkillProgress>[number];

/** 역량 카드 — 관련 강좌 비중과 완료율을 왼쪽 기준점 잉크 막대(.ink-bar-fill)로 함께 그린다. */
export function SkillCard({
  skill,
  index,
  maxTotal,
  store,
  onBrowse,
}: {
  readonly skill: SkillProgress;
  readonly index: number;
  readonly maxTotal: number;
  readonly store: LearningStore;
  readonly onBrowse: (skillId: SkillId) => void;
}) {
  const skillLessons = LESSONS.filter((lesson) =>
    getLessonMeta(lesson.id).skills.includes(skill.id),
  );
  const nextLesson = skillLessons.find(
    (lesson) => getLessonState(store.progress, lesson.id) !== "completed",
  );
  const SkillIcon = SKILL_ICONS[skill.id];
  const scopePercent = Math.max(
    18,
    Math.round((skill.total / Math.max(maxTotal, 1)) * 100),
  );
  const donePercent = Math.round(
    (skill.completed / Math.max(skill.total, 1)) * 100,
  );
  const inkStyle: InkVarStyle = { "--ink-i": index };

  return (
    <article className="learn-skill-card ink-frame">
      <div>
        <h3>
          <SkillIcon size={16} aria-hidden="true" className="learn-skill-icon" />
          {skill.label}
        </h3>
        <strong className="tabular-nums">
          {skill.completed}/{skill.total}
        </strong>
      </div>
      <p>{skill.description}</p>
      <progress
        className="sr-only"
        value={skill.completed}
        max={Math.max(skill.total, 1)}
        aria-label={`${skill.label} 관련 강좌 완료율`}
      />
      <div className="learn-skill-meter" aria-hidden="true">
        <span
          className="learn-skill-meter__scope ink-bar-fill"
          style={{ ...inkStyle, width: `${scopePercent}%` }}
        />
        {donePercent > 0 ? (
          <span
            className="learn-skill-meter__done ink-bar-fill"
            style={{ ...inkStyle, width: `${donePercent}%` }}
          />
        ) : null}
      </div>
      {nextLesson ? (
        <p className="learn-skill-next">
          <span>다음에 추천</span>
          <Link className="ink-arrow" to={lessonUrl(nextLesson.id)}>
            {nextLesson.title}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </p>
      ) : (
        <p className="learn-skill-next">
          <span>이 역량의 모든 강좌를 완료했어요</span>
        </p>
      )}
      <button type="button" onClick={() => onBrowse(skill.id)}>
        {skill.label} 강좌 보기
      </button>
    </article>
  );
}

/** 학습 경로 카드 — 단계 노드를 가로지르는 SVG 잉크 연결선(.ink-stroke-draw)을 함께 그린다. */
export function PathCard({
  path,
  store,
  recommended,
}: {
  readonly path: LearningPath;
  readonly store: LearningStore;
  readonly recommended: boolean;
}) {
  const pathIndex = LEARNING_PATHS.indexOf(path);
  const stats = getPathStats(path, store.progress);
  const stepCount = Math.max(path.lessonIds.length, 2);
  const svgWidth = 220;
  const startX = 10;
  const endX = svgWidth - 10;
  const span = endX - startX;
  const strokeStyle: InkVarStyle = {
    "--ink-dash": span,
    "--ink-i": Math.min(pathIndex, 6),
  };
  const barStyle: InkVarStyle = { "--ink-i": Math.min(pathIndex, 6) };

  return (
    <article
      className={`learn-path-card ink-frame${recommended ? " is-recommended" : ""}`}
      style={learningPathTintStyle(path.id)}
    >
      <div className="learn-path-card-top">
        <span className="learn-path-index">
          {String(pathIndex + 1).padStart(2, "0")}
        </span>
        {recommended && (
          <span className="learn-recommended-label">내 추천 경로</span>
        )}
        {stats.percent === 100 && (
          <span className="learn-status learn-status-completed">완료한 경로</span>
        )}
      </div>
      <p className="learn-eyebrow">
        {LEVEL_LABELS[path.level]} · {path.lessonIds.length}개 강좌
      </p>
      <h3>
        <Link to={pathUrl(path.id)}>{path.title}</Link>
      </h3>
      <p>{path.summary}</p>

      <svg
        className="learn-path-step-track"
        viewBox={`0 0 ${svgWidth} 20`}
        aria-hidden="true"
        focusable="false"
      >
        <line
          x1={startX}
          y1={10}
          x2={endX}
          y2={10}
          className="learn-path-step-track__rail"
        />
        <line
          x1={startX}
          y1={10}
          x2={endX}
          y2={10}
          className="learn-path-step-track__ink ink-stroke-draw"
          style={strokeStyle}
        />
        {path.lessonIds.map((lessonId, idx) => {
          const cx =
            stepCount > 1
              ? startX + (span * idx) / (stepCount - 1)
              : svgWidth / 2;
          const done = getLessonState(store.progress, lessonId) === "completed";
          return (
            <circle
              key={lessonId}
              cx={cx}
              cy={10}
              r={done ? 4 : 3}
              className={
                done
                  ? "learn-path-step-track__node is-done"
                  : "learn-path-step-track__node"
              }
            />
          );
        })}
      </svg>

      <div className="learn-path-outcome">
        <strong>경로 결과물</strong>
        <span>{path.outcome}</span>
      </div>
      <div className="learn-path-progress">
        <div className="tabular-nums">
          <span>
            완료 {stats.completed}/{stats.total}
          </span>
          <span>{stats.percent}%</span>
        </div>
        <progress
          className="sr-only"
          value={stats.completed}
          max={Math.max(stats.total, 1)}
          aria-label={`${path.title} 완료율`}
        />
        <div className="learn-meter-track" aria-hidden="true">
          <span
            className="learn-meter-fill ink-bar-fill"
            style={{ ...barStyle, width: `${stats.percent}%` }}
          />
        </div>
      </div>
      <div className="learn-path-card-bottom">
        <span className="tabular-nums">
          총 약 {stats.totalMinutes}분
          {stats.remainingMinutes < stats.totalMinutes
            ? ` · 남은 ${stats.remainingMinutes}분`
            : ""}
        </span>
        <Link className="ink-arrow" to={pathUrl(path.id)}>
          경로 보기
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
