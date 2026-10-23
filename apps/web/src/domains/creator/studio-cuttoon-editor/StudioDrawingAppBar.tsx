import {
  Brush,
  CheckCircle2,
  CloudUpload,
  Command,
  HelpCircle,
  Layers3,
  Maximize2,
  PanelLeft,
  PanelRight,
  Palette,
  Redo2,
  ShieldAlert,
  Undo2,
} from "lucide-react";

import Link from "@/shared/navigation/router-link";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { ToonStudioWordmark } from "@/shared/components/toonstudio-brand";
import { ToonStudioMark } from "@/shared/components/toonstudio-mark";
import { cn } from "@/shared/lib/utils";
import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioCuttoonEditorViewSession } from "./StudioCuttoonEditorViewSession";

const QUICK_STROKE_WIDTHS = [2, 5, 12, 28, 64] as const;
const QUICK_OPACITIES = [1, 0.75, 0.5, 0.25] as const;
const QUICK_STABILIZER_LEVELS = [0, 3, 7, 12, 15] as const;

function percent(value: unknown): string {
  const number = typeof value === "number" && Number.isFinite(value) ? value : 1;
  return `${Math.round(number * 100)}%`;
}

function nextInCycle<T extends number>(list: readonly T[], current: number): T {
  const idx = list.findIndex((item) => Math.abs(item - current) < 0.01);
  if (idx < 0) return list[0];
  return list[(idx + 1) % list.length];
}

/**
 * Compact application chrome for the drawing-focused presentation.
 *
 * This intentionally calls the exact same Studio session handlers used by the embedded editor.
 * It is a projection of the shared runtime, not a second drawing implementation.
 */
