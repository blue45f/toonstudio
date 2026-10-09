import type { ReactNode } from "react";

import type { StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import type { useStudioWorldPublication } from "./world-publication/use-studio-world-publication";

/**
 * 가상 작업실 본 화면(`VirtualSpaceExperience`)의 입력.
 * 페이지 셸(`StudioVirtualSpacePageRoot`)이 세션·입장 로비·월드 발행 상태를 모아 채운다.
 */
export interface VirtualSpaceExperienceProps {
  readonly homeHeader?: ReactNode;
  readonly personal?: boolean;
  readonly initialAvatarIndexOverride?: number;
  readonly initialArtStyleOverride?: StudioVirtualArtStyleKey;
  readonly nickname: string;
  readonly onNicknameChange: (nickname: string) => void;
  readonly publication: ReturnType<typeof useStudioWorldPublication>;
  readonly projectId: string;
  readonly preparing: boolean;
  readonly signedIn: boolean;
  /** Invite-link guest: no authoring, spawn at the inviter-chosen point. */
  readonly isGuest?: boolean;
  readonly guestSpawn?: { readonly x: number; readonly y: number } | null;
  /** 이번 세션에서 입장 로비를 처음 통과했으면 3단계 미니 투어를 띄운다. */
  readonly entryJustConfirmed?: boolean;
}
