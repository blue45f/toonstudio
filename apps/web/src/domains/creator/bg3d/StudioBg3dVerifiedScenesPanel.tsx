import { useEffect, useId, useRef, useState } from "react";
import { getLang, useT } from "@/shared/lib/i18n";
import { STUDIO_BG3D_VERIFIED_LOCAL_SCENES } from "./studio-bg3d-verified-local-scenes";
import "./studio-bg3d-verified-scene-i18n";
import { VerifiedSceneLinkError } from "./studio-bg3d-verified-scene-error";
import { linkStudioBg3dVerifiedScene } from "./studio-bg3d-verified-scene-link";
import type { Bg3dTemplateLibraryEntry } from "./studio-bg3d-template-library-loader";

export interface StudioBg3dVerifiedScenesPanelProps {
  readonly disabled: boolean;
  readonly onApply: (entry: Bg3dTemplateLibraryEntry) => Promise<boolean>;
  readonly onLinked?: () => void;
}

export function StudioBg3dVerifiedScenesPanel({ disabled, onApply, onLinked }: StudioBg3dVerifiedScenesPanelProps) {
  const t = useT();
  const selectId = useId();
  const [id, setId] = useState(STUDIO_BG3D_VERIFIED_LOCAL_SCENES[0]?.id);
  const scene = STUDIO_BG3D_VERIFIED_LOCAL_SCENES.find(candidate => candidate.id === id);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ applied: boolean; cause?: unknown } | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  if (!scene) return null;
  const selected = scene;
  const failed = t("studio.bg3d.verified.failed", "장면을 배치하지 못했습니다. 편집기 안내를 확인하고 다시 시도하세요.");
  const cause = notice?.cause;
  const errorText = cause instanceof VerifiedSceneLinkError
    ? t("studio.bg3d.verified.error." + cause.code, cause.message) + (cause.credit ? " " + cause.credit : "")
    : getLang() === "ko" && cause instanceof Error ? cause.message : failed;
  async function apply(file: File | null) {
    if (!confirmed || disabled || active.current) return;
    const operation = new AbortController();
    active.current = operation;
    setBusy(true);
    setNotice(null);
    try {
      const entry = await linkStudioBg3dVerifiedScene(selected, file, operation.signal);
      if (operation.signal.aborted) return;
      if (file) onLinked?.();
      const applied = await onApply(entry);
      if (!operation.signal.aborted) setNotice({ applied });
    } catch (cause) {
      if (!operation.signal.aborted) setNotice({ applied: false, cause });
    } finally {
      active.current = null;
      if (!operation.signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="mt-4 border-t border-line pt-4" aria-labelledby="bg3d-verified-scenes-title" aria-busy={busy}>
      <h4 id="bg3d-verified-scenes-title" className="mb-2 text-xs font-bold text-fg">
        {t("studio.bg3d.verified.title", "검증 모델 장면")}
      </h4>
      <fieldset disabled={busy || disabled} className="min-w-0 space-y-2 text-xs text-fg-2">
        <label className="block" htmlFor={selectId}>{t("studio.bg3d.verified.select", "검증 장면")}</label>
          <select id={selectId} value={id} onChange={event => { setId(event.target.value); setConfirmed(false); setNotice(null); }}
            className="mt-1 block min-h-11 w-full rounded-lg border border-line bg-card px-2 text-fg">
            {STUDIO_BG3D_VERIFIED_LOCAL_SCENES.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        <p>{t("studio.bg3d.verified.usage." + scene.id, scene.usage)}</p>
        <p className="break-all text-fg-3">{scene.fileName}</p>
        <details className="break-all text-fg-3">
          <summary className="cursor-pointer">{t("studio.bg3d.verified.identity", "파일 크기와 SHA-256 확인")}</summary>
          <p>{scene.byteSize.toLocaleString()} B</p>
          <code>{scene.hash}</code>
        </details>
        <p className="text-fg-3">{t("studio.bg3d.verified.rights." + scene.id, scene.rightsNote)}</p>
        {scene.attributionText && <p>{scene.attributionText}</p>}
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
          {t("studio.bg3d.verified.confirm", "이 모델을 사용할 권리를 확인했습니다")}
        </label>
        <button type="button" disabled={!confirmed} onClick={() => void apply(null)}
          className="min-h-11 w-full rounded-lg border border-line bg-card px-3 text-fg disabled:opacity-50">
          {t("studio.bg3d.verified.apply", "기기 라이브러리에서 적용")}
        </button>
        <label className="block">{t("studio.bg3d.verified.file", "검증 장면의 GLB 파일")}
          <input type="file" accept=".glb,model/gltf-binary" disabled={!confirmed}
            className="mt-1 block min-h-11 w-full text-xs"
            onChange={event => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void apply(file);
            }} />
        </label>
      </fieldset>
      {busy && <p role="status">{t("studio.bg3d.verified.wait", "기기의 모델을 확인하고 장면에 배치하고 있습니다.")}</p>}
      {notice && <p className="mt-2 text-xs" role={notice.applied ? "status" : "alert"}>
        {notice.applied ? t("studio.bg3d.verified.done", "장면을 적용했습니다. 내 템플릿으로 저장할 수 있습니다.") : errorText}
      </p>}
    </section>
  );
}
