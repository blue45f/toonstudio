/**
 * 회차 단계 스텝퍼 — 전 표면 공용 정본 (BLUEPRINT S2-4 공용화).
 *
 * S2-1 파일럿은 제작 허브 안에만 있어 표면마다 단계 표시가 갈라질 수 있었다.
 * 이 파일이 유일한 구현이다. 제작 허브의 EpisodeStageStepper.tsx는 기존 상대
 * import 호환을 위한 재노출일 뿐이다.
 *
 * 계약 (고정):
 * - 변형은 full/compact 2개만 허용한다.
 * - 상태 어휘는 4개만 허용한다: done(끝남) · current(지금 여기) · todo(남음) ·
 *   unknown(확인 불가). 표면이 임의의 상태 단어를 만들지 않는다.
 * - 단계는 게이트가 아니다. 어떤 단계도 잠그거나 비활성화하지 않고 상태만 말한다.
 * - 게시 단계는 내부 절차를 중첩으로 안을 수 있다(publishSubsteps). 중첩 표기는
 *   "게시 단계 안의 n/3"으로만 읽히며, 위치 문구는 publish-substeps 모델이 만든다.
 */
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { publishSubstepProgress } from "@/shared/lib/publish-substeps";
import { cn } from "@/shared/lib/utils";

/** 상태 어휘 4개 — 순서·값이 계약이다. 추가/변경은 단계 모델 전체와 함께만 한다. */
export const EPISODE_STAGE_STATUSES = ["done", "current", "todo", "unknown"] as const;

export type EpisodeStageStatus = (typeof EPISODE_STAGE_STATUSES)[number];

export const EPISODE_STAGE_STATUS_TEXT: Readonly<
  Record<EpisodeStageStatus, { readonly ko: string; readonly en: string }>
> = Object.freeze({
  done: { ko: "끝남", en: "Done" },
  current: { ko: "지금 여기", en: "You are here" },
  todo: { ko: "남음", en: "To do" },
  unknown: { ko: "확인 불가", en: "Unknown" },
});

export type EpisodeStageStepperVariant = "full" | "compact";

/** 스텝퍼가 그리는 단계 1개의 표시용 모양. 도메인 도출 결과(EpisodeStageState)와 구조가 같다. */
export interface EpisodeStageStepView {
  readonly id: string;
  readonly label: { readonly ko: string; readonly en: string };
  readonly status: EpisodeStageStatus;
}

/** 게시 단계 안에 중첩해 보여 줄 내부 절차 1개. publish-substeps 모델의 상태와 구조가 같다. */
export interface PublishSubstepView {
  readonly id: string;
  readonly label: { readonly ko: string; readonly en: string };
  readonly status: EpisodeStageStatus;
}

export interface EpisodeStageStepperProps {
  readonly states: readonly EpisodeStageStepView[];
  readonly variant?: EpisodeStageStepperVariant;
  /** compact 칩에 덧붙일 진척 한 줄(예: "컷 32/45"). 도출 근거가 있을 때만 넘긴다. */
  readonly progressText?: string;
  /**
   * 게시 단계의 내부 절차(원고·게시 설정·최종 확인). 게시 단계가 있을 때만
   * 중첩으로 표시한다. 근거가 없으면 넘기지 않는다 — 절차를 지어내지 않는다.
   */
  readonly publishSubsteps?: readonly PublishSubstepView[] | null;
}

function PublishSubstepNestedList({
  substeps,
}: {
  readonly substeps: readonly PublishSubstepView[];
}) {
  const bt = useBilingual("EpisodeStageStepper");
  const progress = publishSubstepProgress(substeps);
  return (
    <div className="mt-2 w-full border-t border-line pt-2">
      <p className="text-xs font-bold text-fg-2">{bt(progress.label.ko, progress.label.en)}</p>
      <ol className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {substeps.map((substep) => (
          <li
            key={substep.id}
            aria-current={substep.status === "current" ? "step" : undefined}
            className={cn(
              "flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs",
              substep.status === "current"
                ? "border-accent bg-accent-soft font-black text-fg"
                : "border-line bg-card text-fg-3",
            )}
          >
            <span>{bt(substep.label.ko, substep.label.en)}</span>
            <span>
              {bt(
                EPISODE_STAGE_STATUS_TEXT[substep.status].ko,
                EPISODE_STAGE_STATUS_TEXT[substep.status].en,
              )}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function EpisodeStageStepper({
  states,
  variant = "full",
  progressText,
  publishSubsteps,
}: EpisodeStageStepperProps) {
  const bt = useBilingual("EpisodeStageStepper");
  if (variant === "compact") {
    const current = states.find((state) => state.status === "current");
    if (!current) return null;
    const isPublish = current.id === "publish" && publishSubsteps && publishSubsteps.length > 0;
    const nestedLabel = isPublish ? publishSubstepProgress(publishSubsteps).label : null;
    return (
      <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-line bg-card px-3 text-xs font-bold text-fg">
        <span>{bt(`${current.label.ko} 단계`, `${current.label.en} stage`)}</span>
        {nestedLabel ? <span className="text-fg-3">{bt(nestedLabel.ko, nestedLabel.en)}</span> : null}
        {progressText ? <span className="text-fg-3">{progressText}</span> : null}
      </span>
    );
  }
  return (
    <ol
      aria-label={bt("회차 완성 단계", "Episode completion stages")}
      className="flex flex-wrap items-center gap-2"
    >
      {states.map((state) => {
        const showNested =
          state.id === "publish" && publishSubsteps != null && publishSubsteps.length > 0;
        return (
          <li
            key={state.id}
            aria-current={state.status === "current" ? "step" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-2 rounded-2xl border px-3 text-sm",
              showNested && "flex-wrap",
              state.status === "current"
                ? "border-accent bg-accent-soft font-black text-fg"
                : "border-line bg-card text-fg-3",
            )}
          >
            <span>{bt(state.label.ko, state.label.en)}</span>
            <span className="text-xs">
              {bt(
                EPISODE_STAGE_STATUS_TEXT[state.status].ko,
                EPISODE_STAGE_STATUS_TEXT[state.status].en,
              )}
            </span>
            {showNested ? <PublishSubstepNestedList substeps={publishSubsteps} /> : null}
          </li>
        );
      })}
    </ol>
  );
}
