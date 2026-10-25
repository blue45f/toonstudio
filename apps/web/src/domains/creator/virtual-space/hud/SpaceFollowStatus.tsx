import { X } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { studioFollowModeCopy, type StudioFollowConfig } from "../studio-virtual-space-follow";

/**
 * 함께 걷기 상태 칩. 내가 따라가는 중이면 대상과 따라가기 방식(도슨트·벽 통과)을, 누가 나를 따라오는 중이면 그 이름(여러 명이면
 * '{이름} 님 외 N명')과 끝내기를 보인다(Gather follower banner 대응). 두 칩 모두 누르면 합의가 끝나 걷기가 멈춘다.
 */
export function SpaceFollowStatus({ followingName, followedByName, followedByNames, config, onStopFollowing, onStopLeading, onConfig }: {
  /** 내가 따라가는 사람. 없으면 null. */
  readonly followingName: string | null;
  /** 나를 따라오는 사람(내가 이끄는 중). 없으면 null. */
  readonly followedByName: string | null;
  /** 나를 따라오는 사람들 목록(여러 명일 때 '외 N명' 표기용). */
  readonly followedByNames?: readonly string[];
  readonly config: StudioFollowConfig;
  readonly onStopFollowing: () => void;
  readonly onStopLeading: () => void;
  readonly onConfig: (patch: Partial<StudioFollowConfig>) => void;
}) {
  const bt = useBilingual("SpaceFollowStatus");
  const followers = followedByNames?.length ? followedByNames : followedByName ? [followedByName] : [];
  const primaryFollower = followers[0] ?? null;
  const extraCount = Math.max(0, followers.length - 1);
  return <>
    {followingName ? <button type="button" className="space-status-chip" data-space-interactive="true" onClick={onStopFollowing}>
      {bt(`${followingName} 따라가는 중`, `Following ${followingName}`)} <X size={14} aria-hidden />
    </button> : null}
    {followingName ? <div className="space-status-chip" data-space-interactive="true">
      <p role="status">{studioFollowModeCopy(bt, config.mode)}</p>
      <button type="button" className="space-pill-button" aria-pressed={config.mode === "docent"} onClick={() => onConfig({ mode: config.mode === "docent" ? "standard" : "docent" })}>{bt("도슨트", "Docent")}</button>
      <button type="button" className="space-pill-button" aria-pressed={config.ignoreCollisions} onClick={() => onConfig({ ignoreCollisions: !config.ignoreCollisions })}>{bt("벽 통과", "Pass walls")}</button>
    </div> : null}
    {primaryFollower ? <button type="button" className="space-status-chip" data-space-interactive="true"
      title={bt("누르면 따라오기를 끝내요", "Press to stop being followed")} onClick={onStopLeading}>
      {extraCount > 0
        ? bt(`${primaryFollower} 님 외 ${extraCount}명이 따라오는 중`, `${primaryFollower} and ${extraCount} others are following you`)
        : bt(`${primaryFollower} 님이 따라오는 중`, `${primaryFollower} is following you`)} <X size={14} aria-hidden />
    </button> : null}
  </>;
}
