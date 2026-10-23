/**
 * 샷 포즈·구도 이미지 — 참조 팩에 방법(method) 참조로 더할 이미지 두 장과 샷 id.
 *
 * 정체성은 앵커가 맡고, 이 이미지는 포즈·구도만 참고하도록 참조 팩 안내문이 붙는다(anchor-reference-pack). 파일은 이 기기
 * 안에서만 읽는다. 권리 확인 전이나 샷 id 가 올바르지 않을 때는 이미지를 받지 않고 이유를 화면에 보여 준다.
 */
import { ImageOff } from "lucide-react";
import { useId, useMemo, useRef, type ChangeEvent } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import { captureErrorCopy, resolveCopy } from "../anchor-lab-copy";
import type { AnchorShotCaptureKind } from "../anchor-reference-pack";
import { ANCHOR_IMAGE_ACCEPT } from "./AnchorDropZone";
import { ANCHOR_SHOT_KINDS, type AnchorShots } from "./use-anchor-shots";
import { useObjectUrls } from "./use-object-urls";

const KIND_KEYS: Readonly<Record<AnchorShotCaptureKind, string>> = {
  pose: "anchorLab.shot.pose",
  composition: "anchorLab.shot.composition",
};

function ShotSlotCard({
  kind,
  shots,
  enabled,
  previewUrl,
}: {
  readonly kind: AnchorShotCaptureKind;
  readonly shots: AnchorShots;
  readonly enabled: boolean;
  readonly previewUrl: string | undefined;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const slot = shots.slots[kind];
  const label = t(KIND_KEYS[kind]);
  const filled = slot.status === "ready";
  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) shots.choose(kind, file);
  };
  return (
    <li className="flex gap-3 rounded-2xl border border-line bg-card p-3">
      <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-panel">
        {filled && previewUrl ? (
          <img src={previewUrl} alt={t("anchorLab.shot.previewAlt", { kind: label })} className="h-full w-full object-contain" draggable={false} />
        ) : (
          <ImageOff size={22} aria-hidden="true" className="text-fg-3" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="font-semibold text-fg">{label}</p>
        {slot.status === "reading" ? <p role="status" className="text-sm text-fg-2">{t("anchorLab.shot.reading")}</p> : null}
        {filled ? (
          <p className="truncate text-xs text-fg-3">{t("anchorLab.shot.meta", { name: slot.name ?? "", width: slot.width ?? 0, height: slot.height ?? 0 })}</p>
        ) : null}
        {slot.status === "failed" && slot.errorCode ? (
          <p role="alert" className="text-sm text-bad">{resolveCopy(t, captureErrorCopy(slot.errorCode, slot.errorParams))}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!enabled}
            onClick={() => inputRef.current?.click()}
            className={buttonClass({ variant: filled ? "outline" : "solid", size: "sm" })}
          >
            {filled ? t("anchorLab.shot.replace") : t("anchorLab.shot.choose")}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={ANCHOR_IMAGE_ACCEPT}
            disabled={!enabled}
            tabIndex={-1}
            className="hidden"
            aria-label={t("anchorLab.shot.inputLabel", { kind: label })}
            onChange={handleChange}
          />
          {filled || slot.status === "failed" ? (
            <button
              type="button"
              aria-label={t("anchorLab.shot.clearLabel", { kind: label })}
              onClick={() => { shots.clear(kind); }}
              className={buttonClass({ variant: "ghost", size: "sm" })}
            >
              {t("anchorLab.shot.clear")}
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function AnchorShotPanel({ shots, rightsConfirmed }: { readonly shots: AnchorShots; readonly rightsConfirmed: boolean }) {
  const t = useT();
  const baseInputId = useId();
  const hintId = `${baseInputId}-hint`;
  const errorId = `${baseInputId}-error`;
  const invalid = shots.baseId !== "" && !shots.baseIdValid;
  const enabled = rightsConfirmed && shots.baseIdValid;
  const previewEntries = useMemo(
    () => shots.frames.map((frame) => ({
      id: frame.capture.shotId,
      blob: new Blob([frame.bytes.slice()], { type: frame.capture.mimeType }),
    })),
    [shots.frames],
  );
  const previewUrls = useObjectUrls(previewEntries);
  return (
    <section aria-labelledby={`${baseInputId}-title`} className="space-y-3 rounded-2xl border border-line bg-card p-4">
      <div>
        <h3 id={`${baseInputId}-title`} className="font-semibold text-fg">{t("anchorLab.shot.title")}</h3>
        <p className="text-sm text-fg-2">{t("anchorLab.shot.lead")}</p>
      </div>
      <div className="max-w-sm space-y-1.5">
        <label htmlFor={baseInputId} className="block text-sm font-medium text-fg">{t("anchorLab.shot.id.label")}</label>
        <input
          id={baseInputId}
          type="text"
          value={shots.baseId}
          maxLength={60}
          placeholder="s1"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${hintId} ${errorId}` : hintId}
          onChange={(event) => { shots.setBaseId(event.target.value); }}
          className={cn(
            "h-11 w-full rounded-xl border border-line-strong bg-canvas px-3 text-sm text-fg placeholder:text-fg-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80",
            invalid && "border-bad",
          )}
        />
        <p id={hintId} className="text-xs text-fg-3">{t("anchorLab.shot.id.hint")}</p>
        {invalid ? <p id={errorId} role="alert" className="text-sm text-bad">{t("anchorLab.shot.id.error")}</p> : null}
      </div>
      {!shots.baseIdValid ? <p className="text-sm text-fg-2">{t("anchorLab.shot.needId")}</p> : null}
      <ul className="grid gap-3 md:grid-cols-2">
        {ANCHOR_SHOT_KINDS.map((kind) => (
          <ShotSlotCard key={kind} kind={kind} shots={shots} enabled={enabled} previewUrl={previewUrls.get(`${shots.baseId}-${kind}`)} />
        ))}
      </ul>
    </section>
  );
}
