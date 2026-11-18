import { parseStudioVirtualDecorationState, type StudioVirtualDecorationState } from "./studio-virtual-space-customization";

export interface StudioDecorationCheckpoint {
  readonly state: StudioVirtualDecorationState;
  readonly base: number | null;
  readonly pending: boolean;
  readonly id: string;
}

/** 편집본과 기준 리비전을 한 번에 기록해 종료 직전 편집도 같은 계정·공간에서 복구한다. */
export function studioDecorationCheckpointStore(owner: string, scope: string) {
  const key = "toonspectrum:space-decoration-checkpoint:v1:" + JSON.stringify([owner, scope]);
  return {
    read(): StudioDecorationCheckpoint | null {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const value = JSON.parse(raw);
        if (!value || typeof value.id !== "string" || typeof value.pending !== "boolean" ||
          !(value.base === null || (Number.isSafeInteger(value.base) && value.base >= 0))) return null;
        const state = parseStudioVirtualDecorationState(value.state);
        return state ? { state, pending: value.pending, base: value.base, id: value.id } : null;
      } catch { return null; }
    },
    write(value: StudioDecorationCheckpoint) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch { return false; }
    },
  };
}
