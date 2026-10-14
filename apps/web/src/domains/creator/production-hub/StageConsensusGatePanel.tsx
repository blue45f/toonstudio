/**
 * 단계 합의 게이트 패널 — 기획·콘티·스케치 합의 상태를 한곳에 보여 준다.
 *
 * 더그림 CP 체제의 "톤 총괄이 단계 합의를 책임진다"를 비동기로 옮긴 표면이다.
 * 이 패널은 표시와 콜백만 맡는다: 판정 등록·게이트 저장은 호스트가 하고,
 * 여기서는 게이트별 상태·리드 판정 사유·조건·후속 작업 수를 그린다.
 *
 * 설계 원칙 (모델과 동일):
 * - 어떤 버튼도 작업을 막지 않는다. 막혀 있는 것은 "완료 확정"과 "게시"뿐이며
 *   패널은 그 사실을 문장으로 알릴 뿐 단계 링크를 비활성화하지 않는다.
 * - 게이트가 하나도 없으면 오류가 아니라 빈 상태로 안내한다(리드 미지정).
 * - 반려 사유와 조건은 리드가 쓴 원문 그대로 보여 준다(요약·변형 없음).
 */
import { Link } from "react-router-dom";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import type { StageGateStatus, StageGateSummary, StageGateView } from "./stage-consensus-gate-model";
import type { ToneHandoffAttachment } from "./work-tone-sheet-model";

const STATUS_CHIP_CLASS: Readonly<Record<StageGateStatus, string>> = Object.freeze({
  "not-submitted": "border-line bg-card text-fg-3",
  "awaiting-lead": "border-accent bg-accent-soft font-bold text-fg",
  approved: "border-line bg-accent-soft font-bold text-fg",
  "approved-with-conditions": "border-line bg-accent-soft font-bold text-fg",
  "changes-requested": "border-line bg-card font-bold text-fg",
  vetoed: "border-line bg-card font-bold text-fg",
});

/**
 * 기획 게이트 톤 시트 참조 — checkFocus가 말하는 톤 기준의 현재본을
 * 리드가 판정 자리에서 바로 대조할 수 있게 보여 준다. 인계 카드의 톤
 * 첨부와 같은 스냅샷(buildToneHandoffAttachment)이며 읽기 전용이다.
 * 톤 시트가 없으면 첨부를 지어내지 않고 없다는 사실만 알린다.
 */
