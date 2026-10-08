/**
 * 몸 가림의 Babylon 쪽(계약 4.6): `TS_Body`의 SubMesh를 숨기지 않을 영역의 연속 인덱스 구간으로 다시 만든다.
 * 범위 계산은 순수 모듈 `../kit-region-mask.ts`가 하고 여기서는 SubMesh만 만든다. 스킨·morph·재질·UV와 무관하다.
 *
 * - 스킨·morph로 움직인 정점은 SubMesh의 bind 포즈 경계 상자 밖으로 나갈 수 있으므로 구간이 둘 이상이면
 *   `alwaysSelectAsActiveMesh`를 켜 SubMesh별 절두체 컬링으로 일부 구간이 사라지는 일을 막는다(단일 SubMesh는 Babylon이 컬링을 건너뛴다).
 * - **알려진 한계(미해결)**: Babylon 스키닝 pick(`skinned-pick.ts`)은 `mesh.getIndices()` 전체를 쓰므로 숨긴 삼각형도 pick에 걸린다.
 */
import { SubMesh } from "@babylonjs/core/Meshes/subMesh.js";

import { hiddenTriangleCount, visibleIndexRuns } from "../kit-region-mask";

import type { KitHideableRegionId, KitRegionRange } from "../../contracts";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";

export interface BodyMaskReport {
  /** 이번에 숨긴 영역(영역 선언 순서) */
  readonly hiddenRegions: readonly string[];
  /** 만들어진 SubMesh 수 */
  readonly subMeshCount: number;
  readonly hiddenTriangles: number;
}

/**
 * `body`의 SubMesh를 `hidden`을 뺀 구간들로 바꾼다. `ranges`가 비어 있거나 `hidden`이 비면 전체를 하나의 SubMesh로 되돌린다.
 * 호출자가 `regionRangeProblems`로 범위의 분할을 이미 확인했다고 가정한다.
 */
export function applyBodyMask(body: Mesh, ranges: readonly KitRegionRange[], hidden: ReadonlySet<KitHideableRegionId>): BodyMaskReport {
  const totalIndices = body.getTotalIndices();
  const totalVertices = body.getTotalVertices();
  const effectiveHidden: ReadonlySet<string> = ranges.length === 0 ? new Set<string>() : hidden;
  const runs = visibleIndexRuns(ranges, effectiveHidden, totalIndices);
  const current = body.subMeshes;
  const unchanged = current.length === runs.length && runs.every((run, index) => current[index]?.indexStart === run.indexStart && current[index]?.indexCount === run.indexCount);
  if (!unchanged) {
    body.releaseSubMeshes();
    for (const run of runs) new SubMesh(0, 0, totalVertices, run.indexStart, run.indexCount, body);
  }
  body.alwaysSelectAsActiveMesh = runs.length > 1;
  const hiddenRegions = ranges.filter((range) => effectiveHidden.has(range.id)).map((range) => range.id);
  return { hiddenRegions, subMeshCount: runs.length, hiddenTriangles: hiddenTriangleCount(ranges, effectiveHidden) };
}
