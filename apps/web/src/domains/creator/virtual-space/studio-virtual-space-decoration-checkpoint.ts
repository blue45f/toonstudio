import { decorationStorageKey, parseStudioVirtualDecorationState, type StudioVirtualDecorationState } from "./studio-virtual-space-customization";

import { accessStudioSpaceRecord } from "./studio-space-device-record";

export interface StudioDecorationCheckpoint {
  readonly state: StudioVirtualDecorationState;
  readonly base: number | null;
  readonly pending: boolean;
  readonly id: string;
}

function decodeDecorationCheckpoint(raw: string | null): StudioDecorationCheckpoint | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value.id !== "string" || typeof value.pending !== "boolean" ||
      !(value.base === null || (Number.isSafeInteger(value.base) && value.base >= 0))) return null;
    const state = parseStudioVirtualDecorationState(value.state);
    return state ? { state, pending: value.pending, base: value.base, id: value.id } : null;
  } catch { return null; }
}

/** 서버 응답의 저장은 같은 계정·공간에서 원래 보낸 초안이 남아 있을 때만 허용한다. */
export function studioDecorationCheckpointStore(owner: string | null, scope: string) {
  const key = "toonspectrum:space-decoration-checkpoint:v1:" + JSON.stringify([owner, scope]);
  return {
    async read(): Promise<StudioDecorationCheckpoint | null> {
      const raw = await accessStudioSpaceRecord(key);
      if (raw !== null || owner !== null) return decodeDecorationCheckpoint(raw);
      // 계정 없는 기기의 구판에는 편집 상태만 있었다. 원본이 있는 공간에서만 가져온다.
      const previous = await accessStudioSpaceRecord(decorationStorageKey(scope))
        ?? await accessStudioSpaceRecord(decorationStorageKey());
      if (previous === null) return null;
      try {
        const state = parseStudioVirtualDecorationState(JSON.parse(previous));
        return state ? { state, base: null, pending: false, id: "legacy-device" } : null;
      } catch { return null; }
    },
    async write(value: StudioDecorationCheckpoint, expected?: string | null): Promise<boolean> {
      const encoded = JSON.stringify(value);
      try {
        const written = await accessStudioSpaceRecord(key, raw => {
          const previous = decodeDecorationCheckpoint(raw);
          if (expected !== undefined && expected !== (previous?.id ?? null)) return { value: raw };
          return { value: encoded, preserveDamaged: raw !== null && !previous };
        });
        return written === encoded;
      } catch { return false; }
    },
  };
}
