import { afterEach, describe, expect, it } from "vitest";

import { KIT_HIDEABLE_REGION_IDS } from "../contracts";

import { buildKitFixture, createKitHarness } from "./testing/kit-glb-fixture";
import { applyBodyMask, kitBodyOutlineRanges } from "./testing/null-engine-harness";

import type { KitRegionRange } from "../contracts";
import type { IndexRun } from "./kit-region-mask";
import type { KitHarness } from "./testing/kit-glb-fixture";
import type { KitBodyOutlineRanges } from "./testing/null-engine-harness";

const harnesses: KitHarness[] = [];
afterEach(() => {
  while (harnesses.length) harnesses.pop()?.dispose();
});

async function boot() {
  const fixture = await buildKitFixture({ partIds: [] });
  const harness = await createKitHarness();
  harnesses.push(harness);
  const handle = await harness.load(fixture);
  const body = handle.rig.parts.find((part) => part.role === "skin")?.meshes[0];
  const underwear = handle.rig.parts.find((part) => part.role === "underwear")?.meshes[0];
  if (!body || !underwear) throw new Error("몸 범위 검증용 실제 키트 메시가 없습니다.");
  const full = Array.from(body.getIndices() ?? []);
  expect(full).toHaveLength(90);
  return { body, underwear, full, ranges: fixture.plan.bodyRegions };
}

function requiredRanges(body: Parameters<typeof kitBodyOutlineRanges>[0]): KitBodyOutlineRanges {
  const ranges = kitBodyOutlineRanges(body);
  if (!ranges) throw new Error("적용된 몸 주선 범위가 없습니다.");
  return ranges;
}

/** 압축 위치의 합집합·불겹침과 각 범위가 실제 인덱스에서 읽는 원문을 함께 확인한다. */
function expectPartition(mapping: KitBodyOutlineRanges, indices: readonly number[], torso: readonly number[], other: readonly number[]) {
  const ordered = [...mapping.torso, ...mapping.other].sort((left, right) => left.indexStart - right.indexStart);
  let cursor = 0;
  for (const run of ordered) {
    expect(run.indexStart).toBe(cursor);
    expect(run.indexStart % 3).toBe(0);
    expect(run.indexCount).toBeGreaterThan(0);
    expect(run.indexCount % 3).toBe(0);
    cursor += run.indexCount;
  }
  expect(cursor).toBe(mapping.visibleIndexCount);
  expect(indices.length).toBe(mapping.visibleIndexCount);
  const read = (runs: readonly IndexRun[]) => runs.flatMap((run) => indices.slice(run.indexStart, run.indexStart + run.indexCount));
  expect(read(mapping.torso)).toEqual(torso);
  expect(read(mapping.other)).toEqual(other);
}