function PlanningToneReferenceBlock({ view }: { readonly view: StageGateView }) {
  const bt = useBilingual("StageConsensusGatePanel");
  if (view.stageId !== "plan") return null;
  const tone: ToneHandoffAttachment | null = view.toneAttachment;
  if (!tone) {
    return (
      <p
        data-planning-gate-tone-sheet="missing"
        className="mt-2 text-xs leading-5 text-fg-3"
      >
        {bt(
          "작품 톤 시트가 아직 없어요. 기획에서 톤을 정하면 이 게이트에 현재본이 자동으로 붙어요.",
          "No work tone sheet yet — once the tone is set in planning, its current version attaches to this gate automatically.",
        )}
      </p>
    );
  }
  return (
    <div
      data-planning-gate-tone-sheet={tone.revision}
      className="mt-2 rounded-xl border border-line bg-panel p-3"
    >
      <p className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-black text-fg">{bt("작품 톤 시트 현재본", "Work tone sheet — current")}</span>
        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.625rem] font-black text-accent">
          {bt(`톤 시트 ${tone.revision}번째 결정본`, `Tone sheet, decision ${tone.revision}`)}
        </span>
        {tone.weightLabel ? (
          <span className="text-xs text-fg-2">{bt(tone.weightLabel.ko, tone.weightLabel.en)}</span>
        ) : null}
        {tone.pacingLabel ? (
          <span className="text-xs text-fg-2">{bt(tone.pacingLabel.ko, tone.pacingLabel.en)}</span>
        ) : null}
      </p>
      {tone.statement ? (
        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-fg">{tone.statement}</p>
      ) : null}
      {tone.forbiddenExpressions.length > 0 ? (
        <div className="mt-2">
          <p className="text-xs font-bold text-fg-2">{bt("쓰지 않기로 한 표현", "Expressions to avoid")}</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {tone.forbiddenExpressions.map((entry) => (
              <li key={entry} className="rounded-full border border-line bg-card px-2 py-0.5 text-xs text-fg">
                {entry}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {tone.latestDecision ? (
        <p className="mt-2 text-xs leading-5 text-fg-2">
          {bt(
            `최근 결정: ${tone.latestDecision.summary} (${tone.latestDecision.decidedByName})`,
            `Latest decision: ${tone.latestDecision.summary} (${tone.latestDecision.decidedByName})`,
          )}
        </p>
      ) : null}
    </div>
  );
}

function GateCard({ view, stageHref }: { readonly view: StageGateView; readonly stageHref?: string }) {
  const bt = useBilingual("StageConsensusGatePanel");
  const { gate, leadDecision } = view;
  return (
    <li className="rounded-2xl border border-line bg-card p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-black text-fg">{bt(view.definition.label.ko, view.definition.label.en)}</p>
        <span
          className={cn("rounded-full border px-2 py-0.5 text-[0.7rem]", STATUS_CHIP_CLASS[view.status])}
        >
          {bt(view.statusLabel.ko, view.statusLabel.en)}
        </span>
        {view.pendingConsensus ? (
          <span className="rounded-full border border-line bg-card px-2 py-0.5 text-[0.7rem] text-fg-3">
            {bt("승인 없이 진행 중", "Proceeding without approval")}
          </span>
        ) : null}
        {view.currentRound > 0 ? (
          <span className="text-xs text-fg-3">
            {bt(`${view.currentRound}번째 제출`, `Submission ${view.currentRound}`)}
          </span>
        ) : null}
        <span className="ml-auto text-xs text-fg-3">
          {bt(`검수 리드 ${gate.leadReviewerName}`, `Review lead ${gate.leadReviewerName}`)}
        </span>
      </div>

      <p className="mt-1.5 text-xs leading-5 text-fg-3">
        {bt(view.definition.checkFocus.ko, view.definition.checkFocus.en)}
      </p>

      <PlanningToneReferenceBlock view={view} />

      {view.status === "not-submitted" ? (
        <p className="mt-2 text-sm leading-6 text-fg-2">
          {bt("아직 이 단계의 합의 제출이 없어요. 산출물이 준비되면 리드에게 합의를 요청하세요.", "Nothing has been submitted for consensus yet. Ask the lead once the work is ready.")}
        </p>
      ) : null}

      {view.status === "awaiting-lead" ? (
        <p className="mt-2 text-sm leading-6 text-fg-2">
          {bt("리드 판정을 기다리고 있어요. 작업은 계속 진행해도 됩니다 — 합의는 완료 확정에만 쓰여요.", "Waiting for the lead's call. Work can continue — consensus is only needed to lock the stage as done.")}
        </p>
      ) : null}

      {leadDecision && (view.status === "changes-requested" || view.status === "vetoed") ? (
        <div className="mt-2 rounded-xl border border-line bg-panel p-3">
          <p className="text-xs font-bold text-fg-2">{bt("반려 사유", "Reason")}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-fg">{leadDecision.reason}</p>
          {leadDecision.pinThreadIds.length > 0 ? (
            <p className="mt-1.5 text-xs text-fg-3">
              {bt(`그림 위 핀 ${leadDecision.pinThreadIds.length}개가 함께 달려 있어요.`, `${leadDecision.pinThreadIds.length} pin(s) on the artwork back this up.`)}
            </p>
          ) : null}
        </div>
      ) : null}

      {leadDecision && view.status === "approved-with-conditions" ? (
        <div className="mt-2 rounded-xl border border-line bg-panel p-3">
          <p className="text-xs font-bold text-fg-2">{bt("합의 조건 — 할 일로 추적 중", "Conditions — tracked as tasks")}</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-fg">
            {leadDecision.conditions.map((condition) => (
              <li key={condition}>{condition}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {view.objectionCount > 0 ? (
        <p className="mt-2 text-xs leading-5 text-fg-3">
          {bt(
            `함께 보는 검수자 ${view.objectionCount}명이 수정을 요청했어요. 최종 판정은 리드가 합니다.`,
            `${view.objectionCount} fellow reviewer(s) asked for changes. The lead makes the final call.`,
          )}
        </p>
      ) : null}

      {view.blocksPublish ? (
        <p className="mt-2 text-xs leading-5 text-fg-3">
          {bt("이 합의가 끝나기 전에는 게시할 수 없어요.", "This episode can't be published until this consensus lands.")}
        </p>
      ) : null}

      {stageHref ? (
        <div className="mt-3">
          <Link to={stageHref} className={buttonClass({ size: "sm", className: "min-h-11" })}>
            {bt("이 단계 열기", "Open this stage")}
          </Link>
        </div>
      ) : null}
    </li>
  );
}

export interface StageConsensusGatePanelProps {
  readonly summary: (StageGateSummary & { readonly missingStageIds: readonly string[] }) | null;
  readonly loading?: boolean;
  readonly error?: string | null;
  readonly onRetry?: () => void;
  /** 단계 표면으로 가는 링크를 만들 때만 넘긴다. 없으면 버튼을 그리지 않는다. */
  readonly stageHrefFor?: (stageId: StageGateView["stageId"]) => string;
}

export function StageConsensusGatePanel({
  summary,
  loading,
  error,
  onRetry,
  stageHrefFor,
}: StageConsensusGatePanelProps) {
  const bt = useBilingual("StageConsensusGatePanel");

  if (loading) {
    return (
      <section aria-label={bt("단계 합의", "Stage consensus")} className="rounded-2xl border border-line bg-card p-4">
        <div className="h-4 w-32 animate-pulse rounded bg-panel" />
        <div className="mt-3 space-y-2">
          <div className="h-16 animate-pulse rounded-xl bg-panel" />
          <div className="h-16 animate-pulse rounded-xl bg-panel" />
        </div>
        <p className="mt-3 text-xs text-fg-3">{bt("합의 상태를 불러오고 있어요.", "Loading consensus state.")}</p>
      </section>
    );
  }

  if (error) {
    return (
      <section aria-label={bt("단계 합의", "Stage consensus")} className="rounded-2xl border border-line bg-card p-4">
        <p className="text-sm font-bold text-fg">{bt("합의 상태를 불러오지 못했어요.", "Couldn't load the consensus state.")}</p>
        <p className="mt-1 text-sm leading-6 text-fg-2">{error}</p>
        {onRetry ? (
          <button type="button" onClick={onRetry} className={buttonClass({ size: "sm", className: "mt-3 min-h-11" })}>
            {bt("다시 시도", "Try again")}
          </button>
        ) : null}
      </section>
    );
  }

  if (!summary || summary.views.length === 0) {
    return (
      <section aria-label={bt("단계 합의", "Stage consensus")} className="rounded-2xl border border-line bg-card p-4">
        <p className="text-sm font-black text-fg">{bt("단계 합의", "Stage consensus")}</p>
        <p className="mt-1.5 text-sm leading-6 text-fg-2">
          {bt(
            "아직 합의 게이트가 없어요. 기획·콘티·스케치 단계마다 검수 리드를 지정하면, 단계마다 톤과 방향을 한 번씩 합의하고 넘어갈 수 있어요.",
            "No consensus gates yet. Assign a review lead to planning, storyboard and sketch, and each stage gets one tone-and-direction check before it locks.",
          )}
        </p>
      </section>
    );
  }

  return (
    <section aria-label={bt("단계 합의", "Stage consensus")} className="rounded-2xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-black text-fg">{bt("단계 합의", "Stage consensus")}</p>
        {summary.publishBlockedBy.length > 0 ? (
          <span className="text-xs text-fg-3">
            {bt(
              `게시 전 합의가 남은 단계 ${summary.publishBlockedBy.length}개`,
              `${summary.publishBlockedBy.length} stage(s) still need consensus before publishing`,
            )}
          </span>
        ) : (
          <span className="text-xs font-bold text-fg-2">{bt("앞단 합의가 모두 끝났어요", "All early-stage consensus is in")}</span>
        )}
        {summary.openFollowUpCount > 0 ? (
          <span className="ml-auto text-xs text-fg-3">
            {bt(`열린 후속 작업 ${summary.openFollowUpCount}개`, `${summary.openFollowUpCount} open follow-up(s)`)}
          </span>
        ) : null}
      </div>
      <ul className="mt-3 space-y-2.5">
        {summary.views.map((view) => (
          <GateCard key={view.gate.id} view={view} stageHref={stageHrefFor?.(view.stageId)} />
        ))}
      </ul>      {summary.missingStageIds.length > 0 ? (
        <p className="mt-3 text-xs leading-5 text-fg-3">
          {bt(
            "리드가 지정되지 않은 단계가 있어요. 게이트가 없으면 그 단계는 기존 방식으로 판정해요.",
            "Some stages have no lead assigned. Without a gate, those stages are judged the existing way.",
          )}
        </p>
      ) : null}
    </section>
  );
}
