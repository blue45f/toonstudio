import { Check, MonitorSmartphone, X } from "lucide-react";
import { useEffect, useState } from "react";

import {
  dismissMobileFullEditNotice,
  isMobileFullEditNoticeDismissed,
} from "../mobile-full-edit-notice-storage";

import { useBilingual, type BilingualText } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

/** StudioEditorRoute 의 데스크톱 프리로드 분기와 같은 경계. 이보다 좁으면 풀 편집 도구가 접힌다. */
export const MOBILE_FULL_EDIT_NOTICE_QUERY = "(max-width: 1023px)";

export interface MobileFullEditNoticeProps {
  /** 표면별 닫힘 기억 키. 예: "studio-editor-canvas". */
  readonly surfaceId: string;
  /** 안내 제목에 들어가는 표면 이름. 예: { ko: "캔버스 편집기", en: "Canvas editor" }. */
  readonly surfaceLabel: BilingualText;
  /** 이 기기에서도 지금 바로 할 수 있는 작업 목록. 진입 시점에 경계를 명시하는 핵심 정보다. */
  readonly mobileCapabilities: readonly BilingualText[];
}

function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(MOBILE_FULL_EDIT_NOTICE_QUERY);
    const sync = () => setNarrow(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return narrow;
}

/**
 * 풀 편집 표면에 좁은 화면으로 들어왔을 때의 진입 안내 패턴.
 *
 * 데스크톱 UI가 그대로 좁아지면 "되는지 안 되는지"를 직접 눌러 보기 전에는 알 수 없다는
 * inclusion 발견 7의 마찰을 없앤다: 차단하지 않는 배너로 (1) 정밀 편집은 데스크톱이 편하다는 것,
 * (2) 이 기기에서 되는 작업 목록을 진입 즉시 알리고, 닫으면 같은 세션에서는 다시 띄우지 않는다.
 * 데스크톱 폭에서는 렌더링하지 않는다.
 */
export function MobileFullEditNotice({ surfaceId, surfaceLabel, mobileCapabilities }: MobileFullEditNoticeProps) {
  const bt = useBilingual("MobileFullEditNotice");
  const narrow = useNarrowViewport();
  const [dismissed, setDismissed] = useState<boolean>(() => isMobileFullEditNoticeDismissed(surfaceId));

  if (!narrow || dismissed) return null;

  const close = () => {
    dismissMobileFullEditNotice(surfaceId);
    setDismissed(true);
  };

  return (
    <aside
      data-testid="mobile-full-edit-notice"
      aria-label={bt("모바일 편집 안내", "Mobile editing notice")}
      className={cn(
        "fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-[90]",
        "rounded-2xl border border-line bg-card/95 p-4 text-fg shadow-lg backdrop-blur-md",
      )}
    >
      <div className="flex items-start gap-3">
        <MonitorSmartphone className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-5">
            {bt(
              `${surfaceLabel.ko} 풀 편집은 데스크톱에서 가장 편해요`,
              `Full editing in the ${surfaceLabel.en} works best on desktop`,
            )}
          </p>
          <p className="mt-1 text-xs leading-5 text-fg-2">
            {bt(
              "이 기기에서는 정밀 편집 도구가 접혀 있어요. 대신 아래 작업은 지금 바로 할 수 있어요.",
              "Precision tools are folded away on this device. You can still do the following right now:",
            )}
          </p>
          <ul className="mt-2 space-y-1">
            {mobileCapabilities.map((capability) => (
              <li key={capability.ko} className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                <Check className="size-3.5 shrink-0 text-good" aria-hidden="true" />
                {bt(capability.ko, capability.en)}
              </li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label={bt("모바일 편집 안내 닫기", "Dismiss mobile editing notice")}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <button
        type="button"
        onClick={close}
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-accent px-3 text-sm font-bold text-on-accent transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {bt("이해했어요", "Got it")}
      </button>
    </aside>
  );
}
