import { cx, FOCUS_RING, NOTICE_TEXT } from "./studio-bg3d-asset-panel-styles";
import { STUDIO_BG3D_ASSET_PLACEMENT_MENU_FOOTER } from "./studio-bg3d-asset-placement-catalog";

import type {
  StudioBg3dAssetPlacementRecipeDefinition,
  StudioBg3dAssetPlacementRecipeId,
} from "./studio-bg3d-asset-placement-catalog";

interface StudioBg3dAssetRecipeMenuProps {
  readonly id: string;
  readonly entryName: string;
  readonly recipes: readonly StudioBg3dAssetPlacementRecipeDefinition[];
  readonly disabled: boolean;
  readonly onSelect: (recipe: StudioBg3dAssetPlacementRecipeId) => void;
  readonly onEscape: () => void;
}

/**
 * 배치 방식 목록. 버튼 하나가 곧 한 번에 배치다(포인터로 위치를 고르는 기존 "장면에 추가"와 별개).
 * 역할은 `group` 이다. `menu` 역할은 화살표·Home·End 로 항목을 옮기는 키보드 계약을 요구하는데, 이 목록은 평범한 버튼들이라
 * Tab 으로 닿고 Esc 로 닫는 것만 약속한다.
 */
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
            "min-h-11 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-left transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-45",
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
          <span id={`${id}-${recipe.id}`} className="mt-0.5 block text-xs leading-snug text-fg-2">
            {recipe.description}
          </span>
        </button>
      ))}
      <p className={cx("px-1", NOTICE_TEXT)}>{STUDIO_BG3D_ASSET_PLACEMENT_MENU_FOOTER}</p>
    </div>
  );
}
