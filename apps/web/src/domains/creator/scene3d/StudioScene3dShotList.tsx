import { useState } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioScene3dVersionedCut } from "./studio-scene3d-shot-versions";

/** 촬영표는 고정한 버전의 카메라를 사용한다. 복귀한 편집기의 임시 카메라를 읽지 않는다. */
function formatShot(cut: StudioScene3dVersionedCut, t: (ko: string, en: string) => string): string {
  const { camera, source } = cut;
  const decimal = (n: number) => String(Number(n.toFixed(2)));
  const lens = camera.projection === "orthographic"
    ? `${t("직교 범위", "Orthographic span")} ${decimal(camera.orthoScale)} m`
    : `${t("초점 거리", "Focal length")} ${decimal(camera.focalLengthMm)} mm`;
  const status = cut.status === "approved" ? t("승인", "Approved") : cut.status === "needs-review" ? t("재검토", "Needs review") : t("초안", "Draft");
  const lines = [
    `${cut.name} · v${cut.revision} · ${status}`,
    `${camera.name} · ${lens} · ${source.scene.output.width} × ${source.scene.output.height} px`,
    `${t("카메라 위치", "Camera position")} (m)  ${camera.position.map(decimal).join(", ")}`,
    `${t("주목점", "Camera target")} (m)  ${camera.target.map(decimal).join(", ")}`,
  ];
  const material = [...new Set(source.scene.entities.map(entity => entity.name).concat(
    source.linkedVrm?.characters.map(character => character.label) ?? [],
  ))];
  if (material.length) lines.push(`${t("소재", "Assets")}  ${material.join(" · ")}`);
  return lines.join("\n");
}

export function StudioScene3dShotList({ cuts, selected, onDownload }: {
  readonly cuts: readonly StudioScene3dVersionedCut[];
  readonly selected: StudioScene3dVersionedCut;
  readonly onDownload: (text: string) => void;
}) {
  const t = useBilingual("StudioScene3dShotList");
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const report = open ? (all ? cuts : [selected]).map(cut => formatShot(cut, t)).join("\n\n") : "";
  return <details className="rounded-md border border-line" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer px-3 py-3 text-sm font-semibold text-fg">{t("촬영표", "Shot list")}</summary>
    {open && <div className="space-y-2 px-3 pb-3">
      <label className="flex flex-wrap items-center gap-2 text-xs text-fg-2">{t("포함할 컷", "Include cuts")}
        <select className="min-h-11 rounded-md border border-line bg-panel px-2 text-fg" value={all ? "all" : "selected"}
          onChange={event => setAll(event.target.value === "all")}>
          <option value="selected">{t("선택한 컷", "Selected cut")}</option>
          <option value="all">{t("고정한 컷 전체", "All pinned cuts")} ({cuts.length})</option>
        </select>
      </label>
      <textarea readOnly rows={5} value={report} aria-label={t("촬영표 내용", "Shot list details")}
        className="block w-full rounded-md border border-line bg-panel p-2 text-sm text-fg" />
      <button type="button" className="min-h-11 rounded-md border border-line bg-card px-3 text-xs font-semibold text-fg hover:border-accent"
        onClick={() => onDownload(report)}>{t("촬영표 TXT 다운로드", "Download shot list TXT")}</button>
    </div>}
  </details>;
}
