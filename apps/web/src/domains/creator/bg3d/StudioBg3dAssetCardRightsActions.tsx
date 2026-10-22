import { Move3d, ShieldCheck } from "lucide-react";

import { StudioBg3dAssetRecipeMenu } from "./StudioBg3dAssetRecipeMenu";
import { StudioBg3dAssetRightsDetails } from "./StudioBg3dAssetRightsInfo";
import { CARD_ACTION_BUTTON } from "./studio-bg3d-asset-panel-styles";

import type { KeyboardEvent, MouseEvent } from "react";
import type {
  StudioBg3dAssetPlacementRecipeDefinition,
  StudioBg3dAssetPlacementRecipeId,
} from "./studio-bg3d-asset-placement-catalog";
import type { StudioBg3dAssetRightsView } from "./studio-bg3d-asset-rights-view";

export type StudioBg3dAssetCardPanel = "rights" | "recipes";

interface StudioBg3dAssetCardRightsActionsProps {
  readonly entryId: string;
  readonly entryName: string;
  readonly view: StudioBg3dAssetRightsView;
  /** 이 카드에서 고를 수 있는 배치 방식. 비어 있으면 배치 방식 버튼을 내놓지 않는다. */
  readonly recipes: readonly StudioBg3dAssetPlacementRecipeDefinition[];
  readonly expanded: StudioBg3dAssetCardPanel | null;
  /** 카드에 다른 작업이 진행 중이거나 쓸 수 없는 상태. 권리 상세는 읽기 전용이라 이 상태에서도 열 수 있다. */
  readonly busy: boolean;
  readonly onToggle: (event: MouseEvent<HTMLButtonElement>, panel: StudioBg3dAssetCardPanel) => void;
  readonly onClose: () => void;
  readonly onSelectRecipe: (recipe: StudioBg3dAssetPlacementRecipeId) => void;
}

/** 카드 아래 "권리 상세"·"배치 방식" 토글 한 줄과 펼친 영역. 토글은 aria-expanded 로 열림 상태를 드러낸다. */
export function StudioBg3dAssetCardRightsActions({
  entryId,
  entryName,
  view,
  recipes,
  expanded,
  busy,
  onToggle,
  onClose,
  onSelectRecipe,
}: StudioBg3dAssetCardRightsActionsProps) {
  const rightsToggleId = `bg3d-model-rights-toggle-${entryId}`;
  const rightsRegionId = `bg3d-model-rights-${entryId}`;
  const recipeRegionId = `bg3d-model-recipes-${entryId}`;
  // 여는 버튼에서 Esc 를 누르면 그 버튼이 연 영역을 닫는다(포커스는 이미 버튼에 있다).
  const closeOnEscape = (panel: StudioBg3dAssetCardPanel) => (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Escape" || expanded !== panel) return;
    event.stopPropagation();
    onClose();
  };
  return (
    <>
      <div className="flex gap-1.5 border-t border-line/80 bg-panel/45 p-1.5">
        <button
          type="button"
          id={rightsToggleId}
          aria-label={`${entryName} 권리 상세`}
          aria-expanded={expanded === "rights"}
          aria-controls={expanded === "rights" ? rightsRegionId : undefined}
          className={CARD_ACTION_BUTTON}
          onClick={(event) => onToggle(event, "rights")}
          onKeyDown={closeOnEscape("rights")}
        >
          <ShieldCheck className="shrink-0" size={13} aria-hidden />
          <span className="truncate">권리 상세</span>
        </button>
        {recipes.length > 0 ? (
          <button
            type="button"
            aria-label={`${entryName} 배치 방식`}
            aria-expanded={expanded === "recipes"}
            aria-controls={expanded === "recipes" ? recipeRegionId : undefined}
            className={CARD_ACTION_BUTTON}
            disabled={busy}
            onClick={(event) => onToggle(event, "recipes")}
            onKeyDown={closeOnEscape("recipes")}
          >
            <Move3d className="shrink-0" size={13} aria-hidden />
            <span className="truncate">배치 방식</span>
          </button>
        ) : null}
      </div>
      {expanded === "rights" ? (
        <StudioBg3dAssetRightsDetails view={view} id={rightsRegionId} labelledBy={rightsToggleId} />
      ) : null}
      {expanded === "recipes" ? (
        <StudioBg3dAssetRecipeMenu
          id={recipeRegionId}
          entryName={entryName}
          recipes={recipes}
          disabled={busy}
          onEscape={onClose}
          onSelect={onSelectRecipe}
        />
      ) : null}
    </>
  );
}
