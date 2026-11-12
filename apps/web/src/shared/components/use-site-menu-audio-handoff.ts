import { useCallback, useEffect, useRef } from "react";

import { requestSiteOstPanelOpen } from "@/shared/lib/site-background-music";

/** 메뉴의 배경 차단을 해제한 뒤 음악 패널로 조작 초점을 넘긴다. */
export function useSiteMenuAudioHandoff(menuOpen: boolean, locationKey: string, closeWithoutFocus: () => void) {
  const pending = useRef<{ key: string } | null>(null);
  useEffect(() => {
    const request = pending.current;
    if (!request || menuOpen) return;
    pending.current = null;
    if (request.key === locationKey) requestSiteOstPanelOpen();
  }, [locationKey, menuOpen]);
  return useCallback(() => {
    if (!menuOpen) return;
    pending.current = { key: locationKey };
    closeWithoutFocus();
  }, [closeWithoutFocus, locationKey, menuOpen]);
}
