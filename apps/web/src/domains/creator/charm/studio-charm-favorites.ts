/**
 * 기존 즐겨찾기를 참 ID 로 옮기는 순수 함수.
 *
 * 즐겨찾기 저장소는 그대로 두고(별을 눌러 모으는 정렬·필터용), 참 바의 "즐겨찾기" 분류가 읽기만 한다.
 * - 자산 즐겨찾기 `raster:<id>` → 내장 일러스트 참, `local:<id>` → 내 소재 참 (`community:` 는 참 대상이 아니다)
 * - 요소 카탈로그 즐겨찾기 `<요소 id>` → 요소 참
 */

import { parseStudioCharmId, type StudioCharmId } from "./studio-charm-model";

export function studioCharmFavoriteIds(
  assetFavoriteIds: readonly string[],
  elementFavoriteIds: readonly string[],
): ReadonlySet<StudioCharmId> {
  const out = new Set<StudioCharmId>();
  for (const favorite of assetFavoriteIds) {
    const separator = favorite.indexOf(":");
    if (separator <= 0) continue;
    const namespace = favorite.slice(0, separator);
    const rawId = favorite.slice(separator + 1);
    const id = namespace === "raster"
      ? parseStudioCharmId(`raster:${rawId}`)
      : namespace === "local"
        ? parseStudioCharmId(`library:${rawId}`)
        : null;
    if (id) out.add(id);
  }
  for (const rawId of elementFavoriteIds) {
    const id = parseStudioCharmId(`element:${rawId}`);
    if (id) out.add(id);
  }
  return out;
}
