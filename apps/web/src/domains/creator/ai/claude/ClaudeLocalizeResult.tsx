import "@/shared/ai/claude/claude-assist-i18n";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { CLAUDE_BUTTON, CLAUDE_INPUT, CLAUDE_QUIET_BUTTON } from "@/shared/ai/claude/claude-ui";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import {
  exceedsBudget,
  localizeToJson,
  localizeToPlainText,
  localizeToTsv,
  LOCALIZE_BUDGET_RATIO,
  missingGlossaryTerms,
  widthRatio,
  type GlossaryEntry,
  type LocalizeBudget,
  type LocalizeResultView,
} from "./claude-localize";

export interface ClaudeLocalizeResultProps {
  readonly view: LocalizeResultView;
  /** 사용자가 고쳐 쓴 번역(없으면 모델의 번역). */
  readonly edits: ReadonlyMap<number, string>;
  readonly onEdit: (index: number, text: string) => void;
  readonly budget: LocalizeBudget;
  readonly glossary: readonly GlossaryEntry[];
  readonly languages: { readonly source: string; readonly target: string };
  readonly usageText: string;
}

type CopyKind = "text" | "tsv" | "json";

/**
 * 번역 결과: 줄마다 원문·번역(바로 고쳐 쓸 수 있다)·글자 폭 점검·용어 점검·더 짧은 안·참고 메모. 폭과 용어 점검은 모델 말이 아니라
 * **지금 화면에 있는 글**을 기준으로 계산해서, 고쳐 쓴 문장에도 정확하다. 내보내기는 현재 글(고친 것 포함)을 쓴다.
 */
export function ClaudeLocalizeResult({ view, edits, onEdit, budget, glossary, languages, usageText }: ClaudeLocalizeResultProps) {
  const t = useT();
  const [copied, setCopied] = useState<CopyKind | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canCopy = typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function";
  const limit = LOCALIZE_BUDGET_RATIO[budget];

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const current = (index: number, fallback: string): string => edits.get(index) ?? fallback;
  const rows = view.lines.map((line) => {
    const text = current(line.index, line.translation);
    const ratio = text ? widthRatio(text, line.source) : 0;
    return {
      line,
      text,
      ratio,
      over: Boolean(text) && exceedsBudget(text, line.source, budget),
      misses: text ? missingGlossaryTerms(line.source, text, glossary) : [],
      edited: edits.has(line.index) && edits.get(line.index) !== line.translation,
    };
  });
  const over = rows.filter((row) => row.over).length;
  const termChecks = rows.filter((row) => row.misses.length > 0).length;
  const missing = rows.filter((row) => !row.text).length;

  const copy = (kind: CopyKind) => {
    const exportLines = rows.map((row) => ({ index: row.line.index, source: row.line.source, translation: row.text }));
    const value = kind === "text"
      ? localizeToPlainText(exportLines)
      : kind === "tsv"
        ? localizeToTsv(exportLines)
        : localizeToJson(exportLines, { sourceLang: languages.source, targetLang: languages.target });
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(kind);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(null), 2_000);
    }, () => undefined);
  };

  return (
    <section aria-label={t("claudeAssist.localize.resultTitle")} className="space-y-3 rounded-2xl border border-line p-3" data-claude-localize-result="true">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-fg">{t("claudeAssist.localize.resultTitle")}</h3>
        {canCopy ? (
          <div className="flex flex-wrap gap-2">
            {([
              ["text", "claudeAssist.localize.copyText"],
              ["tsv", "claudeAssist.localize.copyTsv"],
              ["json", "claudeAssist.localize.copyJson"],
            ] as const).map(([kind, key]) => (
              <button key={kind} type="button" className={cn(CLAUDE_BUTTON, "min-h-11 px-3 text-xs")} onClick={() => copy(kind)}>
                {copied === kind ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
                {copied === kind ? t("claudeAssist.art.copied") : t(key)}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <p className="text-sm text-fg-2" data-claude-localize-summary="true">
        {t("claudeAssist.localize.summary", { count: rows.length - missing, over, terms: termChecks, missing })}
      </p>

      {view.warnings.length > 0 ? (
        <div className="rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-fg-2">
          <p className="font-bold text-fg">{t("claudeAssist.localize.warningsTitle")}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">{view.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </div>
      ) : null}
      {view.discarded > 0 ? <p className="text-xs text-fg-3">{t("claudeAssist.localize.discarded", { count: view.discarded })}</p> : null}

      <ol className="space-y-2">
        {rows.map(({ line, text, ratio, over: isOver, misses, edited }) => (
          <li key={line.index} className={cn("space-y-1.5 rounded-xl border p-3", isOver || misses.length > 0 || !text ? "border-warn/40" : "border-line")} data-claude-localize-line={line.index}>
            <div className="flex items-start gap-2">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-fg text-xs font-bold text-canvas" aria-hidden>{line.index}</span>
              <p className="min-w-0 flex-1 whitespace-pre-line text-sm text-fg-2">
                <span className="sr-only">{t("claudeAssist.localize.sourceLine")}: </span>
                {line.source}
              </p>
            </div>
            <textarea
              className={cn(CLAUDE_INPUT, "min-h-11 resize-y text-sm")}
              aria-label={t("claudeAssist.localize.translationAria", { index: line.index })}
              value={text}
              rows={Math.max(1, Math.min(4, Math.ceil(text.length / 40)))}
              onChange={(event) => onEdit(line.index, event.target.value)}
            />
            {!text ? <p role="status" className="text-xs text-warn">{t("claudeAssist.localize.missingLine")}</p> : null}
            <div className="flex flex-wrap items-center gap-1.5 text-[0.6875rem] font-semibold">
              {text && limit !== null ? (
                <span className={cn("rounded-full border px-2 py-0.5", isOver ? "border-warn/40 bg-warn/10 text-warn" : "border-line text-fg-2")}>
                  {t(isOver ? "claudeAssist.localize.ratioOver" : "claudeAssist.localize.ratio", { percent: Math.round(ratio * 100) })}
                </span>
              ) : null}
              {edited ? <span className="rounded-full border border-line px-2 py-0.5 text-fg-3">{t("claudeAssist.localize.edited")}</span> : null}
              {misses.length > 0 ? (
                <span className="rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-warn">
                  {t("claudeAssist.localize.glossaryMiss", { terms: misses.map((entry) => `${entry.source} → ${entry.target}`).join(", ") })}
                </span>
              ) : null}
            </div>
            {line.shorter && line.shorter !== text ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-raised/60 px-2.5 py-1.5 text-xs">
                <span className="font-bold text-fg-2">{t("claudeAssist.localize.shorterLabel")}</span>
                <span className="min-w-0 flex-1 text-fg">{line.shorter}</span>
                <button type="button" className={cn(CLAUDE_QUIET_BUTTON, "min-h-11 px-2 text-xs")} onClick={() => onEdit(line.index, line.shorter ?? "")}>
                  {t("claudeAssist.localize.useShorter")}
                </button>
              </div>
            ) : null}
            {line.note ? (
              <p className="text-xs text-fg-3"><span className="font-bold text-fg-2">{t("claudeAssist.localize.noteLabel")}</span> {line.note}</p>
            ) : null}
          </li>
        ))}
      </ol>

      <p className="border-t border-line pt-2 text-xs text-fg-3">{usageText}</p>
    </section>
  );
}
