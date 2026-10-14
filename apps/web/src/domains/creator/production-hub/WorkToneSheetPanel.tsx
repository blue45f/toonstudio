/**
 * 작품 톤 시트 패널 — 톤 시트를 보고, 결정으로만 고치고, 이력을 읽는 표면.
 *
 * - 편집은 "저장"이 아니라 "톤 결정 남기기"다: 무엇을·왜 바꿨는지를 적어야
 *   저장할 수 있고, 저장된 결정은 work-tone-sheet-model 이 이력에 누적한다.
 *   예전 값을 조용히 덮는 경로는 이 패널에 없다.
 * - 금지 표현은 칩 목록으로 편집한다(추가·삭제가 결정 이력에 diff 로 남는다).
 * - 기획·콘티 완료 조건(톤·방향 체크)은 표시만 한다. 판정은 모델이 하고,
 *   패널은 충족 여부와 막힌 이유를 그대로 보여 준다. 체크 기록 폼은
 *   담당자 본인이면 구조적으로 비활성화된다(분리 원칙).
 */
import { Ban, Check, History, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  TONE_CHECK_VERDICT_LABELS,
  workToneSheetCompleteness,
  WORK_TONE_PACING_LABELS,
  WORK_TONE_PACINGS,
  WORK_TONE_WEIGHT_LABELS,
  WORK_TONE_WEIGHTS,
  type AppendToneDecisionInput,
  type ToneCheckStageId,
  type ToneCheckVerdict,
  type ToneStageCompletion,
  type WorkTonePacing,
  type WorkToneSheet,
  type WorkToneWeight,
} from "./work-tone-sheet-model";

export interface WorkToneSheetPanelProps {
  readonly sheet: WorkToneSheet | null;
  readonly canEdit?: boolean;
  /** 결정을 남길 사람. 없으면 편집 폼을 그리지 않는다(읽기 전용). */
  readonly author?: { readonly id: string; readonly name: string } | null;
  readonly onAppendDecision?: (input: AppendToneDecisionInput) => void;
  readonly onCreate?: () => void;
  /** 기획·콘티 톤 완료 판정 (호스트가 evaluateToneStageCompletion 으로 계산). */
  readonly completion?: readonly ToneStageCompletion[];
  readonly loading?: boolean;
  readonly error?: string | null;
  readonly onRetry?: () => void;
}

