import type { StudioFollowConfig } from "../studio-virtual-space-follow";
import type { StudioCameraPanStore } from "../studio-virtual-space-camera-pan";
import type { StudioVirtualSpaceSocialRequest } from "../studio-virtual-space-social";
import { isStudioSocialWalkTogether, studioSocialRequestFollowsPeer } from "../studio-virtual-space-social-walk";
import { SpaceCameraChip } from "./SpaceCameraChip";
import { SpaceFollowStatus } from "./SpaceFollowStatus";

/**
 * 이동·시점 상태 칩 묶음: 함께 걷기(내가 따라가는 중·누가 나를 따라오는 중)와 카메라 둘러보기를 한곳에 모아 페이지는 한 요소만 둔다.
 * 나를 따라오는 사람은 합의를 보고 정한다: 따라가기 요청을 받아 준 쪽, 따라오라고 요청한 쪽이 이끄는 쪽이다.
 */
export function SpaceMovementStatus({ followingName, sharedActivity, config, cameraPan, onStopFollowing, onStopLeading, onConfig, onRecentered }: {
  /** 내가 따라가는 사람. 없으면 null. */
  readonly followingName: string | null;
  /** 지금 서 있는 함께하기 합의(없으면 null). */
  readonly sharedActivity: Pick<StudioVirtualSpaceSocialRequest, "action" | "direction" | "peer"> | null;
  readonly config: StudioFollowConfig;
  readonly cameraPan: StudioCameraPanStore;
  readonly onStopFollowing: () => void;
  readonly onStopLeading: () => void;
  readonly onConfig: (patch: Partial<StudioFollowConfig>) => void;
  /** 마우스·터치로 '내 위치로'를 눌렀을 때(키보드 초점을 월드로 돌리는 데 쓴다). */
  readonly onRecentered?: () => void;
}) {
  const followedByName = sharedActivity && isStudioSocialWalkTogether(sharedActivity.action) && !studioSocialRequestFollowsPeer(sharedActivity)
    ? sharedActivity.peer.displayName : null;
  return <>
    <SpaceFollowStatus followingName={followingName} followedByName={followedByName} config={config}
      onStopFollowing={onStopFollowing} onStopLeading={onStopLeading} onConfig={onConfig} />
    <SpaceCameraChip store={cameraPan} onPointerUse={onRecentered} />
  </>;
}
