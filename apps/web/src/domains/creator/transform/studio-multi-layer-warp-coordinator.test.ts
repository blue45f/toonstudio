import { describe, expect, it } from "vitest";

import {
  applyMultiLayerCornerPin,
  applyMultiLayerLiquify,
  applyMultiLayerMeshWarp,
  applyMultiLayerPuppetWarp,
  computeMultiLayerUnionBounds,
  createMultiLayerWarpCommitPlan,
  selectEligibleWarpLayers,
  type MultiLayerWarpLayerInput,
} from "./studio-multi-layer-warp-coordinator";
import { createPuppetPin } from "./studio-puppet-warp";
import {
  applyRasterMeshPreset,
  createRasterMeshLattice,
} from "./studio-raster-mesh-transform";

function createTestLayer(
  id: string,
  width: number,
  height: number,
  offsetX: number,
  offsetY: number,
  fill: readonly [number, number, number, number],
  extra?: Partial<MultiLayerWarpLayerInput>,
): MultiLayerWarpLayerInput {
  const data = new Uint8ClampedArray(width * height * 4);
  // 중앙 십자 마커를 그려 픽셀 이동을 명확히 검출한다.
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const isMark = Math.abs(x - cx) <= 2 || Math.abs(y - cy) <= 2;
      if (isMark) {
        data[idx] = fill[0];
        data[idx + 1] = fill[1];
        data[idx + 2] = fill[2];
        data[idx + 3] = fill[3];
      }
    }
  }
  return {
    id,
    name: `레이어-${id}`,
    image: { width, height, data },
    offsetX,
    offsetY,
    ...extra,
  };
}

describe("studio-multi-layer-warp-coordinator", () => {
  it("잠금·숨김·범위 외 레이어를 걸러내고 공유 바운딩 박스를 계산한다", () => {
    const lineart = createTestLayer("line", 32, 32, 10, 20, [20, 20, 20, 255], { role: "lineart" });
    const flats = createTestLayer("flat", 40, 30, 20, 10, [220, 120, 80, 255], { role: "flat" });
    const locked = createTestLayer("lock", 20, 20, 0, 0, [0, 0, 0, 255], { locked: true });
    const hidden = createTestLayer("hide", 20, 20, 0, 0, [0, 0, 0, 255], { visible: false });

    const { eligible, skipped } = selectEligibleWarpLayers([lineart, flats, locked, hidden]);
    expect(eligible.map((l) => l.id)).toEqual(["line", "flat"]);
    expect(skipped).toEqual([
      { layerId: "lock", name: "레이어-lock", reason: "locked" },
      { layerId: "hide", name: "레이어-hide", reason: "hidden" },
    ]);

    const bounds = computeMultiLayerUnionBounds(eligible);
    expect(bounds).toEqual({
      originX: 10,
      originY: 10,
      width: 50, // 20 + 40 - 10
      height: 42, // 20 + 32 - 10
    });
  });

  it("복수 레이어에 동일한 Liquify 변위 필드를 동시 적용하고 단일 Undo 커밋 계획을 만든다", () => {
    const lineart = createTestLayer("line", 32, 32, 0, 0, [10, 10, 10, 255]);
    const shadow = createTestLayer("shadow", 32, 32, 0, 0, [80, 90, 140, 200]);

    const batch = applyMultiLayerLiquify([lineart, shadow], {
      points: [
        { x: 12, y: 16, pressure: 1 },
        { x: 24, y: 16, pressure: 1 },
      ],
      radiusPx: 14,
      strength: 0.8,
      mode: "push",
    });

    expect(batch.ok).toBe(true);
    expect(batch.results).toHaveLength(2);
    expect(batch.changedLayerCount).toBe(2);
    expect(batch.results[0]!.changedPixels).toBeGreaterThan(0);
    expect(batch.results[1]!.changedPixels).toBe(batch.results[0]!.changedPixels);

    const plan = createMultiLayerWarpCommitPlan([lineart, shadow], batch);
    expect(plan).not.toBeNull();
    expect(plan!.affectedLayerIds).toEqual(["line", "shadow"]);
    expect(plan!.labelKo).toContain("2개 레이어");
  });

  it("복수 레이어에 Puppet Warp · 메쉬 변형 · 코너핀 변형을 정합 적용하고 자가교차 사각형을 차단한다", () => {
    const l1 = createTestLayer("l1", 24, 24, 0, 0, [20, 20, 20, 255]);
    const l2 = createTestLayer("l2", 24, 24, 4, 4, [180, 60, 60, 255]);

    const pinA = createPuppetPin(12, 12, "deform", "p1");
    const movedPinA = { ...pinA, x: 18, y: 16 };
    const pinAnchor = createPuppetPin(2, 2, "anchor", "p2");

    const puppetBatch = applyMultiLayerPuppetWarp([l1, l2], {
      pins: [movedPinA, pinAnchor],
      influenceRadiusPx: 16,
      gridCols: 4,
      gridRows: 4,
    });
    expect(puppetBatch.ok).toBe(true);
    expect(puppetBatch.changedLayerCount).toBe(2);

    const bounds = computeMultiLayerUnionBounds([l1, l2])!;
    const lattice = applyRasterMeshPreset(
      createRasterMeshLattice(bounds.width, bounds.height, 3, 3),
      "arc",
      0.6,
    );
    const meshBatch = applyMultiLayerMeshWarp([l1, l2], { lattice });
    expect(meshBatch.ok).toBe(true);
    expect(meshBatch.changedLayerCount).toBe(2);

    // 유효한 사다리꼴 코너핀
    const cornerOk = applyMultiLayerCornerPin([l1, l2], {
      destinationQuad: {
        topLeft: { x: 4, y: 0 },
        topRight: { x: bounds.width - 5, y: 0 },
        bottomRight: { x: bounds.width - 1, y: bounds.height - 1 },
        bottomLeft: { x: 0, y: bounds.height - 1 },
      },
    });
    expect(cornerOk.ok).toBe(true);
    expect(cornerOk.changedLayerCount).toBe(2);

    // 나비넥타이 자가교차 사각형 거부
    const cornerInvalid = applyMultiLayerCornerPin([l1, l2], {
      destinationQuad: {
        topLeft: { x: 0, y: 20 },
        topRight: { x: 20, y: 0 },
        bottomRight: { x: 20, y: 20 },
        bottomLeft: { x: 0, y: 0 },
      },
    });
    expect(cornerInvalid.ok).toBe(false);
    expect(cornerInvalid.validation?.valid).toBe(false);
  });
});
