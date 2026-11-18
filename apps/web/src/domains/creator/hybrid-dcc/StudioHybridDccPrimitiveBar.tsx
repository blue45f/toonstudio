import {
  Boxes,
  ChevronDown,
  Layers,
  SlidersHorizontal,
} from "lucide-react";
import { useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { inspectGlbBinaryEvidence } from "../bg3d/studio-bg3d-glb-binary-vrm-guard";
import { StudioHybridDccCustomPrimitiveForm } from "./StudioHybridDccCustomPrimitiveForm";
import type { CustomPrimitive } from "./studio-hybrid-dcc-custom-primitive";
import { StudioHybridDccBlenderKitDrawers } from "./StudioHybridDccBlenderKitDrawers";
import {
  STUDIO_HYBRID_DCC_MODELING_RECIPES,
  type StudioHybridDccModelingRecipeId,
} from "./studio-hybrid-dcc-modifier-workspace";
import {
  STUDIO_HYBRID_DCC_STARTER_PRIMITIVES,
  type StudioHybridDccBlenderKitItem,
  type StudioHybridDccPrecisionBgKitItem,
  type StudioHybridDccStarterPrimitiveKind,
  type StudioHybridDccStarterPrimitiveSpec,
} from "./studio-hybrid-dcc-primitives";

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const TILE_PRESS =
  "transition-[background-color,border-color,color,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none";

const PRIMARY_STARTER_KINDS = new Set<StudioHybridDccStarterPrimitiveKind>([
  "cube",
  "bevel-box",
  "sculpt-sphere",
  "cylinder",
]);

export interface StudioHybridDccPrimitiveBarProps {
  readonly busy: boolean;
  readonly hasActiveAsset?: boolean;
  readonly onAddPrimitive: (
    kind: StudioHybridDccStarterPrimitiveKind | CustomPrimitive,
    label: string,
  ) => void;
  readonly onApplyRecipe?: (
    recipeId: StudioHybridDccModelingRecipeId,
    label: string,
  ) => void;
  readonly onImportFile: (file: File) => void;
}

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
      const binaryEvidence = inspectGlbBinaryEvidence(new Uint8Array(bytes));
      if (!binaryEvidence.validGlb20) {
        throw new Error(
          bt(
            `GLB 2.0 바이너리 무결성 검증 실패 (${binaryEvidence.unknownGaps[0] ?? "손상된 헤더"}).`,
            `GLB 2.0 binary verification failed (${binaryEvidence.unknownGaps[0] ?? "invalid header"}).`,
          ),
        );
      }
      const file = new File([bytes], item.fileName, {
        type: "model/gltf-binary",
      });
      onImportFile(file);
    } catch (error) {
      setFetchError(
        error instanceof Error
          ? error.message
          : bt(
              "스타터 에셋 로드에 실패했습니다.",
              "Failed to load the starter asset.",
            ),
      );
    } finally {
      setFetchingId(null);
    }
  };

  const disabled = busy || fetchingId !== null;
  const busyReason = disabled
    ? bt(
        "진행 중인 에셋 작업을 마친 뒤 선택할 수 있습니다",
        "Wait for the current asset operation to finish",
      )
    : undefined;
  const recipeDisabledReason = !hasActiveAsset
    ? bt(
        "먼저 도형이나 에셋을 하나 선택한 뒤 마감 레시피를 적용하세요",
        "Select a shape or asset before applying a finish recipe",
      )
    : busyReason;

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
        title={busyReason}
        data-studio-hybrid-dcc-primitive={spec.kind}
        onClick={() => onAddPrimitive(spec.kind, bt(`${label} 추가`, `Add ${label}`))}
        className={cn(
          "flex min-h-11 min-w-0 flex-col items-start justify-center rounded-lg border border-line bg-card px-3 py-2 text-left leading-[1.4] hover:border-accent/45 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-45 [word-break:keep-all]",
          TILE_PRESS,
          FOCUS_RING,
        )}
      >
        <span className="max-w-full truncate text-xs font-medium text-fg">
          {label}
        </span>
        <span className="max-w-full truncate text-xs text-fg-3">
          {bt(spec.hint[0], spec.hint[1])}
        </span>
      </button>
    );
  };

  return (
    <section
      aria-label={bt(
        "빠른 도형·마감 레시피·스타터 에셋",
        "Quick primitives, finish recipes & starter assets",
      )}
      data-studio-hybrid-dcc-primitive-bar="true"
      className="space-y-2 rounded-2xl border border-line bg-panel p-3 leading-[1.4] [word-break:keep-all]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-fg">
          <Boxes
            size={16}
            strokeWidth={1.5}
            aria-hidden="true"
            className="shrink-0 text-fg-2"
          />
          {bt("빠른 도형 시작", "Quick shapes")}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {primarySpecs.map(renderPrimitiveButton)}
      </div>

      <StudioHybridDccCustomPrimitiveForm disabled={disabled} onAdd={onAddPrimitive} />

      <details className="group rounded-xl border border-line bg-canvas/35">
        <summary
          className={cn(
            "flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-medium text-fg-2 hover:bg-raised/45 [&::-webkit-details-marker]:hidden",
            FOCUS_RING,
          )}
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            <Layers
              size={16}
              strokeWidth={1.5}
              aria-hidden="true"
              className="shrink-0 text-fg-3 group-open:text-fg"
            />
            <span className="truncate tabular-nums">
              {bt(
                `건축·유기체 정밀 도형 (+${extendedSpecs.length}종)`,
                `Architectural & organic (+${extendedSpecs.length})`,
              )}
            </span>
          </span>
          <ChevronDown
            size={16}
            strokeWidth={1.5}
            aria-hidden="true"
            className="shrink-0 text-fg-3 transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <div className="grid grid-cols-2 gap-2 border-t border-line p-2">
          {extendedSpecs.map(renderPrimitiveButton)}
        </div>
      </details>

      {onApplyRecipe ? (
        <details className="group rounded-xl border border-line bg-canvas/35">
          <summary
            className={cn(
              "flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-medium text-fg-2 hover:bg-raised/45 [&::-webkit-details-marker]:hidden",
              FOCUS_RING,
            )}
          >
            <span className="inline-flex min-w-0 items-center gap-2">
              <SlidersHorizontal
                size={16}
                strokeWidth={1.5}
                aria-hidden="true"
                className="shrink-0 text-fg-3 group-open:text-fg"
              />
              <span className="truncate tabular-nums">
                {bt(
                  `프로 비파괴 마감 레시피 (${STUDIO_HYBRID_DCC_MODELING_RECIPES.length}종)`,
                  `Pro finishes (${STUDIO_HYBRID_DCC_MODELING_RECIPES.length})`,
                )}
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 font-mono text-xs text-fg-3">
              {hasActiveAsset ? bt("원클릭", "Ready") : bt("선택 필요", "Select")}
              <ChevronDown
                size={16}
                strokeWidth={1.5}
                aria-hidden="true"
                className="shrink-0 transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] group-open:rotate-180 motion-reduce:transition-none"
              />
            </span>
          </summary>
          <div className="grid grid-cols-2 gap-2 border-t border-line p-2">
            {STUDIO_HYBRID_DCC_MODELING_RECIPES.map((recipe) => {
              const label = bt(recipe.label[0], recipe.label[1]);
              const isRecipeDisabled = disabled || !hasActiveAsset;
              return (
                <button
                  key={recipe.id}
                  type="button"
                  disabled={isRecipeDisabled}
                  title={isRecipeDisabled ? recipeDisabledReason : undefined}
                  data-studio-hybrid-dcc-recipe={recipe.id}
                  onClick={() =>
                    onApplyRecipe(recipe.id, `${label} 레시피 적용`)
                  }
                  className={cn(
                    "flex min-h-11 min-w-0 flex-col items-start justify-center rounded-lg border border-line bg-card px-3 py-2 text-left leading-[1.4] hover:border-accent/45 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-45 [word-break:keep-all]",
                    TILE_PRESS,
                    FOCUS_RING,
                  )}
                >
                  <span className="max-w-full truncate text-xs font-medium text-fg">
                    {label}
                  </span>
                  <span className="max-w-full truncate text-xs text-fg-3">
                    {bt(recipe.hint[0], recipe.hint[1])}
                  </span>
                </button>
              );
            })}
          </div>
        </details>
      ) : null}

      <StudioHybridDccBlenderKitDrawers
        disabled={disabled}
        disabledReason={busyReason}
        fetchingId={fetchingId}
        onSelectKitItem={(item) => {
          void loadBlenderKitAsset(item);
        }}
      />

      {fetchError ? (
        <p role="alert" className="px-1 text-xs text-bad">
          {fetchError}
        </p>
      ) : null}
    </section>
  );
}
