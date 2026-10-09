import type { StudioVirtualSpaceSocialAction, StudioVirtualSpaceSocialRequest } from "./studio-virtual-space-social";

/**
 * 함께 걷기 합의의 역할 규칙.
 *
 * 'follow'(함께 이동 요청)는 요청을 보낸 쪽이 상대를 따라가고, 'lead'(따라오라고 요청)는 요청을 받아
 * 수락한 쪽이 요청자를 따라간다. 합의는 양쪽이 함께 들고 있지만 걷는 쪽은 하나뿐이다.
 */

/** 한쪽이 다른 쪽을 따라가는 합의인가. */
export function isStudioSocialWalkTogether(
  action: StudioVirtualSpaceSocialAction | undefined,
): action is "follow" | "lead" {
  return action === "follow" || action === "lead";
}

/**
 * 합의가 선 뒤 이 클라이언트가 상대를 따라가는 쪽인가.
 * 따라가는 쪽은 자기 이동이 곧 따라가기를 끊는 일이므로 합의도 끝내야 한다. 이끄는 쪽은 마음껏 움직여야 하므로
 * 자기 이동·채팅 입력으로는 합의가 끝나지 않는다.
 */
export function studioSocialRequestFollowsPeer(
  request: Pick<StudioVirtualSpaceSocialRequest, "action" | "direction">,
): boolean {
  return (request.action === "follow" && request.direction === "outgoing")
    || (request.action === "lead" && request.direction === "incoming");
}
