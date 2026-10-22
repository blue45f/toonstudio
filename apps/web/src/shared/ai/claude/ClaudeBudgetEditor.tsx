import "./claude-assist-i18n";

import { useId, useState, type FormEvent } from "react";

import { useT } from "@/shared/lib/i18n";

import { CLAUDE_BUDGET_MAX_USD, normalizeClaudeBudgetLimit, setClaudeBudgetLimit, useClaudeBudget } from "./claude-budget";
import { CLAUDE_BUTTON, CLAUDE_INPUT, CLAUDE_QUIET_BUTTON } from "./claude-ui";
import { formatClaudeUsd } from "./claude-usage-meter";
import { ClaudeBudgetMeter } from "./ClaudeBudgetMeter";

/** 세션 예산 한도 입력. 값은 USD이고, 저장되는 것은 한도 숫자 하나뿐이다. */
export function ClaudeBudgetEditor() {
  const t = useT();
  const idBase = useId();
  const { limitUsd } = useClaudeBudget();
  const [draft, setDraft] = useState(limitUsd === null ? "" : String(limitUsd));
  const [message, setMessage] = useState<{ readonly tone: "ok" | "error"; readonly text: string } | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = Number(draft);
    if (draft.trim() === "" || normalizeClaudeBudgetLimit(value) === null) {
      setMessage({ tone: "error", text: t("claudeAssist.budget.invalid", { max: CLAUDE_BUDGET_MAX_USD }) });
      return;
    }
    if (setClaudeBudgetLimit(value)) {
      const saved = normalizeClaudeBudgetLimit(value) ?? value;
      setDraft(String(saved));
      setMessage({ tone: "ok", text: t("claudeAssist.budget.saved", { limit: formatClaudeUsd(saved) }) });
    }
  };

  const clear = () => {
    setClaudeBudgetLimit(null);
    setDraft("");
    setMessage({ tone: "ok", text: t("claudeAssist.budget.cleared") });
  };

  return (
    <section aria-labelledby={`${idBase}-title`} className="space-y-3 border-t border-line pt-4" data-claude-budget-editor="true">
      <div>
        <h3 id={`${idBase}-title`} className="text-sm font-bold">{t("claudeAssist.budget.title")}</h3>
        <p className="mt-1 text-xs text-fg-3">{t("claudeAssist.budget.hint")}</p>
      </div>
      <form className="flex flex-wrap items-end gap-2" onSubmit={submit}>
        <div className="min-w-[10rem] flex-1 sm:max-w-[14rem]">
          <label htmlFor={`${idBase}-limit`} className="mb-1 block text-xs font-bold text-fg-2">{t("claudeAssist.budget.limitLabel")}</label>
          <input
            id={`${idBase}-limit`}
            className={CLAUDE_INPUT}
            type="number"
            inputMode="decimal"
            min={0.01}
            max={CLAUDE_BUDGET_MAX_USD}
            step={0.01}
            value={draft}
            placeholder="1.00"
            onChange={(event) => setDraft(event.target.value)}
          />
        </div>
        <button type="submit" className={CLAUDE_BUTTON}>{t("claudeAssist.budget.save")}</button>
        <button type="button" className={CLAUDE_QUIET_BUTTON} onClick={clear} disabled={limitUsd === null && draft === ""}>
          {t("claudeAssist.budget.clear")}
        </button>
      </form>
      {message ? (
        <p role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "text-xs text-bad" : "text-xs text-good"}>
          {message.text}
        </p>
      ) : null}
      <ClaudeBudgetMeter showUsage={false} />
    </section>
  );
}
