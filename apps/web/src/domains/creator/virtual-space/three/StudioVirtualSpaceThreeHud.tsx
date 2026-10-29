import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { getOverlayBadgeStyle, type ProjectedOverlayItem, type StudioThreeLightingPreset } from "./studio-virtual-space-three-dioramas";

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
      style={{ position: "absolute", right: 76, bottom: 16, zIndex: 3, display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 8px", borderRadius: 999, background: "rgba(15, 23, 42, 0.84)", border: "1px solid rgba(148, 163, 184, 0.32)", backdropFilter: "blur(10px)" }}
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
        style={{ border: "none", borderRadius: 999, padding: "3px 9px", fontSize: 11, fontWeight: 700, cursor: "pointer", color: lightingPreset === option.id ? "#0f172a" : "#e2e8f0", background: lightingPreset === option.id ? "#38bdf8" : "transparent" }}
      >{bt(option.ko, option.en)}</button>)}
      <button
        type="button"
        onClick={onResetCamera}
        style={{ border: "1px solid rgba(148, 163, 184, 0.35)", borderRadius: 999, padding: "3px 9px", fontSize: 11, fontWeight: 700, cursor: "pointer", color: "#bae6fd", background: "rgba(30, 41, 59, 0.72)" }}
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