export function WorkToneSheetPanel({
  sheet,
  canEdit = false,
  author,
  onAppendDecision,
  onCreate,
  completion,
  loading,
  error,
  onRetry,
}: WorkToneSheetPanelProps) {
  const bt = useBilingual("WorkToneSheetPanel");
  const [weight, setWeight] = useState<WorkToneWeight | null>(sheet?.weight ?? null);
  const [pacing, setPacing] = useState<WorkTonePacing | null>(sheet?.pacing ?? null);
  const [statement, setStatement] = useState(sheet?.statement ?? "");
  const [forbidden, setForbidden] = useState<readonly string[]>(sheet?.forbiddenExpressions ?? []);
  const [forbiddenDraft, setForbiddenDraft] = useState("");
  const [summary, setSummary] = useState("");
  const [reason, setReason] = useState("");

  // 시트가 밖에서 바뀌면(결정 저장·동기화) 초안을 현재본으로 다시 맞춘다.
  useEffect(() => {
    setWeight(sheet?.weight ?? null);
    setPacing(sheet?.pacing ?? null);
    setStatement(sheet?.statement ?? "");
    setForbidden(sheet?.forbiddenExpressions ?? []);
  }, [sheet?.revision, sheet?.weight, sheet?.pacing, sheet?.statement, sheet?.forbiddenExpressions, sheet]);

  if (loading) {
    return (
      <section aria-label={bt("작품 톤 시트", "Work tone sheet")} className="rounded-2xl border border-line bg-card p-4">
        <div className="h-4 w-28 animate-pulse rounded bg-panel" />
        <div className="mt-3 h-20 animate-pulse rounded-xl bg-panel" />
        <p className="mt-3 text-xs text-fg-2">{bt("톤 시트를 불러오고 있어요.", "Loading the tone sheet.")}</p>
      </section>
    );
  }
  if (error) {
    return (
      <section aria-label={bt("작품 톤 시트", "Work tone sheet")} className="rounded-2xl border border-line bg-card p-4">
        <p role="alert" className="text-sm font-bold text-fg">{bt("톤 시트를 불러오지 못했어요", "Couldn't load the tone sheet")}</p>
        <p className="mt-1 text-xs leading-5 text-fg-2">{error}</p>
        {onRetry ? (
          <button type="button" onClick={onRetry} className={buttonClass({ size: "sm", className: "mt-3 min-h-11" })}>
            {bt("다시 시도", "Try again")}
          </button>
        ) : null}
      </section>
    );
  }
  if (!sheet) {
    return (
      <section aria-label={bt("작품 톤 시트", "Work tone sheet")} className="rounded-2xl border border-dashed border-line bg-panel p-4">
        <p className="text-sm font-bold text-fg">{bt("아직 작품 톤 시트가 없어요", "No work tone sheet yet")}</p>
        <p className="mt-1 text-xs leading-5 text-fg-2">
          {bt("무게감·전개 속도·쓰지 않을 표현을 한 번 정해 두면, 매 회차 인계 카드에 자동으로 붙고 기획·콘티를 마칠 때 톤 체크의 기준이 돼요.", "Set the weight, pacing and off-limits expressions once — it then attaches to every episode handoff and becomes the standard for the planning/storyboard tone check.")}
        </p>
        {canEdit && onCreate ? (
          <button type="button" onClick={onCreate} className={buttonClass({ size: "sm", className: "mt-3 min-h-11" })}>
            {bt("톤 시트 만들기", "Create the tone sheet")}
          </button>
        ) : null}
      </section>
    );
  }

  const completeness = workToneSheetCompleteness(sheet);
  const editable = canEdit && Boolean(author) && Boolean(onAppendDecision);
  const dirty =
    weight !== sheet.weight ||
    pacing !== sheet.pacing ||
    statement.trim() !== sheet.statement ||
    forbidden.length !== sheet.forbiddenExpressions.length ||
    forbidden.some((entry, index) => entry !== sheet.forbiddenExpressions[index]);
  const canSave = editable && dirty && summary.trim().length > 0;

  const addForbidden = () => {
    const value = forbiddenDraft.trim();
    if (!value || forbidden.includes(value)) return;
    setForbidden([...forbidden, value]);
    setForbiddenDraft("");
  };

  const save = () => {
    if (!canSave || !author || !onAppendDecision) return;
    onAppendDecision({
      decidedById: author.id,
      decidedByName: author.name,
      decidedAt: new Date().toISOString(),
      summary: summary.trim(),
      reason: reason.trim(),
      ...(weight ? { weight } : {}),
      ...(pacing ? { pacing } : {}),
      statement: statement.trim(),
      forbiddenExpressions: forbidden,
    });
    setSummary("");
    setReason("");
  };

  return (
    <section aria-label={bt("작품 톤 시트", "Work tone sheet")} className="rounded-2xl border border-line bg-card p-4">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-black text-fg">{bt("작품 톤 시트", "Work tone sheet")}</h3>
        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.625rem] font-black text-accent">
          {bt(`${sheet.revision}번째 결정본`, `Decision ${sheet.revision}`)}
        </span>
        {!completeness.ready ? (
          <span className="text-xs text-fg-2">
            {bt(`아직 정할 것: ${completeness.missingLabels.map((label) => label.ko).join(" · ")}`, `Still to set: ${completeness.missingLabels.map((label) => label.en).join(" · ")}`)}
          </span>
        ) : null}
      </header>

      <div className="mt-3">
        <p className="text-xs font-bold text-fg-2">{bt("무게감", "Weight")}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label={bt("무게감", "Weight")}>
          {WORK_TONE_WEIGHTS.map((entry) => (
            <button
              key={entry}
              type="button"
              disabled={!editable}
              aria-pressed={weight === entry}
              onClick={() => setWeight(entry)}
              className={cn(
                "min-h-11 rounded-full border px-3 text-xs",
                weight === entry ? "border-accent bg-accent-soft font-black text-fg" : "border-line bg-card text-fg-2",
                !editable && "cursor-default opacity-70",
              )}
            >
              {bt(WORK_TONE_WEIGHT_LABELS[entry].ko, WORK_TONE_WEIGHT_LABELS[entry].en)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <p className="text-xs font-bold text-fg-2">{bt("전개 속도", "Pacing")}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label={bt("전개 속도", "Pacing")}>
          {WORK_TONE_PACINGS.map((entry) => (
            <button
              key={entry}
              type="button"
              disabled={!editable}
              aria-pressed={pacing === entry}
              onClick={() => setPacing(entry)}
              className={cn(
                "min-h-11 rounded-full border px-3 text-xs",
                pacing === entry ? "border-accent bg-accent-soft font-black text-fg" : "border-line bg-card text-fg-2",
                !editable && "cursor-default opacity-70",
              )}
            >
              {bt(WORK_TONE_PACING_LABELS[entry].ko, WORK_TONE_PACING_LABELS[entry].en)}
            </button>
          ))}
        </div>
      </div>

      <label className="mt-3 block">
        <span className="text-xs font-bold text-fg-2">{bt("한 줄 톤", "Tone in one line")}</span>
        <input
          value={statement}
          disabled={!editable}
          onChange={(event) => setStatement(event.target.value)}
          placeholder={bt("예: 밝게 시작해 결말로 갈수록 묵직해진다", "e.g. Starts bright, grows heavier toward the ending")}
          className="mt-1.5 w-full rounded-xl border border-line bg-panel px-3 py-2.5 text-sm text-fg disabled:opacity-70"
        />
      </label>

      <div className="mt-3">
        <p className="flex items-center gap-1.5 text-xs font-bold text-fg-2">
          <Ban className="size-3.5" aria-hidden="true" />
          {bt("쓰지 않기로 한 표현", "Expressions to avoid")}
        </p>
        {forbidden.length > 0 ? (
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {forbidden.map((entry) => (
              <li key={entry} className="flex items-center gap-1 rounded-full border border-line bg-panel py-1 pl-2.5 pr-1.5 text-xs text-fg">
                {entry}
                {editable ? (
                  <button
                    type="button"
                    aria-label={bt(`${entry} 지우기`, `Remove ${entry}`)}
                    onClick={() => setForbidden(forbidden.filter((item) => item !== entry))}
                    className="flex size-6 items-center justify-center rounded-full text-fg-2"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-xs leading-5 text-fg-2">{bt("아직 없어요. 작품에서 쓰지 않을 표현이 있으면 적어 두세요.", "None yet. Add any expression this work should never use.")}</p>
        )}
        {editable ? (
          <div className="mt-2 flex gap-2">
            <input
              value={forbiddenDraft}
              onChange={(event) => setForbiddenDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addForbidden();
                }
              }}
              placeholder={bt("금지 표현 추가", "Add an off-limits expression")}
              className="min-w-0 flex-1 rounded-xl border border-line bg-panel px-3 py-2.5 text-sm text-fg"
            />
            <button type="button" onClick={addForbidden} className={buttonClass({ size: "sm", className: "min-h-11 gap-1" })}>
              <Plus className="size-4" aria-hidden="true" />
              {bt("추가", "Add")}
            </button>
          </div>
        ) : null}
      </div>

      {editable ? (
        <div className="mt-4 rounded-xl border border-line bg-panel p-3">
          <p className="text-xs font-bold text-fg">{bt("톤 결정 남기기", "Record a tone decision")}</p>
          <p className="mt-1 text-xs leading-5 text-fg-2">
            {bt("톤은 덮어쓰지 않아요. 무엇이 왜 바뀌었는지가 이력에 남아 다음 회차 인계에 그대로 붙어요.", "Tone is never overwritten silently — what changed and why stays in the history and rides along to the next episode.")}
          </p>
          <input
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder={bt("무엇을 정했나요 (필수)", "What did you decide? (required)")}
            className="mt-2 w-full rounded-xl border border-line bg-card px-3 py-2.5 text-sm text-fg"
          />
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={bt("왜 그렇게 정했나요", "Why this decision?")}
            className="mt-2 w-full rounded-xl border border-line bg-card px-3 py-2.5 text-sm text-fg"
          />
          <button type="button" disabled={!canSave} onClick={save} className={buttonClass({ size: "sm", className: "mt-3 min-h-11 gap-1.5" })}>
            <Check className="size-4" aria-hidden="true" />
            {bt("결정으로 저장", "Save as a decision")}
          </button>
          {dirty && !summary.trim() ? (
            <p className="mt-2 text-xs text-fg-2">{bt("결정 내용을 한 문장으로 적으면 저장할 수 있어요.", "Write the decision in one sentence to save it.")}</p>
          ) : null}
        </div>
      ) : null}

      {completion && completion.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-bold text-fg-2">{bt("단계 완료 조건 — 톤·방향 체크", "Stage completion — tone & direction check")}</p>
          <ul className="mt-2 space-y-2">
            {completion.map((entry) => (
              <li key={entry.stageId} className="rounded-xl border border-line bg-panel p-3">
                <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-fg">
                  {entry.stageId === "plan" ? bt("기획", "Planning") : bt("콘티", "Storyboard")}
                  <span className={cn("rounded-full border px-2 py-0.5 text-[0.7rem]", entry.satisfied ? "border-line bg-accent-soft font-bold text-fg" : "border-line bg-card text-fg-2")}>
                    {entry.satisfied ? bt("톤 체크 충족", "Tone check passed") : bt("톤 체크 필요", "Tone check needed")}
                  </span>
                  {entry.effectiveCheck ? (
                    <span className="text-xs font-normal text-fg-2">
                      {bt(`${entry.effectiveCheck.checkerName}님이 확인`, `Checked by ${entry.effectiveCheck.checkerName}`)}
                    </span>
                  ) : null}
                </p>
                {entry.blockers.length > 0 ? (
                  <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs leading-5 text-fg-2">
                    {entry.blockers.map((issue) => (
                      <li key={issue.code}>{bt(issue.message.ko, issue.message.en)}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {sheet.decisions.length > 0 ? (
        <div className="mt-4">
          <p className="flex items-center gap-1.5 text-xs font-bold text-fg-2">
            <History className="size-3.5" aria-hidden="true" />
            {bt("톤 결정 이력", "Tone decision history")}
          </p>
          <ol className="mt-2 space-y-2">
            {[...sheet.decisions].reverse().map((decision) => (
              <li key={decision.id} className="border-l-2 border-line pl-3">
                <p className="text-sm leading-6 text-fg">{decision.summary}</p>
                <p className="text-xs leading-5 text-fg-2">
                  {decision.decidedByName}
                  {decision.reason ? ` — ${decision.reason}` : ""}
                </p>
                {decision.forbiddenAdded.length > 0 || decision.forbiddenRemoved.length > 0 ? (
                  <p className="text-xs leading-5 text-fg-2">
                    {decision.forbiddenAdded.length > 0 ? `+ ${decision.forbiddenAdded.join(", ")} ` : ""}
                    {decision.forbiddenRemoved.length > 0 ? `− ${decision.forbiddenRemoved.join(", ")}` : ""}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */

export interface ToneDirectionCheckFormProps {
  readonly stageId: ToneCheckStageId;
  /** 체크 대상 톤 시트 리비전 (현재본). */
  readonly toneRevision: number;
  readonly checker: { readonly id: string; readonly name: string };
  /** 이 단계 담당자 id. 체크하는 사람과 같으면 폼은 분리 안내와 함께 비활성화된다. */
  readonly stageAssigneeId?: string | null;
  readonly onRecordCheck?: (input: {
    readonly stageId: ToneCheckStageId;
    readonly verdict: ToneCheckVerdict;
    readonly note: string;
  }) => void;
}

/**
 * 톤·방향 체크 기록 폼 — 담당자와 분리된 체크만 기록할 수 있다.
 * 본인이 담당자면 왜 남이 해야 하는지를 알리고 폼을 그리지 않는다.
 */
export function ToneDirectionCheckForm({
  stageId,
  toneRevision,
  checker,
  stageAssigneeId,
  onRecordCheck,
}: ToneDirectionCheckFormProps) {
  const bt = useBilingual("ToneDirectionCheckForm");
  const [verdict, setVerdict] = useState<ToneCheckVerdict>("fits");
  const [note, setNote] = useState("");
  const isAssignee = Boolean(stageAssigneeId) && checker.id === stageAssigneeId;

  if (isAssignee) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-panel p-3">
        <p className="text-sm font-bold text-fg">{bt("이 단계는 본인이 체크할 수 없어요", "You can't check your own stage")}</p>
        <p className="mt-1 text-xs leading-5 text-fg-2">
          {bt("톤·방향 체크는 단계 담당자와 분리되어야 해요. 담당자가 아닌 팀원에게 체크를 부탁해 주세요.", "The tone & direction check must come from someone other than the stage owner — ask a teammate to check it.")}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      <p className="text-xs font-bold text-fg">
        {stageId === "plan" ? bt("기획 톤·방향 체크", "Planning tone & direction check") : bt("콘티 톤·방향 체크", "Storyboard tone & direction check")}
        <span className="ml-2 font-normal text-fg-2">{bt(`톤 시트 ${toneRevision}번째 결정본 기준`, `Against tone sheet decision ${toneRevision}`)}</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={bt("체크 판정", "Check verdict")}>
        {(Object.keys(TONE_CHECK_VERDICT_LABELS) as ToneCheckVerdict[]).map((entry) => (
          <button
            key={entry}
            type="button"
            aria-pressed={verdict === entry}
            onClick={() => setVerdict(entry)}
            className={cn(
              "min-h-11 rounded-full border px-3 text-xs",
              verdict === entry ? "border-accent bg-accent-soft font-black text-fg" : "border-line bg-card text-fg-2",
            )}
          >
            {bt(TONE_CHECK_VERDICT_LABELS[entry].ko, TONE_CHECK_VERDICT_LABELS[entry].en)}
          </button>
        ))}
      </div>
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder={bt("체크 메모 (어디가 톤과 맞거나 어긋나는지)", "Check note (where it fits or drifts)")}
        className="mt-2 w-full rounded-xl border border-line bg-card px-3 py-2.5 text-sm text-fg"
      />
      {onRecordCheck ? (
        <button
          type="button"
          onClick={() => {
            onRecordCheck({ stageId, verdict, note: note.trim() });
            setNote("");
          }}
          className={buttonClass({ size: "sm", className: "mt-3 min-h-11 gap-1.5" })}
        >
          <Check className="size-4" aria-hidden="true" />
          {bt("체크 남기기", "Record check")}
        </button>
      ) : null}
    </div>
  );
}
