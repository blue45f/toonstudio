import { Check, ChevronDown, CircleSlash, MonitorSmartphone, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import {
  dismissMobileFullEditNotice,
  isMobileFullEditNoticeDismissed,
} from "../mobile-full-edit-notice-storage";
import {
  STUDIO_TOUCH_NARROW_QUERY,
  STUDIO_TOUCH_TABLET_QUERY,
  type StudioMobileTouchTier,
} from "../studio-mobile-touch-flow";

import { useBilingual, type BilingualText } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

/** StudioEditorRoute 의 데스크톱 프리로드 분기와 같은 경계. 이보다 좁으면 풀 편집 도구가 접힌다. */
export const MOBILE_FULL_EDIT_NOTICE_QUERY = STUDIO_TOUCH_NARROW_QUERY;

/** 태블릿 가로(데스크톱 폭 + 터치 주 포인터)에서도 안내를 띄우는 경계. 정본은 studio-mobile-touch-flow. */
export const MOBILE_TOUCH_TABLET_NOTICE_QUERY = STUDIO_TOUCH_TABLET_QUERY;

export interface MobileFullEditNoticeProps {
  /** 표면별 닫힘 기억 키. 예: "studio-editor-canvas". */
  readonly surfaceId: string;
  /** 안내 제목에 들어가는 표면 이름. 예: { ko: "캔버스 편집기", en: "Canvas editor" }. */
  readonly surfaceLabel: BilingualText;
  /** 이 기기에서도 지금 바로 할 수 있는 작업 목록. 진입 시점에 경계를 명시하는 핵심 정보다. */
  readonly mobileCapabilities: readonly BilingualText[];
  /**
   * 이 기기에서 안 되는 작업 목록(선택). 표면별 정본(studio-mobile-touch-flow)이 있을 때만 넘긴다.
   * 가능 목록만 보여 주면 사용자는 눌러 보고 나서야 경계를 알게 되므로, 안 되는 작업은
   * 진입 시점에 이유·대체 경로와 함께 먼저 알린다.
   */
  readonly mobileLimitations?: readonly BilingualText[];
  /** 표면별 터치 등급. 안내 DOM에 data 속성으로 노출해 E2E·계약 테스트가 경계를 고정한다. */
  readonly touchTier?: StudioMobileTouchTier;
}

function useViewportQuery(queryText: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(queryText);
    const sync = () => setMatches(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [queryText]);
  return matches;
}

/**
 * 처음에는 표면별 제한만 짧게 알리고 상세 목록은 사용자가 펼친다.
 * 닫은 뒤에도 다시 여는 버튼을 남기며, 안내는 편집을 차단하거나 포커스를 가두지 않는다.
 * 표면이 바뀌면 닫힘 기억을 새로 읽어 다른 도구의 제한을 누락하지 않는다.
 */
export function MobileFullEditNotice(props: MobileFullEditNoticeProps) {
  const narrow = useViewportQuery(MOBILE_FULL_EDIT_NOTICE_QUERY);
  const touchTablet = useViewportQuery(MOBILE_TOUCH_TABLET_NOTICE_QUERY);

  if (!narrow && !touchTablet) return null;
  return <MobileFullEditNoticeContent key={props.surfaceId} {...props} />;
}

function MobileFullEditNoticeContent({
  surfaceId,
  surfaceLabel,
  mobileCapabilities,
  mobileLimitations,
  touchTier,
}: MobileFullEditNoticeProps) {
  const bt = useBilingual("MobileFullEditNotice");
  const [dismissed, setDismissed] = useState(() => isMobileFullEditNoticeDismissed(surfaceId));
  const [expanded, setExpanded] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const detailsId = useId();
  const limitations = mobileLimitations ?? [];
  const compact = dismissed && !expanded;
  // 정본 계획의 제한을 그대로 요약에 써서, 펼치기 전에도 현재 도구의 경계를 알린다.
  const firstLimitation = limitations[0];
  const reservedBottom = "max(var(--studio-canvas-bottom-inset, 4.75rem), var(--studio-mobile-dock-measured-height, 0px), env(safe-area-inset-bottom))";

  const close = () => {
    dismissMobileFullEditNotice(surfaceId);
    setDismissed(true);
    setExpanded(false);
    // 토글은 닫힘 전후 같은 DOM 노드다. 사라지는 버튼에 포커스를 남기지 않는다.
    toggleRef.current?.focus({ preventScroll: true });
  };

  const handleEscape = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Escape" || compact) return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };

  return (
    <aside
      data-testid="mobile-full-edit-notice"
      data-studio-mobile-full-edit-notice="true"
      data-studio-mobile-touch-tier={touchTier}
      data-studio-mobile-notice-expanded={expanded}
      data-studio-mobile-notice-compact={compact}
      data-studio-shortcut-boundary="true"
      aria-label={bt("모바일 편집 안내", "Mobile editing notice")}
      className={cn(
        "fixed z-[90] flex flex-col overflow-hidden rounded-2xl border border-line bg-card/95 text-fg shadow-lg backdrop-blur-md",
        compact ? "right-3 max-w-[calc(100vw-1.5rem)]" : "inset-x-3 mx-auto max-w-lg",
      )}
      style={{
        bottom: `calc(${reservedBottom} + 0.5rem)`,
        maxHeight: `calc(100dvh - ${reservedBottom} - env(safe-area-inset-top) - 1rem)`,
      }}
    >
      <div className="flex shrink-0 items-center gap-1 px-1">
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={() => setExpanded((value) => !value)}
          onKeyDown={handleEscape}
          className="inline-flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-2 text-left text-sm font-bold hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        >
          <MonitorSmartphone className="size-4 shrink-0 text-accent" aria-hidden="true" />
          <span>{bt("기기 안내", "Device guide")}</span>
          {" "}
          {!compact ? <span className="text-xs font-normal text-fg-2">{expanded ? bt("접기", "Collapse") : bt("가능한 작업 보기", "View available tasks")}</span> : null}
          <ChevronDown className={cn("ml-auto size-4 shrink-0", expanded && "rotate-180")} aria-hidden="true" />
        </button>
        {!compact ? (
          <button
            type="button"
            onClick={close}
            onKeyDown={handleEscape}
            aria-label={bt("모바일 편집 안내 닫기", "Dismiss mobile editing notice")}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain px-3">
        {!compact ? (
          <p className="pb-3 text-xs leading-5 text-fg-2">
            <strong className="block font-semibold text-fg">{bt(surfaceLabel.ko, surfaceLabel.en)}</strong>
            {!expanded ? (firstLimitation
              ? bt(firstLimitation.ko, firstLimitation.en)
              : bt("정밀 편집은 데스크톱이 편해요. 이 기기에서 가능한 작업을 확인하세요.", "Precision editing works best on desktop. Check the tasks available on this device.")) : null}
          </p>
        ) : null}
        <div id={detailsId} hidden={!expanded}>
          <h2 className="text-xs font-bold leading-5">{bt("지금 할 수 있어요", "Available now")}</h2>
          <ul className="mt-2 space-y-1">
            {mobileCapabilities.map((capability) => (
              <li key={capability.ko} className="flex items-start gap-1.5 text-xs leading-5 text-fg">
                <Check className="mt-0.5 size-3.5 shrink-0 text-good" aria-hidden="true" />
                {bt(capability.ko, capability.en)}
              </li>
            ))}
          </ul>
          {limitations.length > 0 ? (
            <>
              <h2 className="mt-3 text-xs font-bold leading-5 text-fg">
                {bt("이 기기에서는 안 돼요", "Not available on this device")}
              </h2>
              <ul className="mt-1 space-y-1">
                {limitations.map((limitation) => (
                  <li key={limitation.ko} className="flex items-start gap-1.5 text-xs leading-5 text-fg-2">
                    <CircleSlash className="mt-0.5 size-3.5 shrink-0 text-bad" aria-hidden="true" />
                    {bt(limitation.ko, limitation.en)}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <button
            type="button"
            onClick={close}
            onKeyDown={handleEscape}
            className="my-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-accent px-3 text-sm font-bold text-on-accent transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
          >
            {bt("안내 접고 계속하기", "Close guide and continue")}
          </button>
        </div>
      </div>
    </aside>
  );
}
