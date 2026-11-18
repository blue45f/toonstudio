import { Building2, Boxes, ChevronDown, Gem, Layers, PackageOpen, Sparkles } from "lucide-react";
import { useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  STUDIO_HYBRID_DCC_MODELING_RECIPES,
  type StudioHybridDccModelingRecipeId,
} from "./studio-hybrid-dcc-modifier-workspace";
import {
  STUDIO_HYBRID_DCC_BLENDER_V13_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V14_BG_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V15_ARTISAN_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V16_LUMIERE_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V17_SALON_KIT,
  STUDIO_HYBRID_DCC_STARTER_PRIMITIVES,
  type StudioHybridDccBlenderKitItem,
  type StudioHybridDccPrecisionBgKitItem,
  type StudioHybridDccStarterPrimitiveKind,
  type StudioHybridDccStarterPrimitiveSpec,
} from "./studio-hybrid-dcc-primitives";

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const TILE_PRESS =
  "transition-[background-color,border-color,color,transform] duration-150 enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none";

const PRIMARY_STARTER_KINDS = new Set<StudioHybridDccStarterPrimitiveKind>([
  "cube",
  "bevel-box",
  "sculpt-sphere",
  "cylinder",
]);

export interface StudioHybridDccPrimitiveBarProps {
  readonly busy: boolean;
  readonly hasActiveAsset?: boolean;
  readonly onAddPrimitive: (kind: StudioHybridDccStarterPrimitiveKind, label: string) => void;
  readonly onApplyRecipe?: (recipeId: StudioHybridDccModelingRecipeId, label: string) => void;
  readonly onImportFile: (file: File) => void;
}

/**
 * 단순하고 직관적인 4종 핵심 시작 도형을 첫 화면에 두고,
 * 건축·유기체 정밀 도형(+12종), 비파괴 프로 마감 레시피(4종), Blender 5.2 정밀 배경 베이 V14(6종) 및
 * 플래그십 스타터 V13(8종)은 점진적 공개(Progressive Disclosure) 서랍으로 분리한다.
 */
