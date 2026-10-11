/**
 * 몸 가림의 Babylon 쪽(계약 4.6): `TS_Body`의 인덱스 버퍼를 **숨기지 않을 영역의 연속 구간만 이어 붙인 하나의 버퍼**로 바꾼다(SubMesh는 하나).
 * 범위 계산은 순수 모듈 `../kit-region-mask.ts`가 하고 여기서는 인덱스 버퍼만 만든다. 스킨·morph·재질·UV와 무관하다.
 *
 * - **왜 구간마다 SubMesh를 만들지 않는가**(2026-10-11, Apple M2 Max·ANGLE Metal·WebGL2 실측): 스킨(본 텍스처) 메시에 hull 외곽선(`renderOutline`)을 켠 채
 *   SubMesh가 둘 이상이면 Babylon 외곽선 렌더러가 **두 번째 이후 SubMesh를 깨뜨려** 팔·손에 삼각형 단위의 빨강·초록·파랑 줄무늬를 그린다.
 *   SubMesh 하나(인덱스 시작이 0이 아니어도)는 정상이고, 같은 경계로 둘 이상으로 나누면 재현된다. morph 매니저를 떼도 남고 스켈레톤을 떼면 사라진다.
 *   WebGPU에서는 재현되지 않는다. 그래서 가려진 삼각형을 인덱스 버퍼에서 빼 SubMesh를 하나로 유지한다.
 * - 가려진 삼각형이 인덱스 버퍼에서 빠지므로 렌더·pick·GLB 내보내기가 모두 같은 삼각형 집합을 본다.
 * - 영역 범위(`ranges`)는 **마스크를 적용하기 전의 전체 인덱스 버퍼** 기준이다. 전체 인덱스는 처음 적용할 때 한 번 복사해 두고(`FULL_INDICES`)
 *   의상이 바뀔 때마다 거기서 다시 이어 붙인다. 같은 구간이면 버퍼를 다시 만들지 않는다.
 */
import { hiddenTriangleCount, visibleIndexRuns } from "../kit-region-mask";

import type { KitHideableRegionId, KitRegionRange } from "../../contracts";
import type { IndexRun } from "../kit-region-mask";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";

export interface BodyMaskReport {
  /** 이번에 숨긴 영역(영역 선언 순서) */
  readonly hiddenRegions: readonly string[];
  /** 만들어진 SubMesh 수(몸이 보이면 항상 1) */
  readonly subMeshCount: number;
  /** 이어 붙인 보이는 연속 구간 수(영역 단위 SubMesh가 있던 때의 SubMesh 수와 같다) */
  readonly visibleRuns: number;
  readonly hiddenTriangles: number;
}

type IndexBuffer = Uint16Array | Uint32Array;

/** 마스크를 적용하기 전의 전체 인덱스(영역 범위의 기준). 메시마다 처음 한 번만 복사한다. */
const FULL_INDICES = new WeakMap<Mesh, IndexBuffer>();
/** 마지막으로 만든 보이는 구간의 서명 — 같으면 인덱스 버퍼를 다시 만들지 않는다. */
const APPLIED_SIGNATURE = new WeakMap<Mesh, string>();

/** 전부 숨겨졌을 때 쓰는 퇴화 삼각형(빈 인덱스 버퍼는 Babylon이 정점 수만큼 그리려 한다). */
const DEGENERATE_TRIANGLE: readonly number[] = [0, 0, 0];

function fullIndicesOf(body: Mesh): IndexBuffer {
  const cached = FULL_INDICES.get(body);
  if (cached) return cached;
  const source = body.getIndices(false, true) ?? [];
  const needsUint32 = source.some((index) => index > 0xffff);
  const copy: IndexBuffer = needsUint32 ? Uint32Array.from(source) : Uint16Array.from(source);
  FULL_INDICES.set(body, copy);
  return copy;
}

function concatenateRuns(full: IndexBuffer, runs: readonly IndexRun[]): IndexBuffer {
  const total = runs.reduce((sum, run) => sum + run.indexCount, 0);
  if (total === 0) return full instanceof Uint32Array ? Uint32Array.from(DEGENERATE_TRIANGLE) : Uint16Array.from(DEGENERATE_TRIANGLE);
  const out: IndexBuffer = full instanceof Uint32Array ? new Uint32Array(total) : new Uint16Array(total);
  let cursor = 0;
  for (const run of runs) {
    out.set(full.subarray(run.indexStart, run.indexStart + run.indexCount), cursor);
    cursor += run.indexCount;
  }
  return out;
}

/**
 * `body`의 인덱스 버퍼를 `hidden`을 뺀 구간들을 이어 붙인 것으로 바꾼다. `ranges`가 비어 있거나 `hidden`이 비면 전체 인덱스로 되돌린다.
 * 호출자가 `regionRangeProblems`로 범위의 분할을 이미 확인했다고 가정한다.
 */
export function applyBodyMask(body: Mesh, ranges: readonly KitRegionRange[], hidden: ReadonlySet<KitHideableRegionId>): BodyMaskReport {
  const full = fullIndicesOf(body);
  const effectiveHidden: ReadonlySet<string> = ranges.length === 0 ? new Set<string>() : hidden;
  const runs = visibleIndexRuns(ranges, effectiveHidden, full.length);
  const signature = `${full.length}|${runs.map((run) => `${run.indexStart}:${run.indexCount}`).join(",")}`;
  if (APPLIED_SIGNATURE.get(body) !== signature) {
    // 전부 보이는 구간 하나이고 처음 적용하는 것이면 원래 버퍼를 그대로 둔다(복사·재업로드 없음).
    const untouched = runs.length === 1 && runs[0]?.indexStart === 0 && runs[0]?.indexCount === full.length && body.getTotalIndices() === full.length && !APPLIED_SIGNATURE.has(body);
    if (!untouched) body.setIndices(concatenateRuns(full, runs), body.getTotalVertices(), false);
    APPLIED_SIGNATURE.set(body, signature);
  }
  // SubMesh가 하나라 Babylon이 SubMesh별 절두체 컬링을 하지 않는다 — 항상 선택 플래그가 필요 없다.
  body.alwaysSelectAsActiveMesh = false;
  const hiddenRegions = ranges.filter((range) => effectiveHidden.has(range.id)).map((range) => range.id);
  return { hiddenRegions, subMeshCount: body.subMeshes.length, visibleRuns: runs.length, hiddenTriangles: hiddenTriangleCount(ranges, effectiveHidden) };
}
