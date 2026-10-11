const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { verifyVirtualStudioLivingTownV6, verifyVirtualStudioNavigationBindings } from "./verify-virtual-studio-living-town-v6.mjs";

test("Virtual Studio living town v6 has complete Image Generation 2.5-directed runtime sheets", async () => {
  const result = await verifyVirtualStudioLivingTownV6();
  assert.equal(result.files, 48);
  assert.equal(result.imagegenFiles, 29);
  assert.ok(result.bytes > 500_000);
  assert.ok(result.imagegenBytes > 200_000);
});

test("경로·가구·배치 중 하나라도 실제 world 판정에서 이탈하면 거부한다", async () => {
  // 판정 권위 모듈과 생존 호출 지점을 합쳐 현행 내비게이션 표면으로 삼는다.
  // (NPC 디렉터 바인딩은 Godot 무대 내부 구현으로 이전되어 대조 대상에서 빠졌다.)
  const surface = (await Promise.all([
    "studio-virtual-space-world-pathfinding.ts",
    "studio-virtual-space-decoration-layout.ts",
    "studio-virtual-space-placed-fixtures.ts",
  ].map((name) => readFile(new URL(`../apps/web/src/domains/creator/virtual-space/${name}`, import.meta.url), "utf8")))).join("\n");
  for (const binding of ["export function findStudioWorldPath(", "export function studioWorldCanOccupy(", "export function resolveStudioWorldSpawn(", "studioVirtualDecorationNavigationWorld(world, { ...state, placements: other })", "studioWorldCanOccupy(world, point)"]) {
    assert.throws(() => verifyVirtualStudioNavigationBindings(surface.split(binding).join("disconnected(")), /navigation authority is disconnected/u);
  }
});
