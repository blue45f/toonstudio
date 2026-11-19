import { Sparkles } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { localizeText } from "./studio-canvas-viewport-primitives";

import { useT } from "@/shared/lib/i18n";

/** 이미지 생성을 시작한 화면 위에서 최초 사용 고지를 확인한다. */
export function AiAssetNotice({ onCancel, onAcknowledge }: { onCancel: () => void; onAcknowledge: () => void }) {
  const t = useT();
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [opener] = useState(() => typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null);
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    confirmRef.current?.focus({ preventScroll: true });
    return () => {
      if (dialog.open && typeof dialog.close === "function") dialog.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [opener]);
  if (typeof document === "undefined") return null;

  const notice = (
    <dialog ref={dialogRef} aria-modal="true" aria-labelledby={titleId}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-transparent p-0 text-fg backdrop:bg-[oklch(0.08_0.01_70/0.72)]"
      onCancel={event => { event.preventDefault(); onCancel(); }}
      onKeyDown={event => {
        if (event.key === "Escape") {
          event.preventDefault(); event.stopPropagation(); onCancel(); return;
        }
        if (event.key !== "Tab") return;
        if (event.shiftKey && event.target === cancelRef.current) {
          event.preventDefault(); confirmRef.current?.focus();
        } else if (!event.shiftKey && event.target === confirmRef.current) {
          event.preventDefault(); cancelRef.current?.focus();
        }
      }}>
      <div role="presentation" className="grid min-h-full place-items-center p-4" onClick={event => {
        if (event.target === event.currentTarget) onCancel();
      }}>
      <div className="w-full max-w-sm rounded-2xl border border-line bg-panel p-5 shadow-xl">
        <div className="mb-2 flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-full bg-accent-soft text-accent">
          <Sparkles size={16} aria-hidden />
          </span>
          <h2 id={titleId} className="text-base font-bold text-fg">
            {localizeText(t, "생성형 AI 이미지 안내", "studio.aiNotice.title")}
          </h2>
        </div>
        <p className="text-sm leading-relaxed text-fg-2">
          {localizeText(
            t,
            "이 기능은 생성형 AI(OpenAI)로 이미지를 만들어요. 만들어진 결과물에는 AI 배지가 표시돼요.",
            "studio.aiNotice.description"
          )}
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-fg-3">
          <li>{localizeText(t, "타인의 저작물·캐릭터, 실존 인물의 얼굴은 생성하지 않아요.", "studio.aiNotice.ruleCopyright")}</li>
          <li>{localizeText(t, "AI 결과물은 부정확하거나 의도와 다를 수 있어요.", "studio.aiNotice.ruleAccuracy")}</li>
          <li>{localizeText(t, "만든 이미지의 사용 책임은 본인에게 있어요.", "studio.aiNotice.ruleResponsibility")}</li>
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            ref={cancelRef}
            onClick={onCancel}
            className="min-h-12 rounded-lg border border-line bg-card px-3 py-2 text-sm font-semibold text-fg-2 transition-colors hover:bg-raised"
          >
            {localizeText(t, "취소", "studio.aiNotice.cancel")}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onAcknowledge}
            className="min-h-12 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent/90"
          >
            {localizeText(t, "이해했어요, 생성하기", "studio.aiNotice.confirm")}
          </button>
        </div>
      </div>
      </div>
    </dialog>
  );
  // 부모 모달의 배경 격리 범위를 유지하고, 브라우저 최상위 레이어에서 확인창을 연다.
  return createPortal(notice, opener?.closest('[aria-modal="true"], dialog[open]') ?? document.body);
}
