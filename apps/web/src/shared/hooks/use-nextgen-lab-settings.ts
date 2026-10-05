import { useSyncExternalStore } from "react";

import {
  getNextgenLabSettingsSnapshot,
  subscribeNextgenLabSettings,
  type NextgenLabSettings,
} from "@/shared/lib/nextgen-lab-settings";

/** 실험 기능 설정을 구독하는 훅 — 설정 화면에서 바꾸면 열린 화면에도 바로 반영된다. */
export function useNextgenLabSettings(): NextgenLabSettings {
  return useSyncExternalStore(
    subscribeNextgenLabSettings,
    getNextgenLabSettingsSnapshot,
    getNextgenLabSettingsSnapshot,
  );
}
