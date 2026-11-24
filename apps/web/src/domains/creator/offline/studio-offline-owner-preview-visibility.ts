import { createContext } from "react";

/** 실제로 표시된 기기 사본의 원고 ID만 편집기 상태 영역에 알린다. */
export const StudioOfflineOwnerPreviewVisibility = createContext<((workId: string | null) => void) | null>(null);
