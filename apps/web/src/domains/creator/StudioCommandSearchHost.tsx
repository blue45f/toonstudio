/**
 * 통합 Command Search 진입점 — 버튼과 **⌘K / Ctrl+K / F1** 바인딩.
 *
 * F1 은 Studio 호스트가 직접 처리한다. 앱 전역 ⌘K / Ctrl+K 는 공유 AppShell의
 * CommandPaletteHost가 받은 뒤 `studio-command-search-bridge`로 전달한다. 따라서
 * 편집 중에는 정적 전역 팔레트가 아니라 실제 CommandRegistry 색인을 검색하고,
 * Studio 호스트가 아직 준비되지 않았을 때만 기존 전역 팔레트로 폴백한다.
 *
 * 다이얼로그 본체는 lazy 로 가져온다 — 검색을 한 번도 열지 않은 세션이 색인과
 * 다이얼로그 코드를 지불하지 않게 하기 위해서다.
 */

import { LayoutGrid, Search } from "lucide-react";
import { Suspense, lazy, useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  subscribeStudioCommandExecutionFromPalette,
  subscribeStudioCommandSearchFromAppShell,
} from "@/shared/lib/studio-command-search-bridge";
import { getStudioCommandExecutionBindings } from "./studio-command-execution-registry";

import { AiAssistLauncher } from "./ai/assist/AiAssistLauncher";
import { STUDIO_ICON_SIZE, STUDIO_ICON_STROKE, studioChromeIconClass } from "./studio-chrome-ui";
import {
  registerStudioCommandSearchHost, subscribeStudioCommandSearchRequests,
  type StudioCommandSearchRequest,
  type StudioCommandSearchScope,
} from "./studio-help-center-channel";

import type {
  StudioCommandSearchCloseReason,
  StudioCommandSearchDialogProps,
} from "./StudioCommandSearchDialog";
import type { StudioExpandedEcosystemCommand } from "./shortcuts/studio-expanded-ecosystem-commands";
import type { StudioEcosystemLoadedModule } from "./studio-cuttoon-editor/studio-ecosystem-lazy-registry";
import type { ReactNode } from "react";

const StudioCommandSearchDialog = lazy(() =>
  import("./StudioCommandSearchDialog").then((module) => ({
    default: module.StudioCommandSearchDialog,
  })),
);

const LazyStudioExpandedToolsDrawer = lazy(() =>
  import("./studio-cuttoon-editor/StudioExpandedToolsDrawer").then((module) => ({
    default: module.StudioExpandedToolsDrawer,
  })),
);

export type StudioCommandSearchHostProps = Omit<
  StudioCommandSearchDialogProps,
  "open" | "onClose" | "initialScope" | "initialQuery"
> & {
  /** 트리거 버튼을 숨기고 전역 단축키만 남긴다(모바일 등). */
  hideTrigger?: boolean;
  /** Make the owning surface visible before the global search dialog opens. */
  onRequestOpen?: () => void;
  pendingRequest?: StudioCommandSearchRequest | null;
  onRequestHandled?: () => void;
  /** Transfer deferred requests only while this host's subscriptions are installed. */
  onReadyChange?: (ready: boolean) => void;
  /**
   * 트리거와 같은 줄 오른쪽에 붙는 크롬 버튼(예: 인스펙터 접기).
   *
   * 인스펙터는 이 줄 위에 "인스펙터 / 접기" 전용 캡션 행을 따로 갖고 있었다. 캡션은
   * 바로 아래 탭 스트립이 이미 말해 주는 정보라 세로 공간만 먹었으므로, 접기 버튼을
   * 검색 트리거 옆으로 옮기고 행 하나를 캔버스에 돌려준다.
   */
  trailing?: ReactNode;
};

/**
 * 편집 중인 입력 요소 안에서는 F1 을 가로채지 않는다 — 텍스트 편집기 안에서
 * 브라우저 기본 도움말을 막아 버리면 그게 더 나쁜 놀람이다.
 */
function isEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function StudioCommandSearchHost({
  hideTrigger = false,
  onRequestOpen,
  pendingRequest,
  onRequestHandled,
  onReadyChange,
  trailing,
  ...dialogProps
}: StudioCommandSearchHostProps) {
  const [open, setOpen] = useState(false);
  const [expandedToolsOpen, setExpandedToolsOpen] = useState(false);
  const [recentExpandedTool, setRecentExpandedTool] = useState<{
    readonly id: string;
    readonly koreanLabel: string;
  } | null>(null);
  // 어느 진입점이 열었는지에 따라 첫 범위가 다르다 — 인스펙터의 찾기는 '현재 패널',
  // F1·⌘K·메뉴·모바일 도크는 '전체'. 다이얼로그 안에서는 언제든 칩으로 바꿀 수 있다.
  const [scope, setScope] = useState<StudioCommandSearchScope>("all");
  const [initialQuery, setInitialQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const expandedToolsTriggerRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const handleLaunchExpandedTool = useCallback(
    (command: StudioExpandedEcosystemCommand, loadedModule: StudioEcosystemLoadedModule) => {
      if (loadedModule && typeof loadedModule === "object") {
        setRecentExpandedTool({ id: command.id, koreanLabel: command.koreanLabel });
      }
    },
    [],
  );
  const closeExpandedTools = useCallback(() => {
    setExpandedToolsOpen(false);
    const restore = () => {
      expandedToolsTriggerRef.current?.focus({ preventScroll: true });
    };
    if (globalThis.requestAnimationFrame) {
      globalThis.requestAnimationFrame(restore);
    } else {
      restore();
    }
  }, []);
  const close = useCallback((reason: StudioCommandSearchCloseReason = "dismiss") => {
    setOpen(false);
    setInitialQuery("");
    const restoreTarget = restoreFocusRef.current;
    restoreFocusRef.current = null;
    if (reason === "action" || !restoreTarget) return;
    const restore = () => {
      const target = restoreTarget.isConnected ? restoreTarget : triggerRef.current;
      target?.focus({ preventScroll: true });
    };
    if (globalThis.requestAnimationFrame) {
      globalThis.requestAnimationFrame(restore);
    } else {
      restore();
    }
  }, []);
  const openSearch = useCallback((nextScope: StudioCommandSearchScope = "all", nextQuery = "") => {
    if (!open && typeof document !== "undefined") {
      const activeElement = document.activeElement;
      restoreFocusRef.current =
        activeElement instanceof HTMLElement && activeElement !== document.body
          ? activeElement
          : triggerRef.current;
    }
    onRequestOpen?.();
    setScope(nextScope);
    setInitialQuery(nextQuery);
    setOpen(true);
  }, [onRequestOpen, open]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F1") return;
      if (event.defaultPrevented) return;
      if (!open && isEditingTarget(event.target)) return;
      event.preventDefault();
      if (open) close();
      else openSearch();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, open, openSearch]);

  // 메뉴·인스펙터·모바일 도크는 도메인 채널, 전역 ⌘K / Ctrl+K 는 AppShell 브리지를
  // 사용한다. 둘 다 같은 `openSearch`로 수렴해 색인·범위·포커스 복귀 계약이 갈라지지 않는다.
  const openRequest = useEffectEvent((request: StudioCommandSearchRequest) => {
    openSearch(request.scope ?? "all", request.query ?? "");
  });
  const inspectPaletteCommand = useEffectEvent(
    (request: { readonly commandId: string; readonly toolId?: string }) => {
      const bindings = getStudioCommandExecutionBindings();
      const binding = bindings.get(request.commandId);
      if (binding) {
        if (!binding.disabled) {
          return { status: "executable" as const, label: binding.label };
        }
        if (request.toolId === "tool-alpha-lock" && dialogProps.onNavigateInspector) {
          return { status: "executable" as const, label: "레이어 패널 (알파 잠금)" };
        }
        return {
          status: "disabled" as const,
          reason: binding.unavailableReason ?? "현재 편집 상태에서는 이 기능을 사용할 수 없습니다.",
        };
      }
      if (request.commandId === "tool.liquify") {
        if (dialogProps.onNavigateInspector) {
          return { status: "executable" as const, label: "액화 / 유동화 (선택·보정)" };
        }
        const fallbackWarp = bindings.get("filter.pinch-bloat");
        if (fallbackWarp && !fallbackWarp.disabled) {
          return { status: "executable" as const, label: fallbackWarp.label };
        }
      }
      if (request.commandId === "layer.mask" && dialogProps.onNavigateInspector) {
        return { status: "executable" as const, label: "레이어 패널 (알파 잠금)" };
      }
      return { status: "unbound" as const };
    },
  );
  const executePaletteCommand = useEffectEvent(
    (request: { readonly commandId: string; readonly toolId?: string }) => {
      const bindings = getStudioCommandExecutionBindings();
      const binding = bindings.get(request.commandId);
      if (binding && !binding.disabled) {
        binding.execute();
        return true;
      }
      if (request.commandId === "tool.liquify") {
        if (dialogProps.onNavigateInspector) {
          window.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
          dialogProps.onNavigateInspector({ primary: "properties", image: "retouch" });
          return true;
        }
        const fallbackWarp = bindings.get("filter.pinch-bloat");
        if (fallbackWarp && !fallbackWarp.disabled) {
          fallbackWarp.execute();
          return true;
        }
      }
      if (
        (request.commandId === "layer.mask" || request.toolId === "tool-alpha-lock")
        && dialogProps.onNavigateInspector
      ) {
        dialogProps.onNavigateInspector({ primary: "layers" });
        return true;
      }
      return false;
    },
  );
  useEffect(() => {
    const unsubscribeStudio = subscribeStudioCommandSearchRequests(openRequest);
    const unsubscribeAppShell = subscribeStudioCommandSearchFromAppShell(openRequest);
    const unsubscribePaletteExec = subscribeStudioCommandExecutionFromPalette({
      inspect: inspectPaletteCommand,
      execute: executePaletteCommand,
    });
    const unregisterReady = registerStudioCommandSearchHost();
    return () => {
      unsubscribeStudio();
      unsubscribeAppShell();
      unsubscribePaletteExec();
      unregisterReady();
    };
  }, []);

  useEffect(() => {
    onReadyChange?.(true);
    return () => onReadyChange?.(false);
  }, [onReadyChange]);

  useEffect(() => {
    if (!pendingRequest) return;
    openSearch(pendingRequest.scope ?? "all", pendingRequest.query ?? "");
    onRequestHandled?.();
  }, [pendingRequest, onRequestHandled, openSearch]);

  return (
    <>
      {/* 모바일은 검색 트리거를 숨기지만 AI 보조 입구는 남긴다. 입구는 키가 없어도 늘 보이고(ToonStudio AI), 지연 로드되는 동안에는 빈 줄(empty:hidden)이 보이지 않는다. */}
      {hideTrigger && !trailing ? (
        <div className="flex min-w-0 items-center justify-end border-b border-line px-1 empty:hidden" data-ai-assist-mobile-row="true">
          <AiAssistLauncher />
        </div>
      ) : (
        
        <div
          data-studio-command-search-row="true"
          className="flex min-w-0 flex-wrap items-center gap-1 border-b border-line pb-1"
        >
          {hideTrigger ? null : (
            <button
              ref={triggerRef}
              type="button"
              onClick={() => openSearch("all")}
              data-testid="studio-command-search-trigger"
              data-inspector-priority="chrome"
              title="기능·설정 찾기 (⌘K / Ctrl+K / F1)"
              className="flex min-h-11 min-w-[12rem] flex-1 items-center gap-2 overflow-hidden rounded-lg px-2.5 text-left text-xs text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Search
                size={STUDIO_ICON_SIZE.contextMenu}
                strokeWidth={STUDIO_ICON_STROKE}
                aria-hidden
                className={studioChromeIconClass({ tone: "default" })}
              />
              <span className="min-w-0 flex-1 truncate">
                기능·설정 찾기 · 다른 앱 용어도 검색
              </span>
              <span
                className="flex shrink-0 items-center gap-1"
                aria-label="단축키 Command K, Control K 또는 F1"
              >
                <kbd className="rounded border border-line bg-card px-1.5 py-px text-xs">
                  ⌘K
                </kbd>
                <kbd className="rounded border border-line bg-card px-1.5 py-px text-xs">
                  F1
                </kbd>
              </span>
            </button>
          )}
          {hideTrigger ? null : (
            <button
              ref={expandedToolsTriggerRef}
              type="button"
              onClick={() => {
                onRequestOpen?.();
                setExpandedToolsOpen(true);
              }}
              data-testid="studio-expanded-tools-launcher"
              data-recent-expanded-tool={recentExpandedTool?.id ?? ""}
              data-inspector-priority="chrome"
              aria-label="확장 전문 도구 서랍 열기"
              aria-expanded={expandedToolsOpen}
              title={
                recentExpandedTool
                  ? `확장 전문 도구 서랍 (최근 실행: ${recentExpandedTool.koreanLabel})`
                  : "확장 전문 도구 서랍 (6대 분류)"
              }
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <LayoutGrid
                size={STUDIO_ICON_SIZE.contextMenu}
                strokeWidth={STUDIO_ICON_STROKE}
                aria-hidden
                className={studioChromeIconClass({ tone: "default" })}
              />
              <span className="hidden sm:inline">확장 도구</span>
            </button>
          )}
          <AiAssistLauncher />
          {trailing}
        </div>
      )}
      {open ? (
        <Suspense fallback={null}>
          <StudioCommandSearchDialog
            {...dialogProps}
            open
            initialScope={scope}
            initialQuery={initialQuery}
            onClose={close}
          />
        </Suspense>
      ) : null}
      {expandedToolsOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              data-testid="studio-expanded-tools-backdrop"
              className="fixed inset-0 z-50 flex justify-end"
            >
              <button
                type="button"
                aria-label="확장 전문 도구 배경 닫기"
                onClick={closeExpandedTools}
                className="absolute inset-0 bg-canvas/60"
              />
              <Suspense fallback={null}>
                <LazyStudioExpandedToolsDrawer
                  open
                  onClose={closeExpandedTools}
                  onLaunchTool={handleLaunchExpandedTool}
                  className="relative z-10"
                />
              </Suspense>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}