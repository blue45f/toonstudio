import { useId, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { studioBg3dClassNames as cx } from "./studio-bg3d-editor-ui";
import { STUDIO_BG3D_PURCHASED_SURFACE_MATERIALS } from "./studio-bg3d-purchased-surface-material-catalog";
import { buildStudioBg3dSurfaceMaterialOverride } from "./studio-bg3d-surface-material-catalog";

import type { StudioBg3dMaterialOverride } from "./studio-bg3d-scene-document";
import type { StudioBg3dSurfaceMaterialEntry } from "./studio-bg3d-surface-material-catalog";

export interface StudioBg3dPurchasedSurfaceMaterialPickerProps {
  readonly disabled?: boolean;
  readonly defaultExpanded?: boolean;
  readonly selectedMaterialId?: string | null;
  readonly onSelectMaterial: (
    entry: StudioBg3dSurfaceMaterialEntry,
    override: StudioBg3dMaterialOverride,
  ) => void;
}

function PurchasedMaterialPreview({ url, label, disabled }: {
  readonly url: string;
  readonly label: string;
  readonly disabled: boolean;
}) {
  const copy = useBilingual("studio.bg3d.purchasedMaterialPreview");
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  return (
    <div className="relative size-11 shrink-0 rounded border border-line/60 bg-panel sm:size-9" aria-busy={status === "loading"}>
      {status === "failed" ? (
        <button
          type="button"
          disabled={disabled}
          aria-label={copy(`${label} 미리보기 다시 불러오기`, `Reload ${label} preview`)}
          onClick={() => setStatus("loading")}
          className="size-full rounded font-bold text-fg-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-45"
        >
          <span aria-hidden="true">↻</span>
        </button>
      ) : (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setStatus("ready")}
          onError={() => setStatus("failed")}
          className={cx("size-full rounded object-cover", status === "loading" ? "opacity-0" : "opacity-100")}
        />
      )}
    </div>
  );
}

/** 구매 원본의 해상도 선택과 적용을 분리해 선택 전에는 PBR 채널을 로드하지 않는다. */
export function StudioBg3dPurchasedSurfaceMaterialPicker({
  disabled = false,
  defaultExpanded = false,
  selectedMaterialId = null,
  onSelectMaterial,
}: StudioBg3dPurchasedSurfaceMaterialPickerProps) {
  const copy = useBilingual("studio.bg3d.purchasedSurfaceMaterials");
  const sectionId = useId();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [variantIds, setVariantIds] = useState<Readonly<Record<string, string>>>({});
  const materialCount = STUDIO_BG3D_PURCHASED_SURFACE_MATERIALS.length;
  const variantCount = STUDIO_BG3D_PURCHASED_SURFACE_MATERIALS.reduce((sum, material) => sum + material.variants.length, 0);
  const heading = copy("플라스티신 표면 재질", "Plasticine surface materials");

  return (
    <section
      aria-labelledby={`${sectionId}-heading`}
      data-testid="bg3d-purchased-surface-material-picker"
      className="rounded-xl border border-line bg-card/60 p-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h4 id={`${sectionId}-heading`} className="text-[0.68rem] font-bold text-fg">
            {heading} ({materialCount})
          </h4>
          <p className="text-[0.6rem] text-fg-3">
            {copy(`EmacEArt · ${materialCount}개 재질 · ${variantCount}개 원본 선택`, `EmacEArt · ${materialCount} materials · ${variantCount} source variants`)}
          </p>
        </div>
        <button
          type="button"
          disabled={disabled}
          aria-expanded={expanded}
          aria-controls={`${sectionId}-materials`}
          data-testid="bg3d-purchased-surface-material-toggle"
          onClick={() => setExpanded((current) => !current)}
          className="min-h-11 rounded-lg border border-line bg-panel px-2.5 text-[0.62rem] font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-45 sm:min-h-9"
        >
          {expanded ? copy("플라스티신 재질 접기", "Collapse Plasticine materials") : copy("플라스티신 재질 열기", "Browse Plasticine materials")}
        </button>
      </div>

      {expanded ? (
        <div id={`${sectionId}-materials`} className="mt-2.5 space-y-2.5 border-t border-line/70 pt-2.5">
          <p className="text-[0.6rem] text-fg-3">
            {copy("확보한 최고 해상도가 기본값입니다. 다른 원본을 고른 뒤 적용할 수 있습니다.", "The highest available resolution is selected by default. Choose another source before applying if needed.")}
          </p>
          <div className="grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {STUDIO_BG3D_PURCHASED_SURFACE_MATERIALS.map((material) => {
              const savedVariantId = material.variants.find((entry) => entry.id === selectedMaterialId)?.id;
              const variantId = variantIds[material.id] ?? savedVariantId ?? material.defaultVariantId;
              const variant = material.variants.find((entry) => entry.id === variantId);
              if (!variant) return null;
              const label = copy(material.labelKo, material.labelEn);
              const variantInputId = `${sectionId}-${material.id}-variant`;
              return (
                <fieldset key={material.id} data-testid={`bg3d-purchased-material-${material.id}`} className="min-w-0 rounded-lg border border-line bg-panel p-2">
                  <legend className="max-w-full px-1 text-[0.62rem] font-bold text-fg">{label}</legend>
                  <div className="flex items-center gap-2">
                    <PurchasedMaterialPreview url={material.previewUrl} label={label} disabled={disabled} />
                    <div className="min-w-0 flex-1">
                      <label htmlFor={variantInputId} className="mb-1 block text-[0.58rem] font-semibold text-fg-3">
                        {copy("원본 선택", "Source variant")}
                      </label>
                      <select
                        id={variantInputId}
                        aria-label={copy(`${material.labelKo} 원본 선택`, `${material.labelEn} source variant`)}
                        disabled={disabled || material.variants.length < 2}
                        value={variant.id}
                        onChange={(event) => {
                          const variantId = event.currentTarget.value;
                          setVariantIds((current) => ({ ...current, [material.id]: variantId }));
                        }}
                        className="min-h-11 w-full min-w-0 rounded border border-line bg-card px-1.5 text-[0.6rem] text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60 sm:min-h-9"
                      >
                        {material.variants.map((source) => (
                          <option key={source.id} value={source.id}>
                            {source.sourceVariant === "native-8k" ? copy("8K 원본 · 4맵", "Original 8K · 4 maps") : copy("2K Godot 원본 · 3맵", "Original Godot 2K · 3 maps")}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={copy(`${material.labelKo} 적용`, `Apply ${material.labelEn}`)}
                    aria-pressed={selectedMaterialId === variant.id}
                    onClick={() => {
                      const override = buildStudioBg3dSurfaceMaterialOverride(variant.id);
                      if (disabled || !override) return;
                      onSelectMaterial(variant, override);
                    }}
                    className={cx(
                      "mt-2 min-h-11 w-full rounded-lg border px-2 text-[0.62rem] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-45 sm:min-h-9",
                      selectedMaterialId === variant.id ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
                    )}
                  >
                    {selectedMaterialId === variant.id ? copy("적용됨", "Applied") : copy("재질 적용", "Apply material")}
                  </button>
                </fieldset>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
