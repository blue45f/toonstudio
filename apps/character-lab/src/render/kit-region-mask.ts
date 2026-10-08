/**
 * 키트 몸 가림의 순수 범위 계산(계약 4.6). Babylon을 모른다 — `render/babylon/kit-region-mask.ts`가 이 결과로 `TS_Body`의 SubMesh를 만든다.
 *
 * 베이스 GLB의 `TS_Body` 인덱스 버퍼는 영역 순서로 정렬되어 있고 `kit.json`의 `bodyRegions`가 영역마다 연속 인덱스 범위
 * (`indexStart`, `indexCount`)를 적는다. 파츠가 `hides`로 영역을 선언하면 그 영역들의 **합집합**만 빼고 나머지 연속 구간(run)만 그린다.
 * 인접한 보이는 영역은 한 run으로 합쳐 드로우 콜(SubMesh) 수를 줄인다.
 */
import type { KitHideableRegionId } from "../contracts";

export interface RegionRangeLike {
  readonly id: string;
  readonly mesh: string;
  readonly indexStart: number;
  readonly indexCount: number;
}

/** 인덱스 버퍼의 연속 구간 */
export interface IndexRun {
  readonly indexStart: number;
  readonly indexCount: number;
}

/**
 * `bodyRegions`가 몸 메시의 인덱스 버퍼를 빈틈·겹침 없이 분할하는지 점검한다. 문제 문장(한글) 목록을 돌려주고 비어 있으면 정상이다.
 * 범위가 하나도 없으면(몸 가림 정보 없음) 문제로 보지 않는다 — 호출자가 "정보 없음"을 따로 다룬다.
 */
export function regionRangeProblems(ranges: readonly RegionRangeLike[], bodyNode: string, totalIndices: number): string[] {
  if (ranges.length === 0) return [];
  const problems: string[] = [];
  if (totalIndices % 3 !== 0) problems.push(`${bodyNode} 인덱스 수(${totalIndices})가 3의 배수가 아닙니다.`);
  const ids = new Set<string>();
  for (const range of ranges) {
    if (range.mesh !== bodyNode) problems.push(`영역 ${range.id}의 대상 메시가 ${bodyNode}가 아니라 ${range.mesh}입니다.`);
    if (ids.has(range.id)) problems.push(`영역 ${range.id}가 두 번 선언되었습니다.`);
    ids.add(range.id);
    if (!Number.isInteger(range.indexStart) || !Number.isInteger(range.indexCount) || range.indexStart < 0 || range.indexCount <= 0) {
      problems.push(`영역 ${range.id}의 인덱스 범위(${range.indexStart}+${range.indexCount})가 올바른 정수 구간이 아닙니다.`);
    } else if (range.indexStart % 3 !== 0 || range.indexCount % 3 !== 0) {
      problems.push(`영역 ${range.id}의 인덱스 범위(${range.indexStart}+${range.indexCount})가 삼각형(3) 경계에 맞지 않습니다.`);
    }
  }
  if (problems.length > 0) return problems;
  const sorted = [...ranges].sort((a, b) => a.indexStart - b.indexStart);
  let cursor = 0;
  for (const range of sorted) {
    if (range.indexStart < cursor) problems.push(`영역 ${range.id}가 앞 영역과 겹칩니다(시작 ${range.indexStart} < ${cursor}).`);
    else if (range.indexStart > cursor) problems.push(`영역 ${range.id} 앞에 어느 영역에도 속하지 않는 인덱스 구간이 있습니다(${cursor}~${range.indexStart}).`);
    cursor = Math.max(cursor, range.indexStart + range.indexCount);
  }
  if (cursor !== totalIndices) problems.push(`영역 범위의 합(${cursor})이 ${bodyNode} 인덱스 수(${totalIndices})와 다릅니다.`);
  return problems;
}

/** 여러 파츠의 `hides`를 합집합으로 모은다(상의 + 하의가 같은 영역을 숨겨도 한 번이다). */
export function unionHiddenRegions(hides: ReadonlyArray<readonly KitHideableRegionId[]>): ReadonlySet<KitHideableRegionId> {
  const out = new Set<KitHideableRegionId>();
  for (const list of hides) for (const id of list) out.add(id);
  return out;
}

/**
 * 숨길 영역을 뺀 연속 보이는 구간들. `ranges`는 `regionRangeProblems`가 비어 있는 상태여야 한다(분할 가정).
 * 숨길 영역이 없으면 전체 구간 하나, 전부 숨기면 빈 배열이다. 인접한 보이는 영역은 한 구간으로 합친다.
 */
export function visibleIndexRuns(ranges: readonly RegionRangeLike[], hidden: ReadonlySet<string>, totalIndices: number): IndexRun[] {
  if (ranges.length === 0 || hidden.size === 0) return totalIndices > 0 ? [{ indexStart: 0, indexCount: totalIndices }] : [];
  const sorted = [...ranges].sort((a, b) => a.indexStart - b.indexStart);
  const runs: IndexRun[] = [];
  for (const range of sorted) {
    if (hidden.has(range.id)) continue;
    const last = runs[runs.length - 1];
    if (last && last.indexStart + last.indexCount === range.indexStart) {
      runs[runs.length - 1] = { indexStart: last.indexStart, indexCount: last.indexCount + range.indexCount };
    } else {
      runs.push({ indexStart: range.indexStart, indexCount: range.indexCount });
    }
  }
  return runs;
}

/** 숨겨지는 삼각형 수(보고·테스트용) */
export function hiddenTriangleCount(ranges: readonly RegionRangeLike[], hidden: ReadonlySet<string>): number {
  let indices = 0;
  for (const range of ranges) if (hidden.has(range.id)) indices += range.indexCount;
  return indices / 3;
}
