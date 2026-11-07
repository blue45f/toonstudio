import {
  Brush,
  ChevronDown,
  GraduationCap,
  Sparkles,
  X,
} from "lucide-react";
import { Component, Suspense, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { lazyRetry } from "@/shared/lib/lazy-retry";

import {
  requestStudioCreationMode,
  type StudioCreationMode,
} from "../studio-creation-mode";
import {
  readStudioCanvasStartDockCollapsed,
  rememberStudioCanvasStartDockCollapsed,
} from "./studio-canvas-start-dock-preference";
import { setStudioCanvasStartDockExpanded } from "./studio-canvas-start-dock-state";
import type { StudioCanvasStartMethodsProps } from "./StudioCanvasStartMethods";
import "./studio-canvas-start-dock.css";

// 실패한 청크를 다시 열면 새 lazy 인스턴스로 시도하되 공통 복구 가드는 그대로 따른다.
function createStartMethods() {
  return lazyRetry(
    () => import("./StudioCanvasStartMethods").then((module) => ({ default: module.StudioCanvasStartMethods })),
    "StudioCanvasStartMethods",
  );
}

interface StartMethodsBoundaryProps extends StudioCanvasStartMethodsProps {
  readonly loadingLabel: string;
  readonly errorLabel: string;
  readonly retryLabel: string;
  readonly onRestoreFocus: () => void;
}

/** 선택지 로딩 오류가 캔버스나 즉시 실행 버튼을 대신하지 않게 격리한다. */
class StartMethodsBoundary extends Component<StartMethodsBoundaryProps> {
  state = { failed: false, Methods: createStartMethods() };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onRestoreFocus();
  }

  private readonly retry = () => {
    this.props.onRestoreFocus();
    this.setState({ failed: false, Methods: createStartMethods() });
  };

  render() {
    if (this.state.failed) {
      return (
        <>
          <p role="alert" className="studio-canvas-start__status">{this.props.errorLabel}</p>
          <button type="button" className="studio-canvas-start__tutorial" onClick={this.retry} onKeyDown={this.props.onCloseWithEscape}>
            {this.props.retryLabel}
          </button>
        </>
      );
    }
    const { Methods } = this.state;
    return (
      <Suspense fallback={<p role="status" className="studio-canvas-start__status">{this.props.loadingLabel}</p>}>
        <Methods {...this.props} />
      </Suspense>
    );
  }
}

interface StudioCinematicCanvasWelcomeProps {
  readonly pageKey: string;
  readonly visible: boolean;
  readonly initiallyCollapsed?: boolean;
  /** 핵심 도구를 화면에서 차례로 안내하는 사용법 따라 하기를 연다. */
  readonly onOpenTutorial?: () => void;
}

/**
 * 빈 캔버스의 비차단 시작 도크. 캔버스 위쪽 한 줄만 차지하고 나머지 화면에서는 바로 그릴 수 있다.
 * 한 번 닫거나 방식을 고르면 이후 빈 페이지에서는 작은 "시작 방법" 버튼으로만 남는다.
 */
