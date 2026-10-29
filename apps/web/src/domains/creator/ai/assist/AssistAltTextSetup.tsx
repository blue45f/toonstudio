import "@/shared/ai/assist/ai-assist-i18n";

import { useId } from "react";

import { ASSIST_INPUT } from "@/shared/ai/assist/assist-ui";
import { AssistPresetPicker, type AssistPresetCaps } from "@/shared/ai/assist/AssistPresetPicker";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import { ALT_TEXT_LANGUAGES, ALT_TEXT_LIMITS, ALT_TEXT_SCOPES, type AltTextLanguageId, type AltTextScope } from "./assist-alt-text";
import { AssistChoiceChips } from "./AssistChoiceChips";

import type { AltTextForm } from "./assist-alt-text-form";

const SCOPE_KEYS: Readonly<Record<AltTextScope, { readonly label: string; readonly hint: string }>> = {
  brief: { label: "aiAssist.altText.scopeBrief", hint: "aiAssist.altText.scopeBriefHint" },
  standard: { label: "aiAssist.altText.scopeStandard", hint: "aiAssist.altText.scopeStandardHint" },
  detailed: { label: "aiAssist.altText.scopeDetailed", hint: "aiAssist.altText.scopeDetailedHint" },
};

export interface AssistAltTextSetupProps {
  readonly form: AltTextForm;
  readonly onChange: (patch: Partial<AltTextForm>) => void;
  readonly disabled: boolean;
  readonly connectionModel: string;
  readonly caps: AssistPresetCaps;
}

/** 설명 범위·언어·작성 방식(프리셋)과 선택 맥락. 매번 고르는 것은 위에, 가끔 쓰는 맥락은 접어서 아래에 둔다. */
export function AssistAltTextSetup({ form, onChange, disabled, connectionModel, caps }: AssistAltTextSetupProps) {
  const t = useT();
  const idBase = useId();

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <AssistChoiceChips
          label={t("aiAssist.altText.scopeLabel")}
          value={form.scope}
          disabled={disabled}
          onChange={(scope) => onChange({ scope })}
          options={ALT_TEXT_SCOPES.map((value) => ({ value, label: t(SCOPE_KEYS[value].label) }))}
        />
        <p className="text-xs text-fg-3" data-claude-alt-scope-hint="true">{t(SCOPE_KEYS[form.scope].hint)}</p>
      </div>

      <div className="sm:max-w-xs">
        <label htmlFor={`${idBase}-language`} className="mb-1 block text-xs font-bold text-fg-2">{t("aiAssist.altText.languageLabel")}</label>
        <select
          id={`${idBase}-language`}
          className={ASSIST_INPUT}
          value={form.language}
          disabled={disabled}
          onChange={(event) => onChange({ language: event.target.value as AltTextLanguageId })}
        >
          {ALT_TEXT_LANGUAGES.map((language) => <option key={language.id} value={language.id}>{language.name}</option>)}
        </select>
      </div>

      <AssistPresetPicker
        legend={t("aiAssist.altText.presetLabel")}
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
          {t("aiAssist.art.contextTitle")}
        </summary>
        <div className="space-y-3 border-t border-line/70 p-3">
          <div>
            <label htmlFor={`${idBase}-genre`} className="mb-1 block text-xs font-bold text-fg-2">{t("aiAssist.art.genreLabel")}</label>
            <input id={`${idBase}-genre`} className={ASSIST_INPUT} value={form.genre} maxLength={ALT_TEXT_LIMITS.maxGenreChars} disabled={disabled} placeholder={t("aiAssist.art.genrePlaceholder")} onChange={(event) => onChange({ genre: event.target.value })} />
          </div>
          <div>
            <label htmlFor={`${idBase}-notes`} className="mb-1 block text-xs font-bold text-fg-2">{t("aiAssist.altText.notesLabel")}</label>
            <textarea id={`${idBase}-notes`} className={cn(ASSIST_INPUT, "min-h-16 resize-y")} value={form.notes} maxLength={ALT_TEXT_LIMITS.maxNotesChars} disabled={disabled} placeholder={t("aiAssist.altText.notesPlaceholder")} onChange={(event) => onChange({ notes: event.target.value })} />
            <p className="mt-1 text-xs text-fg-3">{t("aiAssist.altText.notesHint")}</p>
          </div>
        </div>
      </details>
    </div>
  );
}
