import {
  BadgeCheck,
  Check,
  Flag,
  ListChecks,
  Pin,
  Play,
  Rocket,
  X,
} from "lucide-react";

import {
  PRODUCTION_PROCESS_LABELS,
  REVIEW_LANE_LABELS,
} from "./production-labels";
import { ProductionPill, ProductionSectionCard } from "./production-ui";
import {
  derivePilotProgress,
  pilotStepDefinition,
  TEAM_PILOT_TEMPLATE,
  type PilotEpisodeSpec,
  type PilotStepId,
  type TeamDefaultTemplate,
  type TeamPilotRun,
} from "./team-pilot-template-model";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

function SpecSummary({ spec }: { readonly spec: PilotEpisodeSpec }) {
  const bt = useBilingual("TeamPilotTemplatePanel");
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <ProductionPill tone="accent">
        {bt(spec.episodeTitle.ko, spec.episodeTitle.en)}
      </ProductionPill>
      <ProductionPill>
        {bt(`목표 ${spec.targetCuts}컷`, `${spec.targetCuts} target cuts`)}
      </ProductionPill>
      {spec.processKeys.map((key) => {
        const label = PRODUCTION_PROCESS_LABELS[key];
        return (
          <ProductionPill key={key}>
            {label ? bt(label.ko, label.en) : key}
          </ProductionPill>
        );
      })}
      {spec.reviewLanes.map((lane) => {
        const label = REVIEW_LANE_LABELS[lane];
        return (
          <ProductionPill key={lane} tone="accent">
            {bt(`검수 · ${label.ko}`, `Review · ${label.en}`)}
          </ProductionPill>
        );
      })}
    </div>
  );
}

