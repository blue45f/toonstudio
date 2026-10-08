import type { EngineeringMap, EngineeringMapRow } from "./engineering-map-types";
import type { EngineeringStatus } from "./engineering-story-content";

/** 지도 행 검색 대상: 이름과 모든 칸의 두 언어 문장(화면 언어와 다른 이름으로도 찾을 수 있게). */
function rowHaystack(row: EngineeringMapRow): string {
  return [row.id, row.name, ...Object.values(row.cells).flatMap((cell) => [cell.ko, cell.en])].join(" ").toLowerCase();
}

/** 검색어와 상태 필터를 적용한 행. 상태가 없는 행은 상태 필터가 걸리면 숨긴다(카드와 같은 규칙). */
export function filterMapRows(
  map: EngineeringMap,
  normalizedQuery: string,
  status: "all" | EngineeringStatus,
): readonly EngineeringMapRow[] {
  return map.rows.filter(
    (row) =>
      (status === "all" || row.status === status) && (!normalizedQuery || rowHaystack(row).includes(normalizedQuery)),
  );
}
