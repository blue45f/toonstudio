import { translateBilingualValueForActiveLocale } from "@/shared/lib/i18n-bilingual-copy";

import {
  STUDIO_INSERT_HUB_COLLECTION_LABELS,
  STUDIO_INSERT_PLACEMENT_LABELS,
} from "../studio-insert-hub-model";
import type {
  StudioInsertHubCategory,
  StudioInsertHubCollection,
  StudioInsertPlacementMode,
} from "../studio-insert-hub-model";
import type { StudioUnifiedAssetItem } from "../studio-unified-asset-catalog";
import type { AssetWorkspaceFacet } from "./studio-unified-asset-workspace-state";

export const assetWorkspaceText = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale(
    "studio-unified-asset-workspace",
    ko,
    en
  );

export function assetWorkspaceCollectionLabel(
  collection: StudioInsertHubCollection
): string {
  const english = {
    all: "All",
    favorites: "Favorites",
    recent: "Recently used",
  };
  return assetWorkspaceText(
    STUDIO_INSERT_HUB_COLLECTION_LABELS[collection],
    english[collection]
  );
}

export function assetWorkspacePlacementLabel(
  placement: StudioInsertPlacementMode
): string {
  const english = {
    auto: "Automatic",
    page: "Fit to page",
    selection: "Fit to selection",
  };
  return assetWorkspaceText(
    STUDIO_INSERT_PLACEMENT_LABELS[placement],
    english[placement]
  );
}

export const ASSET_WORKSPACE_FACETS: readonly {
  readonly id: AssetWorkspaceFacet;
  readonly ko: string;
  readonly en: string;
  readonly category: StudioInsertHubCategory;
}[] = [
  { id: "all", ko: "전체", en: "All", category: "all" },
  { id: "background", ko: "2D 배경", en: "2D backgrounds", category: "scene" },
  {
    id: "scene-template",
    ko: "장면 레시피",
    en: "Scene recipes",
    category: "scene",
  },
  { id: "story", ko: "스토리 연출", en: "Story elements", category: "element" },
  {
    id: "character",
    ko: "캐릭터·포즈",
    en: "Characters & poses",
    category: "element",
  },
  { id: "prop", ko: "소품", en: "Props", category: "element" },
  { id: "3d", ko: "3D", en: "3D", category: "3d" },
  { id: "mine", ko: "내 에셋", en: "My assets", category: "mine" },
];

export function assetWorkspaceFacetForItem(
  item: StudioUnifiedAssetItem
): Exclude<AssetWorkspaceFacet, "all"> {
  const source = item.source;
  if (source.kind === "background") return "background";
  if (source.kind === "scene-template") return "scene-template";
  if (source.kind === "object-3d") return "3d";
  if (source.kind === "local") return "mine";
  if (source.kind === "native-tool") return "story";
  if (source.kind === "builtin-raster") {
    return source.value.kind === "bubble-decoration" ||
      source.value.kind === "effect-overlay"
      ? "story"
      : "prop";
  }
  const searchable = [
    item.id,
    item.title,
    item.categoryLabel,
    source.value.category,
    ...item.keywords,
    ...source.value.keywords,
  ]
    .join(" ")
    .toLocaleLowerCase();
  if (/(?:character|pose|face|hand|캐릭터|포즈|표정|인물|손)/u.test(searchable))
    return "character";
  if (
    /(?:panel|frame|bubble|speech|sfx|effect|line|arrow|컷|프레임|말풍선|효과음|연출|집중선|속도선)/u.test(
      searchable
    )
  )
    return "story";
  return "prop";
}

export function matchesAssetWorkspaceFacet(
  item: StudioUnifiedAssetItem,
  facet: AssetWorkspaceFacet
): boolean {
  return facet === "all" || assetWorkspaceFacetForItem(item) === facet;
}

export function assetWorkspaceDetailsForItem(
  item: StudioUnifiedAssetItem
): readonly string[] {
  const bi = assetWorkspaceText;
  const source = item.source;
  if (source.kind === "scene-template")
    return [
      bi("현재 페이지에 적용", "Apply to this page"),
      bi("적용 후 개별 요소 편집", "Edit each element after applying"),
      bi("한 번에 실행 취소", "Undo in one step"),
    ];
  if (source.kind === "object-3d")
    return [
      source.value.openTarget === "vrm-poser"
        ? bi("3D 캐릭터·소품 편집기", "3D character & prop editor")
        : bi("3D 배경 편집기", "3D background editor"),
      bi("카메라·회전·크기 편집", "Edit camera, rotation and size"),
    ];
  if (source.kind === "background")
    return [
      source.value.genre,
      bi("현재 페이지에 삽입", "Insert on this page"),
      bi("원본 비율 유지", "Keep original proportions"),
    ];
  if (source.kind === "element")
    return [
      source.value.category,
      bi("벡터 크기 조절", "Resize vector"),
      bi("회전·복제 가능", "Rotate and duplicate"),
    ];
  if (source.kind === "builtin-raster")
    return [
      `${source.value.width} × ${source.value.height}px`,
      source.value.hasAlpha
        ? bi("투명 배경 일러스트", "Transparent illustration")
        : bi("질감 이미지 원본", "Texture image"),
      source.value.kind === "bubble-decoration"
        ? bi("대사는 별도 텍스트로 편집", "Edit dialogue as separate text")
        : bi("크기·회전·복제 가능", "Resize, rotate and duplicate"),
    ];
  if (source.kind === "local")
    return [
      `${source.value.width} × ${source.value.height}px`,
      bi("내 에셋", "My asset"),
      bi("배치 방식 선택 가능", "Choose placement"),
    ];
  return [
    bi("편집 도구에서 열기", "Open editing tool"),
    bi("편집 가능한 결과", "Editable result"),
  ];
}
