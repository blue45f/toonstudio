import { Check, ListChecks, RotateCcw, Sparkles } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import {
  DEFAULT_WEBTOON_ONBOARDING_SELECTION,
  WEBTOON_CADENCES,
  WEBTOON_ONBOARDING_GOALS,
  WEBTOON_STARTING_POINTS,
  WEBTOON_TEAM_MODELS,
  buildWebtoonOnboardingPlan,
  type WebtoonCadenceId,
  type WebtoonOnboardingGoalId,
  type WebtoonOnboardingPlan,
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

interface ProductionPlanQuickPreset {
  readonly id: "solo-ep1" | "contest-pitch" | "team-serial";
  readonly titleKo: string;
  readonly titleEn: string;
  readonly hintKo: string;
  readonly hintEn: string;
  readonly selection: WebtoonOnboardingSelection;
}

const PRODUCTION_PLAN_PRESETS: readonly ProductionPlanQuickPreset[] = Object.freeze([
  {
    id: "solo-ep1",
    titleKo: "혼자 첫 1화 시작",
    titleEn: "Solo Ep.1 start",
    hintKo: "아이디어부터 부담 없이 정리",
    hintEn: "Light start from a story idea",
    selection: Object.freeze({
      startingPoint: "idea",
      goal: "independent",
      teamModel: "solo",
      cadence: "undecided",
    }),
  },
  {
    id: "contest-pitch",
    titleKo: "대본으로 공모전·투고",
    titleEn: "Contest & pitch",
    hintKo: "대본 잠금과 피칭 산출물 준비",
    hintEn: "Script lock & pitch deliverables",
    selection: Object.freeze({
      startingPoint: "script",
      goal: "pitch",
      teamModel: "solo",
      cadence: "biweekly",
    }),
  },
  {
    id: "team-serial",
    titleKo: "콘티 기반 주간 연재",
    titleEn: "Weekly team serial",
    hintKo: "컷 공정 분담과 마감 주기 관리",
    hintEn: "Panel handoff & weekly schedule",
    selection: Object.freeze({
      startingPoint: "storyboard",
      goal: "team",
      teamModel: "assistant",
      cadence: "weekly",
    }),
  },
]);

function selectionEquals(
  left: WebtoonOnboardingSelection,
  right: WebtoonOnboardingSelection,
): boolean {
  return (
    left.startingPoint === right.startingPoint &&
    left.goal === right.goal &&
    left.teamModel === right.teamModel &&
    left.cadence === right.cadence
  );
}

function landingDestinationCopy(
  section: WebtoonOnboardingPlan["section"],
): { readonly ko: string; readonly en: string } {
  if (section === "production") {
    return {
      ko: "첫 이동 화면: 제작 공정 보드",
      en: "First screen: Production board",
    };
  }
  if (section === "export") {
    return {
      ko: "첫 이동 화면: 출고 사전검사",
      en: "First screen: Export preflight",
    };
  }
  return {
    ko: "첫 이동 화면: 이야기 기획실",
    en: "First screen: Story planning",
  };
}

function movePresetButtonFocus(event: KeyboardEvent<HTMLButtonElement>): boolean {
  if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) {
    return false;
  }
  const group = event.currentTarget.parentElement;
  if (!group) return false;
  const buttons = Array.from(
    group.querySelectorAll<HTMLButtonElement>("button:not([disabled])"),
  );
  if (buttons.length <= 1) return false;
  const currentIndex = buttons.indexOf(event.currentTarget);
  if (currentIndex === -1) return false;

  event.preventDefault();
  if (event.key === "Home") {
    buttons[0]?.focus();
    return true;
  }
  if (event.key === "End") {
    buttons[buttons.length - 1]?.focus();
    return true;
  }
  const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
  const nextIndex = (currentIndex + delta + buttons.length) % buttons.length;
  buttons[nextIndex]?.focus();
  return true;
}

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
  const sectionRef = useRef<HTMLElement>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const [preEnableSnapshot, setPreEnableSnapshot] =
    useState<WebtoonOnboardingSelection>(selection);
  const onboardingPlan = useMemo(() => buildWebtoonOnboardingPlan(selection), [selection]);

  const activePreset = useMemo(
    () =>
      PRODUCTION_PLAN_PRESETS.find((preset) =>
        selectionEquals(preset.selection, selection),
      ) ?? null,
    [selection],
  );
  const isDefaultSelection = selectionEquals(selection, DEFAULT_WEBTOON_ONBOARDING_SELECTION);
  const landingCopy = landingDestinationCopy(onboardingPlan.section);

  const currentSelectionSummary = useMemo(() => {
    const startChoice = WEBTOON_STARTING_POINTS.find((item) => item.id === selection.startingPoint);
    const goalChoice = WEBTOON_ONBOARDING_GOALS.find((item) => item.id === selection.goal);
    const teamChoice = WEBTOON_TEAM_MODELS.find((item) => item.id === selection.teamModel);
    const cadenceChoice = WEBTOON_CADENCES.find((item) => item.id === selection.cadence);
    return [
      startChoice ? bt(startChoice.labelKo, startChoice.labelEn) : selection.startingPoint,
      goalChoice ? bt(goalChoice.labelKo, goalChoice.labelEn) : selection.goal,
      teamChoice ? bt(teamChoice.labelKo, teamChoice.labelEn) : selection.teamModel,
      cadenceChoice ? bt(cadenceChoice.labelKo, cadenceChoice.labelEn) : selection.cadence,
    ].join(" · ");
  }, [bt, selection]);

  // 상위 페이지의 onSyncStartPoint가 기본 startingPoint로 덮어쓰지 않도록 상위 동기화를 먼저 호출한 뒤 세부 selection을 확정한다.
  const applySelectionAndSync = useCallback(
    (next: WebtoonOnboardingSelection) => {
      if (selectionEquals(selection, next)) return;
      if (next.startingPoint !== selection.startingPoint) {
        onSyncStartPoint(projectStartPointFromOnboarding(next.startingPoint));
      }
      if (next.goal !== selection.goal) {
        onSyncPurpose(projectPurposeFromOnboarding(next.goal));
      }
      if (next.teamModel !== selection.teamModel) {
        onSyncCollaboration(projectCollaborationFromOnboarding(next.teamModel));
      }
      onChangeSelection(() => next);
    },
    [
      onChangeSelection,
      onSyncCollaboration,
      onSyncPurpose,
      onSyncStartPoint,
      selection,
    ],
  );

  const handleToggleClick = () => {
    if (!onboardingEnabled) {
      setPreEnableSnapshot(selection);
    }
    onToggleOnboarding();
  };

  const handleSelectPreset = (preset: ProductionPlanQuickPreset) => {
    if (onboardingEnabled && selectionEquals(selection, preset.selection)) {
      return;
    }
    if (!onboardingEnabled) {
      setPreEnableSnapshot(selection);
      onToggleOnboarding();
    }
    onSyncStartPoint(projectStartPointFromOnboarding(preset.selection.startingPoint));
    onSyncPurpose(projectPurposeFromOnboarding(preset.selection.goal));
    onSyncCollaboration(projectCollaborationFromOnboarding(preset.selection.teamModel));
    onChangeSelection(() => preset.selection);
  };

  const cancelAndClosePlan = useCallback(() => {
    if (!onboardingEnabled) return;
    applySelectionAndSync(preEnableSnapshot);
    onToggleOnboarding();
    toggleButtonRef.current?.focus();
  }, [applySelectionAndSync, onboardingEnabled, onToggleOnboarding, preEnableSnapshot]);

  const handleInteractiveEscape = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Escape" || !onboardingEnabled || event.defaultPrevented) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    cancelAndClosePlan();
  };

  const handlePresetKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (movePresetButtonFocus(event)) return;
    handleInteractiveEscape(event);
  };

  // 하위 <OnboardingSelect>(<select>)나 복귀 버튼 내부에서 Escape를 눌렀을 때도 정적 div 핸들러 없이 안전하게 닫고 복원한다.
  useEffect(() => {
    if (!onboardingEnabled) return;
    const handleDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const container = sectionRef.current;
      if (!container) return;
      const targetNode = event.target instanceof Node ? event.target : null;
      const activeNode = document.activeElement;
      if (
        (targetNode && container.contains(targetNode)) ||
        (activeNode && container.contains(activeNode))
      ) {
        event.preventDefault();
        cancelAndClosePlan();
      }
    };
    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => document.removeEventListener("keydown", handleDocumentKeyDown);
  }, [cancelAndClosePlan, onboardingEnabled]);

  return (
    <section
      ref={sectionRef}
      className={cn(
        "mt-4 rounded-3xl border p-4 transition-colors sm:p-5",
        onboardingEnabled
          ? "border-accent/40 bg-card shadow-xs"
          : "border-line bg-card",
      )}
      data-studio-create-optional-settings="true"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-black text-accent">
              {bt("회차 제작 계획까지 함께 준비", "Prepare the episode production plan")}
            </p>
            <span className="inline-flex items-center rounded-full border border-line bg-panel/75 px-2.5 py-0.5 text-[0.68rem] font-bold text-fg-2">
              {onboardingEnabled
                ? bt("켜짐 · 첫 할 일 자동 생성", "Active · Starter checklist ready")
                : bt("선택 사항 · 건너뛰어도 바로 시작", "Optional · Safe to skip")}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-fg-2">
            {bt(
              "대본·콘티·제작 인원과 주기를 정하고, 처음 할 일을 준비합니다. 무엇을 고를지 망설여지면 아래 추천 상황 카드를 눌러 보세요.",
              "Set your script, storyboard, team and schedule to prepare the first tasks, or pick a quick preset below.",
            )}
          </p>
        </div>
        <button
          ref={toggleButtonRef}
          type="button"
          data-testid="production-plan-toggle"
          aria-pressed={onboardingEnabled}
          onClick={handleToggleClick}
          onKeyDown={handleInteractiveEscape}
          style={{ minHeight: "44px", minWidth: "44px" }}
          className={buttonClass({
            variant: onboardingEnabled ? "solid" : "outline",
            size: "sm",
            className:
              "min-h-11 min-w-11 shrink-0 scroll-my-24 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          })}
        >
          {onboardingEnabled
            ? bt("제작 계획 사용 중", "Production plan on")
            : bt("제작 계획 추가", "Add production plan")}
        </button>
      </div>

      <div
        role="group"
        aria-label={bt("상황별 빠른 제작 계획 선택", "Quick production plan presets")}
        data-testid="production-plan-preset-group"
        className="mt-3.5 grid gap-2 sm:grid-cols-3"
      >
        {PRODUCTION_PLAN_PRESETS.map((preset) => {
          const selected = onboardingEnabled && activePreset?.id === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              data-testid={`production-plan-preset-${preset.id}`}
              data-state={selected ? "active" : "inactive"}
              aria-pressed={selected}
              onClick={() => handleSelectPreset(preset)}
              onKeyDown={handlePresetKeyDown}
              style={{ minHeight: "44px", minWidth: "44px" }}
              className={cn(
                "flex min-h-11 min-w-11 scroll-my-24 flex-col justify-between rounded-2xl border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                selected
                  ? "border-accent bg-accent-soft/45"
                  : "border-line bg-panel/45 hover:border-accent/45 hover:bg-raised",
              )}
            >
              <span className="flex w-full items-start justify-between gap-2">
                <strong className="break-words text-xs font-extrabold text-fg [overflow-wrap:anywhere]">
                  {bt(preset.titleKo, preset.titleEn)}
                </strong>
                {selected ? (
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-accent px-2 py-0.5 text-[0.65rem] font-extrabold text-on-accent">
                    <Check size={11} aria-hidden="true" />
                    {bt("선택됨", "Selected")}
                  </span>
                ) : (
                  <Sparkles size={13} className="shrink-0 text-accent/70" aria-hidden="true" />
                )}
              </span>
              <span className="mt-1 block break-words text-[0.7rem] leading-4 text-fg-2 [overflow-wrap:anywhere]">
                {bt(preset.hintKo, preset.hintEn)}
              </span>
            </button>
          );
        })}
      </div>

      {onboardingEnabled ? (
        <div
          data-testid="production-plan-expanded"
          className="mt-4 rounded-2xl border border-line bg-panel/35 p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-black text-fg">
                  {bt(onboardingPlan.titleKo, onboardingPlan.titleEn)}
                </h3>
                <span
                  data-testid="production-plan-landing-badge"
                  className="inline-flex items-center rounded-full border border-accent/35 bg-accent-soft/50 px-2.5 py-0.5 text-[0.68rem] font-bold text-accent"
                >
                  {bt(landingCopy.ko, landingCopy.en)}
                </span>
                {activePreset === null ? (
                  <span
                    data-testid="production-plan-custom-badge"
                    className="inline-flex items-center rounded-full border border-line bg-card px-2 py-0.5 text-[0.68rem] font-bold text-fg-2"
                  >
                    {bt("직접 조합 중", "Custom mix")}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs leading-5 text-fg-2">
                {bt(onboardingPlan.summaryKo, onboardingPlan.summaryEn)}
              </p>
              <p
                data-testid="production-plan-selection-summary"
                className="mt-1 text-[0.7rem] font-semibold text-fg-3"
              >
                {bt(`현재 조합: ${currentSelectionSummary}`, `Current plan: ${currentSelectionSummary}`)}
              </p>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-line/80 bg-card/80 p-3">
            <p className="flex items-center gap-1.5 text-[0.7rem] font-extrabold text-accent">
              <ListChecks size={14} aria-hidden="true" />
              {bt(
                `첫 목표: ${onboardingPlan.milestoneKo}`,
                `First milestone: ${onboardingPlan.milestoneEn}`,
              )}
            </p>
            <ul
              aria-label={bt("자동 준비될 첫 할 일 미리보기", "Starter checklist preview")}
              data-testid="production-plan-task-preview"
              className="mt-2 flex flex-wrap gap-1.5"
            >
              {onboardingPlan.tasksKo.slice(0, 4).map((taskKo, index) => {
                const taskEn = onboardingPlan.tasksEn[index] ?? taskKo;
                return (
                  <li
                    key={`${onboardingPlan.section}:${taskEn}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-line bg-panel/75 px-2.5 py-1 text-[0.7rem] font-semibold text-fg-2"
                  >
                    <span className="font-extrabold text-accent">{index + 1}.</span>
                    <span>{bt(taskKo, taskEn)}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <OnboardingSelect<WebtoonStartingPointId>
              id="studio-webtoon-starting-point"
              label={bt("현재 가지고 있는 자료", "What you already have")}
              value={selection.startingPoint}
              choices={WEBTOON_STARTING_POINTS}
              onChange={(startingPoint) => {
                if (startingPoint === selection.startingPoint) return;
                onSyncStartPoint(projectStartPointFromOnboarding(startingPoint));
                onChangeSelection((current) => ({ ...current, startingPoint }));
              }}
            />
            <OnboardingSelect<WebtoonOnboardingGoalId>
              id="studio-webtoon-goal"
              label={bt("이번 프로젝트 목표", "Project goal")}
              value={selection.goal}
              choices={WEBTOON_ONBOARDING_GOALS}
              onChange={(goal) => {
                if (goal === selection.goal) return;
                onSyncPurpose(projectPurposeFromOnboarding(goal));
                onChangeSelection((current) => ({ ...current, goal }));
              }}
            />
            <OnboardingSelect<WebtoonTeamModelId>
              id="studio-webtoon-team"
              label={bt("제작 인원", "Team model")}
              value={selection.teamModel}
              choices={WEBTOON_TEAM_MODELS}
              onChange={(teamModel) => {
                if (teamModel === selection.teamModel) return;
                onSyncCollaboration(projectCollaborationFromOnboarding(teamModel));
                onChangeSelection((current) => ({ ...current, teamModel }));
              }}
            />
            <OnboardingSelect<WebtoonCadenceId>
              id="studio-webtoon-cadence"
              label={bt("제작 주기", "Cadence")}
              value={selection.cadence}
              choices={WEBTOON_CADENCES}
              onChange={(cadence) => {
                if (cadence === selection.cadence) return;
                onChangeSelection((current) => ({ ...current, cadence }));
              }}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line/70 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="production-plan-reset-default"
                disabled={isDefaultSelection}
                onClick={() => applySelectionAndSync(DEFAULT_WEBTOON_ONBOARDING_SELECTION)}
                onKeyDown={handleInteractiveEscape}
                style={{ minHeight: "44px" }}
                className="inline-flex min-h-11 scroll-my-24 items-center gap-1.5 rounded-xl border border-line bg-card px-3 py-2 text-xs font-bold text-fg-2 transition-colors hover:border-accent/50 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RotateCcw size={13} aria-hidden="true" />
                {bt("추천 기본값으로 초기화", "Reset to defaults")}
              </button>
              <button
                type="button"
                data-testid="production-plan-cancel"
                onClick={cancelAndClosePlan}
                onKeyDown={handleInteractiveEscape}
                style={{ minHeight: "44px" }}
                className="inline-flex min-h-11 scroll-my-24 items-center rounded-xl px-3 py-2 text-xs font-bold text-fg-2 underline-offset-4 hover:text-fg hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {bt("계획 취소하고 끄기 (Esc)", "Cancel & turn off plan (Esc)")}
              </button>
            </div>
            <StudioCreateReturnToStart />
          </div>
        </div>
      ) : null}
    </section>
  );
}
