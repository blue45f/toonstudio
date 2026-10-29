import "./ai-assist-i18n";

import { useId, useState, type FormEvent } from "react";

import { useT } from "@/shared/lib/i18n";

import { ASSIST_BUDGET_MAX_USD, normalizeAssistBudgetLimit, setAssistBudgetLimit, useAssistBudget } from "./assist-budget";
import { ASSIST_BUTTON, ASSIST_INPUT, ASSIST_QUIET_BUTTON } from "./assist-ui";
import { formatAssistUsd } from "./assist-usage-meter";
import { AssistBudgetMeter } from "./AssistBudgetMeter";

/** 세션 예산 한도 입력. 값은 USD이고, 저장되는 것은 한도 숫자 하나뿐이다. */
export function AssistBudgetEditor() {
  const t = useT();
  const idBase = useId();
  const { limitUsd } = useAssistBudget();
  const [draft, setDraft] = useState(limitUsd === null ? "" : String(limitUsd));
  const [message, setMessage] = useState<{ readonly tone: "ok" | "error"; readonly text: string } | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = Number(draft);
    if (draft.trim() === "" || normalizeAssistBudgetLimit(value) === null) {
      setMessage({ tone: "error", text: t("aiAssist.budget.invalid", { max: ASSIST_BUDGET_MAX_USD }) });
      return;
    }
    if (setAssistBudgetLimit(value)) {
      const saved = normalizeAssistBudgetLimit(value) ?? value;
      setDraft(String(saved));
      setMessage({ tone: "ok", text: t("aiAssist.budget.saved", { limit: formatAssistUsd(saved) }) });
    }
  };

  const clear = () => {
    setAssistBudgetLimit(null);
    setDraft("");
    setMessage({ tone: "ok", text: t("aiAssist.budget.cleared") });
  };

  return (
    <section aria-labelledby={`${idBase}-title`} className="space-y-3 border-t border-line pt-4" data-claude-budget-editor="true">
      <div>
        <h3 id={`${idBase}-title`} className="text-sm font-bold">{t("aiAssist.budget.title")}</h3>
        <p className="mt-1 text-xs text-fg-3">{t("aiAssist.budget.hint")}</p>
      </div>
      <form className="flex flex-wrap items-end gap-2" onSubmit={submit}>
        <div className="min-w-[10rem] flex-1 sm:max-w-[14rem]">
          <label htmlFor={`${idBase}-limit`} className="mb-1 block text-xs font-bold text-fg-2">{t("aiAssist.budget.limitLabel")}</label>
          <input
            id={`${idBase}-limit`}
            className={ASSIST_INPUT}
            type="number"
            inputMode="decimal"
            min={0.01}
            max={ASSIST_BUDGET_MAX_USD}
            step={0.01}
            value={draft}
            placeholder="1.00"
            onChange={(event) => setDraft(event.target.value)}
          />
        </div>
        <button type="submit" className={ASSIST_BUTTON}>{t("aiAssist.budget.save")}</button>
        <button type="button" className={ASSIST_QUIET_BUTTON} onClick={clear} disabled={limitUsd === null && draft === ""}>
          {t("aiAssist.budget.clear")}
        </button>
      </form>
      {message ? (
        <p role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "text-xs text-bad" : "text-xs text-good"}>
          {message.text}
        </p>
      ) : null}
      <AssistBudgetMeter showUsage={false} />
    </section>
  );
}
