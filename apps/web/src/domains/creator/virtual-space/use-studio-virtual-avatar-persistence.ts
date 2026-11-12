import { useCallback, useRef, useState } from "react";

import { writeStudioVirtualSpaceAvatarIndex } from "./studio-virtual-space-entry-preference";

export type AvatarSaveStatus = "idle" | "saved" | "failed";

/** 현재 모습의 적용과 다음 접속을 위한 브라우저 저장은 별도로 확인한다. */
export function useStudioVirtualAvatarPersistence() {
  const latestChoice = useRef<number | null>(null);
  const [status, setStatus] = useState<AvatarSaveStatus>("idle");
  const save = useCallback((index: number) => {
    latestChoice.current = index;
    const saved = writeStudioVirtualSpaceAvatarIndex(index);
    setStatus(saved ? "saved" : "failed");
    return saved;
  }, []);
  const retry = useCallback(() => {
    if (latestChoice.current !== null) save(latestChoice.current);
  }, [save]);
  return { save, retry, status };
}

