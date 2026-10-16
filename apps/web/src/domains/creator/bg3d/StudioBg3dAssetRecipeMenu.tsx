import { cx, FOCUS_RING } from "./studio-bg3d-asset-panel-styles";

import type {
  StudioBg3dAssetPlacementRecipeDefinition,
  StudioBg3dAssetPlacementRecipeId,
} from "./studio-bg3d-asset-placement-recipes";

interface StudioBg3dAssetRecipeMenuProps {
  readonly id: string;
  readonly entryName: string;
  readonly recipes: readonly StudioBg3dAssetPlacementRecipeDefinition[];
  readonly disabled: boolean;
  readonly onSelect: (recipe: StudioBg3dAssetPlacementRecipeId) => void;
  readonly onEscape: () => void;
}

/** 배치 방식 목록. 버튼 하나가 곧 한 번에 배치다(포인터로 위치를 고르는 기존 "장면에 추가"와 별개). */
export function StudioBg3dAssetRecipeMenu({ id, entryName, recipes, disabled, onSelect, onEscape }: StudioBg3dAssetRecipeMenuProps) {
  return (
    <div
      id={id}
      role="group"
      aria-label="배치 방식"
      className="grid gap-1.5 border-t border-line/80 bg-panel/45 p-1.5"
    >
      {recipes.map((recipe) => (
        <button
          key={recipe.id}
          type="button"
          aria-label={`${entryName} ${recipe.label}`}
          aria-describedby={`${id}-${recipe.id}`}
          disabled={disabled}
          className={cx(
            "min-h-11 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-left transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-10",
            FOCUS_RING,
          )}
          onClick={() => onSelect(recipe.id)}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            onEscape();
          }}
        >
          <span className="block text-[0.68rem] font-bold text-fg">{recipe.label}</span>
          <span id={`${id}-${recipe.id}`} className="mt-0.5 block text-[0.62rem] leading-snug text-fg-3">
            {recipe.description}
          </span>
        </button>
      ))}
      <p className="px-1 text-[0.6rem] leading-snug text-fg-3">
        한 번에 배치되며 실행 취소로 되돌릴 수 있습니다. 모델 정면은 +Z 방향이라고 가정합니다.
      </p>
    </div>
  );
}