export function StudioDrawingAppBar({ session }: { readonly session: StudioCuttoonEditorViewSession }) {
  const s = session;
  const brushName = s.activeCatalogBrush?.name ?? s.brush ?? "Brush";
  const currentWidth = Math.round(Number(s.strokeWidth) || 0);
  const currentOpacity = typeof s.brushOpacity === "number" && Number.isFinite(s.brushOpacity) ? s.brushOpacity : 1;
  const stabilizer = typeof s.stabilizer === "number" ? s.stabilizer : 0;
  const tx = (source: string) => translateCurrentStaticSourceText("StudioDrawingAppBar", "ko", source);

  const isSyncBusy = Boolean(s.saving || s.collaborationOperationSyncPending);
  const hasSyncError = Boolean(s.serverRevisionError);
  const isOfflineProtected = Boolean(s.offlineSceneNotice);

  const syncLabel = hasSyncError
    ? tx("동기화 확인 필요")
    : isOfflineProtected
      ? tx("오프라인 보호 중")
      : isSyncBusy
        ? tx("실시간 저장 중…")
        : tx("실시간 동기화됨");

  return (
    <header
      data-studio-drawing-app-bar="true"
      className="flex min-h-12 shrink-0 items-center gap-2 border-b border-line bg-panel/95 px-2.5 shadow-sm backdrop-blur-xl sm:px-3"
    >
      <div className="flex min-w-0 items-center gap-2 pr-1">
        <ToonStudioMark className="size-8 rounded-xl shadow-sm" />
        <div className="hidden min-w-0 sm:block">
          <strong className="block truncate text-xs font-black tracking-[-0.02em] text-fg"><ToonStudioWordmark /> Draw</strong>
          <span className="block max-w-48 truncate text-[0.65rem] text-fg-3">{s.name || "Untitled"}</span>
        </div>
      </div>

      <div className="hidden min-w-0 flex-1 items-center gap-1.5 md:flex" aria-label={tx("현재 드로잉 설정")}>
        <button
          type="button"
          className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-line bg-card px-2.5 min-h-9 py-1.5 text-[0.68rem] font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label={`${tx("브러시 라이브러리 열기, 현재")} ${brushName}`}
          title={tx("브러시 라이브러리")}
          onClick={(event) => {
            if (s.isMobile) {
              s.setMobileSheet?.("draw");
              return;
            }
            s.studioBrushCatalogHandlers?.toggle?.("desktop-dock", event.currentTarget);
          }}
        >
          <Brush size={13} aria-hidden="true" />
          <span className="max-w-32 truncate">{brushName}</span>
        </button>
        <button
          type="button"
          data-testid="drawing-appbar-size-cycle"
          className="rounded-full border border-line bg-card px-2.5 py-1 text-[0.68rem] font-semibold tabular-nums text-fg-2 transition-colors hover:border-line-strong hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label={`${tx("브러시 크기 빠른 전환, 현재")} ${currentWidth} px`}
          title={tx("클릭하여 자주 쓰는 브러시 크기(2·5·12·28·64px) 전환 · 단축키 [ / ]")}
          onClick={() => s.setStrokeWidth?.(nextInCycle(QUICK_STROKE_WIDTHS, currentWidth))}
        >
          {currentWidth} px
        </button>
        <button
          type="button"
          data-testid="drawing-appbar-opacity-cycle"
          className="rounded-full border border-line bg-card px-2.5 py-1 text-[0.68rem] font-semibold tabular-nums text-fg-2 transition-colors hover:border-line-strong hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label={`${tx("브러시 불투명도 빠른 전환, 현재")} ${percent(currentOpacity)}`}
          title={tx("클릭하여 불투명도(100%·75%·50%·25%) 빠른 전환")}
          onClick={() => s.setBrushOpacity?.(nextInCycle(QUICK_OPACITIES, currentOpacity))}
        >
          {percent(currentOpacity)}
        </button>
        <button
          type="button"
          data-testid="drawing-appbar-stabilizer-cycle"
          className="rounded-full border border-line bg-card px-2.5 py-1 text-[0.68rem] font-semibold tabular-nums text-fg-2 transition-colors hover:border-line-strong hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label={`${tx("손떨림 보정 강도 빠른 전환, 현재")} Stabilizer ${stabilizer}`}
          title={tx("클릭하여 손떨림 보정 단계(0·3·7·12·15) 빠른 전환")}
          onClick={() => s.setStabilizer?.(nextInCycle(QUICK_STABILIZER_LEVELS, stabilizer))}
        >
          Stabilizer {stabilizer}
        </button>
        <span
          className="size-6 rounded-full border-2 border-card shadow ring-1 ring-line"
          style={{ backgroundColor: typeof s.color === "string" ? s.color : "#000000" }}
          aria-label={`${tx("현재 색상")} ${String(s.color ?? "")}`}
        />
        <button
          type="button"
          data-testid="drawing-appbar-sync-status"
          aria-live="polite"
          aria-label={`${tx("원고 동기화 상태")}: ${syncLabel}`}
          title={tx("클릭하여 즉시 원고 저장·서버 동기화 플러시")}
          onClick={() => s.requestSaveFlush?.()}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.65rem] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            hasSyncError
              ? "border-warn/45 bg-warn/10 text-warn"
              : isOfflineProtected
                ? "border-cool/45 bg-cool/10 text-cool"
                : isSyncBusy
                  ? "border-accent/45 bg-accent/10 text-accent"
                  : "border-good/35 bg-good/10 text-good",
          )}
        >
          {hasSyncError || isOfflineProtected ? (
            <ShieldAlert size={12} aria-hidden="true" />
          ) : isSyncBusy ? (
            <CloudUpload size={12} aria-hidden="true" />
          ) : (
            <CheckCircle2 size={12} aria-hidden="true" />
          )}
          <span>{syncLabel}</span>
        </button>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1" aria-label={tx("드로잉 빠른 도구")}>
        <button
          type="button"
          className={buttonClass({ variant: "quiet", size: "icon" })}
          disabled={Boolean(s.menuEditUndoDisabled)}
          aria-label={tx("실행 취소")}
          title={`${tx("실행 취소")} · Ctrl/⌘ Z`}
          onClick={() => s.undo?.()}
        >
          <Undo2 size={17} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={buttonClass({ variant: "quiet", size: "icon" })}
          disabled={Boolean(s.menuEditRedoDisabled)}
          aria-label={tx("다시 실행")}
          title={`${tx("다시 실행")} · Ctrl/⌘ Shift Z`}
          onClick={() => s.redo?.()}
        >
          <Redo2 size={17} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={cn(buttonClass({ variant: s.colorWheelOpen ? "solid" : "quiet", size: "icon" }))}
          aria-pressed={Boolean(s.colorWheelOpen)}
          aria-label={tx("컬러 휠")}
          title={tx("컬러 휠")}
          onClick={() => s.setColorWheelOpen?.((value: boolean) => !value)}
        >
          <Palette size={17} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={cn(buttonClass({ variant: s.quickAccessPaletteOpen ? "solid" : "quiet", size: "icon" }))}
          aria-pressed={Boolean(s.quickAccessPaletteOpen)}
          aria-label={tx("퀵 액세스")}
          title={`${tx("퀵 액세스")} · ${tx("자주 쓰는 명령")}`}
          onClick={() => s.setQuickAccessPaletteOpen?.((value: boolean) => !value)}
        >
          <Command size={17} aria-hidden="true" />
        </button>
        <button
          type="button"
          data-testid="drawing-appbar-help-button"
          className={cn(buttonClass({ variant: s.shortcutsOpen ? "solid" : "quiet", size: "icon" }))}
          aria-pressed={Boolean(s.shortcutsOpen)}
          aria-label={tx("단축키 및 입문 가이드")}
          title={`${tx("단축키 및 클립스튜디오·프로크리에이트 이주 가이드")} · ?`}
          onClick={() => s.setShortcutsOpen?.((value: boolean) => !value)}
        >
          <HelpCircle size={17} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={cn(buttonClass({ variant: s.visibleLeftPanelOpen ? "solid" : "quiet", size: "icon" }), "hidden sm:inline-flex")}
          aria-pressed={Boolean(s.visibleLeftPanelOpen)}
          aria-label={tx("페이지 패널")}
          title={tx("페이지 패널")}
          onClick={() => s.setLeftPanelOpenWithOverride?.(!s.visibleLeftPanelOpen)}
        >
          <PanelLeft size={17} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={cn(buttonClass({ variant: s.visibleRightPanelOpen ? "solid" : "quiet", size: "icon" }), "hidden sm:inline-flex")}
          aria-pressed={Boolean(s.visibleRightPanelOpen)}
          aria-label={tx("레이어·속성 패널")}
          title={tx("레이어·속성 패널")}
          onClick={() => s.setRightPanelOpenWithOverride?.(!s.visibleRightPanelOpen)}
        >
          <Layers3 size={17} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={buttonClass({ variant: s.canvasOnlyMode ? "solid" : "quiet", size: "icon" })}
          aria-pressed={Boolean(s.canvasOnlyMode)}
          aria-label={tx("캔버스만 보기")}
          title={`${tx("캔버스만 보기")} · ${tx("4손가락 탭")}`}
          onClick={() => s.setCanvasOnlyMode?.((value: boolean) => !value)}
        >
          <Maximize2 size={17} aria-hidden="true" />
        </button>
        <Link
          href="/studio?drawingShell=integrated"
          className={cn(buttonClass({ variant: "outline", size: "sm" }), "ml-1 hidden min-h-9 gap-1.5 px-2.5 text-[0.7rem] font-bold lg:inline-flex")}
        >
          <PanelRight size={15} aria-hidden="true" />
          {tx("전체 스튜디오")}
        </Link>
      </div>
    </header>
  );
}
