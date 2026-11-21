import type * as THREE from "three";

import type { StudioThreeCameraMode } from "./studio-virtual-space-three-stage-props";
import type { VirtualThreeCutawayWallSide } from "./themes/virtual-three-theme-types";

export type StudioThreeCutawayNodeTier = "desktop-8" | "mobile-4" | "none";

export interface StudioThreeCutawayResult {
  readonly hiddenCount: number;
  readonly hiddenNodeNames: readonly string[];
  readonly mode: StudioThreeCameraMode;
  readonly activeNodeTier: StudioThreeCutawayNodeTier;
}

export interface StudioThreeCutawayInput {
  readonly cameraMode: StudioThreeCameraMode;
  readonly cameraYaw: number;
  readonly enabledWalls?: readonly VirtualThreeCutawayWallSide[];
}

const DESKTOP_WALL_NORMALS: Readonly<Record<string, { readonly side: VirtualThreeCutawayWallSide; readonly nx: number; readonly nz: number }>> = Object.freeze({
  BG_Wall_North: { side: "north", nx: 0, nz: -1 },
  BG_Wall_South: { side: "south", nx: 0, nz: 1 },
  BG_Wall_West: { side: "west", nx: -1, nz: 0 },
  BG_Wall_East: { side: "east", nx: 1, nz: 0 },
});

const CUTAWAY_DOT_THRESHOLD = 0.25;
const MOBILE_FRONT_DOT_THRESHOLD = 0.15;

/**
 * Hero 3D BG의 Desktop 8노드(`BG_Wall_North/South/West/East`, `BG_Ceiling`)와
 * Mobile 4노드(`BG_Cutaway_Front`, `BG_Ceiling`)를 카메라 시점(Yaw + Mode)에 따라 자동 숨김·복원한다.
 *
 * - `first-person`: 방 내부 시점이므로 천장과 모든 벽을 표시(`hiddenCount === 0`).
 * - `quarter` / `third-person`: 카메라와 플레이어 사이에 놓인 벽과 천장을 자동 숨김.
 */
export function applyStudioThreeCutaway(
  root: THREE.Object3D,
  input: StudioThreeCutawayInput,
): StudioThreeCutawayResult {
  const enabledSet = input.enabledWalls
    ? new Set<VirtualThreeCutawayWallSide>(input.enabledWalls)
    : null;
  const allowSide = (side: VirtualThreeCutawayWallSide): boolean => enabledSet === null || enabledSet.has(side);

  // FollowCamera 기준: yaw에서 카메라는 포커스 기준 (+sin(yaw), +cos(yaw)) 방향에 위치한다.
  const camDirX = Math.sin(input.cameraYaw);
  const camDirZ = Math.cos(input.cameraYaw);
  const isFirstPerson = input.cameraMode === "first-person";

  let hasDesktopWall = false;
  let hasMobileFront = false;
  const hiddenNodeNames: string[] = [];

  root.traverse((node) => {
    const name = node.name;
    if (!name) return;

    if (name === "BG_Ceiling") {
      const shouldHide = !isFirstPerson && allowSide("ceiling");
      node.visible = !shouldHide;
      node.userData.cutawayHidden = shouldHide;
      if (shouldHide) hiddenNodeNames.push(name);
      return;
    }

    const desktopWall = DESKTOP_WALL_NORMALS[name];
    if (desktopWall) {
      hasDesktopWall = true;
      const dot = desktopWall.nx * camDirX + desktopWall.nz * camDirZ;
      const shouldHide = !isFirstPerson && allowSide(desktopWall.side) && dot > CUTAWAY_DOT_THRESHOLD;
      node.visible = !shouldHide;
      node.userData.cutawayHidden = shouldHide;
      if (shouldHide) hiddenNodeNames.push(name);
      return;
    }

    if (name === "BG_Cutaway_Front") {
      hasMobileFront = true;
      const anyWallAllowed = enabledSet === null
        || enabledSet.has("south")
        || enabledSet.has("west")
        || enabledSet.has("east")
        || enabledSet.has("north");
      const dotFront = camDirZ;
      const shouldHide = !isFirstPerson && anyWallAllowed && (
        input.cameraMode === "quarter"
          ? dotFront > -0.2
          : dotFront > MOBILE_FRONT_DOT_THRESHOLD
      );
      node.visible = !shouldHide;
      node.userData.cutawayHidden = shouldHide;
      if (shouldHide) hiddenNodeNames.push(name);
    }
  });

  const activeNodeTier: StudioThreeCutawayNodeTier = hasDesktopWall
    ? "desktop-8"
    : hasMobileFront
      ? "mobile-4"
      : "none";

  return {
    hiddenCount: hiddenNodeNames.length,
    hiddenNodeNames,
    mode: input.cameraMode,
    activeNodeTier,
  };
}

/** 숨겨진 모든 컷어웨이 노드의 가시성을 원래대로 복원한다. */
export function resetStudioThreeCutaway(root: THREE.Object3D): void {
  root.traverse((node) => {
    if (node.userData.cutawayHidden === true) {
      node.visible = true;
      node.userData.cutawayHidden = false;
    }
  });
}
