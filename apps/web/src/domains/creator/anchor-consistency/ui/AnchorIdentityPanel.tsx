/**
 * 앵커 식별과 권리 확인 — 앵커 id, 원본 캐릭터 id, 가상 캐릭터 권리 확인, 출처 메모.
 *
 * 권리 확인은 이미지를 받기 전에 먼저 한다. 확인 문장은 내려받는 파일에도 남는다(anchor-rights). 입력 오류는 입력란 아래에
 * 이유와 예시로 알리고, 입력 내용은 그대로 둔다.
 */
import { useId } from "react";

import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import { ANCHOR_RIGHTS_NOTE_MAX_LENGTH } from "../anchor-rights";
import type { AnchorSetBuilder } from "./use-anchor-set-builder";

const INPUT_CLASS =
  "h-11 w-full rounded-xl border border-line-strong bg-canvas px-3 text-sm text-fg placeholder:text-fg-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80";

interface IdentityFieldProps {
  readonly label: string;
  readonly hint: string;
  readonly error: string;
  readonly value: string;
  readonly valid: boolean;
  readonly placeholder: string;
  readonly maxLength: number;
  readonly onChange: (value: string) => void;
}

function IdentityField({ label, hint, error, value, valid, placeholder, maxLength, onChange }: IdentityFieldProps) {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const invalid = value !== "" && !valid;
  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium text-fg">{label}</label>
      <input
        id={inputId}
        type="text"
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${hintId} ${errorId}` : hintId}
        onChange={(event) => { onChange(event.target.value); }}
        className={cn(INPUT_CLASS, invalid && "border-bad")}
      />
      <p id={hintId} className="text-xs text-fg-3">{hint}</p>
      {invalid ? <p id={errorId} role="alert" className="text-sm text-bad">{error}</p> : null}
    </div>
  );
}

export function AnchorIdentityPanel({ builder }: { readonly builder: AnchorSetBuilder }) {
  const t = useT();
  const confirmId = useId();
  const confirmHintId = `${confirmId}-hint`;
  const noteId = useId();
  const noteHintId = `${noteId}-hint`;
  return (
    <section aria-labelledby="anchor-lab-identity-title" className="space-y-5 rounded-3xl border border-line bg-panel p-4 sm:p-6">
      <div className="space-y-4">
        <h2 id="anchor-lab-identity-title" className="text-xl font-bold text-fg">{t("anchorLab.identity.title")}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <IdentityField
            label={t("anchorLab.identity.anchorId.label")}
            hint={t("anchorLab.identity.anchorId.hint")}
            error={t("anchorLab.identity.anchorId.error")}
            value={builder.anchorId}
            valid={builder.anchorIdValid}
            placeholder="hero-01"
            maxLength={40}
            onChange={builder.setAnchorId}
          />
          <IdentityField
            label={t("anchorLab.identity.characterId.label")}
            hint={t("anchorLab.identity.characterId.hint")}
            error={t("anchorLab.identity.characterId.error")}
            value={builder.sourceCharacterId}
            valid={builder.characterIdValid}
            placeholder="char-7"
            maxLength={64}
            onChange={builder.setSourceCharacterId}
          />
        </div>
      </div>

      <div className="space-y-3 border-t border-line pt-5">
        <h2 className="text-xl font-bold text-fg">{t("anchorLab.rights.title")}</h2>
        <label htmlFor={confirmId} className="flex min-h-11 cursor-pointer items-start gap-3">
          <input
            id={confirmId}
            type="checkbox"
            checked={builder.rightsConfirmed}
            aria-describedby={confirmHintId}
            onChange={(event) => { builder.setRightsConfirmed(event.target.checked); }}
            className="mt-0.5 size-5 shrink-0 accent-[var(--color-accent)] pointer-coarse:size-6"
          />
          <span className="min-w-0 text-sm font-medium leading-relaxed text-fg">{t("anchorLab.rights.confirm")}</span>
        </label>
        <p id={confirmHintId} className="text-xs text-fg-3">{t("anchorLab.rights.confirmHint")}</p>
        <div className="space-y-1.5">
          <label htmlFor={noteId} className="block text-sm font-medium text-fg">{t("anchorLab.rights.note.label")}</label>
          <input
            id={noteId}
            type="text"
            value={builder.rightsNote}
            maxLength={ANCHOR_RIGHTS_NOTE_MAX_LENGTH}
            autoComplete="off"
            aria-describedby={noteHintId}
            onChange={(event) => { builder.setRightsNote(event.target.value); }}
            className={INPUT_CLASS}
          />
          <p id={noteHintId} className="text-xs text-fg-3">{t("anchorLab.rights.note.hint")}</p>
        </div>
      </div>
    </section>
  );
}
