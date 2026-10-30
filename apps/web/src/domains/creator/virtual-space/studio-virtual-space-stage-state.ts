import type { StudioVirtualSpaceFacing, StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioSpacePose } from "./studio-virtual-space-pose-controller";

/** 엔진 객체나 테마를 담지 않는 공통 presence 입력 DTO다. */
export interface StudioVirtualSpaceEngineLocalState {
  readonly point: StudioVirtualSpacePoint;
  readonly facing: StudioVirtualSpaceFacing;
  readonly moving: boolean;
  readonly zoneId: string;
  /** 자세의 의미는 공통 계약이 소유하고 표현 리그는 각 renderer가 소유한다. */
  readonly pose?: StudioSpacePose;
}
