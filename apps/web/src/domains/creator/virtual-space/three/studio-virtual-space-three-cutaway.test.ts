import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { applyStudioThreeCutaway, resetStudioThreeCutaway } from "./studio-virtual-space-three-cutaway";

function buildDesktop8NodeScene(): THREE.Group {
  const root = new THREE.Group();
  for (const name of [
    "BG_Floor",
    "BG_Wall_North",
    "BG_Wall_South",
    "BG_Wall_West",
    "BG_Wall_East",
    "BG_Ceiling",
    "BG_Furniture_Hero",
    "BG_Props_Clutter",
  ]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    mesh.name = name;
    root.add(mesh);
  }
  return root;
}

function buildMobile4NodeScene(): THREE.Group {
  const root = new THREE.Group();
  for (const name of ["BG_Shell_Fixed", "BG_Cutaway_Front", "BG_Ceiling", "BG_Furnishings"]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    mesh.name = name;
    root.add(mesh);
  }
  return root;
}

describe("Desktop 8노드 / Mobile 4노드 자동 컷어웨이", () => {
  it("쿼터뷰·3인칭에서는 카메라와 플레이어 사이 벽과 천장을 자동 숨기고 4방위 회전에 따라 전환한다", () => {
    const root = buildDesktop8NodeScene();

    // Yaw = 0 → 카메라는 남쪽(+Z) → South 벽 + Ceiling 숨김
    const south = applyStudioThreeCutaway(root, { cameraMode: "quarter", cameraYaw: 0 });
    expect(south.activeNodeTier).toBe("desktop-8");
    expect(south.hiddenNodeNames).toEqual(expect.arrayContaining(["BG_Wall_South", "BG_Ceiling"]));
    expect(south.hiddenCount).toBe(2);
    expect(root.getObjectByName("BG_Wall_South")?.visible).toBe(false);
    expect(root.getObjectByName("BG_Ceiling")?.visible).toBe(false);
    expect(root.getObjectByName("BG_Wall_North")?.visible).toBe(true);
    expect(root.getObjectByName("BG_Floor")?.visible).toBe(true);

    // Yaw = Math.PI / 2 → 카메라는 동쪽(+X) → East 벽 + Ceiling 숨김, South 벽 복원
    const east = applyStudioThreeCutaway(root, { cameraMode: "third-person", cameraYaw: Math.PI / 2 });
    expect(east.hiddenNodeNames).toEqual(expect.arrayContaining(["BG_Wall_East", "BG_Ceiling"]));
    expect(root.getObjectByName("BG_Wall_East")?.visible).toBe(false);
    expect(root.getObjectByName("BG_Wall_South")?.visible).toBe(true);

    // Yaw = Math.PI → 카메라는 북쪽(-Z) → North 벽 + Ceiling 숨김
    const north = applyStudioThreeCutaway(root, { cameraMode: "quarter", cameraYaw: Math.PI });
    expect(north.hiddenNodeNames).toEqual(expect.arrayContaining(["BG_Wall_North", "BG_Ceiling"]));
    expect(root.getObjectByName("BG_Wall_North")?.visible).toBe(false);

    // Yaw = -Math.PI / 2 → 카메라는 서쪽(-X) → West 벽 + Ceiling 숨김
    const west = applyStudioThreeCutaway(root, { cameraMode: "quarter", cameraYaw: -Math.PI / 2 });
    expect(west.hiddenNodeNames).toEqual(expect.arrayContaining(["BG_Wall_West", "BG_Ceiling"]));
    expect(root.getObjectByName("BG_Wall_West")?.visible).toBe(false);
  });

  it("1인칭 모드에서는 모든 벽과 천장을 표시(hiddenCount = 0)하고 enabledWalls 제한을 준수한다", () => {
    const root = buildDesktop8NodeScene();
    const fp = applyStudioThreeCutaway(root, { cameraMode: "first-person", cameraYaw: 0 });
    expect(fp.hiddenCount).toBe(0);
    expect(root.getObjectByName("BG_Ceiling")?.visible).toBe(true);
    expect(root.getObjectByName("BG_Wall_South")?.visible).toBe(true);

    // 옥상 씬처럼 ceiling이 enabledWalls에 없으면 천장을 숨기지 않는다.
    const rooftop = applyStudioThreeCutaway(root, {
      cameraMode: "quarter",
      cameraYaw: 0,
      enabledWalls: ["south", "west"],
    });
    expect(rooftop.hiddenNodeNames).toEqual(["BG_Wall_South"]);
    expect(root.getObjectByName("BG_Ceiling")?.visible).toBe(true);
  });

  it("Mobile 4노드(BG_Cutaway_Front, BG_Ceiling)를 자동 컷어웨이하고 reset으로 원복한다", () => {
    const mobileRoot = buildMobile4NodeScene();
    const result = applyStudioThreeCutaway(mobileRoot, { cameraMode: "quarter", cameraYaw: 0 });
    expect(result.activeNodeTier).toBe("mobile-4");
    expect(result.hiddenNodeNames).toEqual(expect.arrayContaining(["BG_Cutaway_Front", "BG_Ceiling"]));
    expect(result.hiddenCount).toBe(2);
    expect(mobileRoot.getObjectByName("BG_Shell_Fixed")?.visible).toBe(true);

    resetStudioThreeCutaway(mobileRoot);
    expect(mobileRoot.getObjectByName("BG_Cutaway_Front")?.visible).toBe(true);
    expect(mobileRoot.getObjectByName("BG_Ceiling")?.visible).toBe(true);
  });
});