export function StudioHybridDccPrimitiveBar({
  busy,
  hasActiveAsset = false,
  onAddPrimitive,
  onApplyRecipe,
  onImportFile,
}: StudioHybridDccPrimitiveBarProps) {
  const bt = useBilingual("StudioHybridDccPrimitiveBar");
  const [fetchingId, setFetchingId] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState("");

  const loadBlenderKitAsset = async (
    item: StudioHybridDccBlenderKitItem | StudioHybridDccPrecisionBgKitItem,
  ) => {
    if (busy || fetchingId) return;
    setFetchingId(item.id);
    setFetchError("");
    try {
      const response = await fetch(item.glbUrl);
      if (!response.ok) {
        throw new Error(
          bt(
            `스타터 에셋을 불러오지 못했습니다 (${response.status}).`,
            `Could not load starter asset (${response.status}).`,
          ),
        );
      }
      const bytes = await response.arrayBuffer();
      const file = new File([bytes], item.fileName, { type: "model/gltf-binary" });
      onImportFile(file);
    } catch (error) {
      setFetchError(
        error instanceof Error
          ? error.message
          : bt("스타터 에셋 로드에 실패했습니다.", "Failed to load the starter asset."),
      );
    } finally {
      setFetchingId(null);
    }
  };

  const disabled = busy || fetchingId !== null;
  const primarySpecs = STUDIO_HYBRID_DCC_STARTER_PRIMITIVES.filter((s) =>
    PRIMARY_STARTER_KINDS.has(s.kind),
  );
  const extendedSpecs = STUDIO_HYBRID_DCC_STARTER_PRIMITIVES.filter(
    (s) => !PRIMARY_STARTER_KINDS.has(s.kind),
  );

  const renderPrimitiveButton = (spec: StudioHybridDccStarterPrimitiveSpec) => {
    const label = bt(spec.label[0], spec.label[1]);
    return (
      <button
        key={spec.kind}
        type="button"
        disabled={disabled}
        data-studio-hybrid-dcc-primitive={spec.kind}
        onClick={() => onAddPrimitive(spec.kind, `${label} 추가`)}
        className={cn(
          "flex min-h-11 min-w-0 flex-col items-start justify-center rounded-lg border border-line bg-card px-2.5 py-1.5 text-left hover:border-accent/45 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-45 [word-break:keep-all]",
          TILE_PRESS,
          FOCUS_RING,
        )}
      >
        <span className="max-w-full truncate text-xs font-semibold text-fg">{label}</span>
        <span className="max-w-full truncate text-[0.65rem] text-fg-3">{bt(spec.hint[0], spec.hint[1])}</span>
      </button>
    );
  };

  const renderKitItemButton = (
    item: StudioHybridDccBlenderKitItem | StudioHybridDccPrecisionBgKitItem,
  ) => {
    const loading = fetchingId === item.id;
    return (
      <button
        key={item.id}
        type="button"
        disabled={disabled}
        data-studio-hybrid-dcc-kit-item={item.id}
        onClick={() => {
          void loadBlenderKitAsset(item);
        }}
        className={cn(
          "flex min-h-11 w-full items-center gap-2.5 rounded-lg border border-line bg-card p-2 text-left hover:border-accent/45 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-45 [word-break:keep-all]",
          TILE_PRESS,
          FOCUS_RING,
        )}
      >
        <img
          src={item.previewUrl}
          alt=""
          loading="lazy"
          width={40}
          height={40}
          className="size-10 shrink-0 rounded-md bg-canvas object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-fg">
            {loading ? bt("불러오는 중…", "Loading…") : bt(item.label[0], item.label[1])}
          </span>
          <span className="block truncate text-[0.65rem] tabular-nums text-fg-3">
            {bt(item.hint[0], item.hint[1])} · {item.triangles.toLocaleString("ko-KR")} tris
          </span>
        </span>
      </button>
    );
  };

  return (
    <section
      aria-label={bt("빠른 도형·마감 레시피·스타터 에셋", "Quick primitives, finish recipes & starter assets")}
      data-studio-hybrid-dcc-primitive-bar="true"
      className="rounded-2xl border border-line bg-panel p-2.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5 pb-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg-2 [word-break:keep-all]">
          <Boxes size={14} aria-hidden="true" className="shrink-0 text-accent" />
          {bt("빠른 도형 시작", "Quick shapes")}
        </span>
        <span className="rounded-full bg-raised px-2 py-0.5 text-[0.65rem] font-medium text-fg-3">
          {bt("수밀 솔리드 · Ctrl+Z 복원", "Watertight · Undoable")}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">{primarySpecs.map(renderPrimitiveButton)}</div>

      <details className="group mt-2 rounded-xl border border-line/70 bg-canvas/35">
        <summary
          className={cn(
            "flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-fg-2 hover:bg-raised/45 [&::-webkit-details-marker]:hidden",
            FOCUS_RING,
          )}
        >
          <span className="inline-flex min-w-0 items-center gap-1.5 [word-break:keep-all]">
            <Layers size={14} aria-hidden="true" className="shrink-0 text-fg-3 group-open:text-accent" />
            <span className="truncate">
              {bt(
                `건축·유기체 정밀 도형 (+${extendedSpecs.length}종)`,
                `Architectural & organic (+${extendedSpecs.length})`,
              )}
            </span>
          </span>
          <ChevronDown
            size={14}
            aria-hidden="true"
            className="shrink-0 text-fg-3 transition-transform duration-150 group-open:rotate-180 group-open:text-accent motion-reduce:transition-none"
          />
        </summary>
        <div className="grid grid-cols-2 gap-1.5 border-t border-line/60 p-2">
          {extendedSpecs.map(renderPrimitiveButton)}
        </div>
      </details>

      {onApplyRecipe ? (
        <details className="group mt-1.5 rounded-xl border border-line/70 bg-canvas/35">
          <summary
            className={cn(
              "flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-fg-2 hover:bg-raised/45 [&::-webkit-details-marker]:hidden",
              FOCUS_RING,
            )}
          >
            <span className="inline-flex min-w-0 items-center gap-1.5 [word-break:keep-all]">
              <Sparkles size={14} aria-hidden="true" className="shrink-0 text-accent" />
              <span className="truncate">
                {bt(
                  `프로 비파괴 마감 레시피 (${STUDIO_HYBRID_DCC_MODELING_RECIPES.length}종)`,
                  `Pro finishes (${STUDIO_HYBRID_DCC_MODELING_RECIPES.length})`,
                )}
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-[0.65rem] font-normal text-fg-3 group-open:text-accent">
              {hasActiveAsset ? bt("원클릭", "Ready") : bt("선택 필요", "Select")}
              <ChevronDown
                size={14}
                aria-hidden="true"
                className="shrink-0 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
              />
            </span>
          </summary>
          <div className="grid grid-cols-2 gap-1.5 border-t border-line/60 p-2">
            {STUDIO_HYBRID_DCC_MODELING_RECIPES.map((recipe) => {
              const label = bt(recipe.label[0], recipe.label[1]);
              return (
                <button
                  key={recipe.id}
                  type="button"
                  disabled={disabled || !hasActiveAsset}
                  data-studio-hybrid-dcc-recipe={recipe.id}
                  onClick={() => onApplyRecipe(recipe.id, `${label} 레시피 적용`)}
                  className={cn(
                    "flex min-h-11 min-w-0 flex-col items-start justify-center rounded-lg border border-line bg-card px-2.5 py-1.5 text-left hover:border-accent/45 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-45 [word-break:keep-all]",
                    TILE_PRESS,
                    FOCUS_RING,
                  )}
                >
                  <span className="max-w-full truncate text-xs font-semibold text-fg">{label}</span>
                  <span className="max-w-full truncate text-[0.65rem] text-fg-3">
                    {bt(recipe.hint[0], recipe.hint[1])}
                  </span>
                </button>
              );
            })}
          </div>
        </details>
      ) : null}

      <details className="group mt-1.5 rounded-xl border border-line/70 bg-canvas/35">
        <summary
          data-testid="studio-hybrid-dcc-v17-salon-kit-summary"
          className={cn(
            "flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-fg-2 hover:bg-raised/45 [&::-webkit-details-marker]:hidden",
            FOCUS_RING,
          )}
        >
          <span className="inline-flex min-w-0 items-center gap-1.5 [word-break:keep-all]">
            <Gem size={14} aria-hidden="true" className="shrink-0 text-accent" />
            <span className="truncate">
              {bt(
                `블렌더 5.3 뤼미에르 살롱 V17 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V17_SALON_KIT.length}종)`,
                `Blender 5.3 Lumiere salon V17 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V17_SALON_KIT.length})`,
              )}
            </span>
          </span>
          <ChevronDown
            size={14}
            aria-hidden="true"
            className="shrink-0 text-fg-3 transition-transform duration-150 group-open:rotate-180 group-open:text-accent motion-reduce:transition-none"
          />
        </summary>
        <div className="max-h-80 space-y-1.5 overflow-y-auto overscroll-contain border-t border-line/60 p-2">
          {STUDIO_HYBRID_DCC_BLENDER_V17_SALON_KIT.map(renderKitItemButton)}
        </div>
      </details>

      <details className="group mt-1.5 rounded-xl border border-line/70 bg-canvas/35">
        <summary
          data-testid="studio-hybrid-dcc-v16-lumiere-kit-summary"
          className={cn(
            "flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-fg-2 hover:bg-raised/45 [&::-webkit-details-marker]:hidden",
            FOCUS_RING,
          )}
        >
          <span className="inline-flex min-w-0 items-center gap-1.5 [word-break:keep-all]">
            <Gem size={14} aria-hidden="true" className="shrink-0 text-accent" />
            <span className="truncate">
              {bt(
                `블렌더 5.3 뤼미에르 아틀리에 V16 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V16_LUMIERE_KIT.length}종)`,
                `Blender 5.3 Lumiere atelier V16 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V16_LUMIERE_KIT.length})`,
              )}
            </span>
          </span>
          <ChevronDown
            size={14}
            aria-hidden="true"
            className="shrink-0 text-fg-3 transition-transform duration-150 group-open:rotate-180 group-open:text-accent motion-reduce:transition-none"
          />
        </summary>
        <div className="max-h-80 space-y-1.5 overflow-y-auto overscroll-contain border-t border-line/60 p-2">
          {STUDIO_HYBRID_DCC_BLENDER_V16_LUMIERE_KIT.map(renderKitItemButton)}
        </div>
      </details>

      <details className="group mt-1.5 rounded-xl border border-line/70 bg-canvas/35">
        <summary
          data-testid="studio-hybrid-dcc-v14-bg-kit-summary"
          className={cn(
            "flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-fg-2 hover:bg-raised/45 [&::-webkit-details-marker]:hidden",
            FOCUS_RING,
          )}
        >
          <span className="inline-flex min-w-0 items-center gap-1.5 [word-break:keep-all]">
            <Building2 size={14} aria-hidden="true" className="shrink-0 text-accent" />
            <span className="truncate">
              {bt(
                `정밀 웹툰 배경 베이 V14 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V14_BG_KIT.length}종)`,
                `Precision webtoon BG bays V14 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V14_BG_KIT.length})`,
              )}
            </span>
          </span>
          <ChevronDown
            size={14}
            aria-hidden="true"
            className="shrink-0 text-fg-3 transition-transform duration-150 group-open:rotate-180 group-open:text-accent motion-reduce:transition-none"
          />
        </summary>
        <div className="max-h-80 space-y-1.5 overflow-y-auto overscroll-contain border-t border-line/60 p-2">
          {STUDIO_HYBRID_DCC_BLENDER_V14_BG_KIT.map(renderKitItemButton)}
        </div>
      </details>

      <details className="group mt-1.5 rounded-xl border border-line/70 bg-canvas/35">
        <summary
          data-testid="studio-hybrid-dcc-v15-artisan-kit-summary"
          className={cn(
            "flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-fg-2 hover:bg-raised/45 [&::-webkit-details-marker]:hidden",
            FOCUS_RING,
          )}
        >
          <span className="inline-flex min-w-0 items-center gap-1.5 [word-break:keep-all]">
            <Sparkles size={14} aria-hidden="true" className="shrink-0 text-accent" />
            <span className="truncate">
              {bt(
                `아티잔 아틀리에 V15 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V15_ARTISAN_KIT.length}종)`,
                `Artisan atelier V15 (CC0 · ${STUDIO_HYBRID_DCC_BLENDER_V15_ARTISAN_KIT.length})`,
              )}
            </span>
          </span>
          <ChevronDown
            size={14}
            aria-hidden="true"
            className="shrink-0 text-fg-3 transition-transform duration-150 group-open:rotate-180 group-open:text-accent motion-reduce:transition-none"
          />
        </summary>
        <div className="max-h-80 space-y-1.5 overflow-y-auto overscroll-contain border-t border-line/60 p-2">
          {STUDIO_HYBRID_DCC_BLENDER_V15_ARTISAN_KIT.map(renderKitItemButton)}
        </div>
      </details>

      <details className="group mt-1.5 rounded-xl border border-line/70 bg-canvas/35">
        <summary
          className={cn(
            "flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-fg-2 hover:bg-raised/45 [&::-webkit-details-marker]:hidden",
            FOCUS_RING,
          )}
        >
          <span className="inline-flex min-w-0 items-center gap-1.5 [word-break:keep-all]">
            <PackageOpen size={14} aria-hidden="true" className="shrink-0 text-fg-3 group-open:text-accent" />
            <span className="truncate">
              {bt(
                "플래그십 스타터 모델 (CC0 · 8종)",
                "Flagship starter models (CC0 · 8)",
              )}
            </span>
          </span>
          <ChevronDown
            size={14}
            aria-hidden="true"
            className="shrink-0 text-fg-3 transition-transform duration-150 group-open:rotate-180 group-open:text-accent motion-reduce:transition-none"
          />
        </summary>
        <div className="max-h-80 space-y-1.5 overflow-y-auto overscroll-contain border-t border-line/60 p-2">
          {STUDIO_HYBRID_DCC_BLENDER_V13_KIT.map(renderKitItemButton)}
        </div>
      </details>

      {fetchError ? (
        <p role="alert" className="mt-1.5 px-1 text-xs text-bad">
          {fetchError}
        </p>
      ) : null}
    </section>
  );
}
