import "@/shared/ai/claude/claude-assist-i18n";

import { useId } from "react";

import { CLAUDE_INPUT } from "@/shared/ai/claude/claude-ui";
import { ClaudePresetPicker } from "@/shared/ai/claude/ClaudePresetPicker";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import { ClaudeChoiceChips } from "./ClaudeChoiceChips";

import type { ArtDirectorForm, ArtDirectorPresetCaps } from "./claude-art-director-form";


export interface ClaudeArtDirectorSetupProps {
  readonly form: ArtDirectorForm;
  readonly onChange: (patch: Partial<ArtDirectorForm>) => void;
  readonly disabled: boolean;
  readonly connectionModel: string;
  readonly caps: ArtDirectorPresetCaps;
}

/** 분석 방식(프리셋)·매체·선택 맥락 입력. 필수 선택은 위에, 고르지 않아도 되는 것은 접어서 아래에 둔다. */
export function ClaudeArtDirectorSetup({ form, onChange, disabled, connectionModel, caps }: ClaudeArtDirectorSetupProps) {
  const t = useT();
  const idBase = useId();

  return (
    <div className="space-y-4">
      <ClaudePresetPicker
        legend={t("claudeAssist.art.presetLabel")}
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

      <ClaudeChoiceChips
        label={t("claudeAssist.art.mediumLabel")}
        value={form.medium}
        disabled={disabled}
        onChange={(medium) => onChange({ medium })}
        options={[
          { value: "vertical-scroll", label: t("claudeAssist.art.mediumScroll") },
          { value: "page", label: t("claudeAssist.art.mediumPage") },
        ]}
      />

      <details className="group rounded-xl border border-line bg-card/60" data-claude-art-context="true">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
          <span>
            {t("claudeAssist.art.contextTitle")}
            <span className="ml-2 text-xs font-normal text-fg-3">{t("claudeAssist.art.contextHint")}</span>
          </span>
        </summary>
        <div className="space-y-3 border-t border-line/70 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`${idBase}-genre`} className="mb-1 block text-xs font-bold text-fg-2">{t("claudeAssist.art.genreLabel")}</label>
              <input id={`${idBase}-genre`} className={CLAUDE_INPUT} value={form.genre} maxLength={40} disabled={disabled} placeholder={t("claudeAssist.art.genrePlaceholder")} onChange={(event) => onChange({ genre: event.target.value })} />
            </div>
            <div>
              <label htmlFor={`${idBase}-mood`} className="mb-1 block text-xs font-bold text-fg-2">{t("claudeAssist.art.moodLabel")}</label>
              <input id={`${idBase}-mood`} className={CLAUDE_INPUT} value={form.mood} maxLength={60} disabled={disabled} placeholder={t("claudeAssist.art.moodPlaceholder")} onChange={(event) => onChange({ mood: event.target.value })} />
            </div>
          </div>
          <div>
            <label htmlFor={`${idBase}-notes`} className="mb-1 block text-xs font-bold text-fg-2">{t("claudeAssist.art.notesLabel")}</label>
            <textarea id={`${idBase}-notes`} className={cn(CLAUDE_INPUT, "min-h-20 resize-y")} value={form.notes} maxLength={300} disabled={disabled} placeholder={t("claudeAssist.art.notesPlaceholder")} onChange={(event) => onChange({ notes: event.target.value })} />
          </div>
        </div>
      </details>
    </div>
  );
}
