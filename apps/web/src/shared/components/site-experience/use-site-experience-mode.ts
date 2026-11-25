import { useCallback, useEffect, useMemo, useState } from "react";

import { useSiteExperience, type SiteExperienceSettings } from "./site-experience-context";
import { EXPERIENCE_MODE_KEY, parseExperienceMode, type ExperienceMode } from "./site-experience-policy";

import { readBrowserPreference, writeBrowserPreference } from "@/shared/lib/browser-preferences";

function readMode(): ExperienceMode {
  return parseExperienceMode(readBrowserPreference(() => globalThis.localStorage, EXPERIENCE_MODE_KEY));
}

/** 배경을 만들지 않고 기존 사이트 연출 선택만 읽고 저장한다. */
export function useStoredSiteExperienceMode(): SiteExperienceSettings {
  const [mode, updateMode] = useState<ExperienceMode>(readMode);
  const setMode = useCallback((next: ExperienceMode) => {
    updateMode(next);
    writeBrowserPreference(() => globalThis.localStorage, EXPERIENCE_MODE_KEY, next);
  }, []);

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === EXPERIENCE_MODE_KEY || event.key === null) updateMode(readMode());
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  return useMemo(() => ({ mode, setMode }), [mode, setMode]);
}

/** 사이트에서는 즉시 반영하고, 작업 셸에서는 다음 사이트 방문의 선택만 저장한다. */
export function useSiteExperienceMode(): SiteExperienceSettings {
  const experience = useSiteExperience();
  const stored = useStoredSiteExperienceMode();
  return experience ?? stored;
}
