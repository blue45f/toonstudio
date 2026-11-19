import { useState } from "react";
import {
  BG_SCENE_TEMPLATE_CATEGORIES,
  BG_SCENE_TEMPLATE_CATEGORY_LABELS,
  BG_SCENE_TEMPLATES,
} from "../studio-background-3d-scene-templates";
import type { StudioBg3dSceneChoice } from "./studio-bg3d-assistant-location";
import { ScenePresetCard } from "./StudioBg3dSceneAssistantChrome";
import { STUDIO_BG3D_ASSISTANT_SCENES } from "./studio-bg3d-scene-assistant";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

interface Props {
  readonly selectedTemplateId: string | null;
  readonly busy: boolean;
  readonly hasScene: boolean;
  readonly onSelect: (choice: StudioBg3dSceneChoice) => void;
}

export function StudioBg3dAssistantScenePicker({ selectedTemplateId, busy, hasScene, onSelect }: Props) {
  const bt = useBilingual("StudioBg3dAssistantScenePicker");
  const [browsedId, setBrowsedId] = useState(selectedTemplateId ?? "");
  const template = BG_SCENE_TEMPLATES.find((entry) => entry.id === browsedId);
  const catalogLabel = bt("모든 공간", "All locations");
  const apply = () => {
    if (!template || busy) return;
    const featured = STUDIO_BG3D_ASSISTANT_SCENES.find((entry) => entry.templateId === template.id);
    onSelect(featured ?? { templateId: template.id, title: template.label });
  };

  return (
    <section aria-labelledby="scene-assistant-scene-title">
      <div className="scene-assistant__section-title">
        <h4 id="scene-assistant-scene-title">장면 프리셋</h4>
        {hasScene ? <span>선택하면 현재 장면을 바꿉니다</span> : <span>선택 즉시 3D 장면을 구성합니다</span>}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-panel px-2 text-sm text-fg"
          aria-label={catalogLabel}
          value={browsedId}
          disabled={busy}
          onChange={(event) => setBrowsedId(event.currentTarget.value)}
        >
          <option value="">{catalogLabel} ({BG_SCENE_TEMPLATES.length})</option>
          {BG_SCENE_TEMPLATE_CATEGORIES.map((category) => (
            <optgroup key={category} label={BG_SCENE_TEMPLATE_CATEGORY_LABELS[category]}>
              {BG_SCENE_TEMPLATES.filter((entry) => entry.category === category).map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-sm font-medium text-fg disabled:text-fg-3"
          disabled={!template || busy} onClick={apply}>
          {bt("공간 적용", "Apply location")}
        </button>
      </div>
      <div className="scene-assistant__scene-grid">
        {STUDIO_BG3D_ASSISTANT_SCENES.map((preset) => (
          <ScenePresetCard key={preset.id} preset={preset} selected={selectedTemplateId === preset.templateId}
            disabled={busy} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}
