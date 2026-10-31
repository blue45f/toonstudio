import { useMemo, useState } from "react";

import {
  Studio3DMaterialSystem,
  type MaterialType,
} from "../scene-3d/studio-3d-material-system";
import {
  STYLIZED_SHADER_PRESETS,
  type StylizedShaderKind,
  type StylizedShaderPreset,
} from "../scene-3d/studio-3d-matcap-shader-system";
import {
  STUDIO_VRM_MTOON_PRESETS,
  isStudioVrmMtoonLineArtPreset,
  type StudioVrmMtoonPreset,
} from "../vrm/studio-vrm-mtoon-presets";
import { StudioBg3dCc0SurfaceMaterialPicker } from "./StudioBg3dCc0SurfaceMaterialPicker";

import type { StudioBg3dMaterialOverride } from "./studio-bg3d-scene-document";
import type { StudioBg3dSurfaceMaterialEntry } from "./studio-bg3d-surface-material-catalog";

export interface StudioBg3dMatCapStudioPanelProps {
  readonly onApplyShader?: (preset: StylizedShaderPreset) => void;
  readonly onApplyCc0SurfaceMaterial?: (
    entry: StudioBg3dSurfaceMaterialEntry,
    override: StudioBg3dMaterialOverride,
  ) => void;
  readonly onApplyMtoonPreset?: (preset: StudioVrmMtoonPreset) => void;
  readonly disabled?: boolean;
}

