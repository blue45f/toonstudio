import "@/shared/ai/assist/ai-assist-i18n";

import { useId } from "react";

import { ASSIST_INPUT } from "@/shared/ai/assist/assist-ui";
import { AssistPresetPicker } from "@/shared/ai/assist/AssistPresetPicker";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import { AssistChoiceChips } from "./AssistChoiceChips";

import type { ArtDirectorForm, ArtDirectorPresetCaps } from "./assist-art-director-form";


export interface AssistArtDirectorSetupProps {
  readonly form: ArtDirectorForm;
  readonly onChange: (patch: Partial<ArtDirectorForm>) => void;
  readonly disabled: boolean;
  readonly connectionModel: string;
  readonly caps: ArtDirectorPresetCaps;
}

/** 분석 방식(프리셋)·매체·선택 맥락 입력. 필수 선택은 위에, 고르지 않아도 되는 것은 접어서 아래에 둔다. */
export function AssistArtDirectorSetup({ form, onChange, disabled, connectionModel, caps }: AssistArtDirectorSetupProps) {
  const t = useT();
  const idBase = useId();

  return (
    <div className="space-y-4">
      <AssistPresetPicker
        legend={t("aiAssist.art.presetLabel")}
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

      <AssistChoiceChips
        label={t("aiAssist.art.mediumLabel")}
        value={form.medium}
        disabled={disabled}
        onChange={(medium) => onChange({ medium })}
        options={[
          { value: "vertical-scroll", label: t("aiAssist.art.mediumScroll") },
          { value: "page", label: t("aiAssist.art.mediumPage") },
        ]}
      />

      <details className="group rounded-xl border border-line bg-card/60" data-claude-art-context="true">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
          <span>
            {t("aiAssist.art.contextTitle")}
            <span className="ml-2 text-xs font-normal text-fg-3">{t("aiAssist.art.contextHint")}</span>
          </span>
        </summary>
        <div className="space-y-3 border-t border-line/70 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`${idBase}-genre`} className="mb-1 block text-xs font-bold text-fg-2">{t("aiAssist.art.genreLabel")}</label>
              <input id={`${idBase}-genre`} className={ASSIST_INPUT} value={form.genre} maxLength={40} disabled={disabled} placeholder={t("aiAssist.art.genrePlaceholder")} onChange={(event) => onChange({ genre: event.target.value })} />
            </div>
            <div>
              <label htmlFor={`${idBase}-mood`} className="mb-1 block text-xs font-bold text-fg-2">{t("aiAssist.art.moodLabel")}</label>
              <input id={`${idBase}-mood`} className={ASSIST_INPUT} value={form.mood} maxLength={60} disabled={disabled} placeholder={t("aiAssist.art.moodPlaceholder")} onChange={(event) => onChange({ mood: event.target.value })} />
            </div>
          </div>
          <div>
            <label htmlFor={`${idBase}-notes`} className="mb-1 block text-xs font-bold text-fg-2">{t("aiAssist.art.notesLabel")}</label>
            <textarea id={`${idBase}-notes`} className={cn(ASSIST_INPUT, "min-h-20 resize-y")} value={form.notes} maxLength={300} disabled={disabled} placeholder={t("aiAssist.art.notesPlaceholder")} onChange={(event) => onChange({ notes: event.target.value })} />
          </div>
        </div>
      </details>
    </div>
  );
}