describe("현재 압축 인덱스의 키트 몸 주선 범위", () => {
  it("기본 torso와 앞뒤 나머지가 실제 원본 인덱스를 빠짐·겹침 없이 나눈다", async () => {
    const { body, underwear, ranges, full } = await boot();
    expect(kitBodyOutlineRanges(underwear)).toBeNull();
    applyBodyMask(body, ranges, new Set());
    const mapping = requiredRanges(body);
    expect(mapping).toEqual({ torso: [{ indexStart: 6, indexCount: 6 }], other: [{ indexStart: 0, indexCount: 6 }, { indexStart: 12, indexCount: 78 }], visibleIndexCount: 90 });
    expectPartition(mapping, Array.from(body.getIndices() ?? []), full.slice(6, 12), [...full.slice(0, 6), ...full.slice(12)]);
  });

  it("torso 앞뒤 영역을 숨긴 뒤에는 압축된 위치로 옮기며 원문 순서를 유지한다", async () => {
    const { body, ranges, full } = await boot();
    applyBodyMask(body, ranges, new Set(["neck", "pelvis"]));
    const indices = Array.from(body.getIndices() ?? []);
    expect(indices).toEqual([...full.slice(6, 12), ...full.slice(18)]);
    const mapping = requiredRanges(body);
    expect(mapping).toEqual({ torso: [{ indexStart: 0, indexCount: 6 }], other: [{ indexStart: 6, indexCount: 72 }], visibleIndexCount: 78 });
    expectPartition(mapping, indices, full.slice(6, 12), full.slice(18));
  });

  it("torso 자체를 숨기면 나머지 가시 인덱스 전체만 남는다", async () => {
    const { body, ranges, full } = await boot();
    applyBodyMask(body, ranges, new Set(["torso"]));
    const expected = [...full.slice(0, 6), ...full.slice(12)];
    const indices = Array.from(body.getIndices() ?? []);
    expect(indices).toEqual(expected);
    const mapping = requiredRanges(body);
    expect(mapping).toEqual({ torso: [], other: [{ indexStart: 0, indexCount: 84 }], visibleIndexCount: 84 });
    expectPartition(mapping, indices, [], expected);
  });

  it("여러 원본 run의 숨김 틈을 압축하고 나머지 범위는 연속된 위치끼리 병합한다", async () => {
    const { body, ranges, full } = await boot();
    const report = applyBodyMask(body, ranges, new Set(["pelvis", "upperArm.R", "hand.R"]));
    const indices = Array.from(body.getIndices() ?? []);
    expect(report.visibleRuns).toBe(4);
    expect(indices).toEqual([...full.slice(0, 12), ...full.slice(18, 24), ...full.slice(30, 48), ...full.slice(54)]);
    const mapping = requiredRanges(body);
    expect(mapping).toEqual({ torso: [{ indexStart: 6, indexCount: 6 }], other: [{ indexStart: 0, indexCount: 6 }, { indexStart: 12, indexCount: 60 }], visibleIndexCount: 72 });
    expectPartition(mapping, indices, full.slice(6, 12), [...full.slice(0, 6), ...full.slice(18, 24), ...full.slice(30, 48), ...full.slice(54)]);
  });

  it("전체 숨김의 의미상 0개를 퇴화 버퍼 3개와 구분하고 재표시하면 원문을 복구한다", async () => {
    const { body, ranges, full } = await boot();
    const hidden = applyBodyMask(body, ranges, new Set(KIT_HIDEABLE_REGION_IDS));
    expect(hidden.hiddenTriangles).toBe(30);
    expect(Array.from(body.getIndices() ?? [])).toEqual([0, 0, 0]);
    expect(requiredRanges(body)).toEqual({ torso: [], other: [], visibleIndexCount: 0 });
    applyBodyMask(body, ranges, new Set());
    expect(Array.from(body.getIndices() ?? [])).toEqual(full);
    expectPartition(requiredRanges(body), full, full.slice(6, 12), [...full.slice(0, 6), ...full.slice(12)]);
  });

  it("동일 인덱스 signature에서도 torso의 의미상 영역 변경을 갱신한다", async () => {
    const { body, ranges, full } = await boot();
    const buffer = body.getIndices(false, false);
    const swapped: KitRegionRange[] = ranges.map((range) => range.id === "neck" ? { ...range, id: "torso" } : range.id === "torso" ? { ...range, id: "neck" } : range);
    applyBodyMask(body, swapped, new Set());
    expect(body.getIndices(false, false)).toBe(buffer);
    const mapping = requiredRanges(body);
    expect(mapping).toEqual({ torso: [{ indexStart: 0, indexCount: 6 }], other: [{ indexStart: 6, indexCount: 84 }], visibleIndexCount: 90 });
    expectPartition(mapping, full, full.slice(0, 6), full.slice(6));
    applyBodyMask(body, ranges, new Set());
    expect(requiredRanges(body).torso).toEqual([{ indexStart: 6, indexCount: 6 }]);
  });

  it("같은 가시 길이의 다른 숨김 집합은 범위·실제 인덱스를 각각 유지한다", async () => {
    const { body, ranges, full } = await boot();
    applyBodyMask(body, ranges, new Set(["neck"]));
    const first = requiredRanges(body);
    expect(first.torso).toEqual([{ indexStart: 0, indexCount: 6 }]);
    expect(Array.from(body.getIndices() ?? [])).toEqual(full.slice(6));
    applyBodyMask(body, ranges, new Set(["foot.R"]));
    const second = requiredRanges(body);
    expect(second.visibleIndexCount).toBe(first.visibleIndexCount);
    expect(second.torso).toEqual([{ indexStart: 6, indexCount: 6 }]);
    expect(Array.from(body.getIndices() ?? [])).toEqual(full.slice(0, 84));
    expectPartition(second, full.slice(0, 84), full.slice(6, 12), [...full.slice(0, 6), ...full.slice(12, 84)]);
  });

  it("bodyRegions가 없으면 의미상 매핑을 지우고 같은 물리 signature로 정보가 돌아오면 복구한다", async () => {
    const { body, ranges, full } = await boot();
    applyBodyMask(body, [], new Set(["torso"]));
    expect(kitBodyOutlineRanges(body)).toBeNull();
    expect(Array.from(body.getIndices() ?? [])).toEqual(full);
    applyBodyMask(body, ranges, new Set());
    expectPartition(requiredRanges(body), full, full.slice(6, 12), [...full.slice(0, 6), ...full.slice(12)]);
  });
});
