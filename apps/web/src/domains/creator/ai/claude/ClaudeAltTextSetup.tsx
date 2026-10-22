import "@/shared/ai/claude/claude-assist-i18n";

import { useId } from "react";

import { CLAUDE_INPUT } from "@/shared/ai/claude/claude-ui";
import { ClaudePresetPicker, type ClaudePresetCaps } from "@/shared/ai/claude/ClaudePresetPicker";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import { ALT_TEXT_LANGUAGES, ALT_TEXT_LIMITS, ALT_TEXT_SCOPES, type AltTextLanguageId, type AltTextScope } from "./claude-alt-text";
import { ClaudeChoiceChips } from "./ClaudeChoiceChips";

import type { AltTextForm } from "./claude-alt-text-form";

const SCOPE_KEYS: Readonly<Record<AltTextScope, { readonly label: string; readonly hint: string }>> = {
  brief: { label: "claudeAssist.altText.scopeBrief", hint: "claudeAssist.altText.scopeBriefHint" },
  standard: { label: "claudeAssist.altText.scopeStandard", hint: "claudeAssist.altText.scopeStandardHint" },
  detailed: { label: "claudeAssist.altText.scopeDetailed", hint: "claudeAssist.altText.scopeDetailedHint" },
};

export interface ClaudeAltTextSetupProps {
  readonly form: AltTextForm;
  readonly onChange: (patch: Partial<AltTextForm>) => void;
  readonly disabled: boolean;
  readonly connectionModel: string;
  readonly caps: ClaudePresetCaps;
}

/** 설명 범위·언어·작성 방식(프리셋)과 선택 맥락. 매번 고르는 것은 위에, 가끔 쓰는 맥락은 접어서 아래에 둔다. */
export function ClaudeAltTextSetup({ form, onChange, disabled, connectionModel, caps }: ClaudeAltTextSetupProps) {
  const t = useT();
  const idBase = useId();

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <ClaudeChoiceChips
          label={t("claudeAssist.altText.scopeLabel")}
          value={form.scope}
          disabled={disabled}
          onChange={(scope) => onChange({ scope })}
          options={ALT_TEXT_SCOPES.map((value) => ({ value, label: t(SCOPE_KEYS[value].label) }))}
        />
        <p className="text-xs text-fg-3" data-claude-alt-scope-hint="true">{t(SCOPE_KEYS[form.scope].hint)}</p>
      </div>

      <div className="sm:max-w-xs">
        <label htmlFor={`${idBase}-language`} className="mb-1 block text-xs font-bold text-fg-2">{t("claudeAssist.altText.languageLabel")}</label>
        <select
          id={`${idBase}-language`}
          className={CLAUDE_INPUT}
          value={form.language}
          disabled={disabled}
          onChange={(event) => onChange({ language: event.target.value as AltTextLanguageId })}
        >
          {ALT_TEXT_LANGUAGES.map((language) => <option key={language.id} value={language.id}>{language.name}</option>)}
        </select>
      </div>

      <ClaudePresetPicker
        legend={t("claudeAssist.altText.presetLabel")}
        value={form.presetId}
        onChange={(presetId) => onChange({ presetId })}
        disabled={disabled}
        connectionModel={connectionModel}
        caps={caps}
        customModel={form.customModel}
        onCustomModel={(customModel) => onChange({ customModel })}
        customDepth={form.customDepth}
        onCustomDepth={(customDepth) => onChange({ customDepth })}
      />

      <details className="group rounded-xl border border-line bg-card/60" data-claude-alt-context="true">
        <summary className="flex min-h-11 cursor-pointer list-none items-center px-3 py-2 text-sm font-semibold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
          {t("claudeAssist.art.contextTitle")}
        </summary>
        <div className="space-y-3 border-t border-line/70 p-3">
          <div>
            <label htmlFor={`${idBase}-genre`} className="mb-1 block text-xs font-bold text-fg-2">{t("claudeAssist.art.genreLabel")}</label>
            <input id={`${idBase}-genre`} className={CLAUDE_INPUT} value={form.genre} maxLength={ALT_TEXT_LIMITS.maxGenreChars} disabled={disabled} placeholder={t("claudeAssist.art.genrePlaceholder")} onChange={(event) => onChange({ genre: event.target.value })} />
          </div>
          <div>
            <label htmlFor={`${idBase}-notes`} className="mb-1 block text-xs font-bold text-fg-2">{t("claudeAssist.altText.notesLabel")}</label>
            <textarea id={`${idBase}-notes`} className={cn(CLAUDE_INPUT, "min-h-16 resize-y")} value={form.notes} maxLength={ALT_TEXT_LIMITS.maxNotesChars} disabled={disabled} placeholder={t("claudeAssist.altText.notesPlaceholder")} onChange={(event) => onChange({ notes: event.target.value })} />
            <p className="mt-1 text-xs text-fg-3">{t("claudeAssist.altText.notesHint")}</p>
          </div>
        </div>
      </details>
    </div>
  );
}
