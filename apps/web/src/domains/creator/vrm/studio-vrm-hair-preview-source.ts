/**
 * 헤어 카드 썸네일이 참조하는 "지금 셰이퍼에 떠 있는 머리" — 마지막 두상 맞춤과 헤어 상태.
 *
 * 셰이퍼 뷰포트의 포지(`StudioVrmAvatarForge.tsx`)가 리그가 바뀔 때 두상 맞춤을, 헤어가 바뀔 때
 * 헤어 상태를 올린다. 카드 썸네일은 이 값으로 실제와 같은 헤어 메시를 따로 그린다. three.js 를
 * 가져오지 않는 가벼운 저장소라 카드 모듈이 정적으로 가져와도 번들이 무거워지지 않는다.
 */
import { useSyncExternalStore } from "react";

import type { AvatarForgeHairParams } from "./studio-vrm-avatar-forge";
import type { StudioVrmHeadFit } from "./studio-vrm-head-fit";

export interface StudioVrmHairPreviewSource {
  /** 마지막으로 잰 두상. 아직 모델이 없으면 null(썸네일은 표준 두상으로 그린다). */
  readonly head: StudioVrmHeadFit | null;
  /** 지금 적용된 헤어. 선택된 카드는 이 값을 그대로 그린다. */
  readonly hair: AvatarForgeHairParams | null;
  readonly revision: number;
}

const listeners = new Set<() => void>();
let source: StudioVrmHairPreviewSource = Object.freeze({ head: null, hair: null, revision: 0 });

function publish(next: Omit<StudioVrmHairPreviewSource, "revision">): void {
  if (next.head === source.head && next.hair === source.hair) return;
  source = Object.freeze({ ...next, revision: source.revision + 1 });
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 두상 맞춤을 올린다. 돌려준 함수는 같은 맞춤이 아직 현재일 때만 지운다(언마운트 정리). */
export function publishStudioVrmHairPreviewHead(head: StudioVrmHeadFit): () => void {
  publish({ head, hair: source.hair });
  return () => {
    if (source.head === head) publish({ head: null, hair: source.hair });
  };
}

/** 지금 적용된 헤어 상태를 올린다. */
export function publishStudioVrmHairPreviewHair(hair: AvatarForgeHairParams): void {
  publish({ head: source.head, hair });
}

export function readStudioVrmHairPreviewSource(): StudioVrmHairPreviewSource {
  return source;
}

export function useStudioVrmHairPreviewSource(): StudioVrmHairPreviewSource {
  return useSyncExternalStore(subscribe, readStudioVrmHairPreviewSource, readStudioVrmHairPreviewSource);
}
