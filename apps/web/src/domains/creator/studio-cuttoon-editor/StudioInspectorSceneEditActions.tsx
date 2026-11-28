import { Boxes, Sparkles } from "lucide-react";
import { useId } from "react";

import { preloadStudioBackground3D } from "../studio-background-3d-loader";
import { parseStudio3dTool } from "../studio-background-3d-metadata";

import type { StudioBg3dSceneDocument } from "../contracts/studio-bg3d-scene-document";
import type { El, ImageEl } from "../studio-element-model";
import type { StudioInspectorInteractionGate } from "../studio-inspector-interaction-policy";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

interface Props {
  readonly active: boolean;
  readonly selected: El | null;
  readonly gate: StudioInspectorInteractionGate;
  readonly selectedBg3dEditSource: {
    readonly scene?: StudioBg3dSceneDocument;
    readonly legacyDataUrl?: string;
  } | null;
  readonly onEditVrmElement: (element: ImageEl) => void;
  readonly setBg3dInitialScene: (scene: StudioBg3dSceneDocument | undefined) => void;
  readonly setBg3dInitialDataUrl: (url: string | undefined) => void;
  readonly setBg3dInitialElementId: (id: string | undefined) => void;
  readonly setBg3dOpen: (open: boolean) => void;
}

const sceneActionClass = buttonClass({
  size: "sm",
  variant: "solid",
  className: "h-auto min-h-11 w-full justify-start gap-2 whitespace-normal px-3 py-2 text-start font-semibold",
});

export function StudioInspectorSceneEditActions({
  active,
  selected,
  gate,
  selectedBg3dEditSource,
  onEditVrmElement,
  setBg3dInitialScene,
  setBg3dInitialDataUrl,
  setBg3dInitialElementId,
  setBg3dOpen,
}: Props) {
  const bt = useBilingual("StudioInspectorSceneEditActions");
  const reasonId = useId();
  if (!active || selected?.type !== "image") return null;
  const canEditVrm = Boolean(selected.vrmScene || parseStudio3dTool(selected.src) === "vrm-poser");
  if (!canEditVrm && !selectedBg3dEditSource) return null;
  const unavailableReason = gate.disabled ? gate.reason : undefined;

  return (
    <fieldset
      disabled={gate.disabled}
      title={unavailableReason}
      aria-describedby={unavailableReason ? reasonId : undefined}
      data-studio-inspector-primary-scene-actions="true"
      className="m-0 grid min-w-0 shrink-0 gap-1.5 border-0 p-0"
    >
      <legend className="sr-only">{bt("3D 원본 편집", "Edit 3D source")}</legend>
      {canEditVrm && (
        <button
          type="button"
          onClick={() => onEditVrmElement(selected)}
          data-inspector-control-id="selection.edit-vrm"
          data-inspector-priority="essential"
          className={sceneActionClass}
        >
          <Sparkles size={14} className="shrink-0" aria-hidden />
          {bt("3D 캐릭터 재편집", "Edit 3D character")}
        </button>
      )}
      {selectedBg3dEditSource && (
        <button
          type="button"
          onClick={() => {
            setBg3dInitialScene(selectedBg3dEditSource.scene);
            setBg3dInitialDataUrl(selectedBg3dEditSource.legacyDataUrl);
            setBg3dInitialElementId(selected.id);
            setBg3dOpen(true);
          }}
          onPointerEnter={preloadStudioBackground3D}
          onPointerDown={preloadStudioBackground3D}
          onFocus={preloadStudioBackground3D}
          data-studio-bg3d-launcher={gate.disabled ? undefined : "true"}
          data-inspector-control-id="selection.edit-bg3d"
          data-inspector-priority="essential"
          className={sceneActionClass}
        >
          <Boxes size={14} className="shrink-0" aria-hidden />
          {bt("3D 배경 재편집", "Edit 3D background")}
        </button>
      )}
      {unavailableReason && (
        <p id={reasonId} className="px-1 text-xs text-fg-2">{unavailableReason}</p>
      )}
    </fieldset>
  );
}
