import { createContext } from "react";

export type StudioOfflinePreviewPhase = "checking" | "visible";

export interface StudioOfflinePreviewDisplay {
  readonly workId: string;
  readonly phase: StudioOfflinePreviewPhase;
}

/** 상태 영역은 현재 화면의 사본 확인 안내 또는 실제 읽기 전용 그림을 따른다. */
export const StudioOfflineOwnerPreviewVisibility = createContext<((display: StudioOfflinePreviewDisplay | null) => void) | null>(null);
