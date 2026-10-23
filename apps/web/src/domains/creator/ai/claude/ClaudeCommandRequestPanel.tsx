import "@/shared/ai/claude/claude-assist-i18n";

import { useId, type RefObject } from "react";

import { CLAUDE_INPUT, CLAUDE_QUIET_BUTTON } from "@/shared/ai/claude/claude-ui";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import { studioSegmentChipClass } from "../../studio-panel-ui";

import { COMMAND_PLAN_LIMITS } from "./claude-command-plan";
import { ClaudeChoiceChips } from "./ClaudeChoiceChips";

export type ClaudeCommandMode = "do" | "explain";

export interface ClaudeCommandRequestPanelProps {
  readonly mode: ClaudeCommandMode;
  readonly onMode: (mode: ClaudeCommandMode) => void;
  readonly request: string;
  readonly onRequest: (value: string) => void;
  readonly disabled: boolean;
  readonly examples: readonly string[];
  readonly recents: readonly string[];
  readonly onClearRecents: () => void;
  /** 입력칸 아래에 보이는 "무엇을 몇 개 보냈는지" 한 줄(없으면 쓸 수 있는 명령이 없다는 안내). 호출자가 번역해 넘긴다. */
  readonly countText: string;
  readonly textareaRef?: RefObject<HTMLTextAreaElement | null>;
}

/**
 * 요청 입력 영역. 빈 칸에서 막막하지 않도록 이렇게 말해 보라는 예시를 먼저 보여 주고, 쓴 적이 있으면 최근 요청을 다시 쓰게 한다.
 * 모드는 두 칩으로 고르고 각 모드가 하는 일을 한 줄로 알린다.
 */
export function ClaudeCommandRequestPanel({
  mode,
  onMode,
  request,
  onRequest,
  disabled,
  examples,
  recents,
  onClearRecents,
  countText,
  textareaRef,
}: ClaudeCommandRequestPanelProps) {
  const t = useT();
  const idBase = useId();
  const requestId = `${idBase}-request`;
  const modeNoteId = `${idBase}-mode-note`;
  const modeOptions = [
    { value: "do" as const, label: t("claudeAssist.plan.modeDo") },
    { value: "explain" as const, label: t("claudeAssist.plan.modeExplain") },
  ];

  // 예시·최근 요청을 고르면 그 칩(또는 목록)이 사라지므로 포커스를 입력칸으로 옮겨 키보드 사용자가 바로 고치거나 보낼 수 있게 한다.
  const fill = (value: string) => {
    onRequest(value);
    textareaRef?.current?.focus({ preventScroll: true });
  };

  return (
    <div className="space-y-3">
      <ClaudeChoiceChips
        label={t("claudeAssist.plan.modeLabel")}
        value={mode}
        options={modeOptions}
        onChange={onMode}
        disabled={disabled}
        hideLabel
        describedBy={modeNoteId}
      />
      <p id={modeNoteId} className="text-xs text-fg-3">
        {mode === "do" ? t("claudeAssist.plan.modeDoNote") : t("claudeAssist.plan.modeExplainNote")}
      </p>

      <div>
        <label htmlFor={requestId} className="mb-1 block text-xs font-bold text-fg-2">
          {mode === "do" ? t("claudeAssist.plan.requestLabel") : t("claudeAssist.plan.questionLabel")}
        </label>
        <textarea
          id={requestId}
          ref={textareaRef}
          data-claude-initial-focus="true"
          className={cn(CLAUDE_INPUT, "min-h-20 resize-y")}
          value={request}
          maxLength={COMMAND_PLAN_LIMITS.maxRequestChars}
          disabled={disabled}
          placeholder={mode === "do" ? t("claudeAssist.plan.requestPlaceholder") : t("claudeAssist.plan.questionPlaceholder")}
          onChange={(event) => onRequest(event.target.value)}
        />
        <p className="mt-1 text-xs text-fg-3">
          {countText}
        </p>
      </div>

      {request.trim().length === 0 && examples.length > 0 ? (
        <div data-claude-examples="true">
          <p className="mb-1 text-xs font-semibold text-fg-2">{t("claudeAssist.plan.examplesTitle")}</p>
          <div className="flex flex-wrap gap-1.5">
            {examples.map((example) => (
              <button key={example} type="button" disabled={disabled} className={studioSegmentChipClass(false)} onClick={() => fill(example)}>
                {example}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {recents.length > 0 ? (
        <div data-claude-recents="true">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-fg-2">{t("claudeAssist.plan.recentsTitle")}</p>
            <button type="button" className={cn(CLAUDE_QUIET_BUTTON, "min-h-11 px-2 text-xs")} disabled={disabled} onClick={() => {
              onClearRecents();
              textareaRef?.current?.focus({ preventScroll: true });
            }}>
              {t("claudeAssist.plan.recentsClear")}
            </button>
          </div>
          <div className="flex flex-col gap-1">
            {recents.map((recent) => (
              <button
                key={recent}
                type="button"
                title={recent}
                disabled={disabled}
                onClick={() => fill(recent)}
                className="min-h-11 truncate rounded-lg border border-line/70 bg-canvas/40 px-3 py-1.5 text-left text-xs text-fg-2 hover:border-accent/40 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                {recent}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
