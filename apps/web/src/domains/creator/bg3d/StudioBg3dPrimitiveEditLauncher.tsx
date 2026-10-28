import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useT } from "@/shared/lib/i18n";
import type { StudioBg3dPrimitiveEditPorts } from "./studio-bg3d-primitive-edit-ports";
import type { StudioBg3dFaceEditWorkspace } from "./studio-bg3d-face-edit-workspace";

const FaceEditor = lazy(() => import("./StudioBg3dPrimitiveFaceEditor").then((module) => ({ default: module.StudioBg3dPrimitiveFaceEditor })));

/** 원본 선택을 명시적으로 넘기며, 정밀 모델러는 편집 버튼을 누른 뒤에만 연다. */
export function StudioBg3dPrimitiveEditLauncher({ primitiveEditSelection, onBeginPrimitiveEdit, onApplyPrimitiveEdit, disabled = false }: StudioBg3dPrimitiveEditPorts & { readonly disabled?: boolean }) {
  const t = useT();
  const mounted = useRef(false);
  const starting = useRef(false);
  const preparation = useRef<{ readonly controller: AbortController; readonly sourceId: string | null | undefined } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [context, setContext] = useState<StudioBg3dFaceEditWorkspace | null>(null);
  const latest = useRef({ nodeId: primitiveEditSelection?.nodeId, reason: primitiveEditSelection?.blockedReason, disabled });
  latest.current = { nodeId: primitiveEditSelection?.nodeId, reason: primitiveEditSelection?.blockedReason, disabled };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; preparation.current?.controller.abort("face-editor-unmounted"); }; }, []);
  useEffect(() => {
    const pending = preparation.current;
    if (pending && (pending.sourceId !== primitiveEditSelection?.nodeId || primitiveEditSelection?.blockedReason || disabled)) {
      pending.controller.abort("face-editor-source-changed");
    }
  }, [primitiveEditSelection?.nodeId, primitiveEditSelection?.blockedReason, disabled]);
  const reason = primitiveEditSelection?.blockedReason;
  const canBegin = !disabled && !busy && !reason && primitiveEditSelection?.nodeId != null && Boolean(onBeginPrimitiveEdit && onApplyPrimitiveEdit);
  const begin = async () => {
    if (!canBegin || starting.current || !onBeginPrimitiveEdit) return;
    const sourceId = primitiveEditSelection?.nodeId;
    const request = new AbortController(); preparation.current = { controller: request, sourceId };
    starting.current = true; setBusy(true); setMessage("");
    try {
      const result = await onBeginPrimitiveEdit(request.signal);
      if (!mounted.current) return;
      if (request.signal.aborted || latest.current.nodeId !== sourceId || latest.current.reason || latest.current.disabled
        || (result.ok && result.context.source.sourceNodeId !== sourceId)) {
        setMessage(t("studio.bg3d.primitiveEdit.selectionChanged", "선택 또는 편집 가능 상태가 바뀌었습니다. 현재 상자를 확인하고 다시 시작하세요."));
      } else if (result.ok) setContext(result.context); else setMessage(result.messageKo);
    } catch {
      if (mounted.current) setMessage(t("studio.bg3d.primitiveEdit.prepareFailed", "선택한 상자의 면 편집을 준비하지 못했습니다. 다시 시도하세요."));
    } finally {
      if (preparation.current?.controller === request) preparation.current = null;
      starting.current = false; if (mounted.current) setBusy(false);
    }
  };
  return <section className="min-w-0 space-y-2 rounded-xl border border-line bg-panel p-3" aria-label={t("studio.bg3d.primitiveEdit.section", "선택 원본 면 편집")}>
    <h4 className="text-xs font-bold text-fg">{t("studio.bg3d.primitiveEdit.section", "선택 원본 면 편집")}</h4>
    <p className="break-words text-xs text-fg-2">{t("studio.bg3d.primitiveEdit.scopeWithModel", "독립된 기본 상자나 원본 메시를 보관한 편집 모델 하나를 선택하세요. 반영하면 같은 오브젝트의 모델을 갱신하며 배경 실행 취소로 복구할 수 있습니다.")}</p>
    <p className="break-words text-xs text-fg-2">{reason || primitiveEditSelection?.name || t("studio.bg3d.primitiveEdit.selectFirst", "직접 편집할 기본 상자 하나를 선택하세요.")}</p>
    <button type="button" disabled={!canBegin} onClick={() => { void begin(); }}
      className="min-h-11 w-full rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50">
      {busy ? t("studio.bg3d.primitiveEdit.preparing", "원본 면 편집 준비 중") : primitiveEditSelection?.sourceType === "authored-model"
        ? t("studio.bg3d.primitiveEdit.beginModel", "선택한 편집 모델 면 편집") : t("studio.bg3d.primitiveEdit.begin", "선택한 상자 면 편집")}
    </button>
    {message && <p role="alert" className="text-xs text-danger">{message}</p>}
    {context && onApplyPrimitiveEdit && <Suspense fallback={<p role="status" className="text-xs text-fg-2">{t("studio.bg3d.primitiveEdit.loading", "면 편집기를 여는 중입니다.")}</p>}>
      <FaceEditor context={context} onClose={() => setContext(null)} onApply={async (...args) => {
        const result = await onApplyPrimitiveEdit(...args);
        if (result.ok && result.messageKo && mounted.current) setMessage(result.messageKo);
        return result;
      }} />
    </Suspense>}
  </section>;
}
