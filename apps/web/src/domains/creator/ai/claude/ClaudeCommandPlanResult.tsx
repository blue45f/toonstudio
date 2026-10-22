import "@/shared/ai/claude/claude-assist-i18n";

import { LoaderCircle, Play } from "lucide-react";

import { CLAUDE_PRIMARY_BUTTON } from "@/shared/ai/claude/claude-ui";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import { useReasonText } from "./use-command-reason-text";

import type { CommandStepResult } from "./claude-command-plan";
import type { CommandPlanRunResult } from "./claude-command-plan-run";

const STATUS_KEY: Readonly<Record<CommandStepResult["status"], string>> = {
  executed: "claudeAssist.plan.statusExecuted",
  skipped: "claudeAssist.plan.statusSkipped",
  failed: "claudeAssist.plan.statusFailed",
};

const STATUS_TONE: Readonly<Record<CommandStepResult["status"], string>> = {
  executed: "border-good/40 bg-good/10 text-good",
  skipped: "border-line bg-raised text-fg-2",
  failed: "border-bad/40 bg-bad/10 text-bad",
};

/** 단계 하나의 실행 결과 줄(상태 칩 + 이름 + 사유). 계획 결과와 "지금 실행" 결과가 함께 쓴다. */
export function StepResultLine({ result, label }: { readonly result: CommandStepResult; readonly label: string }) {
  const t = useT();
  const reasonText = useReasonText();
  const reason = reasonText(result.reason);
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <span className={cn("rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold", STATUS_TONE[result.status])}>{t(STATUS_KEY[result.status])}</span>
      <span className="font-bold text-fg">{label}</span>
      {reason ? <span className="text-xs text-fg-3">{reason}</span> : null}
    </li>
  );
}

export interface ClaudeCommandPlanResultProps {
  readonly outcome: CommandPlanRunResult;
  /** 요청을 바꿔 이 계획이 이전 요청의 것일 때 true. */
  readonly stale: boolean;
  readonly selected: ReadonlySet<string>;
  readonly onToggle: (commandId: string) => void;
  readonly onRun: () => void;
  readonly running: boolean;
  readonly busy: boolean;
  readonly results: readonly CommandStepResult[];
  readonly shortcuts: ReadonlyMap<string, string>;
  readonly usageText: string;
}

/** 제안한 계획: 이해한 요청, 단계(체크로 고르기, 단축키 표시), 질문, 제외한 명령 수, 실행 결과. */
export function ClaudeCommandPlanResult({ outcome, stale, selected, onToggle, onRun, running, busy, results, shortcuts, usageText }: ClaudeCommandPlanResultProps) {
  const t = useT();
  const { plan } = outcome;
  const labelOf = (commandId: string) => plan.steps.find((step) => step.commandId === commandId)?.label ?? commandId;

  return (
    <section aria-label={t("claudeAssist.plan.intent")} className="space-y-3 rounded-2xl border border-line p-3" data-claude-plan-result="true">
      {stale ? <p role="note" className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-fg-2">{t("claudeAssist.plan.stale")}</p> : null}
      <div>
        <h3 className="text-xs font-bold text-fg-2">{t("claudeAssist.plan.intent")}</h3>
        <p className="mt-1 text-sm text-fg">{plan.intent}</p>
        <p className="mt-1 text-xs text-fg-3">{t("claudeAssist.plan.proposalNote")}</p>
      </div>

      {plan.steps.length > 0 ? (
        <div>
          <h4 className="text-xs font-bold text-fg-2">{t("claudeAssist.plan.stepsTitle")}</h4>
          <p className="mt-0.5 text-xs text-fg-3">{t("claudeAssist.plan.stepsHint")}</p>
          <ol className="mt-2 space-y-1">
            {plan.steps.map((step, index) => {
              const shortcut = shortcuts.get(step.commandId);
              return (
                <li key={step.commandId}>
                  <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-xl border border-line px-3 py-2 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent/5">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selected.has(step.commandId)}
                      disabled={busy}
                      aria-label={t("claudeAssist.plan.stepToggle", { label: step.label })}
                      onChange={() => onToggle(step.commandId)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-fg">{index + 1}. {step.label}</span>
                        {shortcut ? <kbd className="rounded border border-line bg-card px-1.5 py-px text-[0.6875rem] font-sans text-fg-2">{shortcut}</kbd> : null}
                      </span>
                      {step.reason ? <span className="block text-xs text-fg-2">{step.reason}</span> : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ol>
          <button type="button" className={cn(CLAUDE_PRIMARY_BUTTON, "mt-3")} disabled={busy || selected.size === 0} onClick={onRun}>
            {running ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : <Play size={16} aria-hidden />}
            {t("claudeAssist.plan.runSelected")}
          </button>
        </div>
      ) : (
        <p className="text-sm text-fg-2">{t("claudeAssist.plan.stepsNone")}</p>
      )}

      {plan.questions.length > 0 ? (
        <div>
          <h4 className="text-xs font-bold text-fg-2">{t("claudeAssist.plan.questionsTitle")}</h4>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-fg">
            {plan.questions.map((question) => <li key={question}>{question}</li>)}
          </ul>
        </div>
      ) : null}

      {plan.rejected.length > 0 ? <p className="text-xs text-fg-3">{t("claudeAssist.plan.rejected", { count: plan.rejected.length })}</p> : null}

      {results.length > 0 ? (
        <div>
          <h4 className="text-xs font-bold text-fg-2">{t("claudeAssist.plan.resultsTitle")}</h4>
          <ul className="mt-1 space-y-1">
            {results.map((result) => <StepResultLine key={result.commandId} result={result} label={labelOf(result.commandId)} />)}
          </ul>
          {results.some((result) => result.status === "executed") ? <p className="mt-2 text-xs text-fg-3">{t("claudeAssist.plan.undoHint")}</p> : null}
        </div>
      ) : null}

      <p className="border-t border-line pt-2 text-xs text-fg-3">{usageText}</p>
    </section>
  );
}
