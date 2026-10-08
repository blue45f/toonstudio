import { ENGINEERING_MAP_AI_DEV } from "./engineering-map-ai-dev";
import { ENGINEERING_MAP_COMPETITORS } from "./engineering-map-competitors";
import { ENGINEERING_MAP_FREE_TIER } from "./engineering-map-free-tier";
import { ENGINEERING_MAP_OPEN_API } from "./engineering-map-open-api";
import { ENGINEERING_MAP_OPEN_SOURCE } from "./engineering-map-open-source";
import type { EngineeringMap, EngineeringMapId } from "./engineering-map-types";

/** 작성이 끝난 지도만 모은다. 지도는 각 `engineering-map-<id>.ts` 에만 추가한다. */
export const ENGINEERING_MAPS: readonly EngineeringMap[] = [
  ENGINEERING_MAP_FREE_TIER,
  ENGINEERING_MAP_OPEN_SOURCE,
  ENGINEERING_MAP_OPEN_API,
  ENGINEERING_MAP_COMPETITORS,
  ENGINEERING_MAP_AI_DEV,
].filter((map): map is EngineeringMap => map !== null);

export function findEngineeringMap(id: EngineeringMapId): EngineeringMap | undefined {
  return ENGINEERING_MAPS.find((map) => map.id === id);
}
