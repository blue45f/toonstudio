import { X } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { studioFollowModeCopy, type StudioFollowConfig } from "../studio-virtual-space-follow";

/**
 * 함께 걷기 상태 칩. 내가 따라가는 중이면 대상과 따라가기 방식(도슨트·벽 통과)을, 누가 나를 따라오는 중이면 그 이름과
 * 끝내기를 보인다. 두 칩 모두 누르면 합의가 끝나 걷기가 멈춘다.
 */
export function SpaceFollowStatus({ followingName, followedByName, config, onStopFollowing, onStopLeading, onConfig }: {
  /** 내가 따라가는 사람. 없으면 null. */
  readonly followingName: string | null;
  /** 나를 따라오는 사람(내가 이끄는 중). 없으면 null. */
  readonly followedByName: string | null;
  readonly config: StudioFollowConfig;
  readonly onStopFollowing: () => void;
  readonly onStopLeading: () => void;
  readonly onConfig: (patch: Partial<StudioFollowConfig>) => void;
}) {
  const bt = useBilingual("SpaceFollowStatus");
  return <>
    {followingName ? <button type="button" className="space-status-chip" data-space-interactive="true" onClick={onStopFollowing}>
      {bt(`${followingName} 따라가는 중`, `Following ${followingName}`)} <X size={14} aria-hidden />
    </button> : null}
    {followingName ? <div className="space-status-chip" data-space-interactive="true">
      <p role="status">{studioFollowModeCopy(bt, config.mode)}</p>
      <button type="button" className="space-pill-button" aria-pressed={config.mode === "docent"} onClick={() => onConfig({ mode: config.mode === "docent" ? "standard" : "docent" })}>{bt("도슨트", "Docent")}</button>
      <button type="button" className="space-pill-button" aria-pressed={config.ignoreCollisions} onClick={() => onConfig({ ignoreCollisions: !config.ignoreCollisions })}>{bt("벽 통과", "Pass walls")}</button>
    </div> : null}
    {followedByName ? <button type="button" className="space-status-chip" data-space-interactive="true"
      title={bt("누르면 따라오기를 끝내요", "Press to stop being followed")} onClick={onStopLeading}>
      {bt(`${followedByName} 님이 따라오는 중`, `${followedByName} is following you`)} <X size={14} aria-hidden />
    </button> : null}
  </>;
}