function StepRow({
  run,
  stepId,
  onCompleteStep,
}: {
  readonly run: TeamPilotRun;
  readonly stepId: PilotStepId;
  readonly onCompleteStep?: (stepId: PilotStepId) => void;
}) {
  const bt = useBilingual("TeamPilotTemplatePanel");
  const definition = pilotStepDefinition(stepId);
  const progress = run.steps.find((step) => step.stepId === stepId);
  const derived = derivePilotProgress(run);
  const isCurrent = derived.currentStepId === stepId;
  const isDone = progress?.status === "done";
  return (
    <li
      className={cn(
        "rounded-xl border p-3",
        isCurrent ? "border-accent/40 bg-accent-soft" : "border-line bg-panel",
        isDone && "opacity-80",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-xs font-semibold leading-5 text-fg">
              {bt(definition.label.ko, definition.label.en)}
            </p>
            {isDone ? (
              <ProductionPill tone="success">{bt("완료", "Done")}</ProductionPill>
            ) : isCurrent ? (
              <ProductionPill tone="accent">{bt("지금 할 단계", "Current step")}</ProductionPill>
            ) : (
              <ProductionPill>{bt("대기", "Pending")}</ProductionPill>
            )}
            <ProductionPill>
              {bt(`담당 · ${definition.actor.ko}`, `Owner · ${definition.actor.en}`)}
            </ProductionPill>
          </div>
          <p className="mt-1.5 text-xs leading-5 text-fg-2">
            {bt(definition.purpose.ko, definition.purpose.en)}
          </p>
          <p className="mt-1 text-[0.6875rem] leading-4 text-fg-3">
            {bt(
              `통과 기준 · ${definition.successSignal.ko}`,
              `Pass when · ${definition.successSignal.en}`,
            )}
          </p>
          {isDone && progress ? (
            <p className="mt-1 text-[0.6875rem] leading-4 text-fg-3">
              {bt(
                `${progress.completedBy ?? ""} · ${progress.completedAt ?? ""} 확인`,
                `Confirmed by ${progress.completedBy ?? ""} · ${progress.completedAt ?? ""}`,
              )}
              {progress.evidenceNote ? ` — ${progress.evidenceNote}` : ""}
            </p>
          ) : null}
        </div>
        {isCurrent && onCompleteStep ? (
          <button
            type="button"
            className={buttonClass({
              variant: "solid",
              size: "sm",
              className: "min-h-9 shrink-0 gap-1",
            })}
            onClick={() => onCompleteStep(stepId)}
          >
            <Check className="size-3.5" aria-hidden="true" />
            {bt("완료로 표시", "Mark done")}
          </button>
        ) : null}
      </div>
    </li>
  );
}

/**
 * 팀 파일럿 템플릿 — 팀 표면.
 *
 * 협업 도입을 빈 프로젝트가 아니라 실제 회차 1건으로 검증하는 패널.
 * 표시와 콜백만 맡고, 실행 기록·저장·고정은 호스트(모델 저장소)의 몫이다.
 *
 * 상태 흐름:
 * - 실행 없음 → 내장 템플릿 소개 + "파일럿 시작".
 * - 진행 중 → 5단계 체크포인트 (현재 단계만 완료 버튼 활성, 순서는
 *   모델이 강제하므로 UI는 현재 단계 하나만 열면 된다).
 * - 완료 → "팀 기본 템플릿으로 고정" (성공한 순서만 고정 가능).
 * - 고정된 템플릿 → 명세·순서 표시 + "이 템플릿으로 새 파일럿 시작".
 */
export function TeamPilotTemplatePanel({
  run,
  defaultTemplate,
  onStart,
  onCompleteStep,
  onAbandon,
  onPromote,
  onStartFromTemplate,
  className,
}: {
  /** 표시할 실행 — 진행 중 실행 우선, 없으면 가장 최근 실행. 둘 다 없으면 null. */
  readonly run: TeamPilotRun | null;
  readonly defaultTemplate: TeamDefaultTemplate | null;
  readonly onStart?: () => void;
  readonly onCompleteStep?: (stepId: PilotStepId) => void;
  readonly onAbandon?: () => void;
  readonly onPromote?: () => void;
  readonly onStartFromTemplate?: () => void;
  readonly className?: string;
}) {
  const bt = useBilingual("TeamPilotTemplatePanel");
  const progress = run ? derivePilotProgress(run) : null;
  const inProgress = run?.status === "in-progress";
  const completed = run?.status === "completed";
  const alreadyPinned =
    completed &&
    defaultTemplate !== null &&
    run !== null &&
    defaultTemplate.sourcePilotRunId === run.id;

  return (
    <ProductionSectionCard
      className={cn(className)}
      title={bt("팀 파일럿 템플릿", "Team pilot template")}
      description={bt(
        TEAM_PILOT_TEMPLATE.description.ko,
        TEAM_PILOT_TEMPLATE.description.en,
      )}
    >
      {!run ? (
        <div className="space-y-3">
          <SpecSummary spec={TEAM_PILOT_TEMPLATE.spec} />
          <ol className="space-y-1.5">
            {TEAM_PILOT_TEMPLATE.steps.map((step, index) => (
              <li
                key={step.id}
                className="flex items-baseline gap-2 text-xs leading-5 text-fg-2"
              >
                <span className="font-bold text-fg">{index + 1}.</span>
                <span>
                  <span className="font-semibold text-fg">
                    {bt(step.label.ko, step.label.en)}
                  </span>
                  {" — "}
                  {bt(step.successSignal.ko, step.successSignal.en)}
                </span>
              </li>
            ))}
          </ol>
          <p className="text-xs leading-5 text-fg-3">
            {bt(
              "파일럿은 실제 작품의 실제 회차로 시작해요. 데모·샘플 회차로는 초대와 권한이 검증되지 않습니다.",
              "A pilot starts from a real episode of a real work. Demo episodes cannot verify invites or access.",
            )}
          </p>
          {onStart ? (
            <button
              type="button"
              className={buttonClass({
                variant: "solid",
                size: "sm",
                className: "min-h-9 gap-1",
              })}
              onClick={onStart}
            >
              <Rocket className="size-3.5" aria-hidden="true" />
              {bt("파일럿 시작", "Start the pilot")}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                <ListChecks className="size-3.5" aria-hidden="true" />
                {bt(
                  `체크포인트 ${progress?.doneCount ?? 0}/${progress?.totalCount ?? 0} 완료`,
                  `${progress?.doneCount ?? 0}/${progress?.totalCount ?? 0} checkpoints done`,
                )}
              </p>
              {run.status === "abandoned" ? (
                <ProductionPill tone="warning">{bt("중단된 파일럿", "Abandoned pilot")}</ProductionPill>
              ) : completed ? (
                <ProductionPill tone="success">{bt("파일럿 완료", "Pilot complete")}</ProductionPill>
              ) : null}
            </div>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised"
              role="progressbar"
              aria-valuenow={progress?.percent ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${progress?.percent ?? 0}%` }}
              />
            </div>
          </div>

          <SpecSummary spec={run.spec} />

          <ul className="space-y-2">
            {run.steps.map((step) => (
              <StepRow
                key={step.stepId}
                run={run}
                stepId={step.stepId}
                onCompleteStep={inProgress ? onCompleteStep : undefined}
              />
            ))}
          </ul>

          {inProgress && onAbandon ? (
            <button
              type="button"
              className={buttonClass({
                variant: "quiet",
                size: "sm",
                className: "min-h-9 gap-1",
              })}
              onClick={onAbandon}
            >
              <X className="size-3.5" aria-hidden="true" />
              {bt("파일럿 중단하고 기록 남기기", "Abandon and keep the record")}
            </button>
          ) : null}

          {completed && !alreadyPinned && onPromote ? (
            <div className="rounded-xl border border-good/30 bg-good/10 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                <BadgeCheck className="size-3.5" aria-hidden="true" />
                {bt("전 과정이 검증됐어요", "The full flow is verified")}
              </p>
              <p className="mt-1 text-xs leading-5 text-fg-2">
                {bt(
                  "초대부터 승인까지 성공한 이 순서와 명세를 팀 기본 템플릿으로 고정하면, 다음 프로젝트와 새 팀원 온보딩이 같은 순서로 시작합니다.",
                  "Pin this proven order and spec as the team default template, and the next project and member onboarding start the same way.",
                )}
              </p>
              <button
                type="button"
                className={buttonClass({
                  variant: "solid",
                  size: "sm",
                  className: "mt-2 min-h-9 gap-1",
                })}
                onClick={onPromote}
              >
                <Pin className="size-3.5" aria-hidden="true" />
                {bt("팀 기본 템플릿으로 고정", "Pin as team default template")}
              </button>
            </div>
          ) : null}

          {alreadyPinned ? (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-fg-2">
              <Flag className="size-3.5" aria-hidden="true" />
              {bt(
                "이 파일럿의 순서가 팀 기본 템플릿으로 고정돼 있어요.",
                "This pilot's order is pinned as the team default template.",
              )}
            </p>
          ) : null}
        </div>
      )}

      {defaultTemplate ? (
        <div className="mt-4 rounded-xl border border-line bg-panel p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-xs font-semibold text-fg">
              {bt(defaultTemplate.name.ko, defaultTemplate.name.en)}
            </p>
            <ProductionPill tone="accent">
              {bt("팀 기본 템플릿", "Team default template")}
            </ProductionPill>
          </div>
          <p className="mt-1 text-[0.6875rem] leading-4 text-fg-3">
            {bt(
              `${defaultTemplate.createdBy} · ${defaultTemplate.createdAt}에 검증된 파일럿에서 고정`,
              `Pinned by ${defaultTemplate.createdBy} · ${defaultTemplate.createdAt} from a verified pilot`,
            )}
          </p>
          <div className="mt-2">
            <SpecSummary spec={defaultTemplate.spec} />
          </div>
          <p className="mt-2 text-xs leading-5 text-fg-2">
            {defaultTemplate.stepOrder
              .map((stepId) => {
                const definition = pilotStepDefinition(stepId);
                return bt(definition.label.ko, definition.label.en);
              })
              .join(" → ")}
          </p>
          {!inProgress && onStartFromTemplate ? (
            <button
              type="button"
              className={buttonClass({
                variant: "outline",
                size: "sm",
                className: "mt-2 min-h-9 gap-1",
              })}
              onClick={onStartFromTemplate}
            >
              <Play className="size-3.5" aria-hidden="true" />
              {bt("이 템플릿으로 새 파일럿 시작", "Start a new pilot from this template")}
            </button>
          ) : null}
        </div>
      ) : null}
    </ProductionSectionCard>
  );
}
