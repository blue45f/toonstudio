import type { StudioPoseFrameState } from "../studio-virtual-space-engine-bridge";
import type { StudioVirtualSpacePoint } from "../studio-virtual-space-model";
import type { StudioSpacePoseRequest } from "../studio-virtual-space-pose-controller";
import type { Office2dSeatVisual } from "./office2d-scene";

/** 명시적으로 일어선 동안에는 같은 자리에 멈춰 있어도 자동 착석으로 덮지 않는다. */
export class Office2dSelfPose {
  private automaticSeatSuppressed = false;

  reset(): void { this.automaticSeatSuppressed = false; }

  resolveSeat(input: {
    readonly request: StudioSpacePoseRequest | null;
    readonly pose: StudioPoseFrameState;
    readonly moving: boolean;
    readonly hasPath: boolean;
    readonly point: StudioVirtualSpacePoint;
    readonly leasedPoint?: StudioVirtualSpacePoint;
    readonly occupiedSeatIds: ReadonlySet<string>;
    readonly findSeat: (point: StudioVirtualSpacePoint, maxDistance: number) => Office2dSeatVisual | null;
  }): Office2dSeatVisual | null {
    if (input.moving || input.request === "rest") this.reset();
    else if (input.request === "stand") this.automaticSeatSuppressed = true;
    if (input.moving || this.automaticSeatSuppressed || input.pose.pose === "lie") return null;
    const point = input.leasedPoint ?? (input.pose.pose === "sit" ? input.pose.anchor?.point : undefined);
    const requestedSeat = point ? input.findSeat(point, 18) : null;
    if (requestedSeat || input.hasPath) return requestedSeat;
    const candidate = input.findSeat(input.point, 18);
    return candidate && !input.occupiedSeatIds.has(candidate.id) ? candidate : null;
  }
}