export function StudioBg3dMatCapStudioPanel({
  onApplyShader,
  onApplyCc0SurfaceMaterial,
  onApplyMtoonPreset,
  disabled = false,
}: StudioBg3dMatCapStudioPanelProps) {
  const [activeCategory, setActiveCategory] = useState<"all" | "toon" | "clay" | "material" | "special">("all");
  const [selectedPresetId, setSelectedPresetId] = useState<StylizedShaderKind>("anime-cel-toon");
  const [selectedMtoonPresetId, setSelectedMtoonPresetId] = useState<string>("clean-line");
  const [selectedShotMaterialType, setSelectedShotMaterialType] = useState<MaterialType>("toon-flat");

  const presetList = Object.values(STYLIZED_SHADER_PRESETS).filter(
    (p) => activeCategory === "all" || p.category === activeCategory
  );

  const selectedPreset = STYLIZED_SHADER_PRESETS[selectedPresetId];
  const selectedMtoonPreset =
    STUDIO_VRM_MTOON_PRESETS.find((item) => item.id === selectedMtoonPresetId) ??
    STUDIO_VRM_MTOON_PRESETS[1]!;

  const toonMaterialPresets = useMemo(() => Studio3DMaterialSystem.getToonPresets(), []);
  const shotMaterialPreview = useMemo(() => {
    const sys = new Studio3DMaterialSystem();
    const created = sys.createMaterial("컷 전용 재질", selectedShotMaterialType);
    sys.addOverride({
      materialId: created.id,
      shotId: "shot-01",
      patches: { outlineWidth: 1.8, shadowBands: selectedPreset?.shadowSteps ?? 2 },
    });
    return sys.resolveMaterialForShot(created.id, "shot-01");
  }, [selectedShotMaterialType, selectedPreset]);

  const handleSelect = (preset: StylizedShaderPreset) => {
    setSelectedPresetId(preset.id);
    onApplyShader?.(preset);
  };

  return (
    <div className="flex flex-col gap-3 p-3 text-xs text-fg">
      {/* Category Tabs */}
      <div className="grid grid-cols-4 gap-1 rounded-lg border border-line bg-card p-1">
        {[
          { id: "all" as const, label: "전체" },
          { id: "toon" as const, label: "툰·셀" },
          { id: "clay" as const, label: "클레이" },
          { id: "material" as const, label: "PBR·유리" },
        ].map((cat) => (
          <button
            key={cat.id}
            type="button"
            disabled={disabled}
            onClick={() => setActiveCategory(cat.id)}
            className={`rounded-md py-1 text-[0.65rem] font-bold transition-all ${
              activeCategory === cat.id
                ? "bg-raised text-fg shadow-sm border border-line"
                : "text-fg-3 hover:text-fg"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Preset Grid */}
      <div className="grid grid-cols-2 gap-1.5">
        {presetList.map((preset) => {
          const isSelected = selectedPresetId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              onClick={() => handleSelect(preset)}
              className={`flex flex-col gap-1 rounded-lg border p-2 text-left transition-all ${
                isSelected
                  ? "border-accent bg-accent/15 text-accent shadow-sm"
                  : "border-line bg-card text-fg hover:bg-raised"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="truncate text-[0.68rem] font-bold">{preset.name.split(" ")[0]}</span>
                <span
                  className="size-3 rounded-full border border-line"
                  style={{ backgroundColor: preset.baseColor }}
                />
              </div>
              <span className="truncate text-[0.6rem] text-fg-3">{preset.description}</span>
            </button>
          );
        })}
      </div>

      {/* Selected Shader Properties */}
      {selectedPreset && (
        <div className="flex flex-col gap-2 rounded-lg border border-line/70 bg-card p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[0.68rem] font-bold text-fg">{selectedPreset.name}</span>
            <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[0.6rem] font-semibold text-accent">
              {selectedPreset.category.toUpperCase()}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-line/50 pt-2 text-[0.65rem]">
            <div className="flex items-center justify-between">
              <span className="text-fg-3">음영 단계:</span>
              <span className="font-mono font-bold text-fg">{selectedPreset.shadowSteps}단 Step</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-fg-3">림라이트:</span>
              <span className="font-mono font-bold text-fg">{selectedPreset.rimLightIntensity}x</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-fg-3">투과도 (Glass):</span>
              <span className="font-mono font-bold text-fg">
                {Math.round(selectedPreset.transmission * 100)}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-fg-3">금속도 / 거칠기:</span>
              <span className="font-mono font-bold text-fg">
                {selectedPreset.metalness} / {selectedPreset.roughness}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* VRM MToon LT Line-Art Presets & Shot Material Override */}
      <div
        className="flex flex-col gap-2 rounded-lg border border-line/70 bg-card p-2.5"
        data-testid="bg3d-mtoon-lt-preset-section"
      >
        <div className="flex items-center justify-between">
          <span className="text-[0.68rem] font-bold text-fg">
            LT 선화 최적화 MToon 프리셋 ({STUDIO_VRM_MTOON_PRESETS.length}종) & 샷 재질 오버라이드
          </span>
          <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[0.6rem] font-semibold text-accent">
            {isStudioVrmMtoonLineArtPreset(selectedMtoonPreset) ? "LT 선화 적합" : "연출용 림"}
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {STUDIO_VRM_MTOON_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              data-testid={`bg3d-mtoon-preset-${preset.id}`}
              onClick={() => {
                setSelectedMtoonPresetId(preset.id);
                onApplyMtoonPreset?.(preset);
              }}
              className={`rounded border px-2 py-0.5 text-[0.64rem] transition-all ${
                selectedMtoonPresetId === preset.id
                  ? "border-accent bg-accent/15 font-bold text-accent"
                  : "border-line bg-raised/60 text-fg-2 hover:text-fg"
              }`}
            >
              {preset.emoji} {preset.label}
            </button>
          ))}
        </div>
        <p className="text-[0.62rem] leading-relaxed text-fg-3" data-testid="bg3d-mtoon-lt-note">
          {selectedMtoonPreset.ltNote}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-1 border-t border-line/50 pt-1.5 text-[0.62rem] text-fg-3">
          <span>
            샷 오버라이드 ({toonMaterialPresets.length}종):{" "}
            <strong className="text-fg">{shotMaterialPreview?.type}</strong>
          </span>
          <div className="flex gap-1">
            {(["toon-flat", "mtoon", "pbr", "unlit"] as const).map((matType) => (
              <button
                key={matType}
                type="button"
                disabled={disabled}
                onClick={() => setSelectedShotMaterialType(matType)}
                className={`rounded border px-1.5 py-0.5 font-mono text-[0.6rem] ${
                  selectedShotMaterialType === matType
                    ? "border-accent bg-accent/15 font-bold text-accent"
                    : "border-line bg-raised text-fg-3"
                }`}
              >
                {matType}
              </button>
            ))}
          </div>
        </div>
      </div>

      <StudioBg3dCc0SurfaceMaterialPicker
        disabled={disabled}
        onSelectMaterial={(entry, override) => {
          onApplyCc0SurfaceMaterial?.(entry, override);
        }}
      />
    </div>
  );
}
