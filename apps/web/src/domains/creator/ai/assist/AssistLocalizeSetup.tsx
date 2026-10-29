import "@/shared/ai/assist/ai-assist-i18n";

import { ArrowLeftRight } from "lucide-react";
import { useId } from "react";

import { ASSIST_BUTTON, ASSIST_INPUT } from "@/shared/ai/assist/assist-ui";
import { AssistPresetPicker, type AssistPresetCaps } from "@/shared/ai/assist/AssistPresetPicker";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import { AssistChoiceChips } from "./AssistChoiceChips";
import {
  LOCALIZE_LANGUAGES,
  LOCALIZE_LIMITS,
  type LocalizeBudget,
  type LocalizeLanguageId,
  type LocalizeTone,
  type ParsedGlossary,
} from "./assist-localize";

import type { LocalizeForm } from "./assist-localize-form";

const TONE_KEYS: Readonly<Record<LocalizeTone, string>> = {
  keep: "aiAssist.localize.toneKeep",
  polite: "aiAssist.localize.tonePolite",
  casual: "aiAssist.localize.toneCasual",
};

const BUDGET_KEYS: Readonly<Record<LocalizeBudget, string>> = {
  none: "aiAssist.localize.budgetNone",
  comfortable: "aiAssist.localize.budgetComfortable",
  tight: "aiAssist.localize.budgetTight",
};

export interface AssistLocalizeSetupProps {
  readonly form: LocalizeForm;
  readonly onChange: (patch: Partial<LocalizeForm>) => void;
  readonly disabled: boolean;
  readonly connectionModel: string;
  readonly caps: AssistPresetCaps;
  readonly glossary: ParsedGlossary;
}

/** 번역 방향·말투·글자 폭 예산·용어집·맥락·처리 방식. 매번 고르는 것은 위에, 가끔 쓰는 것(맥락)은 접어서 아래에 둔다. */
export function AssistLocalizeSetup({ form, onChange, disabled, connectionModel, caps, glossary }: AssistLocalizeSetupProps) {
  const t = useT();
  const idBase = useId();
  const swappable = form.sourceLang !== "auto";
  const sameLanguage = form.sourceLang !== "auto" && form.sourceLang === form.targetLang;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
        <div>
          <label htmlFor={`${idBase}-source`} className="mb-1 block text-xs font-bold text-fg-2">{t("aiAssist.localize.sourceLabel")}</label>
          <select id={`${idBase}-source`} className={ASSIST_INPUT} value={form.sourceLang} disabled={disabled} onChange={(event) => onChange({ sourceLang: event.target.value as LocalizeForm["sourceLang"] })}>
            <option value="auto">{t("aiAssist.localize.sourceAuto")}</option>
            {LOCALIZE_LANGUAGES.map((language) => <option key={language.id} value={language.id}>{language.name}</option>)}
          </select>
        </div>
        <button
          type="button"
          className={cn(ASSIST_BUTTON, "px-3")}
          aria-label={t("aiAssist.localize.swap")}
          title={t("aiAssist.localize.swap")}
          disabled={disabled || !swappable}
          onClick={() => {
            if (form.sourceLang !== "auto") onChange({ sourceLang: form.targetLang, targetLang: form.sourceLang });
          }}
        >
          <ArrowLeftRight size={16} aria-hidden />
        </button>
        <div>
          <label htmlFor={`${idBase}-target`} className="mb-1 block text-xs font-bold text-fg-2">{t("aiAssist.localize.targetLabel")}</label>
          <select id={`${idBase}-target`} className={ASSIST_INPUT} value={form.targetLang} disabled={disabled} onChange={(event) => onChange({ targetLang: event.target.value as LocalizeLanguageId })}>
            {LOCALIZE_LANGUAGES.map((language) => <option key={language.id} value={language.id}>{language.name}</option>)}
          </select>
        </div>
      </div>

      {sameLanguage ? <p role="status" className="-mt-2 text-xs font-semibold text-warn">{t("aiAssist.localize.sameLanguage")}</p> : null}

      <AssistChoiceChips
        label={t("aiAssist.localize.toneLabel")}
        value={form.tone}
        disabled={disabled}
        onChange={(tone) => onChange({ tone })}
        options={(Object.keys(TONE_KEYS) as LocalizeTone[]).map((value) => ({ value, label: t(TONE_KEYS[value]) }))}
      />
      <div className="space-y-1">
        <AssistChoiceChips
          label={t("aiAssist.localize.budgetLabel")}
          value={form.budget}
          disabled={disabled}
          onChange={(budget) => onChange({ budget })}
          options={(Object.keys(BUDGET_KEYS) as LocalizeBudget[]).map((value) => ({ value, label: t(BUDGET_KEYS[value]) }))}
        />
        <p className="text-xs text-fg-3">{t("aiAssist.localize.budgetHint")}</p>
      </div>

      <div>
        <label htmlFor={`${idBase}-glossary`} className="mb-1 block text-xs font-bold text-fg-2">{t("aiAssist.localize.glossaryLabel")}</label>
        <textarea
          id={`${idBase}-glossary`}
          className={cn(ASSIST_INPUT, "min-h-20 resize-y font-mono text-xs")}
          value={form.glossaryText}
          disabled={disabled}
          spellCheck={false}
          placeholder={t("aiAssist.localize.glossaryPlaceholder")}
          onChange={(event) => onChange({ glossaryText: event.target.value })}
        />
        {glossary.invalidLines.length > 0 ? (
          <p role="status" className="mt-1 text-xs text-warn">{t("aiAssist.localize.glossaryInvalid", { count: glossary.invalidLines.length })}</p>
        ) : null}
        {glossary.duplicateLines.length > 0 ? (
          <p role="status" className="mt-1 text-xs text-warn">{t("aiAssist.localize.glossaryDuplicate", { count: glossary.duplicateLines.length })}</p>
        ) : null}
        {glossary.overflow > 0 ? (
          <p role="status" className="mt-1 text-xs text-warn">{t("aiAssist.localize.glossaryOverflow", { max: LOCALIZE_LIMITS.maxGlossary, count: glossary.overflow })}</p>
        ) : null}
      </div>

      <AssistPresetPicker
        legend={t("aiAssist.localize.presetLabel")}
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

      <details className="group rounded-xl border border-line bg-card/60">
        <summary className="flex min-h-11 cursor-pointer list-none items-center px-3 py-2 text-sm font-semibold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
          {t("aiAssist.art.contextTitle")}
        </summary>
        <div className="space-y-3 border-t border-line/70 p-3">
          <div>
            <label htmlFor={`${idBase}-genre`} className="mb-1 block text-xs font-bold text-fg-2">{t("aiAssist.art.genreLabel")}</label>
            <input id={`${idBase}-genre`} className={ASSIST_INPUT} value={form.genre} maxLength={LOCALIZE_LIMITS.maxGenreChars} disabled={disabled} placeholder={t("aiAssist.art.genrePlaceholder")} onChange={(event) => onChange({ genre: event.target.value })} />
          </div>
          <div>
            <label htmlFor={`${idBase}-notes`} className="mb-1 block text-xs font-bold text-fg-2">{t("aiAssist.localize.notesLabel")}</label>
            <textarea id={`${idBase}-notes`} className={cn(ASSIST_INPUT, "min-h-16 resize-y")} value={form.notes} maxLength={LOCALIZE_LIMITS.maxNotesChars} disabled={disabled} placeholder={t("aiAssist.localize.notesPlaceholder")} onChange={(event) => onChange({ notes: event.target.value })} />
          </div>
        </div>
      </details>
    </div>
  );
}
