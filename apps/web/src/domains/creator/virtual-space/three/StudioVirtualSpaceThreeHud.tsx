import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { getOverlayBadgeStyle, type ProjectedOverlayItem, type StudioThreeLightingPreset } from "./studio-virtual-space-three-dioramas";
import "./studio-virtual-space-three-hud.css";

interface StudioVirtualSpaceThreeHudProps {
  readonly overlays: readonly ProjectedOverlayItem[];
  readonly assetFailureCount: number;
  readonly lightingPreset: StudioThreeLightingPreset;
  readonly onLightingPresetChange: (preset: StudioThreeLightingPreset) => void;
  readonly onResetCamera: () => void;
  readonly onTriggerTarget: (kind: "workstation" | "npc", targetId: string) => void;
}

/** 3D 조명·시점·투영 배지만 그린다. 2D 테마나 원화 저장소를 읽지 않는다. */
export function StudioVirtualSpaceThreeHud({
  overlays, assetFailureCount, lightingPreset, onLightingPresetChange, onResetCamera, onTriggerTarget,
}: StudioVirtualSpaceThreeHudProps) {
  // 기존 문구의 번역 키를 유지한다.
  const bt = useBilingual("StudioVirtualSpaceThreeCanvas");
  return <>
    {assetFailureCount > 0 ? <p role="status" style={{ position: "absolute", left: 16, top: 48, zIndex: 3 }}>{bt("일부 3D 장비를 불러오지 못했어요. 다른 장비와 공간은 계속 이용할 수 있어요.", "Some 3D equipment could not load. Other equipment and rooms are still available.")}</p> : null}
    <div
      className="studio-vspace-three-lighting-hud"
      role="group"
      aria-label={bt("조명과 시점", "Lighting and view")}
    >
      {([
        { id: "day", ko: "자연광 HDRI", en: "Day HDRI" },
        { id: "studio", ko: "스튜디오", en: "Studio" },
        { id: "night", ko: "나이트", en: "Night" },
      ] as const).map((option) => <button
        key={option.id}
        type="button"
        aria-pressed={lightingPreset === option.id}
        onClick={() => onLightingPresetChange(option.id)}
      >{bt(option.ko, option.en)}</button>)}
      <button
        type="button"
        className="studio-vspace-three-lighting-hud__reset"
        onClick={onResetCamera}
      >{bt("시점 리셋 [C]", "Reset View [C]")}</button>
    </div>
    <div className="studio-vspace-three-overlays" style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 2 }}>
      {overlays.map((item) => {
        const target = (item.kind === "workstation" || item.kind === "npc") && item.targetId
          ? { kind: item.kind, id: item.targetId } : null;
        return <div
          key={item.id}
          data-overlay-kind={item.kind}
          role={target ? "button" : undefined}
          tabIndex={target ? 0 : undefined}
          onClick={target ? (event) => { event.stopPropagation(); onTriggerTarget(target.kind, target.id); } : undefined}
          onKeyDown={target ? (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault(); event.stopPropagation(); onTriggerTarget(target.kind, target.id);
            }
          } : undefined}
          style={getOverlayBadgeStyle(item, target !== null)}
        >
          {item.kind === "self" || item.kind === "peer" ? (
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: item.accent ?? "#38bdf8" }} />
          ) : item.kind === "npc" ? (
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#a78bfa" }} />
          ) : item.kind === "workstation" ? (
            <span style={{ width: 7, height: 7, borderRadius: "2px", background: item.accent ?? "#8b5cf6", boxShadow: `0 0 8px ${item.accent ?? "#8b5cf6"}` }} />
          ) : null}
          <span>{item.label}</span>
          {item.sublabel ? <span style={{ opacity: item.kind === "workstation" ? 0.92 : 0.78, fontSize: "10px", fontWeight: 700, color: item.kind === "workstation" ? "#bae6fd" : undefined }}>{item.sublabel}</span> : null}
        </div>;
      })}
    </div>
  </>;
}
