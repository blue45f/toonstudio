import { useEffect, useRef, useState } from "react";
import { useT } from "@/shared/lib/i18n";
import type { StudioBg3dSceneGlbExportPorts } from "./studio-bg3d-scene-glb-ports";

export function StudioBg3dSceneGlbExportPanel({ disabled, sceneGlbExportUnavailableReason, onExportCurrentSceneGlb }:
  StudioBg3dSceneGlbExportPorts & { readonly disabled?: boolean }) {
  const t = useT();
  const [name, setName] = useState("toonstudio_scene");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; pending.current?.abort(); }; }, []);
  const run = async () => {
    if (pending.current || disabled || sceneGlbExportUnavailableReason || !onExportCurrentSceneGlb) return;
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setFailed(false); setMessage("");
    try {
      const result = await onExportCurrentSceneGlb({ name, signal: controller.signal });
      if (!mounted.current) return;
      setFailed(!result.ok);
      setMessage(result.ok ? `${result.fileName} · ${result.exportedNodeCount}개 오브젝트 · ${result.byteSize.toLocaleString()} B${result.hiddenNodeCount ? ` · 숨긴 오브젝트 ${result.hiddenNodeCount}개 제외` : ""}` : result.messageKo);
    } catch {
      if (mounted.current) { setFailed(true); setMessage(t("studio.bg3d.sceneGlb.failed", "현재 장면의 GLB 저장에 실패했습니다. 다시 시도하세요.")); }
    } finally { pending.current = null; if (mounted.current) setBusy(false); }
  };
  return <section aria-label={t("studio.bg3d.sceneGlb.title", "현재 장면 3D 파일 저장")} className="space-y-2 rounded-xl border border-line bg-panel p-3">
    <h4 className="text-xs font-bold text-fg">{t("studio.bg3d.sceneGlb.title", "현재 장면 3D 파일 저장")}</h4>
    <p className="text-xs text-fg-2">{t("studio.bg3d.sceneGlb.scope", "지금 표시된 배경 오브젝트와 직접 배치한 모델의 형상·재질·배치·현재 카메라를 GLB로 저장합니다. 숨긴 오브젝트는 제외합니다. 단면은 자르기 전 형상으로 저장하며, 선화·안개·배경 같은 화면 효과는 설정 정보로 보관합니다.")}</p>
    <label className="block text-xs text-fg-2">{t("studio.bg3d.sceneGlb.name", "장면 파일 이름")}
      <input value={name} maxLength={120} disabled={busy || disabled} onChange={(event) => setName(event.target.value)}
        className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-3 text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" />
    </label>
    <button type="button" onClick={() => { void run(); }} disabled={disabled || busy || Boolean(sceneGlbExportUnavailableReason) || !onExportCurrentSceneGlb}
      className="min-h-11 w-full rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50">
      {busy ? t("studio.bg3d.sceneGlb.preparing", "장면 GLB 준비 중") : t("studio.bg3d.sceneGlb.save", "현재 표시 장면 GLB 저장")}
    </button>
    {busy && <button type="button" onClick={() => pending.current?.abort()} className="min-h-11 rounded-lg border border-line px-3 text-xs text-fg">{t("studio.bg3d.sceneGlb.cancel", "GLB 저장 취소")}</button>}
    {sceneGlbExportUnavailableReason && <p className="text-xs text-fg-2">{sceneGlbExportUnavailableReason}</p>}
    {message && <p role={failed ? "alert" : "status"} className={failed ? "break-words text-xs text-danger" : "break-words text-xs text-fg-2"}>{message}</p>}
  </section>;
}
