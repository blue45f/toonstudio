/**
 * StudioWebtoonTensionMapEntry — 텐션 맵 탭의 지연 로드 문.
 *
 * 탭이 처음 활성화될 때만 본문 청크(`StudioWebtoonTensionMapTab`)를 요청한다. 그 전에는 아무것도
 * 그리지 않고 아무것도 내려받지 않는다. 한 번 불러온 뒤에는 탭을 떠나도 본문을 계속 마운트해 두고
 * 숨기기만 한다 — 입력한 대본·선택한 컷이 탭을 오가도 사라지지 않는다(이웃 탭들이 보조 센터가 열려
 * 있는 동안 상태를 유지하는 것과 같다).
 *
 * 요청이 실패해도 캔버스는 그대로고, `다시 시도` 가 같은 공유 로더로 다시 요청한다.
 */

import { RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { STUDIO_EASE, STUDIO_FOCUS_RING, STUDIO_TOUCH_TARGET, StudioSurfaceState } from "../studio-panel-ui";

import { studioWebtoonTensionMapLoader } from "./studio-webtoon-tension-map-loader";

import type { StudioWebtoonTensionMapTabProps } from "./StudioWebtoonTensionMapTab";

type TensionMapTabModule = typeof import("./StudioWebtoonTensionMapTab");

const bi = (ko: string, en: string): string =>
  translateBilingualValueForActiveLocale("StudioWebtoonTensionMapEntry", ko, en);

export interface StudioWebtoonTensionMapEntryProps extends StudioWebtoonTensionMapTabProps {
  /** 텐션 맵 탭이 지금 선택돼 있는가. */
  readonly active: boolean;
}

export function StudioWebtoonTensionMapEntry({ active, ...tabProps }: StudioWebtoonTensionMapEntryProps) {
  useBilingualI18nRevision();
  const [loaded, setLoaded] = useState<TensionMapTabModule | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!active || loaded) return;
    let live = true;
    setFailed(false);
    studioWebtoonTensionMapLoader.load().then(
      (module) => {
        if (live) setLoaded(module);
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [active, loaded, attempt]);

  if (loaded) {
    return (
      <div hidden={!active}>
        <loaded.StudioWebtoonTensionMapTab {...tabProps} />
      </div>
    );
  }
  if (!active) return null;
  if (failed) {
    return (
      <StudioSurfaceState
        state="error"
        title={bi("텐션 맵을 불러오지 못했어요", "Could not load the tension map")}
        description={bi(
          "캔버스는 그대로 유지돼요. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.",
          "Your canvas is untouched. Check your connection and try again.",
        )}
        action={
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-raised px-3 text-[0.68rem] font-bold text-fg hover:bg-card",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
              STUDIO_TOUCH_TARGET,
            )}
          >
            <RotateCcw className="size-3.5" aria-hidden />
            {bi("다시 시도", "Try again")}
          </button>
        }
      />
    );
  }
  return (
    <StudioSurfaceState
      state="loading"
      title={bi("텐션 맵을 여는 중…", "Opening the tension map…")}
    />
  );
}
