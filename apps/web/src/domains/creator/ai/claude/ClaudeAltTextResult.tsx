import "@/shared/ai/claude/claude-assist-i18n";

import { Check, Copy } from "lucide-react";
import { useId } from "react";

import { CLAUDE_BUTTON, CLAUDE_INPUT } from "@/shared/ai/claude/claude-ui";
import { useClaudeUsageText } from "@/shared/ai/claude/use-claude-usage-text";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import { ALT_TEXT_LIMITS, altTextLength, altTextPanelsToPlain, altTextToHtmlAttribute } from "./claude-alt-text";

import { ClaudeCopyStatus } from "./ClaudeCopyStatus";
import { useCopyFeedback } from "./use-copy-feedback";

import type { AltTextRunResult } from "./claude-alt-text-run";

type CopyKind = "short" | "attribute" | "long" | "panels";

export interface ClaudeAltTextResultProps {
  readonly run: AltTextRunResult;
  /** 사용자가 고쳐 쓴 글(처음에는 모델의 글). 복사는 이 글을 쓴다. */
  readonly short: string;
  readonly long: string;
  readonly onShort: (value: string) => void;
  readonly onLong: (value: string) => void;
}

function CopyButton({ kind, active, onCopy, labelKey }: {
  readonly kind: CopyKind;
  readonly active: CopyKind | null;
  readonly onCopy: (kind: CopyKind) => void;
  readonly labelKey: string;
}) {
  const t = useT();
  return (
    <button type="button" className={cn(CLAUDE_BUTTON, "min-h-11 px-3 text-xs")} onClick={() => onCopy(kind)}>
      {active === kind ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      {active === kind ? t("claudeAssist.art.copied") : t(labelKey)}
    </button>
  );
}

/**
 * 대체 텍스트 결과: 한 줄 대체 텍스트(글자 수 표시)·상세 설명(둘 다 바로 고쳐 쓴다)·컷별 설명·알림. 글자 수는 모델 말이 아니라
 * **지금 화면에 있는 글**을 센다. 125자를 넘으면 막지 않고 알린다(권장 길이일 뿐이라서다). 복사는 고친 글 기준이다.
 */
export function ClaudeAltTextResult({ run, short, long, onShort, onLong }: ClaudeAltTextResultProps) {
  const t = useT();
  const usageOf = useClaudeUsageText();
  const idBase = useId();
  const clipboard = useCopyFeedback<CopyKind>();
  const { canCopy, copied } = clipboard;
  const { view } = run;
  const count = altTextLength(short);
  const over = count > ALT_TEXT_LIMITS.shortRecommended;

  const copy = (kind: CopyKind) => {
    const value = kind === "short"
      ? short
      : kind === "attribute"
        ? altTextToHtmlAttribute(short)
        : kind === "long"
          ? long
          : altTextPanelsToPlain(view.panels);
    clipboard.copy(kind, value);
  };

  return (
    <section aria-label={t("claudeAssist.altText.resultTitle")} className="space-y-4 rounded-2xl border border-line p-3" data-claude-alt-result="true" data-claude-shortcut-off="true">
      <h3 className="text-base font-bold text-fg">{t("claudeAssist.altText.resultTitle")}</h3>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={`${idBase}-short`} className="text-xs font-bold text-fg-2">{t("claudeAssist.altText.shortLabel")}</label>
          <span
            data-claude-alt-count="true"
            className={cn("text-xs font-semibold", over ? "text-warn" : "text-fg-3")}
          >
            {t(over ? "claudeAssist.altText.shortCountOver" : "claudeAssist.altText.shortCount", { count, max: ALT_TEXT_LIMITS.shortRecommended })}
          </span>
        </div>
        <textarea
          id={`${idBase}-short`}
          className={cn(CLAUDE_INPUT, "min-h-16 resize-y text-sm", over && "border-warn")}
          value={short}
          rows={2}
          aria-describedby={`${idBase}-short-hint`}
          onChange={(event) => onShort(event.target.value.replace(/\s*\n\s*/gu, " "))}
        />
        <p id={`${idBase}-short-hint`} className="text-xs text-fg-3">{t("claudeAssist.altText.shortHint")}</p>
        {canCopy ? (
          <div className="flex flex-wrap gap-2">
            <CopyButton kind="short" active={copied} onCopy={copy} labelKey="claudeAssist.altText.copyShort" />
            <CopyButton kind="attribute" active={copied} onCopy={copy} labelKey="claudeAssist.altText.copyAttribute" />
          </div>
        ) : null}
      </div>

      {run.scope !== "brief" ? (
        <div className="space-y-1.5">
          <label htmlFor={`${idBase}-long`} className="text-xs font-bold text-fg-2">{t("claudeAssist.altText.longLabel")}</label>
          <textarea
            id={`${idBase}-long`}
            className={cn(CLAUDE_INPUT, "min-h-28 resize-y text-sm leading-relaxed")}
            value={long}
            rows={5}
            onChange={(event) => onLong(event.target.value)}
          />
          {canCopy ? <CopyButton kind="long" active={copied} onCopy={copy} labelKey="claudeAssist.altText.copyLong" /> : null}
        </div>
      ) : null}

      {run.scope === "detailed" ? (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-fg-2">{t("claudeAssist.altText.panelsTitle")}</h4>
            {canCopy && view.panels.length > 0 ? <CopyButton kind="panels" active={copied} onCopy={copy} labelKey="claudeAssist.altText.copyPanels" /> : null}
          </div>
          {view.panels.length > 0 ? (
            <ol className="space-y-1.5">
              {view.panels.map((panel) => (
                <li key={panel.step} className="flex items-start gap-2 rounded-xl border border-line p-2.5" data-claude-alt-panel={panel.step}>
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-fg text-xs font-bold text-canvas" aria-hidden>{panel.step}</span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm text-fg">{panel.description}</p>
                    {panel.text.length > 0 ? (
                      <ul className="space-y-0.5 text-xs text-fg-2" aria-label={t("claudeAssist.altText.panelTextLabel")}>
                        {panel.text.map((line, index) => <li key={`${panel.step}-${index}`}>“{line}”</li>)}
                      </ul>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-fg-3">{t("claudeAssist.altText.panelsEmpty")}</p>
          )}
        </div>
      ) : null}

      {view.warnings.length > 0 ? (
        <div className="rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-fg-2">
          <p className="font-bold text-fg">{t("claudeAssist.altText.warningsTitle")}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">{view.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </div>
      ) : null}

      <ClaudeCopyStatus copied={copied !== null} failed={clipboard.failed} />

      <div className="space-y-1 border-t border-line pt-2 text-xs text-fg-3">
        {view.trimmed > 0 ? (
          <p className="font-semibold text-warn" data-claude-trimmed="true">{t("claudeAssist.common.trimmedNotice", { count: view.trimmed })}</p>
        ) : null}
        <p>{usageOf(run)}</p>
      </div>
    </section>
  );
}
