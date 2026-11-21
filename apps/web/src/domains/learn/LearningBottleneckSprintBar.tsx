import { ArrowRight, Clock3, PenTool } from "lucide-react";
import { Link } from "react-router-dom";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { LearningProgress } from "./learning-model";
import { learningPathTintStyle } from "./learning-path-tints";
import type { LearningProfile } from "./learning-profile";
import {
  BOTTLENECK_SPRINT_PRESETS,
  applyBottleneckSprintToProfile,
  buildBottleneckSprintSnapshot,
  computeSprintRingMetrics,
  getBottleneckSprintPath,
  type BottleneckSprintPreset,
} from "./learning-bottleneck-sprint";

import "./learning-bottleneck-sprint.css";

const SCOPE = "domains.learn.LearningBottleneckSprintBar";

export interface LearningBottleneckSprintBarProps {
  readonly profile: LearningProfile;
  readonly progress: LearningProgress;
  readonly onUpdateProfile: (next: LearningProfile) => void;
}

/**
 * 1초 "지금 막힌 구간" 맞춤 스프린트 처방기.
 *
 * 초보 웹툰 창작자가 겪는 4가지 실전 막힘 구간을 1탭으로 `LearningProfile`에 반영해
 * 실제 `recommendLearningPath` · `buildSessionPlan` · `store.progress` 기반의
 * 완료율 링과 바로 실행 동선을 제시한다(임의 수치 0건).
 */
export function LearningBottleneckSprintBar({
  profile,
  progress,
  onUpdateProfile,
}: LearningBottleneckSprintBarProps) {
  const bt = useBilingual(SCOPE);
  const snapshot = buildBottleneckSprintSnapshot(profile, progress);
  const ring = computeSprintRingMetrics(snapshot.pathStats.percent, 24);
  const pathTintStyle = learningPathTintStyle(snapshot.recommendedPath.id);

  function handleSelectPreset(preset: BottleneckSprintPreset) {
    onUpdateProfile(applyBottleneckSprintToProfile(profile, preset));
  }

  return (
    <section
      aria-labelledby="learn-bottleneck-sprint-title"
      data-testid="learn-bottleneck-sprint-bar"
      className="learn-sprint-bar"
      style={pathTintStyle}
    >
      <div className="learn-sprint-bar__head">
        <div>
          <span className="learn-kicker [word-break:keep-all]">
            {bt("1초 막힘 해소 처방", "1-second bottleneck prescription")}
          </span>
          <h2 id="learn-bottleneck-sprint-title" className="[word-break:keep-all]">
            {bt(
              "지금 막힌 구간을 고르면 오늘의 스프린트를 바로 처방해요",
              "Pick where you feel stuck to prescribe today's focused sprint",
            )}
          </h2>
        </div>
        <p className="learn-sprint-bar__sub [word-break:keep-all]">
          {bt(
            "1번 탭으로 추천 경로와 오늘의 강좌가 즉시 바뀝니다",
            "One tap updates your recommended path and today's lesson immediately",
          )}
        </p>
      </div>

      <div
        role="group"
        aria-label={bt("지금 막힌 구간 1초 선택", "Select your current bottleneck")}
        className="learn-sprint-grid"
      >
        {BOTTLENECK_SPRINT_PRESETS.map((preset) => {
          const pressed = snapshot.activePreset?.id === preset.id;
          const matchedPath = getBottleneckSprintPath(preset);
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={pressed}
              data-bottleneck-id={preset.id}
              data-tone={preset.tone}
              onClick={() => handleSelectPreset(preset)}
              className="learn-sprint-btn min-h-11 [word-break:keep-all]"
            >
              <span className="learn-sprint-btn__tag tabular-nums">
                <span aria-hidden="true" className="learn-sprint-btn__dot" />
                <span>{bt(preset.sprintTagKo, preset.sprintTagEn)}</span>
              </span>
              <span className="learn-sprint-btn__prompt">
                {bt(preset.promptKo, preset.promptEn)}
              </span>
              <span className="learn-sprint-btn__path">
                {matchedPath.title}
              </span>
            </button>
          );
        })}
      </div>

      <div
        data-testid="learn-bottleneck-prescription"
        data-path-id={snapshot.recommendedPath.id}
        className="learn-sprint-rx"
      >
        <div
          className="learn-sprint-ring"
          aria-label={bt(
            `${snapshot.recommendedPath.title} 경로 완료율 ${ring.clampedPercent}%`,
            `${snapshot.recommendedPath.title} completion ${ring.clampedPercent}%`,
          )}
        >
          <svg viewBox="0 0 60 60" aria-hidden="true">
            <circle
              cx="30"
              cy="30"
              r={ring.radius}
              className="learn-sprint-ring__track"
            />
            <circle
              cx="30"
              cy="30"
              r={ring.radius}
              className="learn-sprint-ring__fill"
              strokeDasharray={ring.circumference}
              strokeDashoffset={ring.dashOffset}
            />
          </svg>
          <span
            data-testid="learn-bottleneck-ring-percent"
            className="learn-sprint-ring__label tabular-nums"
          >
            {ring.clampedPercent}%
          </span>
        </div>

        <div className="learn-sprint-rx__body">
          <div className="learn-sprint-rx__meta tabular-nums">
            <span className="learn-sprint-rx__pill [word-break:keep-all]">
              {snapshot.recommendedPath.title}
            </span>
            <span>
              {bt(
                `완료 ${snapshot.pathStats.completed}/${snapshot.pathStats.total}강좌`,
                `${snapshot.pathStats.completed}/${snapshot.pathStats.total} lessons done`,
              )}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock3 size={13} aria-hidden="true" />
              <span>
                {bt(
                  `이번 세션 ${snapshot.sessionTotalMinutes}분`,
                  `${snapshot.sessionTotalMinutes} min session`,
                )}
              </span>
            </span>
          </div>

          <h3
            data-testid="learn-bottleneck-next-lesson"
            className="learn-sprint-rx__title [word-break:keep-all]"
          >
            {snapshot.nextLesson.title}
          </h3>
          <p className="learn-sprint-rx__desc [word-break:keep-all]">
            {snapshot.activePreset
              ? bt(
                  snapshot.activePreset.prescriptionKo,
                  snapshot.activePreset.prescriptionEn,
                )
              : snapshot.nextLessonOutcome}
          </p>
        </div>

        <div className="learn-sprint-rx__actions">
          <Link
            to={snapshot.nextLessonHref}
            data-testid="learn-bottleneck-start-lesson"
            className="learn-sprint-cta-primary min-h-11 [word-break:keep-all]"
          >
            <span>{bt("이 강좌 바로 시작", "Start this lesson now")}</span>
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
          <Link
            to={snapshot.practiceStudioHref}
            data-testid="learn-bottleneck-open-studio"
            className="learn-sprint-cta-secondary min-h-11 [word-break:keep-all]"
          >
            <PenTool size={15} aria-hidden="true" />
            <span>{bt("안전한 연습 캔버스 열기", "Open safe practice canvas")}</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
