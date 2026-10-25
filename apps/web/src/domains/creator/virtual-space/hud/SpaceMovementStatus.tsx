import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioFollowConfig } from "../studio-virtual-space-follow";
import type { StudioCameraPanStore } from "../studio-virtual-space-camera-pan";
import type { StudioVirtualSpaceSocialRequest } from "../studio-virtual-space-social";
import { isStudioSocialWalkTogether, studioSocialRequestFollowsPeer } from "../studio-virtual-space-social-walk";
import { SpaceCameraChip } from "./SpaceCameraChip";
import { SpaceFollowStatus } from "./SpaceFollowStatus";
import type { SpaceProximityRangeMode } from "./space-proximity-media";

/**
 * 이동·시점·음향 상태 칩 묶음: 함께 걷기(내가 따라가는 중·누가 나를 따라오는 중), 카메라 둘러보기,
 * 1:1 귓속말(Whisper), 조용히 모드(Quiet Mode)를 한곳에 모아 페이지는 한 요소만 둔다.
 * 나를 따라오는 사람은 합의를 보고 정한다: 따라가기 요청을 받아 준 쪽, 따라오라고 요청한 쪽이 이끄는 쪽이다.
 */
export function SpaceMovementStatus({
  followingName, sharedActivity, socialRequests, config, cameraPan,
  whisperPeerName = null, proximityRange = "standard",
  onStopFollowing, onStopLeading, onStopWhisper, onResetProximityRange, onConfig, onRecentered,
}: {
  /** 내가 따라가는 사람. 없으면 null. */
  readonly followingName: string | null;
  /** 지금 서 있는 함께하기 합의(없으면 null). */
  readonly sharedActivity: Pick<StudioVirtualSpaceSocialRequest, "action" | "direction" | "peer"> | null;
  /** 수락된 전체 함께 걷기 요청 목록(여러 명이 나를 따라올 때 모두 집계한다). */
  readonly socialRequests?: readonly Pick<StudioVirtualSpaceSocialRequest, "action" | "direction" | "peer" | "status">[];
  readonly config: StudioFollowConfig;
  readonly cameraPan: StudioCameraPanStore;
  /** 1:1 귓속말 중인 팀원 이름(없으면 null). */
  readonly whisperPeerName?: string | null;
  /** 근접 음성 범위 모드(standard가 아니면 상태 칩을 보여 준다). */
  readonly proximityRange?: SpaceProximityRangeMode;
  readonly onStopFollowing: () => void;
  readonly onStopLeading: () => void;
  readonly onStopWhisper?: () => void;
  readonly onResetProximityRange?: () => void;
  readonly onConfig: (patch: Partial<StudioFollowConfig>) => void;
  /** 마우스·터치로 '내 위치로'를 눌렀을 때(키보드 초점을 월드로 돌리는 데 쓴다). */
  readonly onRecentered?: () => void;
}) {
  const bt = useBilingual("SpaceMovementStatus");
  const followerNames: string[] = [];
  if (sharedActivity && isStudioSocialWalkTogether(sharedActivity.action) && !studioSocialRequestFollowsPeer(sharedActivity)) {
    followerNames.push(sharedActivity.peer.displayName);
  }
  for (const request of socialRequests ?? []) {
    if (
      request.status === "accepted"
      && isStudioSocialWalkTogether(request.action)
      && !studioSocialRequestFollowsPeer(request)
      && !followerNames.includes(request.peer.displayName)
    ) {
      followerNames.push(request.peer.displayName);
    }
  }
  const followedByName = followerNames[0] ?? null;
  return <>
    <SpaceFollowStatus followingName={followingName} followedByName={followedByName} followedByNames={followerNames} config={config}
      onStopFollowing={onStopFollowing} onStopLeading={onStopLeading} onConfig={onConfig} />
    <SpaceCameraChip store={cameraPan} onPointerUse={onRecentered} />
    {whisperPeerName ? <div className="space-status-chip" data-space-interactive="true">
      <p role="status">{bt(`1:1 귓속말 중 · ${whisperPeerName} 님만 들려요`, `Whispering 1:1 · only ${whisperPeerName} is in scope`)}</p>
      {onStopWhisper ? <button type="button" className="space-pill-button" onClick={onStopWhisper}>{bt("끝내기", "End")}</button> : null}
    </div> : null}
    {proximityRange !== "standard" ? <div className="space-status-chip" data-space-interactive="true">
      <p role="status">{proximityRange === "quiet"
        ? bt("조용히 모드 · 바로 옆 사람만 들려요 (U)", "Quiet mode · only people right next to you (U)")
        : bt("근접 음성 끔 · 주변 소리를 듣지 않아요", "Proximity audio off · nearby voices muted")}</p>
      {onResetProximityRange ? <button type="button" className="space-pill-button" onClick={onResetProximityRange}>{bt("기본으로", "Standard")}</button> : null}
    </div> : null}
  </>;
}