export function StudioCinematicCanvasWelcome({
  pageKey,
  visible,
  initiallyCollapsed = false,
  onOpenTutorial,
}: StudioCinematicCanvasWelcomeProps) {
  const bt = useBilingual("StudioCinematicCanvasWelcome");
  const waysId = useId();
  const reopenRef = useRef<HTMLButtonElement>(null);
  const waysRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const [waysOpen, setWaysOpen] = useState(false);
  const [dismissedPageKey, setDismissedPageKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(() => !initiallyCollapsed && !readStudioCanvasStartDockCollapsed());
  const [scenesOpen, setScenesOpen] = useState(false);
  const shown = visible && dismissedPageKey !== pageKey;
  const dockOpen = shown && expanded;

  useEffect(() => { if (initiallyCollapsed) setExpanded(false); }, [initiallyCollapsed]);

  // 펼친 도크가 유일한 시작 안내가 되도록 코치·인스펙터 시작 카드에 알린다.
  useEffect(() => {
    setStudioCanvasStartDockExpanded(dockOpen);
    return () => setStudioCanvasStartDockExpanded(false);
  }, [dockOpen]);

  useEffect(() => {
    if (restoreFocus.current) {
      (expanded ? waysRef : reopenRef).current?.focus({ preventScroll: true });
      restoreFocus.current = false;
    }
  }, [expanded]);

  if (!shown) return null;

  const collapseGuide = () => {
    restoreFocus.current = true;
    setExpanded(false);
    setWaysOpen(false);
    setScenesOpen(false);
    rememberStudioCanvasStartDockCollapsed();
  };

  const closeForPage = () => {
    setDismissedPageKey(pageKey);
    setScenesOpen(false);
    // 같은 편집 세션에서 새 빈 페이지를 만들어도 다시 펼치지 않고 접힌 버튼만 보여 준다.
    setExpanded(false);
    rememberStudioCanvasStartDockCollapsed();
  };

  const launch = (mode: StudioCreationMode) => {
    closeForPage();
    requestStudioCreationMode(mode);
  };

  const openTutorial = () => {
    closeForPage();
    onOpenTutorial?.();
  };

  // 도크 안의 어느 버튼에 초점이 있어도 Esc로 캔버스 편집에 바로 돌아간다.
  const closeWithEscape = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    collapseGuide();
  };

  if (!expanded) {
    return (
      <div className="studio-canvas-start studio-canvas-start--collapsed" data-studio-cinematic-canvas-welcome="collapsed">
        <button
          type="button"
          ref={reopenRef}
          className="studio-canvas-start__pill"
          aria-expanded={false}
          onClick={() => { restoreFocus.current = true; setWaysOpen(true); setExpanded(true); }}
        >
          <Sparkles size={14} aria-hidden="true" />
          <span className="studio-canvas-start__pill-long">{bt("빈 캔버스 · 시작 방법 보기", "Blank canvas · Show ways to start")}</span>
          <span className="studio-canvas-start__pill-short">{bt("시작 방법 보기", "Ways to start")}</span>
        </button>
        <button
          type="button"
          className="studio-canvas-start__pill-close"
          aria-label={bt("시작 안내 닫기", "Close start guide")}
          onClick={() => setDismissedPageKey(pageKey)}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <section
      className="studio-canvas-start"
      aria-label={bt("빈 캔버스 시작 방법", "Ways to start a blank canvas")}
      data-studio-cinematic-canvas-welcome="true"
      data-studio-mobile-coach="true"
    >
      <div className="studio-canvas-start__quick-actions">
        <button type="button" className="studio-canvas-start__tutorial" onKeyDown={closeWithEscape} onClick={() => launch("draw")}>
          <Brush size={14} aria-hidden="true" />{bt("바로 그리기", "Draw now")}
        </button>
        {onOpenTutorial ? (
          <button type="button" className="studio-canvas-start__tutorial" onKeyDown={closeWithEscape} onClick={openTutorial}>
            <GraduationCap size={14} aria-hidden="true" />{bt("사용법 따라 하기", "Guided tour")}
          </button>
        ) : null}
        <button ref={waysRef} type="button" className="studio-canvas-start__scenes-toggle" aria-expanded={waysOpen} aria-controls={waysId} onKeyDown={closeWithEscape} onClick={() => setWaysOpen((value) => !value)}>
          {bt("다른 시작 방법", "More ways to start")}<ChevronDown size={14} aria-hidden="true" />
        </button>
        <button type="button" className="studio-canvas-start__pill-close" aria-label={bt("시작 안내 닫기", "Close start guide")} onClick={collapseGuide} onKeyDown={closeWithEscape}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div id={waysId} hidden={!waysOpen}>
        {waysOpen ? (
          <StartMethodsBoundary
            scenesOpen={scenesOpen}
            onToggleScenes={() => setScenesOpen((open) => !open)}
            onLaunch={launch}
            onOpenTutorial={onOpenTutorial ? openTutorial : undefined}
            onCloseWithEscape={closeWithEscape}
            onRestoreFocus={() => waysRef.current?.focus({ preventScroll: true })}
            loadingLabel={bt("시작 방법을 불러오는 중…", "Loading ways to start…")}
            errorLabel={bt("시작 방법을 불러오지 못했어요. 다시 시도하거나 바로 그리기를 선택해 주세요.", "Couldn't load ways to start. Try again or choose Draw now.")}
            retryLabel={bt("시작 방법 다시 불러오기", "Retry loading ways to start")}
          />
        ) : null}
      </div>
    </section>
  );
}
