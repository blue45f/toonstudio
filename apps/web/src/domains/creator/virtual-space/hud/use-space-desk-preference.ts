import { useMemo, useState } from "react";

import {
  readStudioOfficeDeskPreference,
  studioOfficeDeskPreferenceStorageKey,
  writeStudioOfficeDeskPreference,
  type StudioOfficeDeskPreferenceScope,
} from "../office-desk-preference";
import type { StudioVirtualSpaceWorldManifest } from "../studio-virtual-space-world-manifest";

/**
 * "내 자리"로 기억한 좌석 id (페이지에서 분리). 저장은 이 기기 로컬이고 점유·위치·권한에는 영향이 없다 — 실제 점유와 도착은
 * requestSlot의 서버 계약을 따른다. 기억한 자리가 지금 월드에 없으면 null이다. 같은 자리를 다시 고르면 기억을 지운다.
 */
export function useSpaceDeskPreference(
  scope: StudioOfficeDeskPreferenceScope,
  manifest: StudioVirtualSpaceWorldManifest,
  /** 이 기기에 저장하지 못했을 때(저장 공간 거부). */
  onSaveFailed: () => void,
): { readonly preferredSlotId: string | null; readonly preferDesk: (id: string) => void } {
  const scopeKey = studioOfficeDeskPreferenceStorageKey(scope);
  const [chosen, setChosen] = useState<ReadonlyMap<string, string | null>>(() => new Map());
  const stored = useMemo(() => readStudioOfficeDeskPreference(scope, manifest), [scope, manifest]);
  const candidate = chosen.has(scopeKey) ? chosen.get(scopeKey) : stored;
  const preferredSlotId = manifest.interactionSlots?.some((slot) => slot.id === candidate) ? candidate ?? null : null;
  const preferDesk = (id: string) => {
    const next = preferredSlotId === id ? null : id;
    if (!writeStudioOfficeDeskPreference(scope, manifest, next)) {
      onSaveFailed();
      return;
    }
    setChosen((current) => new Map(current).set(scopeKey, next));
  };
  return { preferredSlotId, preferDesk };
}
