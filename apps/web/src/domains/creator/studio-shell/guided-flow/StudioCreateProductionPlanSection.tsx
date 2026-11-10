import { useMemo } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  WEBTOON_CADENCES,
  WEBTOON_ONBOARDING_GOALS,
  WEBTOON_STARTING_POINTS,
  WEBTOON_TEAM_MODELS,
  buildWebtoonOnboardingPlan,
  type WebtoonCadenceId,
  type WebtoonOnboardingGoalId,
  type WebtoonOnboardingSelection,
  type WebtoonStartingPointId,
  type WebtoonTeamModelId,
} from "@/shared/lib/webtoon-production-onboarding";

import type {
  StudioProjectCollaboration,
  StudioProjectPurpose,
  StudioProjectStartPoint,
} from "../../studio-project-definition";
import {
  OnboardingSelect,
  projectCollaborationFromOnboarding,
  projectPurposeFromOnboarding,
  projectStartPointFromOnboarding,
} from "../studio-mode-project-create-helpers";
import { StudioCreateReturnToStart } from "../StudioCreateLaunchSummary";

export function StudioCreateProductionPlanSection({
  onboardingEnabled,
  selection,
  onToggleOnboarding,
  onChangeSelection,
  onSyncStartPoint,
  onSyncPurpose,
  onSyncCollaboration,
}: {
  readonly onboardingEnabled: boolean;
  readonly selection: WebtoonOnboardingSelection;
  readonly onToggleOnboarding: () => void;
  readonly onChangeSelection: (
    updater: (current: WebtoonOnboardingSelection) => WebtoonOnboardingSelection,
  ) => void;
  readonly onSyncStartPoint: (next: StudioProjectStartPoint) => void;
  readonly onSyncPurpose: (next: StudioProjectPurpose) => void;
  readonly onSyncCollaboration: (next: StudioProjectCollaboration) => void;
}) {
  const bt = useBilingual("StudioModeProjectCreatePage");
  const onboardingPlan = useMemo(() => buildWebtoonOnboardingPlan(selection), [selection]);

  return (
    <section
      className="mt-4 rounded-3xl border border-line bg-card p-4 sm:p-5"
      data-studio-create-optional-settings="true"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-accent">
            {bt("회차 제작 계획까지 함께 준비", "Prepare the episode production plan")}
          </p>
          <p className="mt-1 text-xs leading-5 text-fg-2">
            {bt(
              "대본·콘티·제작 인원과 주기를 정하고, 처음 할 일을 준비합니다.",
              "Set your script, storyboard, team and schedule to prepare the first tasks.",
            )}
          </p>
        </div>
        <button
          type="button"
          aria-pressed={onboardingEnabled}
          onClick={onToggleOnboarding}
          className={buttonClass({ variant: onboardingEnabled ? "solid" : "outline", size: "sm" })}
        >
          {onboardingEnabled
            ? bt("제작 계획 사용 중", "Production plan on")
            : bt("제작 계획 추가", "Add production plan")}
        </button>
      </div>

      {onboardingEnabled ? (
        <div className="mt-4 rounded-2xl border border-line bg-panel/35 p-4">
          <h3 className="text-base font-black text-fg">
            {bt(onboardingPlan.titleKo, onboardingPlan.titleEn)}
          </h3>
          <p className="mt-1 text-xs leading-5 text-fg-2">
            {bt(onboardingPlan.summaryKo, onboardingPlan.summaryEn)}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <OnboardingSelect<WebtoonStartingPointId>
              id="studio-webtoon-starting-point"
              label={bt("현재 가지고 있는 자료", "What you already have")}
              value={selection.startingPoint}
              choices={WEBTOON_STARTING_POINTS}
              onChange={(startingPoint) => {
                onChangeSelection((current) => ({ ...current, startingPoint }));
                onSyncStartPoint(projectStartPointFromOnboarding(startingPoint));
              }}
            />
            <OnboardingSelect<WebtoonOnboardingGoalId>
              id="studio-webtoon-goal"
              label={bt("이번 프로젝트 목표", "Project goal")}
              value={selection.goal}
              choices={WEBTOON_ONBOARDING_GOALS}
              onChange={(goal) => {
                onChangeSelection((current) => ({ ...current, goal }));
                onSyncPurpose(projectPurposeFromOnboarding(goal));
              }}
            />
            <OnboardingSelect<WebtoonTeamModelId>
              id="studio-webtoon-team"
              label={bt("제작 인원", "Team model")}
              value={selection.teamModel}
              choices={WEBTOON_TEAM_MODELS}
              onChange={(teamModel) => {
                onChangeSelection((current) => ({ ...current, teamModel }));
                onSyncCollaboration(projectCollaborationFromOnboarding(teamModel));
              }}
            />
            <OnboardingSelect<WebtoonCadenceId>
              id="studio-webtoon-cadence"
              label={bt("제작 주기", "Cadence")}
              value={selection.cadence}
              choices={WEBTOON_CADENCES}
              onChange={(cadence) => onChangeSelection((current) => ({ ...current, cadence }))}
            />
          </div>
        </div>
      ) : null}
      {onboardingEnabled ? <StudioCreateReturnToStart /> : null}
    </section>
  );
}
