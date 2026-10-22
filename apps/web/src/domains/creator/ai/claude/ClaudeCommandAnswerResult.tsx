import "@/shared/ai/claude/claude-assist-i18n";

import { Play } from "lucide-react";

import { CLAUDE_BUTTON } from "@/shared/ai/claude/claude-ui";
import { useT } from "@/shared/lib/i18n";

import { StepResultLine } from "./ClaudeCommandPlanResult";

import type { CommandAnswerRunResult } from "./claude-command-plan-run";
import type { CommandStepResult } from "./claude-command-plan";

export interface ClaudeCommandAnswerResultProps {
  readonly outcome: CommandAnswerRunResult;
  /** 지금 이 순간 실행할 수 있는 명령인가(라이브 바인딩이 있고 비활성이 아니다). */
  readonly canRunNow: (commandId: string) => boolean;
  readonly onRunNow: (commandId: string) => void;
  readonly runResults: ReadonlyMap<string, CommandStepResult>;
  readonly busy: boolean;
  readonly onFollowUp: (question: string) => void;
  readonly usageText: string;
}

/**
 * 방법 안내 결과: 답, 관련 명령(이름·단축키·한 줄 이유), 필요하면 "지금 실행", 이어서 물어볼 만한 질문.
 * 단축키는 카탈로그 값이고, 도우미가 실행할 수 없는 기능은 실행 버튼 대신 "메뉴에서 직접 해요"로 알린다.
 */
export function ClaudeCommandAnswerResult({ outcome, canRunNow, onRunNow, runResults, busy, onFollowUp, usageText }: ClaudeCommandAnswerResultProps) {
  const t = useT();
  const { answer } = outcome;
  return (
    <section aria-label={t("claudeAssist.plan.answerTitle")} className="space-y-3 rounded-2xl border border-line p-3" data-claude-answer-result="true">
      <div>
        <h3 className="text-xs font-bold text-fg-2">{t("claudeAssist.plan.answerTitle")}</h3>
        <p className="mt-1 whitespace-pre-line text-sm text-fg">{answer.answer}</p>
      </div>

      {answer.commands.length > 0 ? (
        <div>
          <h4 className="text-xs font-bold text-fg-2">{t("claudeAssist.plan.relatedTitle")}</h4>
          <ul className="mt-1 space-y-1">
            {answer.commands.map((command) => {
              const result = runResults.get(command.commandId);
              const runnable = command.executable && canRunNow(command.commandId);
              return (
                <li key={command.commandId} className="rounded-xl border border-line px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-fg">{command.label}</span>
                    {command.shortcut ? (
                      <kbd className="rounded border border-line bg-card px-1.5 py-px text-[0.6875rem] font-sans text-fg-2">{command.shortcut}</kbd>
                    ) : (
                      <span className="text-[0.6875rem] text-fg-3">{t("claudeAssist.plan.noShortcut")}</span>
                    )}
                    {command.executable ? (
                      <button
                        type="button"
                        className={`${CLAUDE_BUTTON} ml-auto min-h-11 px-3 py-1 text-xs`}
                        disabled={busy || !runnable}
                        onClick={() => onRunNow(command.commandId)}
                      >
                        <Play size={12} aria-hidden />
                        {t("claudeAssist.plan.runNow")}
                      </button>
                    ) : (
                      <span className="ml-auto text-[0.6875rem] text-fg-3">{t("claudeAssist.plan.menuOnly")}</span>
                    )}
                  </div>
                  {command.why ? <p className="mt-1 text-xs text-fg-2">{command.why}</p> : null}
                  {command.executable && !runnable && !result ? <p className="mt-1 text-xs text-fg-3">{t("claudeAssist.plan.reasonDisabled")}</p> : null}
                  {result ? <ul className="mt-1"><StepResultLine result={result} label={command.label} /></ul> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {answer.followUps.length > 0 ? (
        <div>
          <h4 className="text-xs font-bold text-fg-2">{t("claudeAssist.plan.followUpsTitle")}</h4>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {answer.followUps.map((question) => (
              <button key={question} type="button" disabled={busy} className="min-h-11 rounded-full border border-line bg-card px-3 py-1 text-xs font-semibold text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50" onClick={() => onFollowUp(question)}>
                {question}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {answer.rejected > 0 ? <p className="text-xs text-fg-3">{t("claudeAssist.plan.rejected", { count: answer.rejected })}</p> : null}
      <p className="border-t border-line pt-2 text-xs text-fg-3">{usageText}</p>
    </section>
  );
}
