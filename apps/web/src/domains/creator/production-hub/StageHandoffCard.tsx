/**
 * 단계 인계 카드 — 단계를 시작하는 화면의 본문 상단에, 앞 단계에서
 * 확정한 내용을 읽기 전용 인용으로 보여 준다.
 *
 * - 내용은 전부 stage-handoff-model 이 기존 정본 데이터에서 고른 것만
 *   표시한다. 데이터가 없으면 예시 문구를 지어내지 않고 빈 상태로
 *   무엇이 없는지 + 앞 단계로 가는 링크를 보여 준다.
 * - status 로 로딩/오류를 구분한다. 다시 시도 버튼은 onRetry 가 있을
 *   때만 렌더링한다.
 */
import { ArrowRight, Check, PenLine, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import type { EpisodePlanWithSynopsis } from "../planning/studio-episode-synopsis";
import type { StudioStoryBeat } from "../studio-storyboard-planner";
import type { CharacterModelSheet } from "./model-sheet-freeze-model";
import type { ReviewSessionSummaryExport } from "./review-session-summary-export";
import {
  buildStageHandoff,
  previousEpisodeStage,
  STAGE_HANDOFF_SOURCE_LABELS,
  type StageHandoffCharacterInput,
  type StageHandoffScenePlanInput,
} from "./stage-handoff-model";
import {
  episodeStageDefinition,
  productionSurfacePath,
  type EpisodeStageId,
  type ProductionSurfaceTarget,
} from "./production-project-surfaces";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

export type StageHandoffCardStatus = "ready" | "loading" | "error";

/** 인용을 받아 시작할지(끌어오기), 접어 두고 새로 쓸지의 사용자 선택. */
export type StageHandoffChoice = "pending" | "use" | "fresh";

export interface StageHandoffCardProps {
  readonly plan?: EpisodePlanWithSynopsis | null;
  readonly characters?: readonly StageHandoffCharacterInput[];
  readonly beats?: readonly StudioStoryBeat[];
  /** 이 회차의 장면 계획. 비트가 없을 때 콘티 구성 섹션의 근거가 된다. */
  readonly scenePlans?: readonly StageHandoffScenePlanInput[];
  /** "이 인용으로 시작하기"를 골랐을 때 — 표면이 시작 상태를 기록할 때 쓴다. */
  readonly onUseHandoff?: () => void;
  /** "인용 없이 새로 쓰기"를 골랐을 때 — 인용은 접히고 이 콜백이 불린다. */
  readonly onStartFresh?: () => void;
  /**
   * 동결 모델 시트 레코드. 넘기면 이 회차 등장 캐릭터의 동결 리비전이
   * 기준본 섹션으로 자동 첨부되고, 미동결 캐릭터는 안내로 표시된다.
   * 넘기지 않으면 기준본 동결 여부는 판단하지 않는다.
   */
  readonly modelSheets?: readonly CharacterModelSheet[];
  /**
   * 이 회차 검수 기록에 붙은 세션 요약. 넘기면 가장 최근 세션의 결정
   * 이력이 "검수 세션 결정" 섹션으로 인계에 자동 포함된다. 넘기지
   * 않으면 세션 결정을 판단·표시하지 않는다.
   */
  readonly reviewSessionSummaries?: readonly ReviewSessionSummaryExport[];
  readonly targetStage: EpisodeStageId;
  readonly status?: StageHandoffCardStatus;
  /** surface 대상을 href 로 바꿀 때 쓴다. 없으면 projectId 로 기본 규칙을 적용한다. */
  readonly hrefForTarget?: (target: ProductionSurfaceTarget) => string;
  /** 기본 href 규칙(productionSurfacePath)에 필요한 프로젝트 id. */
  readonly projectId?: string;
  readonly onRetry?: () => void;
}

/**
 * ProductionSurfaceTarget → href 기본 규칙. 프로젝트 내비(s2-2
 * StagePrimaryActionLink)와 같은 변환이다: surface 는 표면 경로,
 * path 는 그대로, episode-room 은 회차 표면으로 폴백한다.
 */
function defaultHrefForTarget(
  projectId: string | undefined,
  target: ProductionSurfaceTarget,
): string | null {
  if (target.kind === "path") return target.path;
  if (!projectId) return null;
  if (target.kind === "surface") {
    return productionSurfacePath(projectId, target.surface, target.query);
  }
  return productionSurfacePath(projectId, "episodes");
}

export function StageHandoffCard({
  plan,
  characters,
  beats,
  scenePlans,
  onUseHandoff,
  onStartFresh,
  modelSheets,
  reviewSessionSummaries,
  targetStage,
  status = "ready",
  hrefForTarget,
  projectId,
  onRetry,
}: StageHandoffCardProps) {
  const bt = useBilingual("StageHandoffCard");
  const handoff = buildStageHandoff({ plan, characters, beats, scenePlans, modelSheets, reviewSessionSummaries, targetStage });
  // 끌어오기/새로 쓰기 선택: 고르기 전에는 인용 전문 + 선택지를 보여 주고,
  // "새로 쓰기"면 인용을 한 줄로 접는다(다시 펼칠 수 있다). "끌어오기"면
  // 인용을 기준 표시로 남긴다. 선택은 이 카드 인스턴스의 표시 상태일 뿐
  // 앞 단계 데이터를 바꾸지 않는다.
  const [choice, setChoice] = useState<StageHandoffChoice>("pending");
  const chooseUse = () => {
    setChoice("use");
    onUseHandoff?.();
  };
  const chooseFresh = () => {
    setChoice("fresh");
    onStartFresh?.();
  };
  // 미동결 안내 — 동결 기준본이 붙은 섹션과 별개로, 아직 기준본이 없는
  // 등장 캐릭터를 숨기지 않고 이름으로 알린다. ready 상태에서만 보인다.
  const unfrozenNotice =
    status === "ready" && handoff.unfrozenCharacters.length > 0 ? (
      <div className="mt-3 rounded-xl border border-dashed border-line bg-panel p-4">
        <p className="text-sm font-bold text-fg">
          {bt("아직 동결된 기준본이 없는 캐릭터가 있어요", "Some characters have no frozen reference yet")}
        </p>
        <p className="mt-1 text-xs leading-5 text-fg-2">
          {handoff.unfrozenCharacters.map((entry) => entry.characterName).join(" · ")}
        </p>
        <p className="mt-1 text-xs leading-5 text-fg-2">
          {bt(
            "선화를 시작하면 이 캐릭터들의 수정이 어려워져요. 표정·포즈 모델 시트를 합의해 동결하면 다음 인계부터 기준본으로 자동 첨부돼요.",
            "Fixes get hard once line art starts. Agree and freeze the expression/pose model sheet and it will be attached here as the reference automatically.",
          )}
        </p>
      </div>
    ) : null;
  const previous = previousEpisodeStage(targetStage);
  const previousHref = hrefForTarget
    ? hrefForTarget(previous.primaryAction.target)
    : defaultHrefForTarget(projectId, previous.primaryAction.target);

  return (
    <section
      aria-label={bt("앞 단계에서 이어받은 것", "Handed over from earlier stages")}
      className="rounded-2xl border border-line bg-card p-4"
    >
      <header>
        <h3 className="text-sm font-black text-fg">
          {bt("앞 단계에서 이어받은 것", "Handed over from earlier stages")}
        </h3>
        <p className="mt-1 text-xs leading-5 text-fg-2">
          {bt(
            "이 단계를 시작할 때 앞 단계에서 확정한 내용만 그대로 옮겨 왔어요.",
            "Only what earlier stages settled, quoted as-is for starting this stage.",
          )}
        </p>
      </header>

      {status === "loading" ? (
        <div aria-busy="true" className="mt-3 space-y-2">
          <span className="sr-only">{bt("불러오는 중", "Loading")}</span>
          {[0, 1, 2].map((row) => (
            <div key={row} className="animate-pulse border-l-2 border-line pl-3 motion-reduce:animate-none">
              <div className="h-3 w-24 rounded bg-raised" />
              <div className="mt-2 h-3 w-full max-w-md rounded bg-raised" />
            </div>
          ))}
        </div>
      ) : status === "error" ? (
        <div className="mt-3 rounded-xl border border-dashed border-line bg-panel p-4">
          <p className="text-sm font-bold text-fg">
            {bt("앞 단계 내용을 불러오지 못했어요", "Couldn't load the earlier stages' work")}
          </p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={buttonClass({ size: "sm", className: "mt-3 min-h-11 gap-1.5" })}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              {bt("다시 시도", "Try again")}
            </button>
          ) : null}
        </div>
      ) : handoff.isEmpty ? (
        <div className="mt-3 rounded-xl border border-dashed border-line bg-panel p-4">
          <p className="text-sm font-bold text-fg">
            {bt("아직 앞 단계 산출이 없어요", "Nothing handed over yet")}
          </p>
          {handoff.missing.length > 0 ? (
            <p className="mt-1 text-xs leading-5 text-fg-2">
              {bt("아직 없는 것", "Still missing")}
              {": "}
              {handoff.missing
                .map((source) => {
                  const label = STAGE_HANDOFF_SOURCE_LABELS[source];
                  return bt(label.ko, label.en);
                })
                .join(" · ")}
            </p>
          ) : null}
          {previousHref ? (
            <Link
              to={previousHref}
              className={buttonClass({ size: "sm", className: "mt-3 min-h-11 gap-1.5" })}
            >
              {bt(previous.primaryAction.label.ko, previous.primaryAction.label.en)}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      ) : choice === "fresh" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-line bg-panel p-4">
          <p className="min-w-0 flex-1 text-sm font-bold text-fg">
            {bt("인용 없이 새로 시작해요", "Starting fresh, without the handover")}
          </p>
          <button
            type="button"
            onClick={() => setChoice("pending")}
            className={buttonClass({ size: "sm", variant: "outline", className: "min-h-11 gap-1.5" })}
          >
            {bt("인용 다시 보기", "Show the handover again")}
          </button>
        </div>
      ) : (
        <>
          <div className="mt-3 space-y-4">
            {handoff.sections.map((entry) => {
              const sourceLabel = episodeStageDefinition(entry.sourceStage).label;
              return (
                <div key={entry.kind} className="border-l-2 border-accent/50 pl-3">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-black text-fg">
                      {bt(entry.title.ko, entry.title.en)}
                    </span>
                    <span
                      className={cn(
                        "rounded-full bg-accent-soft px-2 py-0.5 text-[0.625rem] font-black text-accent",
                      )}
                    >
                      {bt(sourceLabel.ko, sourceLabel.en)}
                    </span>
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {entry.lines.map((line, index) => (
                      <li
                        key={`${entry.kind}-${index}`}
                        className="whitespace-pre-wrap text-sm leading-6 text-fg-2"
                      >
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          {choice === "pending" ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={chooseUse}
                className={buttonClass({ size: "sm", className: "min-h-11 gap-1.5" })}
              >
                <Check className="size-4" aria-hidden="true" />
                {bt("이 인용으로 시작하기", "Start with this handover")}
              </button>
              <button
                type="button"
                onClick={chooseFresh}
                className={buttonClass({ size: "sm", variant: "outline", className: "min-h-11 gap-1.5" })}
              >
                <PenLine className="size-4" aria-hidden="true" />
                {bt("인용 없이 새로 쓰기", "Start fresh instead")}
              </button>
            </div>
          ) : (
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-bold text-accent" role="status">
              <Check className="size-3.5" aria-hidden="true" />
              {bt("이 인용을 기준으로 시작해요", "Starting from this handover")}
            </p>
          )}
        </>
      )}
      {unfrozenNotice}
    </section>
  );
}
