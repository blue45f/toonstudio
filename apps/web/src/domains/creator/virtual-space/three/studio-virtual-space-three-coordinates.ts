import type { StudioVirtualSpaceFacing } from "../studio-virtual-space-model";
import { STUDIO_THREE_SCALE, threeToWorld, worldToThree } from "./studio-virtual-space-three-coords";

export { STUDIO_THREE_SCALE, threeToWorld, worldToThree };

export function facingToYawRadians(facing: StudioVirtualSpaceFacing): number {
  switch (facing) {
    case "down":
      return 0;
    case "right":
      return Math.PI * 0.5;
    case "up":
      return Math.PI;
    case "left":
      return -Math.PI * 0.5;
  }
}

export function shortestAngleLerp(current: number, target: number, alpha: number): number {
  let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * Math.min(1, Math.max(0, alpha));
}
